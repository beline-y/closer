import type { Metadata } from "next";
import { FamilyFeed } from "@/components/family/family-feed";
import { QuickActions } from "@/components/family/quick-actions";

export const metadata: Metadata = { title: "Feed · Closer" };

export default function FamilyFeedPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Hi Emma 👋</h1>
        <p className="text-lg text-muted-foreground">Here&apos;s Leo&apos;s day so far.</p>
      </header>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <QuickActions className="lg:sticky lg:top-24 lg:order-2 lg:self-start" />
        <div className="min-w-0 lg:order-1">
          <FamilyFeed />
        </div>
      </div>
    </>
  );
}
