"use client"

import { useLayoutEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { isSellFormRoute } from "@/lib/marketplace/sell-route"

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

  /**
   * WHERE THE SHEET WAS OPENED FROM, AND HOW FAR DOWN.
   *
   * Skipping the reset while the sheet is UP was only half the job, and it is
   * the half nobody notices is missing. The sequence that went wrong:
   *
   *   1. You are forty cards down your profile. `pathname` is /profile.
   *   2. You tap ⋯ → Editează. `pathname` becomes /products/edit/<id>, this
   *      effect runs, sees a sell-form route and correctly does nothing.
   *   3. You close the sheet. `pathname` is /profile again — and now the guard
   *      does NOT apply, so the effect fires and sets scrollTop to 0.
   *
   * So closing the sheet dropped you at the top of the profile you had scrolled
   * halfway down: exactly the "navigation you never made" the guard exists to
   * prevent, one step later than the guard was watching.
   *
   * The position is captured on the way IN and put back on the way OUT, and put
   * back only when the path is the same one it was taken from. That last part is
   * what keeps publishing an edit correct: that path ends on /products/<slug>,
   * a different screen, which must arrive at its top like anything else.
   */
  const cameFrom = useRef<{ path: string; top: number } | null>(null)
  const prevPath = useRef<string | null>(null)

  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>(".marketing-flex-wrapper")
    const path = pathname ?? ""
    const previous = prevPath.current
    prevPath.current = path

    // An intercepted route does not replace the page, it covers it. The screen
    // underneath is still mounted and still where you left it.
    if (isSellFormRoute(path)) {
      // Only on the way in. While the sheet is up this effect can run again for
      // a search-param change, and re-reading then would capture the covered
      // page's scrollTop after something else had touched it.
      if (!previous || !isSellFormRoute(previous)) {
        cameFrom.current = { path: previous ?? "", top: el?.scrollTop ?? 0 }
      }
      return
    }

    const back = cameFrom.current
    cameFrom.current = null
    if (back && back.path === path) {
      // Back where you started. The wrapper never unmounted, so this is usually
      // already true — writing it is what makes it true in the cases where
      // something else has since scrolled it.
      if (el && el.scrollTop !== back.top) el.scrollTop = back.top
      return
    }

    if (el && el.scrollTop !== 0) el.scrollTop = 0
  }, [pathname, searchParams])

  return null
}
