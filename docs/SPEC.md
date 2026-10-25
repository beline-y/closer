# Closer: Product Spec (MVP)

Closer connects hospitalized children and isolated patients with their family, friends, care team and inspiring volunteers, to reduce anxiety and loneliness during a hospital stay. It was inspired by the French association Cheer Up!.

This is a **demo project**. All data is fictional. Real basic security is implemented (RLS on every table, no secrets in the client, dev tools disabled in production). Regulatory work is documented in `COMPLIANCE_NOTES.md`, not built.

## Design principles

1. **Emotionally safe for the patient.** A patient never sees "0 replies", "seen but not answered" or a broken streak. Nudges always end on "Sent! ❤️".
2. **Minimal data.** A patient record holds only a nickname, birth year, interests and timezone. No diagnosis, room number or last name. EXIF is stripped from photos before upload.
3. **Security lives in the database.** Locks, sealed cards and visibility rules are enforced by RLS and SQL functions, not just hidden in the UI.
4. **Usable by kids who read little.** Every action has an icon and a word. Tap targets are at least 56px, the font is large (Atkinson Hyperlegible), and mood uses emoji plus color plus a label.
5. **Volunteers never see who a patient is.** No name, age, photo, avatar, unit, diagnosis, check-in or link to a patient profile. Patients reach volunteers only through anonymized, care-approved content, and only a patient can start a contact request. Enforced by RLS: volunteers have no access to patient tables at all.
6. **Analytics later, at no extra cost.** A content-free `activity_events` log plus a mood time series let us add care team AI analysis later without changing the schema.

## Roles

| Role | Sign-in | Sees |
|---|---|---|
| Patient | patient code + 6-digit PIN (QR prefill is a nice-to-have) | their own space |
| Family & friends | email + password, joins with an invite code | patients they're linked to |
| Care team | email + password; account created by seed or server script (no self-signup) | **only patients they're individually linked to**: mood, activity, meal, note, aggregates |
| Volunteer | email + password, approval required | their own story, the anonymous question pool, care-approved anonymized answers, events, and approved requests (without patient details beyond what the care team shares) |

Guardian consent is required for minors, and one guardian is enough. Adults need no guardian, and their space is active immediately.

## Decisions

