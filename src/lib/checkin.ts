import type { Database } from "@/lib/supabase/database.types";

// Options of the daily check-in, shared by the patient flow, the family feed and the care team.
export type MealKind = Database["public"]["Enums"]["meal_kind"];
export type MealAmount = Database["public"]["Enums"]["meal_amount"];
export type ActivityKind = Database["public"]["Enums"]["activity_kind"];

export const MEALS: { value: MealKind; emoji: string; label: string }[] = [
  { value: "breakfast", emoji: "🥣", label: "Breakfast" },
  { value: "lunch", emoji: "🍝", label: "Lunch" },
  { value: "dinner", emoji: "🍲", label: "Dinner" },
  { value: "snack", emoji: "🍎", label: "Snack" },
];

export const MEAL_AMOUNTS: { value: MealAmount; emoji: string; label: string }[] = [
  { value: "all", emoji: "😋", label: "All of it" },
  { value: "half", emoji: "🙂", label: "Half" },
  { value: "a_little", emoji: "🤏", label: "A little" },
];

export const ACTIVITIES: { value: ActivityKind; emoji: string; label: string }[] = [
  { value: "played", emoji: "🎲", label: "Played" },
  { value: "movie", emoji: "🎬", label: "Watched a movie" },
  { value: "drew", emoji: "🎨", label: "Drew" },
  { value: "school", emoji: "📚", label: "School work" },
  { value: "visit", emoji: "👨‍👩‍👦", label: "Had a visit" },
  { value: "treatment", emoji: "💉", label: "Exam or treatment" },
  { value: "rested", emoji: "😴", label: "Rested" },
  { value: "walk", emoji: "🚶", label: "Went for a walk" },
];

export const REACTIONS = ["❤️", "🤗", "⭐", "💪", "😂"] as const;
export type ReactionEmoji = (typeof REACTIONS)[number];

/** What the patient sends. photoPath: undefined = unchanged, null = removed. */
export type CheckInInput = {
  mood: number;
  meals: MealKind[];
  mealAmount: MealAmount | null;
  mealNote: string;
  activities: ActivityKind[];
  activityNote: string;
  note: string;
  photoPath?: string | null;
};

export function mealSummary(meals: MealKind[], amount: MealAmount | null, note: string | null): string {
  const parts = [
    meals.length ? meals.map((m) => MEALS.find((x) => x.value === m)?.label.toLowerCase()).join(", ") : null,
    amount ? `ate ${MEAL_AMOUNTS.find((a) => a.value === amount)?.label.toLowerCase()}` : null,
    note,
  ].filter(Boolean);
  return parts.join(" · ");
}

/** "🎨 Drew · 👨‍👩‍👦 Had a visit · Noah called" (each activity with its own icon). */
export function activitySummary(activities: ActivityKind[], note: string | null): string {
  const labels = activities.map((a) => {
    const x = ACTIVITIES.find((y) => y.value === a);
    return x ? `${x.emoji} ${x.label}` : null;
  });
  return [...labels, note].filter(Boolean).join(" · ");
}
