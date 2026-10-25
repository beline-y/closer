"use client";

import { useState } from "react";
import { EVENTS } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/kit/modal";
import { MyVolunteerMessages, VolunteerMessageForm } from "@/components/volunteer/message-form";
import type { VolunteerSubmission } from "@/lib/volunteer-submissions";

// The event catalog/bookings are fixtures; application messages persist for review.
export function VolunteerEvents({ me, submissions = [] }: { me: "maya" | "daniel"; submissions?: VolunteerSubmission[] }) {
  const [going, setGoing] = useState<string[]>(EVENTS.filter((e) => e.signups.includes(me)).map((e) => e.id));
  const [applying, setApplying] = useState<(typeof EVENTS)[number] | null>(null);
  const [submitted, setSubmitted] = useState<VolunteerSubmission[]>([]);
  const messages = [...submitted, ...submissions.filter((s) => !submitted.some((n) => n.id === s.id))];

  return (
    <div className="flex flex-col gap-6">
    <p className="text-sm text-muted-foreground">Apply with a short message. Applications are screened and reviewed by the care team before a place is confirmed. Existing sample bookings are for this visit only.</p>
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {EVENTS.map((e) => {
        const isGoing = going.includes(e.id);
        const count = e.signups.filter((s) => s !== me).length + (isGoing ? 1 : 0);
        const full = count >= e.capacity && !isGoing;
        const application = messages.find((s) => s.context_key === e.id && s.status !== "rejected");
        return (
          <li key={e.id} className={cn("flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border", isGoing && "ring-2 ring-role-volunteer")}>
            <div className="flex items-start gap-3">
              <span aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-role-volunteer-soft text-3xl">
                {e.emoji}
              </span>
              <div className="flex flex-col">
                <h2 className="text-xl font-extrabold">{e.title}</h2>
                <p className="font-bold text-role-volunteer-ink">{e.when}</p>
                <p className="text-sm text-muted-foreground">{e.location}</p>
              </div>
            </div>
            <details className="group">
              <summary className="min-h-11 cursor-pointer content-center font-bold">Details</summary>
              <p className="pt-1 text-muted-foreground">{e.description}</p>
            </details>
            <div className="mt-auto flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground tabular-nums">
                {count}/{e.capacity} volunteers
              </span>
              <button
                type="button"
                disabled={full || (!isGoing && !!application)}
                onClick={() => isGoing ? setGoing((g) => g.filter((id) => id !== e.id)) : setApplying(e)}
                className={cn("min-h-12 rounded-full px-5 font-bold disabled:opacity-50", isGoing ? "bg-muted" : "bg-role-volunteer-ink text-white")}
              >
                {isGoing ? "Cancel sample spot" : application ? application.status === "approved" ? "Application approved" : "Awaiting review" : full ? "Full" : "Apply to help"}
              </button>
            </div>
            {isGoing && <p className="text-sm font-bold text-success">✓ Sample booking · saved for this visit only.</p>}
          </li>
        );
      })}
    </ul>
    <MyVolunteerMessages submissions={messages} />
    <Modal open={!!applying} onClose={() => setApplying(null)} title="Apply to help">
      {applying && <VolunteerMessageForm key={applying.id} kind="event_application" contextKey={applying.id} label={applying.title} onSubmitted={(s) => {
        setSubmitted((all) => [s, ...all]); setApplying(null);
      }} />}
    </Modal>
    </div>
  );
}
