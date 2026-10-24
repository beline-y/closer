-- Daily mood check-in: one per patient per local day, editable until midnight
-- (patient's timezone). The photo lives in its own table and a private bucket so the
-- care team, who reads check-ins, never gets access to it.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.meal_kind as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type public.meal_amount as enum ('all', 'half', 'a_little');
create type public.activity_kind as enum ('played', 'movie', 'drew', 'school', 'visit', 'treatment', 'rested', 'walk');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Today's date in the patient's timezone.
create function private.patient_today(p_patient_id uuid)
returns date
language sql stable security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(p.timezone, 'America/New_York'))::date
  from public.patients p
  where p.id = p_patient_id;
$$;

-- First folder of a storage path as a uuid, or null (never throws on bad input).
create function private.path_patient_id(p_name text)
returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

-- Patient + family and friends (not the care team): who may see photos and reactions.
create function private.is_patient_or_circle(p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_patient_self(p_patient_id) or private.is_circle(p_patient_id);
$$;

revoke all on function private.patient_today(uuid), private.path_patient_id(text), private.is_patient_or_circle(uuid) from public, anon;
grant execute on function private.patient_today(uuid), private.path_patient_id(text), private.is_patient_or_circle(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  local_date date not null,
  mood smallint not null check (mood between 1 and 5),
  meals public.meal_kind[] not null default '{}',
  meal_note text check (char_length(meal_note) <= 120),
  meal_amount public.meal_amount,
  activities public.activity_kind[] not null default '{}',
  activity_note text check (char_length(activity_note) <= 120),
  note text check (char_length(note) <= 280),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (patient_id, local_date)
);

create index mood_checkins_patient_date_idx on public.mood_checkins (patient_id, local_date desc);

-- Patient and family only. Storage path: checkin-photos/{patient_id}/{uuid}.webp
create table public.checkin_photos (
  id uuid primary key default gen_random_uuid(),
  checkin_id uuid not null unique references public.mood_checkins (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  path text not null unique check (private.path_patient_id(path) = patient_id),
  created_at timestamptz not null default now()
);

create table public.checkin_reactions (
  checkin_id uuid not null references public.mood_checkins (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  emoji text not null check (emoji in ('❤️', '🤗', '⭐', '💪', '😂')),
  created_at timestamptz not null default now(),
  primary key (checkin_id, user_id, emoji)
);

-- The database decides the day, never the client. Runs before RLS checks the row.
-- Only the seed (running as postgres) may write past days.
create function private.set_checkin_local_date()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') or new.local_date is null then
    new.local_date := private.patient_today(new.patient_id);
  end if;
  return new;
end;
$$;

create trigger mood_checkins_local_date before insert on public.mood_checkins
  for each row execute function private.set_checkin_local_date();
create trigger mood_checkins_set_updated_at before update on public.mood_checkins
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.mood_checkins, public.checkin_photos, public.checkin_reactions from anon, authenticated;
grant select on public.mood_checkins to authenticated;
grant insert (patient_id, mood, meals, meal_note, meal_amount, activities, activity_note, note) on public.mood_checkins to authenticated;
grant update (mood, meals, meal_note, meal_amount, activities, activity_note, note) on public.mood_checkins to authenticated;
grant select, insert, delete on public.checkin_photos to authenticated;
grant update (path) on public.checkin_photos to authenticated;
grant select, insert, delete on public.checkin_reactions to authenticated;

alter table public.mood_checkins enable row level security;
alter table public.checkin_photos enable row level security;
alter table public.checkin_reactions enable row level security;

-- Check-ins: patient, circle and care team read. Volunteers: nothing.
create policy "mood_checkins: read if linked"
  on public.mood_checkins for select to authenticated
  using (private.can_view(patient_id));

create policy "mood_checkins: patient adds today"
  on public.mood_checkins for insert to authenticated
  with check (private.is_patient_self(patient_id) and local_date = private.patient_today(patient_id));

create policy "mood_checkins: patient edits today"
  on public.mood_checkins for update to authenticated
  using (private.is_patient_self(patient_id) and local_date = private.patient_today(patient_id))
  with check (private.is_patient_self(patient_id) and local_date = private.patient_today(patient_id));

-- Photos: patient and family only. The care team never sees them.
create policy "checkin_photos: patient and circle read"
  on public.checkin_photos for select to authenticated
  using (private.is_patient_or_circle(patient_id));

create policy "checkin_photos: patient manages today's photo"
  on public.checkin_photos for all to authenticated
  using (
    private.is_patient_self(patient_id)
    and exists (
      select 1 from public.mood_checkins c
      where c.id = checkin_id and c.patient_id = checkin_photos.patient_id
        and c.local_date = private.patient_today(c.patient_id)
    )
  )
  with check (
    private.is_patient_self(patient_id)
    and exists (
      select 1 from public.mood_checkins c
      where c.id = checkin_id and c.patient_id = checkin_photos.patient_id
        and c.local_date = private.patient_today(c.patient_id)
    )
  );

-- Reactions: patient and circle read; circle members add and remove their own.
create policy "checkin_reactions: patient and circle read"
  on public.checkin_reactions for select to authenticated
  using (exists (select 1 from public.mood_checkins c where c.id = checkin_id and private.is_patient_or_circle(c.patient_id)));

create policy "checkin_reactions: circle adds own"
  on public.checkin_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.mood_checkins c where c.id = checkin_id and private.is_circle(c.patient_id))
  );

create policy "checkin_reactions: remove own"
  on public.checkin_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: private bucket, signed URLs only
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkin-photos', 'checkin-photos', false, 5 * 1024 * 1024, array['image/webp', 'image/jpeg'])
on conflict (id) do nothing;

create policy "checkin-photos: patient and circle read"
  on storage.objects for select to authenticated
  using (bucket_id = 'checkin-photos' and private.is_patient_or_circle(private.path_patient_id(name)));

create policy "checkin-photos: patient uploads own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'checkin-photos' and private.is_patient_self(private.path_patient_id(name)));

create policy "checkin-photos: patient replaces own"
  on storage.objects for update to authenticated
  using (bucket_id = 'checkin-photos' and private.is_patient_self(private.path_patient_id(name)))
  with check (bucket_id = 'checkin-photos' and private.is_patient_self(private.path_patient_id(name)));

create policy "checkin-photos: patient deletes own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'checkin-photos' and private.is_patient_self(private.path_patient_id(name)));

-- ---------------------------------------------------------------------------
-- Realtime: family feeds update live (Realtime applies the same RLS)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.mood_checkins, public.checkin_photos, public.checkin_reactions;
