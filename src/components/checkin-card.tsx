import type { ReactNode } from "react";
import { CloserIcon } from "@/components/icons/closer-icon";
import { MoodFace } from "@/components/icons/mood-face";
import { MoodDot } from "@/components/kit/mood-dot";
import { ACTIVITIES, type ActivityKind, foodScore } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

/** "Drew · Had a visit · Noah called", each activity with its icon. */
export function ActivityLine({ activities, note, className }: { activities: ActivityKind[]; note: string | null; className?: string }) {
  const known = ACTIVITIES.filter((a) => activities.includes(a.value));
  if (known.length === 0 && !note) return null;
  return (
    <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground", className)}>
      {known.map((a) => (
        <span key={a.value} className="inline-flex items-center gap-1">
          <CloserIcon name={a.icon} className="text-role-patient-ink" />
          {a.label}
        </span>
      ))}
      {note && <span>{note}</span>}
    </p>
  );
}

// A check-in as the patient and the family see it (the photo only exists for them).
// plain: no background of its own, for a parent area that already has one.
export function CheckInCard({ checkin, size = "md", title, children, plain, className }: { checkin: CheckInView; size?: "md" | "lg"; title?: ReactNode; children?: ReactNode; plain?: boolean; className?: string }) {
  // One score for the day; dishes and ratings stay with the patient and the family.
  const food = foodScore(checkin.dishes);
  return (
    <div className={cn("flex flex-col gap-3 overflow-hidden", !plain && "rounded-2xl bg-role-patient-soft", className)}>
      {checkin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
        <img src={checkin.photoUrl} alt="Photo of the day" className={cn("w-full object-cover", plain && "rounded-2xl", size === "lg" ? "max-h-80" : "max-h-64")} loading="lazy" />
      )}
      <div className={cn("flex flex-col gap-2", !plain && "px-4 pb-4 first:pt-4")}>
        {title}
        <MoodDot value={checkin.mood} className={cn("font-bold", size === "lg" ? "text-xl" : "text-lg")} />
        {checkin.note && <p className={size === "lg" ? "text-xl" : "text-lg"}>“{checkin.note}”</p>}
        <ActivityLine activities={checkin.activities} note={checkin.activityNote} />
        {food && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            Food today: <MoodFace value={food.value} /> <span className="font-bold text-foreground">{food.label}</span>
          </p>
        )}
        {children}
      </div>
    </div>
  );
}
