-- Compatibility: main (deployed) still reads and writes the old free-text meal fields,
-- and dev and production share one database. Put them back, empty and unused by the new
-- code, until every environment runs the menu version. Dropped in feature/privacy-polish.
alter table public.mood_checkins
  add column meals public.meal_kind[] not null default '{}',
  add column meal_note text check (char_length(meal_note) <= 120),
  add column meal_amount public.meal_amount;
comment on column public.mood_checkins.meals is 'Deprecated: replaced by meal_ratings + menu_items.';
comment on column public.mood_checkins.meal_note is 'Deprecated: replaced by meal_ratings + menu_items.';
comment on column public.mood_checkins.meal_amount is 'Deprecated: replaced by meal_ratings.';
grant insert (meals, meal_note, meal_amount) on public.mood_checkins to authenticated;
grant update (meals, meal_note, meal_amount) on public.mood_checkins to authenticated;
