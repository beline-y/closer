import type { ReactNode } from "react";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { BottomTabs, SideNav, TopTabs } from "@/components/shell/role-nav";
import { CAST } from "@/lib/cast";
import { getRole, type RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

const ME = { patient: CAST.leo, family: CAST.emma, care: CAST.sarah, volunteer: CAST.maya } as const;

function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-1.5 font-heading text-xl font-extrabold", className)}>
      <span aria-hidden>💛</span> Closer
    </span>
  );
}

// Frame for each role: navigation and tone.
// Patient: bottom tabs on phones, a side rail from tablet up (playful).
// Family / volunteer: bottom tabs on phones and tablets, top tabs on desktop.
// Care team: tabs on phones, icon rail on tablets, full sidebar on desktop (calm).
export function RoleShell({ role, children }: { role: RoleKey; children: ReactNode }) {
  const me = ME[role];
  const info = getRole(role);

  if (role === "care") {
    return (
      <div data-tone="calm" className="flex flex-1 flex-col md:flex-row">
        <aside className="hidden shrink-0 flex-col gap-6 border-r bg-card p-3 md:flex md:w-20 lg:w-60 lg:p-4">
          <Logo className="justify-center lg:justify-start lg:px-3" />
          <SideNav role="care" compact className="lg:hidden" />
          <SideNav role="care" className="hidden lg:block" />
          <div className="mt-auto flex items-center justify-center gap-3 lg:justify-start lg:px-2">
            <PersonaAvatar person={me} size="sm" decorative />
            <div className="hidden flex-col text-sm lg:flex">
              <span className="font-bold">{me.name}</span>
              <span className="text-muted-foreground">{info.persona.detail}</span>
            </div>
          </div>
        </aside>
        <header className="flex flex-col gap-2 border-b bg-card px-4 py-3 md:hidden">
          <div className="flex items-center justify-between">
            <Logo />
            <PersonaAvatar person={me} size="sm" />
          </div>
          <TopTabs role="care" />
        </header>
        <main className="mx-auto flex w-full max-w-6xl min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    );
  }

  if (role === "patient") {
    return (
      <div data-tone="playful" className="flex flex-1 bg-[radial-gradient(circle_at_top_right,var(--role-patient-soft),transparent_45%)]">
        <aside className="sticky top-0 hidden h-dvh w-28 shrink-0 flex-col items-center gap-6 border-r bg-card/80 px-2 py-5 md:flex">
          <span aria-hidden className="text-3xl">💛</span>
          <SideNav role="patient" className="w-full" />
          <PersonaAvatar person={me} size="lg" className="mt-auto" />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between px-4 pt-4 md:hidden">
            <Logo />
            <PersonaAvatar person={me} size="md" />
          </header>
          <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 pt-4 pb-28 sm:px-6 md:pt-8 md:pb-10">{children}</main>
          <BottomTabs role="patient" className="md:hidden" />
        </div>
      </div>
    );
  }

  // family and volunteer
  return (
    <div data-tone="playful" className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Logo />
            {role === "family" && (
              <span className="hidden items-center gap-2 rounded-full bg-role-patient-soft py-1 pr-3 pl-1 text-sm font-bold text-role-patient-ink sm:flex">
                <PersonaAvatar person={CAST.leo} size="sm" decorative /> Leo
              </span>
            )}
            {role === "volunteer" && <span className="hidden rounded-full bg-role-volunteer-soft px-3 py-1 text-sm font-bold text-role-volunteer-ink sm:inline">Volunteer</span>}
          </div>
          <TopTabs role={role} className="hidden lg:block" />
          <div className="flex items-center gap-2">
            {role === "family" && (
              <span className="flex items-center gap-1.5 rounded-full bg-role-patient-soft py-1 pr-3 pl-1 text-sm font-bold text-role-patient-ink sm:hidden">
                <PersonaAvatar person={CAST.leo} size="sm" decorative /> Leo
              </span>
            )}
            <PersonaAvatar person={me} size="md" />
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 pt-6 pb-28 sm:px-6 lg:pb-10">{children}</main>
      <BottomTabs role={role} className="lg:hidden" />
    </div>
  );
}
