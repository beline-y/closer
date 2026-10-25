"use client";

import { Copy, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { addDish, copyLastWeek, removeDish } from "@/app/menu-actions";
import { MEALS, type MealKind } from "@/lib/checkin";
import { cn } from "@/lib/utils";

export type MenuEntry = { id: string; date: string; meal: MealKind; dish: string; icon: string };

const ICONS = ["🍝", "🍗", "🥣", "🐟", "🥪", "🧀", "🍕", "🍲", "🥔", "🌮", "🥧", "🍚", "🥞", "🍳", "🫐", "🍞", "🍎", "🍌", "🧁", "🍮", "🍓", "🍨", "🥗", "🥛"];

const label = (d: string, opts: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });

// One week of a unit's menu: pick a day, then add or remove dishes per meal.
export function MenuWeek({ unitId, weekStart, days, today, entries }: { unitId: string; weekStart: string; days: string[]; today: string; entries: MenuEntry[] }) {
  const [day, setDay] = useState(days.includes(today) ? today : days[0]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const prev = days[0] && new Date(Date.parse(`${weekStart}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const next = new Date(Date.parse(`${weekStart}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`/care/menus?week=${prev}`} className="min-h-11 content-center rounded-lg px-3 font-bold hover:bg-muted">
            ← Previous
          </Link>
          <span className="font-bold">
            Week of {label(weekStart, { month: "long", day: "numeric" })}
          </span>
          <Link href={`/care/menus?week=${next}`} className="min-h-11 content-center rounded-lg px-3 font-bold hover:bg-muted">
            Next →
          </Link>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await copyLastWeek(unitId, weekStart);
              setMessage(r.ok ? (r.copied ? `Copied ${r.copied} dishes from last week into the empty days.` : "Every day of this week already has a menu.") : r.error);
            })
          }
          className="flex min-h-11 items-center gap-2 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-60"
        >
          <Copy className="size-4" aria-hidden /> Copy last week
        </button>
      </div>
      {message && (
        <p aria-live="polite" className="rounded-lg bg-role-care-soft px-4 py-2 font-bold text-role-care-ink">
          {message}
        </p>
      )}

      <div role="tablist" aria-label="Day" className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const count = entries.filter((e) => e.date === d).length;
          return (
            <button
              key={d}
              type="button"
              role="tab"
              aria-selected={day === d}
              onClick={() => setDay(d)}
              className={cn("flex min-h-14 flex-col items-center justify-center rounded-lg border text-sm", day === d ? "border-role-care-ink bg-role-care-soft font-bold" : "bg-card")}
            >
              <span>{label(d, { weekday: "short" })}</span>
              <span className="tabular-nums">{label(d, { day: "numeric" })}</span>
              <span className={cn("text-xs", count ? "text-muted-foreground" : "font-bold text-alert")}>{count ? `${count} dishes` : "Empty"}</span>
              {d === today && <span className="sr-only">(today)</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="grid gap-4 md:grid-cols-2">
        {MEALS.map((meal) => (
          <MealCard key={meal.value} unitId={unitId} date={day} meal={meal.value} title={`${meal.emoji} ${meal.label}`} dishes={entries.filter((e) => e.date === day && e.meal === meal.value)} />
        ))}
      </div>
    </div>
  );
}

function MealCard({ unitId, date, meal, title, dishes }: { unitId: string; date: string; meal: MealKind; title: string; dishes: MenuEntry[] }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🍽️");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = `${meal}-${date}`;
  return (
    <section aria-labelledby={`${id}-title`} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 id={`${id}-title`} className="font-heading text-lg font-extrabold">
        {title}
      </h2>
      {dishes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No dish yet.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {dishes.map((d) => (
            <li key={d.id} className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-1.5">
              <span aria-hidden className="text-2xl">
                {d.icon}
              </span>
              <span className="flex-1">{d.dish}</span>
              <button
                type="button"
                aria-label={`Remove ${d.dish}`}
                disabled={pending}
                onClick={() => start(async () => void (await removeDish(d.id)))}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-alert-soft hover:text-alert"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          start(async () => {
            const r = await addDish(unitId, date, meal, name, icon);
            if (r.ok) setName("");
            else setError(r.error);
          });
        }}
        className="flex flex-col gap-2"
      >
        <div className="flex gap-2">
          <label htmlFor={`${id}-icon`} className="sr-only">
            Icon
          </label>
          <select id={`${id}-icon`} value={icon} onChange={(e) => setIcon(e.target.value)} className="min-h-11 rounded-lg border bg-background px-2 text-xl">
            {["🍽️", ...ICONS].map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-name`} className="sr-only">
            Dish name
          </label>
          <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Add a dish" className="min-h-11 min-w-0 flex-1 rounded-lg border bg-background px-3" />
          <button type="submit" disabled={pending || !name.trim()} aria-label={`Add to ${title}`} className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-role-care-ink text-white disabled:opacity-50">
            <Plus className="size-5" aria-hidden />
          </button>
        </div>
        {error && <p className="text-sm font-bold text-alert">{error}</p>}
      </form>
    </section>
  );
}
