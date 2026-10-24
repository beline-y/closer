import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/role-placeholder";

export const metadata: Metadata = { title: "Family & friends · Closer" };

export default function FamilyDashboardPage() {
  return <RolePlaceholder role="family" />;
}
