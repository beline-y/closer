# Question ideas and notification previews

## Question ideas

Family screens and the card composer have an **AI question ideas** button. Opening it asks
Mistral for three generic conversation starters. **New ideas with Mistral** makes another
provider request and excludes the previous batch. Loading, failure and missing-configuration
states are visible; a fixed list is never presented as freshly generated AI content.

Choosing an idea opens the existing card composer with an editable draft. In the composer,
another idea is appended to the current text so edits are preserved. Selecting an idea never
submits the card. Only the explicit **Seal card for Leo** button changes the demo card list.
Cards still use the existing visit-only demo state; this change does not add cross-account
delivery or replace the question-of-the-day answer/lock flow.

Question generation uses only generic topic instructions and the previous generated questions.
No patient check-ins, names, private answers or card drafts are sent. The server action requires
a signed-in family account linked to an active patient. Mistral JSON is validated, including
three distinct questions and no exact repeats of the previous batch.

## Notification preview

With `DEMO_MODE=true`, the family quick actions and patient home link to **Try AI notification
demo** / **Try my AI invitation**. The preview reads the latest shared check-in from the past
seven local calendar days, including today. The button explicitly explains that shared mood,
activities and note are sent to Mistral; no photos or private content are queried.

The feature is restricted server-side to fictional Leo and his seeded patient/guardian accounts,
with current session/RLS checks and an active guardian link where applicable. It is a fictional
demo exception, not a way to grant or bypass real-patient consent. The server derives the audience
from the authenticated account; a caller cannot request another role's preview.

Mistral selects a grounded connection topic using the existing review validation. Closer's
separate parent and patient templates then produce the invitation. For a shared movie today:

- Parent: “Ask Leo how the film was today. What was their favorite part?”
- Patient: “Want to tell someone your favorite part of the film today?”

The preview shows its audience and source check-in date/activity. Care observations and source
quotes stay server-side. Guardian previews are withheld on a safeguarding flag, and low-mood
signals use the existing gentle support invitation. Provider failure shows an error, not a fake
AI success. Dismissing or refreshing affects only this page.

Previewing does not write reviews, inbox notifications, feedback or consent; it does not invoke
the daily cron. The scheduled job still requires opt-in and processes the previous completed
patient-local day. Outside demo mode these preview controls are absent and the action rejects calls.
No migration is required.

Both AI actions have a small per-process three-second request guard for the public demo. This
is not a distributed quota; use shared rate limiting before expanding beyond the fictional demo.

## Validation

- `npm run check`, `npm test`, and `npm run build`.
- Browser: generate and refresh questions; select one and verify the card count is unchanged;
  edit the text; seal explicitly and verify the edited text appears in the demo list.
- Browser: preview as Emma and Leo against the latest shared check-in. Check different audience
  labels and wording, current-day timing, unchanged daily consent and no added inbox messages.
- In-memory database fixtures explicitly use UTC so their UTC patient dates work after midnight
  UTC even on a machine in another timezone.
