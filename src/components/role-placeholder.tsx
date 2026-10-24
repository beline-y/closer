import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { VisibleData } from "@/components/visible-data";
import { getRole, type RoleKey } from "@/lib/roles";

// Temporary dashboard body until the role's features are built.
export function RolePlaceholder({ role }: { role: RoleKey }) {
  const info = getRole(role);
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold">Hi {info.persona.name} 👋</h1>
        <p className="text-lg text-muted-foreground">{info.tagline}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>What you can see</CardTitle>
          <CardDescription>Read live from Supabase. Row Level Security decides what each role sees.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
            <VisibleData />
          </Suspense>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Coming soon</CardTitle>
          <CardDescription>Planned for the MVP:</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {info.upcoming.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  );
}
