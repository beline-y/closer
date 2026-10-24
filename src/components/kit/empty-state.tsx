import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Never a blank screen: an emoji, a kind sentence and a next step.
export function EmptyState({ emoji, title, children, className }: { emoji: string; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-border px-6 py-10 text-center", className)}>
      <span aria-hidden className="text-5xl">
        {emoji}
      </span>
      <p className="font-heading text-xl font-extrabold">{title}</p>
      {children && <div className="max-w-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
