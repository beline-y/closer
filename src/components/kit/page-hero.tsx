import type { ReactNode } from "react";
import { ReadAloud } from "@/components/kit/read-aloud";
import { HUES, type Hue } from "@/lib/hues";
import { cn } from "@/lib/utils";

// Patient screen title: a colored banner in the screen's hue with a big emoji sticker,
// a short line under it and a "Listen" button that reads both out loud.
export function PageHero({ emoji, title, hue, listen, children }: { emoji: string; title: string; hue: Hue; listen?: string; children?: ReactNode }) {
  return (
    <header className={cn("relative flex flex-wrap items-center gap-4 overflow-hidden rounded-[2rem] bg-hue-soft p-5 sm:flex-nowrap sm:gap-5 sm:p-6", HUES[hue])}>
      {/* Two soft bubbles in the corner, just for fun */}
      <span aria-hidden className="absolute -top-10 -right-8 size-36 rounded-full bg-hue opacity-25" />
      <span aria-hidden className="absolute right-20 -bottom-12 size-24 rounded-full bg-hue opacity-20" />
      <span aria-hidden className="relative flex size-20 shrink-0 -rotate-6 items-center justify-center rounded-3xl bg-card text-5xl shadow-sm sm:size-24 sm:text-6xl">
        {emoji}
      </span>
      <div className="relative flex min-w-0 flex-1 basis-40 flex-col gap-1">
        <h1 className="text-4xl font-extrabold sm:text-5xl">{title}</h1>
        {children && <div className="text-xl font-bold text-hue-ink">{children}</div>}
      </div>
      {listen && <ReadAloud text={listen} className="relative sm:self-start" />}
    </header>
  );
}
