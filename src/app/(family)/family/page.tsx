import type { Metadata } from "next";
import { Suspense } from "react";
import { WellbeingPanel } from "@/components/wellbeing/dashboard";
import { FamilyFeed } from "@/components/family/family-feed";
import { QuickActions } from "@/components/family/quick-actions";
import { LiveRefresh } from "@/components/live-refresh";
import { getMyPendingChallenges, getResults } from "@/lib/data/activities";
import { getCheckinDates, getCheckins } from "@/lib/data/checkins";
import { daysBetween, todayIn } from "@/lib/dates";
import { milestoneDays } from "@/lib/streak";
import { getVisiblePatients } from "@/lib/data/circle";
import { getMyNudges } from "@/lib/data/nudges";
import { getMyCards } from "@/lib/data/cards";
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
      <Suspense fallback={null}><WellbeingPanel role="family" /></Suspense>
    </>
  );
}

// Leo's check-ins of the last week, with photos and reactions (RLS: family only), live.
async function Feed() {
  const supabase = await createClient();
  const [{ data: claims }, patients] = await Promise.all([supabase.auth.getClaims(), getVisiblePatients()]);
  const leo = patients[0];
  const me = claims?.claims.sub ?? "";
  const [checkins, nudges, results, challenges, dates, myCards] = leo
    ? await Promise.all([
        getCheckins(leo.id, leo.timezone, { days: 7, withPhotos: true, withReactions: true }),
        getMyNudges(me, leo.timezone),
        getResults(leo.id, leo.timezone, { days: 7, sharedOnly: true }),
        getMyPendingChallenges(),
        getCheckinDates(leo.id),
        getMyCards(me, leo.id, leo.timezone),
      ])
    : [[], [], [], [], [], []];
  const openedCards = myCards.filter((c) => c.openedDaysAgo !== null && c.openedDaysAgo < 7);
  const today = leo ? todayIn(leo.timezone) : "";
  const milestones = milestoneDays(dates)
    .map((m) => ({ daysAgo: daysBetween(today, m.date), milestone: m.milestone }))
    .filter((m) => m.daysAgo < 7);
  return (
    <>
      {leo && (
        <LiveRefresh
          channel={`family-feed-${leo.id}`}
          watch={[
            { table: "mood_checkins", filter: `patient_id=eq.${leo.id}` },
            { table: "checkin_photos", filter: `patient_id=eq.${leo.id}` },
            { table: "checkin_reactions" },
            { table: "nudge_recipients", filter: `user_id=eq.${me}` },
            { table: "comfort_cards", filter: `author_id=eq.${me}` },
            { table: "activity_sessions", filter: `patient_id=eq.${leo.id}` },
            { table: "activity_reactions" },
            { table: "activity_comments" },
            { table: "challenge_entries" },
          ]}
        />
      )}
      <FamilyFeed checkins={checkins} nudges={nudges} results={results} challenges={challenges} milestones={milestones} openedCards={openedCards} me={me} />
    </>
  );
}
