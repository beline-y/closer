import Image from "next/image";
import { cn } from "@/lib/utils";

// The Closer brand files (public/brand, transparent PNGs). Full logo: landing page and the
// care team's sidebar. Icon: small headers.
export function BrandLogo({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/brand/closer-logo.png" alt="Closer" width={480} height={124} priority={priority} className={cn("h-7 w-auto", className)} />;
}

export function BrandIcon({ className }: { className?: string }) {
  return <Image src="/brand/closer-icon.png" alt="Closer" width={128} height={128} className={cn("size-9 rounded-[22%]", className)} />;
}
