"use client";

import { ImagePlus } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/kit/empty-state";
import { Modal } from "@/components/kit/modal";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import { CAST, type CastId } from "@/lib/cast";
import { relativeDay } from "@/lib/dates";
import { type Memory, MEMORIES, MEMORY_TAGS, type MemoryTag } from "@/lib/demo-fixtures";
import { cn } from "@/lib/utils";

const TAG_EMOJI: Record<MemoryTag, string> = { holiday: "🏖️", birthday: "🎂", pet: "🐾", school: "🏫", family: "👨‍👩‍👦", friends: "🤝", other: "✨" };
const REACTIONS = ["❤️", "😂", "🥹", "⭐"];

// Shared album between Leo and his circle. The care team and volunteers never see it.
// Saved for this visit only until the memories feature lands.
export function MemoriesAlbum({ viewer, big }: { viewer: CastId; big?: boolean }) {
  const [memories, setMemories] = useState<Memory[]>(MEMORIES);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<MemoryTag | "all">("all");
  const open = memories.find((m) => m.id === openId);
  const shown = filter === "all" ? memories : memories.filter((m) => m.tag === filter);

  function update(id: string, fn: (m: Memory) => Memory) {
    setMemories((all) => all.map((m) => (m.id === id ? fn(m) : m)));
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Filter by tag" className="flex gap-2 overflow-x-auto pb-1">
          {(["all", ...MEMORY_TAGS] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 font-bold capitalize transition",
                filter === t ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "all" ? "All" : `${TAG_EMOJI[t]} ${t}`}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-12 items-center gap-2 rounded-full bg-role-family-ink px-5 font-bold text-white shadow-sm"
        >
          <ImagePlus className="size-5" aria-hidden /> Add a memory
        </button>
      </div>

      {shown.length === 0 ? (
        <EmptyState emoji="📸" title="No memories here yet">
          Add a photo of a happy moment. Everyone in the family album will see it.
        </EmptyState>
      ) : (
        <ul className={cn("grid gap-3", big ? "grid-cols-2 lg:grid-cols-3" : "grid-cols-2 sm:grid-cols-3")}>
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => setOpenId(m.id)}
                className="group flex w-full flex-col overflow-hidden rounded-3xl bg-card text-left shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <MemoryPhoto memory={m} className="aspect-square" />
                <span className="flex flex-col gap-0.5 p-3">
                  <span className="line-clamp-2 font-bold">{m.caption}</span>
                  <span className="text-sm text-muted-foreground">
                    {CAST[m.by].avatar} {CAST[m.by].name} · {relativeDay(m.sharedDaysAgo)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal open={!!open} onClose={() => setOpenId(null)} title={open ? `${TAG_EMOJI[open.tag]} ${open.tag[0].toUpperCase()}${open.tag.slice(1)}` : ""}>
        {open && <MemoryDetail memory={open} viewer={viewer} onChange={(fn) => update(open.id, fn)} />}
      </Modal>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a memory 📸">
        <AddMemoryForm
          viewer={viewer}
          onAdd={(m) => {
            setMemories((all) => [m, ...all]);
            setAdding(false);
          }}
        />
      </Modal>
    </div>
  );
}

function MemoryPhoto({ memory, className }: { memory: Memory; className?: string }) {
  if (memory.photoUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) of the picked file
    return <img src={memory.photoUrl} alt={memory.caption} className={cn("w-full object-cover", className)} />;
  }
  return (
    <span role="img" aria-label={memory.caption} className={cn("flex w-full items-center justify-center bg-gradient-to-br text-6xl", memory.gradient, className)}>
      <span aria-hidden className="transition-transform group-hover:scale-110">
        {memory.emoji}
      </span>
    </span>
  );
}

function MemoryDetail({ memory, viewer, onChange }: { memory: Memory; viewer: CastId; onChange: (fn: (m: Memory) => Memory) => void }) {
  const [comment, setComment] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <MemoryPhoto memory={memory} className="aspect-[4/3] rounded-2xl" />
      <div className="flex items-center gap-3">
        <PersonaAvatar person={CAST[memory.by]} size="md" decorative />
        <div className="flex flex-col">
          <p className="text-lg font-bold">{memory.caption}</p>
          <p className="text-sm text-muted-foreground">
            {CAST[memory.by].name} · {memory.takenOn}
          </p>
        </div>
      </div>
      <div role="group" aria-label="React" className="flex flex-wrap gap-2">
        {REACTIONS.map((emoji) => {
          const r = memory.reactions.find((x) => x.emoji === emoji);
          const mine = !!r?.by.includes(viewer);
          return (
            <button
              key={emoji}
              type="button"
              aria-pressed={mine}
              aria-label={`React ${emoji}`}
              onClick={() =>
                onChange((m) => {
                  const others = m.reactions.filter((x) => x.emoji !== emoji);
                  const by = mine ? (r?.by ?? []).filter((id) => id !== viewer) : [...(r?.by ?? []), viewer];
                  return { ...m, reactions: by.length ? [...others, { emoji, by }] : others };
                })
              }
              className={cn("flex min-h-12 items-center gap-1.5 rounded-full px-4 text-xl transition active:scale-95", mine ? "bg-role-family-soft ring-2 ring-role-family" : "bg-muted")}
            >
              {emoji}
              {r && <span className="text-base font-bold tabular-nums">{r.by.length}</span>}
            </button>
          );
        })}
      </div>
      <ul className="flex flex-col gap-2">
        {memory.comments.map((c, i) => (
          <li key={i} className="flex items-start gap-2">
            <PersonaAvatar person={CAST[c.by]} size="sm" decorative />
            <p className="rounded-2xl bg-muted px-3 py-2">
              <span className="font-bold">{CAST[c.by].name} </span>
              {c.body}
            </p>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!comment.trim()) return;
          onChange((m) => ({ ...m, comments: [...m.comments, { by: viewer, body: comment.trim() }] }));
          setComment("");
        }}
        className="flex gap-2"
      >
        <label htmlFor="comment" className="sr-only">
          Write a comment
        </label>
        <input id="comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={200} placeholder="Say something nice…" className="min-h-12 min-w-0 flex-1 rounded-full border bg-background px-4" />
        <button type="submit" disabled={!comment.trim()} className="min-h-12 rounded-full bg-foreground px-5 font-bold text-background disabled:opacity-50">
          Send
        </button>
      </form>
    </div>
  );
}

function AddMemoryForm({ viewer, onAdd }: { viewer: CastId; onAdd: (m: Memory) => void }) {
  const [photoUrl, setPhotoUrl] = useState<string>();
  const [caption, setCaption] = useState("");
  const [takenOn, setTakenOn] = useState("");
  const [tag, setTag] = useState<MemoryTag>("family");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!caption.trim()) return;
        onAdd({
          id: `m-${Date.now()}`,
          by: viewer,
          caption: caption.trim(),
          takenOn: takenOn ? new Date(`${takenOn}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Recently",
          tag,
          emoji: TAG_EMOJI[tag],
          gradient: "from-amber-100 to-pink-200",
          photoUrl,
          sharedDaysAgo: 0,
          reactions: [],
          comments: [],
        });
      }}
      className="flex flex-col gap-4"
    >
      <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed bg-muted text-center font-bold">
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local preview (object URL) of the picked file
          <img src={photoUrl} alt="Selected photo" className="max-h-56 w-full object-cover" />
        ) : (
          <>
            <ImagePlus className="size-8" aria-hidden />
            Choose a photo
          </>
        )}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) setPhotoUrl(URL.createObjectURL(file));
          }}
        />
      </label>
      <p className="text-sm text-muted-foreground">Demo: the photo stays on your device. Uploads arrive with the Memories feature.</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="caption" className="font-bold">
          Caption
        </label>
        <input id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={280} required className="min-h-12 rounded-xl border bg-background px-4" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="taken-on" className="font-bold">
            Date
          </label>
          <input id="taken-on" type="date" value={takenOn} onChange={(e) => setTakenOn(e.target.value)} className="min-h-12 rounded-xl border bg-background px-4" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="tag" className="font-bold">
            Tag
          </label>
          <select id="tag" value={tag} onChange={(e) => setTag(e.target.value as MemoryTag)} className="min-h-12 rounded-xl border bg-background px-4 capitalize">
            {MEMORY_TAGS.map((t) => (
              <option key={t} value={t}>
                {TAG_EMOJI[t]} {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button type="submit" disabled={!caption.trim()} className="min-h-14 rounded-2xl bg-role-family-ink text-lg font-extrabold text-white disabled:opacity-50">
        Share with the family
      </button>
    </form>
  );
}
