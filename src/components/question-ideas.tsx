"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "@/components/kit/modal";
import { refreshQuestionIdeas } from "@/app/question-idea-actions";
import { cn } from "@/lib/utils";

export function QuestionIdeas({ className, onChoose }: { className?: string; onChoose?: (question: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await refreshQuestionIdeas(questions);
        if (result.ok) setQuestions(result.questions);
        else setError(result.error);
      } catch { setError("Couldn't reach Mistral. Please try again."); }
    });
  }

  return <>
    <button type="button" onClick={() => { setOpen(true); if (!questions.length && !pending) generate(); }}
      className={cn("flex min-h-14 items-center justify-center gap-2 self-start rounded-2xl bg-role-volunteer-soft px-5 font-bold text-role-volunteer-ink transition hover:-translate-y-0.5", className)}>
      <Sparkles className="size-5" aria-hidden /> AI question ideas
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="A question to bring you closer" className="sm:max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-role-volunteer-ink"><Sparkles className="size-4" aria-hidden /> {questions.length ? "Ideas by Mistral" : "AI helper · Mistral"}</span>
        <button type="button" onClick={generate} disabled={pending} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-role-volunteer-ink px-4 text-sm font-bold text-white disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {pending ? "Asking Mistral…" : questions.length ? "New ideas with Mistral" : "Generate ideas with Mistral"}
        </button>
      </div>
      <p className="text-muted-foreground">Choose an idea to put it in your card draft. You can change every word before sending. Choosing an idea never sends it.</p>
      {questions.length > 0 && <ul className="flex flex-col gap-3" aria-label="AI question ideas">
        {questions.map((q) => <li key={q}><button type="button" disabled={pending} onClick={() => {
          setOpen(false);
          if (onChoose) onChoose(q);
          else router.push(`/family/cards?idea=${encodeURIComponent(q)}`);
        }} className="group flex min-h-20 w-full items-start gap-4 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-role-volunteer hover:bg-role-volunteer-soft disabled:opacity-60">
          <span className="flex-1"><span className="block text-lg font-bold">{q}</span><span className="mt-2 block text-sm text-role-volunteer-ink">Use in my draft</span></span>
          <ArrowUpRight className="mt-1 size-5 shrink-0 text-role-volunteer-ink" aria-hidden />
        </button></li>)}
      </ul>}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending ? "Mistral is writing three fresh question ideas…" : error ?? (questions.length ? "Your ideas are ready. Pick one to start writing." : "")}</p>
      <p className="text-xs text-muted-foreground">Only generic conversation topics are used. Your card draft and private answers aren&apos;t sent to the AI.</p>
    </Modal>
  </>;
}
