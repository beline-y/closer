"use client";

import { Loader2, UtensilsCrossed } from "lucide-react";
import { useState, useTransition } from "react";
import { saveTodaysMenu } from "@/app/care-ai-actions";
import { WARD_MEALS, type WardMenu } from "@/lib/nurse-round";
import { cn } from "@/lib/utils";

// Today's dishes, once for the ward. A child eating little of a dish nobody liked is not a
// child losing appetite: the AI compares each child with the others on the same menu.
export function WardMenuForm({ initial }: { initial: WardMenu }) {
  const [menu, setMenu] = useState<WardMenu>(initial);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, startSaving] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        startSaving(async () => {
          const result = await saveTodaysMenu(menu);
          setMessage(result.ok ? { ok: true, text: "Saved" } : { ok: false, text: result.error });
          if (result.ok) setDirty(false);
        });
      }}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <UtensilsCrossed className="size-5 text-role-care-ink" aria-hidden />
        <h2 className="font-heading text-lg font-extrabold">Today&apos;s menu</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        {WARD_MEALS.map((meal) => (
          <label key={meal.value} className="flex flex-col gap-1.5">
            <span className="text-sm font-bold">{meal.label}</span>
            <input
              value={menu[meal.value] ?? ""}
              maxLength={80}
              onChange={(e) => {
                setMenu((m) => ({ ...m, [meal.value]: e.target.value }));
                setDirty(true);
                setMessage(null);
              }}
              placeholder={meal.value === "lunch" ? "e.g. Fish and rice" : "e.g. Vegetable soup"}
              className="min-h-11 rounded-lg border bg-background px-3"
            />
          </label>
        ))}
        <button type="submit" disabled={saving || !dirty} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-role-care-ink px-4 font-bold text-white disabled:opacity-50">
          {saving && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Save menu
        </button>
      </div>
      <p aria-live="polite" className={cn("text-sm", message && !message.ok ? "font-bold text-alert" : "text-muted-foreground")}>
        {message?.text ?? "Lets the AI tell a lost appetite from a dish nobody liked."}
      </p>
    </form>
  );
}
