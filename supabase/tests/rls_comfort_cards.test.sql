-- Comfort cards: sealed until Leo opens them, each author reads only their own,
-- no care team or volunteers. Baselines allow demo cards to have been opened.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(16);

create temp table card_baseline as
select null::uuid as test_id,
  count(*) filter (where opened_at is null)::int as sealed,
  count(*) filter (where opened_at is not null)::int as opened
from public.comfort_cards where patient_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
grant select on card_baseline to authenticated;

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

-- Emma writes a new card
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select lives_ok($$insert into comfort_cards (patient_id, author_id, body, color) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '22222222-2222-4222-8222-222222222222', 'test card', 'sun')$$,
  'Emma writes a card for Leo');
select throws_ok($$insert into comfort_cards (patient_id, author_id, body) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'as James')$$,
  '42501', null, 'Emma cannot sign a card as James');
select is((select count(*) from comfort_cards where author_id <> '22222222-2222-4222-8222-222222222222')::int, 0, 'Emma reads only her own cards');
select pg_temp.reset_role();

update card_baseline set test_id = (select id from comfort_cards
  where body = 'test card' and author_id = '22222222-2222-4222-8222-222222222222'
  order by created_at desc limit 1);

-- Leo: sealed text is hidden; opening reveals it once and keeps the first date
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select count(*) from sealed_cards())::int, (select sealed + 1 from card_baseline), 'Leo has one more sealed card after the insert');
select is((select count(*) from comfort_cards where opened_at is null)::int, 0, 'Leo cannot read a sealed card''s text');
select is((select count(*) from comfort_cards)::int, (select opened from card_baseline), 'Leo reads only his existing opened archive');
select is((select body from open_comfort_card((select test_id from card_baseline))), 'test card', 'opening returns the text');
create temp table first_open as select opened_at from comfort_cards where body = 'test card';
select is((select count(*) from sealed_cards())::int, (select sealed from card_baseline), 'the opened card leaves the sealed list');
select pg_temp.reset_role();
select pg_temp.act_as('11111111-1111-4111-8111-111111111111');
select is((select opened_at from open_comfort_card((select id from comfort_cards where body = 'test card'))), (select opened_at from first_open),
  'opening again keeps the first opening date');
update comfort_cards set body = 'edited' where body = 'test card';
select pg_temp.reset_role();
select is((select count(*) from comfort_cards where body = 'test card')::int, 1, 'Leo cannot edit a card');

-- Emma sees it was opened, and can no longer change or take it back
select pg_temp.act_as('22222222-2222-4222-8222-222222222222');
select ok((select opened_at is not null from comfort_cards where body = 'test card'), 'Emma sees that Leo opened her card');
delete from comfort_cards where body = 'test card';
select is((select count(*) from comfort_cards where body = 'test card')::int, 1, 'an opened card cannot be taken back');
select pg_temp.reset_role();

-- James cannot open or read Emma's cards; care team and volunteers see nothing
select pg_temp.act_as('33333333-3333-4333-8333-333333333333');
select throws_ok($$select * from open_comfort_card((select id from comfort_cards limit 1))$$, '42501', null, 'James cannot open cards');
select pg_temp.reset_role();
select pg_temp.act_as('44444444-4444-4444-8444-444444444444');
select is((select count(*) from comfort_cards)::int, 0, 'Sarah reads no card');
select is((select count(*) from sealed_cards())::int, 0, 'Sarah gets no sealed list');
select pg_temp.reset_role();
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select is((select count(*) from comfort_cards)::int, 0, 'Maya reads no card');
select pg_temp.reset_role();

select * from finish();
rollback;
