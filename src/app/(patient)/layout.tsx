import type { ReactNode } from "react";
import { AppMinutes } from "@/components/patient/app-minutes";
import { RoleShell } from "@/components/role-shell";

export default function PatientLayout({ children }: { children: ReactNode }) {
  return (
    <RoleShell role="patient">
      <AppMinutes />
      {children}
    </RoleShell>
  );
}
