"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { CONTACT_REQUEST_LABELS, type ContactRequestStatus, VOLUNTEER_REQUESTS } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

// Approved requests only, with what the care team chose to share. No messaging.
export function VolunteerRequests({ me }: { me: "maya" | "daniel" }) {
  const [requests, setRequests] = useState(VOLUNTEER_REQUESTS[me]);
  const setStatus = (id: string, status: ContactRequestStatus) => setRequests((all) => all.map((r) => (r.id === id ? { ...r, status } : r)));

  return (
    <div className="flex flex-col gap-5">
      <p className="flex items-start gap-3 rounded-2xl bg-role-volunteer-soft p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-role-volunteer-ink" aria-hidden />
        <span>
          Only a young explorer can ask to meet you. The care team and a guardian approve every request first. Meetings are supervised visits or moderated exchanges, never private chat.
        </span>
      </p>
      {requests.length === 0 ? (
        <EmptyState emoji="📭" title="No requests yet">
          When a young explorer would like to meet you and the care team approves it, you&apos;ll see it here.
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {requests.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border">
              <span
                className={cn(
                  "self-start rounded-full px-3 py-1 text-sm font-bold",
                  r.status === "accepted" ? "bg-success-soft text-success" : r.status === "declined" ? "bg-muted text-muted-foreground" : "bg-role-volunteer-soft text-role-volunteer-ink",
                )}
              >
                {r.status === "sent_to_volunteer" ? "New request" : CONTACT_REQUEST_LABELS[r.status]}
              </span>
              <p className="text-lg">“{r.sharedNote}”</p>
              <p className="text-sm text-muted-foreground">📍 {r.plan}</p>
              {r.status === "sent_to_volunteer" && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setStatus(r.id, "accepted")} className="min-h-12 rounded-full bg-role-volunteer-ink px-5 font-bold text-white">
                    Accept
                  </button>
                  <button type="button" onClick={() => setStatus(r.id, "declined")} className="min-h-12 rounded-full bg-muted px-5 font-bold">
                    Decline
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
