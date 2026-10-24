import type { Metadata } from "next";
import { AlertsList } from "@/components/care/alerts-list";

export const metadata: Metadata = { title: "Alerts · Closer" };

export default function CareAlertsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Alerts</h1>
        <p className="text-muted-foreground">Computed from each patient&apos;s thresholds.</p>
      </header>
      <AlertsList />
    </>
  );
}
