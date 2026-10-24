import type { ReactNode } from "react";
import { MoodDot } from "@/components/kit/mood-dot";
import { activitySummary, LIKINGS, ratedDishLine } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

// A check-in as the patient and the family see it (the photo only exists for them).
export function CheckInCard({ checkin, size = "md", title, children, className }: { checkin: CheckInView; size?: "md" | "lg"; title?: ReactNode; children?: ReactNode; className?: string }) {
  const activity = activitySummary(checkin.activities, checkin.activityNote);
  return (
    <div className={cn("flex flex-col gap-3 overflow-hidden rounded-2xl bg-role-patient-soft", className)}>
      {checkin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
        <img src={checkin.photoUrl} alt="Photo of the day" className={cn("w-full object-cover", size === "lg" ? "max-h-80" : "max-h-64")} loading="lazy" />
      )}
      <div className="flex flex-col gap-2 px-4 pb-4 first:pt-4">
        {title}
        <MoodDot value={checkin.mood} className={cn("font-bold", size === "lg" ? "text-xl" : "text-lg")} />
        {checkin.note && <p className={size === "lg" ? "text-xl" : "text-lg"}>“{checkin.note}”</p>}
        {activity && <p className="text-sm text-muted-foreground">{activity}</p>}
        {checkin.dishes.length > 0 && (
          <ul aria-label="Meals" className="flex flex-col gap-0.5 text-sm text-muted-foreground">
            {checkin.dishes.map((d) => (
              <li key={`${d.meal}-${d.dish}`}>
                <span aria-hidden>{d.icon} </span>
                {ratedDishLine(d)} <span aria-hidden>{LIKINGS.find((l) => l.value === d.liking)?.emoji}</span>
              </li>
            ))}
          </ul>
        )}
        {children}
      </div>
    </div>
  );
}
