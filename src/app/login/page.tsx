import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CloserIcon } from "@/components/icons/closer-icon";

export const metadata: Metadata = { title: "Sign in · Closer" };

// Used when DEMO_MODE is off. Real sign-in (email + password, patient code + PIN,
// invites, guardian consent) is tracked in the "Real auth" GitHub issue.
export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-12">
      <Card>
        <CardHeader className="items-center gap-3 text-center">
          <CloserIcon name="lock" className="size-12 text-primary" />
          <CardTitle className="text-2xl">Secure sign-in is coming soon</CardTitle>
          <CardDescription className="text-base">
            Email and password for grown-ups, and a patient code with a PIN for patients.
          </CardDescription>
        </CardHeader>
      </Card>
      <Link href="/" className="text-center font-bold text-primary underline-offset-4 hover:underline">
        Back to Closer
      </Link>
    </main>
  );
}
