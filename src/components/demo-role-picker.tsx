"use client";

import { Loader2 } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { signInAsDemoRole, type DemoSignInState } from "@/app/demo-actions";
import { ROLES, type RoleInfo } from "@/lib/roles";
import { cn } from "@/lib/utils";

const initialState: DemoSignInState = { error: null };

// Four big persona cards. Each one is its own form, so the pending spinner
// shows on the card that was tapped.
export function DemoRolePicker() {
  const [state, formAction] = useActionState(signInAsDemoRole, initialState);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {ROLES.map((role) => (
          <form key={role.key} action={formAction}>
            <input type="hidden" name="role" value={role.key} />
            <RoleCard role={role} />
          </form>
        ))}
      </div>
      {state.error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-center font-bold text-destructive">
          {state.error}
        </p>
      )}
    </div>
  );
}

function RoleCard({ role }: { role: RoleInfo }) {
  const { pending } = useFormStatus();
  const Icon = role.icon;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Enter as ${role.persona.name}, ${role.label}`}
      className={cn(
        "group flex h-full w-full flex-col gap-4 rounded-3xl border-2 border-transparent bg-card p-5 text-left shadow-sm ring-1 ring-border transition",
        "hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
        "focus-visible:border-ring focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/40",
        "disabled:cursor-wait disabled:opacity-80",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold text-white", role.accentBg)}>
          <Icon className="size-4" aria-hidden />
          {role.label}
        </span>
        {pending && <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Signing in" />}
      </div>
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className={cn(
            "flex size-16 shrink-0 items-center justify-center rounded-full font-heading text-3xl font-extrabold ring-4 ring-offset-2 ring-offset-card",
            "bg-secondary transition-transform group-hover:scale-105",
            ringFor(role),
          )}
        >
          {role.persona.name.charAt(0)}
        </span>
        <div className="flex flex-col">
          <span className="font-heading text-2xl font-extrabold">{role.persona.name}</span>
          <span className="text-muted-foreground">{role.persona.detail}</span>
        </div>
      </div>
      <p className="text-base">{role.persona.line}</p>
      <span className={cn("mt-auto font-bold", role.accentText)}>Enter as {role.persona.name}</span>
    </button>
  );
}

function ringFor(role: RoleInfo) {
  return {
    patient: "ring-role-patient",
    family: "ring-role-family",
    care: "ring-role-care",
    volunteer: "ring-role-volunteer",
  }[role.key];
}
