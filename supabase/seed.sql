-- Demo seed for the shared dev project.
-- EVERYTHING HERE IS FICTIONAL. Never put real patient data in this file.
-- Emails use example.com (reserved for documentation, never delivers mail).
-- Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Auth users
--   Adults:   password CloserDemo2026!
--   Patients: password = their 6-digit PIN (see README)
-- ---------------------------------------------------------------------------
with demo_users (id, email, password, display_name) as (
  values
    ('11111111-1111-4111-8111-111111111111'::uuid, 'leo.patient@example.com',   '135790',          'Léo'),
    ('22222222-2222-4222-8222-222222222222'::uuid, 'camille@example.com',       'CloserDemo2026!', 'Camille'),
    ('33333333-3333-4333-8333-333333333333'::uuid, 'sam@example.com',           'CloserDemo2026!', 'Sam'),
    ('44444444-4444-4444-8444-444444444444'::uuid, 'ines.nurse@example.com',    'CloserDemo2026!', 'Nurse Inès'),
    ('55555555-5555-4555-8555-555555555555'::uuid, 'maya.patient@example.com',  '246802',          'Maya'),
    ('66666666-6666-4666-8666-666666666666'::uuid, 'jordan.volunteer@example.com', 'CloserDemo2026!', 'Jordan')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt(u.password, extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  jsonb_build_object('display_name', u.display_name), now(), now(),
  '', '', '', ''
from demo_users u
on conflict (id) do nothing;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select
  u.id::text, u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', now(), now(), now()
from auth.users u
where u.id in (
  '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
  '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'
)
on conflict (provider_id, provider) do nothing;

-- Profiles are created by the on_auth_user_created trigger as 'family'.
-- Set the privileged account types here (only seed and server code can do this).
update public.profiles set account_type = 'patient'
  where id in ('11111111-1111-4111-8111-111111111111', '55555555-5555-4555-8555-555555555555');
update public.profiles set account_type = 'care_team'
  where id = '44444444-4444-4444-8444-444444444444';
update public.profiles set account_type = 'volunteer'
  where id = '66666666-6666-4666-8666-666666666666';

-- Mirror account_type into app_metadata so it lands in the JWT. src/proxy.ts reads it
-- to send each role to its dashboard. Users can't edit app_metadata, only the server can.
update auth.users u
  set raw_app_meta_data = u.raw_app_meta_data || jsonb_build_object('account_type', p.account_type)
  from public.profiles p
  where p.id = u.id
    and u.id in (
      '11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444',
      '55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666'
    );

-- ---------------------------------------------------------------------------
-- Patients
-- ---------------------------------------------------------------------------
insert into public.patients (id, user_id, nickname, birth_year, is_minor, interests, status, login_code, created_by)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
   'Léo', 2017, true, array['dinosaurs', 'soccer', 'drawing'], 'active', 'LEO123',
   '44444444-4444-4444-8444-444444444444'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '55555555-5555-4555-8555-555555555555',
   'Maya', 1992, false, array['podcasts', 'gardening'], 'active', 'MAYA42',
   '44444444-4444-4444-8444-444444444444')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Links
--   Léo:  Camille (mom, guardian), Sam (brother), Nurse Inès (care team)
--   Maya: Nurse Inès only (no family: shows the "no family contact" alert later)
-- ---------------------------------------------------------------------------
insert into public.patient_links (patient_id, user_id, role, relationship, is_guardian, status)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'family',    'Mom',     true,  'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'family',    'Brother', false, 'active'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '44444444-4444-4444-8444-444444444444', 'care_team', 'Nurse',   false, 'active'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '44444444-4444-4444-8444-444444444444', 'care_team', 'Nurse',   false, 'active')
on conflict (patient_id, user_id) do nothing;
