begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

insert into public.volunteer_submissions(id,volunteer_id,volunteer_name,kind,context_key,context_label,body,screening_state,categories,explanation,evidence)
values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','55555555-5555-4555-8555-555555555555','Maya','event_application','ev-1','Board games','Fictional flagged message','classified','{aggression}','Fictional screening result.','{"Fictional flagged message"}');

set local role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-4555-8555-555555555555',true);
select is((select count(*) from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')::int,1,'Volunteer reads own submission');
select throws_ok($$update public.volunteer_submissions set status='approved'$$,'42501',null,'Volunteer cannot approve directly');
select throws_ok($$select public.review_volunteer_submission('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','approved')$$,'42501',null,'Volunteer cannot call review RPC');

select set_config('request.jwt.claim.sub','66666666-6666-4666-8666-666666666666',true);
select is((select count(*) from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')::int,0,'Other volunteer sees nothing');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*) from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')::int,0,'Child sees nothing');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select count(*) from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')::int,0,'Parent sees nothing');

select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select is((select count(*) from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')::int,1,'Care team sees submission');
select is(public.review_volunteer_submission('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','rejected'),true,'Care team records rejection');
select is(public.review_volunteer_submission('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','approved'),false,'Later review cannot overwrite decision');
select is((select reviewed_by from public.volunteer_submissions where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'),'44444444-4444-4444-8444-444444444444'::uuid,'Reviewer comes from authenticated session');
select * from finish();
rollback;
