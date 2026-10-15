"use client"

/**
 * A community's look for this reader: their own choice (lib/appearance/client.ts, the same one Storelib's header
 * switches), else white.
 *
 * ROUND 32, THE OWNER: "only members choose their own look". A community has no look of its own any more: the admin's
 * White or Dark setting is gone, and the value it stored (communities.onboarding.appearance) is no longer read, so it
 * is no longer this page's default either. The column is kept as it is; nothing was migrated or deleted.
 */
import { useAppearance } from "@/lib/appearance/client"
import type { Appearance } from "@/lib/appearance/site-appearance"

export type { Appearance }

export function useCommunityAppearance(): { appearance: Appearance; toggle: () => void } {
  return useAppearance("light")
}
