# Closer: Product Spec (MVP)

Closer connects hospitalized children and isolated patients with their family, friends and care team, to reduce anxiety and loneliness during a hospital stay. It was inspired by the French association Cheer Up!.

This is a **demo project**. All data is fictional. Real basic security is implemented (RLS on every table, no secrets in the client, dev tools disabled in production). Regulatory work is documented in `COMPLIANCE_NOTES.md`, not built.

## Design principles

1. **Emotionally safe for the patient.** A patient never sees "0 replies", "seen but not answered" or a broken streak. Nudges always end on "Sent! ❤️".
2. **Minimal data.** A patient record holds only a nickname, birth year, interests and timezone. No diagnosis, room number or last name. EXIF is stripped from photos before upload.
3. **Security lives in the database.** Locks, sealed cards and visibility rules are enforced by RLS and SQL functions, not just hidden in the UI.
4. **Usable by kids who read little.** Every action has an icon and a word. Tap targets are at least 56px, the font is large (Atkinson Hyperlegible), and mood uses emoji plus color plus a label.
5. **Analytics later, at no extra cost.** A content-free `activity_events` log plus a mood time series let us add care team AI analysis later without changing the schema.

## Roles

| Role | Sign-in | Sees |
|---|---|---|
| Patient | patient code + 6-digit PIN (QR prefill is a nice-to-have) | their own space |
| Family & friends | email + password, joins with an invite code | patients they're linked to |
| Care team | email + password; account created by seed or server script (no self-signup) | **only patients they're individually linked to**: mood, activity, meal, note, aggregates |
| Volunteer (post-MVP) | email + password, approval required | nothing patient-related until an approved, moderated exchange |

Guardian consent is required for minors, and one guardian is enough. Adults need no guardian, and their space is active immediately.

## Decisions

- Redeeming an invite creates the link with `status = 'active'`. The status column (`pending` / `active` / `revoked`) is kept for a future approval flow.
- Nudges have no hourly or daily cap. There is a **cooldown per nudge type**, 10 minutes by default and editable by the care team per patient. The button shows the remaining time.
- Alert defaults, editable per patient by the care team: 3 low moods (≤ 2) in a row, no check-in for 2 days, no family contact for 2 days.
- Email: Resend (test mode while in dev). Web push comes after the MVP.
- AI: Anthropic Claude, via a server-side route only (post-MVP).
- Supabase region: US. Default patient timezone: `America/New_York`.
- Patient devices are personal tablets, so there's no auto sign-out in the MVP.
- **Cloud-only workflow:** no Docker, no local Supabase. One shared Supabase cloud project (US) is the dev database for every branch preview and for `main`. Migrations go through `supabase db push`, one person at a time. Features are tested on Vercel preview URLs. Production will get its own Supabase project later.

## User stories (MoSCoW)

**Patient:**
- **M:** code + PIN sign-in; 1-tap mood check-in with optional activity, meal, note and photo; nudges with per-type cooldown; open sealed comfort cards and see the archive; question of the day with lock; see family replies and reactions.
- **S:** read-aloud; memories; private journal with per-entry sharing; activities.
- **C:** unlock volunteer stories; request a moderated volunteer exchange; grown-up theme for adults.
- **W:** free chat with volunteers (never).

**Family:**
- **M:** join by code; guardian consent; check-in feed with reactions; nudges in-app and by email with quick replies; write comfort cards and get notified when opened; question of the day; patient switcher.
- **S:** notification preferences; AI question suggestions; memories; shared activities.
- **C:** web push.

**Care team:**
- **M:** create patient and invite codes per role; revoke links; patient list (7- and 30-day mood trend, last check-in, minutes in app today, family interactions today, "no family contact today"); mood chart; alerts with acknowledgement; per-patient cooldown and thresholds.
- **S:** read journal entries shared with care team; discharge.
- **C:** volunteer approval and moderation; validate activities.
- **W:** AI analysis (data model is ready for it).

**Cross-cutting:**
- **M:** dev-only demo role switcher; data export (JSON); account deletion; RLS tests.
- **S:** PWA manifest; report button.

## MVP scope

Demo cast, all fictional: **Léo** (patient, 9), **Camille** (mom, guardian), **Sam** (older brother), **Nurse Inès** (care team), **Maya** (second patient, adult, used to show alerts), **Jordan** (approved volunteer, seeded for later phases).

1. Foundation: Next.js, Tailwind, shadcn/ui, Supabase SSR clients, role layouts, PWA manifest.
2. Auth and linking: care team creates patients and invite codes; code redemption; guardian consent; role routing; patient code + PIN.
3. Mood check-in, family feed, reactions, photo upload.
4. Nudges: per-type cooldown, recipient picker, Realtime notifications, email to the local inbox, quick replies.
5. Comfort cards: seal, open once with animation, archive, notify the author.
6. Question of the day from the question bank, with lock until you've answered.
7. Care team dashboard, session tracking, live alerts, settings.
8. Data export and account deletion.
9. Seed data (2 weeks relative to today, applied with `npm run db:seed`) and a role switcher on previews only.
10. pgTAP RLS tests for every feature; lint and typecheck before every commit.

**Post-MVP, in order:** memories, journal, activities, AI question suggestions, volunteers and moderation, web push, grown-up theme.

## Screens

**Shared:** landing, login (with the dev role switcher), patient login (number pad), join with code, guardian consent, account (export, delete).

