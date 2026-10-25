-- Engagement for the care team, as counts only: how many minutes the child spent in the
-- app and how many times family and friends were in touch, per local day. One function
-- (care_engagement) feeds the patients table, the charts and the AI input, so they can't
-- disagree. Never content: no message, name, card or answer leaves this function.
-- Plus the last AI summary per child, shown when the AI service is unreachable.

-- ---------------------------------------------------------------------------
-- Minutes in app: the patient's app pings once a minute while it's on screen.
-- ---------------------------------------------------------------------------
create table public.app_minutes (
  patient_id uuid not null references public.patients (id) on delete cascade,
  local_date date not null,
  minutes integer not null default 0 check (minutes between 0 and 1440),
  last_seen_at timestamptz not null default now(),
  primary key (patient_id, local_date)
);

-- Counts at most one minute per 50 seconds, whatever the number of open tabs.
create function public.log_app_minute()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_patient uuid;
begin
  select p.id into v_patient from public.patients p where p.user_id = (select auth.uid());
  if v_patient is null then
    return;
  end if;
  insert into public.app_minutes as m (patient_id, local_date, minutes, last_seen_at)
  values (v_patient, private.patient_today(v_patient), 1, now())
  on conflict (patient_id, local_date) do update
    set minutes = least(1440, m.minutes + 1), last_seen_at = now()
    where m.last_seen_at < now() - interval '50 seconds';
end;
$$;

-- ---------------------------------------------------------------------------
-- Family contacts per day: actions by an active family member or friend (nudge reply,
-- reaction, comment, card written, question answered, challenge done) plus a check-in
-- where the child ticked "Had a visit". Care team of the child only.
-- ---------------------------------------------------------------------------
create function public.care_engagement(p_patient_id uuid, p_days integer)
returns table (local_date date, family_contacts integer, minutes_in_app integer)
language plpgsql stable security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tz text;
  v_today date;
begin
  if not private.is_care_team(p_patient_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select coalesce(p.timezone, 'America/New_York') into v_tz from public.patients p where p.id = p_patient_id;
  v_today := private.patient_today(p_patient_id);
  return query
    with circle as (
      select l.user_id from public.patient_links l
      where l.patient_id = p_patient_id and l.role in ('family', 'friend') and l.status = 'active'
    ),
    events as (
      select r.replied_at as at from public.nudge_recipients r join public.nudges n on n.id = r.nudge_id
        where n.patient_id = p_patient_id and r.replied_at is not null and r.user_id in (select user_id from circle)
      union all
      select cr.created_at from public.checkin_reactions cr join public.mood_checkins c on c.id = cr.checkin_id
        where c.patient_id = p_patient_id and cr.user_id in (select user_id from circle)
      union all
      select ar.created_at from public.activity_reactions ar join public.activity_sessions s on s.id = ar.session_id
        where s.patient_id = p_patient_id and ar.user_id in (select user_id from circle)
      union all
      select ac.created_at from public.activity_comments ac join public.activity_sessions s on s.id = ac.session_id
        where s.patient_id = p_patient_id and ac.user_id in (select user_id from circle)
      union all
      select ce.completed_at from public.challenge_entries ce join public.activity_sessions s on s.id = ce.session_id
        where s.patient_id = p_patient_id and ce.completed_at is not null and ce.user_id in (select user_id from circle)
      union all
      select cc.created_at from public.comfort_cards cc
        where cc.patient_id = p_patient_id and cc.author_id in (select user_id from circle)
      union all
      select qa.created_at from public.question_answers qa join public.daily_questions d on d.id = qa.daily_question_id
        where d.patient_id = p_patient_id and qa.user_id in (select user_id from circle)
    ),
    per_day as (
      select (e.at at time zone v_tz)::date as day, count(*)::integer as n from events e group by 1
    ),
    visits as (
      select c.local_date as day from public.mood_checkins c
      where c.patient_id = p_patient_id and 'visit' = any (c.activities)
    ),
    days as (
      select (v_today - g)::date as day from generate_series(0, least(greatest(p_days, 1), 60) - 1) as g
    )
    select d.day,
           coalesce(pd.n, 0) + (case when exists (select 1 from visits v where v.day = d.day) then 1 else 0 end),
           coalesce(m.minutes, 0)
    from days d
    left join per_day pd on pd.day = d.day
    left join public.app_minutes m on m.patient_id = p_patient_id and m.local_date = d.day
    order by d.day;
end;
$$;

revoke all on function public.log_app_minute(), public.care_engagement(uuid, integer) from public, anon;
grant execute on function public.log_app_minute(), public.care_engagement(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Last AI summary per child: the overview line and the full report, as the AI service
-- returned them. Care team of the child only.
-- ---------------------------------------------------------------------------
create table public.ai_summaries (
  patient_id uuid not null references public.patients (id) on delete cascade,
  kind text not null check (kind in ('overview', 'report')),
  payload jsonb not null,
  stored_at timestamptz not null default now(),
  primary key (patient_id, kind)
);

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.app_minutes, public.ai_summaries from anon, authenticated;
grant select on public.app_minutes to authenticated;
grant select, insert, update (patient_id, kind, payload, stored_at) on public.ai_summaries to authenticated;

alter table public.app_minutes enable row level security;
alter table public.ai_summaries enable row level security;

-- Writes go through log_app_minute(); the child can read their own minutes.
create policy "app_minutes: patient reads own"
  on public.app_minutes for select to authenticated
  using (private.is_patient_self(patient_id));

create policy "ai_summaries: care team reads"
  on public.ai_summaries for select to authenticated
  using (private.is_care_team(patient_id));

create policy "ai_summaries: care team writes"
  on public.ai_summaries for insert to authenticated
  with check (private.is_care_team(patient_id));

create policy "ai_summaries: care team updates"
  on public.ai_summaries for update to authenticated
  using (private.is_care_team(patient_id))
  with check (private.is_care_team(patient_id));
