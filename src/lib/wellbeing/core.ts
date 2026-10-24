import { z } from "zod";
import { activitySummary, type ActivityKind } from "../checkin";

export const reviewSchema = z.object({
  level: z.enum(["insufficient_data", "routine", "check_in", "priority"]),
  summary: z.string().min(1).max(700),
  evidence: z.array(z.object({
    checkin_id: z.string().uuid(),
    // An exact excerpt, never a model-generated paraphrase of a child's words.
    quote: z.string().min(1).max(280),
  }).strict()).max(5),
  suggested_action: z.string().min(1).max(400),
  safeguarding_concern: z.boolean(),
  connection: z.object({
    kind: z.enum(["movie", "game", "drawing", "music", "general"]),
    checkin_id: z.string().uuid().nullable(),
  }).strict(),
}).strict();

export type Review = z.infer<typeof reviewSchema>;
export type Checkin = {
  id: string;
  local_date: string;
  mood: number;
  activity: string | null;
  note: string | null;
};

// Adapt the canonical check-in schema; don't create a second response format in
// the database or include photos, memories, or locked answers in model context.
export function sharedCheckin(row: {
  id: string; local_date: string; mood: number; activities: ActivityKind[];
  activity_note: string | null; note: string | null;
}): Checkin {
  return { id: row.id, local_date: row.local_date, mood: row.mood,
    activity: activitySummary(row.activities, row.activity_note) || null, note: row.note };
}
export type ReviewContext = {
  forDate: string;
  monitoringSince: string;
  checkins: Checkin[];
  lowMoodThreshold: number;
  lowMoodStreak: number;
  noCheckinDays: number;
};

export function localDate(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
}

export function shiftDate(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const rank = { insufficient_data: 0, routine: 1, check_in: 2, priority: 3 };

export function ruleReview(context: ReviewContext): Review {
  const recent = context.checkins.filter((c) => c.local_date <= context.forDate)
    .sort((a, b) => b.local_date.localeCompare(a.local_date));
  const streak = recent.slice(0, context.lowMoodStreak);
  const sustainedLow = streak.length >= context.lowMoodStreak && streak.every((c, i) =>
    c.mood <= context.lowMoodThreshold && c.local_date === shiftDate(context.forDate, -i));
  const missing = context.forDate >= shiftDate(context.monitoringSince, context.noCheckinDays - 1)
    && !recent.some((c) => c.local_date > shiftDate(context.forDate, -context.noCheckinDays));
  const lowToday = recent.some((c) => c.local_date === context.forDate && c.mood <= context.lowMoodThreshold);
  const level = sustainedLow || lowToday || missing ? "check_in" : recent.length ? "routine" : "insufficient_data";
  return {
    level,
    summary: sustainedLow ? "Several consecutive shared check-ins report a low mood. A person should check in."
      : lowToday ? "The latest shared check-in reports a low mood. Offer a gentle conversation."
      : missing ? "No recent check-in is available. This is a missing-data reminder, not evidence of a mental health condition."
      : recent.length ? "Shared check-ins are available. These observations cannot establish a child's mental state."
      : "There are not enough shared responses to review yet.",
    evidence: [],
    suggested_action: "Ask how they are feeling and what support they would like. Ask the care team to review any concerns.",
    safeguarding_concern: false,
    connection: { kind: "general", checkin_id: null },
  };
}

// Validate content as well as JSON shape. A model cannot cite invented/private data
// or downgrade deterministic thresholds. Failed validation uses the rules review.
export function validateReview(raw: unknown, context: ReviewContext): Review {
  const parsed = reviewSchema.parse(raw);
  for (const evidence of parsed.evidence) {
    const source = context.checkins.find((c) => c.id === evidence.checkin_id);
    if (!source || ![source.note, source.activity].some((s) => s?.includes(evidence.quote))) {
      throw new Error("Unsupported evidence");
    }
  }
  if (["check_in", "priority"].includes(parsed.level) && parsed.evidence.length === 0) {
    throw new Error("Concern needs shared evidence");
  }
  if (parsed.connection.kind !== "general") {
    const source = context.checkins.find((c) => c.id === parsed.connection.checkin_id);
    const patterns = {
      movie: /\b(movie|film|cin[eé]ma)\b/i,
      game: /\b(games?|gaming|played|jeu|jeux)\b/i,
      drawing: /\b(drew|draw\w*|d[eé]ssin\w*|dessin\w*|paint\w*)\b/i,
      music: /\b(music|musique|song|chanson)\b/i,
    };
    const pattern = patterns[parsed.connection.kind];
    const denialOrOtherDate = /\b(not|never|didn['’]t|don['’]t|haven['’]t|tomorrow|yesterday|last week|last night|next week|wish|want to|will watch|will play|demain|hier|pas|jamais)\b/i;
    const supported = source && [source.activity, source.note].some((text) =>
      text && pattern.test(text) && !denialOrOtherDate.test(text));
    if (!source || source.local_date !== context.forDate || !supported) {
      throw new Error("Unsupported connection topic");
    }
  } else if (parsed.connection.checkin_id !== null) {
    throw new Error("General prompts must not invent an event source");
  }
  const baseline = ruleReview(context);
  return rank[baseline.level] > rank[parsed.level]
    ? { ...baseline, connection: parsed.connection, safeguarding_concern: parsed.safeguarding_concern }
    : parsed;
}

// Adult alerts and child prompts are templates. Model prose and sensitive quotes
// never enter notification previews. Full evidence is restricted to care staff.
export function connectionMessages(name: string, review: Review, forDate: string, today: string) {
  const when = shiftDate(today, -1) === forDate ? "yesterday" : `on ${forDate}`;
  if (review.level === "priority" || review.level === "check_in") {
    return {
      parent: `Make a little time for ${name} today. Ask how they are feeling and what would help them feel supported.`,
      child: "Would you like a little company? You can ask someone you trust to sit, talk, or do something together.",
    };
  }
  const topics = { movie: "the film", game: "the game", drawing: "their drawing", music: "the music", general: null };
  const topic = topics[review.connection.kind];
  return {
    parent: topic ? `Ask ${name} how ${topic} was ${when}. What was their favorite part?`
      : `Make a little moment with ${name}. Ask what they would enjoy doing together today.`,
    child: topic ? `Want to tell someone your favorite part of ${topic === "their drawing" ? "your drawing" : topic} ${when}? A little chat or a drawing is enough.`
      : "What would you like to share with someone you love today? A drawing, a story, or a little hello all count.",
  };
}
