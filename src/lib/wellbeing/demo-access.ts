import { CAST, PATIENT_IDS } from "../cast";

// Explicitly limited to the fictional demo cast. This never grants AI consent.
export function demoInvitationRole(userId: string, patientId: string, accountType: string) {
  if (patientId !== PATIENT_IDS.leo) return null;
  if (accountType === "patient" && userId === CAST.leo.userId) return "patient" as const;
  if (accountType === "family" && [CAST.emma.userId, CAST.james.userId].includes(userId)) return "family" as const;
  return null;
}
