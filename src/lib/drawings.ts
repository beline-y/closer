// What the AI module returns for a child's drawings (ml/closer_ai/bridge.py, drawings_view).
// Every drawing is described, never interpreted; images are not kept, only their reading.
import type { IconName } from "@/components/icons/closer-icon";

export type DrawingAffect = "positive" | "neutral" | "negative" | "unclear";

export type DrawingItem = {
  local_date: string;
  days_ago: number;
  palette: string[];
  description: string;
  affect: DrawingAffect;
  people: number;
  alone: boolean;
  family: boolean;
  smiling_faces: number;
  sad_faces: number;
  setting: "home" | "hospital" | "outdoors" | "other";
  sun: boolean;
  rain: boolean;
  dark_share: number;
  colors: number;
  safety: "none" | "concern" | "crisis";
  read_by_claude: boolean;
};

export type DrawingsView = {
  today: string;
  drawings: DrawingItem[];
  usual: { dark_share: { mean: number; sd: number }; colors: { mean: number; sd: number }; from_drawings: number; per_week: number | null };
  this_week: { count: number; positive: number; negative: number; alone: number; change: number | null; dark_shift: number | null; color_shift: number | null };
};

// The feeling a drawing shows explicitly (smiling or crying faces, hearts, written words). Never color alone.
export const DRAWING_FEELINGS: Record<"positive" | "neutral" | "negative", { label: string; icon: IconName; color: string; className: string }> = {
  positive: { label: "Happy", icon: "happy", color: "var(--success)", className: "bg-success-soft text-success" },
  neutral: { label: "Neutral", icon: "neutral", color: "var(--muted-foreground)", className: "bg-muted text-muted-foreground" },
  negative: { label: "Sad", icon: "sad", color: "var(--alert)", className: "bg-alert-soft text-alert" },
};

export function feelingOf(d: Pick<DrawingItem, "affect" | "sad_faces">): keyof typeof DRAWING_FEELINGS {
  if (d.affect === "negative" || d.sad_faces > 0) return "negative";
  return d.affect === "positive" ? "positive" : "neutral";
}

export const SETTINGS: Record<DrawingItem["setting"], string | null> = { home: "Home", hospital: "Hospital", outdoors: "Outdoors", other: null };
