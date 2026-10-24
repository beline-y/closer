"use client";

import { Camera } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/kit/modal";
import { relativeDay } from "@/lib/dates";
import { type PoolQuestion, SHARED_ANSWERS, VOLUNTEER_POOL } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

// Maya's questions. Everything here is anonymous by construction: the pool and the
// shared answers come from tables with no patient id. Saved for this visit only.
export function VolunteerQuestions({ me }: { me: "maya" | "daniel" }) {
  const [answering, setAnswering] = useState<PoolQuestion | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const fromKids = VOLUNTEER_POOL.filter((q) => q.source === "patient" && (!q.forVolunteer || q.forVolunteer === me));
  const inspiring = VOLUNTEER_POOL.filter((q) => q.source === "bank");

  const item = (q: PoolQuestion) => {
    const done = answered.includes(q.id);
    return (
      <li key={q.id} className="flex flex-col gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          {q.source === "patient" && (
            <p className="text-sm font-bold text-role-volunteer-ink">
              🧭 A young explorer asks{q.forVolunteer === me ? " you" : ""} · {relativeDay(q.daysAgo)}
            </p>
          )}
          <p className="text-lg font-bold">{q.text}</p>
        </div>
        <button
          type="button"
          disabled={done}
          onClick={() => {
            setBody("");
            setPhoto(null);
            setAnswering(q);
          }}
          className={cn("min-h-12 shrink-0 rounded-full px-5 font-bold", done ? "bg-success-soft text-success" : "bg-role-volunteer-ink text-white")}
        >
          {done ? "✓ Answered" : "Answer"}
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
          <p className="text-sm text-muted-foreground">Questions are checked by the care team and stripped of names before they reach you.</p>
          <ul className="flex flex-col gap-3">{fromKids.map(item)}</ul>
        </section>
        <section aria-labelledby="inspiring-title" className="flex flex-col gap-3">
          <h2 id="inspiring-title" className="text-xl font-extrabold">
            Inspiring questions ✨
          </h2>
          <ul className="flex flex-col gap-3">{inspiring.map(item)}</ul>
        </section>
      </div>

      <section aria-labelledby="shared-title" className="flex flex-col gap-3">
        <h2 id="shared-title" className="text-xl font-extrabold">
          What young explorers answered
        </h2>
        <p className="text-sm text-muted-foreground">Shared with permission and approved by the care team. Names and places are hidden.</p>
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

      <Modal open={!!answering} onClose={() => setAnswering(null)} title="Your answer">
        {answering && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!body.trim()) return;
              setAnswered((a) => [...a, answering.id]);
              setAnswering(null);
            }}
            className="flex flex-col gap-4"
          >
            <p className="text-lg font-bold">{answering.text}</p>
            <label htmlFor="vol-answer" className="sr-only">
              Your answer
            </label>
            <textarea id="vol-answer" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={1000} placeholder="Tell your story in simple words…" className="rounded-2xl border bg-background p-4 text-lg" />
            <label className="flex min-h-12 cursor-pointer items-center gap-2 self-start rounded-full bg-muted px-4 font-bold">
              <Camera className="size-5" aria-hidden />
              {photo ? `Photo: ${photo}` : "Add a photo (optional)"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0]?.name ?? null)} />
            </label>
            <p className="text-sm text-muted-foreground">No faces of other people in photos. Your answer is shown with your story card.</p>
            <button type="submit" disabled={!body.trim()} className="min-h-14 rounded-2xl bg-role-volunteer-ink text-lg font-extrabold text-white disabled:opacity-50">
              Publish my answer
            </button>
          </form>
        )}
      </Modal>
    </div>
  );
}
