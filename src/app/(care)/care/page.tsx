import type { Metadata } from "next";
import { RolePlaceholder } from "@/components/role-placeholder";

export const metadata: Metadata = { title: "Care team · Closer" };

export default function CareDashboardPage() {
  return <RolePlaceholder role="care" />;
}
