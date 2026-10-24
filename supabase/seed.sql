-- Demo seed for the shared dev project.
-- EVERYTHING HERE IS FICTIONAL. Never put real patient data in this file.
-- Emails use example.com (reserved for documentation, never delivers mail).
-- Safe to run more than once: it resets the demo cast and their data each time.
--
-- Demo cast (same names in every role):
--   Leo, 9 ..... patient
--   Emma ....... mom, guardian of Leo
--   James ...... dad
--   Noah ....... Leo's best friend from school
--   Sarah ...... pediatric nurse (care team)
--   Maya ....... volunteer, marine biologist
--   Daniel ..... volunteer, airline pilot
--   Ava, 12 and Lucas, 7: background patients only Sarah follows (fill the care dashboard)

-- ---------------------------------------------------------------------------
-- Reset: remove the demo accounts of this and earlier seeds (listed explicitly,
-- so teammates' own test accounts are never touched). Deleting the auth user
-- cascades to identities, profiles and links; demo patients are removed by id.
-- ---------------------------------------------------------------------------
delete from public.patients
  where id in (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  );

delete from auth.users
  where id in (
    '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
    '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666',
    '77777777-7777-4777-8777-777777777777'
  )
  or email in (
    -- first cast (renamed)
    'camille@example.com', 'sam@example.com', 'ines.nurse@example.com',
    'maya.patient@example.com', 'jordan.volunteer@example.com',
    -- current cast
    'leo.patient@example.com', 'emma@example.com', 'james@example.com', 'noah@example.com',
    'sarah.nurse@example.com', 'maya.volunteer@example.com', 'daniel.volunteer@example.com'
  );

-- ---------------------------------------------------------------------------
-- Auth users
--   Adults and Noah: password CloserDemo2026!
--   Leo:             password = 6-digit PIN (see README)
-- account_type is mirrored into app_metadata so it lands in the JWT: src/proxy.ts
-- reads it to send each role to its dashboard. Users can't edit app_metadata.
-- ---------------------------------------------------------------------------
create temporary table demo_users (
  id uuid primary key,
  email text not null,
  password text not null,
  display_name text not null,
  account_type public.account_type not null
);

insert into demo_users values
  ('11111111-1111-4111-8111-111111111111', 'leo.patient@example.com',      '135790',          'Leo',    'patient'),
  ('22222222-2222-4222-8222-222222222222', 'emma@example.com',             'CloserDemo2026!', 'Emma',   'family'),
  ('33333333-3333-4333-8333-333333333333', 'james@example.com',            'CloserDemo2026!', 'James',  'family'),
  ('77777777-7777-4777-8777-777777777777', 'noah@example.com',             'CloserDemo2026!', 'Noah',   'family'),
  ('44444444-4444-4444-8444-444444444444', 'sarah.nurse@example.com',      'CloserDemo2026!', 'Sarah',  'care_team'),
  ('55555555-5555-4555-8555-555555555555', 'maya.volunteer@example.com',   'CloserDemo2026!', 'Maya',   'volunteer'),
  ('66666666-6666-4666-8666-666666666666', 'daniel.volunteer@example.com', 'CloserDemo2026!', 'Daniel', 'volunteer');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
  jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'), 'account_type', u.account_type),
  jsonb_build_object('display_name', u.display_name), now(), now(),
  '', '', '', ''
from demo_users u;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from demo_users u;

-- Profiles are created by the on_auth_user_created trigger as 'family'.
-- Set the privileged account types here (only seed and server code can do this).
update public.profiles p
  set account_type = u.account_type
  from demo_users u
  where p.id = u.id and p.account_type is distinct from u.account_type;

drop table demo_users;

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
insert into public.patients (id, user_id, nickname, birth_year, is_minor, interests, status, login_code, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'Leo', 2017, true, array['dinosaurs', 'soccer', 'drawing', 'the ocean'], 'active', 'LEO123',
   '44444444-4444-4444-8444-444444444444'),
  -- Background patients: no app account and no family linked yet.
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', null,
   'Ava', 2014, true, array['music', 'cats'], 'active', null,
   '44444444-4444-4444-8444-444444444444'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', null,
   'Lucas', 2019, true, array['trains', 'lego'], 'active', null,
   '44444444-4444-4444-8444-444444444444');

