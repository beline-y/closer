-- Question pool: family-only ideas, never the same twice, generated ones need the
-- guardian's AI consent and stay in this patient's family. Rolled back.
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

delete from question_suggestions where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
delete from wellbeing_permissions where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
create temp table seen (id uuid, source text, reused boolean, ai boolean, age_range text, interests text[]);
grant all on seen to authenticated;

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
insert into seen select question_id, source, reused, ai_allowed, age_range, interests from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3);
select is((select count(*) from seen)::int, 3, 'Emma gets 3 ideas');
select is((select count(*) from seen where source = 'curated')::int, 3, 'curated questions come first');
select is((select bool_or(ai) from seen), false, 'no AI without the guardian''s consent');
select is((select max(age_range) from seen), '7-9', 'only an age range is exposed (Leo is 9)');
select pg_temp.reset_role();

select pg_temp.act_as('33333333-3333-4333-8333-333333333333'); -- James, same family
insert into seen select question_id, source, reused, ai_allowed, age_range, interests from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3);
select is((select count(distinct id) from seen)::int, 6, 'James gets 3 new ones: no repeat within the family');
select pg_temp.reset_role();

-- Exhaust the curated pool for Leo's family, then check the reuse fallback.
insert into question_suggestions (patient_id, question_id, suggested_at)
select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id, now() - interval '1 day' + (row_number() over ()) * interval '1 second'
from question_bank where source = 'curated' on conflict do nothing;
select pg_temp.act_as('77777777-7777-4777-8777-777777777777'); -- Noah
select is((select count(*) from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3))::int, 0, 'nothing new once the pool is used up');
select is((select count(*) from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, true) where reused)::int, 3, 'fallback: reuse the oldest curated ones');
select throws_ok($$select add_generated_questions('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', array['What would you name a cloud?'])$$,
  '42501', 'AI consent required', 'no generated questions without consent');
select pg_temp.reset_role();

insert into wellbeing_permissions (patient_id, enabled, consented_by) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true, '22222222-2222-4222-8222-222222222222');
select pg_temp.act_as('77777777-7777-4777-8777-777777777777');
select is((select bool_and(ai_allowed) from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, true)), true, 'with consent, AI is allowed');
select is(add_generated_questions('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', array['What would you name a cloud?', 'not a question']), 1,
  'generated questions are stored (only real questions)');
select is((select count(*) from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3) where source = 'mistral')::int, 1, 'and served from the pool');
select pg_temp.reset_role();

select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select throws_ok($$select * from next_question_ideas('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'volunteers get no ideas');
select is((select count(*) from question_bank)::int, 0, 'volunteers read nothing in the pool');
select pg_temp.reset_role();

select pg_temp.act_as('cccccccc-0000-4000-8000-000000000000'); -- nobody's family
select throws_ok($$select add_generated_questions('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', array['Injected?'])$$, '42501', null, 'outsiders cannot add to a family''s pool');
select pg_temp.reset_role();

select * from finish();
rollback;
