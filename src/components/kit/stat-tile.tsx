import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Headline number with a label and an optional hint or sparkline underneath.
export function StatTile({ label, value, hint, tone, children }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "alert"; children?: ReactNode }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border bg-card p-4", tone === "alert" && "border-alert/40 bg-alert-soft")}>
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-heading text-3xl font-extrabold tabular-nums">{value}</span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      {children}
    </div>
  );
}