-- ---------------------------------------------------------------------------
-- Links around Leo: Emma (mom, guardian), James (dad), Noah (friend), Sarah (care team).
-- Sarah also follows Ava and Lucas.
-- Volunteers are never linked to a patient: they only meet patients through
-- approved, moderated requests (see docs/SPEC.md, Volunteers).
-- ---------------------------------------------------------------------------
insert into public.patient_links (patient_id, user_id, role, relationship, is_guardian, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'family',    'Mom',             true,  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'family',    'Dad',             false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', 'friend',    'Best friend',     false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'care_team', 'Pediatric nurse', false, 'active'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '44444444-4444-4444-8444-444444444444', 'care_team', 'Pediatric nurse', false, 'active'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '44444444-4444-4444-8444-444444444444', 'care_team', 'Pediatric nurse', false, 'active');

-- ---------------------------------------------------------------------------
-- Mood check-ins: Leo's last two weeks (days relative to today, New York time).
-- No check-in today yet, so the demo starts with Leo doing it live.
-- A few days have a photo (files in supabase/seed-photos/, uploaded by
-- scripts/seed-photos.mjs). Ava's moods drop, Lucas skipped the last 2 days.
-- ---------------------------------------------------------------------------
create temporary table demo_checkins (
  patient_id uuid, days_ago int, mood smallint, meals public.meal_kind[], meal_amount public.meal_amount,
  meal_note text, activities public.activity_kind[], activity_note text, note text, photo text, at time
);

insert into demo_checkins values
  -- Leo
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 13, 4, '{breakfast,lunch}', 'half', null, '{played}', 'Uno with Sarah', null, null, '09:10'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 12, 4, '{breakfast,lunch,dinner}', 'all', 'pasta with cheese', '{movie}', 'Finding Nemo', 'Dory is so funny', null, '08:55'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 11, 3, '{lunch}', 'a_little', null, '{treatment,rested}', null, 'Tired after the scan', null, '10:20'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 10, 2, '{snack}', 'a_little', 'apple sauce', '{treatment}', null, 'My tummy hurts', null, '11:05'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9, 3, '{breakfast,lunch}', 'half', null, '{rested,movie}', null, null, null, '09:40'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 8, 4, '{breakfast,lunch,dinner}', 'half', null, '{drew}', 'Dinosaurs!', null, 'trex-drawing', '09:15'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7, 4, '{breakfast,lunch,snack}', 'all', 'pancakes!!', '{school}', 'Math with the teacher', null, null, '08:50'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 6, 5, '{breakfast,lunch,dinner}', 'all', null, '{visit,played}', 'Dad came with his guitar', 'Dad played my favorite song!', 'guitar-visit', '09:20'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 4, '{breakfast,lunch}', 'half', null, '{drew,rested}', null, null, null, '08:55'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, 4, '{breakfast,lunch,dinner}', 'all', null, '{played}', 'Board games', null, 'board-game', '09:01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, 3, '{lunch,snack}', 'a_little', null, '{treatment,rested}', null, 'Tired today', null, '10:05'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 4, '{breakfast,lunch}', 'half', null, '{walk}', 'Walk in the garden with Mom', null, 'garden-walk', '09:30'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 5, '{breakfast,lunch,dinner}', 'all', 'pizza night', '{visit,drew}', 'Noah called on video', 'I drew a whale shark for Noah!', 'whale-shark', '08:47'),
  -- Ava: moods sliding down
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 9, 4, '{breakfast,lunch}', 'half', null, '{rested}', null, null, null, '10:00'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 7, 3, '{lunch}', 'half', null, '{movie}', null, null, null, '10:30'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 5, 3, '{lunch}', 'a_little', null, '{rested}', null, null, null, '10:10'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, 3, '{lunch}', 'half', null, '{played}', 'music', null, null, '10:30'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, 2, '{snack}', 'a_little', null, '{rested}', null, null, null, '09:50'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 2, '{snack}', 'a_little', null, '{played}', 'music', null, null, '10:15'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0, 1, '{}', null, null, '{rested}', null, 'I miss my cat', null, '11:40'),
  -- Lucas: fine, but no check-in for the last 2 days
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 8, 4, '{breakfast,lunch,dinner}', 'all', null, '{played}', 'lego', null, null, '08:30'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 6, 5, '{breakfast,lunch,dinner}', 'all', null, '{movie}', 'trains video', null, null, '08:40'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 4, 4, '{breakfast,lunch}', 'half', null, '{played}', 'lego', null, null, '08:45'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 3, 4, '{breakfast,lunch}', 'all', null, '{movie}', 'trains video', null, null, '08:45'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 2, 3, '{lunch}', 'half', null, '{played}', 'lego', null, null, '08:30');

insert into public.mood_checkins (patient_id, local_date, mood, meals, meal_amount, meal_note, activities, activity_note, note, created_at, updated_at)
select
  d.patient_id,
  (now() at time zone 'America/New_York')::date - d.days_ago,
  d.mood, d.meals, d.meal_amount, d.meal_note, d.activities, d.activity_note, d.note,
  (((now() at time zone 'America/New_York')::date - d.days_ago) + d.at) at time zone 'America/New_York',
  (((now() at time zone 'America/New_York')::date - d.days_ago) + d.at) at time zone 'America/New_York'
from demo_checkins d;

insert into public.checkin_photos (checkin_id, patient_id, path)
select c.id, c.patient_id, c.patient_id || '/seed-' || d.photo || '.webp'
from demo_checkins d
join public.mood_checkins c
  on c.patient_id = d.patient_id and c.local_date = (now() at time zone 'America/New_York')::date - d.days_ago
where d.photo is not null;

-- Emma, James and Noah react to Leo's week.
insert into public.checkin_reactions (checkin_id, user_id, emoji)
select c.id, r.user_id, r.emoji
from (values
  (12, '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (10, '22222222-2222-4222-8222-222222222222'::uuid, '🤗'),
  (10, '33333333-3333-4333-8333-333333333333'::uuid, '🤗'),
  (8,  '77777777-7777-4777-8777-777777777777'::uuid, '⭐'),
  (8,  '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (6,  '33333333-3333-4333-8333-333333333333'::uuid, '❤️'),
  (6,  '22222222-2222-4222-8222-222222222222'::uuid, '😂'),
  (4,  '77777777-7777-4777-8777-777777777777'::uuid, '💪'),
  (3,  '22222222-2222-4222-8222-222222222222'::uuid, '🤗'),
  (2,  '33333333-3333-4333-8333-333333333333'::uuid, '❤️'),
  (1,  '77777777-7777-4777-8777-777777777777'::uuid, '😂'),
  (1,  '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (1,  '33333333-3333-4333-8333-333333333333'::uuid, '⭐')
) as r(days_ago, user_id, emoji)
join public.mood_checkins c
  on c.patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and c.local_date = (now() at time zone 'America/New_York')::date - r.days_ago;

drop table demo_checkins;
