import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export default function PatientLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="patient">{children}</RoleShell>;
}
