"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { useFormStatus } from "react-dom";
import { switchRole } from "@/app/demo-actions";

// Shown on every page while DEMO_MODE is on (rendered from the root layout).
// "Switch role" signs out and returns to the picker; it's hidden on the picker itself.
export function DemoBanner() {
  return (
    <div role="region" aria-label="Demo mode" className="bg-foreground text-background">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm sm:justify-between">
        <p>
          <span aria-hidden>🎭 </span>
          <strong>Demo mode.</strong> Secure sign-in coming soon.
        </p>
        {/* usePathname() needs a Suspense boundary on dynamic routes */}
        <Suspense fallback={<SwitchRoleForm />}>
          <SwitchRoleUnlessPicker />
        </Suspense>
      </div>
    </div>
  );
}

function SwitchRoleUnlessPicker() {
  return usePathname() === "/" ? null : <SwitchRoleForm />;
}

function SwitchRoleForm() {
  return (
    <form
      action={async () => {
        window.location.replace(await switchRole());
      }}
    >
      <SwitchRoleButton />
    </form>
  );
}

function SwitchRoleButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center rounded-full bg-background/15 px-4 font-bold transition hover:bg-background/25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-background/50 disabled:opacity-70"
    >
      {pending ? "Switching…" : "Switch role"}
    </button>
  );
}
