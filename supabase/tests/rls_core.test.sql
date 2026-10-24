-- RLS tests for profiles, patients and patient_links, using the seeded demo cast.
-- Run with: npm run db:test (everything is rolled back, nothing is written).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

-- Acts as a signed-in user for the next queries (same claims as a real session).
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

-- ---------------------------------------------------------------------------
-- Volunteers (Maya, Daniel) see nothing patient-related
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from patients)::int, 0, 'Maya (volunteer) sees no patients');
select is((select count(*) from patient_links)::int, 0, 'Maya sees no patient links');
select is((select count(*) from profiles where account_type = 'patient')::int, 0, 'Maya sees no patient profiles');
select is((select count(*) from profiles where id <> '55555555-5555-4555-8555-555555555555')::int, 0,
  'Maya sees no other profiles at all (no family, no care team)');
select is((select count(*) from profiles where id = '55555555-5555-4555-8555-555555555555')::int, 1,
  'Maya sees her own profile');

update patients set nickname = 'hacked' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.reset_role();
select is((select nickname from patients where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Leo',
  'Maya cannot update a patient');

select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select throws_ok(
  $$insert into patient_links (patient_id, user_id, role) values
    ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '55555555-5555-4555-8555-555555555555', 'volunteer')$$,
  '42501', null, 'Maya cannot link herself to a patient');
select pg_temp.reset_role();

select pg_temp.act_as('66666666-6666-4666-8666-666666666666'); -- Daniel
select is((select count(*) from patients)::int, 0, 'Daniel (volunteer) sees no patients');
select is((select count(*) from patient_links)::int, 0, 'Daniel sees no patient links');
select is((select count(*) from profiles where id <> '66666666-6666-4666-8666-666666666666')::int, 0,
  'Daniel sees no other profiles');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Leo's circle sees Leo; the guardian and care team see the whole circle
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
select is((select count(*) from patients)::int, 1, 'Leo sees his own patient record');
select is((select count(*) from patient_links)::int, 4, 'Leo sees his whole circle');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma, guardian
select is((select nickname from patients), 'Leo', 'Emma sees Leo');
select is((select count(*) from patient_links)::int, 4, 'Emma (guardian) sees the whole circle');
select pg_temp.reset_role();

select pg_temp.act_as('33333333-3333-4333-8333-333333333333'); -- James, not guardian
select is((select nickname from patients), 'Leo', 'James sees Leo');
select is((select count(*) from patient_links)::int, 1, 'James sees only his own link');
select pg_temp.reset_role();

select pg_temp.act_as('77777777-7777-4777-8777-777777777777'); -- Noah, friend
select is((select nickname from patients), 'Leo', 'Noah (friend) sees Leo');
select is((select count(*) from profiles where account_type = 'volunteer')::int, 0, 'Noah sees no volunteer profiles');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah, care team
select is((select count(*) from patients)::int, 1, 'Sarah sees her patient');
select is((select count(*) from patient_links)::int, 4, 'Sarah sees the circle of her patient');
select is((select count(*) from profiles where account_type = 'volunteer')::int, 0,
  'Sarah sees no volunteer profiles yet (volunteer approval comes with its own feature)');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Signed-out visitors get nothing
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select count(*) from patients', '42501', null, 'anon cannot read patients');
reset role;

select * from finish();
rollback;
