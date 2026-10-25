// Patient side: five bright, soft hues, one per screen and per kind of action.
// The class opens a scope (see the hue-* utilities in globals.css); inside it, use
// bg-hue-soft, text-hue-ink, ring-hue… Always next to an emoji and a word, never alone.
export const HUES = {
  sun: "hue-sun",
  coral: "hue-coral",
  mint: "hue-mint",
  sky: "hue-sky",
  lilac: "hue-lilac",
} as const;

export type Hue = keyof typeof HUES;
