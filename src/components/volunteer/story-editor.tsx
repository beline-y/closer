"use client";

import { useState } from "react";
import { VolunteerCard } from "@/components/kit/volunteer-card";
import { type VolunteerStory, VOLUNTEER_STORIES } from "@/lib/demo-fixtures";

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

// Editable bio with a live preview of what a patient sees. Saved for this visit only.
export function StoryEditor({ me }: { me: "maya" | "daniel" }) {
  const [story, setStory] = useState<VolunteerStory>(VOLUNTEER_STORIES[me]);
  const [passions, setPassions] = useState(story.passions.join(", "));
  const [languages, setLanguages] = useState(story.languages.join(", "));
  const [saved, setSaved] = useState(false);
  const preview = { ...story, passions: list(passions), languages: list(languages) };

  const field = (key: "firstName" | "job" | "dreams" | "funFact", label: string, max = 80) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={key} className="font-bold">
        {label}
      </label>
      <input
        id={key}
        value={story[key]}
        maxLength={max}
        onChange={(e) => {
          setStory((s) => ({ ...s, [key]: e.target.value }));
          setSaved(false);
        }}
        className="min-h-12 rounded-xl border bg-background px-4"
      />
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(true);
        }}
        className="flex flex-col gap-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "First name", 30)}
          {field("job", "Job")}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="avatar" className="font-bold">
            Photo
          </label>
          <p className="text-sm text-muted-foreground">Real photo upload comes with the volunteers feature. Pick an emoji for now.</p>
          <div id="avatar" role="radiogroup" aria-label="Avatar" className="flex flex-wrap gap-2">
            {["🐬", "🐳", "🪸", "🌊", "🔬", "🐢"].map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={story.avatar === a}
                onClick={() => setStory((s) => ({ ...s, avatar: a }))}
                className={`flex size-12 items-center justify-center rounded-full text-2xl ${story.avatar === a ? "bg-role-volunteer-soft ring-2 ring-role-volunteer-ink" : "bg-muted"}`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="story" className="font-bold">
            Short story
          </label>
          <textarea
            id="story"
            value={story.story}
            maxLength={500}
            rows={4}
            onChange={(e) => {
              setStory((s) => ({ ...s, story: e.target.value }));
              setSaved(false);
            }}
            className="rounded-xl border bg-background p-4"
          />
          <p className="text-right text-sm text-muted-foreground tabular-nums">{story.story.length}/500</p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="passions" className="font-bold">
            Passions <span className="font-normal text-muted-foreground">(comma separated)</span>
          </label>
          <input id="passions" value={passions} onChange={(e) => setPassions(e.target.value)} className="min-h-12 rounded-xl border bg-background px-4" />
        </div>
        {field("dreams", "A dream you still have", 160)}
        {field("funFact", "Fun fact", 160)}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="languages" className="font-bold">
            Languages <span className="font-normal text-muted-foreground">(comma separated)</span>
          </label>
          <input id="languages" value={languages} onChange={(e) => setLanguages(e.target.value)} className="min-h-12 rounded-xl border bg-background px-4" />
        </div>
        <button type="submit" className="min-h-14 rounded-2xl bg-role-volunteer-ink text-lg font-extrabold text-white">
          Save my story
        </button>
        {saved && (
          <p aria-live="polite" className="animate-rise font-bold text-success">
            Saved for this visit. The care team reviews changes before kids see them.
          </p>
        )}
      </form>

      <section aria-labelledby="preview-title" className="flex flex-col gap-3 lg:sticky lg:top-24 lg:self-start">
        <h2 id="preview-title" className="text-lg font-extrabold">
          👀 What a young explorer sees
        </h2>
        <VolunteerCard story={preview} />
      </section>
    </div>
  );
}
