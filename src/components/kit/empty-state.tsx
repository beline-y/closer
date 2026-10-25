import type { ReactNode } from "react";
import { CloserIcon, type IconName } from "@/components/icons/closer-icon";
import { cn } from "@/lib/utils";

// Never a blank screen: an icon, a kind sentence and a next step.
export function EmptyState({ icon, title, children, className }: { icon: IconName; title: string; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed border-border px-6 py-10 text-center", className)}>
      <span aria-hidden className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <CloserIcon name={icon} className="size-7" />
      </span>
      <p className="font-heading text-xl font-extrabold">{title}</p>
      {children && <div className="max-w-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
