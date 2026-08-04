"use client"

import { useEffect } from "react"
import { claimSurface } from "@/lib/surface-bg"

/**
 * "This screen is this colour, all the way up to the clock."
 *
 * In the app a fixed white bar sits over the status-bar area
 * (`html.capacitor::before`), and `lib/surface-bg.ts` is the one mechanism that
 * takes it down and paints that strip whatever the screen underneath wants. It
 * has been used by the feed and the top bar since it was written; the profile
 * never claimed anything, so its purple wash — which is pulled up by the
 * safe-area inset specifically to run behind the clock — was arriving under a
 * strip somebody else had already declared white. A hard white band across the
 * top of a screen whose whole top is a colour wash.
 *
 * A component rather than a hook call at each site because the two places that
 * need it are a client component and a `loading.tsx`, and a route's skeleton has
 * to make the same claim as the screen it hands over to. If it does not, the
 * strip changes colour at the swap — which is a flash at the very top of the
 * screen, in the one place a flash is impossible to miss.
 */
export function SurfaceClaim({ colour }: { colour: string }) {
  useEffect(() => {
    const surface = claimSurface(colour)
    return () => surface.release()
  }, [colour])

  return null
}
