import { Camera } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Menu · Closer" };

// Placeholder for the post-demo feature: photo of the paper menu → dishes to rate.
// For the demo, menus come from the seed (a fixed weekly rotation). UI only: no upload.
export default function CareMenuPage() {
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold">Menu</h1>
      </header>
      <section aria-labelledby="menu-upload-title" className="flex max-w-xl flex-col items-start gap-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="menu-upload-title" className="font-heading text-lg font-extrabold">
            Upload today&apos;s menu
          </h2>
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-bold text-muted-foreground">Coming soon</span>
        </div>
        <p className="text-muted-foreground">Take a photo of the paper menu. Closer will turn it into the dishes Leo can rate. Coming soon.</p>
        <button
          type="button"
          disabled
          aria-label="Take a photo of the menu (coming soon)"
          className="inline-flex min-h-11 cursor-not-allowed items-center gap-2 rounded-xl border border-dashed px-4 font-bold text-muted-foreground opacity-60"
        >
          <Camera className="size-5" aria-hidden /> Take a photo
        </button>
      </section>
    </>
  );
}
