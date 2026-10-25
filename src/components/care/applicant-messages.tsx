"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reviewVolunteerMessage } from "@/app/volunteer-submission-actions";
import { CATEGORY_LABELS, needsAttention, type VolunteerSubmission } from "@/lib/volunteer-submissions";

export function ApplicantMessages({ submissions, loadError }: { submissions: VolunteerSubmission[]; loadError?: string }) {
  const [filter, setFilter] = useState("attention");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const visible = submissions.filter((s) => filter === "history" ? s.status !== "pending"
    : s.status === "pending" && (filter === "all" || needsAttention(s)));
  const review = (id: string, decision: "approved" | "rejected") => {
    setError(undefined);
    startTransition(async () => {
      try {
        const result = await reviewVolunteerMessage(id, decision);
        if (!result.ok) { setError(result.error); return; }
        router.refresh();
      } catch {
        setError("The connection was interrupted. Refresh to check whether your decision was saved.");
      }
    });
  };
  return <div className="flex flex-col gap-4">
    <p className="text-sm text-muted-foreground">Private volunteer applications and answers. Mistral flags language for your review; it does not judge the applicant or make the decision. Approval records your decision here; it does not publish the message or schedule a visit.</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="font-bold">Show <select value={filter} onChange={(e) => setFilter(e.target.value)} className="ml-2 min-h-11 rounded-lg border bg-background px-3">
        <option value="attention">Flagged or screening unavailable</option><option value="all">All awaiting review</option><option value="history">Reviewed messages</option>
      </select></label>
      <button type="button" onClick={() => router.refresh()} className="min-h-11 rounded-lg bg-muted px-4 font-bold">Refresh messages</button>
    </div>
    {(loadError || error) && <p role="alert" className="font-bold text-alert">{loadError || error}</p>}
    {!loadError && visible.length === 0 && <p className="rounded-xl border p-4">No messages in this view.</p>}
    <ul className="flex flex-col gap-3">{visible.map((s) => <li key={s.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div><p className="font-bold">{s.volunteer_name} · {s.kind === "event_application" ? "Event application" : "Question answer"}</p><p className="text-sm text-muted-foreground">{s.context_label}</p></div>
      <div className="flex flex-wrap gap-2">{s.screening_state === "unavailable"
        ? <span className="rounded-full bg-alert-soft px-3 py-1 text-sm font-bold text-alert">AI unavailable · Manual review required</span>
        : s.categories.length ? s.categories.map((c) => <span key={c} className="rounded-full bg-alert-soft px-3 py-1 text-sm font-bold text-alert">{CATEGORY_LABELS[c]}</span>)
        : <span className="rounded-full bg-muted px-3 py-1 text-sm font-bold">No language concern detected</span>}
      </div>
      <blockquote className="whitespace-pre-wrap break-words rounded-xl bg-muted p-4">{s.body}</blockquote>
      <p className="text-sm"><strong>{s.screening_state === "classified" ? "Mistral assessment: " : "Screening status: "}</strong>{s.explanation}</p>
      {s.evidence.length > 0 && <p className="break-words text-sm"><strong>Flagged excerpts: </strong>{s.evidence.map((e) => `“${e}”`).join(" · ")}</p>}
      {s.status === "pending" ? <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} onClick={() => review(s.id, "approved")} className="min-h-11 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-50">Approve message</button>
        <button type="button" disabled={pending} onClick={() => review(s.id, "rejected")} className="min-h-11 rounded-lg bg-muted px-4 font-bold disabled:opacity-50">Reject message</button>
      </div> : <p className="font-bold">{s.status === "approved" ? "Approved" : "Rejected"} · Decision saved</p>}
    </li>)}</ul>
  </div>;
}
