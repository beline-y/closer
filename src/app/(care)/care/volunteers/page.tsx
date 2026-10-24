import type { Metadata } from "next";
import { VolunteersAdmin } from "@/components/care/volunteers-admin";

export const metadata: Metadata = { title: "Volunteers · Closer" };

export default function CareVolunteersPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Volunteers</h1>
        <p className="text-muted-foreground">You decide what volunteers can see. They never see a patient&apos;s name, age, photo or unit.</p>
      </header>
      <VolunteersAdmin />
    </>
  );
}
