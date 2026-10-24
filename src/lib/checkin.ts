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

/** How much the patient liked a dish, yuck to yum. "said" completes "Leo … it". */
export const LIKINGS: { value: number; emoji: string; label: string; said: string }[] = [
  { value: 1, emoji: "🤢", label: "Yuck", said: "didn't like" },
  { value: 2, emoji: "😕", label: "Not really", said: "didn't really like" },
  { value: 3, emoji: "😐", label: "Okay", said: "thought it was okay" },
  { value: 4, emoji: "😋", label: "Yummy", said: "liked" },
  { value: 5, emoji: "🤩", label: "Yum yum!", said: "loved" },
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

/** One reaction per person per check-in: heart, hug, strong, laugh. */
export const REACTIONS = [
  { emoji: "❤️", label: "a heart", verb: "sent a heart" },
  { emoji: "🤗", label: "a hug", verb: "sent a hug" },
  { emoji: "💪", label: "strength", verb: "says you're strong" },
  { emoji: "😂", label: "a laugh", verb: "laughed" },
] as const;
export type ReactionEmoji = (typeof REACTIONS)[number]["emoji"];

export type MenuDish = { id: string; meal: MealKind; dish: string; icon: string; position: number };

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

export type RatedDish = { meal: MealKind; dish: string; icon: string; liking: number | null; amount: MealAmount | null };

/** "Lunch: pasta with tomato sauce, Leo loved it" (family side). */
export function ratedDishLine(r: RatedDish, name = "Leo"): string {
  const meal = MEALS.find((m) => m.value === r.meal)?.label ?? r.meal;
  const liking = LIKINGS.find((l) => l.value === r.liking);
  const amount = MEAL_AMOUNTS.find((a) => a.value === r.amount);
  const parts = [liking ? `${name} ${liking.said} it` : null, amount ? `ate ${amount.label.toLowerCase()}` : null].filter(Boolean);
  return `${meal}: ${r.dish.toLowerCase()}${parts.length ? `, ${parts.join(", ")}` : ""}`;
}

/** "🎨 Drew · 👨‍👩‍👦 Had a visit · Noah called" (each activity with its own icon). */
export function activitySummary(activities: ActivityKind[], note: string | null): string {
  const labels = activities.map((a) => {
    const x = ACTIVITIES.find((y) => y.value === a);
    return x ? `${x.emoji} ${x.label}` : null;
  });
  return [...labels, note].filter(Boolean).join(" · ");
}
