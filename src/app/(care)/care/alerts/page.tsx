import type { Metadata } from "next";
import { Suspense } from "react";
import { WellbeingPanel } from "@/components/wellbeing/dashboard";
import { AlertsList } from "@/components/care/alerts-list";

export const metadata: Metadata = { title: "Alerts · Closer" };

export default function CareAlertsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Alerts</h1>
        <p className="text-muted-foreground">Computed from each patient&apos;s thresholds.</p>
      </header>
      <Suspense fallback={<p role="status">Loading daily reviews…</p>}><WellbeingPanel role="care" /></Suspense>
      <AlertsList />
    </>
  );
}
