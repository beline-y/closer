-- RLS tests for mood check-ins, check-in photos (table + Storage) and reactions.
-- Uses the seeded cast and photos (npm run db:seed). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(27);

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

-- A family member of another patient (Ava), created for this test only.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'authenticated', 'authenticated',
        'ava.parent@example.com', '', now(), '{}', '{"display_name":"Ava parent"}', now(), now());
insert into patient_links (patient_id, user_id, role, relationship, is_guardian)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'family', 'Mom', true);

-- ---------------------------------------------------------------------------
-- Leo: one check-in per day, today only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$insert into mood_checkins (patient_id, mood, activities, note) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, '{drew}', 'test')$$,
  'Leo adds today''s check-in');
select is((select local_date from mood_checkins where note = 'test'), private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  'The database sets the day (patient timezone)');
select throws_ok(
  $$insert into mood_checkins (patient_id, local_date, mood) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '2020-01-01', 3)$$,
  '42501', null, 'Leo cannot choose the date');
select throws_ok(
  $$insert into mood_checkins (patient_id, mood) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5)$$,
  '23505', null, 'Only one check-in per day');
update mood_checkins set mood = 1 where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = private.patient_today(patient_id) - 1;
select pg_temp.reset_role();
select is((select mood from mood_checkins where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and local_date = private.patient_today(patient_id) - 1)::int, 5,
  'Leo cannot edit yesterday''s check-in');

-- ---------------------------------------------------------------------------
-- Family and friends: full check-in with photo
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select is((select count(*) from mood_checkins)::int, 14, 'Emma reads all of Leo''s check-ins');
select is((select count(*) from checkin_photos)::int, 5, 'Emma reads Leo''s check-in photos');
select is((select count(*) from storage.objects o join checkin_photos p on p.path = o.name where o.bucket_id = 'checkin-photos')::int,
  (select count(*) from checkin_photos)::int, 'Emma can open every linked photo file, even with extra test uploads');
select throws_ok(
  $$insert into mood_checkins (patient_id, mood) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2)$$,
  '42501', null, 'Emma cannot write a check-in for Leo');
select lives_ok(
  $$insert into checkin_reactions (checkin_id, user_id, kind)
    select id, '22222222-2222-4222-8222-222222222222', 'strong' from mood_checkins where note = 'test'$$,
  'Emma reacts to a check-in');
select lives_ok(
  $$insert into checkin_reactions (checkin_id, user_id, kind)
    select id, '22222222-2222-4222-8222-222222222222', 'hug' from mood_checkins where note = 'test'
    on conflict (checkin_id, user_id) do update set kind = excluded.kind$$,
  'Emma can change her existing reaction');
select is((select kind from checkin_reactions r join mood_checkins c on c.id = r.checkin_id
  where c.note = 'test' and r.user_id = '22222222-2222-4222-8222-222222222222'), 'hug',
  'Changing a reaction keeps exactly one per person');
select throws_ok(
  $$insert into checkin_reactions (checkin_id, user_id, kind)
    select id, '22222222-2222-4222-8222-222222222222', 'heart' from mood_checkins where note = 'test'$$,
  '23505', null, 'A second simultaneous reaction from the same person is rejected');
select pg_temp.reset_role();

select pg_temp.act_as('33333333-3333-4333-8333-333333333333'); -- James
select is((select count(*) from checkin_photos)::int, 5, 'James reads the photos');
select pg_temp.reset_role();

select pg_temp.act_as('77777777-7777-4777-8777-777777777777'); -- Noah
select is((select count(*) from mood_checkins)::int, 14, 'Noah (friend) reads Leo''s check-ins');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Care team: mood, activity, meal, note. Never the photo.
-- ---------------------------------------------------------------------------
select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select is((select count(*) from mood_checkins where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int, 14, 'Sarah reads Leo''s check-ins');
select is((select count(*) from checkin_photos)::int, 0, 'Sarah cannot read photo paths');
select is((select count(*) from storage.objects where bucket_id = 'checkin-photos')::int, 0, 'Sarah cannot open photo files');
select is((select count(*) from checkin_reactions)::int, 0, 'Sarah cannot read family reactions');
select throws_ok(
  $$insert into checkin_reactions (checkin_id, user_id, kind)
    select id, '44444444-4444-4444-8444-444444444444', 'heart' from mood_checkins limit 1$$,
  '42501', null, 'Sarah cannot react');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Volunteers: nothing at all
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from mood_checkins)::int, 0, 'Maya reads no check-ins');
select is((select count(*) from checkin_photos)::int, 0, 'Maya reads no photo paths');
select is((select count(*) from storage.objects where bucket_id = 'checkin-photos')::int, 0, 'Maya opens no photo files');
select is((select count(*) from checkin_reactions)::int, 0, 'Maya reads no reactions');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Another patient's family
-- ---------------------------------------------------------------------------
select pg_temp.act_as('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'); -- Ava's parent
select is((select count(*) from mood_checkins where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int, 0,
  'Another patient''s family cannot read Leo''s check-ins');
select is((select count(*) from storage.objects where bucket_id = 'checkin-photos')::int, 0,
  'Another patient''s family cannot open Leo''s photos');
select ok((select count(*) from mood_checkins where patient_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') > 0,
  'but reads their own patient''s check-ins');
select pg_temp.reset_role();

select * from finish();
rollback;