- Redeeming an invite creates the link with `status = 'active'`. The status column (`pending` / `active` / `revoked`) is kept for a future approval flow.
- Nudges have no hourly or daily cap. There is a **cooldown per nudge type**, 10 minutes by default and editable by the care team per patient. The button shows the remaining time.
- Alert defaults, editable per patient by the care team: 3 low moods (≤ 2) in a row, no check-in for 2 days, no family contact for 2 days.
- Email: Resend (test mode while in dev). Web push comes after the MVP.
- AI: Mistral, server-side only, for opt-in daily wellbeing observations and personalized connection prompts. See [WELLBEING.md](WELLBEING.md). Care staff review support signals; AI does not diagnose.
- Supabase region: US. Default patient timezone: `America/New_York`.
- Patient devices are personal tablets, so there's no auto sign-out in the MVP.
- **Demo access:** while all data is fictional, the landing page is a role picker (`DEMO_MODE=true` in every environment, production included). Real sign-in is tracked in issue #9.
- **Volunteer contact:** only the patient can ask. Flow: patient taps "I'd like to talk with Maya" → care team approves → guardian approves (minors) → the volunteer receives the request with only what the care team chooses to share → the volunteer accepts or declines → a supervised visit or a moderated, logged exchange scheduled by the care team (Cheer Up! model). No free chat, ever.
- **Patient answers shown to volunteers:** only answers the patient chose to share ("Volunteers can read it, without my name", off by default). They go through a privacy filter (masks names, places, hospital names, emails, phone numbers) **and** need care team approval ("shareable"). The care team sees only those opted-in answers, already masked, in its review queue. Only the approved, masked copy reaches volunteers, in a table with no `patient_id`.
- **Placeholder data:** screens whose feature isn't built yet read typed fixtures from `src/lib/demo-fixtures.ts` (same cast, relative dates). Each feature branch replaces its slice with a real table, RLS and seed. People, patients and links already come from Supabase.
- **Background patients:** Ava (12) and Lucas (7) have no app account and no family linked; only Sarah follows them. They fill the care dashboard and trigger alerts.
- **Meals come from the hospital menu.** For the demo, menus are seeded: a fixed weekly rotation per unit (one menu per weekday), so the patient always has today's dishes. The patient rates each dish (yuck to yum) and optionally how much they ate. Family reads "Lunch: pasta with tomato sauce, Leo loved it" and the "Food today" score. The care team doesn't see dishes or ratings. Post-demo: the care team uploads a photo of the paper menu and image-to-text turns it into dishes (issue "Menu upload with image-to-text (post-demo)"); the care team's Menu page is a "Coming soon" placeholder until then.
- **Streak celebrates, never punishes.** Computed from `mood_checkins` only. Headline = total days connected. One rest day per 7 days keeps the run going. After a break: "Welcome back!", never "you lost your streak". Badges at 3, 7, 14 and 30 days, also shown in the family feed.
- **Reactions:** one per person per check-in (❤️ heart, 🤗 hug, 💪 strong, 😂 laugh), changeable. Family and friends only.
- **Activities are done in the app** (draw, make and snap, quiz, story, challenge with family) and end with a result. The patient chooses: share with family, add to Memories, or keep for themselves. A challenge is revealed side by side only when both are done. The care team only gets completion counts.
- **Question ideas: curated first, Mistral as fallback.** The family gets curated questions it hasn't seen. When none is left, and only with the guardian's AI consent (`wellbeing_permissions`), Mistral writes new ones from an age range and masked interests only (never names, check-ins, notes, journal, answers or health). They are stored in the pool and reused. Without consent, key or Mistral: the oldest curated questions come back.
- **Memories** are shared by the patient's circle only. The care team and volunteers never see them.
- **Cloud-only workflow:** no Docker, no local Supabase. One shared Supabase cloud project (US) is the dev database for every branch preview and for `main`. Migrations go through `supabase db push`, one person at a time. Features are tested on Vercel preview URLs. Production will get its own Supabase project later.

## User stories (MoSCoW)

**Patient:**
- **M:** code + PIN sign-in; 1-tap mood check-in with optional activity, meal, note and photo; nudges with per-type cooldown; open sealed comfort cards and see the archive; question of the day with lock; see family replies and reactions; shared memories album.
- **S:** read-aloud; private journal with per-entry sharing; activities; after answering the question of the day, unlock a volunteer card (their answer + story); ask a volunteer a question (anonymous, filtered); ask to talk with a volunteer (approval flow).
- **C:** grown-up theme for adults.
- **W:** free chat with volunteers (never).

**Family:**
- **M:** join by code; guardian consent; check-in feed with reactions; nudges in-app and by email with quick replies; write comfort cards and get notified when opened; question of the day; patient switcher; memories album (photo, caption, date, tag, reactions, short comments).
- **S:** notification preferences; Mistral question ideas (refresh, choose, edit in a card draft, then explicitly seal; visit-only demo delivery); shared activities; guardian approves volunteer contact requests.
- **C:** web push.

**Care team:**
- **M:** create patient and invite codes per role; revoke links; patient list (7- and 30-day mood trend, last check-in, minutes in app today, family interactions today, "no family contact today"); mood chart; alerts with acknowledgement; per-patient cooldown and thresholds.
- **S:** read journal entries shared with care team; discharge; events (create, edit, see sign-ups); mark patient answers as shareable with volunteers; approve volunteer contact requests; volunteer approve / suspend.
- **C:** validate activities.
- **W:** AI analysis (data model is ready for it).

**Volunteer:**
- **S:** My story (first name, photo, job, short story, passions, dreams, fun fact, languages) with a live preview of the patient's view; answer questions (anonymous patient questions + inspiring question bank), optional photo with no faces of other people; read care-approved anonymized patient answers; join or cancel hospital events; see approved requests and accept or decline.
- **W:** see any patient detail; start a contact; message a patient (never).

**Cross-cutting:**
- **M:** demo role picker; data export (JSON); account deletion; RLS tests.
- **S:** PWA manifest; report button.

## MVP scope

