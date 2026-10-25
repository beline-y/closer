"use client";

import { Brush, ClipboardList } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The patient page's sections. The care sidebar already has its 5 tabs, so these live in the page.
export function PatientTabs({ patientId }: { patientId: string }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/care/patients/${patientId}`, label: "Overview", icon: ClipboardList },
    { href: `/care/patients/${patientId}/drawings`, label: "Drawings", icon: Brush },
  ];
  return (
    <nav aria-label="Patient sections" className="flex gap-1 border-b">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 items-center gap-2 border-b-2 px-4 font-bold transition",
              active ? "border-role-care-ink text-role-care-ink" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <t.icon className="size-4" aria-hidden />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
