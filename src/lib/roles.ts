import { HeartHandshake, Smile, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";

export type RoleKey = "patient" | "family" | "care" | "volunteer";

export type RoleInfo = {
  key: RoleKey;
  label: string;
  href: `/${RoleKey}`;
  tagline: string;
  icon: LucideIcon;
  /** Tailwind classes using the role accent tokens from globals.css */
  accentBg: string;
  accentText: string;
  /** MVP features planned for this dashboard (see docs/SPEC.md) */
  upcoming: string[];
};

export const ROLES: RoleInfo[] = [
  {
    key: "patient",
    label: "Patient",
    href: "/patient",
    tagline: "Share how you feel and call your people close.",
    icon: Smile,
    accentBg: "bg-role-patient",
    accentText: "text-role-patient",
    upcoming: ["Daily mood check-in", "Nudges to family", "Comfort cards", "Question of the day"],
  },
  {
    key: "family",
    label: "Family & friends",
    href: "/family",
    tagline: "Know what's happening and show you're there.",
    icon: HeartHandshake,
    accentBg: "bg-role-family",
    accentText: "text-role-family",
    upcoming: ["Check-in feed", "Nudge inbox and replies", "Write comfort cards", "Question of the day"],
  },
  {
    key: "care",
    label: "Care team",
    href: "/care",
    tagline: "Follow wellbeing over time and spot who needs support.",
    icon: Stethoscope,
    accentBg: "bg-role-care",
    accentText: "text-role-care",
    upcoming: ["Patient list with mood trends", "Alerts", "Invite codes", "Thresholds and cooldowns"],
  },
  {
    key: "volunteer",
    label: "Volunteer",
    href: "/volunteer",
    tagline: "Share your story and inspire young patients.",
    icon: Sparkles,
    accentBg: "bg-role-volunteer",
    accentText: "text-role-volunteer",
    upcoming: ["Application and approval", "Bio and inspiring answers", "Moderated exchanges"],
  },
];

export function getRole(key: RoleKey): RoleInfo {
  const role = ROLES.find((r) => r.key === key);
  if (!role) throw new Error(`Unknown role: ${key}`);
  return role;
}
