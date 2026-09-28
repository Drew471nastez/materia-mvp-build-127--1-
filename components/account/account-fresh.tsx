"use client"

/**
 * ===========================================================================
 *  THE OVERVIEW IS NEVER AN OLD COPY
 * ===========================================================================
 * The router keeps a page it has shown, or prefetched, for five minutes
 * (next.config staleTimes), and gives that copy back on the next visit. For
 * most pages that is fine. For the profile it is the wrong answer to "am I a
 * seller": finish the store's onboarding, tap Profile, and the kept copy
 * still offers Become a seller.
 *
 * So the overview is stamped with when the server drew it, and when this
 * sees a copy that is either a stamp it has already shown (a return visit
 * to a kept page) or over a minute old (a prefetch from before), it asks
 * the server again, once. The kept copy stays on screen until the new one
 * replaces it, so nothing blinks. A minute, not a second: a phone's clock
 * and the server's never differ by that much, so a fresh page is never
 * drawn twice.
 */

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

const SHOWN = new Set<number>()
const OLD_MS = 60_000

export function FreshOnReturn({ drawnAt }: { drawnAt: number }) {
  const router = useRouter()
  const asked = useRef(false)
  useEffect(() => {
    /* Every copy seen is remembered, the refreshed one too; only the first decides. */
    const first = !asked.current
    asked.current = true
    const kept = SHOWN.has(drawnAt) || Date.now() - drawnAt > OLD_MS
    SHOWN.add(drawnAt)
    if (first && kept) router.refresh()
  }, [drawnAt, router])
  return null
}
