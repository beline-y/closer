import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// Status, never color alone: icon + count + word.
export function AlertBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) {
    return <span className={cn("text-sm text-muted-foreground", className)}>None</span>;
  }
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-alert-soft px-2.5 py-0.5 text-sm font-bold whitespace-nowrap text-alert", className)}>
      <TriangleAlert className="size-3.5" aria-hidden />
      {count} {count === 1 ? "alert" : "alerts"}
    </span>
  );
}
