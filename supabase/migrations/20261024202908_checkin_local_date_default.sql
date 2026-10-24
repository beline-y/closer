-- local_date is always set by the mood_checkins_local_date trigger (patient's today).
-- A default makes that explicit for clients and generated types: inserts never send it.
alter table public.mood_checkins alter column local_date set default current_date;
