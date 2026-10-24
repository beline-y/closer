import { timingSafeEqual } from "node:crypto";
import { runDailyReviews } from "@/lib/wellbeing/daily";

export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const supplied = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const candidate = Buffer.from(supplied);
  if (!secret || candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.MISTRAL_API_KEY || !process.env.SUPABASE_SECRET_KEY) {
    return Response.json({ error: "Daily reviews are not configured" }, { status: 503 });
  }
  try {
    const result = await runDailyReviews();
    return Response.json(result, {
      status: result.failed > 0 || result.more || result.rulesOnly > 0 ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json({ error: "Daily reviews could not run" }, { status: 503 });
  }
}
