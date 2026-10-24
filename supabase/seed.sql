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

-- ---------------------------------------------------------------------------
-- Reset: remove the demo accounts of this and earlier seeds (listed explicitly,
-- so teammates' own test accounts are never touched). Deleting the auth user
-- cascades to identities, profiles and links; demo patients are removed by id.
-- ---------------------------------------------------------------------------
delete from public.patients
  where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

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
   '44444444-4444-4444-8444-444444444444');

-- ---------------------------------------------------------------------------
-- Links around Leo: Emma (mom, guardian), James (dad), Noah (friend), Sarah (care team).
-- Volunteers are never linked to a patient: they only meet patients through
-- approved, moderated requests (see docs/SPEC.md, Volunteers).
-- ---------------------------------------------------------------------------
insert into public.patient_links (patient_id, user_id, role, relationship, is_guardian, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'family',    'Mom',             true,  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'family',    'Dad',             false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '77777777-7777-4777-8777-777777777777', 'friend',    'Best friend',     false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'care_team', 'Pediatric nurse', false, 'active');
