import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export default function CareLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="care">{children}</RoleShell>;
}
