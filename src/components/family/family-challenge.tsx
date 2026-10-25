"use client";

import Link from "next/link";
import { useState } from "react";
import { submitChallengeEntry } from "@/app/activity-actions";
import { DrawingCanvas } from "@/components/activities/drawing-canvas";
import { createClient } from "@/lib/supabase/client";
import { CloserIcon } from "@/components/icons/closer-icon";

// The family member's side of a challenge. Their drawing goes next to Leo's, and both are
// revealed the moment this one is sent (until then, neither sees the other).
export function FamilyChallenge({ sessionId, patientId, title, theme, emoji }: { sessionId: string; patientId: string; title: string; theme: string | null; emoji: string }) {
  const [drawing, setDrawing] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-4 text-center">
        <span aria-hidden className="animate-heart text-role-family-ink">
          <CloserIcon name="challenge" className="size-28" strokeWidth={1.5} />
        </span>
        <h1 role="status" className="text-3xl font-extrabold">
          Revealed! Leo can see both drawings now.
        </h1>
        <Link href="/family" className="flex min-h-12 items-center rounded-full bg-role-family-ink px-6 font-bold text-white">
          See them side by side
        </Link>
      </div>
    );
  }

  if (drawing) {
    return (
      <>
        <DrawingCanvas
          theme={theme ?? title}
          doneLabel="Send to Leo"
          onCancel={() => setDrawing(false)}
          onDone={async (blob) => {
            setError(null);
            const path = `${patientId}/${sessionId}/partner.${blob.type === "image/webp" ? "webp" : "jpg"}`;
            const { error: uploadError } = await createClient().storage.from("activity-results").upload(path, blob, { contentType: blob.type });
            if (uploadError) return setError("Sending didn't work. Try again?");
            const r = await submitChallengeEntry(sessionId, path);
            if (!r.ok) return setError(r.error);
            setDrawing(false);
            setDone(true);
          }}
        />
        {error && <p role="alert" className="fixed inset-x-4 bottom-32 z-50 rounded-2xl bg-alert-soft px-4 py-3 text-center font-bold text-alert">{error}</p>}
      </>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 rounded-3xl bg-role-family-soft p-6 text-center">
      <span aria-hidden className="text-8xl">
        {emoji}
      </span>
      <p className="flex items-center gap-1.5 font-bold text-role-family-ink"><CloserIcon name="challenge" /> Leo challenged you</p>
      <h1 className="text-3xl font-extrabold">{title}</h1>
      {theme && <p className="text-xl">“{theme}”</p>}
      <p className="flex items-center gap-1.5 text-muted-foreground"><CloserIcon name="lock" /> Leo&apos;s drawing is hidden until you send yours. Then you both see them side by side.</p>
      <button type="button" onClick={() => setDrawing(true)} className="min-h-14 w-full rounded-2xl bg-role-family-ink text-xl font-extrabold text-white">
        Draw mine ▶
      </button>
    </div>
  );
}
