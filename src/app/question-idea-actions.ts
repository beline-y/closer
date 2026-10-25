"use server";

import { type QuestionIdea, getQuestionIdeas } from "@/lib/question-ideas";

export type QuestionIdeasResult = { ok: true; questions: string[]; ideas: QuestionIdea[] } | { ok: false; error: string };

// Curated first, Mistral only when the curated pool is used up and the guardian consented
// (see src/lib/question-ideas.ts). The database remembers what the family already saw.
export async function refreshQuestionIdeas(): Promise<QuestionIdeasResult> {
  const result = await getQuestionIdeas();
  return result.ok ? { ok: true, questions: result.ideas.map((i) => i.text), ideas: result.ideas } : result;
}
