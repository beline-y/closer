import type { Database } from "@/lib/supabase/database.types";

export type NudgeKind = Database["public"]["Enums"]["nudge_kind"];

// The five nudges. "message" completes "Leo …" in the family feed.
export const NUDGE_KINDS: { kind: NudgeKind; emoji: string; label: string; message: string }[] = [
  { kind: "miss_you", emoji: "💛", label: "I miss you", message: "misses you" },
  { kind: "call_me", emoji: "📞", label: "Call me", message: "would love a call" },
  { kind: "bored", emoji: "🥱", label: "I'm bored", message: "is bored" },
  { kind: "proud", emoji: "🏆", label: "I'm proud of myself", message: "is feeling proud" },
  { kind: "hug", emoji: "🤗", label: "I need a hug", message: "needs a hug" },
];

export function nudgeKind(kind: NudgeKind) {
  return NUDGE_KINDS.find((k) => k.kind === kind)!;
}

/** One-tap replies from the family (the emoji is stored, the text can be customised). */
export const QUICK_REPLIES: { emoji: "❤️" | "📞" | "🤗" | "⭐"; text: string }[] = [
  { emoji: "❤️", text: "Love you" },
  { emoji: "📞", text: "Calling soon" },
  { emoji: "🤗", text: "Big hug" },
  { emoji: "⭐", text: "So proud of you" },
];
export type ReplyEmoji = (typeof QUICK_REPLIES)[number]["emoji"];

/** Alert thresholds and nudge cooldown, as stored in patient_settings. */
export type Thresholds = {
  lowMoodStreak: number;
  lowMoodThreshold: number;
  noCheckinDays: number;
  noFamilyContactDays: number;
  nudgeCooldownMinutes: number;
};
