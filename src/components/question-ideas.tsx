"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { Modal } from "@/components/kit/modal";
import { refreshQuestionIdeas } from "@/app/question-idea-actions";
import type { QuestionIdea } from "@/lib/question-ideas";
import { cn } from "@/lib/utils";

export function QuestionIdeas({ className, onChoose }: { className?: string; onChoose?: (question: string) => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [ideas, setIdeas] = useState<QuestionIdea[]>([]);
  const questions = ideas.map((i) => i.text);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function generate() {
    startTransition(async () => {
      setError(null);
      try {
        const result = await refreshQuestionIdeas();
        if (result.ok) setIdeas(result.ideas);
        else setError(result.error);
      } catch { setError("Couldn't load ideas. Please try again."); }
    });
  }

  return <>
    <button type="button" onClick={() => { setOpen(true); if (!questions.length && !pending) generate(); }}
      className={cn("flex min-h-14 items-center justify-center gap-2 self-start rounded-2xl bg-role-volunteer-soft px-5 font-bold text-role-volunteer-ink transition hover:-translate-y-0.5", className)}>
      <Sparkles className="size-5" aria-hidden /> Question ideas
    </button>
    <Modal open={open} onClose={() => setOpen(false)} title="A question to bring you closer" className="sm:max-w-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm font-bold text-role-volunteer-ink"><Sparkles className="size-4" aria-hidden /> New ideas each time</span>
        <button type="button" onClick={generate} disabled={pending} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-role-volunteer-ink px-4 text-sm font-bold text-white disabled:opacity-60">
          {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <RefreshCw className="size-4" aria-hidden />}
          {pending ? "Finding ideas…" : questions.length ? "More ideas" : "Show ideas"}
        </button>
      </div>
      <p className="text-muted-foreground">Choose an idea to put it in your card draft. You can change every word before sending. Choosing an idea never sends it.</p>
      {questions.length > 0 && <ul className="flex flex-col gap-3" aria-label="AI question ideas">
        {ideas.map(({ text: q, source }) => <li key={q}><button type="button" disabled={pending} onClick={() => {
          setOpen(false);
          if (onChoose) onChoose(q);
          else router.push(`/family/cards?idea=${encodeURIComponent(q)}`);
        }} className="group flex min-h-20 w-full items-start gap-4 rounded-2xl border border-border bg-background p-4 text-left transition hover:border-role-volunteer hover:bg-role-volunteer-soft disabled:opacity-60">
          <span className="flex-1"><span className="block text-lg font-bold">{q}</span><span className="mt-2 flex flex-wrap gap-2 text-sm text-role-volunteer-ink">Use in my draft{source === "mistral" && <span className="rounded-full bg-role-volunteer-soft px-2 font-bold">✨ Made with Mistral (AI)</span>}</span></span>
          <ArrowUpRight className="mt-1 size-5 shrink-0 text-role-volunteer-ink" aria-hidden />
        </button></li>)}
      </ul>}
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{pending ? "Finding three fresh ideas…" : error ?? (questions.length ? "Your ideas are ready. Pick one to start writing." : "")}</p>
      <p className="text-xs text-muted-foreground">Ideas come from our list of 60 questions first, never the same one twice for your family. When you&apos;ve seen them all, and only if the guardian turned on AI, Mistral suggests new ones using only an age range and interests: never names, check-ins, answers or drafts.</p>
    </Modal>
  </>;
}
