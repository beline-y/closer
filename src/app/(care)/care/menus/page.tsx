import type { Metadata } from "next";
import { Suspense } from "react";
import { type MenuEntry, MenuWeek } from "@/components/care/menu-week";
import { EmptyState } from "@/components/kit/empty-state";
import { todayIn } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Menus · Closer" };

const UNIT_TIMEZONE = "America/New_York";
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const mondayOf = (d: string) => addDays(d, -((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7));

export default function CareMenusPage({ searchParams }: PageProps<"/care/menus">) {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Menus</h1>
        <p className="text-muted-foreground">The hospital menu, per day and meal. Patients rate each dish in their check-in.</p>
      </header>
      <Suspense fallback={<p className="text-muted-foreground">Loading the menu…</p>}>
        <Menus searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Menus({ searchParams }: { searchParams: PageProps<"/care/menus">["searchParams"] }) {
  const { week } = await searchParams;
  const supabase = await createClient();
  // RLS: a care team member only sees their own memberships.
  const { data: units } = await supabase.from("care_unit_members").select("unit_id, care_units(name)");
  const unit = units?.[0];
  if (!unit) {
    return (
      <EmptyState emoji="🍽️" title="No unit yet">
        Ask an admin to add you to your unit to set its menu.
      </EmptyState>
    );
  }
  const today = todayIn(UNIT_TIMEZONE);
  const weekStart = mondayOf(typeof week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(week) ? week : today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const { data } = await supabase
    .from("menu_items")
    .select("id, menu_date, meal, dish_name, icon, position")
    .eq("unit_id", unit.unit_id)
    .gte("menu_date", days[0])
    .lte("menu_date", days[6])
    .order("position");
  const entries: MenuEntry[] = (data ?? []).map((m) => ({ id: m.id, date: m.menu_date, meal: m.meal, dish: m.dish_name, icon: m.icon }));

  return (
    <>
      <p className="font-bold">{unit.care_units?.name}</p>
      <MenuWeek unitId={unit.unit_id} weekStart={weekStart} days={days} today={today} entries={entries} />
    </>
  );
}
