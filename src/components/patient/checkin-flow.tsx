"use client";

import { Camera, ImageIcon, Loader2, X } from "lucide-react";
import Link from "next/link";
import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { saveCheckin } from "@/app/checkin-actions";
import { CloserIcon, type IconName } from "@/components/icons/closer-icon";
import { MoodFace } from "@/components/icons/mood-face";
import { MoodPicker } from "@/components/kit/mood-picker";
import { ACTIVITIES, type ActivityKind, type CheckInInput, type DishRating, LIKINGS, MEAL_AMOUNTS, MEALS, type MenuDish } from "@/lib/checkin";
import type { Streak } from "@/lib/streak";
import { MILESTONES } from "@/lib/streak";
import { preparePhoto } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export type CheckInDraft = Omit<CheckInInput, "photoPath"> & { photoUrl: string | null };

const STEPS = ["mood", "photo", "meal", "activity", "note"] as const;
type Step = (typeof STEPS)[number];
const TITLES: Record<Step, string> = {
  mood: "How do you feel?",
  photo: "A photo of your day?",
  meal: "How was your food?",
  activity: "What did you do?",
  note: "Something to tell your family?",
};

// Phone: one question per screen with progress dots and Skip. Tablet and up: one screen.
// Only the mood is required. The photo is resized and stripped of EXIF before upload.
export function CheckInFlow({ patientId, initial, menu, doneActivities }: { patientId: string; initial: CheckInDraft | null; menu: MenuDish[]; doneActivities: ActivityKind[] }) {
  const [step, setStep] = useState(0);
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [ratings, setRatings] = useState<DishRating[]>(initial?.ratings ?? []);
  // Activities finished in the app today count automatically.
  const [activities, setActivities] = useState<ActivityKind[]>([...new Set([...(initial?.activities ?? []), ...doneActivities])]);
  const [activityNote, setActivityNote] = useState(initial?.activityNote ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(initial?.photoUrl ?? null);
  const [photoPath, setPhotoPath] = useState<string | null | undefined>(undefined);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Streak | null>(null);
  const [saving, startSaving] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);

  // Next keeps visited pages alive (hidden) in <Activity>: start over when this page hides,
  // so coming back to "Edit" shows the form, not the last celebration.
  useLayoutEffect(
    () => () => {
      setDone(null);
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
      setError("Pick how you feel first.");
      return;
    }
    setError(null);
    startSaving(async () => {
      const result = await saveCheckin({ mood, ratings, activities, activityNote, note, photoPath });
      if (result.ok) setDone(result.streak);
      else setError(result.error);
    });
  }

  if (done) return <Celebration streak={done} />;

  const rate = (menuItemId: string, patch: Partial<DishRating>) =>
    setRatings((all) => {
      const current = all.find((r) => r.menuItemId === menuItemId) ?? { menuItemId, liking: null, amount: null };
      return [...all.filter((r) => r.menuItemId !== menuItemId), { ...current, ...patch }];
    });

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
          menu.length === 0 ? (
            <p className="text-lg text-muted-foreground">No menu today. Tell your family what you ate in your note.</p>
          ) : (
            <div className="flex flex-col gap-5">
              {MEALS.filter((m) => menu.some((d) => d.meal === m.value)).map((meal) => (
                <div key={meal.value} className="flex flex-col gap-3">
                  <h3 className="text-lg font-extrabold">{meal.label}</h3>
                  {menu
                    .filter((d) => d.meal === meal.value)
                    .map((dish) => {
                      const r = ratings.find((x) => x.menuItemId === dish.id);
                      return (
                        <div key={dish.id} className="flex flex-col gap-3 rounded-2xl bg-muted/60 p-3">
                          <p className="flex items-center gap-3 text-lg font-bold">
                            <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-full bg-card text-role-patient-ink">
                              <CloserIcon name={meal.icon} className="size-6" />
                            </span>
                            {dish.dish}
                          </p>
                          <div role="radiogroup" aria-label={`Did you like the ${dish.dish}?`} className="grid grid-cols-5 gap-1.5">
                            {LIKINGS.map((l) => (
                              <button
                                key={l.value}
                                type="button"
                                role="radio"
                                aria-checked={r?.liking === l.value}
                                aria-label={l.label}
                                onClick={() => rate(dish.id, { liking: r?.liking === l.value ? null : l.value })}
                                className={cn(
                                  "flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-xl py-1 transition active:scale-90",
                                  r?.liking === l.value ? "bg-card shadow ring-2 ring-role-patient-ink" : "bg-card/60",
                                )}
                              >
                                <MoodFace value={l.value} className={cn("size-8", r?.liking === l.value && "animate-pop")} />
                                <span className="text-[0.7rem] font-bold">{l.label}</span>
                              </button>
                            ))}
                          </div>
                          <div role="radiogroup" aria-label={`How much ${dish.dish} did you eat?`} className="flex flex-wrap gap-1.5">
                            {MEAL_AMOUNTS.map((a) => (
                              <button
                                key={a.value}
                                type="button"
                                role="radio"
                                aria-checked={r?.amount === a.value}
                                onClick={() => rate(dish.id, { amount: r?.amount === a.value ? null : a.value })}
                                className={cn(chip(r?.amount === a.value), "min-h-11 px-3 text-base")}
                              >
                                {a.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
          ),
        )}

        {section(
          "activity",
          3,
          <div className="flex flex-col gap-4">
            <div role="group" aria-label="Activities" className="flex flex-wrap gap-2">
              {ACTIVITIES.map((a) => (
                <button key={a.value} type="button" aria-pressed={activities.includes(a.value)} onClick={() => setActivities(toggle(activities, a.value))} className={chip(activities.includes(a.value))}>
                  <CloserIcon name={a.icon} className="size-5" />
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
            <span className="text-sm text-muted-foreground">Your family and care team can read this.</span>
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
          {saving ? "Sending…" : last ? "Send to my family" : "Next"}
        </button>
      </div>

      {/* Tablet and desktop: one button */}
      <button
        type="button"
        disabled={saving || uploading || !mood}
        onClick={submit}
        className="hidden min-h-16 rounded-2xl bg-role-patient text-2xl font-extrabold shadow-sm transition active:scale-[0.98] disabled:opacity-50 md:block"
      >
        {saving ? "Sending…" : "Send to my family"}
      </button>
    </div>
  );
}

// Celebrates, never punishes: total days connected, a flame that grows, milestone badges,
// and "Welcome back!" after a break.
function Celebration({ streak }: { streak: Streak }) {
  const confetti: { icon: IconName; tone: string }[] = [
    { icon: "party", tone: "text-mood-5" },
    { icon: "heart", tone: "text-role-family" },
    { icon: "star", tone: "text-mood-4" },
    { icon: "sparkles", tone: "text-role-volunteer" },
    { icon: "party", tone: "text-role-care" },
    { icon: "heart", tone: "text-role-family" },
    { icon: "sparkles", tone: "text-mood-4" },
    { icon: "star", tone: "text-mood-5" },
  ];
  const milestone = streak.milestoneToday;
  const flameSize = Math.min(9, 4 + streak.totalDays / 5); // rem, grows with the days
  return (
    <div className="relative flex min-h-[60dvh] flex-col items-center justify-center gap-4 overflow-hidden text-center">
      {/* Reserve space for the decoration so it cannot cover the message or controls. */}
      <div aria-hidden className="pointer-events-none flex h-12 w-full max-w-lg shrink-0 select-none items-center justify-around gap-2">
        {confetti.map((c, i) => (
          <span key={i} className={cn("animate-rise", c.tone)} style={{ animationDelay: `${i * 80}ms` }}>
            <CloserIcon name={c.icon} className="size-6 sm:size-8" />
          </span>
        ))}
      </div>
      <span aria-hidden className="animate-heart leading-none text-mood-5" style={{ fontSize: `${flameSize}rem` }}>
        <CloserIcon name={milestone ? milestone.icon : "streak"} className="size-[1em]" strokeWidth={1.5} />
      </span>
      <div role="status" className="flex flex-col gap-2">
        <h1 className="text-4xl font-extrabold">{streak.welcomeBack ? "Welcome back!" : `Connected for ${streak.totalDays} ${streak.totalDays === 1 ? "day" : "days"}!`}</h1>
        {streak.welcomeBack && <p className="text-xl">That&apos;s {streak.totalDays} days connected in all. We missed you!</p>}
        {milestone && (
          <p className="mx-auto flex animate-pop items-center gap-2 rounded-full bg-role-patient-soft px-5 py-2 text-xl font-extrabold text-role-patient-ink">
            New badge: <CloserIcon name={milestone.icon} /> {milestone.name}
          </p>
        )}
        <p className="text-lg text-muted-foreground">
          Your family will see it!
          {!streak.welcomeBack && streak.streakDays > 1 && ` ${streak.streakDays} days in a row${streak.restDays ? " (rest days count too)" : ""}.`}
        </p>
        {streak.next && !milestone && (
          <p className="flex items-center justify-center gap-1.5 text-muted-foreground">
            {streak.next.daysToGo === 1 ? "Tomorrow" : `In ${streak.next.daysToGo} days`}: <CloserIcon name={streak.next.milestone.icon} /> {streak.next.milestone.name}
          </p>
        )}
      </div>
      <ul aria-label="Badges" className="flex gap-2">
        {MILESTONES.map((m) => (
          <li key={m.days} title={m.name} className={cn("flex size-12 items-center justify-center rounded-full", streak.totalDays >= m.days ? "bg-role-patient-soft text-role-patient-ink" : "bg-muted text-muted-foreground opacity-50")}>
            <CloserIcon name={m.icon} className="size-6" />
            <span className="sr-only">
              {m.name} ({m.days} days){streak.totalDays >= m.days ? ", earned" : ""}
            </span>
          </li>
        ))}
      </ul>
      <Link href="/patient" className="flex min-h-14 items-center rounded-2xl bg-role-patient px-8 text-xl font-extrabold shadow-sm">
        Back to Today
      </Link>
    </div>
  );
}
