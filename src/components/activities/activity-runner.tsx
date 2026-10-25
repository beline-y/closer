"use client";

import { Camera, Check, ImageIcon, Loader2, Mic, MicOff } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { finishActivity, saveDraft, startActivity } from "@/app/activity-actions";
import { CloserIcon } from "@/components/icons/closer-icon";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { type Activity, ACTIVITY_TYPES, type ShareChoice } from "@/lib/activities";
import type { CastMember } from "@/lib/cast";
import { preparePhoto } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { DrawingCanvas } from "./drawing-canvas";

type Result = { path?: string; previewUrl?: string; text?: string; score?: number; scoreTotal?: number };

async function uploadResult(patientId: string, blob: Blob): Promise<string> {
  const ext = blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${patientId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await createClient().storage.from("activity-results").upload(path, blob, { contentType: blob.type });
  if (error) throw error;
  return path;
}

// Intro -> do the activity -> choose who sees it -> saved. Everything ends with a result to keep.
export function ActivityRunner({ activity, patientId, circle, resume }: { activity: Activity; patientId: string; circle: CastMember[]; resume?: { sessionId: string; text: string } | null }) {
  const [stage, setStage] = useState<"intro" | "doing" | "share" | "saved">("intro");
  const [result, setResult] = useState<Result | null>(null);
  const [partner, setPartner] = useState<CastMember | null>(null);
  const [saved, setSaved] = useState<ShareChoice | "challenge" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // The unfinished session behind this run (created at Start, or the one being continued).
  const [sessionId, setSessionId] = useState<string | null>(resume?.sessionId ?? null);
  const type = ACTIVITY_TYPES[activity.type];

  // Hidden by Next's <Activity> when navigating away: start fresh next time.
  useEffect(() => () => setStage("intro"), []);

  const finish = (r: Result, share: ShareChoice) => {
    setError(null);
    startSaving(async () => {
      const res = await finishActivity({
        activityId: activity.id,
        sessionId,
        resultPath: r.path,
        resultText: r.text,
        score: r.score,
        scoreTotal: r.scoreTotal,
        share,
        partnerId: partner?.userId,
      });
      if (!res.ok) return setError(res.error);
      setSaved(activity.type === "challenge" ? "challenge" : share);
      setStage("saved");
    });
  };

  const gotImage = async (blob: Blob) => {
    setError(null);
    try {
      const path = await uploadResult(patientId, blob);
      const r = { path, previewUrl: URL.createObjectURL(blob) };
      setResult(r);
      if (activity.type === "challenge") finish(r, "family");
      else setStage("share");
    } catch {
      setError("Saving didn't work. Try again?");
    }
  };

  if (stage === "saved") return <Saved activity={activity} choice={saved} partner={partner} />;

  if (stage === "share" && result) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
        <h1 className="flex items-center gap-2 text-4xl font-extrabold">
          Well done! <CloserIcon name="party" className="text-mood-5" />
        </h1>
        <ResultPreview result={result} activity={activity} />
        <p className="text-xl font-bold">Who can see it?</p>
        <div className="grid gap-3">
          {(
            [
              { value: "family", icon: "heart", label: "Share with my family", hint: "It shows in their feed" },
              { value: "memories", icon: "memory", label: "Add to Memories", hint: "In the album you share with your family" },
              { value: "private", icon: "lock", label: "Keep it for myself", hint: "Only you can see it" },
            ] as const
          ).map((c) => (
            <button
              key={c.value}
              type="button"
              disabled={saving}
              onClick={() => finish(result, c.value)}
              className="flex min-h-20 items-center gap-4 rounded-3xl bg-card p-4 text-left shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60"
            >
              <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-role-patient-soft text-role-patient-ink">
                <CloserIcon name={c.icon} className="size-6" />
              </span>
              <span className="flex flex-col">
                <span className="text-xl font-extrabold">{c.label}</span>
                <span className="text-muted-foreground">{c.hint}</span>
              </span>
            </button>
          ))}
        </div>
        {saving && <p className="flex items-center gap-2 text-lg"><Loader2 className="size-5 animate-spin" aria-hidden /> Saving…</p>}
        {error && <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 font-bold text-alert">{error}</p>}
      </div>
    );
  }

  if (stage === "doing") {
    if (activity.type === "draw" || activity.type === "challenge") {
      return (
        <>
          <DrawingCanvas theme={activity.theme ?? activity.title} onDone={gotImage} onCancel={() => setStage("intro")} doneLabel={activity.type === "challenge" ? `Send to ${partnerName(partner)}` : "I'm done!"} />
          {error && <p role="alert" className="fixed inset-x-4 bottom-32 z-50 rounded-2xl bg-alert-soft px-4 py-3 text-center font-bold text-alert">{error}</p>}
        </>
      );
    }
    if (activity.type === "make_snap") return <MakeAndSnap activity={activity} onPhoto={gotImage} error={error} />;
    if (activity.type === "quiz") return <Quiz activity={activity} onDone={(score, total) => { setResult({ score, scoreTotal: total, text: `${score}/${total}` }); setStage("share"); }} />;
    if (activity.type === "story") return <StoryWriter activity={activity} sessionId={sessionId} initialText={resume?.text ?? ""} onDone={(text) => { setResult({ text }); setStage("share"); }} />;
  }

  // Intro
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <Link href="/patient/play" className="min-h-11 self-start content-center rounded-full px-3 font-bold text-muted-foreground hover:bg-muted">
        Back to Play
      </Link>
      <div className="flex flex-col items-center gap-3 rounded-3xl bg-role-patient-soft p-6 text-center">
        <span aria-hidden className="flex size-24 animate-pop items-center justify-center rounded-full bg-card text-role-patient-ink">
          <CloserIcon name={type.icon} className="size-12" strokeWidth={1.75} />
        </span>
        <p className="font-bold text-role-patient-ink">
          {type.label} · about {activity.minutes} min
        </p>
        <h1 className="text-4xl font-extrabold">{activity.title}</h1>
        {activity.theme && activity.theme !== activity.title && <p className="text-xl">“{activity.theme}”</p>}
        {activity.instructions && <p className="text-lg text-muted-foreground">{activity.instructions}</p>}
      </div>

      {activity.type === "challenge" && (
        <section aria-labelledby="partner-title" className="flex flex-col gap-3">
          <h2 id="partner-title" className="text-2xl font-extrabold">
            Who do you challenge?
          </h2>
          <div role="radiogroup" aria-label="Who do you challenge?" className="flex flex-wrap gap-3">
            {circle.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={partner?.id === m.id}
                onClick={() => setPartner(m)}
                className={cn("flex min-h-14 flex-col items-center gap-1 rounded-2xl border-2 px-4 py-2 font-bold", partner?.id === m.id ? "border-role-patient bg-role-patient-soft" : "border-transparent bg-muted")}
              >
                <PersonaAvatar person={m} size="lg" decorative />
                {partnerName(m)}
              </button>
            ))}
          </div>
          <p className="text-muted-foreground">You both draw. You&apos;ll see each other&apos;s drawing when you&apos;re both done!</p>
        </section>
      )}

      <button
        type="button"
        disabled={activity.type === "challenge" && !partner}
        onClick={() => {
          setStage("doing");
          // Saved as unfinished so it shows under "Continue" if Leo stops halfway.
          if (!sessionId && activity.type !== "challenge") {
            void startActivity(activity.id).then((r) => {
              if (r.ok) setSessionId(r.sessionId);
            });
          }
        }}
        className="min-h-16 rounded-2xl bg-role-patient text-2xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
      >
        {resume ? "Continue ▶" : "Start ▶"}
      </button>
    </div>
  );
}

