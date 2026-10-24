import type { Metadata } from "next";
import { StoryEditor } from "@/components/volunteer/story-editor";

export const metadata: Metadata = { title: "My story · Closer" };

export default function VolunteerStoryPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">My story</h1>
        <p className="text-lg text-muted-foreground">This card appears next to each of your answers.</p>
      </header>
      <StoryEditor me="maya" />
    </>
  );
}
