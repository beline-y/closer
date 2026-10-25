"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/kit/modal";
import { CAST } from "@/lib/cast";
import { EVENTS, type HospitalEvent } from "@/lib/demo-fixtures";
import { CloserIcon } from "@/components/icons/closer-icon";

const EMPTY: HospitalEvent = { id: "", title: "", icon: "party", location: "", when: "", description: "", capacity: 6, signups: [] };

// Create and edit hospital events, see who signed up. Saved for this visit only.
export function EventsAdmin() {
  const [events, setEvents] = useState(EVENTS);
  const [editing, setEditing] = useState<HospitalEvent | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={() => setEditing(EMPTY)} className="flex min-h-11 items-center gap-2 self-start rounded-lg bg-role-care-ink px-4 font-bold text-white">
        <Plus className="size-4" aria-hidden /> New event
      </button>
      <div className="relative overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[40rem] text-left">
          <thead className="border-b bg-muted/60 text-sm text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2">Event</th>
              <th scope="col" className="px-3 py-2">When</th>
              <th scope="col" className="px-3 py-2">Sign-ups</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-3 py-3">
                  <span className="flex items-center gap-1.5 font-bold">
                    <CloserIcon name={e.icon} className="text-role-care-ink" /> {e.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">{e.location}</span>
                </td>
                <td className="px-3 py-3">{e.when}</td>
                <td className="px-3 py-3">
                  <span className="tabular-nums">
                    {e.signups.length}/{e.capacity}
                  </span>
                  {e.signups.length > 0 && (
                    <span className="block text-sm text-muted-foreground">{e.signups.map((id) => CAST[id].name).join(", ")}</span>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <button type="button" onClick={() => setEditing(e)} className="min-h-11 rounded-lg px-3 font-bold text-role-care-ink hover:bg-muted">
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit event" : "New event"}>
        {editing && (
          <EventForm
            initial={editing}
            onSave={(ev) => {
              setEvents((all) => (ev.id ? all.map((x) => (x.id === ev.id ? ev : x)) : [...all, { ...ev, id: `ev-${Date.now()}` }]));
              setEditing(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function EventForm({ initial, onSave }: { initial: HospitalEvent; onSave: (e: HospitalEvent) => void }) {
  const [ev, setEv] = useState(initial);
  const input = (key: "title" | "location" | "when", label: string, placeholder?: string) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`ev-${key}`} className="text-sm font-bold">
        {label}
      </label>
      <input id={`ev-${key}`} required value={ev[key]} placeholder={placeholder} onChange={(e) => setEv({ ...ev, [key]: e.target.value })} className="min-h-11 rounded-lg border bg-background px-3" />
    </div>
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(ev);
      }}
      className="flex flex-col gap-4"
    >
      {input("title", "Title", "Board game afternoon")}
      {input("location", "Where", "Pediatrics playroom")}
      {input("when", "When", "Saturday, 2:00 PM")}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ev-capacity" className="text-sm font-bold">
          Volunteers needed
        </label>
        <input id="ev-capacity" type="number" min={1} max={50} value={ev.capacity} onChange={(e) => setEv({ ...ev, capacity: Number(e.target.value) })} className="min-h-11 w-24 rounded-lg border bg-background px-3" />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="ev-description" className="text-sm font-bold">
          Description
        </label>
        <textarea id="ev-description" rows={3} value={ev.description} onChange={(e) => setEv({ ...ev, description: e.target.value })} className="rounded-lg border bg-background p-3" />
      </div>
      <button type="submit" className="min-h-11 rounded-lg bg-role-care-ink font-bold text-white">
        Save event
      </button>
    </form>
  );
}
