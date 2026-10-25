"use client";

import { Square, Volume2 } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const noSubscribe = () => () => {};

// "Listen": reads a text out loud with the device's voice, for kids who read little.
// Emoji are left out (voices spell them as "grinning face"). Hidden when the browser can't speak.
export function ReadAloud({ text, label = "Listen", className }: { text: string; label?: string; className?: string }) {
  const canSpeak = useSyncExternalStore(noSubscribe, () => "speechSynthesis" in window, () => false);
  const [speaking, setSpeaking] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);

  // Stop talking when the screen goes away.
  useEffect(
    () => () => {
      if (utterance.current) window.speechSynthesis.cancel();
    },
    [],
  );

  if (!canSpeak) return null;

  function toggle() {
    const synth = window.speechSynthesis;
    synth.cancel();
    if (speaking) {
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, "").trim());
    u.lang = "en-US";
    u.rate = 0.9;
    u.onend = u.onerror = () => {
      if (utterance.current === u) utterance.current = null;
      setSpeaking(false);
    };
    utterance.current = u;
    synth.speak(u);
    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={speaking}
      className={cn(
        "flex min-h-12 shrink-0 items-center gap-1.5 rounded-full px-4 font-bold shadow-sm ring-1 ring-black/5 transition active:scale-95",
        speaking ? "bg-hue-ink text-white" : "bg-card text-hue-ink",
        className,
      )}
    >
      {speaking ? <Square className="size-5 fill-current" aria-hidden /> : <Volume2 className="size-6" aria-hidden />}
      {speaking ? "Stop" : label}
    </button>
  );
}
