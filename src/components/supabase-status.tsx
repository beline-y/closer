import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

type Status = "connected" | "unreachable" | "not-configured";

async function checkSupabase(): Promise<Status> {
  const env = getSupabasePublicEnv();
  if (!env) return "not-configured";
  try {
    const res = await fetch(`${env.url}/auth/v1/health`, {
      headers: { apikey: env.publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(3000),
    });
    return res.ok ? "connected" : "unreachable";
  } catch {
    return "unreachable";
  }
}

const LABELS: Record<Status, string> = {
  connected: "Supabase connected",
  unreachable: "Supabase unreachable",
  "not-configured": "Supabase not configured",
};

// Lets teammates check at a glance that a preview has the right env vars.
export async function SupabaseStatus() {
  await connection(); // check at request time, not at build time
  const status = await checkSupabase();
  return (
    <Badge variant={status === "connected" ? "secondary" : "destructive"}>
      <span aria-hidden>{status === "connected" ? "🟢" : "🔴"}</span> {LABELS[status]}
    </Badge>
  );
}
