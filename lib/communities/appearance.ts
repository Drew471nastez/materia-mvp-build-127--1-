/**
 * A community's look: white (the default) or dark. Kept on the community's
 * own settings (communities.onboarding.appearance), so no new column is
 * required and a welcome-steps save does not drop it.
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
