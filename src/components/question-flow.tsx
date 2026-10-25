"use client";

import { useState } from "react";
import { Modal } from "@/components/kit/modal";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { VolunteerCard } from "@/components/kit/volunteer-card";
import { QuestionIdeas } from "@/components/question-ideas";
import { CAST, type CastId } from "@/lib/cast";
import { TODAY_QUESTION, VOLUNTEER_ANSWERS, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

type Viewer = "leo" | "emma";

// Question of the day with the lock: you see the others' answers only after answering.
// On Leo's side, answering also unlocks a volunteer card (answer + story).
export function QuestionFlow({ viewer }: { viewer: Viewer }) {
  const [draft, setDraft] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [shareWithVolunteers, setShareWithVolunteers] = useState(false);
  const isLeo = viewer === "leo";
  const others = (Object.entries(TODAY_QUESTION.answers) as [CastId, string][]).filter(([id]) => id !== viewer);
  const waitingFor: CastId[] = isLeo ? ["emma"] : ["leo"];
  const nameFor = (id: CastId) => (isLeo && CAST[id].relationship ? CAST[id].relationship! : CAST[id].name);
  const accent = isLeo ? "bg-role-patient" : "bg-role-family-ink text-white";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4 rounded-3xl bg-role-volunteer-soft p-5 shadow-sm ring-1 ring-border sm:p-6">
        <p className="text-sm font-bold text-role-volunteer-ink">❓ Today&apos;s question</p>
        <h2 className="text-3xl font-extrabold sm:text-4xl">{TODAY_QUESTION.text}</h2>
        {!answer && others.length > 0 && (
          <p className="text-lg">
            🔒 {others.map(([id]) => nameFor(id)).join(" and ")} answered! Answer to see {others.length === 1 ? "the answer" : "their answers"}.
          </p>
        )}
      </section>

      {answer ? (
        <section aria-labelledby="answers-title" className="flex flex-col gap-4">
          <h2 id="answers-title" className="text-2xl font-extrabold">
            Answers 🎉
          </h2>
          {/* One column, same gap everywhere, every bubble full width and top-aligned. */}
          <ul className="flex flex-col gap-3">
            <li>
              <AnswerBubble who={CAST[viewer]} label="You" body={answer} />
            </li>
            {others.map(([id, body]) => (
              <li key={id}>
                <AnswerBubble who={CAST[id]} label={nameFor(id)} body={body} />
              </li>
            ))}
            {waitingFor.map((id) => (
              <li key={id}>
                <AnswerBubble who={CAST[id]} label={nameFor(id)} waiting />
              </li>
            ))}
          </ul>
          {isLeo && shareWithVolunteers && (
            <p className="text-sm text-muted-foreground">Sarah will check your answer first. Volunteers never see your name.</p>
          )}
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setAnswer(draft.trim());
          }}
          className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border"
        >
          <label htmlFor="answer" className="text-xl font-extrabold">
            Your answer
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Add an emoji">
            {TODAY_QUESTION.emojiChips.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setDraft((d) => `${d}${d && !d.endsWith(" ") ? " " : ""}${e}`)}
                className="flex size-14 items-center justify-center rounded-2xl bg-muted text-3xl transition hover:-translate-y-0.5 active:scale-95"
                aria-label={`Add ${e}`}
              >
                {e}
              </button>
            ))}
          </div>
          <textarea
            id="answer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder={isLeo ? "Type or tap an emoji…" : "Share your story…"}
            className="rounded-2xl border bg-background p-4 text-lg"
          />
          {isLeo && (
            <label className="flex min-h-12 items-center gap-3 text-lg">
              <input type="checkbox" checked={shareWithVolunteers} onChange={(e) => setShareWithVolunteers(e.target.checked)} className="size-6 accent-role-patient-ink" />
              Volunteers can read it (without my name)
            </label>
          )}
          <button type="submit" disabled={!draft.trim()} className={cn("min-h-14 rounded-2xl text-xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50", accent)}>
            Send my answer
          </button>
        </form>
      )}

      {isLeo && answer && <VolunteerUnlock />}
      {!isLeo && <QuestionIdeas />}
    </div>
  );
}

