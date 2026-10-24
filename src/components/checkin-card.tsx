import type { ReactNode } from "react";
import { MoodDot } from "@/components/kit/mood-dot";
import { activitySummary, mealSummary } from "@/lib/checkin";
import type { CheckInView } from "@/lib/data/checkins";
import { cn } from "@/lib/utils";

// A check-in as the patient and the family see it (the photo only exists for them).
export function CheckInCard({ checkin, size = "md", children, className }: { checkin: CheckInView; size?: "md" | "lg"; children?: ReactNode; className?: string }) {
  const meal = mealSummary(checkin.meals, checkin.mealAmount, checkin.mealNote);
  const activity = activitySummary(checkin.activities, checkin.activityNote);
  return (
    <div className={cn("flex flex-col gap-3 overflow-hidden rounded-2xl bg-role-patient-soft", className)}>
      {checkin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from a private bucket
        <img src={checkin.photoUrl} alt="Photo of the day" className={cn("w-full object-cover", size === "lg" ? "max-h-80" : "max-h-64")} loading="lazy" />
      )}
      <div className="flex flex-col gap-2 px-4 pb-4 first:pt-4">
        <MoodDot value={checkin.mood} className={cn("font-bold", size === "lg" ? "text-xl" : "text-lg")} />
        {checkin.note && <p className={size === "lg" ? "text-xl" : "text-lg"}>“{checkin.note}”</p>}
        {activity && <p className="text-sm text-muted-foreground">{activity}</p>}
        {meal && <p className="text-sm text-muted-foreground">🍴 {meal}</p>}
        {children}
      </div>
    </div>
  );
}
