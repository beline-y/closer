-- Fix: next_question_ideas' output column "question_id" was ambiguous with the
-- question_suggestions column. Same function, columns resolved to the tables.
create or replace function public.next_question_ideas(p_patient_id uuid, p_count int default 3, p_reuse boolean default false)
returns table (question_id uuid, text text, source text, reused boolean, ai_allowed boolean, age_range text, interests text[])
language plpgsql security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_age int;
  v_count int := least(greatest(coalesce(p_count, 3), 1), 5);
  v_ai boolean;
  v_range text;
  v_interests text[];
begin
  if not private.is_circle(p_patient_id) then
    raise exception 'question ideas are for the patient''s family and friends' using errcode = '42501';
  end if;
  v_age := private.patient_age(p_patient_id);
  select coalesce(w.enabled, false) into v_ai from public.wellbeing_permissions w where w.patient_id = p_patient_id;
  v_range := case when v_age is null then 'child' when v_age < 7 then '4-6' when v_age < 10 then '7-9' when v_age < 13 then '10-12' when v_age < 18 then '13-17' else 'adult' end;
  select p.interests into v_interests from public.patients p where p.id = p_patient_id;

  return query
  with fresh as (
    select b.id, b.text, b.source, false as reused
    from public.question_bank b
    where (b.patient_id is null or b.patient_id = p_patient_id)
      and (v_age is null or v_age between b.min_age and b.max_age)
      and not exists (select 1 from public.question_suggestions s where s.patient_id = p_patient_id and s.question_id = b.id)
    order by (b.source = 'curated') desc, random()
    limit v_count
  ),
  old as (
    select b.id, b.text, b.source, true as reused
    from public.question_suggestions s
    join public.question_bank b on b.id = s.question_id
    where p_reuse and s.patient_id = p_patient_id and b.id not in (select id from fresh)
    order by (b.source = 'curated') desc, s.suggested_at
    limit greatest(v_count - (select count(*) from fresh), 0)
  ),
  picked as (select * from fresh union all select * from old),
  recorded as (
    insert into public.question_suggestions (patient_id, question_id, suggested_to)
    select p_patient_id, id, (select auth.uid()) from picked
    on conflict (patient_id, question_id) do update set suggested_at = now(), suggested_to = excluded.suggested_to
    returning question_id
  )
  select p.id, p.text, p.source, p.reused, coalesce(v_ai, false), v_range, coalesce(v_interests, '{}')
  from picked p
  where p.id in (select question_id from recorded);
end;
$$;
