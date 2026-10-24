import type { Metadata } from "next";
import { EventsAdmin } from "@/components/care/events-admin";

export const metadata: Metadata = { title: "Events · Closer" };

export default function CareEventsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Events</h1>
        <p className="text-muted-foreground">Hospital events volunteers can join in person.</p>
      </header>
      <EventsAdmin />
    </>
  );
}
