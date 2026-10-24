import type { Metadata } from "next";
import { Suspense } from "react";
import { FamilyFeed } from "@/components/family/family-feed";
import { QuickActions } from "@/components/family/quick-actions";
import { LiveRefresh } from "@/components/live-refresh";
import { getCheckins } from "@/lib/data/checkins";
import { getVisiblePatients } from "@/lib/data/circle";
import { createClient } from "@/lib/supabase/server";

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
          <Suspense fallback={<p className="text-muted-foreground">Loading Leo&apos;s day…</p>}>
            <Feed />
          </Suspense>
        </div>
      </div>
    </>
  );
}

// Leo's check-ins of the last week, with photos and reactions (RLS: family only), live.
async function Feed() {
  const supabase = await createClient();
  const [{ data: claims }, patients] = await Promise.all([supabase.auth.getClaims(), getVisiblePatients()]);
  const leo = patients[0];
  const checkins = leo ? await getCheckins(leo.id, leo.timezone, { days: 7, withPhotos: true, withReactions: true }) : [];
  return (
    <>
      {leo && (
        <LiveRefresh
          channel={`family-feed-${leo.id}`}
          watch={[
            { table: "mood_checkins", filter: `patient_id=eq.${leo.id}` },
            { table: "checkin_photos", filter: `patient_id=eq.${leo.id}` },
            { table: "checkin_reactions" },
          ]}
        />
      )}
      <FamilyFeed checkins={checkins} me={claims?.claims.sub ?? ""} />
    </>
  );
}
