# Question ideas and notification previews

The role picker includes an **AI demo guide** with the paths for question ideas,
personalized invitations, daily wellbeing reviews and volunteer message screening.
Use **Switch role** to move between the fictional accounts. No database connection
badge or backend configuration details appear on the picker.

## Question ideas

Emma's feed and card composer have a **Question ideas** button. It serves three ideas
from the curated pool first; **More ideas** requests another batch. After the curated
pool is exhausted, Mistral can generate ideas only with guardian consent. Generated
ideas are labeled **Made with Mistral (AI)**. Without consent or an available provider,
older curated questions can be reused. Curated content is never labeled as AI output.

Choosing an idea opens the existing card composer with an editable draft. In the composer,
another idea is appended to the current text so edits are preserved. Selecting an idea never
submits the card. Only the explicit **Seal card for Leo** button changes the demo card list.
Sealed cards now persist in the existing comfort-card flow and can be opened by Leo.
The question-of-the-day answer/lock flow remains separate.

Question generation uses an age range, masked interests and previously suggested questions.
No names, check-ins, private answers or card drafts are sent. Privacy masking remains
before provider/storage boundaries; any name-mask tokens in returned ideas are displayed
as anonymous natural wording. Access and consent are enforced by the question-pool RPCs.

## Notification preview

With `DEMO_MODE=true`, Emma's quick actions link to **Try AI notification demo**, followed
by **Preview a parent notification**. The preview reads the latest shared check-in from the past
seven local calendar days, including today. Shared mood, activities and note are sent
to Mistral; no photos or private content are queried. The card keeps the invitation
and its audience visible, with technical source details omitted.

The preview control is shown only to the guardian; Leo has no AI-generation button.
The server restricts the demo to fictional Leo and seeded accounts, with session/RLS
checks and an active guardian link where applicable. It is a fictional
demo exception, not a way to grant or bypass real-patient consent. The server derives the audience
from the authenticated account; a caller cannot request another role's preview.

Mistral selects a grounded connection topic using the existing review validation. Closer's
separate parent and patient templates then produce the invitation. For a shared movie today:

- Parent: “Ask Leo how the film was today. What was their favorite part?”
- Patient: “Want to tell someone your favorite part of the film today?”

The preview shows its audience. Source grounding is checked on the server. Care observations and source
quotes stay server-side. Guardian previews are withheld on a safeguarding flag, and low-mood
signals use the existing gentle support invitation. Provider failure shows an error, not a fake
AI success. Dismissing or refreshing affects only this page.

Previewing does not write reviews, inbox notifications, feedback or consent; it does not invoke
the daily cron. The scheduled job still requires opt-in and processes the previous completed
patient-local day. Outside demo mode these preview controls are absent and the action rejects calls.
No migration is required.

Provider calls have small per-process request guards for the fictional demo; these
are not distributed abuse quotas.

## Daily reviews and volunteer screening

For scheduled reviews, Emma can enable **Daily support for Leo** after reading the
consent. The job processes the previous completed patient-local day. Sarah sees the
result under **Alerts**; delivered invitations appear in Emma's feed and Leo's Today
page. Enabling reviews does not trigger an immediate run. See [WELLBEING.md](WELLBEING.md).

As Maya, submit an event application or question answer. As Sarah, open **Volunteers →
Applicant messages**. Flagged and unverified messages appear by default; choose **All
awaiting review** for clean submissions and **Reviewed messages** for saved decisions.
Care staff make the decision. See [VOLUNTEER_SCREENING.md](VOLUNTEER_SCREENING.md).

## Validation

- `npm run check`, `npm test`, and `npm run build`.
- Browser: generate and refresh questions; select one and verify the card count is unchanged;
  edit the text; seal explicitly and verify the edited text appears in the demo list.
- Browser: preview as Emma against the latest shared check-in. Check the parent audience,
  current-day timing, unchanged daily consent and no added inbox messages. Leo has no preview control.
- In-memory database fixtures explicitly use UTC so their UTC patient dates work after midnight
  UTC even on a machine in another timezone.
