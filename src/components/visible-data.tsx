import { createClient } from "@/lib/supabase/server";

// Demo check: what this signed-in user can read through RLS.
// Each role should see a different slice of the same seeded story.
export async function VisibleData() {
  const supabase = await createClient();
  const [{ data: claims }, patients, links, people] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.from("patients").select("id, nickname").order("nickname"),
    supabase.from("patient_links").select("id, patient_id, user_id, relationship"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);
  const me = claims?.claims.sub;

  const patientNames = (patients.data ?? []).map((p) => p.nickname);
  const others = (people.data ?? []).filter((p) => p.id !== me);
  const relationshipOf = (userId: string) => links.data?.find((l) => l.user_id === userId)?.relationship;

  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1">
        <dt className="font-bold">Patients</dt>
        <dd className="text-muted-foreground">{patientNames.length ? patientNames.join(", ") : "None yet"}</dd>
      </div>
      <div className="flex flex-col gap-1">
        <dt className="font-bold">People</dt>
        <dd className="text-muted-foreground">
          {others.length
            ? others
                .map((p) => {
                  const relationship = relationshipOf(p.id);
                  return relationship ? `${p.display_name} (${relationship})` : p.display_name;
                })
                .join(", ")
            : "None yet"}
        </dd>
      </div>
    </dl>
  );
}
