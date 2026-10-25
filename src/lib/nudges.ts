import type { IconName } from "@/components/icons/closer-icon";
import type { Database } from "@/lib/supabase/database.types";

export type NudgeKind = Database["public"]["Enums"]["nudge_kind"];

// The five nudges. "message" completes "Leo …" in the family feed.
export const NUDGE_KINDS: { kind: NudgeKind; icon: IconName; label: string; short: string; message: string }[] = [
  { kind: "miss_you", icon: "miss_you", label: "I miss you", short: "Miss you", message: "misses you" },
  { kind: "call_me", icon: "call_me", label: "Call me", short: "Call me", message: "would love a call" },
  { kind: "bored", icon: "bored", label: "I'm bored", short: "Bored", message: "is bored" },
  { kind: "proud", icon: "proud", label: "I'm proud of myself", short: "Proud", message: "is feeling proud" },
  { kind: "hug", icon: "hug", label: "I need a hug", short: "Hug", message: "needs a hug" },
];

export function nudgeKind(kind: NudgeKind) {
  return NUDGE_KINDS.find((k) => k.kind === kind)!;
}

/** One-tap replies from the family (the key is stored, the text can be customised). */
export const QUICK_REPLIES: { key: "heart" | "call" | "hug" | "star"; text: string }[] = [
  { key: "heart", text: "Love you" },
  { key: "call", text: "Calling soon" },
  { key: "hug", text: "Big hug" },
  { key: "star", text: "So proud of you" },
];
export type ReplyKey = (typeof QUICK_REPLIES)[number]["key"];

/** Alert thresholds and nudge cooldown, as stored in patient_settings. */
export type Thresholds = {
  lowMoodStreak: number;
  lowMoodThreshold: number;
  noCheckinDays: number;
  noFamilyContactDays: number;
  nudgeCooldownMinutes: number;
};
