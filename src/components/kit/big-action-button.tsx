import type { ComponentProps, ReactNode } from "react";
import { HUES, type Hue } from "@/lib/hues";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"button"> & {
  emoji: string;
  label: string;
  hint?: ReactNode;
  /** 0..1 of the cooldown left; draws a ring around the emoji */
  cooldown?: number;
  tone?: "patient" | "family" | "care" | "volunteer";
  /** Patient side: a hue of its own instead of the role tone, with a chunky pressable edge */
  hue?: Hue;
};

const TONE = {
  patient: "bg-role-patient-soft text-role-patient-ink",
  family: "bg-role-family-soft text-role-family-ink",
  care: "bg-role-care-soft text-role-care-ink",
  volunteer: "bg-role-volunteer-soft text-role-volunteer-ink",
};

// Huge tap target with an icon and a word. Used for nudges and main actions.
export function BigActionButton({ emoji, label, hint, cooldown = 0, tone = "patient", hue, className, disabled, ...props }: Props) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "group flex min-h-24 w-full items-center gap-4 rounded-3xl p-4 text-left font-heading text-xl font-extrabold disabled:cursor-not-allowed disabled:opacity-60",
        hue
          ? cn(HUES[hue], "pressable bg-hue-soft text-foreground")
          : cn(TONE[tone], "shadow-sm ring-1 ring-black/5 transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97] disabled:hover:translate-y-0"),
        className,
      )}
      {...props}
    >
      <span className="relative flex size-16 shrink-0 items-center justify-center rounded-full bg-card text-4xl shadow-sm">
        <span aria-hidden className="transition-transform group-active:scale-90">
          {emoji}
        </span>
        {cooldown > 0 && (
          <svg aria-hidden viewBox="0 0 64 64" className={cn("absolute inset-0 -rotate-90", hue && "text-hue-ink")}>
            <circle cx="32" cy="32" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
            <circle
              cx="32"
              cy="32"
              r={r}
              fill="none"
              stroke="currentColor"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={circumference * (1 - cooldown)}
            />
          </svg>
        )}
      </span>
      <span className="flex flex-col gap-0.5">
        <span>{label}</span>
        {hint && <span className="font-sans text-sm font-normal text-foreground/75">{hint}</span>}
      </span>
    </button>
  );
}
