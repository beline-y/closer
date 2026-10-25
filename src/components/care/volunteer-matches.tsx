"use client";

import { CalendarCheck, CalendarX, Check, ChevronDown, Clock, HeartHandshake, Loader2, MessageCircle, Sparkles, TriangleAlert, UserX } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { rateVolunteerVisit, suggestVolunteer } from "@/app/care-ai-actions";
import type { ActionResult } from "@/app/checkin-actions";
import { LevelBadge } from "@/components/care/ai-summary";
import { CloserIcon } from "@/components/icons/closer-icon";
import { MoodFace } from "@/components/icons/mood-face";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { StatTile } from "@/components/kit/stat-tile";
import { daysBetween, relativeDay } from "@/lib/dates";
import { CONTACT_REQUEST_LABELS, type RosterVolunteer, VOLUNTEER_ROSTER } from "@/lib/demo-fixtures";
import { type ChildMatch, type Fit, FITS, type MatchBoard, type MatchOption, NEED_REASONS, type VisitOutcome, VISIT_OUTCOMES, type VolunteerLoad } from "@/lib/matching";
import { cn } from "@/lib/utils";

// This week's volunteer suggestions, for the care team only. Suggesting a volunteer means telling the
// child about them: the child decides whether to ask for a visit, which the care team and the guardian
// then approve (docs/SPEC.md). Volunteers never see any of this.

const ROSTER = new Map<string, RosterVolunteer>(VOLUNTEER_ROSTER.map((v) => [v.id, v]));
const REASON_ICONS: Record<keyof typeof NEED_REASONS, ReactNode> = {
  no_family: <UserX className="size-3.5" aria-hidden />,
  no_recent_visit: <CalendarX className="size-3.5" aria-hidden />,
  request_in_progress: <Clock className="size-3.5" aria-hidden />,
};


function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function since(today: string, day: string) {
  return relativeDay(daysBetween(today, day)).toLowerCase();
}

/** One server action at a time per control, its error shown next to it. */
function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: () => Promise<ActionResult>) =>
    start(async () => {
      setError(null);
      const result = await action();
      if (!result.ok) setError(result.error);
    });
  return { pending, error, run };
}

function FitBadge({ fit }: { fit: Fit }) {
  const f = FITS[fit];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold whitespace-nowrap", f.className)}>
      {f.stars > 0 && (
        <span aria-hidden className="flex">
          {Array.from({ length: f.stars }, (_, i) => (
            <CloserIcon key={i} name="star" className="size-3.5 fill-current" />
          ))}
        </span>
      )}
      {f.label}
    </span>
  );
}

function VolunteerAvatar({ v, large }: { v: RosterVolunteer; large?: boolean }) {
  return (
    <PersonaAvatar person={{ name: v.firstName, role: "volunteer" }} size={large ? "lg" : "sm"} decorative />
  );
}

function ErrorLine({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm font-bold text-alert">
      {error}
    </p>
  ) : null;
}

export function VolunteerMatches({ board }: { board: MatchBoard }) {
  const loads = new Map(board.volunteers.map((l) => [l.volunteer_id, l]));
  const offered = board.volunteers.reduce((n, l) => n + l.slots, 0);
  const left = board.volunteers.reduce((n, l) => n + Math.max(0, l.slots - l.held - l.proposed), 0);
  const matched = board.children.filter((c) => c.suggestion).length;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="matches-title" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="matches-title" className="flex items-center gap-2 font-heading text-lg font-extrabold">
            <HeartHandshake className="size-5 text-role-care-ink" aria-hidden /> Suggested volunteers this week
          </h2>
          <p className="text-muted-foreground">
            One volunteer per child, the most isolated children first, within the visits each volunteer offers. Suggesting a volunteer means telling the child about them: the child decides whether to ask for a visit.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-bold">
          {board.claude ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-role-care-soft px-2.5 py-0.5 text-role-care-ink">
              <Sparkles className="size-3.5" aria-hidden /> Interests read by Claude
            </span>
          ) : (
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">Matched by keywords: Claude is off</span>
          )}
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-muted-foreground">Learning from {plural(board.rated_visits, "rated visit")}</span>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Children with a suggestion" value={`${matched} of ${board.children.length}`} />
        <StatTile label="Volunteer visits left" value={left} hint={`Of ${offered} offered this week`} />
        <StatTile label="Visits rated" value={board.rated_visits} hint="Each rating sharpens the next suggestions" />
      </div>

      <RateVisits board={board} />

      <ol aria-label="Children, most isolated first" className="flex flex-col gap-4">
        {board.children.map((c) => (
          <ChildCard key={c.patient_id} child={c} loads={loads} today={board.today} />
        ))}
      </ol>

      <VolunteerLoads loads={board.volunteers} />
      <HowItWorks claude={board.claude} />
    </div>
  );
}

