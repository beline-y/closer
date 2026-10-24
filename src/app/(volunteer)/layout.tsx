import type { ReactNode } from "react";
import { RoleShell } from "@/components/role-shell";

export default function VolunteerLayout({ children }: { children: ReactNode }) {
  return <RoleShell role="volunteer">{children}</RoleShell>;
}
