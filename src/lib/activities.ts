import type { IconName } from "@/components/icons/closer-icon";
import type { ActivityKind } from "@/lib/checkin";
import type { Database } from "@/lib/supabase/database.types";

export type ActivityType = Database["public"]["Enums"]["activity_type"];

export const ACTIVITY_TYPES: Record<ActivityType, { label: string; icon: IconName; verb: string; kind: ActivityKind }> = {
  draw: { label: "Draw", icon: "draw", verb: "drew", kind: "drew" },
  make_snap: { label: "Make and snap", icon: "make_snap", verb: "made", kind: "played" },
  quiz: { label: "Quiz", icon: "quiz", verb: "played the quiz", kind: "played" },
  story: { label: "Story time", icon: "story", verb: "wrote a story", kind: "school" },
  challenge: { label: "Challenge with family", icon: "challenge", verb: "did a challenge", kind: "drew" },
};

export type QuizQuestion = { q: string; options: string[]; answer: number; fact?: string };

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  instructions: string | null;
  theme: string | null;
  steps: string[];
  quiz: QuizQuestion[] | null;
  minutes: number;
};

export type ShareChoice = "family" | "memories" | "private";
