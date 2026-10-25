import { ChevronRight, ClipboardCheck, ClipboardList } from "lucide-react";
import Link from "next/link";
import { LevelBadge } from "@/components/care/ai-summary";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import type { CastMember } from "@/lib/cast";
import { ACTION_LABELS, type AiOverview } from "@/lib/nurse-round";
import { cn } from "@/lib/utils";

export type OverviewCard = { id: string; name: string; member?: CastMember; ai: AiOverview; storedAt: string | null };

const RANK = { distress: 0, fragile: 1, stable: 2 } as const;

// Claude's summary for every child, the ones who need support first. While the AI service
// is off, the last stored summary shows with its date.
export function AiOverviewCards({ cards }: { cards: OverviewCard[] }) {
  const live = cards.some((c) => c.storedAt === null);
  const sorted = [...cards].sort(
    (a, b) => (RANK[a.ai.level ?? "stable"] - RANK[b.ai.level ?? "stable"]) || (b.ai.p_distress ?? 0) - (a.ai.p_distress ?? 0),
  );
  return (
    <section aria-labelledby="ai-overview-title" className="flex flex-col gap-3">
      <h2 id="ai-overview-title" className="font-heading text-lg font-extrabold">
        {live ? "Today\u2019s summaries" : "Latest summaries"}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map(({ id, name, member, ai, storedAt }) => (
          <li key={id}>
            <Link
              href={`/care/patients/${id}`}
              className={cn(
                "group flex h-full flex-col gap-3 rounded-xl border bg-card p-4 transition hover:shadow-md",
                ai.level === "distress" && "border-alert/40",
                ai.top_priority === "urgent" && "ring-2 ring-alert",
              )}
            >
              <div className="flex items-center gap-3">
                {member && <PersonaAvatar person={member} size="sm" decorative />}
                <span className="font-bold">{name}</span>
                {ai.level && <LevelBadge level={ai.level} className="ml-auto" />}
              </div>
              <p className="line-clamp-4 text-sm leading-relaxed text-pretty">{ai.summary ?? "No reading yet today."}</p>
              {storedAt && <p className="text-xs font-bold text-muted-foreground">Summary from {storedAt}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                {ai.action && <span className={cn("font-bold", ai.action === "priority" ? "text-alert" : "text-muted-foreground")}>{ACTION_LABELS[ai.action]}</span>}
                {!storedAt && (
                  <span className={cn("ml-auto inline-flex items-center gap-1", ai.nurse_seen_today ? "text-success" : "text-muted-foreground")}>
                    {ai.nurse_seen_today ? <ClipboardCheck className="size-4" aria-hidden /> : <ClipboardList className="size-4" aria-hidden />}
                    {ai.nurse_seen_today ? "Round done" : "Round to do"}
                  </span>
                )}
                <ChevronRight className={cn("size-4 text-muted-foreground transition group-hover:translate-x-0.5", storedAt && "ml-auto")} aria-hidden />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
