"use client";

import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { saveCheckin } from "@/app/checkin-actions";
import { MoodPicker } from "@/components/kit/mood-picker";
import { ACTIVITIES, type ActivityKind, type CheckInInput, MEAL_AMOUNTS, type MealAmount, type MealKind, MEALS } from "@/lib/checkin";
import { preparePhoto } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type CheckInDraft = Omit<CheckInInput, "photoPath"> & { photoUrl: string | null };

const STEPS = ["mood", "photo", "meal", "activity", "note"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  mood: "How do you feel?",
  photo: "A photo of your day?",
  meal: "What did you eat?",
  activity: "What did you do?",
  note: "Something to tell your family?",
};

// Phone: one question per screen with progress dots and Skip. Tablet and up: one screen.
// Only the mood is required. The photo is resized and stripped of EXIF before upload.
export function CheckInFlow({ patientId, initial }: { patientId: string; initial: CheckInDraft | null }) {
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [meals, setMeals] = useState<MealKind[]>(initial?.meals ?? []);
  const [mealAmount, setMealAmount] = useState<MealAmount | null>(initial?.mealAmount ?? null);
  const [mealNote, setMealNote] = useState(initial?.mealNote ?? "");
  const [activities, setActivities] = useState<ActivityKind[]>(initial?.activities ?? []);
  const [activityNote, setActivityNote] = useState(initial?.activityNote ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoPath, setPhotoPath] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [saving, startSaving] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Next keeps visited pages alive (hidden) in <Activity>: start over when this page hides,
  // so coming back to "Edit" shows the form, not the last celebration.
  useLayoutEffect(
    () => () => {
      setDone(false);
      setStep(0);
      setError(null);
    },
    [],
  );

  // A photo uploaded in this visit but replaced or removed before saving is deleted right away.
  function discardUnsavedPhoto() {
    if (photoPath) void createClient().storage.from("checkin-photos").remove([photoPath]);
  }

  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const last = step === STEPS.length - 1;

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setError(null);
    setUploading(true);
    try {
      const blob = await preparePhoto(file);
      const ext = blob.type === "image/webp" ? "webp" : "jpg";
      const path = `${patientId}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await createClient().storage.from("checkin-photos").upload(path, blob, { contentType: blob.type });
      if (uploadError) throw uploadError;
      discardUnsavedPhoto();
      setPhotoPreview(URL.createObjectURL(blob));
      setPhotoPath(path);
    } catch {
      setError("That photo didn't work. Try another one?");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!mood) {
      setStep(0);
      setError("Pick how you feel first 🙂");
      return;
    }
    setError(null);
    startSaving(async () => {
      const result = await saveCheckin({ mood, meals, mealAmount, mealNote, activities, activityNote, note, photoPath });
      if (result.ok) setDone(true);
      else setError(result.error);
    });
  }

  if (done) return <Celebration />;

  const section = (s: Step, i: number, children: React.ReactNode) => (
    <section
      key={s}
      aria-labelledby={`step-${s}`}
      className={cn("flex flex-col gap-4 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-border", s === "mood" && "md:col-span-2", i !== step && "max-md:hidden", "max-md:animate-rise")}
    >
      <h2 id={`step-${s}`} className="text-2xl font-extrabold">
        {TITLES[s]}
        {s !== "mood" && <span className="ml-2 text-base font-normal text-muted-foreground">(if you want)</span>}
      </h2>
      {children}
    </section>
  );

  const chip = (active: boolean) =>
    cn(
      "flex min-h-14 items-center gap-2 rounded-2xl border-2 px-4 text-lg font-bold transition active:scale-95",
      active ? "border-role-patient-ink bg-role-patient-soft" : "border-transparent bg-muted",
    );

  return (
    <div className="flex flex-col gap-5">
      {/* Progress dots (phone only) */}
      <ol aria-label={`Step ${step + 1} of ${STEPS.length}`} className="flex justify-center gap-2 md:hidden">
        {STEPS.map((s, i) => (
          <li key={s} aria-hidden className={cn("h-3 rounded-full transition-all", i === step ? "w-8 bg-role-patient-ink" : i < step ? "w-3 bg-role-patient" : "w-3 bg-muted")} />
        ))}
      </ol>

      <div className="grid gap-5 md:grid-cols-2">
        {section(
          "mood",
          0,
          <MoodPicker
            value={mood}
            onChange={(m) => {
              setMood(m);
              setError(null);
            }}
          />,
        )}

        {section(
          "photo",
          1,
          <div className="flex flex-col gap-3">
            {photoPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- signed URL or local preview */}
                <img src={photoPreview} alt="Your photo" className="max-h-72 w-full rounded-2xl object-cover" />
                <button
                  type="button"
                  onClick={() => {
                    discardUnsavedPhoto();
                    setPhotoPreview(null);
                    setPhotoPath(null);
                  }}
                  aria-label="Remove the photo"
                  className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-full bg-card/90 shadow"
                >
                  <X className="size-5" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => cameraInput.current?.click()} disabled={uploading} className={cn(chip(false), "min-h-24 flex-col justify-center")}>
                  <Camera className="size-8" aria-hidden /> Take a photo
                </button>
                <button type="button" onClick={() => galleryInput.current?.click()} disabled={uploading} className={cn(chip(false), "min-h-24 flex-col justify-center")}>
                  <ImageIcon className="size-8" aria-hidden /> From my photos
                </button>
              </div>
            )}
            {uploading && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden /> Getting your photo ready…
              </p>
            )}
            <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => onPhoto(e.target.files?.[0])} />
            <input ref={galleryInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={(e) => onPhoto(e.target.files?.[0])} />
            <p className="text-sm text-muted-foreground">Only your family sees it. We remove the location hidden in photos.</p>
          </div>,
        )}

        {section(
          "meal",
          2,
          <div className="flex flex-col gap-4">
            <div role="group" aria-label="Meals" className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {MEALS.map((m) => (
                <button key={m.value} type="button" aria-pressed={meals.includes(m.value)} onClick={() => setMeals(toggle(meals, m.value))} className={cn(chip(meals.includes(m.value)), "flex-col justify-center py-2")}>
                  <span aria-hidden className="text-4xl">
                    {m.emoji}
                  </span>
                  {m.label}
                </button>
              ))}
            </div>
            <div role="group" aria-label="How much I ate" className="flex flex-wrap gap-2">
              {MEAL_AMOUNTS.map((a) => (
                <button key={a.value} type="button" aria-pressed={mealAmount === a.value} onClick={() => setMealAmount(mealAmount === a.value ? null : a.value)} className={chip(mealAmount === a.value)}>
                  <span aria-hidden>{a.emoji}</span> {a.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold">What was it?</span>
              <input value={mealNote} onChange={(e) => setMealNote(e.target.value)} maxLength={120} placeholder="Pasta with cheese…" className="min-h-14 rounded-2xl border bg-background px-4 text-lg" />
            </label>
          </div>,
        )}

        {section(
          "activity",
          3,
          <div className="flex flex-col gap-4">
            <div role="group" aria-label="Activities" className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <button key={a.value} type="button" aria-pressed={activities.includes(a.value)} onClick={() => setActivities(toggle(activities, a.value))} className={chip(activities.includes(a.value))}>
                  <span aria-hidden className="text-2xl">
                    {a.emoji}
                  </span>
                  {a.label}
                </button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="font-bold">Tell more</span>
              <input value={activityNote} onChange={(e) => setActivityNote(e.target.value)} maxLength={120} placeholder="I played Uno with Sarah…" className="min-h-14 rounded-2xl border bg-background px-4 text-lg" />
            </label>
          </div>,
        )}

        {section(
          "note",
          4,
          <label className="flex flex-col gap-1.5">
            <span className="sr-only">Your note</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={280} placeholder="Type here…" className="rounded-2xl border bg-background p-4 text-lg" />
            <span className="text-sm text-muted-foreground">Your family and care team can read this. If your grown-up enables daily support, our AI helper reads shared check-ins too. Photos stay out of AI reviews.</span>
            <span className="text-right text-sm text-muted-foreground tabular-nums">{note.length}/280</span>
          </label>,
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-alert-soft px-4 py-3 text-center text-lg font-bold text-alert">
          {error}
        </p>
      )}

      {/* Phone navigation */}
      <div className="flex items-center gap-3 md:hidden">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="min-h-14 rounded-2xl bg-muted px-5 text-lg font-bold">
            Back
          </button>
        )}
        {step > 0 && !last && (
          <button type="button" onClick={() => setStep(step + 1)} className="min-h-14 rounded-2xl px-4 text-lg font-bold text-muted-foreground">
            Skip
          </button>
        )}
        <button
          type="button"
          disabled={saving || uploading || (step === 0 && !mood)}
          onClick={() => (last ? submit() : setStep(step + 1))}
          className="ml-auto min-h-14 flex-1 rounded-2xl bg-role-patient text-xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "Sending…" : last ? "Send to my family 💛" : "Next"}
        </button>
      </div>

      {/* Tablet and desktop: one button */}
      <button
        type="button"
        disabled={saving || uploading || !mood}
        onClick={submit}
        className="hidden min-h-16 rounded-2xl bg-role-patient text-2xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50 md:block"
      >
        {saving ? "Sending…" : "Send to my family 💛"}
      </button>
    </div>
  );
}

function Celebration() {
  const confetti = ["🎉", "💛", "⭐", "🌈", "🎈", "💛", "✨", "🎉"];
  return (
    <div className="relative flex min-h-[60dvh] flex-col items-center justify-center gap-5 overflow-hidden text-center">
      {confetti.map((c, i) => (
        <span key={i} aria-hidden className="absolute animate-rise text-4xl" style={{ left: `${8 + i * 12}%`, top: `${10 + ((i * 37) % 60)}%`, animationDelay: `${i * 80}ms` }}>
          {c}
        </span>
      ))}
      <span aria-hidden className="animate-heart text-9xl">
        🥳
      </span>
      <h1 role="status" className="text-4xl font-extrabold">
        Your family will see it!
      </h1>
      <Link href="/patient" className="flex min-h-14 items-center rounded-2xl bg-role-patient px-8 text-xl font-extrabold shadow-sm">
        Back to Today
      </Link>
    </div>
  );
}
