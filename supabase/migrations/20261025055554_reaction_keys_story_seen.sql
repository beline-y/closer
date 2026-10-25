-- Keys instead of emoji characters (emoji render differently on every platform; the UI
-- now draws its own icons). Additive: the emoji columns stay, and a trigger keeps both in
-- sync, so code that still writes emoji keeps working. A later migration can drop them.
-- Plus story_seen: which "thinking of you" stories the patient has already opened.

create function private.reaction_key(p_emoji text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_emoji
    when '❤️' then 'heart' when '🤗' then 'hug' when '💪' then 'strong'
    when '😂' then 'laugh' when '⭐' then 'star' when '📞' then 'call'
  end;
$$;

create function private.reaction_emoji(p_key text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_key
    when 'heart' then '❤️' when 'hug' then '🤗' when 'strong' then '💪'
    when 'laugh' then '😂' when 'star' then '⭐' when 'call' then '📞'
  end;
$$;

-- Writes the emoji from the key, or the key from the emoji (old code), whichever changed.
create function private.sync_reaction_key()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_key text := to_jsonb(new) ->> tg_argv[0];
  v_emoji text := to_jsonb(new) ->> tg_argv[1];
  v_old_key text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> tg_argv[0] end;
  v_old_emoji text := case when tg_op = 'UPDATE' then to_jsonb(old) ->> tg_argv[1] end;
begin
  if v_key is not null and (tg_op = 'INSERT' or v_key is distinct from v_old_key) then
    v_emoji := private.reaction_emoji(v_key);
  elsif tg_op = 'INSERT' or v_emoji is distinct from v_old_emoji then
    v_key := private.reaction_key(v_emoji);
  end if;
  return jsonb_populate_record(new, jsonb_build_object(tg_argv[0], v_key, tg_argv[1], v_emoji));
end;
$$;

-- Check-in reactions: heart, hug, strong, laugh
alter table public.checkin_reactions add column kind text check (kind in ('heart', 'hug', 'strong', 'laugh'));
update public.checkin_reactions set kind = private.reaction_key(emoji);
alter table public.checkin_reactions alter column kind set not null;
create trigger checkin_reactions_sync_key before insert or update on public.checkin_reactions
  for each row execute function private.sync_reaction_key('kind', 'emoji');
grant insert (kind), update (kind) on public.checkin_reactions to authenticated;

-- Reactions to activity results: heart, hug, strong, laugh
alter table public.activity_reactions add column kind text check (kind in ('heart', 'hug', 'strong', 'laugh'));
update public.activity_reactions set kind = private.reaction_key(emoji);
alter table public.activity_reactions alter column kind set not null;
create trigger activity_reactions_sync_key before insert or update on public.activity_reactions
  for each row execute function private.sync_reaction_key('kind', 'emoji');
grant insert (kind), update (kind) on public.activity_reactions to authenticated;

-- Replies to a nudge: heart, call, hug, star (null until the family member replies)
alter table public.nudge_recipients add column reply_kind text check (reply_kind in ('heart', 'call', 'hug', 'star'));
update public.nudge_recipients set reply_kind = private.reaction_key(reply_emoji) where reply_emoji is not null;
create trigger nudge_recipients_sync_key before insert or update on public.nudge_recipients
  for each row execute function private.sync_reaction_key('reply_kind', 'reply_emoji');
grant update (reply_kind) on public.nudge_recipients to authenticated;

-- ---------------------------------------------------------------------------
-- Stories the patient has opened ("reply:<nudge>:<user>", "card:<id>", ...). Own rows only.
-- ---------------------------------------------------------------------------
create table public.story_seen (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  item_key text not null check (char_length(item_key) between 1 and 120),
  seen_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

revoke all on public.story_seen from anon, authenticated;
grant select, insert (item_key), delete on public.story_seen to authenticated;
alter table public.story_seen enable row level security;

create policy "story_seen: read own"
  on public.story_seen for select to authenticated
  using (user_id = (select auth.uid()));

create policy "story_seen: add own"
  on public.story_seen for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "story_seen: remove own"
  on public.story_seen for delete to authenticated
  using (user_id = (select auth.uid()));