**Patient** (tabs Home · Nudge · Cards · Question):
- Home: four big tiles plus a "From your family" strip.
- Check-in: five emoji, then optional chips, photo and note, then a celebration.
- Nudge: five buttons with a cooldown ring, then a recipient picker, then "Sent! ❤️".
- Cards: envelope stack, then the open animation, then the archive.
- Question: answer box with emoji chips; "🔒 Mom answered! Answer to see hers".

**Family** (tabs Feed · Nudges · Cards · Question, with a patient switcher):
- Feed: check-ins, opened cards and question unlocks, with reactions.
- Nudges: inbox with quick replies.
- Cards: write a card; list of my sealed and opened cards.
- Question: same lock mechanic as the patient.

**Care team** (Patients · Alerts · Invites · Settings):
- Patients: sortable list.
- Patient detail: chart (7 / 30 days), check-ins (no photos), interactions, alerts, settings.
- Alerts: inbox.
- Invites: create patient, codes with QR and expiry, links, PIN reset.

## Data model (MVP)

### Access helpers
These are `security definer` SQL functions in the `private` schema with `search_path = ''`:
- `is_patient_self(pid)`
- `is_circle(pid)`: active family or friend link, and the patient is active. A guardian also passes while consent is pending.
- `is_guardian(pid)`
- `is_care_team(pid)`: active `care_team` link
- `can_view(pid)`: any of the above

### Tables

| Table | Key columns | RLS |
|---|---|---|
| `profiles` | id → auth.users, display_name, avatar_url, account_type | Read your own row and co-linked names. Update your own row; `account_type` is server-only. |
| `patients` | user_id, nickname, birth_year, is_minor, interests[], timezone, status, login_code, created_by | `can_view` reads. Created only by `create_patient()` (care team only), which also creates the settings row and the creator's link. Care team updates; the patient edits interests. |
| `patient_settings` | nudge_cooldown_minutes = 10, low_mood_threshold = 2, low_mood_streak = 3, no_checkin_days = 2, no_family_contact_days = 2 | Care team reads and updates. Patient and family read the cooldown. |
| `patient_links` | patient_id, user_id, role (care_team/family/friend/volunteer), relationship, is_guardian, status, invite_id | You see your own links. Care team and guardian see all links for the patient. Created only by `redeem_invite()`. |
| `invites` | code_hash, role, is_guardian_invite, max_uses, used_count, expires_at, revoked_at | Care team only. Redeemed via `redeem_invite(code)`, which checks the account type matches the role. |
| `guardian_consents` | guardian_id, consent_version, scopes, granted_at, withdrawn_at | Guardian inserts and withdraws. Guardian and care team read. Never deleted. |
| `mood_checkins` | local_date, mood 1–5, activity, meal, note ≤ 280 | Patient writes (same day). Family and care team read. Unique (patient, day). |
| `checkin_photos` | checkin_id, patient_id, path | **Patient and family only.** Storage bucket uses the same rule. |
| `checkin_reactions` | checkin_id, user_id, emoji | Patient and family. |
| `nudges` | patient_id, kind | Created only by `send_nudge()`, which enforces the per-type cooldown. `nudge_cooldowns()` feeds the UI. |
| `nudge_recipients` | nudge_id, user_id, seen_at, reply_emoji, reply_text | Recipient updates their own row. Patient reads. |
| `comfort_cards` | author_id, body ≤ 1000, color, opened_at | Author reads their own. Patient reads only opened cards. `sealed_cards()` and `open_comfort_card()` handle sealed ones. No care team access. |
| `question_bank` | text, min_age, max_age, tags | Anyone signed in reads. |
| `daily_questions` | patient_id, local_date, text, source | Patient and family read. |
| `question_answers` | question_id, user_id, body ≤ 500 | Read your own; others' only after you've answered. No care team access. |
| `notifications` | user_id, kind, ref_id, read_at, emailed_at | Owner only. Delivered through Realtime. |
| `notification_prefs` | user_id, email_enabled | Owner only. |
| `app_sessions` | user_id, patient_id, started_at, last_seen_at | Patient only (60s heartbeat). Care team gets daily totals only. Time inside Closer, not device screen time. |
| `activity_events` | patient_id, actor_kind, event_type | Append-only, no content, trigger-filled. |
| `alert_acks` | alert_type, for_date, acked_by, note | Care team. |

**Dashboard functions:** `care_dashboard()` and `care_checkins(pid, days)`. Alerts are computed live from `patient_settings`.

**Storage:** private bucket `checkin-photos` with paths `{patient_id}/{uuid}.jpg`, served through signed URLs.

**Post-MVP tables:** memories (+ reactions, comments), journal_entries (private by default), journal_prompts, activities, activity_participations, volunteer_profiles, volunteer_answers, volunteer_unlocks, exchange_requests, exchange_messages, content_reports, moderation_log, ai_generations.

## Build plan

| Step | Branch |
|---|---|
| Foundation | `feature/foundation` |
| Auth, roles, invites, consent, seed, demo switcher | `feature/auth-roles` |
| Mood check-in | `feature/mood-checkin` |
| Nudges + notifications | `feature/nudges` |
| Comfort cards | `feature/comfort-cards` |
| Question of the day | `feature/daily-question` |
| Care dashboard + alerts | `feature/care-dashboard` |
| Export, delete, accessibility, README | `feature/privacy-polish` |

Deployment happens only after explicit approval.
