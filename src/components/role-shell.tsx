import type { ReactNode } from "react";
import { getRole, type RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

// Shared frame for each role's area: colored header with the role and its persona.
export function RoleShell({ role, children }: { role: RoleKey; children: ReactNode }) {
  const info = getRole(role);
  const Icon = info.icon;
  return (
    <div className="flex flex-1 flex-col">
      <header className={cn("text-white", info.accentBg)}>
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Icon className="size-7" aria-hidden />
            <span className="font-heading text-xl font-extrabold">{info.label}</span>
          </div>
          <div className="flex items-center gap-2 font-bold">
            <span aria-hidden className="flex size-10 items-center justify-center rounded-full bg-white/90 text-2xl">
              {info.persona.avatar}
            </span>
            {info.persona.name}
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
