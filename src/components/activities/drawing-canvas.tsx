"use client";

import { Eraser, Loader2, Paintbrush, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Modal } from "@/components/kit/modal";
import { cn } from "@/lib/utils";

type Point = [number, number, number]; // x, y (0..1 of the canvas), pressure
type Stroke = { color: string; size: number; points: Point[] };

// Named, so a screen reader says "Red", not "#ef4444".
const COLORS = [
  { value: "#111827", name: "Black" },
  { value: "#ef4444", name: "Red" },
  { value: "#f97316", name: "Orange" },
  { value: "#facc15", name: "Yellow" },
  { value: "#22c55e", name: "Green" },
  { value: "#0ea5e9", name: "Light blue" },
  { value: "#6366f1", name: "Blue" },
  { value: "#a855f7", name: "Purple" },
  { value: "#ec4899", name: "Pink" },
  { value: "#92400e", name: "Brown" },
];
const SIZES = [
  { value: 4, label: "Thin" },
  { value: 10, label: "Medium" },
  { value: 24, label: "Thick" },
];
const BACKGROUND = "#ffffff";
const MAX_SIDE = 1600; // exported image, never bigger

// Full-screen drawing for finger and stylus (pressure-aware). Strokes are stored in canvas
// units (0..1), so undo and resizing redraw them crisply. Exports a WebP with no metadata.
export function DrawingCanvas({ theme, onDone, onCancel, doneLabel = "I'm done!" }: { theme?: string | null; onDone: (image: Blob) => Promise<void> | void; onCancel: () => void; doneLabel?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Stroke[]>([]);
  const current = useRef<Stroke | null>(null);
  const [color, setColor] = useState(COLORS[0].value);
  const [size, setSize] = useState(SIZES[1].value);
  const [eraser, setEraser] = useState(false);
  const [count, setCount] = useState(0); // re-renders the toolbar (undo enabled, etc.)
  const [saving, setSaving] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const s of [...strokes.current, ...(current.current ? [current.current] : [])]) drawStroke(ctx, s, canvas.width, canvas.height);
  }, []);

  // Size the drawing surface to its box (device pixels, capped), keep a 4:3 page.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const box = canvas.parentElement!.getBoundingClientRect();
      const cssW = Math.min(box.width, (box.height * 4) / 3);
      const cssH = (cssW * 3) / 4;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      const scale = Math.min(window.devicePixelRatio || 1, MAX_SIDE / cssW);
      canvas.width = Math.round(cssW * scale);
      canvas.height = Math.round(cssH * scale);
      redraw();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);
    return () => observer.disconnect();
  }, [redraw]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pressure = e.pointerType === "pen" ? Math.max(0.15, e.pressure || 0.5) : 0.5;
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, pressure];
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
        <button type="button" onClick={onCancel} aria-label="Stop drawing" className="flex size-12 items-center justify-center rounded-full hover:bg-muted">
          <X className="size-6" aria-hidden />
        </button>
        {theme && <p className="min-w-0 flex-1 truncate text-center font-heading text-lg font-extrabold">🎨 {theme}</p>}
        <button
          type="button"
          disabled={count === 0 || saving}
          onClick={async () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            setSaving(true);
            const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
            const image = blob && blob.type === "image/webp" ? blob : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9));
            if (image) await onDone(image);
            setSaving(false);
          }}
          className="flex min-h-12 items-center gap-2 rounded-full bg-role-patient px-5 text-lg font-extrabold shadow-sm disabled:opacity-50"
        >
          {saving && <Loader2 className="size-5 animate-spin" aria-hidden />}
          {doneLabel}
        </button>
      </header>

      <div className="flex min-h-0 flex-1 items-center justify-center bg-muted p-3">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={theme ? `Drawing: ${theme}` : "Drawing"}
          className="touch-none rounded-2xl bg-white shadow-md"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            current.current = { color: eraser ? BACKGROUND : color, size: eraser ? size * 2 : size, points: [point(e)] };
            redraw();
          }}
          onPointerMove={(e) => {
            if (!current.current) return;
            const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
            for (const ev of events) {
              const rect = e.currentTarget.getBoundingClientRect();
              const pressure = ev.pointerType === "pen" ? Math.max(0.15, ev.pressure || 0.5) : 0.5;
              current.current.points.push([(ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height, pressure]);
            }
            redraw();
          }}
          onPointerUp={() => {
            if (current.current) strokes.current.push(current.current);
            current.current = null;
            setCount(strokes.current.length);
          }}
          onPointerCancel={() => {
            current.current = null;
            redraw();
          }}
        />
      </div>

      <footer className="flex flex-col gap-2 border-t bg-card px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <div role="radiogroup" aria-label="Color" className="flex justify-center gap-1.5 overflow-x-auto">
          {COLORS.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={!eraser && color === c.value}
              aria-label={c.name}
              title={c.name}
              onClick={() => {
                setColor(c.value);
                setEraser(false);
              }}
              className={cn("size-11 shrink-0 rounded-full ring-offset-2 ring-offset-card transition", !eraser && color === c.value ? "scale-110 ring-4 ring-foreground" : "ring-1 ring-black/10")}
              style={{ backgroundColor: c.value }}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div role="radiogroup" aria-label="Brush size" className="flex gap-1 rounded-full bg-muted p-1">
            {SIZES.map((s) => (
              <button key={s.value} type="button" role="radio" aria-checked={size === s.value} aria-label={s.label} onClick={() => setSize(s.value)} className={cn("flex size-11 items-center justify-center rounded-full", size === s.value && "bg-card shadow")}>
                <span aria-hidden className="rounded-full bg-foreground" style={{ width: s.value / 1.5 + 4, height: s.value / 1.5 + 4 }} />
              </button>
            ))}
          </div>
          <button type="button" aria-pressed={!eraser} onClick={() => setEraser(false)} className={cn("flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold", !eraser ? "bg-role-patient-soft" : "bg-muted")}>
            <Paintbrush className="size-5" aria-hidden /> Brush
          </button>
          <button type="button" aria-pressed={eraser} onClick={() => setEraser(true)} className={cn("flex min-h-11 items-center gap-1.5 rounded-full px-3 font-bold", eraser ? "bg-role-patient-soft" : "bg-muted")}>
            <Eraser className="size-5" aria-hidden /> Eraser
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => {
              strokes.current.pop();
              setCount(strokes.current.length);
              redraw();
            }}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-3 font-bold disabled:opacity-40"
          >
            <Undo2 className="size-5" aria-hidden /> Undo
          </button>
          <button
            type="button"
            disabled={count === 0}
            onClick={() => setConfirmClear(true)}
            className="flex min-h-11 items-center gap-1.5 rounded-full bg-muted px-3 font-bold disabled:opacity-40"
          >
            <Trash2 className="size-5" aria-hidden /> Clear
          </button>
        </div>
      </footer>

      <Modal open={confirmClear} onClose={() => setConfirmClear(false)} title="Clear your drawing? 🗑️">
        <p className="text-lg">Everything on the page goes away. You can&apos;t get it back.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" autoFocus onClick={() => setConfirmClear(false)} className="min-h-14 rounded-2xl bg-role-patient text-lg font-extrabold">
            No, keep it
          </button>
          <button
            type="button"
            onClick={() => {
              strokes.current = [];
              setCount(0);
              setConfirmClear(false);
              redraw();
            }}
            className="min-h-14 rounded-2xl bg-muted text-lg font-bold"
          >
            Yes, clear it
          </button>
        </div>
      </Modal>
    </div>
  );
}

function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  const unit = w / 1000; // brush sizes are relative to the page width
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (s.points.length === 1) {
    const [x, y, p] = s.points[0];
    ctx.beginPath();
    ctx.arc(x * w, y * h, (s.size * unit * (0.5 + p)) / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < s.points.length; i++) {
    const [x0, y0, p0] = s.points[i - 1];
    const [x1, y1, p1] = s.points[i];
    ctx.lineWidth = s.size * unit * (0.5 + (p0 + p1) / 2);
    ctx.beginPath();
    ctx.moveTo(x0 * w, y0 * h);
    ctx.lineTo(x1 * w, y1 * h);
    ctx.stroke();
  }
}
