import type { Metadata } from "next";
import { VolunteerRequests } from "@/components/volunteer/volunteer-requests";

export const metadata: Metadata = { title: "Requests · Closer" };

export default function VolunteerRequestsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Requests</h1>
        <p className="text-lg text-muted-foreground">Visits approved by the care team.</p>
      </header>
      <VolunteerRequests me="maya" />
    </>
  );
}
