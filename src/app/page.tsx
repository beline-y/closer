import Link from "next/link";
import { Suspense } from "react";
import { SupabaseStatus } from "@/components/supabase-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ROLES } from "@/lib/roles";
import { cn } from "@/lib/utils";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <span className="text-5xl" aria-hidden>
          💛
        </span>
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">Closer</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Stay close to the people you love, even from a hospital bed.
        </p>
      </header>

      <nav aria-label="Dashboards" className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((role) => {
          const Icon = role.icon;
          return (
            <Link
              key={role.key}
              href={role.href}
              className="group rounded-2xl outline-none focus-visible:ring-4 focus-visible:ring-ring/50"
            >
              <Card className="h-full transition-transform group-hover:-translate-y-0.5 group-active:translate-y-0">
                <CardHeader className="flex flex-row items-center gap-4">
                  <span
                    className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl text-white", role.accentBg)}
                    aria-hidden
                  >
                    <Icon className="size-7" />
                  </span>
                  <div className="flex flex-col gap-1">
                    <CardTitle className="text-xl">{role.label}</CardTitle>
                    <CardDescription className="text-base">{role.tagline}</CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="text-sm font-bold text-primary">Open dashboard →</CardContent>
              </Card>
            </Link>
          );
        })}
      </nav>

      <footer className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        <Suspense fallback={null}>
          <SupabaseStatus />
        </Suspense>
        <p>Demo project. All data is fictional.</p>
      </footer>
    </main>
  );
}
