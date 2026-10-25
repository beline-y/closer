-- RLS tests: hospital menus, dish ratings, one reaction per person, activities and the
-- family challenge. Uses the seeded cast and files (npm run db:seed). Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(30);

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
-- Menus: the unit's care team writes; patients and families read
-- ---------------------------------------------------------------------------
select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select lives_ok(
  $$insert into menu_items (unit_id, menu_date, meal, dish_name, icon, created_by)
    values ('f0000000-0000-4000-8000-000000000001', current_date + 1, 'lunch', 'Test lasagna', '🍝', '44444444-4444-4444-8444-444444444444')$$,
  'Sarah adds a dish to her unit''s menu');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select throws_ok(
  $$insert into menu_items (unit_id, menu_date, meal, dish_name, created_by)
    values ('f0000000-0000-4000-8000-000000000001', current_date + 1, 'snack', 'Cookies', '22222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'Emma cannot write the menu');
select ok((select count(*) from menu_items where menu_date = private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) >= 5, 'Emma reads today''s menu');
select pg_temp.reset_role();

select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from menu_items)::int, 0, 'Maya reads no menu');
select is((select count(*) from care_units)::int, 0, 'Maya reads no care unit');
select is((select count(*) from meal_ratings)::int, 0, 'Maya reads no meal rating');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Ratings: Leo rates today's dishes only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
insert into mood_checkins (patient_id, mood, note) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 'rls test');
select lives_ok(
  $$insert into meal_ratings (checkin_id, menu_item_id, patient_id, liking, amount)
    select c.id, m.id, c.patient_id, 5, 'all'
    from mood_checkins c join menu_items m on m.menu_date = c.local_date and m.meal = 'lunch' and m.position = 0
    where c.note = 'rls test'$$,
  'Leo rates today''s lunch');
select throws_ok(
  $$insert into meal_ratings (checkin_id, menu_item_id, patient_id, liking)
    select c.id, m.id, c.patient_id, 1
    from mood_checkins c join menu_items m on m.menu_date = c.local_date - 1 and m.meal = 'lunch' and m.position = 0
    where c.note = 'rls test'$$,
  '42501', null, 'Leo cannot rate a dish from another day');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select ok((select count(*) from meal_ratings where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') > 10, 'Sarah reads Leo''s ratings (appetite)');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Reactions: one per person per check-in, changeable; care team cannot react
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select lives_ok($$insert into checkin_reactions (checkin_id, user_id, emoji) select id, '22222222-2222-4222-8222-222222222222', '❤️' from mood_checkins where note = 'rls test'$$,
  'Emma reacts to Leo''s mood');
select throws_ok($$insert into checkin_reactions (checkin_id, user_id, emoji) select id, '22222222-2222-4222-8222-222222222222', '🤗' from mood_checkins where note = 'rls test'$$,
  '23505', null, 'Only one reaction per person');
update checkin_reactions set emoji = '🤗' where user_id = '22222222-2222-4222-8222-222222222222' and checkin_id = (select id from mood_checkins where note = 'rls test');
select is((select emoji from checkin_reactions where user_id = '22222222-2222-4222-8222-222222222222' and checkin_id = (select id from mood_checkins where note = 'rls test')), '🤗',
  'Emma changes her reaction');
select pg_temp.reset_role();

select pg_temp.act_as('33333333-3333-4333-8333-333333333333'); -- James
select throws_ok($$insert into checkin_reactions (checkin_id, user_id, emoji) select id, '33333333-3333-4333-8333-333333333333', '⭐' from mood_checkins where note = 'rls test'$$,
  '23514', null, 'Only heart, hug, strong and laugh');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select throws_ok($$insert into checkin_reactions (checkin_id, user_id, emoji) select id, '44444444-4444-4444-8444-444444444444', '❤️' from mood_checkins where note = 'rls test'$$,
  '42501', null, 'Sarah cannot react');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Activities: Leo owns results; family reads shared ones; care team gets counts only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
select is((select count(*) from activity_sessions)::int, 6, 'Leo sees all his results, private ones too');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select is((select count(*) from activity_sessions)::int, 5, 'Emma sees only shared results (not the private dream house)');
select is((select count(*) from storage.objects where bucket_id = 'activity-results' and name like '%dream-house%')::int, 0, 'Emma cannot open the private drawing');
select is((select count(*) from storage.objects where bucket_id = 'activity-results' and name like '%under-the-sea%')::int, 1, 'Emma opens a shared drawing');
select pg_temp.reset_role();

select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select is((select count(*) from activity_sessions)::int, 0, 'Sarah reads no activity content');
select is((select count(*) from storage.objects where bucket_id = 'activity-results')::int, 0, 'Sarah opens no activity file');
select ok((select sum(completed) from activity_counts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 14)) = 6, 'Sarah gets completion counts');
select pg_temp.reset_role();

select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from activity_sessions)::int, 0, 'Maya reads no results');
select is((select count(*) from activities)::int, 0, 'Maya reads no activity library');
select throws_ok($$select * from activity_counts('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$$, '42501', null, 'Maya gets no counts');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Challenge: hidden until both are done
-- ---------------------------------------------------------------------------
create temp table challenge (id uuid);
grant all on challenge to authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
with started as (
  insert into activity_sessions (patient_id, activity_id, status, result_path, visibility, partner_id)
  values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-00000000000f', 'waiting_partner',
          'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-act-holiday-leo.webp', 'family', '33333333-3333-4333-8333-333333333333')
  returning id
)
insert into challenge select id from started;
select throws_ok(
  $$insert into activity_sessions (patient_id, activity_id, status, partner_id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'a0000000-0000-4000-8000-00000000000f', 'waiting_partner', '44444444-4444-4444-8444-444444444444')$$,
  '42501', null, 'Leo cannot challenge the care team');
select pg_temp.reset_role();

select pg_temp.act_as('33333333-3333-4333-8333-333333333333'); -- James, the partner
select is((select count(*) from my_pending_challenges())::int, 1, 'James sees the challenge waiting for him');
select is((select count(*) from activity_sessions where id = (select id from challenge))::int, 0, 'James cannot see Leo''s drawing before finishing his');
select is((select count(*) from challenge_entries where session_id = (select id from challenge) and completed_at is null)::int, 1,
  'James gets his (empty) side of the challenge right away');
update challenge_entries set result_text = 'A dog called Rocket', completed_at = now()
  where session_id = (select id from challenge) and user_id = '33333333-3333-4333-8333-333333333333';
select is((select count(*) from activity_sessions where id = (select id from challenge))::int, 1, 'Once both are done, James sees Leo''s side');
select pg_temp.reset_role();

select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select is((select count(*) from challenge_entries where session_id = (select id from challenge))::int, 1, 'and the family sees the reveal');
select pg_temp.reset_role();

select * from finish();
rollback;
