import type { ContactRequestStatus } from "@/lib/demo-fixtures";
import type { AiLevel } from "@/lib/nurse-round";

// What the AI module returns for the volunteer matching (ml/closer_ai/matching.py, plan_week).
// Only the care team sees it: volunteers never learn who a child is, and only the child asks for a visit.

export type Fit = "strong" | "good" | "some" | "none";
export type VisitOutcome = "great" | "okay" | "hard";
export type NeedReason = "no_family" | "fragile" | "distress" | "no_recent_visit" | "request_in_progress";

export type MatchOption = {
  volunteer_id: string;
  fit: Fit;
  /** Bridges such as "the ocean → dolphins" */
  shared: string[];
  reason: string;
  /** A first question the child could ask */
  starter: string;
  source: "claude" | "rules";
  /** The learner's expected outcome of a visit, 0 to 1 */
  expected: number;
  /** -1: their visits were hard, +1: they went well, 0: never met */
  met_before: number;
  status: "in_progress" | "declined" | "nothing_in_common" | "full" | null;
  /** Set once the care team suggested this volunteer this week */
  suggested_on?: string | null;
};

export type ChildMatch = {
  patient_id: string;
  nickname: string;
  age: number;
  interests: string[];
  level: AiLevel | null;
  need: number;
  reasons: NeedReason[];
  suggestion: MatchOption | null;
  unmatched: "no_free_volunteer" | "nothing_in_common" | null;
  options: MatchOption[];
  requests: { volunteer_id: string; status: ContactRequestStatus; local_date: string }[];
  to_rate: { volunteer_id: string; local_date: string }[];
  rated: { volunteer_id: string; local_date: string; outcome: VisitOutcome }[];
};

export type VolunteerLoad = {
  volunteer_id: string;
  slots: number;
  /** Visits held by requests in progress and this week's suggestions */
  held: number;
  /** New suggestions in this plan */
  proposed: number;
  rated: number;
  went_well: number;
  effect: number;
};

export type MatchBoard = {
  today: string;
  children: ChildMatch[];
  volunteers: VolunteerLoad[];
  rated_visits: number;
  claude: boolean;
  claude_pairs: number;
  pairs: number;
};

export const FITS: Record<Fit, { label: string; stars: number; className: string }> = {
  strong: { label: "Strong match", stars: 3, className: "bg-success-soft text-success" },
  good: { label: "Good match", stars: 2, className: "bg-role-care-soft text-role-care-ink" },
  some: { label: "Possible match", stars: 1, className: "bg-muted text-muted-foreground" },
  none: { label: "Nothing in common", stars: 0, className: "bg-muted text-muted-foreground" },
};

/** Why a child comes first. Fragile and distress are shown with the AI's level badge instead. */
export const NEED_REASONS: Record<Exclude<NeedReason, "fragile" | "distress">, { label: string; tone: "alert" | "muted" }> = {
  no_family: { label: "No family linked", tone: "alert" },
  no_recent_visit: { label: "No volunteer visit lately", tone: "muted" },
  request_in_progress: { label: "Volunteer request in progress", tone: "muted" },
};

export const VISIT_OUTCOMES: { value: VisitOutcome; label: string; emoji: string }[] = [
  { value: "great", label: "Went well", emoji: "😊" },
  { value: "okay", label: "Okay", emoji: "😐" },
  { value: "hard", label: "Hard", emoji: "😟" },
];
