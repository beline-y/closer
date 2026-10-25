# Volunteer message screening

Event applications (`/volunteer/events`) now require a short message. Answers on
`/volunteer` use the same submission flow. Server-side Mistral screens for aggression,
vulgarity, harassment, hate, sexual content and unsafe private-contact requests.
It considers meaning and language, including harmless idioms, rather than matching
a banned-word list. The form discloses this processing. Only the submitted text
and public event/question label go to Mistral; no patient records or photos are sent.

Every message stays pending for a human decision, including unflagged messages.
**Care → Volunteers → Applicant messages** defaults to flagged or unverified messages,
with the original text, categories, exact supporting excerpts and a short assessment.
**All awaiting review** includes unflagged messages; **Reviewed messages** preserves
decisions. Refresh loads new messages. No push notification is added.

Missing configuration, timeouts, provider errors, invalid/truncated JSON and invented
evidence become **AI unavailable · Manual review required**, never a clean result.
Mistral does not reject applicants or infer personality or clinical state. Care staff
explicitly approve/reject; the RPC records the authenticated reviewer and timestamp.
A second review cannot overwrite an existing decision.

## Storage and current scope

`volunteer_submissions` has no patient identifier. RLS allows only its author and
care-team accounts to read a row. Clients cannot insert or edit rows directly; the
authenticated, role-checked action inserts provider results using the server key.
The review RPC requires a care-team profile. Children and families cannot read any
submission, even after approval. Retry UUIDs prevent duplicate unchanged messages.
Submission errors preserve the draft and never claim success.

Event/question catalogs, sample bookings, biographies and contact-request controls
still use existing fixtures. Approval records a message decision; it does not publish
an answer to a child, reserve a place, send email, or allow private contact. The care
team arranges approved activities separately. Photos are not supported by this flow.
The three-second request guard is per process, not a distributed abuse quota.
Care staff review the shared volunteer pool; this does not add organization tenancy.

## Rollout

Uses existing server-only `MISTRAL_API_KEY`, optional `MISTRAL_MODEL`, and
`SUPABASE_SECRET_KEY`, plus the existing public Supabase connection settings.
No additional environment variables are needed.

Migration: `20261025011204_volunteer_message_screening.sql`. Types were derived
locally with the existing offline generator. Follow `CONTRIBUTING.md` before pushing
to the shared database: all earlier migrations must arrive through `main`, announce
the push to the team, dry-run, push one at a time, then regenerate linked types.
Ship the migration/types in a small prerequisite PR before feature code. Until the
migration is applied, the UI shows unavailability and preserves unsent drafts.

## Verification

- `npm run check`, `npm test`, `npm run build`.
- In-memory Postgres tests apply actual migrations and check RLS, prohibited writes,
  care-only review, decision persistence and manual review on AI failure.
- `supabase/tests/rls_volunteer_submissions.test.sql` adds linked-project pgTAP checks
  for after the coordinated migration.
- Real Mistral smoke check with seven fictional samples:
  `node --env-file=.env --conditions=react-server --import tsx scripts/volunteer-screening-smoke.mts`.
  Covers a clean offer, harmless idiom, threat, profanity, unsafe contact, French
  aggression and prompt injection. This is not an exhaustive moderation evaluation.
- After rollout: as Maya, apply to Board game afternoon and refresh for persistence.
  As Sarah, review Applicant messages and approve/reject; refresh both roles to check
  the saved decision. Check an unflagged message under All awaiting review. Verify
  Leo/Emma cannot access submissions.
