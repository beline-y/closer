-- Applicant messages have no patient identifier. All remain private to their
-- author and care staff, including after approval. No child-facing read policy.
create table public.volunteer_submissions (
  id uuid primary key,
  volunteer_id uuid not null references public.profiles(id) on delete cascade,
  volunteer_name text not null check (char_length(volunteer_name) between 1 and 60),
  kind text not null check (kind in ('event_application', 'question_answer')),
  context_key text not null check (char_length(context_key) between 1 and 100),
  context_label text not null check (char_length(context_label) between 1 and 300),
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  screening_state text not null check (screening_state in ('classified', 'unavailable')),
  categories text[] not null default '{}' check (categories <@ array['aggression','vulgarity','harassment','hate','sexual_content','unsafe_contact']::text[]),
  explanation text not null check (char_length(explanation) between 1 and 400),
  evidence text[] not null default '{}',
  model text,
  prompt_version text not null default 'volunteer-screening-v1',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)),
  check (screening_state <> 'unavailable' or cardinality(categories) = 0)
);
create index volunteer_submissions_author_idx on public.volunteer_submissions(volunteer_id, created_at desc);
create index volunteer_submissions_pending_idx on public.volunteer_submissions(created_at) where status = 'pending';
alter table public.volunteer_submissions enable row level security;
revoke all on public.volunteer_submissions from public, anon, authenticated;
grant select on public.volunteer_submissions to authenticated;
grant all on public.volunteer_submissions to service_role;

create policy "submissions: author or care reads" on public.volunteer_submissions
for select to authenticated using (
  volunteer_id = (select auth.uid())
  or exists (select 1 from public.profiles where id = (select auth.uid()) and account_type = 'care_team')
);
-- Only the authenticated server action can insert a provider classification.
-- Review uses the caller's JWT, never a client-supplied reviewer identity.
create function public.review_volunteer_submission(p_id uuid, p_decision text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.profiles where id = (select auth.uid()) and account_type = 'care_team') then
    raise exception 'Care team access required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approved','rejected') then
    raise exception 'Invalid decision' using errcode = '22023';
  end if;
  update public.volunteer_submissions
  set status = p_decision, reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = p_id and status = 'pending';
  return found;
end;
$$;
revoke all on function public.review_volunteer_submission(uuid,text) from public, anon;
grant execute on function public.review_volunteer_submission(uuid,text) to authenticated;
