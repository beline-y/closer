-- Reaction keys: the app writes keys, the emoji column follows (and the other way round
-- for older code). Stories seen: each person reads and writes only their own. Rolled back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(12);

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

create temp table target as
select (select id from mood_checkins where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
          and local_date = private.patient_today('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') - 5) as checkin_id;
delete from checkin_reactions where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222';
delete from activity_reactions where session_id = 'b0000000-0000-4000-8000-000000000003' and user_id = '22222222-2222-4222-8222-222222222222';
update nudge_recipients set reply_emoji = null, reply_kind = null, reply_text = null, replied_at = null
  where user_id = '22222222-2222-4222-8222-222222222222'
    and nudge_id = (select id from nudges where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by created_at desc limit 1);
grant select on target to authenticated;

-- Emma reacts with a key only
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select lives_ok($$insert into checkin_reactions (checkin_id, user_id, kind) values ((select checkin_id from target), '22222222-2222-4222-8222-222222222222', 'hug')$$,
  'Emma reacts with the key "hug"');
select is((select emoji from checkin_reactions where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222'),
  private.reaction_emoji('hug'), 'the emoji column follows the key');
select lives_ok($$update checkin_reactions set kind = 'heart' where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222'$$,
  'Emma changes it to "heart"');
select is((select emoji from checkin_reactions where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222'),
  private.reaction_emoji('heart'), 'the emoji follows the new key');
select throws_ok($$update checkin_reactions set kind = 'wow' where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222'$$,
  '23502', null, 'an unknown key is refused (no emoji for it)');
select pg_temp.reset_role();

-- Older code writing the emoji still sets the key
update checkin_reactions set emoji = private.reaction_emoji('laugh')
  where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222';
select is((select kind from checkin_reactions where checkin_id = (select checkin_id from target) and user_id = '22222222-2222-4222-8222-222222222222'),
  'laugh', 'writing the emoji sets the key');
select is((select count(*) from checkin_reactions where kind is null)::int, 0, 'every check-in reaction has a key');

-- Activity reactions and nudge replies
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
insert into activity_reactions (session_id, user_id, kind) values ('b0000000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'strong');
select is((select emoji from activity_reactions where session_id = 'b0000000-0000-4000-8000-000000000003' and user_id = '22222222-2222-4222-8222-222222222222'),
  private.reaction_emoji('strong'), 'activity reaction: the emoji follows the key');
update nudge_recipients set reply_kind = 'call', reply_text = 'Calling soon', replied_at = now()
  where user_id = '22222222-2222-4222-8222-222222222222'
    and nudge_id = (select id from nudges where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by created_at desc limit 1);
select is((select reply_emoji from nudge_recipients where user_id = '22222222-2222-4222-8222-222222222222'
    and nudge_id = (select id from nudges where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' order by created_at desc limit 1)),
  private.reaction_emoji('call'), 'nudge reply: the emoji follows the key');
select pg_temp.reset_role();

-- Stories seen
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select lives_ok($$insert into story_seen (item_key) values ('card:test')$$, 'Leo marks a story as seen');
select pg_temp.reset_role();
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select is((select count(*) from story_seen where item_key = 'card:test')::int, 0, 'Emma cannot read what Leo has seen');
select throws_ok($$insert into story_seen (user_id, item_key) values ('11111111-1111-4111-8111-111111111111', 'card:fake')$$,
  '42501', null, 'Emma cannot mark a story as seen for Leo');
select pg_temp.reset_role();

select * from finish();
rollback;
