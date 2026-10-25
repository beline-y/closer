"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { generateQuestionIdeas } from "@/lib/ai-questions";
import { allowAIRequest } from "@/lib/ai-request-limit";

export type QuestionIdeasResult = { ok: true; questions: string[] } | { ok: false; error: string };

export async function refreshQuestionIdeas(previous: string[]): Promise<QuestionIdeasResult> {
  const input = z.array(z.string().max(180)).max(3).safeParse(previous);
  if (!input.success) return { ok: false, error: "Please try generating a fresh set of ideas." };
  try {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return { ok: false, error: "Please sign in to get question ideas." };
    const { data: profile } = await db.from("profiles").select("account_type").eq("id", user.id).single();
    const { data: patient } = await db.from("patients").select("id").eq("status", "active").limit(1).maybeSingle();
    if (profile?.account_type !== "family" || !patient) return { ok: false, error: "Question ideas are for a patient's linked family and friends." };
    if (!allowAIRequest(`questions:${user.id}`)) return { ok: false, error: "Give Mistral a moment, then try again." };
    if (!process.env.MISTRAL_API_KEY) return { ok: false, error: "AI question ideas aren't configured yet. You can still write your own card." };
    return { ok: true, questions: await generateQuestionIdeas(input.data) };
  } catch {
    return { ok: false, error: "Mistral couldn't create new ideas just now. Try again, or write a question of your own." };
  }
}
