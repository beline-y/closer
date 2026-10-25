"use client";

import { useState } from "react";
import { Modal } from "@/components/kit/modal";
import { relativeDay } from "@/lib/dates";
import { type PoolQuestion, SHARED_ANSWERS, VOLUNTEER_POOL } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";
import { MyVolunteerMessages, VolunteerMessageForm } from "@/components/volunteer/message-form";
import type { VolunteerSubmission } from "@/lib/volunteer-submissions";
import { CloserIcon } from "@/components/icons/closer-icon";

// The anonymous question pool and shared examples remain fixtures. New volunteer
// answers are persisted privately for screening and care review.
export function VolunteerQuestions({ me, submissions = [] }: { me: "maya" | "daniel"; submissions?: VolunteerSubmission[] }) {
  const [answering, setAnswering] = useState<PoolQuestion | null>(null);
  const [submitted, setSubmitted] = useState<VolunteerSubmission[]>([]);
  const messages = [...submitted, ...submissions.filter((s) => !submitted.some((n) => n.id === s.id))];
  const fromKids = VOLUNTEER_POOL.filter((q) => q.source === "patient" && (!q.forVolunteer || q.forVolunteer === me));
  const inspiring = VOLUNTEER_POOL.filter((q) => q.source === "bank");

  const item = (q: PoolQuestion) => {
    const done = messages.some((s) => s.context_key === q.id && s.status !== "rejected");
    return (
      <li key={q.id} className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {q.source === "patient" && (
            <p className="flex items-center gap-1.5 text-sm font-bold text-role-volunteer-ink">
              <CloserIcon name="rocket" /> A young explorer asks{q.forVolunteer === me ? " you" : ""} · {relativeDay(q.daysAgo)}
            </p>
          )}
          <p className="text-lg font-bold">{q.text}</p>
        </div>
        <button
          type="button"
          disabled={done}
          onClick={() => {
            setAnswering(q);
          }}
          className={cn("min-h-12 shrink-0 rounded-full px-5 font-bold", done ? "bg-success-soft text-success" : "bg-role-volunteer-ink text-white")}
        >
          {done ? "Submitted to care team" : "Answer"}
        </button>
      </li>
    );
  };

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="flex flex-col gap-8">
        <section aria-labelledby="kids-title" className="flex flex-col gap-3">
          <h2 id="kids-title" className="text-xl font-extrabold">
            From young explorers
          </h2>
          <p className="text-sm text-muted-foreground">Anonymous questions, approved by the care team.</p>
          <ul className="flex flex-col gap-3">{fromKids.map(item)}</ul>
        </section>
        <section aria-labelledby="inspiring-title" className="flex flex-col gap-3">
          <h2 id="inspiring-title" className="text-xl font-extrabold">
            Inspiring questions
          </h2>
          <ul className="flex flex-col gap-3">{inspiring.map(item)}</ul>
        </section>
      </div>

      <section aria-labelledby="shared-title" className="flex flex-col gap-3">
        <h2 id="shared-title" className="text-xl font-extrabold">
          What young explorers answered
        </h2>
        <p className="text-sm text-muted-foreground">Shared with permission.</p>
        <ul className="flex flex-col gap-3">
          {SHARED_ANSWERS.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-3xl bg-role-volunteer-soft p-4">
              <p className="text-sm font-bold text-role-volunteer-ink">{a.question}</p>
              <p className="text-lg">
                <span className="font-bold">A young explorer answered:</span> “{a.body}”
              </p>
              <p className="text-sm text-muted-foreground">{relativeDay(a.daysAgo)}</p>
            </li>
          ))}
        </ul>
      </section>

      <div className="lg:col-span-2"><MyVolunteerMessages submissions={messages} /></div>
      <Modal open={!!answering} onClose={() => setAnswering(null)} title="Your answer">
        {answering && <VolunteerMessageForm key={answering.id} kind="question_answer" contextKey={answering.id} label={answering.text} onSubmitted={(s) => {
          setSubmitted((all) => [s, ...all]); setAnswering(null);
        }} />}
      </Modal>
    </div>
  );
}
