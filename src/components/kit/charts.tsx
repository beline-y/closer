"use client";

import { useId, useState } from "react";
import { dayLabel } from "@/lib/dates";
import { getMood, type MoodPoint, MOODS } from "@/lib/mood";
import { type AiLevel, LEVELS } from "@/lib/nurse-round";
import { useToday } from "@/lib/use-today";
import { cn } from "@/lib/utils";

// Single-series charts for the care team. Mark specs: 2px lines, 8px markers with a
// 2px surface ring, 4px rounded bar ends, recessive grid, hover tooltip, table view.

function Tooltip({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-foreground px-2.5 py-1.5 text-sm whitespace-nowrap text-background shadow-md"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sparkline: last N days of mood, for the patients table
// ---------------------------------------------------------------------------
export function MoodSparkline({ points, label }: { points: MoodPoint[]; label: string }) {
  const today = useToday();
  const [hover, setHover] = useState<number | null>(null);
  const w = 100;
  const h = 40;
  const step = w / Math.max(1, points.length - 1);
  const y = (mood: number) => h - 4 - ((mood - 1) / 4) * (h - 8);
  const coords = points.map((p, i) => (p.mood ? { x: i * step, y: y(p.mood), p } : null));
  const path = coords.reduce((d, c, i) => {
    if (!c) return d;
    const prev = coords[i - 1];
    return d + `${prev ? "L" : "M"}${c.x.toFixed(1)},${c.y.toFixed(1)}`;
  }, "");
  const hovered = hover !== null ? points[hover] : null;

  return (
    <div className="relative h-10 w-28" onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="size-full overflow-visible" role="img" aria-label={label}>
        <path d={path} fill="none" stroke="var(--role-care-ink)" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        {coords.map((c, i) =>
          c ? (
            <circle key={i} cx={c.x} cy={c.y} r={i === hover || i === coords.length - 1 ? 3 : 0} fill={getMood(c.p.mood!).color} stroke="var(--card)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          ) : null,
        )}
        {points.map((_, i) => (
          <rect key={i} x={i * step - step / 2} y={0} width={step} height={h} fill="transparent" onPointerEnter={() => setHover(i)} />
        ))}
      </svg>
      {hovered && (
        <Tooltip x={(hover! / Math.max(1, points.length - 1)) * 100} y={0}>
          {dayLabel(today, hovered.daysAgo)} · {hovered.mood ? `${getMood(hovered.mood).emoji} ${getMood(hovered.mood).label}` : "No check-in"}
        </Tooltip>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mood chart: 7 or 30 days, y axis = mood 1-5 with emoji ticks
// ---------------------------------------------------------------------------
export function MoodChart({ history }: { history: MoodPoint[] }) {
  const today = useToday();
  const [range, setRange] = useState<7 | 30>(7);
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const points = history.slice(-range);

  const w = 600;
  const h = 220;
  const pad = { l: 36, r: 12, t: 12, b: 28 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const x = (i: number) => pad.l + (points.length === 1 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (mood: number) => pad.t + ih - ((mood - 1) / 4) * ih;
  const path = points.reduce((d, p, i) => {
    if (!p.mood) return d;
    return d + `${points[i - 1]?.mood ? "L" : "M"}${x(i).toFixed(1)},${y(p.mood).toFixed(1)}`;
  }, "");
  const every = range === 7 ? 1 : 5;
  const hovered = hover !== null ? points[hover] : null;

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption id={titleId} className="font-heading text-lg font-extrabold">
          Mood, last {range} days
        </figcaption>
        <div className="flex gap-2">
          <div role="group" aria-label="Range" className="flex rounded-lg bg-muted p-1">
            {([7, 30] as const).map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={range === r}
                onClick={() => setRange(r)}
                className={cn("min-h-9 rounded-md px-3 text-sm font-bold", range === r ? "bg-card shadow-sm" : "text-muted-foreground")}
              >
                {r} days
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAsTable((t) => !t)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-role-care-ink hover:bg-muted">
            {asTable ? "Show chart" : "Show table"}
          </button>
        </div>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Mood</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p) => (
                <tr key={p.daysAgo} className="border-t">
                  <td className="px-3 py-1.5">{dayLabel(today, p.daysAgo, "long")}</td>
                  <td className="px-3 py-1.5">{p.mood ? `${getMood(p.mood).emoji} ${getMood(p.mood).label} (${p.mood}/5)` : "No check-in"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label={`Mood over the last ${range} days. Use "Show table" for the values.`}>
            {MOODS.map((m) => (
              <g key={m.value}>
                <line x1={pad.l} x2={w - pad.r} y1={y(m.value)} y2={y(m.value)} stroke="var(--border)" strokeWidth="1" />
                <text x={pad.l - 10} y={y(m.value)} dy="0.35em" textAnchor="end" fontSize="16" aria-hidden>
                  {m.emoji}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % every === 0 || i === points.length - 1 ? (
                <text key={p.daysAgo} x={x(i)} y={h - 8} textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">
                  {dayLabel(today, p.daysAgo)}
                </text>
              ) : null,
            )}
            {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="var(--muted-foreground)" strokeDasharray="3 3" />}
            <path d={path} fill="none" stroke="var(--role-care-ink)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) =>
              p.mood ? (
                <circle key={p.daysAgo} cx={x(i)} cy={y(p.mood)} r={hover === i ? 6 : 4} fill={getMood(p.mood).color} stroke="var(--card)" strokeWidth="2" />
              ) : null,
            )}
            {points.map((p, i) => (
              <rect key={p.daysAgo} x={x(i) - iw / points.length / 2} y={pad.t} width={iw / points.length} height={ih} fill="transparent" onPointerEnter={() => setHover(i)} />
            ))}
          </svg>
          {hovered && (
            <Tooltip x={(x(hover!) / w) * 100} y={((hovered.mood ? y(hovered.mood) : pad.t + ih / 2) / h) * 100 - 3}>
              {dayLabel(today, hovered.daysAgo, "long")} · {hovered.mood ? `${getMood(hovered.mood).emoji} ${getMood(hovered.mood).label}` : "No check-in"}
            </Tooltip>
          )}
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Bars: family interactions per day
// ---------------------------------------------------------------------------
export function InteractionBars({ counts }: { counts: number[] }) {
  const today = useToday();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const w = 600;
  const h = 160;
  const pad = { l: 28, r: 8, t: 12, b: 26 };
  const ih = h - pad.t - pad.b;
  const max = Math.max(4, ...counts);
  const slot = (w - pad.l - pad.r) / counts.length;
  const barW = slot - 2; // 2px gap between bars
  const ticks = [0, Math.round(max / 2), max];

  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <figcaption id={titleId} className="font-heading text-lg font-extrabold">
          Family interactions per day
        </figcaption>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-role-care-ink hover:bg-muted">
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Interactions</th>
              </tr>
            </thead>
            <tbody>
              {counts
                .map((c, i) => ({ c, daysAgo: counts.length - 1 - i }))
                .reverse()
                .map(({ c, daysAgo }) => (
                  <tr key={daysAgo} className="border-t">
                    <td className="px-3 py-1.5">{dayLabel(today, daysAgo, "long")}</td>
                    <td className="px-3 py-1.5 tabular-nums">{c}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Family interactions per day over two weeks. Use Show table for the values.">
            {ticks.map((t) => {
              const ty = pad.t + ih - (t / max) * ih;
              return (
                <g key={t}>
                  <line x1={pad.l} x2={w - pad.r} y1={ty} y2={ty} stroke="var(--border)" />
                  <text x={pad.l - 6} y={ty} dy="0.35em" textAnchor="end" fontSize="13" fill="var(--muted-foreground)">
                    {t}
                  </text>
                </g>
              );
            })}
            {counts.map((c, i) => {
              const bh = (c / max) * ih;
              const bx = pad.l + i * slot + 1;
              const by = pad.t + ih - bh;
              const daysAgo = counts.length - 1 - i;
              return (
                <g key={i} onPointerEnter={() => setHover(i)}>
                  <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
                  {c > 0 && (
                    <path
                      d={`M${bx},${pad.t + ih} V${by + Math.min(4, bh)} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${pad.t + ih} Z`}
                      fill="var(--role-care)"
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {(i % 2 === 1 || i === counts.length - 1) && (
                    <text x={bx + barW / 2} y={h - 8} textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">
                      {dayLabel(today, daysAgo)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <Tooltip x={((pad.l + hover * slot + slot / 2) / w) * 100} y={((pad.t + ih - (counts[hover] / max) * ih) / h) * 100 - 3}>
              {dayLabel(today, counts.length - 1 - hover, "long")} · {counts[hover]} {counts[hover] === 1 ? "interaction" : "interactions"}
            </Tooltip>
          )}
        </div>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Chance of distress per day (AI reading), for the patient page
// ---------------------------------------------------------------------------
export type DistressPoint = { daysAgo: number; p: number | null; level: AiLevel | null };

export function DistressBars({ points }: { points: DistressPoint[] }) {
  const today = useToday();
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  const w = 600;
  const h = 120;
  const pad = { l: 50, r: 8, t: 10, b: 26 };
  const ih = h - pad.t - pad.b;
  const slot = (w - pad.l - pad.r) / points.length;
  const barW = slot - 2; // 2px gap between bars
  const label = (pt: DistressPoint) => (pt.p === null || !pt.level ? "No reading" : `${LEVELS[pt.level].label} · ${Math.round(pt.p * 100)}%`);

  return (
    <figure className="flex flex-col gap-2" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <figcaption id={titleId} className="text-sm font-bold text-muted-foreground">
          Chance of distress, last 14 days
        </figcaption>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-role-care-ink hover:bg-muted">
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-56 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                <th className="px-3 py-2">Day</th>
                <th className="px-3 py-2">Reading</th>
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((pt) => (
                <tr key={pt.daysAgo} className="border-t">
                  <td className="px-3 py-1.5">{dayLabel(today, pt.daysAgo, "long")}</td>
                  <td className="px-3 py-1.5 tabular-nums">{label(pt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative" onPointerLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Chance of distress per day over two weeks. Use Show table for the values.">
            {[0, 0.5, 1].map((t) => {
              const ty = pad.t + ih - t * ih;
              return (
                <g key={t}>
                  <line x1={pad.l} x2={w - pad.r} y1={ty} y2={ty} stroke="var(--border)" />
                  <text x={pad.l - 6} y={ty} dy="0.35em" textAnchor="end" fontSize="13" fill="var(--muted-foreground)">
                    {t * 100}%
                  </text>
                </g>
              );
            })}
            {points.map((pt, i) => {
              const bh = Math.max(4, (pt.p ?? 0) * ih);
              const bx = pad.l + i * slot + 1;
              const by = pad.t + ih - bh;
              return (
                <g key={pt.daysAgo} onPointerEnter={() => setHover(i)}>
                  <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
                  {pt.p !== null && pt.level && (
                    <path
                      d={`M${bx},${pad.t + ih} V${by + 4} q0,-4 4,-4 h${barW - 8} q4,0 4,4 V${pad.t + ih} Z`}
                      fill={LEVELS[pt.level].color}
                      opacity={hover === null || hover === i ? 1 : 0.55}
                    />
                  )}
                  {(i % 3 === 1 || i === points.length - 1) && (
                    <text x={bx + barW / 2} y={h - 8} textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">
                      {dayLabel(today, pt.daysAgo)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hover !== null && (
            <Tooltip x={((pad.l + hover * slot + slot / 2) / w) * 100} y={((pad.t + ih - (points[hover].p ?? 0) * ih) / h) * 100 - 3}>
              {dayLabel(today, points[hover].daysAgo, "long")} · {label(points[hover])}
            </Tooltip>
          )}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        {(Object.keys(LEVELS) as AiLevel[]).map((level) => (
          <li key={level} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: LEVELS[level].color }} aria-hidden />
            <span aria-hidden>{LEVELS[level].icon}</span> {LEVELS[level].label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Drawings: the feeling each one shows, and its dark ink against the usual range
// ---------------------------------------------------------------------------
export type DrawingPoint = { daysAgo: number; feeling: "positive" | "neutral" | "negative"; dark: number; description: string };

const FEELING_ROWS = ["positive", "neutral", "negative"] as const;

function ChartFrame({ title, table, children }: { title: string; table: { head: string[]; rows: (string | number)[][] }; children: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  return (
    <figure className="flex flex-col gap-3" aria-labelledby={titleId}>
      <div className="flex items-center justify-between gap-2">
        <figcaption id={titleId} className="font-heading text-lg font-extrabold">
          {title}
        </figcaption>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="min-h-9 rounded-lg px-3 text-sm font-bold text-role-care-ink hover:bg-muted">
          {asTable ? "Show chart" : "Show table"}
        </button>
      </div>
      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left">
              <tr>
                {table.head.map((h) => (
                  <th key={h} className="px-3 py-2">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, i) => (
                <tr key={i} className="border-t">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-1.5 tabular-nums">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </figure>
  );
}

/** One dot per drawing over the last `days` days, on the row of the feeling it shows. */
export function DrawingFeelingTimeline({ points, labels, days = 30 }: { points: DrawingPoint[]; labels: Record<DrawingPoint["feeling"], { label: string; icon: string; color: string }>; days?: number }) {
  const today = useToday();
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = 150;
  const pad = { l: 118, r: 14, t: 14, b: 26 };
  const x = (daysAgo: number) => pad.l + ((days - 1 - daysAgo) / (days - 1)) * (w - pad.l - pad.r);
  const rowY = (f: DrawingPoint["feeling"]) => pad.t + FEELING_ROWS.indexOf(f) * ((h - pad.t - pad.b) / 2);
  // Same day, same row: spread the dots a little so each one stays visible.
  const placed = points.map((p, i) => ({ ...p, i, offset: points.slice(0, i).filter((q) => q.daysAgo === p.daysAgo && q.feeling === p.feeling).length }));
  const hovered = hover !== null ? placed[hover] : null;

  return (
    <ChartFrame
      title="Feeling shown in the drawings"
      table={{ head: ["Day", "Feeling", "What is drawn"], rows: [...points].sort((a, b) => a.daysAgo - b.daysAgo).map((p) => [dayLabel(today, p.daysAgo, "long"), labels[p.feeling].label, p.description || "—"]) }}
    >
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Feeling shown in each drawing over 30 days. Use Show table for the details.">
          {FEELING_ROWS.map((f) => (
            <g key={f}>
              <line x1={pad.l} x2={w - pad.r} y1={rowY(f)} y2={rowY(f)} stroke="var(--border)" />
              <text x={pad.l - 10} y={rowY(f)} dy="0.35em" textAnchor="end" fontSize="13" fill="var(--muted-foreground)">
                {labels[f].icon} {labels[f].label}
              </text>
            </g>
          ))}
          {[days - 1, 21, 14, 7, 0].map((d) => (
            <text key={d} x={x(d)} y={h - 6} textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">
              {d === 0 ? "Today" : `${d} d ago`}
            </text>
          ))}
          {placed.map((p) => (
            <g key={p.i} onPointerEnter={() => setHover(p.i)}>
              <circle cx={x(p.daysAgo) + p.offset * 9} cy={rowY(p.feeling)} r={14} fill="transparent" />
              <circle cx={x(p.daysAgo) + p.offset * 9} cy={rowY(p.feeling)} r={hover === p.i ? 7 : 6} fill={labels[p.feeling].color} stroke="var(--card)" strokeWidth="2" />
            </g>
          ))}
        </svg>
        {hovered && (
          <Tooltip x={((x(hovered.daysAgo) + hovered.offset * 9) / w) * 100} y={(rowY(hovered.feeling) / h) * 100 - 4}>
            {dayLabel(today, hovered.daysAgo, "long")} · {labels[hovered.feeling].label}
            {hovered.description && <span className="block max-w-72 whitespace-normal opacity-80">{hovered.description}</span>}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

/** Share of dark ink in each drawing, against the child's usual range (mean ± one standard deviation). */
export function DrawingInkChart({ points, usual, days = 30 }: { points: DrawingPoint[]; usual: { mean: number; sd: number }; days?: number }) {
  const today = useToday();
  const [hover, setHover] = useState<number | null>(null);
  const w = 600;
  const h = 170;
  const pad = { l: 44, r: 14, t: 12, b: 26 };
  const ih = h - pad.t - pad.b;
  const max = Math.min(1, Math.max(0.5, ...points.map((p) => p.dark), usual.mean + usual.sd) + 0.05);
  const x = (daysAgo: number) => pad.l + ((days - 1 - daysAgo) / (days - 1)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + ih - (Math.min(v, max) / max) * ih;
  const sorted = [...points].sort((a, b) => b.daysAgo - a.daysAgo);
  const path = sorted.map((p, i) => `${i ? "L" : "M"}${x(p.daysAgo).toFixed(1)},${y(p.dark).toFixed(1)}`).join("");
  const low = Math.max(0, usual.mean - usual.sd);
  const high = Math.min(max, usual.mean + usual.sd);
  const hovered = hover !== null ? sorted[hover] : null;
  const pct = (v: number) => `${Math.round(v * 100)}%`;

  return (
    <ChartFrame
      title="Dark ink in each drawing"
      table={{ head: ["Day", "Dark ink", "Usual range"], rows: [...sorted].reverse().map((p) => [dayLabel(today, p.daysAgo, "long"), pct(p.dark), `${pct(low)} to ${pct(high)}`]) }}
    >
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" role="img" aria-label="Share of dark ink in each drawing, with the child's usual range. Use Show table for the values.">
          {[0, max / 2, max].map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" />
              <text x={pad.l - 6} y={y(t)} dy="0.35em" textAnchor="end" fontSize="13" fill="var(--muted-foreground)">
                {pct(t)}
              </text>
            </g>
          ))}
          <rect x={pad.l} width={w - pad.l - pad.r} y={y(high)} height={Math.max(2, y(low) - y(high))} fill="var(--role-care)" opacity={0.15} />
          <line x1={pad.l} x2={w - pad.r} y1={y(usual.mean)} y2={y(usual.mean)} stroke="var(--role-care-ink)" strokeDasharray="4 4" opacity={0.6} />
          {[days - 1, 21, 14, 7, 0].map((d) => (
            <text key={d} x={x(d)} y={h - 6} textAnchor="middle" fontSize="13" fill="var(--muted-foreground)">
              {d === 0 ? "Today" : `${d} d ago`}
            </text>
          ))}
          <path d={path} fill="none" stroke="var(--role-care-ink)" strokeWidth="2" strokeLinejoin="round" />
          {sorted.map((p, i) => (
            <g key={i} onPointerEnter={() => setHover(i)}>
              <circle cx={x(p.daysAgo)} cy={y(p.dark)} r={14} fill="transparent" />
              <circle cx={x(p.daysAgo)} cy={y(p.dark)} r={hover === i ? 6 : 4.5} fill="var(--role-care-ink)" stroke="var(--card)" strokeWidth="2" />
            </g>
          ))}
        </svg>
        {hovered && (
          <Tooltip x={(x(hovered.daysAgo) / w) * 100} y={(y(hovered.dark) / h) * 100 - 4}>
            {dayLabel(today, hovered.daysAgo, "long")} · {pct(hovered.dark)} dark ink
          </Tooltip>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
        <li className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-role-care/30" aria-hidden /> Usual range ({pct(low)} to {pct(high)})
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full bg-role-care-ink" aria-hidden /> One drawing
        </li>
      </ul>
    </ChartFrame>
  );
}
