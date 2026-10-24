import type { Metadata } from "next";
import { ThresholdsForm } from "@/components/care/thresholds-form";
import { DEFAULT_THRESHOLDS } from "@/lib/demo-fixtures";

export const metadata: Metadata = { title: "Settings · Closer" };

export default function CareSettingsPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Settings</h1>
        <p className="text-muted-foreground">Defaults for new patients. Each patient can have their own thresholds on their page.</p>
      </header>
      <div className="max-w-2xl">
        <ThresholdsForm title="Default alert thresholds" initial={DEFAULT_THRESHOLDS} />
      </div>
    </>
  );
}
