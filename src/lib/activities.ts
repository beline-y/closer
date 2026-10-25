import type { ActivityKind } from "@/lib/checkin";
import type { Hue } from "@/lib/hues";
import type { Database } from "@/lib/supabase/database.types";

export type ActivityType = Database["public"]["Enums"]["activity_type"];

// hue: the color of that kind of activity on the patient side, the same on every card.
export const ACTIVITY_TYPES: Record<ActivityType, { label: string; emoji: string; verb: string; kind: ActivityKind; hue: Hue }> = {
  draw: { label: "Draw", emoji: "🎨", verb: "drew", kind: "drew", hue: "coral" },
  make_snap: { label: "Make and snap", emoji: "✂️", verb: "made", kind: "played", hue: "mint" },
  quiz: { label: "Quiz", emoji: "🧠", verb: "played the quiz", kind: "played", hue: "sky" },
  story: { label: "Story time", emoji: "📖", verb: "wrote a story", kind: "school", hue: "lilac" },
  challenge: { label: "Challenge with family", emoji: "🤝", verb: "did a challenge", kind: "drew", hue: "sun" },
};

export type QuizQuestion = { q: string; options: string[]; answer: number; fact?: string };

export type Activity = {
  id: string;
  type: ActivityType;
  title: string;
  emoji: string;
  instructions: string | null;
  theme: string | null;
  steps: string[];
  quiz: QuizQuestion[] | null;
  minutes: number;
};

export type ShareChoice = "family" | "memories" | "private";
