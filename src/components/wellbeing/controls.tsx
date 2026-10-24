"use client";

import { useActionState, useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { type ActionState } from "@/lib/wellbeing/actions";

export const inputClass = "min-h-14 w-full rounded-xl border border-border bg-background px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/30";
export const buttonClass = "inline-flex min-h-14 items-center justify-center rounded-xl bg-primary px-5 py-3 font-bold text-primary-foreground transition hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40 disabled:opacity-60";

export function ActionForm({ action, children, label, className = "" }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode; label: string; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false, message: "" });
  return <form action={formAction} className={`flex flex-col gap-4 ${className}`}>
    {children}
    <button className={buttonClass} disabled={pending}>{pending ? "Saving…" : label}</button>
    <p role="status" aria-live="polite" className={state.ok ? "text-role-care" : "text-destructive"}>{state.message}</p>
  </form>;
}

export function LiveNotifications({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const db = createClient();
    const channel = db.channel(`wellbeing-inbox-${userId}`).on("postgres_changes", {
      event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}`,
    }, () => router.refresh()).subscribe();
    // Polling covers a temporarily disconnected realtime subscription.
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
    return () => { window.clearInterval(timer); void db.removeChannel(channel); };
  }, [router, userId]);
  return null;
}
