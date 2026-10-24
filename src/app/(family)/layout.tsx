import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export default function FamilyLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="family">{children}</RoleShell>;
}
