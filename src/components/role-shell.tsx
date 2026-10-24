import Link from "next/link";
import type { ReactNode } from "react";
import { getRole, type RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

// Shared frame for each role's area: colored header + back link to the landing page.
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
          <Link
            href="/"
            className="inline-flex min-h-12 items-center rounded-xl px-3 font-bold underline-offset-4 hover:underline focus-visible:ring-4 focus-visible:ring-white/60 focus-visible:outline-none"
          >
            ← Closer
          </Link>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
