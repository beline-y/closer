import Link from "next/link";
import { DemoRolePicker } from "@/components/demo-role-picker";
import { DemoAIGuide } from "@/components/demo-ai-guide";
import { buttonVariants } from "@/components/ui/button";
import { isDemoMode } from "@/lib/demo-mode";
import { cn } from "@/lib/utils";
import { CloserIcon } from "@/components/icons/closer-icon";

export default function Home() {
  const demo = isDemoMode();
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 px-4 py-12 sm:px-6 sm:py-16">
      <header className="flex flex-col items-center gap-3 text-center">
        <CloserIcon name="heart" className="size-12 fill-current text-role-family" />
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl">Closer</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Stay close to the people you love, even from a hospital bed.
        </p>
      </header>

      {demo ? (
        <section aria-labelledby="pick-role" className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 id="pick-role" className="text-2xl font-extrabold">
              Choose a demo role
            </h2>
            <p className="text-muted-foreground">One story, four points of view. Tap a card to step in.</p>
          </div>
          <DemoRolePicker />
          <DemoAIGuide />
        </section>
      ) : (
        <div className="flex justify-center">
          <Link href="/login" className={cn(buttonVariants({ size: "lg" }), "min-h-12 px-8 text-lg")}>
            Sign in
          </Link>
        </div>
      )}

      <footer className="flex flex-col items-center gap-3 text-center text-sm text-muted-foreground">
        <p>Demo project. All data is fictional.</p>
      </footer>
    </main>
  );
}
