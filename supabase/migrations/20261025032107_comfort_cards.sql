-- Comfort cards: family and friends write sealed cards in advance; the patient opens each
-- one once (the body stays hidden until then); the author is told live when it's opened.
-- Opened cards form an archive the patient can reread. No care team, no volunteers.

create type public.card_color as enum ('sun', 'coral', 'sky', 'lilac');

create table public.comfort_cards (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1000),
  color public.card_color not null default 'coral',
  opened_at timestamptz,
  created_at timestamptz not null default now()
);

create index comfort_cards_patient_idx on public.comfort_cards (patient_id, opened_at);
create index comfort_cards_author_idx on public.comfort_cards (author_id, created_at desc);

-- Sealed cards for the patient: who and which color, never the text.
create function public.sealed_cards()
returns table (id uuid, author_id uuid, color public.card_color, created_at timestamptz)
language sql stable security definer
set search_path = ''
as $$
  select c.id, c.author_id, c.color, c.created_at
  from public.comfort_cards c
  join public.patients p on p.id = c.patient_id
  where p.user_id = (select auth.uid()) and c.opened_at is null
  order by c.created_at;
$$;

-- Opens a card (once: the first opening date is kept) and returns its text.
create function public.open_comfort_card(p_card_id uuid)
returns table (id uuid, author_id uuid, color public.card_color, body text, opened_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.comfort_cards c join public.patients p on p.id = c.patient_id
    where c.id = p_card_id and p.user_id = (select auth.uid())
  ) then
    raise exception 'only the patient can open their cards' using errcode = '42501';
  end if;
  update public.comfort_cards c set opened_at = coalesce(c.opened_at, now()) where c.id = p_card_id;
  return query select c.id, c.author_id, c.color, c.body, c.opened_at from public.comfort_cards c where c.id = p_card_id;
end;
$$;

revoke all on function public.sealed_cards(), public.open_comfort_card(uuid) from public, anon;
grant execute on function public.sealed_cards(), public.open_comfort_card(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges + RLS
-- ---------------------------------------------------------------------------
revoke all on public.comfort_cards from anon, authenticated;
grant select, delete on public.comfort_cards to authenticated;
grant insert (patient_id, author_id, body, color) on public.comfort_cards to authenticated;
grant update (body, color) on public.comfort_cards to authenticated;

alter table public.comfort_cards enable row level security;

-- The author always reads their own cards (and sees when they were opened).
create policy "comfort_cards: author reads own"
  on public.comfort_cards for select to authenticated
  using (author_id = (select auth.uid()));

-- The patient reads a card only once opened (sealed ones go through sealed_cards()).
create policy "comfort_cards: patient reads opened"
  on public.comfort_cards for select to authenticated
  using (opened_at is not null and private.is_patient_self(patient_id));

create policy "comfort_cards: circle writes for their patient"
  on public.comfort_cards for insert to authenticated
  with check (author_id = (select auth.uid()) and private.is_circle(patient_id));

-- Until opened, the author can still edit or take back a card.
create policy "comfort_cards: author edits sealed"
  on public.comfort_cards for update to authenticated
  using (author_id = (select auth.uid()) and opened_at is null)
  with check (author_id = (select auth.uid()) and opened_at is null);

create policy "comfort_cards: author removes sealed"
  on public.comfort_cards for delete to authenticated
  using (author_id = (select auth.uid()) and opened_at is null);

-- The author is told live when the card is opened (Realtime applies the same RLS).
alter publication supabase_realtime add table public.comfort_cards;
