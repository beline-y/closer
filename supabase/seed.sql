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
-- Care unit: Pediatrics (Leo, Ava, Lucas). Sarah writes its menus.
-- ---------------------------------------------------------------------------
delete from public.care_units where id = 'f0000000-0000-4000-8000-000000000001';
insert into public.care_units (id, name) values ('f0000000-0000-4000-8000-000000000001', 'Pediatrics');
insert into public.care_unit_members (unit_id, user_id) values ('f0000000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444');
update public.patients set unit_id = 'f0000000-0000-4000-8000-000000000001'
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');

-- ---------------------------------------------------------------------------
-- Menus: the last two weeks up to today (the rest of this week is empty, so
-- "Copy last week" has something to do). position 0 = main dish, 1 = dessert.
-- ---------------------------------------------------------------------------
insert into public.menu_items (unit_id, menu_date, meal, dish_name, icon, position, created_by)
select 'f0000000-0000-4000-8000-000000000001', (now() at time zone 'America/New_York')::date - d, x.meal::public.meal_kind, x.dish, x.icon, x.pos,
       '44444444-4444-4444-8444-444444444444'
from generate_series(0, 13) as d
cross join lateral (values
  ('breakfast', (array['Oatmeal with banana', 'Yogurt and berries', 'Pancakes', 'Toast and jam', 'Scrambled eggs'])[d % 5 + 1],
                (array['🥣', '🫐', '🥞', '🍞', '🍳'])[d % 5 + 1], 0),
  ('lunch', (array['Pasta with tomato sauce', 'Chicken and rice', 'Veggie soup', 'Fish sticks and peas', 'Turkey sandwich', 'Mac and cheese', 'Pizza slice'])[d % 7 + 1],
            (array['🍝', '🍗', '🥣', '🐟', '🥪', '🧀', '🍕'])[d % 7 + 1], 0),
  ('lunch', (array['Apple compote', 'Chocolate pudding'])[d % 2 + 1], (array['🍎', '🍮'])[d % 2 + 1], 1),
  ('dinner', (array['Chicken soup', 'Pizza night', 'Rice and veggies', 'Meatballs and mash', 'Tacos', 'Shepherd''s pie', 'Pasta bake'])[d % 7 + 1],
             (array['🍲', '🍕', '🍚', '🥔', '🌮', '🥧', '🍝'])[d % 7 + 1], 0),
  ('dinner', (array['Fruit salad', 'Ice cream'])[d % 2 + 1], (array['🍓', '🍨'])[d % 2 + 1], 1),
  ('snack', (array['Apple slices', 'Banana', 'Crackers and cheese', 'Muffin'])[d % 4 + 1], (array['🍎', '🍌', '🧀', '🧁'])[d % 4 + 1], 0)
) as x(meal, dish, icon, pos);

-- ---------------------------------------------------------------------------
-- Mood check-ins: Leo's last two weeks (days relative to today, New York time).
-- No check-in today yet, so the demo starts with Leo doing it live (and day 14
-- of his streak). A few days have a photo (supabase/seed-photos/, uploaded by
-- scripts/seed-photos.mjs). Ava's moods and appetite drop, Lucas skipped 2 days.
-- "meals" = which meals the patient rated, "appetite" = how much they ate.
-- ---------------------------------------------------------------------------
create temporary table demo_checkins (
  patient_id uuid, days_ago int, mood smallint, meals public.meal_kind[], appetite public.meal_amount,
  activities public.activity_kind[], activity_note text, note text, photo text, at time
);

