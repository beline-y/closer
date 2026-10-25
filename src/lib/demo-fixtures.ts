// Placeholder data for screens whose feature isn't built yet. Same cast as the seed.
// Each feature branch replaces its slice with a real table + RLS + seed, then deletes it here.
// Times are relative ("daysAgo") so the demo always looks recent.
import type { IconName } from "@/components/icons/closer-icon";
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
  /** Placeholder "photo": the tag's icon on this gradient until uploads exist */
  gradient: string;
  photoUrl?: string;
  sharedDaysAgo: number;
  reactions: { kind: "heart" | "hug" | "strong" | "laugh" | "star"; by: CastId[] }[];
  comments: { by: CastId; body: string }[];
};

export const MEMORIES: Memory[] = [
  {
    id: "m-1", by: "emma", caption: "Our day at the aquarium. You wouldn't leave the shark tunnel!", takenOn: "Aug 14, 2026", tag: "holiday",
    gradient: "from-sky-300 to-indigo-400", sharedDaysAgo: 0,
    reactions: [{ kind: "heart", by: ["james", "noah"] }, { kind: "laugh", by: ["james"] }],
    comments: [{ by: "james", body: "Best day of the summer!" }],
  },
  {
    id: "m-2", by: "james", caption: "Biscuit waiting for you by the door, every single day.", takenOn: "Oct 20, 2026", tag: "pet",
    gradient: "from-amber-200 to-orange-300", sharedDaysAgo: 1,
    reactions: [{ kind: "hug", by: ["emma"] }],
    comments: [{ by: "leo", body: "Biscuit!!!" }],
  },
  {
    id: "m-3", by: "noah", caption: "Soccer team photo, we saved your spot!", takenOn: "Sep 30, 2026", tag: "school",
    gradient: "from-lime-200 to-emerald-300", sharedDaysAgo: 3,
    reactions: [{ kind: "star", by: ["emma", "james"] }],
    comments: [],
  },
  {
    id: "m-4", by: "emma", caption: "Your 9th birthday: the dinosaur cake!", takenOn: "Mar 2, 2026", tag: "birthday",
    gradient: "from-pink-200 to-rose-300", sharedDaysAgo: 6,
    reactions: [{ kind: "heart", by: ["james"] }],
    comments: [{ by: "emma", body: "You blew out all 9 candles in one go." }],
  },
];

// ---------------------------------------------------------------------------
// Patient: private journal
// ---------------------------------------------------------------------------
export const JOURNAL_ENTRIES = [
  { daysAgo: 0, body: "Today I drew a whale shark. They are the biggest fish in the world.", sharedWithCare: false },
  { daysAgo: 2, body: "I was a bit scared before the test but Sarah held my hand.", sharedWithCare: true },
];

// ---------------------------------------------------------------------------
// Volunteers. Nothing below may identify a patient: no name, age, photo, unit or link.
// ---------------------------------------------------------------------------
export type VolunteerStory = {
  castId: CastId;
  firstName: string;
  job: string;
  story: string;
  passions: string[];
  dreams: string;
  funFact: string;
  languages: string[];
};

export const VOLUNTEER_STORIES: Record<"maya" | "daniel", VolunteerStory> = {
  maya: {
    castId: "maya", firstName: "Maya", job: "Marine biologist",
    story: "I study dolphins and coral reefs. When I was 10, I spent a long time in hospital, and a nurse brought me a book about the ocean. I never stopped reading about it.",
    passions: ["Diving", "Dolphins", "Underwater photos"], dreams: "To discover a new species of coral.",
    funFact: "A dolphin once stole my snorkel!", languages: ["English", "Spanish"],
  },
  daniel: {
    castId: "daniel", firstName: "Daniel", job: "Airline pilot",
    story: "I fly big planes across the ocean. As a kid I built paper planes every day and tested them from my balcony.",
    passions: ["Flying", "Astronomy", "Paper planes"], dreams: "To fly over the North Pole and see the northern lights.",
    funFact: "I've seen a sunrise and a sunset in the same flight.", languages: ["English", "French"],
  },
};

/** Every approved volunteer the matching can suggest. Maya and Daniel have demo accounts; the others are
 * background volunteers without one, like Ava and Lucas among patients. */
export type RosterVolunteer = Omit<VolunteerStory, "castId"> & {
  id: string;
  /** Visits offered a week */
  slotsPerWeek: number;
  /** The ages this volunteer is used to */
  ages: [number, number];
};

