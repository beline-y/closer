-- Follow-up to reaction_keys_story_seen: let either column be written alone. The trigger
-- always fills the other one, so no row ends up without a key or an emoji.
alter table public.checkin_reactions alter column kind drop not null;
alter table public.checkin_reactions alter column emoji set default '❤️';
alter table public.activity_reactions alter column kind drop not null;
alter table public.activity_reactions alter column emoji set default '❤️';
