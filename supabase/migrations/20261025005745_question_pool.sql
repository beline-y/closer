-- Question pool for "Question ideas" (family) and, later, the question of the day.
-- Curated questions first; once a family has seen them all, Mistral-generated ones
-- (only with the guardian's AI consent) are stored per patient and reused.
-- Families never get the same idea twice until the pool runs out.

create table public.question_bank (
  id uuid primary key default gen_random_uuid(),
  text text not null check (char_length(text) between 8 and 180),
  source text not null check (source in ('curated', 'mistral')),
  -- Curated questions are shared by everyone; generated ones belong to one patient's family.
  patient_id uuid references public.patients (id) on delete cascade,
  min_age smallint not null default 5,
  max_age smallint not null default 17,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  check ((source = 'curated') = (patient_id is null))
);

create unique index question_bank_text_idx on public.question_bank (coalesce(patient_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(text));

create table public.question_suggestions (
  patient_id uuid not null references public.patients (id) on delete cascade,
  question_id uuid not null references public.question_bank (id) on delete cascade,
  suggested_to uuid references public.profiles (id) on delete set null,
  suggested_at timestamptz not null default now(),
  primary key (patient_id, question_id)
);

-- Age of the patient (from birth year), for picking age-appropriate questions.
create function private.patient_age(p_patient_id uuid)
returns int
language sql stable security definer
set search_path = ''
as $$
  select extract(year from now())::int - p.birth_year from public.patients p where p.id = p_patient_id;
$$;

-- The next ideas for a family member: unused curated questions first, then unused
-- generated ones for this patient. With p_reuse, tops up with the least recently suggested.
-- Also says whether AI may be used (guardian consent) and gives the only data AI may see.
create function public.next_question_ideas(p_patient_id uuid, p_count int default 3, p_reuse boolean default false)
returns table (question_id uuid, text text, source text, reused boolean, ai_allowed boolean, age_range text, interests text[])
language plpgsql security definer
set search_path = ''
as $$
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

-- Stores Mistral ideas for this patient's family (only with consent), so they are reused.
create function public.add_generated_questions(p_patient_id uuid, p_questions text[])
returns int
language plpgsql security definer
set search_path = ''
as $$
declare
  v_added int;
begin
  if not private.is_circle(p_patient_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.wellbeing_permissions w where w.patient_id = p_patient_id and w.enabled) then
    raise exception 'AI consent required' using errcode = '42501';
  end if;
  insert into public.question_bank (text, source, patient_id)
  select trim(q), 'mistral', p_patient_id
  from unnest(p_questions[1:5]) as q
  where char_length(trim(q)) between 8 and 180 and trim(q) like '%?'
  on conflict do nothing;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

revoke all on function private.patient_age(uuid) from public, anon;
grant execute on function private.patient_age(uuid) to authenticated;
revoke all on function public.next_question_ideas(uuid, int, boolean), public.add_generated_questions(uuid, text[]) from public, anon;
grant execute on function public.next_question_ideas(uuid, int, boolean), public.add_generated_questions(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- RLS: reads only; writes go through the two functions above.
-- ---------------------------------------------------------------------------
revoke all on public.question_bank, public.question_suggestions from anon, authenticated;
grant select on public.question_bank, public.question_suggestions to authenticated;

alter table public.question_bank enable row level security;
alter table public.question_suggestions enable row level security;

create policy "question_bank: curated for everyone but volunteers, generated for the circle"
  on public.question_bank for select to authenticated
  using (
    (patient_id is null and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_type <> 'volunteer'))
    or (patient_id is not null and private.is_patient_or_circle(patient_id))
  );

create policy "question_suggestions: the circle reads its own"
  on public.question_suggestions for select to authenticated
  using (private.is_circle(patient_id));

-- ---------------------------------------------------------------------------
-- 60 curated questions for kids (7-12 by default), warm and light, never about illness.
-- ---------------------------------------------------------------------------
insert into public.question_bank (text, source, min_age, max_age, tags)
select q, 'curated', 5, 17, t::text[]
from (values
  ('If you could have any animal as a pet, what would it be?', '{animals}'),
  ('What''s the funniest thing that happened to you this week?', '{funny}'),
  ('If you could visit any place in the world, where would you go?', '{travel}'),
  ('What superpower would you choose, and why?', '{imagination}'),
  ('What''s a food you''d eat every day if you could?', '{food}'),
  ('Who is your favorite character in a book or a movie?', '{stories}'),
  ('If you could invent a new holiday, what would we celebrate?', '{imagination}'),
  ('What would your dream treehouse have inside?', '{imagination}'),
  ('Which animal do you think would be the best at soccer?', '{animals,sports}'),
  ('If you were a dinosaur, which one would you be?', '{animals}'),
  ('What''s your favorite sound in the whole world?', '{favorites}'),
  ('If you could talk to one animal, what would you ask it?', '{animals}'),
  ('What''s a song that always makes you want to dance?', '{music}'),
  ('If you could design a new ice cream flavor, what would it taste like?', '{food}'),
  ('What would you name a friendly dragon?', '{imagination}'),
  ('What''s the best present you ever gave someone?', '{memories}'),
  ('If our family had a band, what would it be called?', '{family,music}'),
  ('What''s your favorite thing to draw?', '{art}'),
  ('If you could be any size for a day, tiny or giant, which would you pick?', '{imagination}'),
  ('What''s a game you''d like us to play together soon?', '{games,family}'),
  ('Which smell reminds you of home?', '{family}'),
  ('If you could ride any animal, which one would it be?', '{animals}'),
  ('What''s the coolest fact you know?', '{science}'),
  ('If you had a robot helper, what would you ask it to do first?', '{imagination}'),
  ('What''s your favorite memory from a holiday?', '{memories}'),
  ('If you could swim with any sea creature, which one would you choose?', '{animals,ocean}'),
  ('What would be on the menu at your own restaurant?', '{food}'),
  ('What''s something that always makes you laugh?', '{funny}'),
  ('If you could live inside a video game or cartoon, which one would it be?', '{stories}'),
  ('What''s your favorite season, and what do you love about it?', '{favorites}'),
  ('If you could build anything out of Lego, what would you build?', '{art}'),
  ('What''s a word you think sounds really funny?', '{funny}'),
  ('If you could have dinner with any famous person, who would it be?', '{imagination}'),
  ('What would your perfect Saturday look like?', '{favorites}'),
  ('Which planet would you visit first if you were an astronaut?', '{space}'),
  ('If you could change the color of the sky, what color would you choose?', '{imagination}'),
  ('What''s something new you''d like to learn?', '{learning}'),
  ('If you made a movie, what would it be about?', '{stories}'),
  ('What''s your favorite joke?', '{funny}'),
  ('If you could have any job for one day, what would it be?', '{dreams}'),
  ('Which would you rather be: a pirate, a wizard, or an explorer?', '{imagination}'),
  ('What''s the bravest animal you can think of?', '{animals}'),
  ('If you could make one rule for the whole world, what would it be?', '{imagination}'),
  ('What''s a nice thing someone did for you that you still remember?', '{memories}'),
  ('If you found a treasure chest, what would you hope is inside?', '{imagination}'),
  ('What''s your favorite thing about our family?', '{family}'),
  ('If you could teleport anywhere right now, where would you go?', '{travel}'),
  ('Which sport would you invent, and what are the rules?', '{sports}'),
  ('What''s your favorite kind of weather?', '{favorites}'),
  ('If your toys came alive at night, what would they do?', '{imagination}'),
  ('What would you put in a time capsule for the future?', '{imagination}'),
  ('If you could paint your room any way you like, how would it look?', '{art}'),
  ('What''s the most beautiful place you''ve ever seen?', '{memories}'),
  ('Which animal sound can you do best?', '{animals,funny}'),
  ('If you could grow any plant in a magic garden, what would grow?', '{nature}'),
  ('What would you like to do together when we see each other next?', '{family}'),
  ('If you wrote a book about yourself, what would the title be?', '{stories}'),
  ('What''s a dream you remember?', '{dreams}'),
  ('If you could have a picnic anywhere, where would it be?', '{food,nature}'),
  ('What makes a really good friend?', '{friends}')
) as c(q, t)
on conflict do nothing;
