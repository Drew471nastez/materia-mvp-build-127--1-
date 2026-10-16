/**
 * A community's look as its creator once stored it: white (the default) or
 * dark, on the community's own settings (communities.onboarding.appearance).
 *
 * Round 32: nothing reads it for a look any more. Every reader's own choice
 * decides, else white (lib/communities/client/appearance-choice.ts), and the
 * admin no longer offers it. It is kept, untouched, so a welcome-steps save
 * still carries whatever was stored; no migration removes it.
 */

export type CommunityAppearance = "light" | "dark"

export function communityAppearance(raw: unknown): CommunityAppearance {
  if (!raw || typeof raw !== "object") return "light"
  return (raw as { appearance?: unknown }).appearance === "dark" ? "dark" : "light"
}

/** The same settings, with the look set, everything else kept. */
export function withAppearance(onboarding: unknown, appearance: CommunityAppearance): Record<string, unknown> {
  const base = onboarding && typeof onboarding === "object" ? { ...(onboarding as Record<string, unknown>) } : {}
  if (appearance === "dark") base.appearance = "dark"
  else delete base.appearance
  return base
}
