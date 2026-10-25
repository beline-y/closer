-- Question of the day: one per patient per local day, picked from question_bank.
-- Answers are locked: you read the others only after answering yourself (patient and
-- circle). The patient's answer is private by default; only if he shares it does a masked
-- copy reach the care team's review queue. No care team or volunteer access to answers.

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  local_date date not null,
  question_id uuid not null references public.question_bank (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (patient_id, local_date)
);

create table public.question_answers (
  id uuid primary key default gen_random_uuid(),
  daily_question_id uuid not null references public.daily_questions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 500),
  -- Patient only: "Volunteers can read it (without my name)". Off by default.
  share_with_volunteers boolean not null default false,
  created_at timestamptz not null default now(),
  unique (daily_question_id, user_id)
);

create function private.daily_question_patient(p_daily_question_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select patient_id from public.daily_questions where id = p_daily_question_id;
$$;

create function private.has_answered(p_daily_question_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.question_answers a where a.daily_question_id = p_daily_question_id and a.user_id = (select auth.uid()));
$$;

revoke all on function private.daily_question_patient(uuid), private.has_answered(uuid) from public, anon;
grant execute on function private.daily_question_patient(uuid), private.has_answered(uuid) to authenticated;

-- Today's question for the patient (created on first visit, from curated questions not
-- used as a daily question for this patient before). Patient and circle only.
create function public.todays_question(p_patient_id uuid)
returns table (id uuid, text text, local_date date, answered_by uuid[])
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_today date;
  v_id uuid;
begin
  if not (private.is_patient_self(p_patient_id) or private.is_circle(p_patient_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  v_today := private.patient_today(p_patient_id);
  select d.id into v_id from public.daily_questions d where d.patient_id = p_patient_id and d.local_date = v_today;
  if v_id is null then
    insert into public.daily_questions (patient_id, local_date, question_id)
    select p_patient_id, v_today, b.id
    from public.question_bank b
    where b.source = 'curated'
      and not exists (select 1 from public.daily_questions d where d.patient_id = p_patient_id and d.question_id = b.id)
    order by random()
    limit 1
    on conflict (patient_id, local_date) do nothing
    returning daily_questions.id into v_id;
    if v_id is null then
      select d.id into v_id from public.daily_questions d where d.patient_id = p_patient_id and d.local_date = v_today;
    end if;
  end if;
  -- Who answered (never what): enough for "Dad answered! Answer to see it".
  return query
    select d.id, b.text, d.local_date, coalesce(array_agg(a.user_id) filter (where a.user_id is not null), '{}')
    from public.daily_questions d
    join public.question_bank b on b.id = d.question_id
    left join public.question_answers a on a.daily_question_id = d.id
    where d.id = v_id
    group by d.id, b.text, d.local_date;
end;
$$;

-- Care team review queue: only answers the patient chose to share, names masked.
create function public.answers_to_review()
returns table (answer_id uuid, patient_id uuid, question text, masked text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select a.id, d.patient_id, b.text,
         (select coalesce(
            (select regexp_replace(a.body, '\m(' || string_agg(regexp_replace(n, '([.*+?^${}()|\[\]\\])', '\\\1', 'g'), '|') || ')\M', '[name]', 'gi')
             from (
               select p.nickname as n from public.patients p where p.id = d.patient_id
               union select pr.display_name from public.patient_links l join public.profiles pr on pr.id = l.user_id
                     where l.patient_id = d.patient_id and l.status = 'active'
             ) names where length(n) > 1),
            a.body)),
         a.created_at
  from public.question_answers a
  join public.daily_questions d on d.id = a.daily_question_id
  join public.question_bank b on b.id = d.question_id
  join public.patients p on p.id = d.patient_id
  where a.share_with_volunteers and a.user_id = p.user_id and private.is_care_team(d.patient_id)
  order by a.created_at desc;
$$;

revoke all on function public.todays_question(uuid), public.answers_to_review() from public, anon;
grant execute on function public.todays_question(uuid), public.answers_to_review() to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.daily_questions, public.question_answers from anon, authenticated;
grant select on public.daily_questions, public.question_answers to authenticated;
grant insert (daily_question_id, user_id, body, share_with_volunteers) on public.question_answers to authenticated;
grant update (body, share_with_volunteers) on public.question_answers to authenticated;

alter table public.daily_questions enable row level security;
alter table public.question_answers enable row level security;

create policy "daily_questions: patient and circle read"
  on public.daily_questions for select to authenticated
  using (private.is_patient_or_circle(patient_id));

create policy "question_answers: read own"
  on public.question_answers for select to authenticated
  using (user_id = (select auth.uid()));

-- The lock: the others' answers only once you've answered yourself.
create policy "question_answers: read others after answering"
  on public.question_answers for select to authenticated
  using (
    private.is_patient_or_circle(private.daily_question_patient(daily_question_id))
    and private.has_answered(daily_question_id)
  );

-- Answer today's question of your patient (or your own, as the patient).
create policy "question_answers: answer today"
  on public.question_answers for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and private.is_patient_or_circle(private.daily_question_patient(daily_question_id))
    and exists (
      select 1 from public.daily_questions d
      where d.id = daily_question_id and d.local_date = private.patient_today(d.patient_id)
    )
    -- Sharing with volunteers is the patient's choice only.
    and (not share_with_volunteers or private.is_patient_self(private.daily_question_patient(daily_question_id)))
  );

create policy "question_answers: edit own today"
  on public.question_answers for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (not share_with_volunteers or private.is_patient_self(private.daily_question_patient(daily_question_id)))
  );

-- Live reveal: when the other side answers, your screen unlocks (same RLS).
alter publication supabase_realtime add table public.question_answers;
