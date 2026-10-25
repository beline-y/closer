"use client";

import { ImagePlus, Loader2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { addDrawing } from "@/app/care-ai-actions";
import { cn } from "@/lib/utils";

const MAX_SIDE = 1024;

/** A JPEG of at most 1024 px on the long side, as base64 (no data: prefix). */
async function shrink(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#fff"; // transparent areas are paper
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

// Add a drawing the child made today: a photo or a scan. Claude describes it, the image is not kept.
export function DrawingUpload({ patientId, nickname }: { patientId: string; nickname: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        startSaving(async () => {
          try {
            const result = await addDrawing(patientId, await shrink(file), title);
            setMessage(result.ok ? { ok: true, text: "Added. The summary includes it." } : { ok: false, text: result.error });
            if (result.ok) {
              setFile(null);
              setTitle("");
              if (input.current) input.current.value = "";
            }
          } catch {
            setMessage({ ok: false, text: "This image can't be read. Try a JPEG or PNG photo." });
          }
        });
      }}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <ImagePlus className="size-5 text-role-care-ink" aria-hidden />
        <h2 className="font-heading text-lg font-extrabold">Add today&apos;s drawing</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">Photo or scan</span>
          <input
            ref={input}
            type="file"
            accept="image/*"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setMessage(null);
            }}
            className="min-h-11 rounded-lg border bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-role-care-soft file:px-3 file:py-1 file:font-bold file:text-role-care-ink"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold">
            Title <span className="font-normal text-muted-foreground">if {nickname} gave one</span>
          </span>
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} className="min-h-11 rounded-lg border bg-background px-3" />
        </label>
        <button type="submit" disabled={!file || saving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {saving ? "Claude is looking…" : "Add drawing"}
        </button>
      </div>
      <p aria-live="polite" className={cn("text-sm", message && !message.ok ? "font-bold text-alert" : "text-muted-foreground")}>
        {message?.text ?? "Claude describes what is drawn and the colors are measured. The image itself is not kept."}
      </p>
    </form>
  );
}
