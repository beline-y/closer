-- Fictional demo only. AI processing is disabled until an active guardian (or
-- the adult patient) explicitly opts in. Apply through the team's shared-DB flow.
create table public.wellbeing_permissions (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  enabled boolean not null default false,
  consented_by uuid not null references public.profiles(id) on delete cascade,
  consent_version text not null default 'mistral-wellbeing-v1',
  updated_at timestamptz not null default now()
);

create table public.wellbeing_settings (
  patient_id uuid primary key references public.patients(id) on delete cascade,
  low_mood_threshold smallint not null default 2 check (low_mood_threshold between 1 and 4),
  low_mood_streak smallint not null default 3 check (low_mood_streak between 2 and 7),
  no_checkin_days smallint not null default 2 check (no_checkin_days between 1 and 7)
);

create table public.daily_wellbeing_reviews (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  for_date date not null,
  status text not null default 'processing' check (status in ('processing', 'complete', 'rules_only')),
  level text check (level in ('insufficient_data', 'routine', 'check_in', 'priority')),
  summary text,
  evidence jsonb not null default '[]',
  suggested_action text,
  safeguarding_concern boolean not null default false,
  source text check (source in ('mistral', 'rules', 'no_data')),
  model text,
  prompt_version text,
  attempts integer not null default 1,
  lease_token uuid not null default gen_random_uuid(),
  consent_at timestamptz not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  acknowledged_by uuid references public.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  unique (patient_id, for_date)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  for_date date not null,
  kind text not null check (kind in ('connection', 'wellbeing_alert')),
  title text not null check (char_length(title) <= 100),
  body text not null check (char_length(body) <= 600),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  feedback text check (feedback in ('helpful', 'not_now', 'connected')),
  unique (user_id, patient_id, for_date, kind)
);
create index notifications_owner_unread_idx on public.notifications(user_id, created_at desc);

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  connection_enabled boolean not null default true
);

-- The granting guardian must still be linked. Consent cannot survive revocation
-- of that link or a change from adult to minor.
create function private.wellbeing_enabled(pid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.patients p
    join public.wellbeing_permissions w on w.patient_id = p.id
    where p.id = pid and p.status = 'active' and w.enabled
      and w.consent_version = 'mistral-wellbeing-v1'
      and ((not p.is_minor and p.user_id = w.consented_by)
        or (p.is_minor and exists (
          select 1 from public.patient_links l where l.patient_id = pid
          and l.user_id = w.consented_by and l.status = 'active'
          and l.role = 'family' and l.is_guardian
        )))
  );
$$;
revoke all on function private.wellbeing_enabled(uuid) from public, anon;
grant execute on function private.wellbeing_enabled(uuid) to authenticated, service_role;

alter table public.wellbeing_permissions enable row level security;
alter table public.wellbeing_settings enable row level security;
alter table public.daily_wellbeing_reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_prefs enable row level security;

revoke all on public.wellbeing_permissions,
  public.wellbeing_settings, public.daily_wellbeing_reviews,
  public.notifications, public.notification_prefs from anon, authenticated;
grant all on public.wellbeing_permissions,
  public.wellbeing_settings, public.daily_wellbeing_reviews,
  public.notifications, public.notification_prefs to service_role;
grant select on public.wellbeing_permissions,
  public.wellbeing_settings, public.daily_wellbeing_reviews,
  public.notifications, public.notification_prefs to authenticated;
grant insert, update on public.notification_prefs to authenticated;
grant insert on public.wellbeing_settings to authenticated;
grant update (low_mood_threshold, low_mood_streak, no_checkin_days) on public.wellbeing_settings to authenticated;
grant update (read_at, feedback) on public.notifications to authenticated;

create policy "permissions: read authorized" on public.wellbeing_permissions for select to authenticated
  using (private.is_guardian(patient_id) or private.is_patient_self(patient_id) or private.is_care_team(patient_id));
create policy "settings: care reads" on public.wellbeing_settings for select to authenticated
  using (private.is_care_team(patient_id));
