// The nurse's daily round and the AI summary, shared by the care tab and its server actions.
// Values match the AI module's data contract (ml/closer_ai/contract.py).

export const WARD_MEALS = [
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
] as const;
export type WardMeal = (typeof WARD_MEALS)[number]["value"];

export const INTAKES = [
  { value: "all", label: "All" },
  { value: "half", label: "Half" },
  { value: "little", label: "A little" },
  { value: "none", label: "Nothing" },
  { value: "fasting", label: "Fasting" },
] as const;
export type Intake = (typeof INTAKES)[number]["value"];

export const AFFECTS = [
  { value: "calm", label: "Calm" },
  { value: "cheerful", label: "Cheerful" },
  { value: "sad", label: "Sad" },
  { value: "tearful", label: "Tearful" },
  { value: "anxious", label: "Anxious" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "irritable", label: "Irritable" },
  { value: "agitated", label: "Agitated" },
  { value: "tired", label: "Tired" },
] as const;
export type Affect = (typeof AFFECTS)[number]["value"];

export const ENGAGEMENTS = [
  { value: "engaged", label: "Engaged" },
  { value: "quiet", label: "Quiet" },
  { value: "refuses", label: "Refused" },
] as const;
export type Engagement = (typeof ENGAGEMENTS)[number]["value"];

export const NIGHT_SLEEPS = [
  { value: "good", label: "Good" },
  { value: "restless", label: "Restless" },
  { value: "poor", label: "Poor" },
] as const;
export type NightSleep = (typeof NIGHT_SLEEPS)[number]["value"];

export const VISITORS = [
  { value: "parent", label: "Parent" },
  { value: "sibling", label: "Sibling" },
  { value: "other_family", label: "Other family" },
  { value: "friend", label: "Friend" },
  { value: "volunteer", label: "Volunteer" },
  { value: "teacher", label: "Teacher" },
  { value: "other", label: "Other" },
] as const;
export type Visitor = (typeof VISITORS)[number]["value"];

export const NURSE_NOTE_MAX = 280;

/** What the nurse saves for one child and day. Every field is optional. */
export type NurseRoundInput = {
  lunch: Intake | null;
  dinner: Intake | null;
  affect: Affect[];
  engagement: Engagement | null;
  pain: number | null;
  nightSleep: NightSleep | null;
  refusedCare: boolean;
  asksPsychologist: boolean;
  visits: Visitor[];
  note: string;
};

export const EMPTY_ROUND: NurseRoundInput = {
  lunch: null,
  dinner: null,
  affect: [],
  engagement: null,
  pain: null,
  nightSleep: null,
  refusedCare: false,
  asksPsychologist: false,
  visits: [],
  note: "",
};

export type WardMenu = Record<WardMeal, string | null>;

// -- What the AI module sends back ------------------------------------------------------------
export type AiLevel = "stable" | "fragile" | "distress";
export type AiAction = "wait" | "ask" | "digest" | "priority";
export type AlertPriority = "digest" | "priority" | "urgent";

export type AiAssessment = {
  for_date: string;
  level: AiLevel;
  p: { stable: number; fragile: number; distress: number };
  summary: string | null;
  summary_source: "claude" | "template";
  action: AiAction;
  urgency: number | null;
  signals: { text: string; weight: number }[];
  data_days: number;
  computed_at: string;
  /** The reading of each of the last 14 days, as the model sees them today */
  trajectory: { for_date: string; p_distress: number; level: AiLevel }[];
};

export type AiAlert = {
  id: number;
  for_date: string;
  source: "safety_rule" | "child_request" | "nurse_request" | "policy" | "psy_manual";
  priority: AlertPriority;
  reason: string;
  detected_by: "rules" | "claude" | null;
  outcome: string | null;
};

export type SavedRound = {
  lunch: Intake | null;
  dinner: Intake | null;
  affect: Affect[];
  engagement: Engagement | null;
  pain: number | null;
  night_sleep: NightSleep | null;
  refused_care: boolean;
  asks_psychologist: boolean;
  note: string | null;
  visits: Visitor[];
  observed_by: string | null;
  updated_at: string;
};

export type AiReport = {
  patient_id: string;
  today: string;
  claude: boolean;
  assessment: AiAssessment | null;
  history: { for_date: string; level: AiLevel; p_distress: number; action: AiAction }[];
  alerts: AiAlert[];
  observation: SavedRound | null;
  menu: WardMenu;
};

export type AiOverview = {
  patient_id: string;
  level: AiLevel | null;
  p_distress: number | null;
  action: AiAction | null;
  summary: string | null;
  open_alerts: number;
  top_priority: AlertPriority | null;
  nurse_seen_today: boolean;
};

// Status is never color alone: an icon character, a word and a color token.
export const LEVELS: Record<AiLevel, { label: string; icon: string; className: string; color: string }> = {
  stable: { label: "Doing okay", icon: "✓", className: "bg-success-soft text-success", color: "var(--success)" },
  fragile: { label: "Fragile", icon: "◐", className: "bg-role-patient-soft text-role-patient-ink", color: "var(--role-patient)" },
  distress: { label: "Needs support", icon: "⚠", className: "bg-alert-soft text-alert", color: "var(--alert)" },
};

export const PRIORITY_LABELS: Record<AlertPriority, string> = {
  digest: "Psychologist's list",
  priority: "Priority",
  urgent: "Urgent",
};

export const ACTION_LABELS: Record<AiAction, string> = {
  wait: "No alert today",
  ask: "A short wellbeing question tomorrow",
  digest: "Added to the psychologist's list",
  priority: "Priority alert: the psychologist sees them today",
};

export const ALERT_SOURCES: Record<AiAlert["source"], string> = {
  safety_rule: "Safety rule",
  child_request: "Asked to talk to someone",
  nurse_request: "Nurse request",
  policy: "AI triage",
  psy_manual: "Reported by the psychologist",
};

export function roundFromSaved(saved: SavedRound | null): NurseRoundInput {
  if (!saved) return EMPTY_ROUND;
  return {
    lunch: saved.lunch,
    dinner: saved.dinner,
    affect: saved.affect,
    engagement: saved.engagement,
    pain: saved.pain,
    nightSleep: saved.night_sleep,
    refusedCare: saved.refused_care,
    asksPsychologist: saved.asks_psychologist,
    visits: saved.visits,
    note: saved.note ?? "",
  };
}
