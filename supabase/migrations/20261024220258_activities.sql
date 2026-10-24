-- Activities the patient does in the app (draw, make and snap, quiz, story, challenge with
-- family). Results stay private unless the patient shares them with family or adds them to
-- Memories. The care team only gets completion counts; volunteers get nothing.

create type public.activity_type as enum ('draw', 'make_snap', 'quiz', 'story', 'challenge');
create type public.activity_visibility as enum ('private', 'family');
create type public.activity_status as enum ('started', 'waiting_partner', 'completed');

-- ---------------------------------------------------------------------------
-- Library
-- ---------------------------------------------------------------------------
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  type public.activity_type not null,
  title text not null check (char_length(title) between 1 and 80),
  emoji text not null default '✨',
  instructions text check (char_length(instructions) <= 600),
  theme text check (char_length(theme) <= 120),
  steps text[] not null default '{}',
  -- quiz: [{"q": "...", "options": ["a","b","c","d"], "answer": 0, "fact": "..."}]
  quiz jsonb,
  minutes smallint not null default 10 check (minutes between 1 and 120),
  created_at timestamptz not null default now(),
  check (type <> 'quiz' or jsonb_typeof(quiz) = 'array')
);

-- ---------------------------------------------------------------------------
-- Sessions (the patient's results) and the family side of a challenge
-- ---------------------------------------------------------------------------
create table public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  activity_id uuid not null references public.activities (id) on delete cascade,
  status public.activity_status not null default 'started',
  result_path text check (result_path is null or private.path_patient_id(result_path) = patient_id),
  result_text text check (char_length(result_text) <= 4000),
  score smallint check (score >= 0),
  score_total smallint check (score_total > 0),
  visibility public.activity_visibility not null default 'private',
  in_memories boolean not null default false,
  partner_id uuid references public.profiles (id) on delete set null,
  local_date date not null default current_date,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index activity_sessions_patient_idx on public.activity_sessions (patient_id, local_date desc);

-- Same rule as check-ins: the database sets the patient's day.
create trigger activity_sessions_local_date before insert on public.activity_sessions
  for each row execute function private.set_checkin_local_date();

create table public.challenge_entries (
  session_id uuid primary key references public.activity_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  result_path text,
  result_text text check (char_length(result_text) <= 4000),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_reactions (
  session_id uuid not null references public.activity_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '🤗', '💪', '😂')),
  created_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.activity_comments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.activity_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 200),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create function private.session_patient(p_session_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select patient_id from public.activity_sessions where id = p_session_id;
$$;

-- Shared with the circle: shared or in Memories, and finished (a challenge is finished
-- only when both sides are done, so nobody sees the other drawing early).
create function private.is_session_shared(p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activity_sessions s
    where s.id = p_session_id and s.status = 'completed' and (s.visibility = 'family' or s.in_memories)
  );
$$;

-- The family member a challenge waits for.
create function private.is_waiting_partner(p_session_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.activity_sessions s
    where s.id = p_session_id and s.status = 'waiting_partner' and s.partner_id = (select auth.uid())
      and private.is_circle(s.patient_id)
  );
$$;

-- n-th folder of a storage path as a uuid, or null.
create function private.path_part_uuid(p_name text, p_part int)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', p_part)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function private.session_patient(uuid), private.is_session_shared(uuid), private.is_waiting_partner(uuid), private.path_part_uuid(text, int) from public, anon;
grant execute on function private.session_patient(uuid), private.is_session_shared(uuid), private.is_waiting_partner(uuid), private.path_part_uuid(text, int) to authenticated;

-- The partner finishing their side completes the challenge for both.
create function private.complete_challenge()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.completed_at is not null then
    update public.activity_sessions
      set status = 'completed', completed_at = coalesce(completed_at, new.completed_at)
      where id = new.session_id and status = 'waiting_partner';
  end if;
  return new;
end;
$$;

revoke all on function private.complete_challenge() from public, anon, authenticated;

create trigger challenge_entries_complete after insert or update of completed_at on public.challenge_entries
  for each row execute function private.complete_challenge();

-- Challenges waiting for the signed-in family member (title only, never the patient's result).
create function public.my_pending_challenges()
returns table (session_id uuid, patient_id uuid, activity_id uuid, title text, emoji text, theme text, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select s.id, s.patient_id, a.id, a.title, a.emoji, a.theme, s.created_at
  from public.activity_sessions s
  join public.activities a on a.id = s.activity_id
  where s.status = 'waiting_partner' and s.partner_id = (select auth.uid()) and private.is_circle(s.patient_id)
  order by s.created_at desc;
$$;

-- Care team (and the patient): how many activities were completed per day. No content.
create function public.activity_counts(p_patient_id uuid, p_days int default 14)
returns table (local_date date, completed int)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not (private.is_care_team(p_patient_id) or private.is_patient_self(p_patient_id)) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select s.local_date, count(*)::int
    from public.activity_sessions s
    where s.patient_id = p_patient_id and s.status = 'completed'
      and s.local_date > private.patient_today(p_patient_id) - least(greatest(p_days, 1), 90)
    group by s.local_date
    order by s.local_date;
end;
$$;

revoke all on function public.my_pending_challenges(), public.activity_counts(uuid, int) from public, anon;
grant execute on function public.my_pending_challenges(), public.activity_counts(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.activities, public.activity_sessions, public.challenge_entries, public.activity_reactions, public.activity_comments from anon, authenticated;
grant select on public.activities to authenticated;
grant select on public.activity_sessions to authenticated;
grant insert (patient_id, activity_id, status, result_path, result_text, score, score_total, visibility, in_memories, partner_id, completed_at)
  on public.activity_sessions to authenticated;
grant update (status, result_path, result_text, score, score_total, visibility, in_memories, partner_id, completed_at)
  on public.activity_sessions to authenticated;
grant delete on public.activity_sessions to authenticated;
grant select, insert on public.challenge_entries to authenticated;
grant update (result_path, result_text, completed_at) on public.challenge_entries to authenticated;
grant select, insert, delete on public.activity_reactions to authenticated;
grant update (emoji) on public.activity_reactions to authenticated;
grant select, insert, delete on public.activity_comments to authenticated;

alter table public.activities enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.challenge_entries enable row level security;
alter table public.activity_reactions enable row level security;
alter table public.activity_comments enable row level security;

-- Library: anyone signed in except volunteers (they have no patient-facing tools).
create policy "activities: read"
  on public.activities for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type <> 'volunteer'));

-- Sessions: the patient owns them; the circle reads shared, finished ones. No care team.
create policy "activity_sessions: patient reads own"
  on public.activity_sessions for select to authenticated
  using (private.is_patient_self(patient_id));

create policy "activity_sessions: circle reads shared"
  on public.activity_sessions for select to authenticated
  using (private.is_circle(patient_id) and status = 'completed' and (visibility = 'family' or in_memories));

create policy "activity_sessions: patient starts"
  on public.activity_sessions for insert to authenticated
  with check (
    private.is_patient_self(patient_id)
    and (partner_id is null or exists (
      select 1 from public.patient_links l
      where l.patient_id = activity_sessions.patient_id and l.user_id = partner_id
        and l.status = 'active' and l.role in ('family', 'friend')
    ))
  );

create policy "activity_sessions: patient updates own"
  on public.activity_sessions for update to authenticated
  using (private.is_patient_self(patient_id))
  with check (private.is_patient_self(patient_id));

create policy "activity_sessions: patient deletes own"
  on public.activity_sessions for delete to authenticated
  using (private.is_patient_self(patient_id));

-- Challenge entries: the partner writes theirs; both see each other only once both are done.
create policy "challenge_entries: partner reads own"
  on public.challenge_entries for select to authenticated
  using (user_id = (select auth.uid()));

create policy "challenge_entries: revealed to patient and circle"
  on public.challenge_entries for select to authenticated
  using (
    completed_at is not null
    and (private.is_patient_self(private.session_patient(session_id)) or private.is_circle(private.session_patient(session_id)))
    and exists (select 1 from public.activity_sessions s where s.id = session_id and s.status = 'completed')
  );

create policy "challenge_entries: partner adds"
  on public.challenge_entries for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_waiting_partner(session_id));

create policy "challenge_entries: partner finishes"
  on public.challenge_entries for update to authenticated
  using (user_id = (select auth.uid()) and private.is_waiting_partner(session_id))
  with check (user_id = (select auth.uid()));

-- Reactions and comments on shared results: the circle reacts; patient and circle comment.
create policy "activity_reactions: read shared"
  on public.activity_reactions for select to authenticated
  using (
    private.is_session_shared(session_id)
    and (private.is_patient_self(private.session_patient(session_id)) or private.is_circle(private.session_patient(session_id)))
  );

create policy "activity_reactions: circle reacts"
  on public.activity_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and private.is_session_shared(session_id) and private.is_circle(private.session_patient(session_id)));

