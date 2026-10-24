import { HeartHandshake, Smile, Sparkles, Stethoscope, type LucideIcon } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

export type RoleKey = "patient" | "family" | "care" | "volunteer";
export type AccountType = Database["public"]["Enums"]["account_type"];

/** The fictional demo persona shown for each role (matches supabase/seed.sql). */
export type Persona = {
  name: string;
  detail: string;
  avatar: string;
  line: string;
};

export type RoleInfo = {
  key: RoleKey;
  accountType: AccountType;
  label: string;
  href: `/${RoleKey}`;
  tagline: string;
  icon: LucideIcon;
  persona: Persona;
  /** Tailwind classes using the role accent tokens from globals.css */
  accentBg: string;
  accentText: string;
  /** MVP features planned for this dashboard (see docs/SPEC.md) */
  upcoming: string[];
};

export const ROLES: RoleInfo[] = [
  {
    key: "patient",
    accountType: "patient",
    label: "Patient",
    href: "/patient",
    tagline: "Share how you feel and call your people close.",
    icon: Smile,
    persona: {
      name: "Léo",
      detail: "9 years old",
      avatar: "🦖",
      line: "Shares a mood, sends one-tap nudges, opens comfort cards.",
    },
    accentBg: "bg-role-patient",
    accentText: "text-role-patient",
    upcoming: ["Daily mood check-in", "Nudges to family", "Comfort cards", "Question of the day"],
  },
  {
    key: "family",
    accountType: "family",
    label: "Family & friends",
    href: "/family",
    tagline: "Know what's happening and show you're there.",
    icon: HeartHandshake,
    persona: {
      name: "Camille",
      detail: "Léo's mom",
      avatar: "🌻",
      line: "Answers nudges, writes comfort cards, follows Léo's day.",
    },
    accentBg: "bg-role-family",
    accentText: "text-role-family",
    upcoming: ["Check-in feed", "Nudge inbox and replies", "Write comfort cards", "Question of the day"],
  },
  {
    key: "care",
    accountType: "care_team",
    label: "Care team",
    href: "/care",
    tagline: "Follow wellbeing over time and spot who needs support.",
    icon: Stethoscope,
    persona: {
      name: "Nurse Inès",
      detail: "Care team for Léo and Maya",
      avatar: "🩺",
      line: "Follows mood trends and alerts across patients.",
    },
    accentBg: "bg-role-care",
    accentText: "text-role-care",
    upcoming: ["Patient list with mood trends", "Alerts", "Invite codes", "Thresholds and cooldowns"],
  },
  {
    key: "volunteer",
    accountType: "volunteer",
    label: "Volunteer",
    href: "/volunteer",
    tagline: "Share your story and inspire young patients.",
    icon: Sparkles,
    persona: {
      name: "Jordan",
      detail: "Approved volunteer",
      avatar: "🚀",
      line: "Shares an inspiring story and answers patients' questions.",
    },
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

export function isRoleKey(value: unknown): value is RoleKey {
  return ROLES.some((r) => r.key === value);
}

export function roleForAccountType(accountType: unknown): RoleInfo | undefined {
  return ROLES.find((r) => r.accountType === accountType);
}