export const VOLUNTEER_ROSTER: RosterVolunteer[] = [
  { ...VOLUNTEER_STORIES.maya, id: "maya", slotsPerWeek: 2, ages: [6, 14] },
  { ...VOLUNTEER_STORIES.daniel, id: "daniel", slotsPerWeek: 1, ages: [8, 17] },
  {
    id: "ines", firstName: "Inès", job: "Paleontologist",
    story: "I dig up dinosaur bones and put them back together at the natural history museum. I found my first fossil on a beach when I was eight.",
    passions: ["Dinosaurs", "Fossils", "Hiking"], dreams: "To name a dinosaur nobody has discovered yet.",
    funFact: "I once slept in the museum, right under a T. rex skeleton.", languages: ["French", "English"], slotsPerWeek: 2, ages: [6, 14],
  },
  {
    id: "clara", firstName: "Clara", job: "Music teacher",
    story: "I teach music in a primary school and sing in a small band. My cat Pixel always naps on my guitar case.",
    passions: ["Guitar", "Songwriting", "Cats"], dreams: "To record an album of songs written by kids.",
    funFact: "Pixel meows along when I play in tune.", languages: ["English", "Portuguese"], slotsPerWeek: 1, ages: [8, 17],
  },
  {
    id: "tom", firstName: "Tom", job: "Train driver",
    story: "I drive high-speed trains between big cities. At home, a LEGO railway runs around my whole living room.",
    passions: ["Model trains", "LEGO", "Maps"], dreams: "To drive a train all the way across Canada.",
    funFact: "My LEGO railway has 600 pieces of track.", languages: ["English"], slotsPerWeek: 2, ages: [5, 12],
  },
  {
    id: "hugo", firstName: "Hugo", job: "Youth soccer coach",
    story: "I coach a team of under-12s. When I broke my leg at eleven, I learned to juggle a ball sitting on my bed.",
    passions: ["Soccer", "Juggling", "Basketball"], dreams: "To take my team to a tournament abroad.",
    funFact: "I can juggle a ball 200 times without dropping it.", languages: ["English", "French"], slotsPerWeek: 2, ages: [7, 15],
  },
  {
    id: "nadia", firstName: "Nadia", job: "Comic book artist",
    story: "I draw comics for a children's magazine. My first one was about a dragon who was afraid of the dark.",
    passions: ["Drawing", "Comics", "Dragons"], dreams: "To turn a story invented by kids into a real comic book.",
    funFact: "I can draw with both hands at the same time.", languages: ["English", "Arabic", "French"], slotsPerWeek: 1, ages: [6, 17],
  },
  {
    id: "sam", firstName: "Sam", job: "Veterinarian",
    story: "I take care of cats, dogs and rabbits, and once I nursed a baby fox back to health.",
    passions: ["Cats", "Horses", "Wildlife rescue"], dreams: "To open a rescue center for wild animals.",
    funFact: "My three cats are named after planets.", languages: ["English", "Spanish"], slotsPerWeek: 2, ages: [6, 15],
  },
];

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
  { id: "sa-1", question: "What is the bravest thing you ever did?", body: "When I had my first test here I was scared, but I held a loved one's hand and counted to ten.", daysAgo: 1 },
  { id: "sa-2", question: "What did you want to be when you were a kid?", body: "I want to be a scientist who swims with whale sharks.", daysAgo: 4 },
];

export type HospitalEvent = {
  id: string;
  title: string;
  icon: IconName;
  location: string;
  when: string;
  description: string;
  capacity: number;
  signups: CastId[];
};

export const EVENTS: HospitalEvent[] = [
  { id: "ev-1", title: "Board game afternoon", icon: "played", location: "Pediatrics playroom", when: "Saturday, 2:00 PM", description: "Classic board games with the kids who feel up to it. Games are provided.", capacity: 6, signups: ["daniel"] },
  { id: "ev-2", title: "Drawing workshop", icon: "draw", location: "Art room, 2nd floor", when: "Wednesday, 4:00 PM", description: "Help kids draw their dream job. Bring your best stories!", capacity: 4, signups: ["maya"] },
  { id: "ev-3", title: "Career day", icon: "rocket", location: "Main hall", when: "Friday, Nov 6, 10:00 AM", description: "Volunteers share what their job is like, with photos and props. 10 minutes each.", capacity: 10, signups: ["maya", "daniel"] },
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


