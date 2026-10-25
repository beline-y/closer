"use client";

import { ArrowDown, ArrowUp, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { LevelBadge } from "@/components/care/ai-summary";
import { AlertBadge } from "@/components/kit/alert-badge";
import { MoodSparkline } from "@/components/kit/charts";
import { MoodDot } from "@/components/kit/mood-dot";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import type { CastMember } from "@/lib/cast";
import type { MoodPoint } from "@/lib/mood";
import type { AiOverview } from "@/lib/nurse-round";
import { relativeDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type PatientRow = {
  id: string;
  name: string;
  member?: CastMember;
  age: number | null;
  mood7: MoodPoint[];
  lastCheckIn: { daysAgo: number; time: string; mood: number } | null;
  minutesToday: number;
  familyContactToday: boolean;
  alerts: number;
  /** The AI service's reading for today, or its last stored one; null if none */
  ai: AiOverview | null;
  /** "Oct 24, 2:10pm" when `ai` is the last stored reading, null when live */
  aiStoredAt: string | null;
};

type SortKey = "name" | "lastCheckIn" | "minutesToday" | "alerts" | "ai";

const needsAttention = (r: PatientRow) => r.alerts > 0 || (r.ai !== null && (r.ai.level !== "stable" || r.ai.open_alerts > 0));

// Sortable, filterable list. Usable on a landscape tablet: the table scrolls inside its card.
export function PatientsTable({ rows }: { rows: PatientRow[] }) {
  const hasAi = rows.some((r) => r.ai);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: hasAi ? "ai" : "alerts", dir: -1 });
  const [query, setQuery] = useState("");
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  const shown = useMemo(() => {
    const value = (r: PatientRow) =>
      sort.key === "name"
        ? r.name
        : sort.key === "lastCheckIn"
          ? r.lastCheckIn
            ? -r.lastCheckIn.daysAgo
            : -999
          : sort.key === "minutesToday"
            ? r.minutesToday
            : sort.key === "ai"
              ? (r.ai?.p_distress ?? -1)
              : r.alerts;
    return rows
      .filter((r) => r.name.toLowerCase().includes(query.toLowerCase()) && (!onlyAlerts || needsAttention(r)))
      .sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
  }, [rows, sort, query, onlyAlerts]);

  const header = (key: SortKey, label: string, className?: string) => {
    const active = sort.key === key;
    return (
      <th scope="col" aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={cn("px-3 py-2 font-bold", className)}>
        <button
          type="button"
          onClick={() => setSort({ key, dir: active ? (sort.dir === 1 ? -1 : 1) : key === "name" ? 1 : -1 })}
          className="inline-flex min-h-9 items-center gap-1 rounded-md hover:text-foreground"
        >
          {label}
          {active && (sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
        </button>
      </th>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-xs">
          <span className="sr-only">Search patients</span>
          <Search className="pointer-events-none absolute left-3 size-4 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" className="min-h-11 w-full rounded-lg border bg-card pr-3 pl-9" />
        </label>
        <label className="flex min-h-11 items-center gap-2 font-bold">
          <input type="checkbox" checked={onlyAlerts} onChange={(e) => setOnlyAlerts(e.target.checked)} className="size-5 accent-role-care-ink" />
          Needs attention only
        </label>
      </div>

      <div className="relative overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[46rem] text-left">
          <thead className="border-b bg-muted/60 text-sm text-muted-foreground">
            <tr>
              {header("name", "Patient")}
              {hasAi && header("ai", "AI reading")}
              <th scope="col" className="px-3 py-2 font-bold">
                Mood, 7 days
              </th>
              {header("lastCheckIn", "Last check-in")}
              {header("minutesToday", "In app today")}
              <th scope="col" className="px-3 py-2 font-bold">
                Family today
              </th>
              {header("alerts", "Alerts")}
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b last:border-0 hover:bg-muted/40">
                <td className="px-3 py-2">
                  <Link href={`/care/patients/${r.id}`} className="flex min-h-11 items-center gap-3 font-bold hover:underline">
                    {r.member && <PersonaAvatar person={r.member} size="sm" decorative />}
                    <span>
                      {r.name}
                      {r.age !== null && <span className="ml-1 font-normal text-muted-foreground">{r.age}</span>}
                    </span>
                  </Link>
                </td>
                {hasAi && (
                  <td className="px-3 py-2">
                    {r.ai?.level ? (
                      <span className="flex flex-col items-start gap-0.5">
                        <LevelBadge level={r.ai.level} />
                        <span className="text-xs text-muted-foreground">{r.aiStoredAt ? `Summary from ${r.aiStoredAt}` : r.ai.nurse_seen_today ? "Round done" : "Round to do"}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">No reading</span>
                    )}
                  </td>
                )}
                <td className="px-3 py-2">
                  <MoodSparkline points={r.mood7} label={`${r.name}'s mood over 7 days`} />
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {r.lastCheckIn ? (
                    <span className="flex flex-col">
                      <MoodDot value={r.lastCheckIn.mood} className="font-bold" />
                      <span className="text-sm text-muted-foreground">
                        {relativeDay(r.lastCheckIn.daysAgo)}, {r.lastCheckIn.time}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">None</span>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.minutesToday} min</td>
                <td className="px-3 py-2">
                  {r.familyContactToday ? <span className="font-bold text-success">✓ Yes</span> : <span className="font-bold text-alert">✕ No</span>}
                </td>
                <td className="px-3 py-2">
                  <AlertBadge count={r.alerts} />
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={hasAi ? 7 : 6} className="px-3 py-10 text-center text-muted-foreground">
                  No patient matches. 🎉 Everyone looks fine.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
