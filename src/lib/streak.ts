// "Connected" streak, computed from check-in days only (no stored counter that can drift).
// It celebrates, never punishes:
// - the headline is the total number of days connected, ever
// - one rest day per 7 days keeps the streak going automatically
// - after a longer break, the streak restarts with "Welcome back!", never "you lost it"

export const MILESTONES = [
  { days: 3, icon: "sprout", name: "Little sprout" },
  { days: 7, icon: "star", name: "Star week" },
  { days: 14, icon: "medal", name: "Two-week hero" },
  { days: 30, icon: "trophy", name: "Champion" },
] as const;

export type Milestone = (typeof MILESTONES)[number];

export type Streak = {
  /** Total days with a check-in, ever */
  totalDays: number;
  /** Days in the current run, rest days allowed */
  streakDays: number;
  /** Rest days used inside the current run */
  restDays: number;
  /** Checked in today after a break that ended the previous run */
  welcomeBack: boolean;
  /** Milestone reached exactly today (by total days) */
  milestoneToday: Milestone | null;
  /** Next milestone and how many days to go */
  next: { milestone: Milestone; daysToGo: number } | null;
};

const DAY = 86_400_000;
const toTime = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** dates: YYYY-MM-DD of every check-in (any order); today: YYYY-MM-DD in the patient's timezone. */
export function computeStreak(dates: string[], today: string): Streak {
  const days = new Set(dates);
  const sorted = [...days].sort();
  const totalDays = sorted.length;

  // Walk back from today (or yesterday, if today isn't done yet).
  let cursor = days.has(today) ? toTime(today) : toTime(today) - DAY;
  let streakDays = 0;
  let restDays = 0;
  let lastRest: number | null = null;
  let pendingRest = false; // a rest day only counts once a check-in comes before it
  const first = sorted.length ? toTime(sorted[0]) : cursor;
  while (cursor >= first) {
    const key = new Date(cursor).toISOString().slice(0, 10);
    if (days.has(key)) {
      streakDays++;
      if (pendingRest) restDays++;
      pendingRest = false;
    } else if (streakDays > 0 && !pendingRest && (lastRest === null || lastRest - cursor >= 7 * DAY)) {
      pendingRest = true;
      lastRest = cursor;
    } else {
      break;
    }
    cursor -= DAY;
  }

  const welcomeBack = days.has(today) && streakDays === 1 && totalDays > 1;
  const milestoneToday = days.has(today) ? (MILESTONES.find((m) => m.days === totalDays) ?? null) : null;
  const nextMilestone = MILESTONES.find((m) => m.days > totalDays);
  return {
    totalDays,
    streakDays,
    restDays,
    welcomeBack,
    milestoneToday,
    next: nextMilestone ? { milestone: nextMilestone, daysToGo: nextMilestone.days - totalDays } : null,
  };
}

/** The day each milestone was reached (for the family feed). */
export function milestoneDays(dates: string[]): { date: string; milestone: Milestone }[] {
  const sorted = [...new Set(dates)].sort();
  return MILESTONES.filter((m) => sorted.length >= m.days).map((m) => ({ date: sorted[m.days - 1], milestone: m }));
}