create policy "activity_reactions: change own"
  on public.activity_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and private.is_circle(private.session_patient(session_id)));

create policy "activity_reactions: remove own"
  on public.activity_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_comments: read shared"
  on public.activity_comments for select to authenticated
  using (
    private.is_session_shared(session_id)
    and (private.is_patient_self(private.session_patient(session_id)) or private.is_circle(private.session_patient(session_id)))
  );

create policy "activity_comments: patient and circle comment"
  on public.activity_comments for insert to authenticated
  with check (
    user_id = (select auth.uid()) and private.is_session_shared(session_id)
    and (private.is_patient_self(private.session_patient(session_id)) or private.is_circle(private.session_patient(session_id)))
  );

create policy "activity_comments: remove own"
  on public.activity_comments for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket, files reachable only through rows the reader may see
-- Paths: {patient_id}/{uuid}.webp (patient), {patient_id}/{session_id}/partner.webp (challenge)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('activity-results', 'activity-results', false, 5 * 1024 * 1024, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "activity-results: read through visible rows"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'activity-results'
    and (
      private.is_patient_self(private.path_patient_id(name))
      or owner_id = (select auth.uid())::text
      or exists (select 1 from public.activity_sessions s where s.result_path = name)
      or exists (select 1 from public.challenge_entries e where e.result_path = name)
    )
  );

create policy "activity-results: patient or waiting partner uploads"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'activity-results'
    and (
      private.is_patient_self(private.path_patient_id(name))
      or (
        private.is_waiting_partner(private.path_part_uuid(name, 2))
        and private.session_patient(private.path_part_uuid(name, 2)) = private.path_patient_id(name)
      )
    )
  );

create policy "activity-results: patient deletes own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'activity-results' and private.is_patient_self(private.path_patient_id(name)));

alter publication supabase_realtime add table public.activity_sessions, public.challenge_entries, public.activity_reactions, public.activity_comments;
