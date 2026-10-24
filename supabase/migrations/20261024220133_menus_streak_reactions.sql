-- Check-in v2: hospital menus set by the care team (per unit), dish ratings by the patient,
-- and one reaction per person per check-in (changeable).

-- ---------------------------------------------------------------------------
-- Care units: the care team writes menus for the units they belong to
-- ---------------------------------------------------------------------------
create table public.care_units (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(name) between 1 and 60),
  created_at timestamptz not null default now()
);

create table public.care_unit_members (
  unit_id uuid not null references public.care_units (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  primary key (unit_id, user_id)
);

alter table public.patients add column unit_id uuid references public.care_units (id) on delete set null;

create function private.is_unit_member(p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.care_unit_members m
    join public.profiles p on p.id = m.user_id
    where m.unit_id = p_unit_id and m.user_id = (select auth.uid()) and p.account_type = 'care_team'
  );
$$;

create function private.patient_unit(p_patient_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select unit_id from public.patients where id = p_patient_id;
$$;

-- Unit members, and the patients of the unit with their circle, may read its menus.
create function private.can_see_unit(p_unit_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.is_unit_member(p_unit_id)
      or exists (
        select 1 from public.patients p
        where p.unit_id = p_unit_id
          and (private.is_patient_self(p.id) or private.is_circle(p.id))
      );
$$;

revoke all on function private.is_unit_member(uuid), private.patient_unit(uuid), private.can_see_unit(uuid) from public, anon;
grant execute on function private.is_unit_member(uuid), private.patient_unit(uuid), private.can_see_unit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Menus and dish ratings
-- ---------------------------------------------------------------------------
create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.care_units (id) on delete cascade,
  menu_date date not null,
  meal public.meal_kind not null,
  dish_name text not null check (char_length(dish_name) between 1 and 60),
  icon text not null default '🍽️' check (char_length(icon) between 1 and 8),
  position smallint not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (unit_id, menu_date, meal, dish_name)
);

create index menu_items_unit_date_idx on public.menu_items (unit_id, menu_date);

create table public.meal_ratings (
  checkin_id uuid not null references public.mood_checkins (id) on delete cascade,
  menu_item_id uuid not null references public.menu_items (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete cascade,
  liking smallint check (liking between 1 and 5),
  amount public.meal_amount,
  created_at timestamptz not null default now(),
  primary key (checkin_id, menu_item_id),
  check (liking is not null or amount is not null)
);

-- A rating belongs to today's check-in of the patient, for a dish of their unit that day.
create function private.is_valid_meal_rating(p_checkin_id uuid, p_menu_item_id uuid, p_patient_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.mood_checkins c
    join public.menu_items m on m.id = p_menu_item_id
    join public.patients p on p.id = c.patient_id
    where c.id = p_checkin_id
      and c.patient_id = p_patient_id
      and c.local_date = private.patient_today(p_patient_id)
      and m.unit_id = p.unit_id
      and m.menu_date = c.local_date
  );
$$;

revoke all on function private.is_valid_meal_rating(uuid, uuid, uuid) from public, anon;
grant execute on function private.is_valid_meal_rating(uuid, uuid, uuid) to authenticated;

-- The menu replaces the free-text meal fields of the check-in.
alter table public.mood_checkins drop column meals, drop column meal_note, drop column meal_amount;

-- ---------------------------------------------------------------------------
-- Reactions: one per person per check-in, changeable. ❤️ heart, 🤗 hug, 💪 strong, 😂 laugh
-- ---------------------------------------------------------------------------
delete from public.checkin_reactions a
  using public.checkin_reactions b
  where a.checkin_id = b.checkin_id and a.user_id = b.user_id and a.created_at < b.created_at;
update public.checkin_reactions set emoji = '❤️' where emoji not in ('❤️', '🤗', '💪', '😂');
alter table public.checkin_reactions drop constraint checkin_reactions_pkey;
alter table public.checkin_reactions add primary key (checkin_id, user_id);
alter table public.checkin_reactions drop constraint checkin_reactions_emoji_check;
alter table public.checkin_reactions add constraint checkin_reactions_emoji_check check (emoji in ('❤️', '🤗', '💪', '😂'));

grant update (emoji) on public.checkin_reactions to authenticated;

create policy "checkin_reactions: change own"
  on public.checkin_reactions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.mood_checkins c where c.id = checkin_id and private.is_circle(c.patient_id))
  );

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.care_units, public.care_unit_members, public.menu_items, public.meal_ratings from anon, authenticated;
grant select on public.care_units, public.care_unit_members to authenticated;
grant select, insert, delete on public.menu_items to authenticated;
grant update (dish_name, icon, position) on public.menu_items to authenticated;
grant select, insert, delete on public.meal_ratings to authenticated;
grant update (liking, amount) on public.meal_ratings to authenticated;

alter table public.care_units enable row level security;
alter table public.care_unit_members enable row level security;
alter table public.menu_items enable row level security;
alter table public.meal_ratings enable row level security;

create policy "care_units: members and the unit's patients read"
  on public.care_units for select to authenticated
  using (private.can_see_unit(id));

create policy "care_unit_members: read own membership"
  on public.care_unit_members for select to authenticated
  using (user_id = (select auth.uid()));

-- Menus: the unit's care team writes; the unit's patients and their circle read.
create policy "menu_items: read if the unit is yours"
  on public.menu_items for select to authenticated
  using (private.can_see_unit(unit_id));

create policy "menu_items: care team adds"
  on public.menu_items for insert to authenticated
  with check (private.is_unit_member(unit_id) and created_by = (select auth.uid()));

create policy "menu_items: care team edits"
  on public.menu_items for update to authenticated
  using (private.is_unit_member(unit_id))
  with check (private.is_unit_member(unit_id));

create policy "menu_items: care team removes"
  on public.menu_items for delete to authenticated
  using (private.is_unit_member(unit_id));

-- Ratings: patient, circle and care team read (appetite); the patient rates today's dishes.
create policy "meal_ratings: read if linked"
  on public.meal_ratings for select to authenticated
  using (private.can_view(patient_id));

create policy "meal_ratings: patient rates today"
  on public.meal_ratings for insert to authenticated
  with check (private.is_patient_self(patient_id) and private.is_valid_meal_rating(checkin_id, menu_item_id, patient_id));

create policy "meal_ratings: patient changes today"
  on public.meal_ratings for update to authenticated
  using (private.is_patient_self(patient_id) and private.is_valid_meal_rating(checkin_id, menu_item_id, patient_id))
  with check (private.is_patient_self(patient_id) and private.is_valid_meal_rating(checkin_id, menu_item_id, patient_id));

create policy "meal_ratings: patient removes today"
  on public.meal_ratings for delete to authenticated
  using (private.is_patient_self(patient_id) and private.is_valid_meal_rating(checkin_id, menu_item_id, patient_id));

alter publication supabase_realtime add table public.meal_ratings;
