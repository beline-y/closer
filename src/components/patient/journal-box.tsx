"use client";

import { useState } from "react";

// Private by default: the patient chooses, entry by entry, to share with the care team.
export function JournalBox() {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSaved(text.trim());
        setText("");
      }}
      className="hue-lilac flex flex-col gap-3 rounded-3xl bg-hue-soft p-4"
    >
      <label htmlFor="journal" className="text-lg font-bold">
        How was your day?
      </label>
      <textarea id="journal" value={text} onChange={(e) => setText(e.target.value)} rows={3} className="rounded-2xl border bg-card p-3 text-lg" placeholder="Only you can read it 🔒" />
      <button type="submit" disabled={!text.trim()} className="hue-sun pressable min-h-14 rounded-2xl bg-hue text-lg font-extrabold disabled:opacity-50">
        Save
      </button>
      {saved && (
        <p aria-live="polite" className="animate-rise text-lg">
          Saved! 🔒 Only you can read it.
        </p>
      )}
    </form>
  );
}
