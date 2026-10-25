// Native disclosure keeps this demo guide usable without client-side JavaScript.
export function DemoAIGuide() {
  return <details className="rounded-3xl border border-border bg-card p-5 sm:p-6">
    <summary className="min-h-12 cursor-pointer content-center text-lg font-extrabold">AI demo guide</summary>
    <div className="mt-4 flex flex-col gap-5">
      <p className="text-muted-foreground">Use Switch role at the top of the app to follow the same story as Leo, Emma, Sarah and Maya.</p>
      <ol className="flex flex-col gap-4">
        <li className="rounded-2xl bg-role-family-soft p-4">
          <h3 className="font-extrabold">1. A personalized invitation · Emma</h3>
          <p className="mt-1">First, enter as Leo and share today’s check-in, with an activity and a short note. Switch to Emma, choose Try AI notification demo, then Preview a parent notification. Mistral uses the latest shared check-in to suggest a moment together.</p>
          <p className="mt-2 text-sm text-muted-foreground">This is the quickest live AI demo. It previews an invitation without sending or saving it.</p>
        </li>
        <li className="rounded-2xl bg-role-family-soft p-4">
          <h3 className="font-extrabold">2. Questions for a card · Emma</h3>
          <p className="mt-1">Open Question ideas from Emma’s feed or card writer. Choose an idea, edit the draft, then seal the card when you’re ready. Choosing an idea never sends it.</p>
          <p className="mt-2 text-sm text-muted-foreground">The 60 curated questions come first. After those are used, Mistral can create more if the guardian has enabled AI. Generated ideas carry a Made with Mistral (AI) label.</p>
        </li>
        <li className="rounded-2xl bg-role-care-soft p-4">
          <h3 className="font-extrabold">3. Daily wellbeing reviews · Emma → Sarah → Leo</h3>
          <p className="mt-1">In Emma’s feed, find Daily support for Leo, read the consent, and enable daily reviews if you wish. After a scheduled review, switch to Sarah and open Alerts for the summary, supporting excerpts and suggested next step.</p>
          <p className="mt-2 text-sm text-muted-foreground">Reviews use the previous completed day, so enabling them does not generate a review immediately. Delivered prompts appear in Emma’s daily invitations and Leo’s Today page. Leo has no AI-generation button.</p>
        </li>
        <li className="rounded-2xl bg-role-volunteer-soft p-4">
          <h3 className="font-extrabold">4. Volunteer message screening · Maya → Sarah</h3>
          <p className="mt-1">As Maya, open Events and Apply to help, or answer a question. Submit a fictional message. Switch to Sarah, open Volunteers → Applicant messages, and review the assessment and excerpts before approving or rejecting.</p>
          <p className="mt-2 text-sm text-muted-foreground">Flagged messages appear first. Use All awaiting review for unflagged messages and Reviewed messages for saved decisions. AI failures also require manual review; approval here does not send an answer to a child or book a visit.</p>
        </li>
      </ol>
      <p className="text-sm text-muted-foreground">All demo people are fictional. Use invented text. AI suggestions support a human conversation and review; they are not a diagnosis.</p>
    </div>
  </details>;
}
