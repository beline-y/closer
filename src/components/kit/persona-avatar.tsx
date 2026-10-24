import type { CastMember } from "@/lib/cast";
import type { RoleKey } from "@/lib/roles";
import { cn } from "@/lib/utils";

const RING: Record<RoleKey, string> = {
  patient: "ring-role-patient",
  family: "ring-role-family",
  care: "ring-role-care",
  volunteer: "ring-role-volunteer",
};

const SIZE = {
  sm: "size-8 text-base ring-2",
  md: "size-11 text-2xl ring-2",
  lg: "size-14 text-3xl ring-[3px]",
  xl: "size-20 text-5xl ring-4",
};

const DOT = { sm: "size-2.5", md: "size-3", lg: "size-3.5", xl: "size-4" };

type Props = {
  person: Pick<CastMember, "name" | "avatar" | "role">;
  size?: keyof typeof SIZE;
  /** online = in the app now, recent = active today */
  presence?: "online" | "recent";
  /** Hide the name from screen readers when it's already written next to the avatar */
  decorative?: boolean;
  className?: string;
};

// Emoji "sticker" in a ring of the person's role color, with an optional presence dot.
export function PersonaAvatar({ person, size = "md", presence, decorative, className }: Props) {
  return (
    <span
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : presence ? `${person.name}, ${presence === "online" ? "online now" : "active today"}` : person.name}
      aria-hidden={decorative || undefined}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center rounded-full bg-card ring-offset-2 ring-offset-background select-none",
        SIZE[size],
        RING[person.role],
        className,
      )}
    >
      <span aria-hidden>{person.avatar}</span>
      {presence && (
        <span
          aria-hidden
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-background",
            DOT[size],
            presence === "online" ? "bg-presence" : "bg-mood-4",
          )}
        />
      )}
    </span>
  );
}
