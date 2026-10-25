# Daily wellbeing and little moments

This feature is a fictional demo. It brings shared responses to a human care team's attention;
it cannot determine a child's mental state, diagnose a condition, establish safety, or replace
an evaluation. Daily processing is not emergency monitoring. The child UI always directs a
child who needs help now to a trusted grown-up or their care team.

## What is implemented

- Patients use the existing demo role picker and share one editable check-in per local calendar
  day. The new reviews use the canonical mood, activity selections, activity note and shared note.
  Meal and photo collection, reactions and the live family feed from `main` remain in place.
  Real patient-code login remains a separate planned feature (issue #9).
- Active guardians explicitly opt minors into Mistral processing; adult patients opt themselves in.
  Other relatives, friends, volunteers and care staff cannot give consent on their behalf.
- Each day Mistral reviews up to seven days of opted-in, shared check-ins, with configurable
  low-mood and missing-check-in thresholds. Context starts on the local date of the latest consent
  grant; it includes check-ins from that calendar date. Model input has check-in IDs for evidence
  grounding and approximate age, but no patient/user IDs, nickname, birth year, photos or contact
  details. Private journals, sealed cards and locked question answers are never queried.
- Care staff see tentative observations, exact supporting excerpts, suggested next steps, model
  provenance, rules-only failures and an acknowledgement action. Only individually linked staff
  can read reviews. Deterministic low-mood thresholds cannot be downgraded by the model.
- Guardians receive a generic supportive check-in alert for a concern. Review evidence is not
  copied into notifications. A model-flagged safeguarding concern is delivered only to care staff;
  guardian alerts and connection prompts are withheld. This safeguard depends on model detection
  and is not a substitute for a staffed safeguarding workflow.
- Parents and children receive different connection prompts based on a supported recent activity.
  Example: “Ask Louis how the film was yesterday” versus “Want to tell someone your favorite part
  of the film yesterday?” Low-mood concerns replace activity prompts with an invitation for company.
  Unknown or unsupported activities get a general connection prompt. Timing language is calculated
  from the patient's local date rather than guessed by the model.
- Prompts are capped at one per recipient/patient/review day. Recipients can opt out of connection
  prompts and record “helpful”, “another time”, or “we connected”. Support alerts are separate.
- Notifications are delivered to the in-app inbox via Supabase Realtime with a polling fallback.
  Email, device push, configurable delivery times and quiet hours are not implemented here.

## Activation

1. Coordinate new migrations with the team, as required by CONTRIBUTING.md. Do not run concurrent
   migrations against the shared dev project. `20261024221143_daily_wellbeing.sql` was applied to the
   shared dev project on 2026-10-24 after the user confirmed team coordination. No patient is opted in
   automatically.
2. Run `npx supabase db push --dry-run`, then `npm run db:push`, then `npm run db:types`.
   The checked-in types were regenerated from the linked Supabase project. An offline fallback,
   `npm run db:types:offline`, mirrors migrations using an in-memory schema; the linked Supabase
   generator remains canonical after each coordinated push.
3. Set server-only `SUPABASE_SECRET_KEY`, `MISTRAL_API_KEY`, `MISTRAL_MODEL` (default
   `mistral-small-latest`) and a random `CRON_SECRET`, plus existing public Supabase settings.
   Do not prefix secrets with `NEXT_PUBLIC_`. Pin an evaluated model version before any real-world use.
4. Test on a Vercel preview following the repo workflow, using only fictional accounts. Choose the
   family role (Emma) in the demo picker, enable daily reviews for Leo, then choose Leo and share a
   check-in. The daily review processes the previous completed local date, so today's response is
   reviewed on the next run. Care staff see reviews in `/care/alerts`; family and patient invitations
   are embedded in their existing home screens. Use in-memory fixtures to test historical responses; don't bypass the
   patient-side date restrictions in the shared database.
5. After explicit deployment approval, Vercel production cron invokes
   `GET /api/cron/wellbeing` at **12:00 UTC daily**. It requires
   `Authorization: Bearer <CRON_SECRET>`. Preview deployments do not automatically run the cron.
   An authorized external scheduler can call the same endpoint if needed.

The schedule is one UTC batch; it is not a promise of a particular local delivery hour. Every
patient's review date is their own previous calendar day, including across DST changes. The app
does not read responses from the current day in this daily batch. Concerns raised today must be
handled through the usual care workflow, without waiting for tomorrow's batch.

## Reliability and access

`claim_daily_review` and `complete_daily_review` are executable only by `service_role`. Claims are
unique per patient/day and use a five-minute lease with at most three attempts. Review persistence
and inbox inserts happen in one transaction. Unique notification constraints prevent duplicates
across concurrent invocations or retries. Consent and active links are checked at claim, immediately
before provider access, and at completion. Changing or withdrawing consent while a request is in
flight discards its result. Data already sent before withdrawal cannot be recalled from the provider.

Schema validation rejects malformed, truncated and unsupported model responses. Evidence quotes
must exactly match a shared response from the supplied context. A personalized activity must map to
a supported response on the review date. Model instructions and local validation reduce, but cannot
eliminate, semantic errors or prompt injection. All care conclusions require human review.

A model error produces an explicitly labeled rules-only review, sends an availability notice to care
staff, and leaves the row eligible for bounded retry. Empty context is a separate `no_data` result,
does not call Mistral, and may produce a missing-check-in reminder once the configured interval has
elapsed. Missing check-ins are never labeled as a mental illness.

The endpoint returns aggregate counts only. It returns 503 on an unavailable model review, failed
patient job or a reached runtime budget, so a scheduler can retry and an operator can investigate.
It returns 401 for invalid authorization. Logs and errors omit raw patient text and provider bodies.
Retries cannot overwrite an already delivered notification; the full care review reflects the latest
successful result. A daily job is bounded to 240 seconds and processes patients in pages of 25.
For a larger deployment, add a durable queue with per-patient workers, retries, paging checkpoints,
operator alerts, retention/deletion and audited safeguarding escalation before scaling this demo.

Dashboard reads and actions use the signed-in Supabase client with RLS. Children cannot read
reviews or adult alerts. Notifications are visible only to their recipient while the recipient remains
the patient, an active guardian or linked care staff. Revoked links lose access. Only recipients can
mark their notifications read or provide feedback, and only linked care staff can acknowledge reviews.
Consent withdrawal stops future processing; it does not delete previously produced reviews or inbox
messages. Retention and provider processing terms must be agreed before working with real data.

## Contextual bandit decision

Defer it. The immediate value comes from grounded recent context, gentle templates, explicit
preferences and a daily cap. A contextual bandit learns which action to choose from context and the
observed reward for that action. It needs trustworthy outcomes and enough interactions; there are
neither in a new demo. Optimizing click-through or screen time would also miss this product's goal.

The existing feedback is useful discovery data, not sufficient for unbiased policy evaluation.
If the product grows, consider a bandit only for approved connection topics, format or delivery
windows. Define rewards around voluntarily reported meaningful connection, respect opt-out and
frequency limits, and log the candidate set, policy version and selection probabilities before any
exploration. Evaluate offline and with caregiver/care-team review first. Clinical support thresholds,
safeguarding routes and urgent alerts must never be exploration actions or engagement rewards.

## Verification

`npm test` applies the actual migrations in an in-memory PostgreSQL engine (PGlite) with Supabase-like
roles and auth helpers. It checks RLS, consent, revocation during processing, child/guardian boundaries,
safeguarding routing, opt-out, idempotency and bounded retries, as well as grounded prompts and dates.
Mocked provider checks use no live API keys or real responses. `npm run check` and `npm run build`
validate lint, types and the production bundle. These checks do not replace preview testing against
the real Supabase schema and Supabase Realtime after the coordinated migration push.

`npm run test:wellbeing:live` explicitly calls the configured Mistral model with synthetic movie,
low-mood and priority-support scenarios and validates the results. It never reads patient responses
from Supabase. See [INTEGRATIONS.md](INTEGRATIONS.md) for the verified service links and access needs.

References: [Mistral structured outputs](https://docs.mistral.ai/studio/conversations/structured-output/custom),
[NIMH on evaluation of children's mental health](https://www.nimh.nih.gov/health/publications/children-and-mental-health),
[Vowpal Wabbit contextual bandits](https://vowpalwabbit.org/docs/vowpal_wabbit/python/latest/tutorials/python_Contextual_bandits_and_Vowpal_Wabbit.html).
