import type { ActivityResult } from "@/lib/data/activities";
import { relativeDay } from "@/lib/dates";
import type { Memory } from "@/lib/demo-fixtures";

/** Activity results Leo added to Memories, as album items (real data next to the placeholders). */
export function resultsAsMemories(results: ActivityResult[]): Memory[] {
  return results.map((r) => ({
    id: `activity-${r.id}`,
    by: "leo",
    caption: r.score !== null ? `${r.activity.title}: ${r.score}/${r.scoreTotal} ⭐` : r.activity.theme ?? r.activity.title,
    takenOn: relativeDay(r.daysAgo),
    tag: "other",
    emoji: r.activity.emoji,
    gradient: "from-amber-100 to-sky-200",
    photoUrl: r.imageUrl ?? undefined,
    sharedDaysAgo: r.daysAgo,
    reactions: [],
    comments: r.comments.map((c) => ({ by: c.by.id, body: c.body })),
  }));
}
