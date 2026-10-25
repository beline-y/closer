"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

// Counts the patient's time in the app for the care team: one ping a minute while the app
// is on screen. The database counts at most one minute per 50 s, whatever the open tabs.
export function AppMinutes() {
  useEffect(() => {
    const supabase = createClient();
    const ping = () => {
      if (document.visibilityState === "visible") void supabase.rpc("log_app_minute");
    };
    ping();
    const timer = setInterval(ping, 60_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}
