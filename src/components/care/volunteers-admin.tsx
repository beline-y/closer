"use client";

import { type ReactNode, useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { castByPatientId } from "@/lib/cast";
import { relativeDay } from "@/lib/dates";
import { CONTACT_REQUEST_LABELS, CONTACT_REQUESTS, type ContactRequestStatus, VOLUNTEER_ROSTER, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";
import { ApplicantMessages } from "@/components/care/applicant-messages";
import { needsAttention, type VolunteerSubmission } from "@/lib/volunteer-submissions";

const TABS = ["Volunteers", "Matches", "Applicant messages", "Answers to review", "Contact requests"] as const;

// Highlights what the privacy filter masked, so the reviewer sees it at a glance.
function Masked({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\[[a-z]+\])/g).map((part, i) =>
        /^\[[a-z]+\]$/.test(part) ? (
          <mark key={i} className="rounded bg-role-care-soft px-1 font-bold text-role-care-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

// Applicant messages persist through Supabase. The other tabs retain their
// existing visit-only examples for approvals, patient answers and contacts.
/** Answers Leo chose to share, masked by the database (answers_to_review()). */
export type AnswerToReview = { id: string; patientId: string; question: string; masked: string; daysAgo: number };

export function VolunteersAdmin({
  submissions = [],
  loadError,
  answers = [],
  matches,
}: {
  submissions?: VolunteerSubmission[];
  loadError?: string;
  answers?: AnswerToReview[];
  /** The AI matching board, rendered on the server */
  matches?: ReactNode;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Volunteers");
  const [status, setStatus] = useState<Record<string, "approved" | "suspended">>(() => Object.fromEntries(VOLUNTEER_ROSTER.map((v) => [v.id, "approved"])));
  const [reviewed, setReviewed] = useState<Record<string, "shared" | "private">>({});
  const [requests, setRequests] = useState(CONTACT_REQUESTS);
  const setRequest = (id: string, s: ContactRequestStatus) => setRequests((all) => all.map((r) => (r.id === id ? { ...r, status: s } : r)));
  const toReview = answers.filter((a) => !reviewed[a.id]).length;
  const pending = requests.filter((r) => r.status === "pending_care").length;

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Volunteers" className="flex gap-1 overflow-x-auto border-b">
        {TABS.map((t) => {
          const count = t === "Applicant messages" ? submissions.filter((s) => s.status === "pending" && needsAttention(s)).length : t === "Answers to review" ? toReview : t === "Contact requests" ? pending : 0;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn("-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 font-bold whitespace-nowrap", tab === t ? "border-role-care-ink text-foreground" : "border-transparent text-muted-foreground")}
            >
              {t}
              {count > 0 && <span className="rounded-full bg-alert-soft px-2 text-sm text-alert">{count}</span>}
            </button>
          );
        })}
      </div>

      {loadError && tab !== "Applicant messages" && <p role="alert" className="text-sm font-bold text-alert">{loadError}</p>}
      {tab === "Applicant messages" && <section role="tabpanel"><ApplicantMessages submissions={submissions} loadError={loadError} /></section>}
      {tab === "Matches" && <section role="tabpanel">{matches}</section>}

      {tab === "Volunteers" && (
        <ul role="tabpanel" className="grid gap-3 md:grid-cols-2">
          {VOLUNTEER_ROSTER.map((v) => {
            const id = v.id;
            const active = status[id] === "approved";
            return (
              <li key={id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <div className="flex items-center gap-3">
                  <span aria-hidden className="flex size-11 items-center justify-center rounded-full bg-role-volunteer-soft text-2xl">
                    {v.avatar}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-bold">{v.firstName}</span>
                    <span className="text-sm text-muted-foreground">{v.job}</span>
                  </div>
                  <span className={cn("ml-auto rounded-full px-2.5 py-0.5 text-sm font-bold", active ? "bg-success-soft text-success" : "bg-alert-soft text-alert")}>
                    {active ? "✓ Approved" : "⏸ Suspended"}
                  </span>
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">{v.story}</p>
                <p className="text-sm">
                  Offers {v.slotsPerWeek} {v.slotsPerWeek === 1 ? "visit" : "visits"} a week · usually ages {v.ages[0]} to {v.ages[1]}
                </p>
                <button
                  type="button"
                  onClick={() => setStatus((s) => ({ ...s, [id]: active ? "suspended" : "approved" }))}
                  className={cn("min-h-11 self-start rounded-lg px-4 font-bold", active ? "bg-muted" : "bg-role-care-ink text-white")}
                >
                  {active ? "Suspend" : "Approve again"}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "Answers to review" && (
        <div role="tabpanel" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Only answers the patient chose to share. The privacy filter already masked names, places, emails and phone numbers. Volunteers see the approved text only, without the patient.
          </p>
          <ul className="flex flex-col gap-3">
            {answers.length === 0 && <li className="text-muted-foreground">No shared answer to review. Leo&apos;s answers stay private unless he shares one.</li>}
            {answers.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
                <p className="text-sm text-muted-foreground">
                  {castByPatientId(a.patientId)?.name} · {a.question} · {relativeDay(a.daysAgo)}
                </p>
                <p className="text-lg">
                  “<Masked text={a.masked} />”
                </p>
                {reviewed[a.id] ? (
                  <p className="font-bold">{reviewed[a.id] === "shared" ? "✓ Shareable: volunteers can read it" : "Kept private"}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setReviewed((r) => ({ ...r, [a.id]: "shared" }))} className="min-h-11 rounded-lg bg-role-care-ink px-4 font-bold text-white">
                      Mark as shareable
                    </button>
                    <button type="button" onClick={() => setReviewed((r) => ({ ...r, [a.id]: "private" }))} className="min-h-11 rounded-lg bg-muted px-4 font-bold">
                      Keep private
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "Contact requests" && (
        <div role="tabpanel" className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Started by the patient only. After you, the guardian approves. The volunteer then gets the request with the note you write, never the patient&apos;s details.</p>
          {requests.length === 0 ? (
            <EmptyState emoji="📭" title="No requests" />
          ) : (
            <ul className="flex flex-col gap-3">
              {requests.map((r) => {
                const v = VOLUNTEER_STORIES[r.volunteer];
                return (
                  <li key={r.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-col">
                      <span className="font-bold">
                        {castByPatientId(r.patientId)?.name} {castByPatientId(r.patientId)?.avatar} → {v.firstName} {v.avatar}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {r.reason} · {relativeDay(r.daysAgo)}
                      </span>
                      <span className="text-sm font-bold">{CONTACT_REQUEST_LABELS[r.status]}</span>
                    </div>
                    {r.status === "pending_care" && (
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setRequest(r.id, "pending_guardian")} className="min-h-11 rounded-lg bg-role-care-ink px-4 font-bold text-white">
                          Approve
                        </button>
                        <button type="button" onClick={() => setRequest(r.id, "declined")} className="min-h-11 rounded-lg bg-muted px-4 font-bold">
                          Decline
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
