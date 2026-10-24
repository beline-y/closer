-- Nudges: one-tap messages from the patient to their circle, with a cooldown per type
-- (10 minutes by default, editable per patient by the care team) and quick replies.
-- Also adds patient_settings, which holds the cooldown and the alert thresholds.

-- ---------------------------------------------------------------------------
-- Patient settings (one row per patient)
-- ---------------------------------------------------------------------------
create table public.patient_settings (
  patient_id uuid primary key references public.patients (id) on delete cascade,
  nudge_cooldown_minutes smallint not null default 10 check (nudge_cooldown_minutes between 0 and 240),
  low_mood_threshold smallint not null default 2 check (low_mood_threshold between 1 and 4),
  low_mood_streak smallint not null default 3 check (low_mood_streak between 1 and 14),
  no_checkin_days smallint not null default 2 check (no_checkin_days between 1 and 14),
  no_family_contact_days smallint not null default 2 check (no_family_contact_days between 1 and 14),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create trigger patient_settings_set_updated_at before update on public.patient_settings
  for each row execute function public.set_updated_at();

-- Every patient gets settings with the defaults.
create function private.create_patient_settings()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.patient_settings (patient_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.create_patient_settings() from public, anon, authenticated;

create trigger patients_create_settings after insert on public.patients
  for each row execute function private.create_patient_settings();

insert into public.patient_settings (patient_id) select id from public.patients on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Nudges
-- ---------------------------------------------------------------------------
create type public.nudge_kind as enum ('miss_you', 'call_me', 'bored', 'proud', 'hug');

create table public.nudges (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  kind public.nudge_kind not null,
  created_at timestamptz not null default now()
);

create index nudges_patient_kind_idx on public.nudges (patient_id, kind, created_at desc);

create table public.nudge_recipients (
  nudge_id uuid not null references public.nudges (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seen_at timestamptz,
  reply_emoji text check (reply_emoji in ('❤️', '📞', '🤗', '⭐')),
  reply_text text check (char_length(reply_text) <= 140),
  replied_at timestamptz,
  primary key (nudge_id, user_id)
);

create index nudge_recipients_user_idx on public.nudge_recipients (user_id, replied_at);

-- Patient of a nudge (for policies; avoids recursion between the two tables).
create function private.nudge_patient(p_nudge_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select patient_id from public.nudges where id = p_nudge_id;
$$;

create function private.is_nudge_recipient(p_nudge_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.nudge_recipients r
    where r.nudge_id = p_nudge_id and r.user_id = (select auth.uid())
  );
$$;

revoke all on function private.nudge_patient(uuid), private.is_nudge_recipient(uuid) from public, anon;
grant execute on function private.nudge_patient(uuid), private.is_nudge_recipient(uuid) to authenticated;

-- The only way to create a nudge: the patient, to people of their own circle, outside the
-- cooldown of that type. Recipients default to the whole circle.
create function public.send_nudge(p_kind public.nudge_kind, p_recipients uuid[] default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_patient uuid;
  v_cooldown int;
  v_last timestamptz;
  v_nudge uuid;
  v_recipients uuid[];
begin
  select id into v_patient from public.patients where user_id = (select auth.uid()) and status = 'active';
  if v_patient is null then
    raise exception 'only an active patient can send a nudge' using errcode = '42501';
  end if;

  select nudge_cooldown_minutes into v_cooldown from public.patient_settings where patient_id = v_patient;
  select max(created_at) into v_last from public.nudges where patient_id = v_patient and kind = p_kind;
  if v_last is not null and v_last > now() - make_interval(mins => coalesce(v_cooldown, 10)) then
    raise exception 'cooldown' using errcode = 'P0001', hint = (v_last + make_interval(mins => coalesce(v_cooldown, 10)))::text;
  end if;

  select array_agg(l.user_id) into v_recipients
  from public.patient_links l
  where l.patient_id = v_patient and l.status = 'active' and l.role in ('family', 'friend')
    and (p_recipients is null or l.user_id = any (p_recipients));
  if v_recipients is null then
    raise exception 'no recipient in the circle' using errcode = '22023';
  end if;

  insert into public.nudges (patient_id, kind) values (v_patient, p_kind) returning id into v_nudge;
  insert into public.nudge_recipients (nudge_id, user_id) select v_nudge, unnest(v_recipients);
  return v_nudge;
end;
$$;

revoke all on function public.send_nudge(public.nudge_kind, uuid[]) from public, anon;
grant execute on function public.send_nudge(public.nudge_kind, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.patient_settings, public.nudges, public.nudge_recipients from anon, authenticated;
grant select on public.patient_settings, public.nudges, public.nudge_recipients to authenticated;
grant update (nudge_cooldown_minutes, low_mood_threshold, low_mood_streak, no_checkin_days, no_family_contact_days, updated_by)
  on public.patient_settings to authenticated;
grant update (seen_at, reply_emoji, reply_text, replied_at) on public.nudge_recipients to authenticated;

alter table public.patient_settings enable row level security;
alter table public.nudges enable row level security;
alter table public.nudge_recipients enable row level security;

-- Settings: patient, circle and care team read (the cooldown shows in the UI);
-- only the care team edits.
create policy "patient_settings: read if linked"
  on public.patient_settings for select to authenticated
  using (private.can_view(patient_id));

create policy "patient_settings: care team edits"
  on public.patient_settings for update to authenticated
  using (private.is_care_team(patient_id))
  with check (private.is_care_team(patient_id) and updated_by = (select auth.uid()));

-- Nudges: the patient and the recipients. Not the care team, not volunteers.
create policy "nudges: patient and recipients read"
  on public.nudges for select to authenticated
  using (private.is_patient_self(patient_id) or private.is_nudge_recipient(id));

-- Recipients: you see your own row; the patient sees every reply to their nudges.
create policy "nudge_recipients: own row or patient"
  on public.nudge_recipients for select to authenticated
  using (user_id = (select auth.uid()) or private.is_patient_self(private.nudge_patient(nudge_id)));

create policy "nudge_recipients: recipient replies"
  on public.nudge_recipients for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Realtime: family sees new nudges live, the patient sees replies live
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.nudges, public.nudge_recipients;
