-- Isolated fictional users and patient; all changes, reviews and deliveries roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(22);

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

insert into auth.users (id, email, raw_user_meta_data) values
  ('81000000-0000-4000-8000-000000000001', 'wellbeing-child@example.com', '{"display_name":"Test child"}'),
  ('81000000-0000-4000-8000-000000000002', 'wellbeing-guardian@example.com', '{"display_name":"Test guardian"}'),
  ('81000000-0000-4000-8000-000000000003', 'wellbeing-care@example.com', '{"display_name":"Test nurse"}'),
  ('81000000-0000-4000-8000-000000000004', 'wellbeing-outsider@example.com', '{"display_name":"Test outsider"}');
update profiles set account_type = 'patient' where id = '81000000-0000-4000-8000-000000000001';
update profiles set account_type = 'care_team' where id = '81000000-0000-4000-8000-000000000003';
insert into patients (id, user_id, nickname, is_minor, status, timezone)
values ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'Fictional child', true, 'active', 'UTC');
insert into patient_links (patient_id, user_id, role, is_guardian) values
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002', 'family', true),
  ('82000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000003', 'care_team', false);

select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace
  and relname in ('wellbeing_permissions','wellbeing_settings','daily_wellbeing_reviews','notifications','notification_prefs')
  and relrowsecurity), 5, 'All wellbeing tables enforce RLS');
set local role anon;
select throws_ok('select * from public.notifications', '42501', null, 'Anonymous callers cannot read notifications');
select pg_temp.reset_role();
select is((select count(*)::int from claim_daily_review('82000000-0000-4000-8000-000000000001', current_date - 1)),
  0, 'No review is claimed before consent');

select pg_temp.act_as('81000000-0000-4000-8000-000000000001');
select throws_ok($$select set_wellbeing_consent('82000000-0000-4000-8000-000000000001', true)$$,
  'P0001', null, 'A minor cannot grant AI consent');
select pg_temp.act_as('81000000-0000-4000-8000-000000000002');
select lives_ok($$select set_wellbeing_consent('82000000-0000-4000-8000-000000000001', true)$$,
  'An active guardian can grant consent');
select throws_ok($$select * from claim_daily_review('82000000-0000-4000-8000-000000000001', current_date - 1)$$,
  '42501', null, 'A signed-in guardian cannot run the scheduler');
select pg_temp.reset_role();

create temp table _wellbeing_claim (review_id uuid, token uuid);
grant select, insert on _wellbeing_claim to service_role;
set local role service_role;
insert into _wellbeing_claim select * from claim_daily_review('82000000-0000-4000-8000-000000000001', current_date - 1);
select is((select count(*)::int from _wellbeing_claim), 1, 'The service role claims an opted-in review');
select is((select count(*)::int from claim_daily_review('82000000-0000-4000-8000-000000000001', current_date - 1)),
  0, 'A concurrent run cannot claim the same review');
select ok((select complete_daily_review(review_id, token,
  '{"level":"check_in","source":"mistral","summary":"Synthetic test only","evidence":[],"suggested_action":"Ask how they feel","safeguarding_concern":false,"model":"test-double","prompt_version":"test"}',
  'A fictional parent invitation', 'A fictional child invitation') from _wellbeing_claim),
  'Completion atomically saves the review and deliveries');
select ok(not (select complete_daily_review(review_id, token, '{}'::jsonb, 'unused', 'unused') from _wellbeing_claim),
  'Repeated completion cannot deliver duplicates');
select pg_temp.reset_role();
select is((select count(*)::int from notifications where patient_id = '82000000-0000-4000-8000-000000000001'),
  4, 'One care alert, one guardian alert and two separate invitations are delivered');

select pg_temp.act_as('81000000-0000-4000-8000-000000000002');
select is((select count(*)::int from daily_wellbeing_reviews), 0, 'The guardian cannot read review evidence');
select is((select count(*)::int from notifications), 2, 'The guardian sees only their own alert and invitation');
select throws_ok($$update notifications set body = 'tampered'$$, '42501', null, 'Recipients cannot rewrite notification content');
select pg_temp.act_as('81000000-0000-4000-8000-000000000001');
select is((select count(*)::int from daily_wellbeing_reviews), 0, 'The child cannot read adult reviews');
select is((select count(*)::int from notifications), 1, 'The child sees only their own invitation');
select pg_temp.act_as('81000000-0000-4000-8000-000000000003');
select is((select count(*)::int from daily_wellbeing_reviews), 1, 'Individually linked care staff can read the review');
select lives_ok($$select acknowledge_wellbeing_review(id) from daily_wellbeing_reviews$$,
  'Linked care staff can acknowledge the review');
select pg_temp.act_as('81000000-0000-4000-8000-000000000004');
select is((select count(*)::int from notifications), 0, 'An unlinked user cannot read deliveries');

select pg_temp.reset_role();
update patient_links set status = 'revoked' where patient_id = '82000000-0000-4000-8000-000000000001'
  and user_id = '81000000-0000-4000-8000-000000000002';
select pg_temp.act_as('81000000-0000-4000-8000-000000000002');
select is((select count(*)::int from notifications), 0, 'Revoking the guardian link removes inbox access');
select pg_temp.reset_role();
select ok(not private.wellbeing_enabled('82000000-0000-4000-8000-000000000001'), 'Consent stops being valid after guardian revocation');
select is((select count(*)::int from claim_daily_review('82000000-0000-4000-8000-000000000001', current_date - 1)),
  0, 'Revoked consent cannot start another review');

select * from finish();
rollback;
