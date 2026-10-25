"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { allowAIRequest } from "@/lib/ai-request-limit";
import { EVENTS, VOLUNTEER_POOL } from "@/lib/demo-fixtures";
import { screenVolunteerMessage } from "@/lib/volunteer-screening";
import { submissionView, type VolunteerSubmission } from "@/lib/volunteer-submissions";

const inputSchema = z.object({
  id: z.uuid(), kind: z.enum(["event_application", "question_answer"]),
  contextKey: z.string().min(1).max(100), body: z.string().trim().min(1).max(1000),
}).strict();
type SubmitResult = { ok: true; submission: VolunteerSubmission } | { ok: false; error: string };

export async function submitVolunteerMessage(input: z.infer<typeof inputSchema>): Promise<SubmitResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a message of 1–1,000 characters before submitting." };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in as a volunteer." };
    const { data: profile } = await db.from("profiles").select("account_type,display_name").eq("id", user.id).single();
    if (profile?.account_type !== "volunteer") return { ok: false, error: "Only volunteers can submit these messages." };
    const { id, kind, contextKey, body } = parsed.data;
    // The catalog still uses fictional events/questions. Resolve labels here,
    // never trust a client-provided title, author, classification or recipient.
    const event = kind === "event_application" ? EVENTS.find((e) => e.id === contextKey) : undefined;
    const question = kind === "question_answer" ? VOLUNTEER_POOL.find((q) => q.id === contextKey) : undefined;
    const label = event?.title ?? question?.text;
    if (!label) return { ok: false, error: "This event or question is no longer available. Refresh and try again." };
    if (question?.forVolunteer) {
      const expected = question.forVolunteer === "maya" ? "55555555-5555-4555-8555-555555555555" : "66666666-6666-4666-8666-666666666666";
      if (user.id !== expected) return { ok: false, error: "This question was addressed to another volunteer." };
    }
    const { data: existing, error: readError } = await db.from("volunteer_submissions").select("*").eq("id", id).maybeSingle();
    if (readError) return { ok: false, error: "The message review service isn't ready. Your draft has not been submitted; please try later." };
    if (existing) {
      if (existing.volunteer_id !== user.id || existing.body !== body || existing.kind !== kind || existing.context_key !== contextKey)
        return { ok: false, error: "That submission has already been used. Please start a new message." };
      return { ok: true, submission: submissionView(existing) };
    }
    if (!allowAIRequest(`volunteer-screening:${user.id}`)) return { ok: false, error: "Please wait a moment before submitting another message." };
    const admin = createAdminClient();
    const screening = await screenVolunteerMessage(body, label);
    const { data, error } = await admin.from("volunteer_submissions").insert({
      id, volunteer_id: user.id, volunteer_name: profile.display_name,
      kind, context_key: contextKey, context_label: label, body, ...screening,
    }).select("*").single();
    // Concurrent retries cannot overwrite a message or its review decision.
    if (error?.code === "23505") {
      const { data: duplicate } = await db.from("volunteer_submissions").select("*").eq("id", id).maybeSingle();
      if (duplicate && duplicate.body === body && duplicate.kind === kind && duplicate.context_key === contextKey)
        return { ok: true, submission: submissionView(duplicate) };
    }
    if (error || !data) return { ok: false, error: "We couldn't save your message. Your draft is still here; please retry." };
    revalidatePath("/care/volunteers");
    revalidatePath("/volunteer");
    revalidatePath("/volunteer/events");
    return { ok: true, submission: submissionView(data) };
  } catch {
    return { ok: false, error: "We couldn't submit your message. Keep your draft and try again." };
  }
}

export async function reviewVolunteerMessage(id: string, decision: "approved" | "rejected") {
  if (!z.uuid().safeParse(id).success || !["approved", "rejected"].includes(decision)) return { ok: false, error: "Invalid review." };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in as care staff." };
    const { data, error } = await db.rpc("review_volunteer_submission", { p_id: id, p_decision: decision });
    if (error) return { ok: false, error: "Only care staff can review applicant messages. Please check your session." };
    if (!data) return { ok: false, error: "This message was already reviewed. Refresh for the latest decision." };
    revalidatePath("/care/volunteers");
    revalidatePath("/volunteer");
    revalidatePath("/volunteer/events");
    return { ok: true };
  } catch {
    return { ok: false, error: "The decision couldn't be saved. Please try again." };
  }
}
