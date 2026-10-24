// Demo mode: role picker on the landing page + "Demo mode" banner everywhere.
// On in every environment (production included) while all data is fictional.
// When off, the picker and banner are hidden and /login is used instead.
// Not a secret, so this module is safe to import from the proxy and from pages.
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}
