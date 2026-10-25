"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Counts the patient's time in the app for the care team: one ping a minute while the app
// is on screen. The database counts at most one minute per 50 s, whatever the open tabs.
export function AppMinutes() {
  useEffect(() => {
    const supabase = createClient();
    const ping = () => {
      // The query only runs once awaited (then).
      if (document.visibilityState === "visible") supabase.rpc("log_app_minute").then(({ error }) => error && console.warn("log_app_minute", error.code));
    };
    ping();
    const timer = setInterval(ping, 60_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
