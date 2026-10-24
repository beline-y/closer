-- When the patient sends a challenge, create the family member's (empty) entry right away.
-- It is their own row, so Realtime tells them live, without revealing the patient's side.
create function private.invite_challenge_partner()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if new.status = 'waiting_partner' and new.partner_id is not null then
    insert into public.challenge_entries (session_id, user_id) values (new.id, new.partner_id)
    on conflict (session_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function private.invite_challenge_partner() from public, anon, authenticated;

create trigger activity_sessions_invite_partner after insert on public.activity_sessions
  for each row execute function private.invite_challenge_partner();