insert into demo_checkins values
  -- Leo
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 13, 4, '{breakfast,lunch}', 'half', '{played}', 'Uno with Sarah', null, null, '09:10'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 12, 4, '{breakfast,lunch,dinner}', 'all', '{movie}', 'Finding Nemo', 'Dory is so funny', null, '08:55'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 11, 3, '{lunch}', 'a_little', '{treatment,rested}', null, 'Tired after the scan', null, '10:20'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 10, 2, '{snack}', 'a_little', '{treatment}', null, 'My tummy hurts', null, '11:05'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 9, 3, '{breakfast,lunch}', 'half', '{rested,movie}', null, null, null, '09:40'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 8, 4, '{breakfast,lunch,dinner}', 'half', '{drew}', 'Dinosaurs!', null, 'trex-drawing', '09:15'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 7, 4, '{breakfast,lunch,snack}', 'all', '{school}', 'Math with the teacher', null, null, '08:50'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 6, 5, '{breakfast,lunch,dinner}', 'all', '{visit,played}', 'Dad came with his guitar', 'Dad played my favorite song!', 'guitar-visit', '09:20'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 5, 4, '{breakfast,lunch}', 'half', '{drew,rested}', null, null, null, '08:55'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 4, 4, '{breakfast,lunch,dinner}', 'all', '{played}', 'Made a paper crown', null, 'board-game', '09:01'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, 3, '{lunch,snack}', 'a_little', '{treatment,rested,school}', 'Wrote a dragon story', 'Tired today', null, '10:05'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 4, '{breakfast,lunch}', 'half', '{walk,drew}', 'Walk in the garden with Mom', null, 'garden-walk', '09:30'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 1, 5, '{breakfast,lunch,dinner}', 'all', '{visit,drew}', 'Noah called on video', 'I drew a whale shark for Noah!', 'whale-shark', '08:47'),
  -- Ava: moods and appetite sliding down
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 9, 4, '{breakfast,lunch}', 'half', '{rested}', null, null, null, '10:00'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 7, 3, '{lunch}', 'half', '{movie}', null, null, null, '10:30'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 5, 3, '{lunch}', 'a_little', '{rested}', null, null, null, '10:10'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, 3, '{lunch}', 'half', '{played}', 'music', null, null, '10:30'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, 2, '{snack}', 'a_little', '{rested}', null, null, null, '09:50'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 2, '{snack}', 'a_little', '{played}', 'music', null, null, '10:15'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 0, 1, '{}', null, '{rested}', null, 'I miss my cat', null, '11:40'),
  -- Lucas: fine, but no check-in for the last 2 days
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 8, 4, '{breakfast,lunch,dinner}', 'all', '{played}', 'lego', null, null, '08:30'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 6, 5, '{breakfast,lunch,dinner}', 'all', '{movie}', 'trains video', null, null, '08:40'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 4, 4, '{breakfast,lunch}', 'half', '{played}', 'lego', null, null, '08:45'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 3, 4, '{breakfast,lunch}', 'all', '{movie}', 'trains video', null, null, '08:45'),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 2, 3, '{lunch}', 'half', '{played}', 'lego', null, null, '08:30');

insert into public.mood_checkins (patient_id, local_date, mood, activities, activity_note, note, created_at, updated_at)
select
  d.patient_id,
  (now() at time zone 'America/New_York')::date - d.days_ago,
  d.mood, d.activities, d.activity_note, d.note,
  (((now() at time zone 'America/New_York')::date - d.days_ago) + d.at) at time zone 'America/New_York',
  (((now() at time zone 'America/New_York')::date - d.days_ago) + d.at) at time zone 'America/New_York'
from demo_checkins d;

insert into public.checkin_photos (checkin_id, patient_id, path)
select c.id, c.patient_id, c.patient_id || '/seed-' || d.photo || '.webp'
from demo_checkins d
join public.mood_checkins c
  on c.patient_id = d.patient_id and c.local_date = (now() at time zone 'America/New_York')::date - d.days_ago
where d.photo is not null;

-- Dish ratings follow the day's mood: favorites are loved, the tummy-ache day is a "yuck".
insert into public.meal_ratings (checkin_id, menu_item_id, patient_id, liking, amount)
select c.id, m.id, c.patient_id,
  case
    when m.dish_name in ('Mac and cheese', 'Pancakes', 'Pizza night', 'Chocolate pudding', 'Ice cream') then 5
    when d.mood <= 2 then 1 + (m.position)
    else least(5, d.mood + m.position)
  end,
  case when m.position = 1 and d.mood >= 4 then 'all'::public.meal_amount else d.appetite end