create policy "settings: care inserts" on public.wellbeing_settings for insert to authenticated
  with check (private.is_care_team(patient_id));
create policy "settings: care updates" on public.wellbeing_settings for update to authenticated
  using (private.is_care_team(patient_id)) with check (private.is_care_team(patient_id));
create policy "reviews: care only" on public.daily_wellbeing_reviews for select to authenticated
  using (private.is_care_team(patient_id));
create policy "notifications: current recipient" on public.notifications for select to authenticated
  using (user_id = (select auth.uid()) and
    (private.is_patient_self(patient_id) or private.is_guardian(patient_id) or private.is_care_team(patient_id)));
create policy "notifications: recipient feedback" on public.notifications for update to authenticated
  using (user_id = (select auth.uid()) and
    (private.is_patient_self(patient_id) or private.is_guardian(patient_id) or private.is_care_team(patient_id)))
  with check (user_id = (select auth.uid()));
create policy "prefs: owner reads" on public.notification_prefs for select to authenticated
  using (user_id = (select auth.uid()));
create policy "prefs: owner inserts" on public.notification_prefs for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "prefs: owner updates" on public.notification_prefs for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create function public.set_wellbeing_consent(p_patient_id uuid, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.patients p where p.id = p_patient_id
    and ((p.is_minor and private.is_guardian(p.id))
      or (not p.is_minor and private.is_patient_self(p.id)))) then
    raise exception 'Only an active guardian or the adult patient can change consent';
  end if;
  insert into public.wellbeing_permissions(patient_id, enabled, consented_by)
  values (p_patient_id, p_enabled, auth.uid())
  on conflict (patient_id) do update set enabled = excluded.enabled,
    consented_by = excluded.consented_by, consent_version = 'mistral-wellbeing-v1', updated_at = clock_timestamp();
end;
$$;
revoke all on function public.set_wellbeing_consent(uuid, boolean) from public, anon;
grant execute on function public.set_wellbeing_consent(uuid, boolean) to authenticated;

-- Service-role only. A unique daily row plus a renewable lease prevents parallel
-- runs from duplicating delivery. Rules-only runs can retry up to three times.
create function public.claim_daily_review(p_patient_id uuid, p_for_date date)
returns table (review_id uuid, token uuid)
language plpgsql security definer set search_path = '' as $$
begin
  if not private.wellbeing_enabled(p_patient_id) then return; end if;
  if p_for_date <> (select (now() at time zone p.timezone)::date - 1
    from public.patients p where p.id = p_patient_id) then return; end if;
  return query
    insert into public.daily_wellbeing_reviews(patient_id, for_date, consent_at)
    select p_patient_id, p_for_date, w.updated_at from public.wellbeing_permissions w
    where w.patient_id = p_patient_id
    on conflict (patient_id, for_date) do update
      set status = 'processing', lease_token = gen_random_uuid(), started_at = now(),
        attempts = daily_wellbeing_reviews.attempts + 1, consent_at = excluded.consent_at
      where daily_wellbeing_reviews.attempts < 3 and
        (daily_wellbeing_reviews.status = 'rules_only' or
          (daily_wellbeing_reviews.status = 'processing' and daily_wellbeing_reviews.started_at < now() - interval '5 minutes'))
    returning id, lease_token;
end;
$$;
revoke all on function public.claim_daily_review(uuid, date) from public, anon, authenticated;
grant execute on function public.claim_daily_review(uuid, date) to service_role;

create function public.can_process_wellbeing(p_patient_id uuid, p_consent_at timestamptz)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.wellbeing_enabled(p_patient_id) and exists (
    select 1 from public.wellbeing_permissions w
    where w.patient_id = p_patient_id and w.updated_at = p_consent_at and w.enabled
  );
