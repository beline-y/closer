import { Brush, CloudRain, Home, Hospital, ShieldAlert, Sun, Trees, User, Users } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { DrawingFeelingTimeline, DrawingInkChart } from "@/components/kit/charts";
import { StatTile } from "@/components/kit/stat-tile";
import { relativeDay } from "@/lib/dates";
import { DRAWING_FEELINGS, type DrawingItem, type DrawingsView as View, feelingOf } from "@/lib/drawings";
import { cn } from "@/lib/utils";

// How a child's drawings change: what is drawn and the colors used, against the child's own
// usual drawings. Never an interpretation of the child's psychology.

function signed(value: number, digits = 0) {
  const text = Math.abs(value).toFixed(digits);
  return value > 0 ? `+${text}` : value < 0 ? `−${text}` : text;
}

function Chip({ children, tone }: { children: ReactNode; tone?: "alert" }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", tone === "alert" ? "bg-alert-soft text-alert" : "bg-muted text-muted-foreground")}>
      {children}
    </span>
  );
}

function DrawingCard({ d }: { d: DrawingItem }) {
  const feeling = DRAWING_FEELINGS[feelingOf(d)];
  const setting = { home: <Home className="size-3" aria-hidden />, hospital: <Hospital className="size-3" aria-hidden />, outdoors: <Trees className="size-3" aria-hidden />, other: null }[d.setting];
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex h-10" role="img" aria-label={`Main colors: ${d.palette.length ? d.palette.join(", ") : "none"}`}>
        {d.palette.length ? d.palette.map((c) => <span key={c} className="flex-1" style={{ background: c }} />) : <span className="flex-1 bg-muted" />}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">{relativeDay(d.days_ago)}</span>
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold", feeling.className)}>
            <span aria-hidden>{feeling.icon}</span> {feeling.label}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-pretty">{d.description || "Colors only: Claude did not read this drawing."}</p>
        <div className="mt-auto flex flex-wrap gap-1.5">
          {d.safety !== "none" && (
            <Chip tone="alert">
              <ShieldAlert className="size-3" aria-hidden /> Sent to the psychologist
            </Chip>
          )}
          {d.people > 0 && (
            <Chip>
              {d.alone ? <User className="size-3" aria-hidden /> : <Users className="size-3" aria-hidden />}
              {d.alone ? "One person alone" : `${d.people} people`}
            </Chip>
          )}
          {d.family && <Chip>Family</Chip>}
          {d.smiling_faces > 0 && <Chip>☺ {d.smiling_faces} smiling</Chip>}
          {d.sad_faces > 0 && <Chip tone="alert">☹ {d.sad_faces} sad</Chip>}
          {setting && <Chip>{setting} {d.setting[0].toUpperCase() + d.setting.slice(1)}</Chip>}
          {d.sun && (
            <Chip>
              <Sun className="size-3" aria-hidden /> Sun
            </Chip>
          )}
          {d.rain && (
            <Chip>
              <CloudRain className="size-3" aria-hidden /> Rain
            </Chip>
          )}
          <Chip>
            {d.colors} {d.colors === 1 ? "color" : "colors"} · {Math.round(d.dark_share * 100)}% dark
          </Chip>
        </div>
      </div>
    </li>
  );
}

export function DrawingsView({ view, nickname }: { view: View; nickname: string }) {
  const week = view.this_week;
  const usual = view.usual;
  if (view.drawings.length === 0) {
    return (
      <EmptyState emoji="🖍️" title="No drawing yet">
        Add a photo of {nickname}&apos;s drawing above. Its colors and what it shows will be followed over time.
      </EmptyState>
    );
  }
  const points = view.drawings.filter((d) => d.days_ago < 30).map((d) => ({ daysAgo: d.days_ago, feeling: feelingOf(d), dark: d.dark_share, description: d.description }));
  const darkPts = week.dark_shift === null ? null : week.dark_shift * 100;
  const change =
    week.change === null ? null : week.change > 0.8 ? "very different from" : week.change > 0.5 ? "somewhat different from" : "close to";

  return (
    <>
      <section aria-labelledby="week-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="week-title" className="font-heading text-lg font-extrabold">
            This week against {nickname}&apos;s usual drawings
          </h2>
          <p className="text-muted-foreground">
            {change
              ? `This week's drawings are ${change} ${nickname}'s usual ones.`
              : `No drawing this week. Earlier drawings are below.`}
            {usual.from_drawings < 3 && " Few earlier drawings yet: the usual range leans on what most children draw."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Drawings this week" value={week.count} hint={usual.per_week !== null ? `Usually ${usual.per_week} a week` : "First week"} />
          <StatTile
            label="Feelings shown"
            value={
              <span className="text-2xl">
                {week.negative} sad · {week.positive} happy
              </span>
            }
            hint="Explicit cues only: faces, words. Otherwise neutral"
            tone={week.negative > week.positive ? "alert" : undefined}
          />
          <StatTile label="Dark ink vs usual" value={darkPts === null ? "—" : `${signed(darkPts)} pts`} hint={`Usually ${Math.round(usual.dark_share.mean * 100)}% of the ink`} tone={darkPts !== null && darkPts >= 10 ? "alert" : undefined} />
          <StatTile label="Colors vs usual" value={week.color_shift === null ? "—" : signed(week.color_shift, 1)} hint={`Usually ${usual.colors.mean.toFixed(1)} colors per drawing`} />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <DrawingFeelingTimeline points={points} labels={DRAWING_FEELINGS} />
        </section>
        <section className="rounded-xl border bg-card p-4">
          <DrawingInkChart points={points} usual={usual.dark_share} />
        </section>
      </div>

      <section aria-labelledby="gallery-title" className="flex flex-col gap-3">
        <h2 id="gallery-title" className="flex items-center gap-2 font-heading text-lg font-extrabold">
          <Brush className="size-5 text-role-care-ink" aria-hidden /> All drawings
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {view.drawings.map((d, i) => (
            <DrawingCard key={`${d.local_date}-${i}`} d={d} />
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          What is drawn and how it changes, never an interpretation: a single drawing proves nothing. The images are not kept, only their colors and Claude&apos;s description.
        </p>
      </section>
    </>
  );
}
