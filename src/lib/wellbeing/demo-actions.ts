"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/demo-mode";
import { allowAIRequest } from "@/lib/ai-request-limit";
import { ACTIVITIES } from "@/lib/checkin";
import { connectionMessages, localDate, sharedCheckin, shiftDate } from "./core";
import { analyseWithMistral } from "./mistral";
import { demoInvitationRole } from "./demo-access";

export type InvitationPreview = {
  audience: "patient" | "family"; body: string; checkinDate: string; source: string;
};
export type InvitationPreviewResult = { ok: true; preview: InvitationPreview } | { ok: false; error: string };

export async function previewDemoInvitation(patientId: string): Promise<InvitationPreviewResult> {
  if (!isDemoMode()) return { ok: false, error: "Notification previews are available only in demo mode." };
  if (!z.string().uuid().safeParse(patientId).success) return { ok: false, error: "That demo isn't available." };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in first." };
    const [{ data: profile }, { data: patient }] = await Promise.all([
      db.from("profiles").select("account_type").eq("id", user.id).single(),
      db.from("patients").select("id,nickname,user_id,timezone").eq("id", patientId).eq("status", "active").maybeSingle(),
    ]);
    const role = profile && demoInvitationRole(user.id, patientId, profile.account_type);
    if (!patient || !role) return { ok: false, error: "This preview is only for the fictional patient and their demo guardians." };
    if (role === "patient" && patient.user_id !== user.id) return { ok: false, error: "That demo isn't available." };
    if (role === "family") {
      const { data: guardian } = await db.from("patient_links").select("id").eq("patient_id", patientId)
        .eq("user_id", user.id).eq("status", "active").eq("role", "family").eq("is_guardian", true).maybeSingle();
      if (!guardian) return { ok: false, error: "This preview is for a currently linked demo guardian." };
    }
    const today = localDate(new Date(), patient.timezone);
    const { data: checkin, error } = await db.from("mood_checkins")
      .select("id,local_date,mood,activities,activity_note,note").eq("patient_id", patientId)
      .gte("local_date", shiftDate(today, -6)).lte("local_date", today)
      .order("local_date", { ascending: false }).limit(1).maybeSingle();
    if (error) return { ok: false, error: "Couldn't read the shared check-in. Please try again." };
    if (!checkin) return { ok: false, error: role === "patient" ? "Share a check-in first, then come back to try your invitation." : "Ask Leo to share a check-in first, then try the preview." };
    if (!allowAIRequest(`invitation:${user.id}`)) return { ok: false, error: "Give Mistral a moment, then try again." };
    const { review } = await analyseWithMistral({
      forDate: checkin.local_date, monitoringSince: checkin.local_date, checkins: [sharedCheckin(checkin)],
      lowMoodThreshold: 2, lowMoodStreak: 3, noCheckinDays: 2,
    }, null);
    // Keep sensitive care observations server-side. Guardian previews follow the same withholding rule.
    if (role === "family" && review.safeguarding_concern) return { ok: false, error: "A demo invitation isn't available for this check-in." };
    const messages = connectionMessages(patient.nickname, review, checkin.local_date, today);
    return { ok: true, preview: {
      audience: role, body: role === "patient" ? messages.child : messages.parent, checkinDate: checkin.local_date,
      source: checkin.activities.map((a) => ACTIVITIES.find((item) => item.value === a)?.label).filter(Boolean).join(" · ") || "Shared mood check-in",
    } };
  } catch { return { ok: false, error: "Mistral couldn't make this preview just now. Please try again." }; }
}
