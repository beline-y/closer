"use client";

import {
  AlertTriangle,
  BookHeart,
  CalendarDays,
  HandHeart,
  Heart,
  Images,
  Inbox,
  type LucideIcon,
  Mail,
  MessageCircleQuestion,
  Newspaper,
  Puzzle,
  Settings,
  Sun,
  User,
  Users,
  UtensilsCrossed,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, Suspense } from "react";
import type { RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Max 5 tabs for patient, family and volunteer (bottom bar). The first item is the role's home.
export const NAV: Record<RoleKey, NavItem[]> = {
  patient: [
    { href: "/patient", label: "Today", icon: Sun },
    { href: "/patient/connect", label: "Connect", icon: Heart },
    { href: "/patient/play", label: "Play", icon: Puzzle },
    { href: "/patient/memories", label: "Memories", icon: Images },
    { href: "/patient/me", label: "Me", icon: User },
  ],
  family: [
    { href: "/family", label: "Feed", icon: Newspaper },
    { href: "/family/question", label: "Question", icon: MessageCircleQuestion },
    { href: "/family/cards", label: "Cards", icon: Mail },
    { href: "/family/memories", label: "Memories", icon: Images },
  ],
  volunteer: [
    { href: "/volunteer", label: "Questions", icon: MessageCircleQuestion },
    { href: "/volunteer/story", label: "My story", icon: BookHeart },
    { href: "/volunteer/events", label: "Events", icon: CalendarDays },
    { href: "/volunteer/requests", label: "Requests", icon: Inbox },
  ],
  care: [
    { href: "/care", label: "Patients", icon: Users },
    { href: "/care/alerts", label: "Alerts", icon: AlertTriangle },
    { href: "/care/volunteers", label: "Volunteers", icon: HandHeart },
    { href: "/care/menus", label: "Menus", icon: UtensilsCrossed },
    { href: "/care/events", label: "Events", icon: CalendarDays },
    { href: "/care/settings", label: "Settings", icon: Settings },
  ],
};

const ACTIVE: Record<RoleKey, string> = {
  patient: "bg-role-patient-soft text-role-patient-ink",
  family: "bg-role-family-soft text-role-family-ink",
  volunteer: "bg-role-volunteer-soft text-role-volunteer-ink",
  care: "bg-role-care-soft text-role-care-ink",
};

type WithPath<P> = P & { pathname: string | null };

/** True when pathname is href itself or a page below it, by whole segments
 * ("/patient/me" matches "/patient/me/x", never "/patient/memories"). */
export function isWithin(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// Screens without their own tab light up the tab they belong to.
const BELONGS_TO: Record<string, string> = {
  "/patient/question": "/patient",
  "/patient/checkin": "/patient",
  "/patient/activities": "/patient/play",
  "/care/patients": "/care",
  "/family/challenge": "/family",
};

// One rule for the bottom bar, the side rail and the top tabs: exactly one tab is active.
function activeMatcher(role: RoleKey, pathname: string | null) {
  const home = NAV[role][0].href;
  const owner = pathname && Object.entries(BELONGS_TO).find(([prefix]) => isWithin(pathname, prefix))?.[1];
  return (href: string) => {
    if (pathname === null) return false;
    if (owner) return href === owner;
    return href === home ? pathname === home : isWithin(pathname, href);
  };
}

// usePathname() needs a Suspense boundary on dynamic routes. The fallback is the same
// nav without an active tab, so nothing jumps while the path resolves.
function withPathname<P extends object>(View: ComponentType<WithPath<P>>) {
  function Current(props: P) {
    return <View {...props} pathname={usePathname()} />;
  }
  return function Nav(props: P) {
    return (
      <Suspense fallback={<View {...props} pathname={null} />}>
        <Current {...props} />
      </Suspense>
    );
  };
}

/** Bottom tab bar (phones) */
export const BottomTabs = withPathname(function BottomTabs({ role, className, pathname }: WithPath<{ role: RoleKey; className?: string }>) {
  const isActive = activeMatcher(role, pathname);
  return (
    <nav aria-label="Main" className={cn("fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur", className)}>
      <ul className="mx-auto flex max-w-xl">
        {NAV[role].map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className="group flex min-h-16 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-bold text-muted-foreground"
              >
                <span className={cn("flex h-8 w-14 items-center justify-center rounded-full transition", active ? ACTIVE[role] : "group-hover:bg-muted")}>
                  <Icon className="size-6" aria-hidden />
                </span>
                <span className={cn(active && "text-foreground")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

/** Vertical rail (patient on tablet) or sidebar (care team). `compact` hides labels. */
export const SideNav = withPathname(function SideNav({ role, compact, className, pathname }: WithPath<{ role: RoleKey; compact?: boolean; className?: string }>) {
  const isActive = activeMatcher(role, pathname);
  return (
    <nav aria-label="Main" className={className}>
      <ul className="flex flex-col gap-1.5">
        {NAV[role].map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={compact ? label : undefined}
                title={compact ? label : undefined}
                className={cn(
                  "flex items-center rounded-2xl font-bold transition",
                  role === "patient" ? "min-h-20 flex-col justify-center gap-1 px-2 text-sm" : "min-h-11 gap-3 px-3",
                  compact && role !== "patient" && "justify-center px-0",
                  active ? ACTIVE[role] : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className={role === "patient" ? "size-7" : "size-5"} aria-hidden />
                {!compact && <span>{label}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});

/** Horizontal tabs in the header (family and volunteer on desktop, care team on phones) */
export const TopTabs = withPathname(function TopTabs({ role, className, pathname }: WithPath<{ role: RoleKey; className?: string }>) {
  const isActive = activeMatcher(role, pathname);
  return (
    <nav aria-label="Main" className={cn("overflow-x-auto", className)}>
      <ul className="flex gap-1">
        {NAV[role].map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded-full px-4 font-bold whitespace-nowrap transition",
                  active ? ACTIVE[role] : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
});
