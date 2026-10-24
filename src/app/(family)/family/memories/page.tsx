import type { Metadata } from "next";
import { MemoriesAlbum } from "@/components/memories-album";

export const metadata: Metadata = { title: "Memories · Closer" };

export default function FamilyMemoriesPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold">Memories with Leo 📸</h1>
        <p className="text-lg text-muted-foreground">A shared album. Leo sees the same photos.</p>
      </header>
      <MemoriesAlbum viewer="emma" />
    </>
  );
}