from demo_checkins d
join public.mood_checkins c
  on c.patient_id = d.patient_id and c.local_date = (now() at time zone 'America/New_York')::date - d.days_ago
join public.patients p on p.id = c.patient_id
join public.menu_items m
  on m.unit_id = p.unit_id and m.menu_date = c.local_date and m.meal = any (d.meals)
 and (m.position = 0 or (m.position = 1 and d.mood >= 4));

-- Emma, James and Noah react to Leo's week (one reaction each per check-in).
insert into public.checkin_reactions (checkin_id, user_id, emoji)
select c.id, r.user_id, r.emoji
from (values
  (12, '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (10, '22222222-2222-4222-8222-222222222222'::uuid, '🤗'),
  (10, '33333333-3333-4333-8333-333333333333'::uuid, '🤗'),
  (8,  '77777777-7777-4777-8777-777777777777'::uuid, '💪'),
  (8,  '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (6,  '33333333-3333-4333-8333-333333333333'::uuid, '❤️'),
  (6,  '22222222-2222-4222-8222-222222222222'::uuid, '😂'),
  (4,  '77777777-7777-4777-8777-777777777777'::uuid, '💪'),
  (3,  '22222222-2222-4222-8222-222222222222'::uuid, '🤗'),
  (2,  '33333333-3333-4333-8333-333333333333'::uuid, '❤️'),
  (1,  '77777777-7777-4777-8777-777777777777'::uuid, '😂'),
  (1,  '22222222-2222-4222-8222-222222222222'::uuid, '❤️'),
  (1,  '33333333-3333-4333-8333-333333333333'::uuid, '💪')
) as r(days_ago, user_id, emoji)
join public.mood_checkins c
  on c.patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
 and c.local_date = (now() at time zone 'America/New_York')::date - r.days_ago;

drop table demo_checkins;

-- ---------------------------------------------------------------------------
-- Nudges: Leo's week, with replies from Emma, James and Noah.
-- Today's "I miss you" is still unanswered by Emma, so it's pinned in her feed.
-- (patient_settings rows are created by a trigger with the defaults.)
-- ---------------------------------------------------------------------------
create temporary table demo_nudges (
  ref int, days_ago int, at time, kind public.nudge_kind
);
insert into demo_nudges values
  (1, 6, '15:10', 'miss_you'),
  (2, 5, '11:30', 'bored'),
  (3, 3, '19:45', 'hug'),
  (4, 2, '16:00', 'proud'),
  (5, 1, '17:20', 'call_me');

create temporary table demo_nudge_ids (ref int, id uuid);

with inserted as (
  insert into public.nudges (patient_id, kind, created_at)
  select 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', d.kind,
         (((now() at time zone 'America/New_York')::date - d.days_ago) + d.at) at time zone 'America/New_York'
  from demo_nudges d
  order by d.ref
  returning id, kind
)
insert into demo_nudge_ids select d.ref, i.id from inserted i join demo_nudges d on d.kind = i.kind;

-- Today, 2 hours ago
insert into public.nudges (patient_id, kind, created_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'miss_you', now() - interval '2 hours');
insert into demo_nudge_ids
select 6, id from public.nudges
where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and created_at > now() - interval '3 hours';

insert into public.nudge_recipients (nudge_id, user_id, seen_at, reply_emoji, reply_text, replied_at)
select n.id, r.user_id,
       case when r.reply_emoji is not null then nu.created_at + r.after end,
       r.reply_emoji, r.reply_text,
       case when r.reply_emoji is not null then nu.created_at + r.after end
from (values
  (1, '22222222-2222-4222-8222-222222222222'::uuid, '❤️', 'Coming tonight with your blanket!', interval '4 minutes'),
  (1, '33333333-3333-4333-8333-333333333333'::uuid, '🤗', null, interval '20 minutes'),
  (2, '77777777-7777-4777-8777-777777777777'::uuid, '📞', 'Calling after school!', interval '2 hours'),
  (3, '22222222-2222-4222-8222-222222222222'::uuid, '🤗', 'The biggest hug in the world', interval '3 minutes'),
  (3, '33333333-3333-4333-8333-333333333333'::uuid, '🤗', null, interval '15 minutes'),
  (4, '22222222-2222-4222-8222-222222222222'::uuid, '⭐', 'So proud of you, champ!', interval '6 minutes'),
  (4, '33333333-3333-4333-8333-333333333333'::uuid, '⭐', null, interval '9 minutes'),
  (4, '77777777-7777-4777-8777-777777777777'::uuid, '⭐', 'You rock!!', interval '40 minutes'),
  (5, '77777777-7777-4777-8777-777777777777'::uuid, '📞', 'Calling in 5!', interval '2 minutes'),
  (6, '22222222-2222-4222-8222-222222222222'::uuid, null, null, null),
  (6, '33333333-3333-4333-8333-333333333333'::uuid, '❤️', 'Love you buddy, see you Saturday', interval '12 minutes')
) as r(ref, user_id, reply_emoji, reply_text, after)
join demo_nudge_ids n on n.ref = r.ref
join public.nudges nu on nu.id = n.id;

drop table demo_nudges;
drop table demo_nudge_ids;

-- ---------------------------------------------------------------------------
-- Activities: a library of 15 across the five types, and Leo's results this week.
-- Result images live in the private bucket activity-results (scripts/seed-photos.mjs).
-- ---------------------------------------------------------------------------
delete from public.activities where id::text like 'a0000000-0000-4000-8000-%';

insert into public.activities (id, type, title, emoji, instructions, theme, steps, quiz, minutes) values
  ('a0000000-0000-4000-8000-000000000001', 'draw', 'My dream house', '🏡', 'What rooms would it have? A slide? A secret room?', 'Draw your dream house', '{}', null, 15),
  ('a0000000-0000-4000-8000-000000000002', 'draw', 'Under the sea', '🐠', 'Fish, whales, coral, a treasure chest… fill the ocean!', 'Draw the ocean and everything living in it', '{}', null, 15),
  ('a0000000-0000-4000-8000-000000000003', 'draw', 'My superhero self', '🦸', 'What is your superpower? What does your costume look like?', 'Draw yourself as a superhero', '{}', null, 15),
  ('a0000000-0000-4000-8000-000000000004', 'draw', 'Dinosaur picnic', '🦕', 'What do dinosaurs bring to a picnic?', 'Draw dinosaurs having a picnic', '{}', null, 15),
  ('a0000000-0000-4000-8000-000000000005', 'make_snap', 'Paper crown', '👑', 'Make a crown fit for a king or queen, then show it off.', null,
    '{"Fold a sheet of paper in half the long way","Cut zigzags along the top edge","Tape the ends so it fits your head","Decorate it with colors or stickers","Put it on and snap a photo!"}', null, 20),
  ('a0000000-0000-4000-8000-000000000006', 'make_snap', 'Origami frog', '🐸', 'A paper frog that really jumps.', null,
    '{"Start with a square of paper","Fold it in half to make a triangle","Fold the corners up to make front legs","Fold the bottom up and back to make the spring","Press its back and watch it jump, then snap it!"}', null, 15),
  ('a0000000-0000-4000-8000-000000000007', 'make_snap', 'Coloring mandala', '🌀', 'Ask a nurse for a coloring sheet, or draw circles inside circles.', null,
    '{"Get a coloring sheet or draw big circles","Pick 3 favorite colors","Color from the middle out","Snap your masterpiece!"}', null, 20),
  ('a0000000-0000-4000-8000-000000000008', 'quiz', 'Animal quiz', '🦁', 'Five questions about amazing animals.', null, '{}',
    '[{"q":"Which animal is the biggest in the world?","options":["Elephant","Blue whale","Giraffe","Shark"],"answer":1,"fact":"A blue whale''s heart is as big as a small car!"},
      {"q":"How many legs does a spider have?","options":["6","8","10","12"],"answer":1,"fact":"Spiders are not insects: insects have 6 legs."},
      {"q":"Which animal can sleep standing up?","options":["Horse","Cat","Dog","Rabbit"],"answer":0,"fact":"Horses lock their legs so they don''t fall over."},
      {"q":"What do pandas mostly eat?","options":["Fish","Bamboo","Bananas","Grass"],"answer":1,"fact":"A panda can eat for 12 hours a day!"},
      {"q":"Which bird can fly backwards?","options":["Eagle","Penguin","Hummingbird","Owl"],"answer":2,"fact":"Hummingbirds flap their wings up to 80 times a second."}]', 5),
  ('a0000000-0000-4000-8000-000000000009', 'quiz', 'Space quiz', '🚀', 'Five questions about planets and stars.', null, '{}',
    '[{"q":"Which planet is closest to the Sun?","options":["Venus","Mars","Mercury","Earth"],"answer":2,"fact":"A year on Mercury is only 88 days."},
      {"q":"What is the Sun?","options":["A planet","A star","A moon","A comet"],"answer":1,"fact":"The Sun is a star, the closest one to us."},
      {"q":"Which planet has big rings?","options":["Saturn","Mars","Earth","Mercury"],"answer":0,"fact":"Saturn''s rings are made of ice and rock."},
      {"q":"Who was the first person on the Moon?","options":["Neil Armstrong","Buzz Lightyear","Yuri Gagarin","Sally Ride"],"answer":0,"fact":"It happened in 1969!"},
      {"q":"What color is Mars?","options":["Blue","Green","Red","Purple"],"answer":2,"fact":"Mars is red because of rusty dust."}]', 5),
  ('a0000000-0000-4000-8000-00000000000a', 'quiz', 'Sports quiz', '⚽', 'Five questions about sports.', null, '{}',
    '[{"q":"How many players does a soccer team have on the field?","options":["9","10","11","12"],"answer":2,"fact":"That includes the goalkeeper."},
      {"q":"In which sport do you do a slam dunk?","options":["Tennis","Basketball","Golf","Swimming"],"answer":1,"fact":"The hoop is 10 feet high."},
      {"q":"What do you call 3 strikes in a row in bowling?","options":["A turkey","A chicken","A goose","A duck"],"answer":0,"fact":"Nobody knows exactly why!"},
      {"q":"How often are the Summer Olympics held?","options":["Every year","Every 2 years","Every 4 years","Every 10 years"],"answer":2,"fact":"The first modern Olympics were in 1896."},
      {"q":"Which sport uses a shuttlecock?","options":["Badminton","Hockey","Rugby","Baseball"],"answer":0,"fact":"A shuttlecock can fly over 300 km/h!"}]', 5),
  ('a0000000-0000-4000-8000-00000000000b', 'story', 'The dragon who was afraid of the dark', '🐉', 'Write or say your story. There is no wrong answer!', 'A dragon who was afraid of the dark', '{}', null, 15),
  ('a0000000-0000-4000-8000-00000000000c', 'story', 'A robot looking for a friend', '🤖', 'Where does the robot look? Who does it meet?', 'A robot looking for a friend', '{}', null, 15),
  ('a0000000-0000-4000-8000-00000000000d', 'story', 'The flying bicycle', '🚲', 'Where would you fly first?', 'One morning, your bicycle could fly…', '{}', null, 15),
  ('a0000000-0000-4000-8000-00000000000e', 'challenge', 'Our next holiday', '🏖️', 'You and someone from your family both draw it. You see each other''s drawings when you''re both done!', 'Draw where we''ll go on our next holiday', '{}', null, 15),
  ('a0000000-0000-4000-8000-00000000000f', 'challenge', 'Our dream pet', '🐾', 'Both draw the pet you''d love to have together. Reveal at the end!', 'Draw our dream pet', '{}', null, 15);

insert into public.activity_sessions (id, patient_id, activity_id, status, result_path, result_text, score, score_total, visibility, in_memories, partner_id, local_date, completed_at, created_at)
select s.id::uuid, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', s.activity::uuid, 'completed', s.path, s.text, s.score, s.total,
       s.visibility::public.activity_visibility, s.memories, s.partner::uuid,
       (now() at time zone 'America/New_York')::date - s.days_ago,
       (((now() at time zone 'America/New_York')::date - s.days_ago) + s.at) at time zone 'America/New_York',
       (((now() at time zone 'America/New_York')::date - s.days_ago) + s.at - interval '20 minutes') at time zone 'America/New_York'
from (values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 1, '15:30'::time, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-act-under-the-sea.webp', null, null::smallint, null::smallint, 'family', true, null),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000001', 5, '16:10'::time, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-act-dream-house.webp', null, null, null, 'private', false, null),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000009', 6, '14:00'::time, null, null, 4, 5, 'family', false, null),
  ('b0000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000005', 4, '15:00'::time, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-act-paper-crown.webp', null, null, null, 'family', true, null),
  ('b0000000-0000-4000-8000-000000000005', 'a0000000-0000-4000-8000-00000000000b', 3, '17:20'::time, null,
     'Once upon a time there was a dragon called Ember who was afraid of the dark. Every night he made his own fire very small so he could see. One night his friend the owl said: the dark is just the sky resting. Ember looked up and saw the stars. Now he is not scared anymore, he counts them until he falls asleep.',
     null, null, 'family', false, null),
  ('b0000000-0000-4000-8000-000000000006', 'a0000000-0000-4000-8000-00000000000e', 2, '18:00'::time, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/seed-act-holiday-leo.webp', null, null, null, 'family', false, '22222222-2222-4222-8222-222222222222')
) as s(id, activity, days_ago, at, path, text, score, total, visibility, memories, partner);

-- Emma's side of the holiday challenge (revealed because both are done).
insert into public.challenge_entries (session_id, user_id, result_path, completed_at)
values ('b0000000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/b0000000-0000-4000-8000-000000000006/partner.webp',
        (((now() at time zone 'America/New_York')::date - 2) + time '20:45') at time zone 'America/New_York');

insert into public.activity_reactions (session_id, user_id, emoji) values
  ('b0000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '❤️'),
  ('b0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', '😂'),
  ('b0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', '💪'),
  ('b0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', '🤗'),
  ('b0000000-0000-4000-8000-000000000004', '33333333-3333-4333-8333-333333333333', '❤️'),
  ('b0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', '❤️'),
  ('b0000000-0000-4000-8000-000000000006', '33333333-3333-4333-8333-333333333333', '❤️');

insert into public.activity_comments (session_id, user_id, body, created_at)
select c.session::uuid, c.user_id::uuid, c.body, now() - c.ago
from (values
  ('b0000000-0000-4000-8000-000000000001', '77777777-7777-4777-8777-777777777777', 'I want to dive with you!', interval '20 hours'),
  ('b0000000-0000-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Future astronaut! 🚀', interval '5 days 20 hours'),
  ('b0000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', 'My king! 👑', interval '3 days 22 hours'),
  ('b0000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Thank you Mom', interval '3 days 21 hours'),
  ('b0000000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', 'I want to read the next chapter!', interval '2 days 20 hours')
) as c(session, user_id, body, ago);

-- ---------------------------------------------------------------------------
-- Comfort cards for Leo: two sealed (Emma, Noah) waiting to be opened, two opened
-- earlier this week (James, Emma) in his archive.
-- ---------------------------------------------------------------------------
insert into public.comfort_cards (patient_id, author_id, body, color, opened_at, created_at) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'My brave little explorer, I''m counting the sleeps until we go to the aquarium together. I love you to the moon and back. Mom',
   'coral', null, now() - interval '1 day'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777',
   'Hi Leo! The whole class made you a giant dinosaur poster. Mrs. Lee says we can bring it soon. Get better fast! Noah',
   'sky', null, now() - interval '5 hours'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333',
   'Hey champ, I''m learning the guitar song you like. Concert in your room on Saturday! Dad',
   'sun', now() - interval '2 days', now() - interval '3 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222',
   'Remember: you are stronger than you think, and you''re never alone. Mom',
   'lilac', now() - interval '5 days', now() - interval '6 days');