function ChildCard({ child, loads, today }: { child: ChildMatch; loads: Map<string, VolunteerLoad>; today: string }) {
  const reasons = child.reasons.filter((r): r is keyof typeof NEED_REASONS => r in NEED_REASONS);
  return (
    <li className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <PersonaAvatar person={{ name: child.nickname, role: "patient" }} size="md" decorative />
          <div className="flex min-w-0 flex-col">
            <h3 className="font-bold">
              {child.nickname} <span className="font-normal text-muted-foreground">{child.age} years</span>
            </h3>
            <p className="text-sm text-muted-foreground">{child.interests.length ? `Loves ${child.interests.join(", ")}` : "No interests noted yet"}</p>
          </div>
        </div>
        <ul aria-label={`Why ${child.nickname} is in this place`} className="flex flex-wrap gap-1.5">
          {(child.level === "fragile" || child.level === "distress") && (
            <li>
              <LevelBadge level={child.level} />
            </li>
          )}
          {reasons.map((r) => (
            <li key={r} className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-bold", NEED_REASONS[r].tone === "alert" ? "bg-alert-soft text-alert" : "bg-muted text-muted-foreground")}>
              {REASON_ICONS[r]} {NEED_REASONS[r].label}
            </li>
          ))}
        </ul>
      </div>

      {child.level === "distress" && (
        <p className="flex items-center gap-2 text-sm font-bold text-alert">
          <TriangleAlert className="size-4 shrink-0" aria-hidden /> Check with the psychologist before planning a visit.
        </p>
      )}

      {child.suggestion ? (
        <SuggestionPanel child={child} option={child.suggestion} load={loads.get(child.suggestion.volunteer_id)} today={today} />
      ) : (
        <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
          {child.unmatched === "no_free_volunteer"
            ? `The volunteers who share ${child.nickname}'s interests have no visit left this week.`
            : `No volunteer shares ${child.nickname}'s interests yet.`}
        </p>
      )}

      {child.options.length > 0 && <Alternatives child={child} />}

      {child.requests.length > 0 && (
        <p className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">Requests from {child.nickname}:</span>{" "}
          {child.requests.map((r, i) => (
            <span key={`${r.volunteer_id}-${r.local_date}`}>
              {i > 0 && " · "}
              {ROSTER.get(r.volunteer_id)?.firstName ?? r.volunteer_id}, {CONTACT_REQUEST_LABELS[r.status].toLowerCase()} ({since(today, r.local_date)})
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

function learned(option: MatchOption, v: RosterVolunteer, load?: VolunteerLoad): string {
  const met = option.met_before > 0 ? "They met before and it went well. " : option.met_before < 0 ? "They met before and it was hard. " : "";
  const record = load && load.rated > 0 ? `${load.went_well} of ${plural(load.rated, "rated visit")} with ${v.firstName} went well.` : `No rated visit with ${v.firstName} yet.`;
  return met + record;
}

function SuggestionPanel({ child, option, load, today }: { child: ChildMatch; option: MatchOption; load?: VolunteerLoad; today: string }) {
  const { pending, error, run } = useAction();
  const v = ROSTER.get(option.volunteer_id);
  if (!v) return null;
  const left = load ? Math.max(0, load.slots - load.held - load.proposed) : null;
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-role-volunteer-soft/60 p-4 ring-1 ring-role-volunteer/25">
      <div className="flex flex-wrap items-center gap-3">
        <VolunteerAvatar v={v} large />
        <div className="flex min-w-0 flex-1 basis-48 flex-col">
          <span className="text-xs font-bold tracking-wide text-role-volunteer-ink uppercase">{option.suggested_on ? "Suggested" : "Best match this week"}</span>
          <span className="text-lg font-extrabold">
            {v.firstName} <span className="font-bold text-role-volunteer-ink">· {v.job}</span>
          </span>
        </div>
        <FitBadge fit={option.fit} />
      </div>
      {option.shared.length > 0 && (
        <ul aria-label="What they share" className="flex flex-wrap gap-1.5">
          {option.shared.map((bridge) => (
            <li key={bridge} className="rounded-full bg-card px-2.5 py-0.5 text-sm font-bold">
              {bridge}
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm leading-relaxed">{option.reason}</p>
      {option.starter && (
        <p className="flex items-start gap-2 text-sm">
          <MessageCircle className="mt-0.5 size-4 shrink-0 text-role-volunteer-ink" aria-hidden />
          <span>
            <span className="font-bold">A first question {child.nickname} could ask:</span> “{option.starter}”
          </span>
        </p>
      )}
      <p className="text-sm text-muted-foreground">{learned(option, v, load)}</p>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-role-volunteer/20 pt-3">
        {option.suggested_on ? (
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 font-bold text-success">
              <Check className="size-3.5" aria-hidden /> Suggested {since(today, option.suggested_on)}
            </span>
            Tell {child.nickname} about {v.firstName}: {child.nickname} decides whether to ask for a visit.
          </p>
        ) : (
          <>
            <span className="text-sm text-muted-foreground">
              {left === null ? "" : left === 0 ? `This is ${v.firstName}'s last free visit this week.` : `${v.firstName} still has ${plural(left, "free visit")} after this one.`}
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => suggestVolunteer(child.patient_id, v.id))}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-60"
            >
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Suggest {v.firstName} to {child.nickname}
            </button>
          </>
        )}
      </div>
      <ErrorLine error={error} />
    </div>
  );
}

function Alternatives({ child }: { child: ChildMatch }) {
  return (
    <details className="group rounded-lg border">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 text-sm font-bold [&::-webkit-details-marker]:hidden">
        Other matches for {child.nickname} ({child.options.length})
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="flex flex-col divide-y border-t">
        {child.options.map((o) => (
          <AlternativeRow key={o.volunteer_id} child={child} option={o} />
        ))}
      </ul>
    </details>
  );
}

function AlternativeRow({ child, option }: { child: ChildMatch; option: MatchOption }) {
  const { pending, error, run } = useAction();
  const v = ROSTER.get(option.volunteer_id);
  if (!v) return null;
  return (
    <li className="flex flex-col gap-2 px-3 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <VolunteerAvatar v={v} />
        <div className="flex min-w-0 flex-1 basis-56 flex-col">
          <span className="font-bold">
            {v.firstName} <span className="font-normal text-muted-foreground">· {v.job}</span>
          </span>
          <span className="text-sm text-muted-foreground">{option.reason}</span>
        </div>
        <FitBadge fit={option.fit} />
        {option.status === "full" ? (
          <span className="text-sm font-bold text-muted-foreground">Fully booked this week</span>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => suggestVolunteer(child.patient_id, v.id))}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-muted px-3 font-bold disabled:opacity-60"
          >
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Suggest instead
          </button>
        )}
      </div>
      <ErrorLine error={error} />
    </li>
  );
}

type RateItem = { child: ChildMatch; volunteerId: string; localDate: string; outcome: VisitOutcome | null };

function RateVisits({ board }: { board: MatchBoard }) {
  const items: RateItem[] = board.children.flatMap((c) => [
    ...c.to_rate.map((r) => ({ child: c, volunteerId: r.volunteer_id, localDate: r.local_date, outcome: null })),
    ...c.rated.map((r) => ({ child: c, volunteerId: r.volunteer_id, localDate: r.local_date, outcome: r.outcome })),
  ]);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="rate-title" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1">
        <h3 id="rate-title" className="flex items-center gap-2 font-heading font-extrabold">
          <CalendarCheck className="size-5 text-role-care-ink" aria-hidden /> How did the visits go?
        </h3>
        <p className="text-sm text-muted-foreground">Each rating teaches the matching which visits work, for every child.</p>
      </div>
      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <RateRow key={`${item.child.patient_id}-${item.volunteerId}-${item.localDate}`} item={item} today={board.today} />
        ))}
      </ul>
    </section>
  );
}

function RateRow({ item, today }: { item: RateItem; today: string }) {
  const { pending, error, run } = useAction();
  const v = ROSTER.get(item.volunteerId);
  const name = v?.firstName ?? item.volunteerId;
  const rated = VISIT_OUTCOMES.find((o) => o.value === item.outcome);
  return (
    <li className="flex flex-col gap-2 rounded-lg bg-muted/60 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="font-bold">
          {item.child.nickname} met {name}
          <span className="font-normal text-muted-foreground"> · {relativeDay(daysBetween(today, item.localDate))}</span>
        </span>
        {rated ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1 text-sm font-bold">
            <MoodFace value={rated.face} /> {rated.label}
          </span>
        ) : (
          <div role="group" aria-label={`How did ${item.child.nickname}'s visit with ${name} go?`} className="flex flex-wrap gap-2">
            {VISIT_OUTCOMES.map((o) => (
              <button
                key={o.value}
                type="button"
                disabled={pending}
                onClick={() => run(() => rateVolunteerVisit(item.child.patient_id, item.volunteerId, item.localDate, o.value))}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border bg-card px-3 font-bold hover:bg-muted disabled:opacity-60"
              >
                <MoodFace value={o.face} /> {o.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <ErrorLine error={error} />
    </li>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-full", className)} />
      {label}
    </span>
  );
}

// One segment per weekly visit, in one hue: arranged (ink), suggested now (base), free (the soft track).
function VolunteerLoads({ loads }: { loads: VolunteerLoad[] }) {
  return (
    <section aria-labelledby="loads-title" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="loads-title" className="font-heading font-extrabold">
          Volunteer visits this week
        </h3>
        <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <Key className="bg-role-volunteer-ink" label="Arranged" />
          <Key className="bg-role-volunteer" label="Suggested now" />
          <Key className="bg-role-volunteer-soft" label="Free" />
        </p>
      </div>
      <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {loads.map((l) => {
          const v = ROSTER.get(l.volunteer_id);
          if (!v) return null;
          const arranged = Math.min(l.held, l.slots);
          const suggested = Math.min(l.proposed, l.slots - arranged);
          const free = l.slots - arranged - suggested;
          const summary = `${arranged} arranged, ${suggested} suggested now, ${free} free, of ${plural(l.slots, "visit")} a week`;
          return (
            <li key={l.volunteer_id} className="flex items-center gap-3">
              <VolunteerAvatar v={v} />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate font-bold">
                    {v.firstName} <span className="font-normal text-muted-foreground">· {v.job}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground">{l.slots === 0 ? "No visits offered" : free === 0 ? "Full" : `${free} of ${l.slots} free`}</span>
                </div>
                <div role="img" aria-label={summary} title={summary} className="flex h-2 gap-0.5">
                  {Array.from({ length: l.slots }, (_, i) => (
                    <span key={i} className={cn("flex-1 rounded-full", i < arranged ? "bg-role-volunteer-ink" : i < arranged + suggested ? "bg-role-volunteer" : "bg-role-volunteer-soft")} />
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HowItWorks({ claude }: { claude: boolean }) {
  return (
    <details className="group rounded-xl border bg-card p-4 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-bold [&::-webkit-details-marker]:hidden">
        How suggestions are made
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-muted-foreground">
        <li>
          <span className="font-bold text-foreground">What they share.</span>{" "}
          {claude
            ? "Claude reads each child's age and interests, never their name, check-ins or health, next to each volunteer's public story."
            : "Keywords compare each child's interests with each volunteer's public story. With Claude on, the reading is finer."}
        </li>
        <li>
          <span className="font-bold text-foreground">What visits taught.</span> Every visit you rate updates a learning model of how visits go with each volunteer. A volunteer with few rated visits keeps the benefit of the doubt.
        </li>
        <li>
          <span className="font-bold text-foreground">Who comes first.</span> Children with no family linked, a fragile wellbeing reading or no recent visit come first, and each volunteer&apos;s weekly visits are shared out for the best overall fit.
        </li>
      </ol>
      <p className="mt-3 text-muted-foreground">Volunteers never see these suggestions or who a child is. Only the child can ask for a visit; then you and the guardian approve it.</p>
    </details>
  );
}
