"use client";

import { useSyncExternalStore } from "react";

// Today's date, known only on the client: null during prerender and hydration,
// so server and client markup always match.
let today: Date | null = null;
const subscribe = () => () => {};
const getSnapshot = () => (today ??= new Date());
const getServerSnapshot = () => null;

export function useToday(): Date | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
