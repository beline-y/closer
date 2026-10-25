"use client";

import { useState, useTransition } from "react";
import { answerTodayQuestion } from "@/app/question-actions";
import { Modal } from "@/components/kit/modal";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { ReadAloud } from "@/components/kit/read-aloud";
import { VolunteerCard } from "@/components/kit/volunteer-card";
import { QuestionIdeas } from "@/components/question-ideas";
import { CAST, type CastMember } from "@/lib/cast";
import type { TodayQuestion } from "@/lib/data/daily-question";
import { VOLUNTEER_ANSWERS, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

const EMOJI_CHIPS = ["🦁", "🌊", "🎢", "💛", "😂"];

// Question of the day with the lock: the database shows you the others' answers only once
// you answered (and live when they answer after you). On Leo's side, answering also
// unlocks a volunteer card. Leo's answer stays private unless he ticks "Volunteers can read it".
export function QuestionFlow({ question, isLeo }: { question: TodayQuestion; isLeo: boolean }) {
  const [draft, setDraft] = useState("");
  const [shareWithVolunteers, setShareWithVolunteers] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();
  const viewer = isLeo ? CAST.leo : CAST.emma;
  const answer = question.myAnswer?.body ?? null;
  const nameFor = (m: CastMember) => (isLeo && (m.relationship === "Mom" || m.relationship === "Dad") ? m.relationship : m.name);
  // A gentle "hasn't answered yet": Mom on Leo's side, Leo on the family side.
  const waitingFor = (isLeo ? [CAST.emma] : [CAST.leo]).filter((m) => !question.answers.some((a) => a.by.id === m.id));
  const accent = isLeo ? "bg-role-patient" : "bg-role-family-ink text-white";

  return (
    <div className="flex flex-col gap-6">
      <section className="hue-lilac flex flex-col gap-4 rounded-3xl bg-role-volunteer-soft p-5 shadow-sm ring-1 ring-border sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold text-role-volunteer-ink">❓ Today&apos;s question</p>
          {isLeo && <ReadAloud text={question.text} />}
        </div>
        <h2 className="text-3xl font-extrabold sm:text-4xl">{question.text}</h2>
        {!answer && question.answeredBy.length > 0 && (
          <p className="text-lg">
            🔒 {question.answeredBy.map(nameFor).join(" and ")} answered! Answer to see {question.answeredBy.length === 1 ? "the answer" : "their answers"}.
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
              <AnswerBubble who={viewer} label="You" body={answer} />
            </li>
            {question.answers.map((a) => (
              <li key={a.by.id}>
                <AnswerBubble who={a.by} label={nameFor(a.by)} body={a.body} />
              </li>
            ))}
            {waitingFor.map((m) => (
              <li key={m.id}>
                <AnswerBubble who={m} label={nameFor(m)} waiting />
              </li>
            ))}
          </ul>
          {isLeo && (
            <p className="text-sm text-muted-foreground">
              {question.myAnswer?.shared ? "🔒 Sarah will check your answer first. Volunteers never see your name." : "🔒 Only your family can read your answer."}
            </p>
          )}
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            setError(null);
            startSending(async () => {
              const r = await answerTodayQuestion(question.id, draft, shareWithVolunteers);
              if (!r.ok) setError(r.error);
            });
          }}
          className="flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border"
        >
          <label htmlFor="answer" className="text-xl font-extrabold">
            Your answer
          </label>
          <div className="flex flex-wrap gap-2" aria-label="Add an emoji">
            {EMOJI_CHIPS.map((e) => (
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
          <button type="submit" disabled={!draft.trim() || sending} className={cn("min-h-14 rounded-2xl text-xl font-extrabold disabled:opacity-50", isLeo ? "hue-sun pressable" : "shadow-sm transition active:scale-[0.98]", accent)}>
            {sending ? "Sending…" : "Send my answer"}
          </button>
          {error && <p role="alert" className="font-bold text-alert">{error}</p>}
        </form>
      )}

      {isLeo && answer && <VolunteerUnlock questionText={question.text} />}
      {!isLeo && <QuestionIdeas />}
    </div>
  );
}

function AnswerBubble({ who, label, body, waiting }: { who: CastMember; label: string; body?: string; waiting?: boolean }) {
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
function VolunteerUnlock({ questionText }: { questionText: string }) {
  const answers = VOLUNTEER_ANSWERS[questionText] ?? [];
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
