"use server";

import { refresh } from "next/cache";
import { MEALS, type MealKind } from "@/lib/checkin";
import { createClient } from "@/lib/supabase/server";

export type MenuResult = { ok: true; copied?: number } | { ok: false; error: string };

const isDate = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  return { supabase, userId: data?.claims.sub ?? null };
}

// RLS: only care team members of the unit can write its menu.
export async function addDish(unitId: string, date: string, meal: MealKind, name: string, icon: string): Promise<MenuResult> {
  const dish = name.trim().slice(0, 60);
  if (!dish || !isDate(date) || !MEALS.some((m) => m.value === meal)) return { ok: false, error: "Add a dish name." };
  const { supabase, userId } = await me();
  if (!userId) return { ok: false, error: "Not signed in." };
  const { data: existing } = await supabase.from("menu_items").select("position").match({ unit_id: unitId, menu_date: date, meal });
  const { error } = await supabase.from("menu_items").insert({
    unit_id: unitId,
    menu_date: date,
    meal,
    dish_name: dish,
    icon: [...(icon.trim() || "🍽️")].slice(0, 2).join(""),
    position: existing?.length ?? 0,
    created_by: userId,
  });
  if (error) return { ok: false, error: error.code === "23505" ? "This dish is already on the menu." : "Couldn't add the dish." };
  refresh();
  return { ok: true };
}

export async function removeDish(id: string): Promise<MenuResult> {
  const { supabase } = await me();
  const { error, count } = await supabase.from("menu_items").delete({ count: "exact" }).eq("id", id);
  if (error || !count) return { ok: false, error: "Couldn't remove the dish." };
  refresh();
  return { ok: true };
}

// Copies the 7 days before weekStart into this week, only into days that are still empty
// (a day already planned is never changed).
export async function copyLastWeek(unitId: string, weekStart: string): Promise<MenuResult> {
  if (!isDate(weekStart)) return { ok: false, error: "Invalid week." };
  const { supabase, userId } = await me();
  if (!userId) return { ok: false, error: "Not signed in." };
  const { data: last } = await supabase
    .from("menu_items")
    .select("menu_date, meal, dish_name, icon, position")
    .eq("unit_id", unitId)
    .gte("menu_date", addDays(weekStart, -7))
    .lt("menu_date", weekStart);
  const { data: current } = await supabase
    .from("menu_items")
    .select("menu_date, meal, dish_name")
    .eq("unit_id", unitId)
    .gte("menu_date", weekStart)
    .lt("menu_date", addDays(weekStart, 7));
  const plannedDays = new Set((current ?? []).map((c) => c.menu_date));
  const rows = (last ?? [])
    .map((d) => ({ ...d, menu_date: addDays(d.menu_date, 7) }))
    .filter((d) => !plannedDays.has(d.menu_date))
    .map((d) => ({ ...d, unit_id: unitId, created_by: userId }));
  if (rows.length === 0) return { ok: true, copied: 0 };
  const { error } = await supabase.from("menu_items").insert(rows);
  if (error) return { ok: false, error: "Couldn't copy last week." };
  refresh();
  return { ok: true, copied: rows.length };
}
