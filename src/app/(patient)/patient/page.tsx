import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/role-placeholder";

export const metadata: Metadata = { title: "Patient · Closer" };

export default function PatientDashboardPage() {
  return <RolePlaceholder role="patient" />;
}
