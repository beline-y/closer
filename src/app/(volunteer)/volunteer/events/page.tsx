import type { Metadata } from "next";
import { Suspense } from "react";
import { VolunteerEvents } from "@/components/volunteer/volunteer-events";
import { getVolunteerSubmissions } from "@/lib/data/volunteer-submissions";

export const metadata: Metadata = { title: "Events · Closer" };

export default function VolunteerEventsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Hospital events</h1>
        <p className="text-lg text-muted-foreground">Get involved in person. Events are organized and supervised by the care team.</p>
      </header>
      <Suspense fallback={<p>Loading your applications…</p>}><EventsWithMessages /></Suspense>
    </>
  );
}

async function EventsWithMessages() {
  const { submissions, error } = await getVolunteerSubmissions();
  return <>{error && <p role="alert" className="text-alert">{error}</p>}<VolunteerEvents me="maya" submissions={submissions.filter((s) => s.kind === "event_application")} /></>;
}
