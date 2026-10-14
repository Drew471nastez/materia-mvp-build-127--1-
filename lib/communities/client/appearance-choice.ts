"use client"

/**
 * A community's look for this reader: their own choice (lib/appearance/client.ts,
 * the same one Storelib's header switches), or its creator's when they never chose.
 */
import { useLayoutEffect } from "react"
import { setPageDefaultAppearance, useAppearance } from "@/lib/appearance/client"
import type { Appearance } from "@/lib/appearance/site-appearance"

export type { Appearance }

export function useCommunityAppearance(communityDefault: Appearance): { appearance: Appearance; toggle: () => void } {
  /* The creator's pick is this page's default while it is on screen, so <html> (sheets, menus, the bounce) follows it too. */
  useLayoutEffect(() => {
    setPageDefaultAppearance(communityDefault)
    return () => setPageDefaultAppearance(null)
  }, [communityDefault])
  return useAppearance(communityDefault)
}
