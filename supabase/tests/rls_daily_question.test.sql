-- Question of the day: locked until you answer, Leo's answer private unless he shares it,
-- care team only gets shared masked answers, volunteers nothing. Seeded data. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(14);

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
create temp table today_q as select id from daily_questions where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = private.patient_today(patient_id);
grant select on today_q to authenticated;

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
select is((select text from todays_question('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'What is the bravest thing you ever did?', 'Leo gets today''s question');
select ok((select '33333333-3333-4333-8333-333333333333'::uuid = any (answered_by) from todays_question('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')), 'Leo sees that Dad answered');
select is((select count(*) from question_answers where daily_question_id = (select id from today_q))::int, 0, 'locked: Leo cannot read Dad''s answer yet');
select lives_ok($$insert into question_answers (daily_question_id, user_id, body, share_with_volunteers) select id, '11111111-1111-4111-8111-111111111111', 'I held Emma''s hand at the scan', true from today_q$$,
  'Leo answers and shares it');
select is((select count(*) from question_answers where daily_question_id = (select id from today_q))::int, 2, 'unlocked: Leo now reads Dad''s answer');
select throws_ok($$insert into question_answers (daily_question_id, user_id, body) select id, '11111111-1111-4111-8111-111111111111', 'late' from daily_questions where local_date < private.patient_today(patient_id) limit 1$$,
  '42501', null, 'no answering an old question');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select is((select count(*) from question_answers where daily_question_id = (select id from today_q))::int, 0, 'Emma is locked too until she answers');
select throws_ok($$insert into question_answers (daily_question_id, user_id, body, share_with_volunteers) select id, '22222222-2222-4222-8222-222222222222', 'x', true from today_q$$,
  '42501', null, 'only the patient can share with volunteers');
insert into question_answers (daily_question_id, user_id, body) select id, '22222222-2222-4222-8222-222222222222', 'Moving to a new city' from today_q;
select is((select count(*) from question_answers where daily_question_id = (select id from today_q))::int, 3, 'after answering, Emma sees Leo''s and James''s');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select is((select count(*) from question_answers)::int, 0, 'Sarah reads no answers directly');
select is((select count(*) from answers_to_review())::int, 1, 'Sarah gets only the answer Leo shared');
select is((select masked from answers_to_review()), 'I held [name]''s hand at the scan', 'names are masked');
select pg_temp.reset_role();

select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from question_answers)::int, 0, 'Maya reads no answers');
select throws_ok($$select * from todays_question('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'Maya cannot see Leo''s question');
select pg_temp.reset_role();

select * from finish();
rollback;
