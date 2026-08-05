"use client"

import { useLayoutEffect } from "react"
import { usePathname, useSearchParams } from "next/navigation"

/**
 * Puts the shell back at the top on every navigation.
 *
 * In the native app the document is clipped and `.marketing-flex-wrapper` is
 * what scrolls (see app/globals.css — it is the only way to be rid of WebKit's
 * elastic bounce on a page that fits). That moves one job off the browser:
 * Next resets `window.scrollTo(0, 0)` between routes, and the window is no
 * longer the thing that scrolled. Without this, walking down a long seller page
 * and opening your settings would land you halfway down the settings.
 *
 * A layout effect, so the offset is back at zero before the arriving page is
 * painted rather than a frame after it — the difference between arriving at the
 * top and arriving in the middle and jumping.
 *
 * Search params are in the dependency list because a category change on the feed
 * is a navigation to a genuinely different list of results while the pathname
 * stays "/", and it should start at the top like any other.
 *
 * A no-op wherever the document still scrolls: `scrollTop` on a wrapper that
 * isn't a scroll container is already 0, and writing 0 to it does nothing.
 */
export function ShellScrollReset() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useLayoutEffect(() => {
    // An intercepted route does not replace the page, it covers it. The screen
    // underneath is still mounted and still where you left it, and scrolling it
    // to the top would mean closing the sell sheet dropped you at the top of a
    // profile you had scrolled halfway down — a navigation you never made.
    if (pathname?.startsWith("/products/new")) return
    const el = document.querySelector<HTMLElement>(".marketing-flex-wrapper")
    if (el && el.scrollTop !== 0) el.scrollTop = 0
  }, [pathname, searchParams])

  return null
}
