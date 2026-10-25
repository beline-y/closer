import type { IconName } from "@/components/icons/closer-icon";
import type { Database } from "@/lib/supabase/database.types";

// Options of the daily check-in, shared by the patient flow, the family feed and the care team.
export type MealKind = Database["public"]["Enums"]["meal_kind"];
export type MealAmount = Database["public"]["Enums"]["meal_amount"];
export type ActivityKind = Database["public"]["Enums"]["activity_kind"];

export const MEALS: { value: MealKind; icon: IconName; label: string }[] = [
  { value: "breakfast", icon: "breakfast", label: "Breakfast" },
  { value: "lunch", icon: "lunch", label: "Lunch" },
  { value: "dinner", icon: "dinner", label: "Dinner" },
  { value: "snack", icon: "snack", label: "Snack" },
];

export const MEAL_AMOUNTS: { value: MealAmount; label: string }[] = [
  { value: "all", label: "All of it" },
  { value: "half", label: "Half" },
  { value: "a_little", label: "A little" },
];

/** How much the patient liked a dish, yuck to loved it (drawn with the mood faces). */
export const LIKINGS: { value: number; label: string }[] = [
  { value: 1, label: "Yuck" },
  { value: 2, label: "Not great" },
  { value: 3, label: "OK" },
  { value: 4, label: "Good" },
  { value: 5, label: "Loved it" },
];

export const ACTIVITIES: { value: ActivityKind; icon: IconName; label: string }[] = [
  { value: "played", icon: "played", label: "Played" },
  { value: "movie", icon: "movie", label: "Watched a movie" },
  { value: "drew", icon: "drew", label: "Drew" },
  { value: "school", icon: "school", label: "School work" },
  { value: "visit", icon: "visit", label: "Had a visit" },
  { value: "treatment", icon: "treatment", label: "Exam or treatment" },
  { value: "rested", icon: "rested", label: "Rested" },
  { value: "walk", icon: "walk", label: "Went for a walk" },
];

/** One reaction per person per check-in (and per shared activity): heart, hug, strong, laugh. */
export const REACTIONS = [
  { key: "heart", label: "a heart", verb: "sent a heart" },
  { key: "hug", label: "a hug", verb: "sent a hug" },
  { key: "strong", label: "strength", verb: "says you're strong" },
  { key: "laugh", label: "a laugh", verb: "laughed" },
] as const;
export type ReactionKey = (typeof REACTIONS)[number]["key"];

export const isReactionKey = (k: unknown): k is ReactionKey => REACTIONS.some((r) => r.key === k);

export type MenuDish = { id: string; meal: MealKind; dish: string; position: number };

export type DishRating = { menuItemId: string; liking: number | null; amount: MealAmount | null };

/** What the patient sends. photoPath: undefined = unchanged, null = removed. */
export type CheckInInput = {
  mood: number;
  ratings: DishRating[];
  activities: ActivityKind[];
  activityNote: string;
  note: string;
  photoPath?: string | null;
};

export type RatedDish = { meal: MealKind; dish: string; liking: number | null; amount: MealAmount | null };

/** Food satisfaction of the day: the average of the dish ratings, as a face (value) + label. */
export function foodScore(dishes: RatedDish[]): { value: number; label: string } | null {
  const likings = dishes.map((d) => d.liking).filter((l): l is number => l !== null);
  if (likings.length === 0) return null;
  const value = Math.round(likings.reduce((a, b) => a + b, 0) / likings.length);
  return { value, label: LIKINGS[value - 1].label };
}

/** "Drew · Had a visit · Noah called" (labels only; ActivityChips draws the icons). */
export function activitySummary(activities: ActivityKind[], note: string | null): string {
  const labels = activities.map((a) => ACTIVITIES.find((y) => y.value === a)?.label ?? null);
  return [...labels, note].filter(Boolean).join(" · ");
}
