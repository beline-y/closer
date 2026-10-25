-- Care engagement: counts only, for the child's care team only; minutes logged by the
-- child at most once a minute; last AI summary readable and writable by the care team
-- only. Baselines allow for real demo activity today. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

create function pg_temp.act_as(p_user_id uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
end;
$$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', null, true);
end;
$$;

-- Sarah reads Leo's last 14 days, as counts
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select is((select count(*) from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14))::int, 14, 'Sarah gets one row per day for Leo');
select is((select max(local_date) from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14)), private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'the last row is Leo''s today');
create temp table baseline as
select family_contacts, minutes_in_app from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1);
select pg_temp.reset_role();
grant select on baseline to authenticated;
-- The minute counter below starts from an idle state.
update app_minutes set last_seen_at = now() - interval '2 minutes'
  where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

-- Nobody else can call it
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select throws_ok($$select * from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14)$$, '42501', null, 'Emma (family) cannot read the counts');
select pg_temp.reset_role();
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok($$select * from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14)$$, '42501', null, 'Maya (volunteer) cannot read the counts');
select pg_temp.reset_role();
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select throws_ok($$select * from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14)$$, '42501', null, 'Leo cannot read the care counts');

-- Leo's minutes: two pings in the same minute count once
select lives_ok($$select log_app_minute()$$, 'Leo logs a minute in the app');
select log_app_minute();
select is((select count(*) from app_minutes)::int, (select count(*) from app_minutes where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int,
  'Leo reads only his own minutes');
select pg_temp.reset_role();
update app_minutes set last_seen_at = now() - interval '2 minutes'
  where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select log_app_minute();
select throws_ok($$insert into app_minutes (patient_id, local_date, minutes) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date - 100, 500)$$,
  '42501', null, 'Leo cannot write minutes directly');
select pg_temp.reset_role();

-- A card from Emma counts as a family contact today; one from Sarah doesn't
insert into comfort_cards (patient_id, author_id, body) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'count me'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'not family');
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select is((select family_contacts from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1)), (select family_contacts + 1 from baseline),
  'Emma''s card adds one family contact, Sarah''s adds none');
select is((select minutes_in_app from care_engagement('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1)),
  (select minutes_in_app + 2 from baseline),
  'Sarah sees Leo''s minutes today (two pings in a minute count once)');
select is((select sum(family_contacts) from care_engagement('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 14))::int, 0, 'Ava has no family linked: no contact');

-- Last AI summary: care team only
select lives_ok($$insert into ai_summaries (patient_id, kind, payload) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'overview', '{"summary":"test"}')
  on conflict (patient_id, kind) do update set payload = excluded.payload, stored_at = now()$$, 'Sarah stores Leo''s last summary');
select is((select payload->>'summary' from ai_summaries where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and kind = 'overview'), 'test', 'Sarah reads it back');
select pg_temp.reset_role();
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select is((select count(*) from ai_summaries)::int, 0, 'Emma reads no AI summary');
select throws_ok($$insert into ai_summaries (patient_id, kind, payload) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'report', '{}')$$,
  '42501', null, 'Emma cannot write an AI summary');
select pg_temp.reset_role();
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*) from ai_summaries)::int, 0, 'Leo reads no AI summary');
select pg_temp.reset_role();

select * from finish();
rollback;
