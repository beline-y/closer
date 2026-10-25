import { Bell, BellOff, BellRing, CircleHelp, PlugZap, ShieldAlert, Sparkles } from "lucide-react";
import type { ReactNode } from "react";
import { DistressBars } from "@/components/kit/charts";
import { relativeDay } from "@/lib/dates";
import { ACTION_LABELS, ALERT_SOURCES, type AiAction, type AiLevel, type AiReport, LEVELS, PRIORITY_LABELS } from "@/lib/nurse-round";
import { cn } from "@/lib/utils";

// The AI module's daily read of one child: Claude's summary, the signals behind it, the
// decision and the last two weeks. Decision support for the care team, never a diagnosis.

export function LevelBadge({ level, className }: { level: AiLevel; className?: string }) {
  const l = LEVELS[level];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold whitespace-nowrap", l.className, className)}>
      <span aria-hidden>{l.icon}</span>
      {l.label}
    </span>
  );
}

export function SourceChip({ claude }: { claude: boolean }) {
  return claude ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-role-care-soft px-2.5 py-0.5 text-xs font-bold text-role-care-ink">
      <Sparkles className="size-3.5" aria-hidden /> Written by Claude
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">Automatic summary</span>
  );
}

const ACTION_ICONS: Record<AiAction, ReactNode> = {
  wait: <BellOff className="size-4" aria-hidden />,
  ask: <CircleHelp className="size-4" aria-hidden />,
  digest: <Bell className="size-4" aria-hidden />,
  priority: <BellRing className="size-4" aria-hidden />,
};

export function AiOffline({ missing }: { missing: string[] }) {
  const configured = missing.length === 0;
  return (
    <section className="flex flex-col gap-2 rounded-xl border border-dashed bg-card p-5">
      <h2 className="flex items-center gap-2 font-heading text-lg font-extrabold">
        <PlugZap className="size-5 text-muted-foreground" aria-hidden />
        AI summary unavailable
      </h2>
      <p className="text-muted-foreground">
        {configured
          ? "Check-ins and alerts still work. Try again in a moment."
          : "Check-ins and alerts still work. The AI summary and the nurse's round need the AI service running next to the app."}
      </p>
      {!configured && (
        <p className="text-sm font-bold">
          Missing in this deployment:{" "}
          {missing.map((name, i) => (
            <span key={name}>
              {i > 0 && " and "}
              <code className="rounded bg-muted px-1.5 py-0.5">{name}</code>
            </span>
          ))}
        </p>
      )}
      {!configured && (
      <p className="text-sm text-muted-foreground">
        Start it with <code className="rounded bg-muted px-1.5 py-0.5">cd ml && python -m closer_ai serve</code>, then set <code className="rounded bg-muted px-1.5 py-0.5">CLOSER_AI_URL</code> and{" "}
        <code className="rounded bg-muted px-1.5 py-0.5">CLOSER_AI_TOKEN</code> in .env.local, or in the host&apos;s environment variables (Vercel), then redeploy.
      </p>
      )}
    </section>
  );
}

/** `storedAt` ("Oct 24, 2:10pm") when the AI service is off and this is its last stored reading. */
export function AiSummary({ report, nickname, computedAt, storedAt = null }: { report: AiReport; nickname: string; computedAt: string | null; storedAt?: string | null }) {
  const a = report.assessment;
  if (!a) {
    return (
      <section className="rounded-xl border bg-card p-5">
        <h2 className="font-heading text-lg font-extrabold">Today&apos;s summary</h2>
        <p className="mt-2 text-muted-foreground">No reading yet for today. It appears as soon as {nickname} checks in or the nurse adds a round.</p>
      </section>
    );
  }
  const maxWeight = Math.max(...a.signals.map((s) => s.weight), 0.01);
  const daysAgo = (date: string) => Math.round((Date.parse(report.today) - Date.parse(date)) / 86_400_000);
  const byDay = new Map(a.trajectory.map((d) => [daysAgo(d.for_date), d]));
  const points = Array.from({ length: 14 }, (_, i) => {
    const d = byDay.get(13 - i);
    return { daysAgo: 13 - i, p: d?.p_distress ?? null, level: d?.level ?? null };
  });
  const threeDaysAgo = byDay.get(3);
  const trend = threeDaysAgo ? a.p.distress - threeDaysAgo.p_distress : null;

  return (
    <section aria-labelledby="ai-summary-title" className="flex flex-col gap-5 rounded-xl border border-role-care/40 bg-card p-5 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="ai-summary-title" className="font-heading text-lg font-extrabold">
          {storedAt ? `Summary from ${storedAt}` : "Today\u2019s summary"}
        </h2>
        <SourceChip claude={a.summary_source === "claude"} />
      </header>
      {storedAt && <p className="-mt-3 text-sm text-muted-foreground">The AI service isn&apos;t answering: this is its last summary.</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <LevelBadge level={a.level} className="px-3 py-1 text-base" />
        <span className="text-sm text-muted-foreground">
          Chance of distress <span className="font-bold text-foreground tabular-nums">{Math.round(a.p.distress * 100)}%</span>
          {trend !== null && Math.abs(trend) >= 0.05 && (
            <span className={cn("ml-1.5 font-bold", trend > 0 ? "text-alert" : "text-success")}>
              {trend > 0 ? "▲" : "▼"} {Math.round(Math.abs(trend) * 100)} pts in 3 days
            </span>
          )}
        </span>
      </div>

      {a.summary && <p className="text-lg leading-relaxed text-pretty">{a.summary}</p>}

      {a.signals.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted-foreground">What weighs most today</h3>
          <ul className="flex flex-col gap-2">
            {a.signals.map((s) => (
              <li key={s.text} className="grid grid-cols-[1fr_5rem] items-center gap-3 text-sm">
                <span>{s.text}</span>
                <span className="h-2 rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-role-care-ink" style={{ width: `${Math.max(12, (s.weight / maxWeight) * 100)}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={cn("flex items-center gap-2 rounded-lg px-3 py-2 font-bold", a.action === "priority" ? "bg-alert-soft text-alert" : a.action === "wait" ? "bg-muted text-muted-foreground" : "bg-role-care-soft text-role-care-ink")}>
        {ACTION_ICONS[a.action]}
        {ACTION_LABELS[a.action]}
      </div>

      <DistressBars points={points} />

      {report.alerts.length > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-muted-foreground">Alerts to the psychologist</h3>
          <ul className="flex flex-col gap-2">
            {report.alerts.slice(0, 5).map((alert) => (
              <li key={alert.id} className={cn("flex items-start gap-2 rounded-lg border px-3 py-2 text-sm", alert.priority === "urgent" ? "border-alert/40 bg-alert-soft" : "bg-card")}>
                <ShieldAlert className={cn("mt-0.5 size-4 shrink-0", alert.priority === "digest" ? "text-muted-foreground" : "text-alert")} aria-hidden />
                <span className="flex flex-col">
                  <span className="font-bold">
                    {ALERT_SOURCES[alert.source]} · {PRIORITY_LABELS[alert.priority]}
                    {alert.detected_by === "claude" && <span className="font-normal text-muted-foreground"> · caught by Claude</span>}
                  </span>
                  <span className="text-muted-foreground">
                    {relativeDay(daysAgo(alert.for_date))} · {alert.outcome ? `Reviewed: ${alert.outcome.replaceAll("_", " ")}` : "Not reviewed yet"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        Decision support for the care team, not a diagnosis. Safety rules always alert the psychologist, whatever the model says.
        {computedAt && !storedAt && <> Updated at {computedAt}.</>}
      </p>
    </section>
  );
}
