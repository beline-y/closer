import { Pin } from "lucide-react";
import type { ReactNode } from "react";
import type { CastMember } from "@/lib/cast";
import { cn } from "@/lib/utils";
import { PersonaAvatar } from "./persona-avatar";

// One line of the family feed: who, what, when, then optional content and actions.
export function FeedItem({
  person,
  line,
  when,
  pinned,
  children,
  className,
}: {
  person: CastMember;
  line: ReactNode;
  when: string;
  pinned?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "flex animate-rise gap-3 rounded-3xl bg-card p-4 shadow-sm ring-1 ring-border",
        pinned && "bg-role-family-soft ring-2 ring-role-family/50",
        className,
      )}
    >
      <PersonaAvatar person={person} size="md" decorative />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-base">{line}</p>
          <span className="flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground">
            {pinned && <Pin className="size-3.5" aria-label="Pinned until answered" />}
            {when}
          </span>
        </div>
        {children}
      </div>
    </article>
  );
}
