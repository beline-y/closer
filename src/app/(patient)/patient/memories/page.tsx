import type { Metadata } from "next";
import { MemoriesAlbum } from "@/components/memories-album";

export const metadata: Metadata = { title: "Memories · Closer" };

export default function PatientMemoriesPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-4xl font-extrabold">Memories 📸</h1>
        <p className="text-xl text-muted-foreground">Happy moments with your family.</p>
      </header>
      <MemoriesAlbum viewer="leo" big />
    </>
  );
}
