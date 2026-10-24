import type { Metadata } from "next";
import { VolunteerEvents } from "@/components/volunteer/volunteer-events";

export const metadata: Metadata = { title: "Events · Closer" };

export default function VolunteerEventsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Hospital events</h1>
        <p className="text-lg text-muted-foreground">Get involved in person. Events are organized and supervised by the care team.</p>
      </header>
      <VolunteerEvents me="maya" />
    </>
  );
}
