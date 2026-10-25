import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { connectionMessages, localDate, ruleReview, sharedCheckin, shiftDate, type ReviewContext } from "./core";
import { analyseWithMistral, PROMPT_VERSION } from "./mistral";

// Bounded work per invocation; safe to retry the endpoint. No patient text in logs.
export async function runDailyReviews(now = new Date()) {
  const db = createAdminClient();
  const counts = { completed: 0, rulesOnly: 0, skipped: 0, failed: 0 };
  let cursor = "00000000-0000-0000-0000-000000000000";
  const deadline = Date.now() + 240_000;
  let hasMore = false;
  do {
    const { data: patients, error } = await db.from("patients")
      .select("id,nickname,user_id,birth_year,timezone").eq("status", "active")
      .gt("id", cursor).order("id").limit(25);
    if (error) throw new Error("Could not list patients");
    hasMore = patients.length === 25;
    for (const patient of patients) {
      if (Date.now() > deadline) return { ...counts, more: true };
      cursor = patient.id;
      try {
        const today = localDate(now, patient.timezone);
        const forDate = shiftDate(today, -1);
        const { data: claims, error: claimError } = await db.rpc("claim_daily_review", {
          p_patient_id: patient.id, p_for_date: forDate,
        });
        if (claimError) throw new Error("Could not claim review");
        const claim = claims?.[0];
        if (!claim) { counts.skipped++; continue; }
        const [checkins, settings, permission] = await Promise.all([
          db.from("mood_checkins").select("id,local_date,mood,activities,activity_note,note")
            .eq("patient_id", patient.id).gte("local_date", shiftDate(forDate, -6))
            .lte("local_date", forDate).order("local_date"),
          db.from("wellbeing_settings").select("low_mood_threshold,low_mood_streak,no_checkin_days")
            .eq("patient_id", patient.id).maybeSingle(),
          db.from("wellbeing_permissions").select("updated_at").eq("patient_id", patient.id).single(),
        ]);
        if (checkins.error || settings.error || permission.error) throw new Error("Context unavailable");
        // Never include responses from before this consent grant.
        const monitoringSince = localDate(new Date(permission.data.updated_at), patient.timezone);
        const context: ReviewContext = {
          forDate, monitoringSince,
          checkins: checkins.data.filter((c) => c.local_date >= monitoringSince).map(sharedCheckin),
          lowMoodThreshold: settings.data?.low_mood_threshold ?? 2,
          lowMoodStreak: settings.data?.low_mood_streak ?? 3,
          noCheckinDays: settings.data?.no_checkin_days ?? 2,
        };
        // Recheck consent just before sending data to the provider. Completion
        // additionally checks the consent timestamp captured by the claim.
        const { data: current, error: consentError } = await db.rpc("can_process_wellbeing", {
          p_patient_id: patient.id, p_consent_at: permission.data.updated_at,
        });
        if (consentError || !current) {
          counts.skipped++; continue;
        }
        let review = ruleReview(context);
        let source = context.checkins.length ? "rules" : "no_data";
        let model: string | null = null;
        if (context.checkins.length > 0) {
          try {
            const result = await analyseWithMistral(context,
              patient.birth_year ? Math.max(0, Number(forDate.slice(0, 4)) - patient.birth_year) : null);
            review = result.review; model = result.model; source = "mistral";
          } catch {
            // The rules-only status is visible to care staff and retriable.
          }
        }
        const messages = connectionMessages(patient.nickname, review, forDate, today);
        const { data: saved, error: saveError } = await db.rpc("complete_daily_review", {
          p_review_id: claim.review_id, p_token: claim.token,
          p_result: { ...review, source, model, prompt_version: PROMPT_VERSION },
          p_parent_message: messages.parent, p_child_message: messages.child,
        });
        if (saveError) throw new Error("Could not complete review");
        if (!saved) counts.skipped++;
        else if (source === "rules") counts.rulesOnly++;
        else counts.completed++;
      } catch {
        counts.failed++;
      }
    }
  } while (hasMore);
  return { ...counts, more: false };
}
