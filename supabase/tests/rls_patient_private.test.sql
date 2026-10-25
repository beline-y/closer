-- The Me tab is private: unfinished and kept-for-myself results are readable by the patient
-- only. Family sees only what Leo shared; the care team only counts. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(8);

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

select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
insert into activity_sessions (patient_id, activity_id, status, result_text)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-00000000000b', 'started', 'my secret draft');
select is((select count(*) from activity_sessions where status = 'started')::int, 1, 'Leo sees his unfinished draft');
select ok((select count(*) from activity_sessions where visibility = 'private' and not in_memories) >= 1, 'Leo sees what he kept for himself');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma, guardian
select is((select count(*) from activity_sessions where status = 'started')::int, 0, 'Emma cannot read Leo''s drafts');
select is((select count(*) from activity_sessions where visibility = 'private' and not in_memories)::int, 0, 'Emma cannot read what Leo kept for himself');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select is((select count(*) from activity_sessions)::int, 0, 'Sarah reads no result at all');
select is((select coalesce(sum(completed), 0) from activity_counts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))::int,
  (select count(*)::int from activity_sessions where false) + 6, 'Sarah only gets completion counts (drafts not counted)');
select pg_temp.reset_role();

select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from activity_sessions)::int, 0, 'Maya reads nothing');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
update activity_sessions set visibility = 'family' where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.reset_role();
select is((select count(*) from activity_sessions where visibility = 'private' and not in_memories and status = 'completed')::int, 1,
  'Emma cannot share Leo''s private items for him');

select * from finish();
rollback;