Demo cast, all fictional, same names in every role: **Leo** (patient, 9), **Emma** (mom, guardian), **James** (dad), **Noah** (Leo's best friend from school), **Sarah** (pediatric nurse, care team), **Maya** (volunteer, marine biologist), **Daniel** (volunteer, airline pilot).

1. Foundation: Next.js, Tailwind, shadcn/ui, Supabase SSR clients, role layouts, PWA manifest. ✅
2. Demo access: role picker, silent demo sign-in, demo banner, role routing. ✅ (Real auth and linking: issue #9.)
3. Role shells: navigation and main screens for each role, with friendly empty states.
4. Mood check-in, family feed, reactions, photo upload.
5. Nudges: per-type cooldown, recipient picker, Realtime notifications, email, quick replies.
6. Comfort cards: seal, open once with animation, archive, notify the author.
7. Question of the day from the question bank, with lock until you've answered.
8. Care team dashboard, session tracking, live alerts, settings.
9. Memories: shared album between the patient and their circle.
10. Journal. (Activities are done in the app since `feature/checkin-v2-activities`.)
11. Volunteers: questions, My story, events, requests (with care team approvals).
12. Data export and account deletion.
13. Seed data (2 weeks relative to today, `npm run db:seed`) and pgTAP RLS tests for every feature (`npm run db:test`); lint and typecheck before every commit.

**Post-MVP:** real auth (issue #9), cross-account question/card delivery, web push, grown-up theme.

## Screens

**Shared:** landing with the demo role picker, demo banner with "Switch role" on every page, login, patient login (number pad), join with code, guardian consent, account (export, delete).

**Patient** (phone and tablet; bottom tab bar on phone, side rail on tablet, same order; tabs Today · Connect · Play · Memories · Me):
- Today: greeting, mood of the day (check-in, food score, reactions, streak), today's question (the card opens the full question screen, which has no tab of its own), who's thinking of you, one suggested activity.
- Check-in: five emoji, then optional photo, today's menu dishes to rate (yuck to yum, how much), activities and note, then a celebration with the streak ("Connected for 12 days!", badges at 3, 7, 14, 30).
- Connect: five nudge buttons with a cooldown ring, then a recipient picker, then "Sent! ❤️"; replies from family; sealed comfort cards to open (envelope stack, open animation, archive); the creations Leo shared, with the family's reactions, comments and revealed challenges.
- Question (from Today): answer box with emoji chips; "🔒 Mom answered! Answer to see hers". After answering: a volunteer card (answer + story) with "Ask Maya a question" and "I'd like to talk with Maya".
- Play: today's theme at the top, "Continue" for unfinished activities (drafts saved, challenges waiting for family), the library by type (Draw, Make and snap, Quiz, Story time, Challenge with family). Results aren't kept here: after finishing, Leo chooses share with family, add to Memories, or keep for myself.
- Activity: full-screen drawing (finger and stylus, colors, sizes, eraser, undo, clear), make and snap (steps then photo), quiz (5 questions, score), story (write or dictate, autosaved), challenge with family (both draw, reveal side by side).
- Memories: the same album as the family.
- Me (private): "🔒 Only you can see this, unless you share it." Journal (private by default, share one entry), "Kept for myself" (results kept private, with "Share with my family" / "Add to Memories"), "My moods" as a friendly calendar (no charts), badges and streak. Enforced by RLS: drafts and kept results are readable by the patient only; the care team only gets completion counts.

**Family** (phone first, works on desktop; tabs Feed · Question · Cards · Memories, patient switcher in the header):
- Feed: check-ins, nudges pinned on top until answered, opened cards, question reveals, new memories, with reactions. Presence lines ("Leo opened your card", "Leo is waiting for your answer"). The guardian also sees volunteer contact requests to approve.
- Quick actions always visible: reply to a nudge, write a card, answer today's question, add a memory. "Question ideas" button.
- Question: same lock mechanic as the patient.
- Cards: write a card; list of my sealed and opened cards.
- Memories: grid, tap to open, reactions and short comments, add a photo with caption, date and tag (holiday, birthday, pet, school, family, friends, other).

**Volunteer** (phone and desktop; tabs Questions · My story · Events · Requests):
- Questions: "A young explorer asks: …" (anonymous patient questions) and inspiring questions; answer in text with an optional photo; care-approved anonymized patient answers ("A young explorer answered: …").
- My story: editable bio card with a live preview of how a patient sees it.
- Events: list, details, sign up or cancel.
- Requests: approved requests only, with status. No messaging.

**Care team** (desktop first, tablet landscape; sidebar Patients · Alerts · Volunteers · Menu · Events · Settings):
- Menu: placeholder card "Upload today's menu" with a disabled camera button and a "Coming soon" badge (image-to-text is post-demo). No upload, no storage, no API call.
- Patients: sortable, filterable table (name, 7-day mood sparkline, last check-in, time in app today, family contact today, alert badge).
- Family today, time in app and the family interactions chart all come from `care_engagement()`, the same counts the AI receives, so the table, the charts and the AI summary tell the same story.
- AI summary: when the AI service (Louis's model, run on his laptop for the hackathon) doesn't answer, the last stored summary shows with its date ("Summary from Oct 24, 2:10pm"), or "AI summary unavailable" if none.
- Patient detail: mood chart (7 / 30 days), check-ins (mood, activity, note only; no photos, no dishes), family interactions per day, thresholds (low moods in a row, days without check-in, days without family contact, nudge cooldown).
- Alerts: triggered alerts with "Mark as reviewed".
- Volunteers: list with approve / suspend; answers to review ("Mark as shareable"); contact requests to approve.
- Events: create, edit, see sign-ups.
- Invites: create patient, codes with QR and expiry, links, PIN reset (with real auth, issue #9).

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
| `patient_settings` | nudge_cooldown_minutes = 10 (0–240), low_mood_threshold = 2, low_mood_streak = 3, no_checkin_days = 2, no_family_contact_days = 2, updated_by | Created for every patient by a trigger. Care team of that patient updates. Patient, circle and care team read. Realtime (the cooldown follows live). |
| `patient_links` | patient_id, user_id, role (care_team/family/friend; `volunteer` stays unused: volunteers are never linked to a patient), relationship, is_guardian, status, invite_id | You see your own links. Care team and guardian see all links for the patient. Created only by `redeem_invite()`. |
| `invites` | code_hash, role, is_guardian_invite, max_uses, used_count, expires_at, revoked_at | Care team only. Redeemed via `redeem_invite(code)`, which checks the account type matches the role. |
| `guardian_consents` | guardian_id, consent_version, scopes, granted_at, withdrawn_at | Guardian inserts and withdraws. Guardian and care team read. Never deleted. |
| `mood_checkins` | local_date (set by the database, patient timezone), mood 1–5, activities[] (played, movie, drew, school, visit, treatment, rested, walk), activity_note, note ≤ 280 | Patient writes and edits today's only (until midnight). Family and care team read. Volunteers: none. Unique (patient, day). Realtime. |
| `checkin_photos` | checkin_id (one photo per check-in), patient_id, path | **Patient and family only.** Storage bucket uses the same rule. Photos are resized (max 1600px) and re-encoded to WebP on the device, which strips EXIF and GPS. Realtime. |
| `checkin_reactions` | checkin_id, user_id (one per person), emoji (❤️ 🤗 💪 😂) | Patient and family read; family and friends add, change and remove their own. Realtime. |
| `care_units`, `care_unit_members` | name; unit_id, user_id. `patients.unit_id` | Members and the unit's patients and circles read. Written by seed or admin. |
| `menu_items` | unit_id, menu_date, meal, dish_name, icon, position | Seeded weekly rotation for the demo (the care team's write policy stays for the post-demo upload). The unit's patients and their circle read. Volunteers: none. |
| `meal_ratings` | checkin_id, menu_item_id, patient_id, liking 1–5, amount | Patient rates today's dishes of their unit only. Patient, circle and care team read. Realtime. |
| `nudges` | patient_id, kind (miss_you, call_me, bored, proud, hug) | Created only by `send_nudge(kind, recipients)`: active patient only, per-type cooldown from `patient_settings`, recipients limited to the patient's family and friends (default: all). Patient and recipients read. No care team, no volunteers. Realtime. |
| `nudge_recipients` | nudge_id, user_id, seen_at, reply_emoji (❤️ 📞 🤗 ⭐), reply_text ≤ 140, replied_at | Recipient reads and replies on their own row only. The patient reads every reply (never "no reply"). Realtime. |
| `comfort_cards` | patient_id, author_id, body ≤ 1000, color (sun, coral, sky, lilac), opened_at | Family and friends write for their patient; the author reads their own and can edit or take back while sealed. The patient sees sealed cards through `sealed_cards()` (who and color, never the text) and opens each once with `open_comfort_card()` (first date kept); opened cards are the archive. No care team, no volunteers. Realtime: the author sees "Leo opened your card" live. |
| `question_bank` | text, source (curated / mistral), patient_id (generated ones only), min_age, max_age, tags | 60 curated questions shared by everyone (volunteers excepted); Mistral-generated ones belong to one patient's family. Written only through `next_question_ideas()` / `add_generated_questions()`. |
| `question_suggestions` | patient_id, question_id, suggested_to, suggested_at | What a family already saw: never repeated until the pool runs out, then the oldest curated come back. Circle reads. |
| `daily_questions` | patient_id, local_date, question_id (from `question_bank`) | One per patient per day, created by `todays_question()` (curated questions not used before). Patient and circle read. |
| `question_answers` | daily_question_id, user_id, body ≤ 500, share_with_volunteers (patient only, off by default) | Read your own; others' only once you answered (live reveal via Realtime). No care team, no volunteers: the care team gets only shared answers, names masked, through `answers_to_review()`. |
| `notifications` | user_id, kind, ref_id, read_at, emailed_at | Owner only. Delivered through Realtime. |
| `notification_prefs` | user_id, email_enabled | Owner only. |
| `app_minutes` | patient_id, local_date, minutes, last_seen_at | Written only by `log_app_minute()`: the patient's app pings once a minute while on screen, at most one minute per 50 s. Patient reads own. Care team gets daily totals only through `care_engagement()`. Time inside Closer, not device screen time. |
| `ai_summaries` | patient_id, kind (overview / report), payload, stored_at | The last AI reading per child, shown when the AI service is off. Care team of the child only. |
| `activity_events` | patient_id, actor_kind, event_type | Append-only, no content, trigger-filled. |
| `alert_acks` | alert_type, for_date, acked_by, note | Care team. |

**Dashboard functions:** `care_engagement(pid, days)` returns, per local day, family contacts (replies, reactions, comments, cards, answers and finished challenges by active family and friends, plus a check-in with a visit) and minutes in app. Counts only, care team of the child only. It feeds the patients table, the interactions chart and the AI input (`family_contacts_per_day`). Alerts are computed live from `patient_settings` (care dashboard step).

**Memories:**

| Table | Key columns | RLS |
|---|---|---|
| `memories` | patient_id, author_id, photo_path, caption ≤ 280, taken_on, tag (holiday, birthday, pet, school, family, friends, other) | Patient and circle read and add. Author edits and deletes. **No care team, no volunteer access.** |
| `memory_reactions` | memory_id, user_id, emoji | Patient and circle. |
| `memory_comments` | memory_id, user_id, body ≤ 200 | Patient and circle. Author deletes. |

**Activities:**

| Table | Key columns | RLS |
|---|---|---|
| `activities` | type (draw, make_snap, quiz, story, challenge), title, emoji, instructions, theme, steps[], quiz (jsonb), minutes | Everyone signed in except volunteers reads. Seeded library. |
| `activity_sessions` | patient_id, activity_id, status (started, waiting_partner, completed), result_path, result_text, score, visibility (private/family), in_memories, partner_id, local_date | Patient owns. Circle reads only finished ones shared with family or in Memories. Care team and volunteers: none (`activity_counts()` gives the care team counts only). Realtime. |
| `challenge_entries` | session_id, user_id, result_path, completed_at | Created empty for the partner when the challenge is sent. The partner reads and completes their own; patient and circle see it only once both are done. Realtime. |
| `activity_reactions`, `activity_comments` | session_id, user_id, emoji (one per person) / body ≤ 200 | On shared results only. Circle reacts; patient and circle comment. Realtime. |

**Volunteers.** Volunteers have **no SELECT** on `patients`, patient `profiles`, `patient_links`, `mood_checkins`, `journal_entries`, `memories`, `comfort_cards`, `nudges` or any patient-keyed table. Everything they can read lives in tables with **no `patient_id`**:

| Table | Key columns | RLS |
|---|---|---|
| `volunteer_profiles` | user_id, first_name, photo_path, job, story, passions[], dreams, fun_fact, languages[], status (pending/approved/suspended) | Volunteer edits their own. Patients, circle and care team read approved ones. Care team approves or suspends. |
| `volunteer_questions` | text, source (bank / patient), for_volunteer_id (optional), approved_at | The question pool. No patient_id. Volunteers read approved ones. Patient questions get here only after the privacy filter and care approval. |
| `patient_volunteer_questions` | patient_id, volunteer_id, body, masked_body, status, pool_question_id | Patient-owned original ("Ask Maya a question"). Patient, guardian and care team read. Volunteers: none. |
| `volunteer_answers` | volunteer_id, question_id (pool) or question_bank_id, body ≤ 1000, photo_path (no faces of other people) | Volunteer writes their own. Patients and circle read; a patient sees them after answering the matching question of the day. |
| `shared_answers` | question_bank_id, masked_body, approved_by, approved_at | Anonymized, care-approved copy of a patient answer. **No patient_id.** Volunteers read. Written only by `mark_answer_shareable(answer_id)` (care team), which runs the privacy filter. |
| `contact_requests` | patient_id, volunteer_id, status (pending_care, pending_guardian, sent_to_volunteer, accepted, declined, cancelled), shared_note, scheduled_at | Patient creates (`request_contact()`), care team and guardian approve. Volunteers never read the table: `my_volunteer_requests()` returns only id, status, shared_note and scheduled_at for requests already approved. |
| `events` | title, description, location_label, starts_at, ends_at, capacity, created_by | Care team creates and edits. Volunteers and care team read. |
| `event_signups` | event_id, volunteer_id, status (going / cancelled) | Volunteer signs up and cancels their own. Care team reads sign-ups. |

**Privacy filter** (`private.mask_personal_info(text)`, server-side): masks emails, phone numbers, the names of everyone linked to the patient, known places and hospital names, and capitalized words after "I live in" / "at" etc., replacing them with `[name]`, `[place]`, `[contact]`. For the demo, care team approval is still required on top of it.

**Storage:** private buckets `checkin-photos` (`{patient_id}/{uuid}.webp`), `activity-results` (`{patient_id}/{uuid}.webp`, challenge partner `{patient_id}/{session_id}/partner.webp`, readable only through a row the reader can see), `memories` and `volunteer-photos`, served through signed URLs. Images are resized (max 1600px) and re-encoded on the device, which strips EXIF and GPS.

**Post-MVP tables:** journal_prompts, activity_participations, exchange_messages (moderated, logged), content_reports, moderation_log, ai_generations.

## Build plan

One branch and one Vercel preview per step. Tested on the preview, then merged.

| Step | Branch | Status |
|---|---|---|
| Foundation | `feature/foundation` | ✅ |
| Demo role picker | `feature/demo-roles` | ✅ |
| English personas, SPEC update, RLS tests | `chore/personas` | ✅ |
| Role shells (layout, navigation, main screens) | `feature/role-shells` | ✅ |
| Mood check-in | `feature/mood-checkin` | ✅ |
| Nudges + notifications | `feature/nudges` | ✅ |
| Menus, dish ratings, streak, one reaction, activities | `feature/checkin-v2-activities` | ✅ |
| Comfort cards | `feature/comfort-cards` | ✅ |
| Question of the day | `feature/daily-question` | ✅ |
| Care team real counts, last AI summary, Menu placeholder | `fix/care-real-data` | |
| Care dashboard + alerts | `feature/care-dashboard` | |
| Memories | `feature/memories` | |
| Journal | `feature/journal` | |
| Volunteers: questions, My story, events, requests | `feature/volunteers` | |
| Export, delete, accessibility | `feature/privacy-polish` | |
| Real auth (issue #9) | `feature/auth` | post-demo |
| Menu upload with image-to-text | | post-demo |

Deployment happens only after explicit approval.
