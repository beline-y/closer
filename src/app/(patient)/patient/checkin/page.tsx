import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CheckInFlow } from "@/components/patient/checkin-flow";
import { getCheckins, getMyPatient } from "@/lib/data/checkins";

export const metadata: Metadata = { title: "Check in · Closer" };

export default function PatientCheckInPage() {
  return (
    <Suspense fallback={<p className="text-xl text-muted-foreground">Getting ready…</p>}>
      <CheckIn />
    </Suspense>
  );
}

async function CheckIn() {
  const patient = await getMyPatient();
  if (!patient) redirect("/");
  const [today] = (await getCheckins(patient.id, patient.timezone, { days: 1, withPhotos: true })).filter((c) => c.daysAgo === 0);

  return (
    <>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-4xl font-extrabold">{today ? "Edit today's check-in ✏️" : "Check in 😊"}</h1>
        <Link href="/patient" className="min-h-12 content-center rounded-full px-4 font-bold text-muted-foreground hover:bg-muted">
          Not now
        </Link>
      </header>
      {today && <p className="text-lg text-muted-foreground">You can change it until midnight.</p>}
      <CheckInFlow
        patientId={patient.id}
        initial={
          today
            ? {
                mood: today.mood,
                meals: today.meals,
                mealAmount: today.mealAmount,
                mealNote: today.mealNote ?? "",
                activities: today.activities,
                activityNote: today.activityNote ?? "",
                note: today.note ?? "",
                photoUrl: today.photoUrl,
              }
            : null
        }
      />
    </>
  );
}
