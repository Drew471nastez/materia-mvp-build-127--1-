"use client"

import { useEffect, useRef, useState } from "react"
import { useLandAtTop } from "@/lib/navigation/land-at-top"
import { setProductTopBarRevealed } from "@/lib/store-builder/product-top-bar"
import { isNativeApp } from "@/lib/platform-utils"
import { useRevealOnScrollUp } from "@/lib/store-builder/use-reveal-on-scroll-up"
import { useScrollLocked } from "@/lib/store-builder/use-scroll-locked"
import { cn } from "@/lib/utils"

/**
 * Wrapper for sticky elements (like the creator bar) that adjusts
 * the top offset when the platform header is visible in Capacitor apps.
 *
 * Measures the actual rendered height of the platform header so the
 * sticky child sits flush below it regardless of safe-area size.
 */
export function DiscoverStickyWrapper({ children }: { children: React.ReactNode }) {
  const [topOffset, setTopOffset] = useState("0px")

  /*
    A PRODUCT OPENS AT ITS TOP. This bar is on every product page, both
    layouts, so it is where the page says so: opened from Explore (or any
    list) it is at 0 before its first paint and stays there until the person
    moves it, rather than wherever the list or a glide left the window.
    Back and Forward are left to restore. lib/navigation/land-at-top.ts.
  */
  useLandAtTop()

  useEffect(() => {
    if (!isNativeApp()) return

    function measure() {
      const header = document.getElementById("platform-header-root")
      if (header) {
        setTopOffset(`${header.offsetHeight}px`)
      }
    }

    measure()

    // Re-measure if the header resizes (e.g. orientation change)
    const ro = new ResizeObserver(measure)
    const header = document.getElementById("platform-header-root")
    if (header) ro.observe(header)

    return () => ro.disconnect()
  }, [])

  /**
   * IT GETS OUT OF THE WAY. This was `sticky` and nothing else, so the
   * creator bar was pinned across the top of every product page whatever the
   * reader was doing, while the subscribe bar one page over hid on the way
   * down and came back on the way up. Same hook now, so the two agree.
   */
  const { visible, ready: barPlaced } = useRevealOnScrollUp()

  /* The buy bar reads this and stays down while the top bar is up. See
     lib/store-builder/product-top-bar.ts for why the buy bar is not allowed
     to work it out by looking at this element. */
  useEffect(() => {
    /* In the app there is no top bar to make room for (NOT IN THE APP, below). */
    setProductTopBarRevealed(isNativeApp() ? false : visible)
  }, [visible])

  /**
   * ===========================================================================
   *  A MODAL TAKES THE SCROLLING AWAY, AND STICKY GOES WITH IT
   * ===========================================================================
   * See lib/store-builder/use-scroll-locked for the measurement. In short: a
   * modal gives the body `overflow: hidden`, a sticky element has no scrolling
   * ancestor left to stick to, and it drops to its static place in the
   * document, 480px above the window on a page scrolled 480px down. Opening
   * the share sheet threw the creator bar off the top of the screen, which is
   * "it closes the top bar instead of leaving it there".
   *
   * While the page is held, the bar is `fixed` at the same offset instead, so
   * it stays exactly where it was. It sits at z-30, under the modal's scrim,
   * so it is visible and not interactive, which is what a background should
   * be.
   *
   * AND THE SPACE IT LEAVES IS KEPT. A fixed element is out of flow, so the
   * page underneath would jump up by the bar's height at the moment the sheet
   * opens and back down when it closes, a 53px lurch behind the scrim, on
   * both edges of the interaction. The outer div measures the bar once and
   * holds that height for as long as the bar is out of the flow.
   */
  const measured = useRef<HTMLDivElement | null>(null)
  const [heldHeight, setHeldHeight] = useState<number | null>(null)
  const scrollLocked = useScrollLocked()

  useEffect(() => {
    if (!scrollLocked) {
      setHeldHeight(null)
      return
    }
    const h = measured.current?.offsetHeight ?? 0
    if (h > 0) setHeldHeight(h)
  }, [scrollLocked])

  const pinned = scrollLocked && heldHeight !== null

  /**
   * A SIBLING, NOT A WRAPPER. The first version of this put the bar inside a
   * new div that carried the reserved height, and a sticky element sticks
   * only within its own containing block, so a 53px wrapper meant the bar
   * scrolled away with it and stopped sticking at all, modal or no modal. It
   * shipped, and the probe did not catch it because the probe was checking
   * the CLASS STRINGS and not the shape of the DOM around them.
   *
   * The spacer is a sibling instead. When nothing is locked, what renders is
   * exactly one sticky div in the page's own flow, which is what it was
   * before any of this.
   */
  /*
    ===========================================================================
     NOT IN THE APP
    ===========================================================================
    In the iPhone and Android app a product page had the Storelib header, this
    dark bar under it (back, the creator, "...") and then "< Explore" above
    the pictures: two backs and two bars (image 61). The owner keeps the
    Storelib header there and the one back above the media
    (components/product/discover-back-breadcrumb.tsx), so this bar is not
    drawn in the app. Hidden by the `capacitor` class on <html>, which the
    head script sets before the first paint (app/layout.tsx), so it never
    shows for a frame and then goes. On the web it stays: there it is the
    creator's own storefront bar, the way back to their page.
  */
  return (
    <>
      {pinned ? <div style={{ height: heldHeight }} aria-hidden className="[html.capacitor_&]:hidden" /> : null}
      <div
        ref={measured}
        data-product-top-bar=""
        className={cn(
          "z-30 motion-reduce:transition-none [html.capacitor_&]:hidden",
          /*
            THE TRANSITION IS ATTACHED ONLY ONCE THE BAR IS PLACED.

            Arriving on a product page, this mounts while the scroll is still
            wherever the previous page was, so the bar starts hidden and then
            slides DOWN as the reset lands, filmed on production as the dark
            creator bar easing into place over 200ms on every product open.
            `barPlaced` is false for the first moments, so the opening frame
            is a placement. Scrolling animates exactly as before.
          */
          barPlaced && "transition-transform duration-300 ease-out",
          pinned ? "fixed inset-x-0" : "sticky",
          !visible && "-translate-y-full",
        )}
        style={{ top: topOffset }}
      >
        {children}
      </div>
    </>
  )
}
