"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Watch = { table: string; filter?: string };

// Re-renders the page when watched rows change. Supabase Realtime applies the same RLS
// as queries, so each viewer only hears about rows they may read.
export function LiveRefresh({ channel, watch }: { channel: string; watch: Watch[] }) {
  const router = useRouter();
  const key = JSON.stringify(watch);

  useEffect(() => {
    const supabase = createClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 300);
    };
    const ch = supabase.channel(channel);
    for (const w of JSON.parse(key) as Watch[]) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: w.table, filter: w.filter }, refresh);
    }
    let cancelled = false;
    void supabase.realtime.setAuth().then(() => {
      if (!cancelled)
        ch.subscribe((status, err) => {
          // e.g. a watched table missing from the supabase_realtime publication
          if (status === "CHANNEL_ERROR") console.warn(`Live updates unavailable (${channel})`, err?.message);
        });
    });
    return () => {
      cancelled = true;
      clearTimeout(timer);
      void supabase.removeChannel(ch);
    };
  }, [channel, key, router]);

  return null;
}