const partnerName = (m: CastMember | null) => (!m ? "" : m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name);

function ResultPreview({ result, activity }: { result: Result; activity: Activity }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-border">
      {result.previewUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- local preview of the result
        <img src={result.previewUrl} alt={activity.title} className="max-h-96 w-full object-contain" />
      )}
      {result.score !== undefined && (
        <p className="flex flex-col items-center p-6 text-center text-4xl font-extrabold">
          <span aria-hidden className="flex text-mood-4">
            {Array.from({ length: result.score }, (_, i) => (
              <CloserIcon key={i} name="star" className="size-9 fill-current" />
            ))}
          </span>
          <span className="block text-2xl">
            {result.score} / {result.scoreTotal}
          </span>
        </p>
      )}
      {result.text && result.score === undefined && <p className="p-5 text-lg leading-relaxed whitespace-pre-wrap">{result.text}</p>}
    </div>
  );
}

function Saved({ activity, choice, partner }: { activity: Activity; choice: ShareChoice | "challenge" | null; partner: CastMember | null }) {
  const message =
    choice === "challenge"
      ? `Sent! Waiting for ${partnerName(partner)}. You'll see both drawings when ${partnerName(partner)} is done.`
      : choice === "family"
        ? "Shared! Your family will see it in their feed."
        : choice === "memories"
          ? "Added to Memories."
          : "Saved, just for you.";
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 text-center">
      <span aria-hidden className="animate-heart text-role-patient-ink">
        <CloserIcon name={choice === "challenge" ? "challenge" : "star"} className="size-28" strokeWidth={1.5} />
      </span>
      <h1 role="status" className="max-w-xl text-3xl font-extrabold">
        {message}
      </h1>
      <p className="text-lg text-muted-foreground">It counts in your activity of the day: {ACTIVITY_TYPES[activity.type].label}</p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/patient/play" className="flex min-h-14 items-center rounded-2xl bg-role-patient px-6 text-xl font-extrabold">
          Play more
        </Link>
        {choice === "private" && (
          <Link href="/patient/me" className="flex min-h-14 items-center gap-2 rounded-2xl bg-muted px-6 text-xl font-bold">
            <CloserIcon name="lock" /> In Me
          </Link>
        )}
        <Link href="/patient" className="flex min-h-14 items-center rounded-2xl bg-muted px-6 text-xl font-bold">
          Today
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Make and snap: follow the steps on paper, then take a photo of the result
// ---------------------------------------------------------------------------
function MakeAndSnap({ activity, onPhoto, error }: { activity: Activity; onPhoto: (blob: Blob) => Promise<void>; error: string | null }) {
  const [done, setDone] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const pick = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      await onPhoto(await preparePhoto(file)); // resized, EXIF and GPS removed
    } catch {
      setProblem("That photo didn't work. Try another one?");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <h1 className="flex items-center gap-2 text-3xl font-extrabold">
        <CloserIcon name={ACTIVITY_TYPES[activity.type].icon} className="text-role-patient-ink" /> {activity.title}
      </h1>
      <ol className="flex flex-col gap-2">
        {activity.steps.map((s, i) => (
          <li key={i}>
            <button
              type="button"
              aria-pressed={done.includes(i)}
              onClick={() => setDone((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
              className={cn("flex min-h-16 w-full items-center gap-3 rounded-2xl p-3 text-left text-lg transition", done.includes(i) ? "bg-success-soft" : "bg-card ring-1 ring-border")}
            >
              <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full font-extrabold", done.includes(i) ? "bg-success text-white" : "bg-muted")}>
                {done.includes(i) ? <Check className="size-5" aria-hidden /> : i + 1}
              </span>
              {s}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xl font-bold">Show your creation</p>
      <div className="grid grid-cols-2 gap-3">
        <button type="button" disabled={busy} onClick={() => camera.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-role-patient text-lg font-extrabold disabled:opacity-60">
          <Camera className="size-8" aria-hidden /> Take a photo
        </button>
        <button type="button" disabled={busy} onClick={() => gallery.current?.click()} className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl bg-muted text-lg font-extrabold disabled:opacity-60">
          <ImageIcon className="size-8" aria-hidden /> From my photos
        </button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={gallery} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      {busy && <p className="flex items-center gap-2"><Loader2 className="size-4 animate-spin" aria-hidden /> Getting your photo ready…</p>}
      {(problem || error) && <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 font-bold text-alert">{problem ?? error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Quiz: one question at a time, kind feedback, a fun fact, a score with stars
// ---------------------------------------------------------------------------
function Quiz({ activity, onDone }: { activity: Activity; onDone: (score: number, total: number) => void }) {
  const questions = activity.quiz ?? [];
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);
  const q = questions[index];
  if (!q) return null;
  const right = picked === q.answer;
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5">
      <p aria-label={`Question ${index + 1} of ${questions.length}`} className="flex justify-center gap-2">
        {questions.map((_, i) => (
          <span key={i} aria-hidden className={cn("h-3 rounded-full transition-all", i === index ? "w-8 bg-role-patient-ink" : i < index ? "w-3 bg-role-patient" : "w-3 bg-muted")} />
        ))}
      </p>
      <h1 className="text-3xl font-extrabold">{q.q}</h1>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => (
          <button
            key={o}
            type="button"
            disabled={picked !== null}
            onClick={() => {
              setPicked(i);
              if (i === q.answer) setScore((s) => s + 1);
            }}
            className={cn(
              "min-h-16 rounded-2xl px-4 text-xl font-bold shadow-sm ring-1 ring-border transition active:scale-[0.98]",
              picked === null ? "bg-card hover:-translate-y-0.5" : i === q.answer ? "bg-success text-white" : picked === i ? "bg-role-family-soft" : "bg-card opacity-60",
            )}
          >
            {o}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div role="status" className="flex animate-rise flex-col gap-3 rounded-3xl bg-role-patient-soft p-5">
          <p className="text-2xl font-extrabold">{right ? "Yes!" : `Almost! It's ${q.options[q.answer]}.`}</p>
          {q.fact && (
            <p className="flex items-start gap-2 text-lg">
              <CloserIcon name="idea" className="mt-1 text-mood-4" /> {q.fact}
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              if (index + 1 < questions.length) {
                setIndex(index + 1);
                setPicked(null);
              } else onDone(score, questions.length);
            }}
            className="min-h-14 rounded-2xl bg-role-patient text-xl font-extrabold"
          >
            {index + 1 < questions.length ? "Next question" : "See my score"}
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Story time: write or dictate (Web Speech API when the browser has it)
// ---------------------------------------------------------------------------
type Recognition = { start: () => void; stop: () => void; onresult: ((e: { results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>; resultIndex: number }) => void) | null; onend: (() => void) | null; lang: string; interimResults: boolean; continuous: boolean };

function StoryWriter({ activity, sessionId, initialText, onDone }: { activity: Activity; sessionId: string | null; initialText: string; onDone: (text: string) => void }) {
  const [text, setText] = useState(initialText);
  // Autosave the draft (2 s after the last change) so "Continue" picks it up.
  useEffect(() => {
    if (!sessionId || text === initialText) return;
    const t = setTimeout(() => void saveDraft(sessionId, text), 2000);
    return () => clearTimeout(t);
  }, [sessionId, text, initialText]);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const [canDictate] = useState(() => typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window));

  const toggleDictation = () => {
    if (listening) {
      recognition.current?.stop();
      return;
    }
    const Ctor = (window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }).SpeechRecognition ??
      (window as unknown as { webkitSpeechRecognition?: new () => Recognition }).webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "en-US";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let added = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) added += e.results[i][0].transcript;
      if (added) setText((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${added.trim()}`);
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    r.start();
    setListening(true);
  };

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
      <h1 className="flex items-center gap-2 text-3xl font-extrabold">
        <CloserIcon name={ACTIVITY_TYPES[activity.type].icon} className="text-role-patient-ink" /> {activity.theme ?? activity.title}
      </h1>
      <p className="text-lg text-muted-foreground">{activity.instructions}</p>
      <label htmlFor="story" className="sr-only">
        Your story
      </label>
      <textarea id="story" value={text} onChange={(e) => setText(e.target.value)} rows={10} maxLength={4000} placeholder="Once upon a time…" className="rounded-3xl border bg-card p-5 text-xl leading-relaxed" />
      <div className="flex flex-wrap items-center gap-3">
        {canDictate && (
          <button type="button" onClick={toggleDictation} aria-pressed={listening} className={cn("flex min-h-14 items-center gap-2 rounded-2xl px-5 text-lg font-bold", listening ? "animate-pulse bg-alert-soft text-alert" : "bg-muted")}>
            {listening ? <MicOff className="size-6" aria-hidden /> : <Mic className="size-6" aria-hidden />}
            {listening ? "Stop" : "Say it"}
          </button>
        )}
        <span className="text-muted-foreground tabular-nums">{words} words</span>
        <button type="button" disabled={words < 3} onClick={() => onDone(text)} className="ml-auto min-h-14 rounded-2xl bg-role-patient px-6 text-xl font-extrabold disabled:opacity-50">
          My story is done
        </button>
      </div>
    </div>
  );
}
