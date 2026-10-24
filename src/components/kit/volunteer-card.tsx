import type { ReactNode } from "react";
import type { VolunteerStory } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

// The volunteer's "My story" card, exactly as a patient sees it.
// Optional answer on top (shown after the patient answered the same question).
export function VolunteerCard({ story, answer, children, className }: { story: VolunteerStory; answer?: string; children?: ReactNode; className?: string }) {
  return (
    <article className={cn("flex flex-col gap-4 overflow-hidden rounded-3xl bg-card shadow-sm ring-1 ring-role-volunteer/30", className)}>
      <header className="flex items-center gap-4 bg-role-volunteer-soft p-4">
        <span aria-hidden className="flex size-16 shrink-0 items-center justify-center rounded-full bg-card text-4xl ring-4 ring-role-volunteer">
          {story.avatar}
        </span>
        <div className="flex min-w-0 flex-col">
          <h3 className="text-2xl font-extrabold break-words">{story.firstName || "Your first name"}</h3>
          <p className="font-bold text-role-volunteer-ink">{story.job || "Your job"}</p>
        </div>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-4">
        {answer && (
          <blockquote className="rounded-2xl bg-role-volunteer-soft/60 p-4 text-lg leading-relaxed">
            <span aria-hidden>💬 </span>
            {answer}
          </blockquote>
        )}
        {story.story && <p className="leading-relaxed">{story.story}</p>}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {story.passions.length > 0 && (
            <div>
              <dt className="font-bold">❤️ Loves</dt>
              <dd className="text-muted-foreground">{story.passions.join(", ")}</dd>
            </div>
          )}
          {story.dreams && (
            <div>
              <dt className="font-bold">🌟 Dream</dt>
              <dd className="text-muted-foreground">{story.dreams}</dd>
            </div>
          )}
          {story.funFact && (
            <div>
              <dt className="font-bold">😄 Fun fact</dt>
              <dd className="text-muted-foreground">{story.funFact}</dd>
            </div>
          )}
          {story.languages.length > 0 && (
            <div>
              <dt className="font-bold">🗣️ Speaks</dt>
              <dd className="text-muted-foreground">{story.languages.join(", ")}</dd>
            </div>
          )}
        </dl>
        {children}
      </div>
    </article>
  );
}
