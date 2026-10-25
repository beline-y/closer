-- RLS tests for nudges, replies and patient settings (cooldown). Everything is rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(22);

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
-- Leo sends nudges through send_nudge() only, with the cooldown
-- ---------------------------------------------------------------------------
select pg_temp.act_as('11111111-1111-4111-8111-111111111111'); -- Leo
select lives_ok($$select send_nudge('hug')$$, 'Leo sends a hug to his whole circle');
select is((select count(*) from nudge_recipients r join nudges n on n.id = r.nudge_id
           where n.kind = 'hug' and n.created_at > now() - interval '1 minute')::int, 3,
  'It reaches Emma, James and Noah');
select throws_ok($$select send_nudge('hug')$$, 'P0001', 'cooldown', 'Same type again within the cooldown is refused');
select lives_ok($$select send_nudge('bored', array['77777777-7777-4777-8777-777777777777']::uuid[])$$, 'Another type, to Noah only, works');
select throws_ok($$select send_nudge('proud', array['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']::uuid[])$$,
  '22023', null, 'Leo cannot nudge the care team or a volunteer');
select throws_ok($$insert into nudges (patient_id, kind) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'call_me')$$,
  '42501', null, 'Nudges cannot be inserted directly (cooldown bypass)');
select ok((select count(*) from nudge_recipients where replied_at is not null) > 0, 'Leo sees the replies to his nudges');
select is((select nudge_cooldown_minutes from patient_settings where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int, 10,
  'Leo reads his cooldown');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Family: own nudges and own reply only
-- ---------------------------------------------------------------------------
select pg_temp.act_as('22222222-2222-4222-8222-222222222222'); -- Emma
select is((select count(*) from nudge_recipients where user_id <> '22222222-2222-4222-8222-222222222222')::int, 0,
  'Emma sees only her own recipient rows');
select ok((select count(*) from nudges where kind = 'hug' and created_at > now() - interval '1 minute') = 1, 'Emma sees the new hug');
select is((select count(*) from nudges where kind = 'bored' and created_at > now() - interval '1 minute')::int, 0,
  'Emma does not see the nudge sent to Noah only');
update nudge_recipients set reply_kind = 'heart', reply_text = 'Coming!', replied_at = now(), seen_at = now()
  where user_id = '22222222-2222-4222-8222-222222222222' and replied_at is null;
select ok((select count(*) from nudge_recipients where user_id = '22222222-2222-4222-8222-222222222222' and reply_text = 'Coming!') > 0,
  'Emma replies');
update nudge_recipients set reply_text = 'hacked' where user_id = '33333333-3333-4333-8333-333333333333';
select throws_ok($$select send_nudge('call_me')$$, '42501', null, 'Emma cannot send a nudge as Leo');
select pg_temp.reset_role();
select is((select count(*) from nudge_recipients where reply_text = 'hacked')::int, 0, 'Emma cannot edit James''s reply');

select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
update patient_settings set nudge_cooldown_minutes = 0, updated_by = '22222222-2222-4222-8222-222222222222'
  where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select pg_temp.reset_role();
select is((select nudge_cooldown_minutes from patient_settings where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int, 10,
  'Emma cannot change the cooldown');

-- ---------------------------------------------------------------------------
-- Care team: edits the cooldown, never reads nudges
-- ---------------------------------------------------------------------------
select pg_temp.act_as('44444444-4444-4444-8444-444444444444'); -- Sarah
select is((select count(*) from nudges)::int, 0, 'Sarah reads no nudges');
select is((select count(*) from nudge_recipients)::int, 0, 'Sarah reads no replies');
update patient_settings set nudge_cooldown_minutes = 0, updated_by = '44444444-4444-4444-8444-444444444444'
  where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
select is((select nudge_cooldown_minutes from patient_settings where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')::int, 0,
  'Sarah sets Leo''s cooldown');
select pg_temp.reset_role();

select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select lives_ok($$select send_nudge('hug')$$, 'With no cooldown, Leo can send the same type again');
select pg_temp.reset_role();

-- ---------------------------------------------------------------------------
-- Volunteers and other families: nothing
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-5555-4555-8555-555555555555'); -- Maya
select is((select count(*) from nudges)::int, 0, 'Maya reads no nudges');
select is((select count(*) from patient_settings)::int, 0, 'Maya reads no patient settings');
select throws_ok($$select send_nudge('hug')$$, '42501', null, 'Maya cannot send nudges');
select pg_temp.reset_role();

select * from finish();
rollback;
