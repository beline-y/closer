"use client";

import { useState, useTransition } from "react";
import { Bell, LoaderCircle, Sparkles, X } from "lucide-react";
import { previewDemoInvitation, type InvitationPreview } from "@/lib/wellbeing/demo-actions";

export function DemoInvitation({ patientId, name, role }: { patientId: string; name: string; role: "patient" | "family" }) {
  const [preview, setPreview] = useState<InvitationPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const child = role === "patient";
  const accent = child ? "bg-role-patient-soft" : "bg-role-family-soft";

  return <section id="ai-notification-demo" aria-label="AI notification demo" className={`flex scroll-mt-24 flex-col gap-4 rounded-3xl border border-dashed border-border p-5 sm:p-6 ${accent}`}>
    <div className="flex items-center gap-2 text-sm font-bold"><Sparkles className="size-4" aria-hidden /> Try the AI · demo preview</div>
    <div><h2 className="text-2xl font-extrabold">{child ? "An invitation made for you" : `A little nudge to connect with ${name}`}</h2>
      <p className="mt-2 text-muted-foreground">{child ? "See an idea made from your latest shared check-in." : `See the invitation a parent could receive from ${name}'s latest shared check-in.`} Today&apos;s answers work too.</p></div>
    <button type="button" disabled={pending} onClick={() => startTransition(async () => {
      setError(null);
      try {
        const result = await previewDemoInvitation(patientId);
        if (result.ok && result.preview.audience === role) setPreview(result.preview);
        else setError(result.ok ? "Please refresh after switching roles." : result.error);
      } catch { setError("Couldn't load your preview. Please try again."); }
    })} className="flex min-h-14 items-center justify-center gap-2 self-start rounded-2xl bg-foreground px-5 font-bold text-background disabled:opacity-60">
      {pending ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      {pending ? "Mistral is making your invitation…" : preview ? "Refresh demo with Mistral" : child ? "Try my AI invitation" : "Preview a parent notification"}
    </button>
    <p className="text-xs text-muted-foreground">Fictional demo only. This sends the latest shared mood, activities and note to Mistral. Photos stay private. Nothing is delivered or saved, and daily reviews stay as you set them.</p>
    <div role="status" aria-live="polite">
      {error && <p className="text-sm font-bold text-destructive">{error}</p>}
      {preview && <article className="mt-1 flex animate-rise items-start gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${accent}`}><Bell className="size-5" aria-hidden /></span>
        <div className="min-w-0 flex-1"><p className="text-xs font-bold text-muted-foreground">DEMO PREVIEW · {child ? "FOR YOU" : `FOR ${name.toLocaleUpperCase()}'S PARENT`}</p>
          <h3 className="mt-1 font-extrabold">{child ? "A little moment together 💛" : `A moment with ${name} 💛`}</h3>
          <p className="mt-2 text-lg leading-relaxed">{preview.body}</p>
          <p className="mt-3 text-xs text-muted-foreground">Based on the shared check-in from {preview.checkinDate}: {preview.source}. Created with Mistral.</p>
        </div>
        <button type="button" aria-label="Dismiss demo preview" onClick={() => setPreview(null)} className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted"><X className="size-4" aria-hidden /></button>
      </article>}
    </div>
  </section>;
}