function AnswerBubble({ who, label, body, waiting }: { who: (typeof CAST)[CastId]; label: string; body?: string; waiting?: boolean }) {
  return (
    <div className="flex animate-rise items-start gap-3">
      <PersonaAvatar person={who} size="md" decorative className={cn(waiting && "opacity-50")} />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1 rounded-3xl rounded-tl-md p-4",
          waiting ? "bg-muted text-muted-foreground" : "bg-card shadow-sm ring-1 ring-border",
        )}
      >
        <span className="font-bold">{label}</span>
        <p className="text-lg break-words">{waiting ? "Hasn't answered yet. You'll see it here 💛" : body}</p>
      </div>
    </div>
  );
}

// After answering: a volunteer's answer to the same question + their story.
function VolunteerUnlock() {
  const answers = VOLUNTEER_ANSWERS[TODAY_QUESTION.text] ?? [];
  const [index, setIndex] = useState(0);
  const [dialog, setDialog] = useState<"ask" | "talk" | null>(null);
  const [done, setDone] = useState<"ask" | "talk" | null>(null);
  const [question, setQuestion] = useState("");
  if (answers.length === 0) return null;
  const current = answers[index % answers.length];
  const story = VOLUNTEER_STORIES[current.volunteer];

  return (
    <section aria-labelledby="volunteer-title" className="flex animate-pop flex-col gap-3">
      <h2 id="volunteer-title" className="text-2xl font-extrabold">
        🔓 You unlocked a story!
      </h2>
      <VolunteerCard story={story} answer={current.body}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => { setDone(null); setQuestion(""); setDialog("ask"); }} className="min-h-14 rounded-2xl bg-role-volunteer-soft px-4 text-lg font-extrabold text-role-volunteer-ink">
            💬 Ask {story.firstName} a question
          </button>
          <button type="button" onClick={() => { setDone(null); setDialog("talk"); }} className="min-h-14 rounded-2xl bg-role-volunteer-ink px-4 text-lg font-extrabold text-white">
            👋 I&apos;d like to talk with {story.firstName}
          </button>
        </div>
      </VolunteerCard>
      {answers.length > 1 && (
        <button type="button" onClick={() => setIndex((i) => i + 1)} className="min-h-12 self-start rounded-full px-4 font-bold text-role-volunteer-ink hover:bg-role-volunteer-soft">
          Meet another volunteer →
        </button>
      )}

      <Modal open={dialog === "ask"} onClose={() => setDialog(null)} title={done ? "Sent! ❤️" : `Ask ${story.firstName}`}>
        {done ? (
          <p className="text-lg">Sarah checks every question first. Then {story.firstName} gets it, without your name.</p>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) setDone("ask");
            }}
            className="flex flex-col gap-4"
          >
            <label htmlFor="ask" className="text-lg">
              What would you like to know?
            </label>
            <textarea id="ask" value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} maxLength={280} className="rounded-2xl border bg-background p-4 text-lg" />
            <p className="text-sm text-muted-foreground">Don&apos;t write your name or where you live. We hide them anyway.</p>
            <button type="submit" disabled={!question.trim()} className="min-h-14 rounded-2xl bg-role-volunteer-ink text-lg font-extrabold text-white disabled:opacity-50">
              Send my question
            </button>
          </form>
        )}
      </Modal>

      <Modal open={dialog === "talk"} onClose={() => setDialog(null)} title={done ? "Asked! 💛" : `Talk with ${story.firstName}?`}>
        {done ? (
          <p className="text-lg">Sarah and Mom will look at it first. If they say yes, {story.firstName} can come and visit with a grown-up from the hospital.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-lg">We&apos;ll ask Sarah and Mom first. You&apos;ll meet with a grown-up from the hospital, never alone.</p>
            <button type="button" onClick={() => setDone("talk")} className="min-h-14 rounded-2xl bg-role-volunteer-ink text-lg font-extrabold text-white">
              Yes, ask for me
            </button>
          </div>
        )}
      </Modal>
    </section>
  );
}
