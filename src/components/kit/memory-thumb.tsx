import { CloserIcon, type IconName } from "@/components/icons/closer-icon";
import type { Memory, MemoryTag } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

export const MEMORY_TAG_ICONS: Record<MemoryTag, IconName> = {
  holiday: "holiday",
  birthday: "birthday",
  pet: "pet",
  school: "school",
  family: "family",
  friends: "friends",
  other: "memory",
};

// Placeholder "photo" until uploads exist: a soft gradient with the tag's icon.
export function MemoryThumb({ memory, className, iconClassName }: { memory: Pick<Memory, "tag" | "gradient">; className?: string; iconClassName?: string }) {
  return (
    <span aria-hidden className={cn("flex items-center justify-center bg-gradient-to-br text-foreground/70", memory.gradient, className)}>
      <CloserIcon name={MEMORY_TAG_ICONS[memory.tag]} className={cn("size-8", iconClassName)} strokeWidth={1.75} />
    </span>
  );
}
