// Placeholder data for screens whose feature isn't built yet. Same cast as the seed.
// Each feature branch replaces its slice with a real table + RLS + seed, then deletes it here.
// Times are relative ("daysAgo") so the demo always looks recent.
import type { CastId } from "@/lib/cast";
import { PATIENT_IDS } from "@/lib/cast";
import type { Thresholds } from "@/lib/nudges";

// ---------------------------------------------------------------------------
// Care team dashboard
// ---------------------------------------------------------------------------
export type AlertKind = "low_mood_streak" | "no_checkin" | "no_family_contact";

export const ALERT_LABELS: Record<AlertKind, string> = {
  low_mood_streak: "Low mood 3 days in a row",
  no_checkin: "No check-in for 2 days",
  no_family_contact: "No family contact for 2 days",
};

export type CareMetrics = {
  minutesInAppToday: number;
  familyContactToday: boolean;
  /** Family interactions per day, oldest first, 14 days */
  interactions: number[];
};

export const CARE_METRICS: Record<string, CareMetrics> = {
  [PATIENT_IDS.leo]: { minutesInAppToday: 42, familyContactToday: true, interactions: [4, 6, 3, 5, 7, 4, 2, 5, 6, 8, 5, 4, 7, 6] },
  [PATIENT_IDS.ava]: { minutesInAppToday: 8, familyContactToday: false, interactions: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
  [PATIENT_IDS.lucas]: { minutesInAppToday: 0, familyContactToday: false, interactions: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
};

export type CareAlert = { id: string; patientId: string; kind: AlertKind; daysAgo: number; detail: string };

export const CARE_ALERTS: CareAlert[] = [
  { id: "al-1", patientId: PATIENT_IDS.ava, kind: "low_mood_streak", daysAgo: 0, detail: "Moods 2, 2, 1 since Tuesday" },
  { id: "al-2", patientId: PATIENT_IDS.ava, kind: "no_family_contact", daysAgo: 0, detail: "No family linked yet" },
  { id: "al-3", patientId: PATIENT_IDS.lucas, kind: "no_checkin", daysAgo: 0, detail: "Last check-in 2 days ago" },
  { id: "al-4", patientId: PATIENT_IDS.lucas, kind: "no_family_contact", daysAgo: 1, detail: "No family linked yet" },
];

/** Defaults for new patients (the Settings page). Per-patient values live in patient_settings. */
export const DEFAULT_THRESHOLDS: Thresholds = {
  lowMoodThreshold: 2,
  lowMoodStreak: 3,
  noCheckinDays: 2,
  noFamilyContactDays: 2,
  nudgeCooldownMinutes: 10,
};

// ---------------------------------------------------------------------------
export type ComfortCard = {
  id: string;
  from: CastId;
  color: "sun" | "coral" | "sky" | "lilac";
  body: string;
  sealed: boolean;
  openedDaysAgo?: number;
};

export const COMFORT_CARDS: ComfortCard[] = [
  { id: "cc-1", from: "emma", color: "coral", sealed: true, body: "My brave little explorer, I'm counting the sleeps until we go to the aquarium together. I love you to the moon and back. Mom" },
  { id: "cc-2", from: "noah", color: "sky", sealed: true, body: "Hi Leo! The whole class made you a giant dinosaur poster. Mrs. Lee says we can bring it soon. Get better fast! Noah" },
  { id: "cc-3", from: "james", color: "sun", sealed: false, openedDaysAgo: 2, body: "Hey champ, I'm learning the guitar song you like. Concert in your room on Saturday! Dad" },
  { id: "cc-4", from: "emma", color: "lilac", sealed: false, openedDaysAgo: 5, body: "Remember: you are stronger than you think, and you're never alone. Mom" },
];

// ---------------------------------------------------------------------------
// Question of the day (care team never sees answers)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Memories (patient + circle only)
// ---------------------------------------------------------------------------
export const MEMORY_TAGS = ["holiday", "birthday", "pet", "school", "family", "friends", "other"] as const;
export type MemoryTag = (typeof MEMORY_TAGS)[number];

export type Memory = {
  id: string;
  by: CastId;
  caption: string;
  takenOn: string;
  tag: MemoryTag;
  /** Placeholder "photo": emoji on a gradient until uploads exist */
  emoji: string;
  gradient: string;
  photoUrl?: string;
  sharedDaysAgo: number;
  reactions: { emoji: string; by: CastId[] }[];
  comments: { by: CastId; body: string }[];
};

export const MEMORIES: Memory[] = [
  {
    id: "m-1", by: "emma", caption: "Our day at the aquarium. You wouldn't leave the shark tunnel!", takenOn: "Aug 14, 2026", tag: "holiday",
    emoji: "🦈", gradient: "from-sky-300 to-indigo-400", sharedDaysAgo: 0,
    reactions: [{ emoji: "❤️", by: ["james", "noah"] }, { emoji: "😂", by: ["james"] }],
    comments: [{ by: "james", body: "Best day of the summer!" }],
  },
  {
    id: "m-2", by: "james", caption: "Biscuit waiting for you by the door, every single day.", takenOn: "Oct 20, 2026", tag: "pet",
    emoji: "🐶", gradient: "from-amber-200 to-orange-300", sharedDaysAgo: 1,
    reactions: [{ emoji: "🥹", by: ["emma"] }],
    comments: [{ by: "leo", body: "Biscuit!!! 🐶" }],
  },
  {
    id: "m-3", by: "noah", caption: "Soccer team photo, we saved your spot 🥅", takenOn: "Sep 30, 2026", tag: "school",
    emoji: "⚽", gradient: "from-lime-200 to-emerald-300", sharedDaysAgo: 3,
    reactions: [{ emoji: "⭐", by: ["emma", "james"] }],
    comments: [],
  },
  {
    id: "m-4", by: "emma", caption: "Your 9th birthday: the dinosaur cake!", takenOn: "Mar 2, 2026", tag: "birthday",
    emoji: "🎂", gradient: "from-pink-200 to-rose-300", sharedDaysAgo: 6,
    reactions: [{ emoji: "❤️", by: ["james"] }],
    comments: [{ by: "emma", body: "You blew out all 9 candles in one go." }],
  },
];

// ---------------------------------------------------------------------------
// Patient: private journal
// ---------------------------------------------------------------------------
export const JOURNAL_ENTRIES = [
  { daysAgo: 0, emoji: "🐋", body: "Today I drew a whale shark. They are the biggest fish in the world.", sharedWithCare: false },
  { daysAgo: 2, emoji: "🌧️", body: "I was a bit scared before the test but Sarah held my hand.", sharedWithCare: true },
];

// ---------------------------------------------------------------------------
// Volunteers. Nothing below may identify a patient: no name, age, photo, unit or link.
// ---------------------------------------------------------------------------
export type VolunteerStory = {
  castId: CastId;
  firstName: string;
  avatar: string;
  job: string;
  story: string;
  passions: string[];
  dreams: string;
  funFact: string;
  languages: string[];
};

export const VOLUNTEER_STORIES: Record<"maya" | "daniel", VolunteerStory> = {
  maya: {
    castId: "maya", firstName: "Maya", avatar: "🐬", job: "Marine biologist",
    story: "I study dolphins and coral reefs. When I was 10, I spent a long time in hospital, and a nurse brought me a book about the ocean. I never stopped reading about it.",
    passions: ["Diving", "Dolphins", "Underwater photos"], dreams: "To discover a new species of coral.",
    funFact: "A dolphin once stole my snorkel!", languages: ["English", "Spanish"],
  },
  daniel: {
    castId: "daniel", firstName: "Daniel", avatar: "✈️", job: "Airline pilot",
    story: "I fly big planes across the ocean. As a kid I built paper planes every day and tested them from my balcony.",
    passions: ["Flying", "Astronomy", "Paper planes"], dreams: "To fly over the North Pole and see the northern lights.",
    funFact: "I've seen a sunrise and a sunset in the same flight.", languages: ["English", "French"],
  },
};

/** Inspiring questions (AI-generated later) */
export const INSPIRING_QUESTIONS = [
  "What did you want to be when you were a kid?",
  "What is the bravest thing you ever did?",
  "What do you love most about your job?",
  "What is a dream you still have?",
];

export type PoolQuestion = { id: string; text: string; source: "patient" | "bank"; forVolunteer?: "maya" | "daniel"; daysAgo: number };

/** The anonymous pool volunteers see: no patient id, care-approved, filtered text */
export const VOLUNTEER_POOL: PoolQuestion[] = [
  { id: "q-1", text: "Do dolphins sleep? How?", source: "patient", forVolunteer: "maya", daysAgo: 0 },
  { id: "q-2", text: "How did you become a pilot?", source: "patient", forVolunteer: "daniel", daysAgo: 1 },
  { id: "q-3", text: "What is the biggest animal you've ever seen underwater?", source: "patient", daysAgo: 2 },
  ...INSPIRING_QUESTIONS.map((text, i) => ({ id: `b-${i}`, text, source: "bank" as const, daysAgo: 3 })),
];

/** Volunteer answers to the question of the day (shown to patients after they answer) */
export const VOLUNTEER_ANSWERS: Record<string, { volunteer: "maya" | "daniel"; body: string }[]> = {
  "What is the bravest thing you ever did?": [
    { volunteer: "maya", body: "My first night dive! It was pitch dark, but then the plankton started glowing all around me like underwater stars." },
    { volunteer: "daniel", body: "Landing a plane in a big storm, with 200 people counting on me. I breathed slowly and followed my training." },
  ],
};

/** Care-approved, masked patient answers. No patient id, ever. */
export const SHARED_ANSWERS = [
  { id: "sa-1", question: "What is the bravest thing you ever did?", body: "When I had my first test here I was scared but I squeezed [name]'s hand and counted to ten.", daysAgo: 1 },
  { id: "sa-2", question: "What did you want to be when you were a kid?", body: "I want to be a scientist who swims with whale sharks.", daysAgo: 4 },
];

export type HospitalEvent = {
  id: string;
  title: string;
  emoji: string;
  location: string;
  when: string;
  description: string;
  capacity: number;
  signups: CastId[];
};

export const EVENTS: HospitalEvent[] = [
  { id: "ev-1", title: "Board game afternoon", emoji: "🎲", location: "Pediatrics playroom", when: "Saturday, 2:00 PM", description: "Classic board games with the kids who feel up to it. Games are provided.", capacity: 6, signups: ["daniel"] },
  { id: "ev-2", title: "Drawing workshop", emoji: "🎨", location: "Art room, 2nd floor", when: "Wednesday, 4:00 PM", description: "Help kids draw their dream job. Bring your best stories!", capacity: 4, signups: ["maya"] },
  { id: "ev-3", title: "Career day", emoji: "🧑‍🚀", location: "Main hall", when: "Friday, Nov 6, 10:00 AM", description: "Volunteers share what their job is like, with photos and props. 10 minutes each.", capacity: 10, signups: ["maya", "daniel"] },
];

export type ContactRequestStatus = "pending_care" | "pending_guardian" | "sent_to_volunteer" | "accepted" | "declined";

export const CONTACT_REQUEST_LABELS: Record<ContactRequestStatus, string> = {
  pending_care: "Waiting for the care team",
  pending_guardian: "Waiting for the guardian",
  sent_to_volunteer: "Waiting for the volunteer",
  accepted: "Accepted",
  declined: "Declined",
};

/** Care team view (knows the patient) */
export const CONTACT_REQUESTS: { id: string; patientId: string; volunteer: "maya" | "daniel"; status: ContactRequestStatus; daysAgo: number; reason: string }[] = [
  { id: "cr-3", patientId: PATIENT_IDS.ava, volunteer: "daniel", status: "pending_care", daysAgo: 0, reason: "Asked how pilots stay calm" },
  { id: "cr-1", patientId: PATIENT_IDS.leo, volunteer: "maya", status: "pending_guardian", daysAgo: 0, reason: "Loves the ocean, asked about dolphins" },
  { id: "cr-2", patientId: PATIENT_IDS.leo, volunteer: "daniel", status: "accepted", daysAgo: 6, reason: "Wants to know how planes fly" },
];

/** Volunteer view: approved requests only, with what the care team chose to share */
export const VOLUNTEER_REQUESTS: Record<"maya" | "daniel", { id: string; status: ContactRequestStatus; sharedNote: string; plan: string }[]> = {
  maya: [
    { id: "vr-1", status: "sent_to_volunteer", sharedNote: "A young explorer who loves drawing would love to see real coral reef photos.", plan: "Supervised visit, Pediatrics playroom. The care team sets the date after you accept." },
    { id: "vr-3", status: "accepted", sharedNote: "A young explorer wants to know what marine biologists do all day.", plan: "Supervised visit on Tuesday, 4:00 PM, Pediatrics playroom." },
  ],
  daniel: [
    { id: "vr-2", status: "accepted", sharedNote: "A young explorer wants to know how planes stay in the sky.", plan: "Supervised visit on Thursday, 3:00 PM, Pediatrics playroom." },
  ],
};


