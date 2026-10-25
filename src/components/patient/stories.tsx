"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { markStoriesSeen } from "@/app/story-actions";
import { CloserIcon, REACTION_TONE } from "@/components/icons/closer-icon";
import { PersonaAvatar } from "@/components/kit/persona-avatar";
import type { Story } from "@/lib/data/stories";
import { cn } from "@/lib/utils";

const who = (m: Story["person"]) => (m.relationship === "Mom" || m.relationship === "Dad" ? m.relationship : m.name);

// "Who's thinking of you": one round avatar per person who sent something today. A colored
// ring while something is unseen, grey once seen. Tap to open their story full screen.
export function StoriesRow({ stories }: { stories: Story[] }) {
  const [seen, setSeen] = useState<Set<string>>(() => new Set(stories.flatMap((s) => s.items.filter((i) => i.seen).map((i) => i.key))));
  const [open, setOpen] = useState<number | null>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const seenRef = useRef(seen);
  const markSeen = useCallback((key: string) => {
    if (seenRef.current.has(key)) return;
    seenRef.current = new Set(seenRef.current).add(key);
    setSeen(seenRef.current);
    void markStoriesSeen([key]);
  }, []);

  if (stories.length === 0) {
    return <p className="text-muted-foreground">Your people will pop up here when they send you something.</p>;
  }

  return (
    <>
      <ul aria-label="Who's thinking of you" className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2 [scrollbar-width:none]">
        {stories.map((s, i) => {
          const unseen = s.items.some((it) => !seen.has(it.key));
          return (
            <li key={s.person.id} className="shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  opener.current = e.currentTarget;
                  setOpen(i);
                }}
                aria-label={`${who(s.person)}: ${s.items.length} ${s.items.length === 1 ? "message" : "messages"}${unseen ? ", new" : ""}`}
                className="flex w-16 flex-col items-center gap-1 md:w-[4.5rem]"
              >
                <span
                  className={cn(
                    "flex size-14 items-center justify-center rounded-full p-[3px] md:size-16",
                    unseen ? "bg-gradient-to-tr from-role-patient via-role-family to-role-volunteer" : "bg-border",
                  )}
                >
                  <span className="flex size-full items-center justify-center rounded-full bg-background p-0.5">
                    <PersonaAvatar person={s.person} size="md" decorative className="size-full text-lg ring-0 ring-offset-0 md:text-xl" />
                  </span>
                </span>
                <span className={cn("max-w-full truncate text-xs", unseen ? "font-bold" : "text-muted-foreground")}>{who(s.person)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {open !== null && (
        <StoryViewer
          stories={stories}
          start={open}
          seen={seen}
          onSeen={markSeen}
          onClose={() => {
            setOpen(null);
            opener.current?.focus();
          }}
        />
      )}
    </>
  );
}

// Full screen, story style: tap right for next, left for previous, swipe down or X to close.
function StoryViewer({ stories, start, seen, onSeen, onClose }: { stories: Story[]; start: number; seen: Set<string>; onSeen: (key: string) => void; onClose: () => void }) {
  const [person, setPerson] = useState(start);
  const story = stories[person];
  // Start at the first unseen item of the person.
  const firstUnseen = (p: number) => Math.max(0, stories[p].items.findIndex((it) => !seen.has(it.key)));
  const [index, setIndex] = useState(() => firstUnseen(start));
  const item = story.items[index];
  const close = useRef<HTMLButtonElement>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const [dragY, setDragY] = useState(0);

  useEffect(() => {
    onSeen(item.key);
  }, [item.key, onSeen]);

  useEffect(() => {
    close.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const next = useCallback(() => {
    if (index < story.items.length - 1) setIndex(index + 1);
    else if (person < stories.length - 1) {
      setPerson(person + 1);
      setIndex(firstUnseen(person + 1));
    } else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- firstUnseen reads the latest seen set
  }, [index, person, story.items.length, stories.length, onClose]);

  const previous = useCallback(() => {
    if (index > 0) setIndex(index - 1);
    else if (person > 0) {
      setPerson(person - 1);
      setIndex(stories[person - 1].items.length - 1);
    }
  }, [index, person, stories]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") previous();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, previous, onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${who(story.person)}'s messages`}
      className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-role-patient-soft via-background to-role-family-soft text-foreground"
      style={{ transform: dragY ? `translateY(${dragY}px)` : undefined, opacity: dragY ? Math.max(0.4, 1 - dragY / 400) : undefined }}
      onPointerDown={(e) => {
        dragStart.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={(e) => {
        if (!dragStart.current) return;
        const dy = e.clientY - dragStart.current.y;
        if (dy > 0 && Math.abs(dy) > Math.abs(e.clientX - dragStart.current.x)) setDragY(dy);
      }}
      onPointerUp={() => {
        dragStart.current = null;
        if (dragY > 100) onClose();
        else setDragY(0);
      }}
      onPointerCancel={() => {
        dragStart.current = null;
        setDragY(0);
      }}
    >
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
        {story.items.length > 1 && (
          <ol aria-label={`Message ${index + 1} of ${story.items.length}`} className="flex gap-1">
            {story.items.map((it, i) => (
              <li key={it.key} aria-hidden className="h-1 flex-1 overflow-hidden rounded-full bg-foreground/15">
                <span className={cn("block h-full rounded-full bg-foreground/70 transition-[width] duration-300", i <= index ? "w-full" : "w-0")} />
              </li>
            ))}
          </ol>
        )}
        <header className="mt-3 flex items-center gap-3">
          <PersonaAvatar person={story.person} size="md" decorative />
          <div className="flex min-w-0 flex-col">
            <span className="font-heading text-lg font-extrabold">{who(story.person)}</span>
            <span className="text-sm text-muted-foreground">{item.time}</span>
          </div>
          <button
            ref={close}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-auto flex size-11 items-center justify-center rounded-full bg-card/80 shadow-sm"
          >
            <CloserIcon name="close" className="size-6" />
          </button>
        </header>

        <div className="relative flex flex-1 flex-col items-center justify-center gap-5 py-6 text-center">
          <span className={cn("flex size-24 animate-pop items-center justify-center rounded-full bg-card shadow-sm", item.tone ? REACTION_TONE[item.tone] : "text-role-patient-ink")} key={item.key}>
            <CloserIcon name={item.icon} className="size-12" strokeWidth={1.75} />
          </span>
          <p className="max-w-md font-heading text-2xl font-extrabold text-balance">
            {who(story.person)} {item.title}
          </p>
          {item.body && <p className="max-w-md text-xl leading-relaxed text-pretty">“{item.body}”</p>}
          {item.href && (
            <Link href={item.href} onClick={onClose} className="relative z-10 flex min-h-12 items-center gap-2 rounded-full bg-role-patient px-6 font-extrabold shadow-sm">
              Open <CloserIcon name="arrow_right" />
            </Link>
          )}
          {/* Tap zones: left third goes back, the rest goes forward */}
          <button type="button" aria-label="Previous message" onClick={previous} className="absolute inset-y-0 left-0 w-1/3" />
          <button type="button" aria-label="Next message" onClick={next} className="absolute inset-y-0 right-0 w-2/3" />
        </div>
      </div>
    </div>
  );
}
