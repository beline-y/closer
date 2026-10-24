import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/role-placeholder";

export const metadata: Metadata = { title: "Volunteer · Closer" };

export default function VolunteerDashboardPage() {
  return <RolePlaceholder role="volunteer" />;
}
