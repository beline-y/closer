-- Core schema: profiles, patients, patient_links.
-- Every table has RLS enabled. Access rules live in private.* helper functions
-- so policies stay short and never recurse into each other.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.account_type as enum ('patient', 'family', 'care_team', 'volunteer');
create type public.patient_status as enum ('pending_consent', 'active', 'discharged');
create type public.link_role as enum ('care_team', 'family', 'friend', 'volunteer');
create type public.link_status as enum ('pending', 'active', 'revoked');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 60),
  avatar_url text,
  -- 'patient' and 'care_team' are set only by the server (secret key) or seed.
  account_type public.account_type not null default 'family',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Minimal data on purpose: nickname, birth year, interests, timezone.
-- No diagnosis, room number or last name.
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  nickname text not null check (char_length(nickname) between 1 and 40),
  birth_year smallint check (birth_year between 1900 and 2100),
  is_minor boolean not null default true,
  interests text[] not null default '{}',
  timezone text not null default 'America/New_York',
  status public.patient_status not null default 'pending_consent',
  login_code text unique check (login_code ~ '^[A-Z0-9]{6}$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.patient_links (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.link_role not null,
  relationship text check (char_length(relationship) <= 40),
  is_guardian boolean not null default false,
  -- 'active' on invite redemption for the demo; 'pending' is reserved for a future approval flow.
  status public.link_status not null default 'active',
  invite_id uuid, -- foreign key added with the invites migration
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, user_id),
  check (not is_guardian or role = 'family')
);

create index patient_links_user_id_idx on public.patient_links (user_id) where status = 'active';

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger patients_set_updated_at before update on public.patients
  for each row execute function public.set_updated_at();
create trigger patient_links_set_updated_at before update on public.patient_links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access helpers (private schema: not exposed through the Data API)
-- security definer = they read tables without triggering RLS, which avoids
-- policy recursion. search_path = '' prevents search-path hijacking.
-- ---------------------------------------------------------------------------
create schema if not exists private;

create function private.is_patient_self(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patients p
    where p.id = p_patient_id and p.user_id = (select auth.uid())
  );
$$;

create function private.is_care_team(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_links l
    where l.patient_id = p_patient_id
      and l.user_id = (select auth.uid())
      and l.role = 'care_team'
      and l.status = 'active'
  );
$$;

create function private.is_guardian(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_links l
    where l.patient_id = p_patient_id
      and l.user_id = (select auth.uid())
      and l.is_guardian
      and l.status = 'active'
  );
$$;

-- Family & friends. Until consent is given (patient pending), only the guardian passes.
create function private.is_circle(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.patient_links l
    join public.patients p on p.id = l.patient_id
    where l.patient_id = p_patient_id
      and l.user_id = (select auth.uid())
      and l.role in ('family', 'friend')
      and l.status = 'active'
      and (p.status = 'active' or l.is_guardian)
  );
$$;

create function private.can_view(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_patient_self(p_patient_id)
      or private.is_circle(p_patient_id)
      or private.is_care_team(p_patient_id);
$$;

-- True when the current user and p_user_id are attached to at least one common patient.
create function private.shares_patient_with(p_user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  with mine as (
    select p.id from public.patients p where p.user_id = (select auth.uid())
    union
    select l.patient_id from public.patient_links l
    where l.user_id = (select auth.uid()) and l.status = 'active'
  )
  select exists (
    select 1 from public.patients p join mine on mine.id = p.id
    where p.user_id = p_user_id
  ) or exists (
    select 1 from public.patient_links l join mine on mine.id = l.patient_id
    where l.user_id = p_user_id and l.status = 'active'
  );
$$;

revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.is_patient_self(uuid),
  private.is_care_team(uuid),
  private.is_guardian(uuid),
  private.is_circle(uuid),
  private.can_view(uuid),
  private.shares_patient_with(uuid)
to authenticated;

-- ---------------------------------------------------------------------------
-- New auth user -> profile
-- User metadata is client-controlled, so it can only pick 'family' or 'volunteer'.
-- ---------------------------------------------------------------------------
create function private.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, account_type)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Friend'
    ), 60),
    case
      when new.raw_user_meta_data ->> 'account_type' = 'volunteer' then 'volunteer'::public.account_type
      else 'family'::public.account_type
    end
  );
  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- Table privileges (defense in depth on top of RLS)
-- anon gets nothing. authenticated can read, and update only listed columns.
-- Inserts and deletes go through server-side functions added in later migrations.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.patients, public.patient_links from anon, authenticated;
grant select on public.profiles, public.patients, public.patient_links to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (nickname, birth_year, is_minor, interests, timezone, status) on public.patients to authenticated;
grant update (status, relationship) on public.patient_links to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.patients enable row level security;
alter table public.patient_links enable row level security;

-- profiles: you see yourself and people attached to the same patient; you edit only yourself.
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles: read people sharing a patient"
  on public.profiles for select to authenticated
  using (private.shares_patient_with(id));

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- patients: visible to the patient, their circle and their care team; edited by the care team.
create policy "patients: read if linked"
  on public.patients for select to authenticated
  using (private.can_view(id));

create policy "patients: care team updates"
  on public.patients for update to authenticated
  using (private.is_care_team(id))
  with check (private.is_care_team(id));

-- patient_links: you see your own links; the patient, guardian and care team see the whole circle.
create policy "patient_links: read own"
  on public.patient_links for select to authenticated
  using (user_id = (select auth.uid()));

create policy "patient_links: read circle of my patient"
  on public.patient_links for select to authenticated
  using (
    private.is_patient_self(patient_id)
    or private.is_guardian(patient_id)
    or private.is_care_team(patient_id)
  );

create policy "patient_links: care team manages links"
  on public.patient_links for update to authenticated
  using (private.is_care_team(patient_id))
  with check (private.is_care_team(patient_id));

create policy "patient_links: guardian manages family and friends"
  on public.patient_links for update to authenticated
  using (private.is_guardian(patient_id) and role in ('family', 'friend'))
  with check (private.is_guardian(patient_id) and role in ('family', 'friend'));
