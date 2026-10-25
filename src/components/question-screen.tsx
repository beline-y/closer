import { LiveRefresh } from "@/components/live-refresh";
import { QuestionFlow } from "@/components/question-flow";
import { getTodayQuestion } from "@/lib/data/daily-question";

// Server part of the question screen: today's question for the patient, unlocked live
// when the other side answers (Realtime on question_answers, same RLS as reads).
export async function QuestionScreen({ patientId, isLeo }: { patientId: string; isLeo: boolean }) {
  const question = await getTodayQuestion(patientId);
  if (!question) return <p className="text-lg text-muted-foreground">No question today. Come back tomorrow.</p>;
  return (
    <>
      <LiveRefresh channel={`question-${question.id}`} watch={[{ table: "question_answers", filter: `daily_question_id=eq.${question.id}` }]} />
      <QuestionFlow question={question} isLeo={isLeo} />
    </>
  );
}
