import "server-only";
import { generateQuestionIdeas } from "@/lib/ai-questions";
import { allowAIRequest } from "@/lib/ai-request-limit";
import { maskNames } from "@/lib/mask";
import { createClient } from "@/lib/supabase/server";

// Question ideas for a family member:
// 1. curated questions they haven't seen yet (never repeated within the family)
// 2. when those run out: Mistral, only with the guardian's AI consent, fed with nothing but
//    an age range and masked interests; the result is stored in the pool and reused
// 3. otherwise (no consent, no key, Mistral down): the oldest curated questions again
// The selection, consent and storage rules live in the database (next_question_ideas,
// add_generated_questions), so they apply whoever calls them.

export type QuestionIdea = { text: string; source: "curated" | "mistral"; reused: boolean };

const WANTED = 3;

export async function getQuestionIdeas(): Promise<{ ok: true; ideas: QuestionIdea[] } | { ok: false; error: string }> {
  const db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return { ok: false, error: "Please sign in to get question ideas." };
  const { data: patient } = await db.from("patients").select("id, nickname").eq("status", "active").limit(1).maybeSingle();
  if (!patient) return { ok: false, error: "Question ideas are for a patient's linked family and friends." };

  const next = async (count: number, reuse: boolean) => {
    const { data, error } = await db.rpc("next_question_ideas", { p_patient_id: patient.id, p_count: count, p_reuse: reuse });
    if (error) throw error;
    return data ?? [];
  };

  try {
    const fresh = await next(WANTED, false);
    const ideas: QuestionIdea[] = fresh.map((r) => ({ text: r.text, source: r.source as QuestionIdea["source"], reused: false }));

    if (ideas.length < WANTED && process.env.MISTRAL_API_KEY && allowAIRequest(`questions:${userId}`)) {
      // Consent probe: storing zero questions succeeds only with the guardian's AI consent.
      const consent = await db.rpc("add_generated_questions", { p_patient_id: patient.id, p_questions: [] });
      if (!consent.error) {
        const [{ data: p }, { data: people }, { data: seen }] = await Promise.all([
          db.from("patients").select("birth_year, interests").eq("id", patient.id).single(),
          db.from("profiles").select("display_name"),
          db.from("question_suggestions").select("question_bank(text)").eq("patient_id", patient.id).order("suggested_at", { ascending: false }).limit(20),
        ]);
        const names = [patient.nickname, ...(people ?? []).map((x) => x.display_name)];
        const interests = (p?.interests ?? [])
          .map((i) => maskNames(i, names))
          .filter((i) => !/\[name\]|@|\d{3,}/.test(i))
          .slice(0, 6);
        try {
          const generated = await generateQuestionIdeas(
            (seen ?? []).flatMap((s) => (s.question_bank?.text ? [s.question_bank.text] : [])).slice(0, 3),
            { ageRange: ageRange(p?.birth_year ?? null), interests },
          );
          await db.rpc("add_generated_questions", { p_patient_id: patient.id, p_questions: generated.map((q) => maskNames(q, names)) });
          for (const r of await next(WANTED - ideas.length, false)) ideas.push({ text: r.text, source: r.source as QuestionIdea["source"], reused: false });
        } catch {
          // Mistral failed: fall through to the curated fallback below.
        }
      }
    }

    if (ideas.length < WANTED) {
      for (const r of await next(WANTED - ideas.length, true)) {
        if (!ideas.some((i) => i.text === r.text)) ideas.push({ text: r.text, source: r.source as QuestionIdea["source"], reused: r.reused });
      }
    }
    // Keep the privacy mask before provider/storage boundaries; use natural
    // anonymous wording in the suggestions and editable drafts people see.
    return { ok: true, ideas: ideas.map((idea) => ({ ...idea, text: idea.text.replace(/\[name\]/gi, "someone") })) };
  } catch {
    return { ok: false, error: "Question ideas couldn't load. Try again, or write a question of your own." };
  }
}

function ageRange(birthYear: number | null): string {
  if (!birthYear) return "7–12";
  const age = new Date().getFullYear() - birthYear;
  return age < 7 ? "4–6" : age < 10 ? "7–9" : age < 13 ? "10–12" : age < 18 ? "13–17" : "adult";
}
