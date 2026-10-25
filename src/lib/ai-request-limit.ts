import "server-only";

// Small per-instance guard for the public fictional demo; not a distributed quota.
const recent = new Map<string, number>();
export function allowAIRequest(key: string) {
  const now = Date.now();
  if (now - (recent.get(key) ?? 0) < 3000) return false;
  if (recent.size >= 1000) recent.delete(recent.keys().next().value!);
  recent.set(key, now);
  return true;
}
