import {
  ArrowRight,
  Clock,
  Lock,
  Pause,
  PenLine,
  Play,
  Plus,
  Apple,
  BedDouble,
  Bell,
  BicepsFlexed,
  BookOpen,
  Brain,
  Cake,
  Camera,
  Check,
  Clapperboard,
  Coffee,
  Contrast,
  Dices,
  DoorOpen,
  Flame,
  Footprints,
  Frown,
  GraduationCap,
  HandHeart,
  Heart,
  House,
  Image,
  KeyRound,
  Laugh,
  Lightbulb,
  type LucideIcon,
  Mail,
  MapPin,
  Medal,
  Meh,
  MessageCircle,
  Palette,
  PartyPopper,
  PawPrint,
  Phone,
  Plane,
  Puzzle,
  Rocket,
  Smile,
  Soup,
  Sparkles,
  Sprout,
  Star,
  Stethoscope,
  Syringe,
  TreePalm,
  TriangleAlert,
  Trophy,
  Users,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

// The one icon set of Closer: lucide line icons, drawn in the current text color, so the
// same thing looks the same on Android, iOS and Windows (emoji don't). Keys are what the
// app stores and passes around; never emoji characters.
export const ICONS = {
  // Nudges
  miss_you: Heart,
  call_me: Phone,
  bored: Puzzle,
  proud: Trophy,
  hug: HandHeart,
  // Reactions and replies
  heart: Heart,
  strong: BicepsFlexed,
  laugh: Laugh,
  star: Star,
  call: Phone,
  // Activity types
  draw: Palette,
  make_snap: Camera,
  quiz: Brain,
  story: BookOpen,
  challenge: Users,
  // Check-in activities
  played: Dices,
  movie: Clapperboard,
  drew: Palette,
  school: GraduationCap,
  visit: DoorOpen,
  treatment: Syringe,
  rested: BedDouble,
  walk: Footprints,
  // Meals
  breakfast: Coffee,
  lunch: UtensilsCrossed,
  dinner: Soup,
  snack: Apple,
  food: UtensilsCrossed,
  // Memory tags
  holiday: TreePalm,
  birthday: Cake,
  pet: PawPrint,
  family: House,
  friends: Smile,
  // Badges, levels and readings
  sprout: Sprout,
  medal: Medal,
  trophy: Trophy,
  half: Contrast,
  happy: Smile,
  neutral: Meh,
  sad: Frown,
  // Everything else
  streak: Flame,
  rocket: Rocket,
  plane: Plane,
  stethoscope: Stethoscope,
  card: Mail,
  key: KeyRound,
  memory: Image,
  message: MessageCircle,
  pen: PenLine,
  lock: Lock,
  play: Play,
  arrow_right: ArrowRight,
  clock: Clock,
  plus: Plus,
  bell: Bell,
  pin: MapPin,
  pause: Pause,
  idea: Lightbulb,
  sparkles: Sparkles,
  party: PartyPopper,
  check: Check,
  close: X,
  alert: TriangleAlert,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** Palette color per reaction or reply key, so a hug looks the same everywhere. */
export const REACTION_TONE = {
  heart: "text-role-family",
  hug: "text-role-patient-ink",
  strong: "text-mood-5",
  laugh: "text-mood-4",
  star: "text-mood-4",
  call: "text-role-care-ink",
} as const;

type Props = {
  name: IconName;
  /** Accessible name when the icon carries meaning on its own; decorative otherwise */
  label?: string;
  className?: string;
  strokeWidth?: number;
};

export function CloserIcon({ name, label, className, strokeWidth = 2 }: Props) {
  const Icon = ICONS[name];
  return (
    <Icon
      className={cn("size-[1.15em] shrink-0", className)}
      strokeWidth={strokeWidth}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    />
  );
}
