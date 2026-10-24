/**
 * The front page hero's button, by who is looking (components/marketing/hero-cta).
 * "Seller" is the auth snapshot's `isSeller`, which the header writes from
 * the same seller access /app is gated on; /sell decides the rest (sign up
 * first, or seller onboarding).
 */

export type HeroCtaState = "guest" | "buyer" | "creator"

export const HERO_CTA: Record<HeroCtaState, { label: string; href: string }> = {
  guest: { label: "Start Now", href: "/sell" },
  buyer: { label: "Start Creating", href: "/sell" },
  creator: { label: "Dashboard", href: "/app" },
}

export function heroCtaState(snapshot: { signedIn: boolean; isSeller: boolean } | null): HeroCtaState {
  if (!snapshot?.signedIn) return "guest"
  return snapshot.isSeller ? "creator" : "buyer"
}