$$;
revoke all on function public.can_process_wellbeing(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.can_process_wellbeing(uuid, timestamptz) to service_role;

-- Store the review and all inbox deliveries in one transaction. Check consent,
-- current links and preferences AGAIN after the network call.
create function public.complete_daily_review(
  p_review_id uuid, p_token uuid, p_result jsonb, p_parent_message text, p_child_message text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  r public.daily_wellbeing_reviews;
  p public.patients;
begin
  select * into r from public.daily_wellbeing_reviews
    where id = p_review_id and lease_token = p_token and status = 'processing' for update;
  if not found then return false; end if;
  -- Lock the consent row to serialize delivery with opt-out.
  perform 1 from public.wellbeing_permissions w
    where w.patient_id = r.patient_id and w.updated_at = r.consent_at and w.enabled for update;
  if not found or not private.wellbeing_enabled(r.patient_id) then
    delete from public.daily_wellbeing_reviews where id = r.id;
    return false;
  end if;
  select * into p from public.patients where id = r.patient_id;
  update public.daily_wellbeing_reviews set
    status = case when p_result->>'source' = 'rules' then 'rules_only' else 'complete' end,
    level = p_result->>'level', summary = p_result->>'summary',
    evidence = p_result->'evidence', suggested_action = p_result->>'suggested_action',
    safeguarding_concern = (p_result->>'safeguarding_concern')::boolean,
    source = p_result->>'source', model = p_result->>'model',
    prompt_version = p_result->>'prompt_version', completed_at = now()
    where id = r.id;

  if p_result->>'level' in ('check_in', 'priority') or p_result->>'source' = 'rules' then
    insert into public.notifications(user_id, patient_id, for_date, kind, title, body)
    select l.user_id, p.id, r.for_date, 'wellbeing_alert',
      case when l.role = 'care_team' and p_result->>'source' = 'rules' then 'AI review unavailable'
        when l.role = 'care_team' and p_result->>'level' = 'priority' then 'Priority: human review needed'
        else 'A little extra support' end,
      case when l.role = 'care_team' and p_result->>'source' = 'rules' then p.nickname || ': Mistral could not complete a valid review. Only fixed mood and missing-check-in rules ran. Please review shared responses yourself.'
        when l.role = 'care_team' then p.nickname || ': review the shared check-ins and daily wellbeing review. This is a support signal, not a diagnosis.'
        else 'Make time to check in with ' || p.nickname || '. Ask how they are feeling and contact the care team with any concerns.' end
    from public.patient_links l where l.patient_id = p.id and l.status = 'active'
      and (l.role = 'care_team' or (l.is_guardian and p_result->>'level' in ('check_in', 'priority')
        and not (p_result->>'safeguarding_concern')::boolean))
    on conflict (user_id, patient_id, for_date, kind) do nothing;
  end if;

  -- At most one connection prompt per recipient/patient/day. Low moods replace
  -- activity prompts with company and support. No guilt, streaks or click reward.
  insert into public.notifications(user_id, patient_id, for_date, kind, title, body)
  select recipient, p.id, r.for_date, 'connection', 'A little moment together', message
  from (
    select p.user_id as recipient, p_child_message as message
    union all
    select l.user_id, p_parent_message from public.patient_links l
      where l.patient_id = p.id and l.status = 'active' and l.is_guardian
        and not (p_result->>'safeguarding_concern')::boolean
  ) recipients
  where recipient is not null and not exists (
    select 1 from public.notification_prefs prefs where prefs.user_id = recipient and not prefs.connection_enabled
  )
  on conflict (user_id, patient_id, for_date, kind) do nothing;
  return true;
end;
$$;
revoke all on function public.complete_daily_review(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.complete_daily_review(uuid, uuid, jsonb, text, text) to service_role;

create function public.acknowledge_wellbeing_review(p_review_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.daily_wellbeing_reviews set acknowledged_by = auth.uid(), acknowledged_at = now()
    where id = p_review_id and private.is_care_team(patient_id) and completed_at is not null;
  if not found then raise exception 'Review unavailable'; end if;
end;
$$;
revoke all on function public.acknowledge_wellbeing_review(uuid) from public, anon;
grant execute on function public.acknowledge_wellbeing_review(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
