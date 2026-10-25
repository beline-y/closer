"use client";

import { useRef, useState, useTransition } from "react";
import { submitVolunteerMessage } from "@/app/volunteer-submission-actions";
import type { VolunteerSubmission } from "@/lib/volunteer-submissions";

export function VolunteerMessageForm({ kind, contextKey, label, onSubmitted }: {
  kind: "event_application" | "question_answer"; contextKey: string; label: string;
  onSubmitted: (submission: VolunteerSubmission) => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  // Retain an id on retries so a lost response cannot create duplicate messages.
  const requestId = useRef<string | null>(null);
  return <form className="flex flex-col gap-4" onSubmit={(e) => {
    e.preventDefault();
    if (pending || !body.trim()) return;
    setError(undefined);
    requestId.current ??= crypto.randomUUID();
    const id = requestId.current;
    startTransition(async () => {
      try {
        const result = await submitVolunteerMessage({ id, kind, contextKey, body });
        if (!result.ok) { setError(result.error); return; }
        onSubmitted(result.submission);
      } catch {
        setError("The connection was interrupted. Your draft is still here; please retry.");
      }
    });
  }}>
    <p className="text-lg font-bold">{label}</p>
    <label className="flex flex-col gap-2 font-bold">
      {kind === "event_application" ? "Why would you like to help?" : "Your answer"}
      <textarea value={body} disabled={pending} onChange={(e) => { setBody(e.target.value); requestId.current = null; }}
        rows={5} maxLength={1000} required className="rounded-2xl border bg-background p-4 text-lg font-normal"
        placeholder={kind === "event_application" ? "Tell the care team what you would bring to this supervised activity…" : "Tell your story in simple words…"} />
    </label>
    <p className="text-sm text-muted-foreground">{body.length}/1,000 · Screened with AI. Reviewed by the care team.</p>
    {error && <p role="alert" className="font-bold text-alert">{error}</p>}
    <button type="submit" disabled={pending || !body.trim()} className="min-h-14 rounded-2xl bg-role-volunteer-ink px-4 text-lg font-extrabold text-white disabled:opacity-50">
      {pending ? "Screening and submitting…" : "Submit to care team"}
    </button>
  </form>;
}

export function MyVolunteerMessages({ submissions }: { submissions: VolunteerSubmission[] }) {
  if (!submissions.length) return null;
  return <section aria-label="Your submitted messages" className="flex flex-col gap-3">
    <h2 className="text-xl font-extrabold">Your submitted messages</h2>
    <ul className="grid gap-3 md:grid-cols-2">{submissions.map((s) => <li key={s.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
      <p className="font-bold">{s.context_label}</p>
      <p className="whitespace-pre-wrap break-words">{s.body}</p>
      <p className="text-sm font-bold">{s.status === "pending" ? "Awaiting care team review" : s.status === "approved" ? "Approved by the care team" : "Not approved by the care team"}</p>
    </li>)}</ul>
  </section>;
}
