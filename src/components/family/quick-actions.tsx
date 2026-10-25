import Link from "next/link";
import { QuestionIdeas } from "@/components/question-ideas";
import { cn } from "@/lib/utils";
import { isDemoMode } from "@/lib/demo-mode";
import { CloserIcon, type IconName } from "@/components/icons/closer-icon";

const ACTIONS: { href: string; icon: IconName; label: string }[] = [
  { href: "/family", icon: "heart", label: "Reply to Leo" },
  { href: "/family/cards", icon: "card", label: "Write a card" },
  { href: "/family/question", icon: "idea", label: "Answer today's question" },
  { href: "/family/memories", icon: "memory", label: "Add a memory" },
];

// Always visible: a scrolling row on phones, a sticky side panel on desktop.
export function QuickActions({ className }: { className?: string }) {
  return (
    <section aria-labelledby="quick-title" className={cn("flex flex-col gap-3", className)}>
      <h2 id="quick-title" className="sr-only lg:not-sr-only lg:text-lg lg:font-extrabold">
        Quick actions
      </h2>
      <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0">
        {ACTIONS.map((a) => (
          <li key={a.label} className="shrink-0">
            <Link href={a.href} className="flex min-h-12 items-center gap-2 rounded-full bg-card px-4 font-bold whitespace-nowrap shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 lg:rounded-2xl lg:px-4 lg:py-3">
              <CloserIcon name={a.icon} className="size-5 text-role-family-ink" />
              {a.label}
            </Link>
          </li>
        ))}
      </ul>
      <QuestionIdeas />
      {isDemoMode() && <a href="#ai-notification-demo" className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-role-family-soft px-4 font-bold text-role-family-ink"><CloserIcon name="bell" /> Try AI notification demo</a>}
    </section>
  );
}
