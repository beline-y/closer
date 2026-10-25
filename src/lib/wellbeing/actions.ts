"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string };
const success = (message: string): ActionState => ({ ok: true, message });
const failure = (message: string): ActionState => ({ ok: false, message });
const uuid = z.string().uuid();

function refreshDashboards() {
  for (const path of ["/patient", "/family", "/care"]) revalidatePath(path);
}

export async function saveConsent(_state: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("patient_id"));
  const enabled = form.get("enabled") === "true";
  if (!id.success || (enabled && form.get("agree") !== "yes")) return failure("Please read and accept the AI sharing information.");
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return failure("Please sign in first.");
    const { error } = await db.rpc("set_wellbeing_consent", { p_patient_id: id.data, p_enabled: enabled });
    if (error) return failure("Only an active guardian or the adult patient can change this setting.");
    refreshDashboards();
    return success(enabled ? "Daily reviews enabled. New shared check-ins can be reviewed from today." : "Daily reviews stopped. No new prompts will be generated.");
  } catch { return failure("Could not change consent. Please try again."); }
}

export async function saveNotificationPrefs(_state: ActionState, form: FormData): Promise<ActionState> {
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return failure("Please sign in first.");
    const { error } = await db.from("notification_prefs").upsert({ user_id: user.id, connection_enabled: form.get("connection_enabled") === "yes" });
    if (error) return failure("Could not save your preference.");
    refreshDashboards(); return success("Your preference is saved.");
  } catch { return failure("Could not save your preference."); }
}

export async function notificationFeedback(_state: ActionState, form: FormData): Promise<ActionState> {
  const values = z.object({ id: uuid, feedback: z.enum(["helpful", "not_now", "connected"]) }).safeParse(Object.fromEntries(form));
  if (!values.success) return failure("Choose a response.");
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return failure("Please sign in first.");
    const { data, error } = await db.from("notifications").update({ read_at: new Date().toISOString(), feedback: values.data.feedback })
      .eq("id", values.data.id).eq("user_id", user.id).select("id");
    if (error || !data.length) return failure("That message is no longer available.");
    refreshDashboards(); return success("Thank you. Your response is saved.");
  } catch { return failure("Could not save your response."); }
}

export async function acknowledgeReview(_state: ActionState, form: FormData): Promise<ActionState> {
  const id = uuid.safeParse(form.get("id"));
  if (!id.success) return failure("Review unavailable.");
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return failure("Please sign in first.");
    const { error } = await db.rpc("acknowledge_wellbeing_review", { p_review_id: id.data });
    if (error) return failure("Only linked care staff can acknowledge this review.");
    refreshDashboards(); return success("Acknowledged. Thank you for checking in.");
  } catch { return failure("Could not acknowledge this review."); }
}
