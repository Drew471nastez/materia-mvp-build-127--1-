"use client"

/**
 * ===========================================================================
 *  GOING BACK WAS A CUT, NOT A TRANSITION
 * ===========================================================================
 * Pressing back on a product page ran `window.history.back()` on the same
 * frame as the press. The route is in the client router's cache, so the
 * product page was gone and the grid was there in a single frame: no motion,
 * nothing to read, just a different page. That is what "too direct, too
 * quick" is — the navigation is not too fast, it is that there is no
 * transition at all, in either direction:
 *
 *     the product page has no exit animation
 *     the creator page has no entrance animation
 *
 * so the two hard edges meet.
 *
 * ---------------------------------------------------------------------------
 *  WHY A VEIL RATHER THAN FADING THE PAGE OUT
 * ---------------------------------------------------------------------------
 * Fading the leaving page to nothing reveals whatever is behind it, which is
 * the body's background and not the page's. A creator with a dark product
 * page would get a white flash in the middle of the transition, which is
 * worse than the cut it replaced.
 *
 * So nothing fades out. A sheet of the page's OWN background colour fades in
 * over it, the navigation happens underneath while it is opaque, and the
 * sheet fades off the new page. Same effect to the eye, no flash, and the
 * colour is measured from the page that is actually on screen rather than
 * assumed.
 *
 * It lives in the marketing layout, which survives the navigation. A veil
 * rendered by the product page would unmount at the swap and take the second
 * half of its own transition with it.
 *
 * ---------------------------------------------------------------------------
 *  IT IS ONLY FOR GOING BACK, AND THAT IS DELIBERATE
 * ---------------------------------------------------------------------------
 * Back is a client-side restore and lands in a few frames, so the time the
 * veil is opaque is known and short. Forward is a server render with a
 * network in front of it, between about 0.3s and, on a cold function, several
 * seconds. A veil there would be a coloured screen for as long as the server
 * takes, which is the grey-skeleton problem wearing a different coat. Going
 * to a product page keeps what it has: the pressed card answers immediately
 * and the page arrives when it arrives.
 *
 * ---------------------------------------------------------------------------
 *  IT CANNOT STRAND SOMEBODY
 * ---------------------------------------------------------------------------
 * The resting state is transparent, in the CSS base rule rather than at the
 * end of an animation, so a veil that is never told to clear is invisible
 * rather than opaque. `pointer-events: none` throughout, so even an opaque
 * one cannot swallow a tap. And if the route has not changed within
 * GIVE_UP_MS it clears anyway, because a back that did nothing — a history
 * entry that was not ours, a blocked navigation — must not leave anybody
 * looking at a coloured rectangle.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"

/**
 * How long a caller waits before navigating.
 *
 * TWENTY MILLISECONDS LONGER THAN THE RISE IN THE CSS, on purpose. The sheet
 * has to be fully opaque at the instant the route swaps underneath it — that
 * is what hides the swap, and it is also when the sheet repaints itself to
 * the colour of the page arrived at. Navigating on the exact frame the
 * transition is due to end leaves it at 0.97 or so, which is enough to see
 * the change through.
 */
export const PAGE_LEAVE_MS = 210
/** And clearing off the page arrived at. Longer, because arriving should settle. */
const PAGE_ARRIVE_MS = 300
/** A back that never happened still has to give the page back. */
const GIVE_UP_MS = 900

const EVENT = "storelib:page-leaving"

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches
  } catch {
    return false
  }
}

/**
 * Ask for the transition, and get back how long to wait before navigating.
 *
 * Zero under reduced motion, so a caller that respects the return value
 * respects the preference without having to know about it.
 */
export function beginPageLeave(): number {
  if (typeof window === "undefined") return 0
  if (prefersReducedMotion()) return 0
  window.dispatchEvent(new CustomEvent(EVENT))
  return PAGE_LEAVE_MS
}

/**
 * The background the visitor is actually looking at.
 *
 * MEASURED, NOT ASSUMED: a creator paints their own page, so the only way to
 * match it is to read what is on screen. `[data-page-root]` is the page's
 * outermost element — the product page and the storefront both carry it — and
 * body is the fallback for a page that has not marked one, or for a root
 * painted with a gradient, where `backgroundColor` is transparent.
 */
function paintedPageColor(): string {
  try {
    const root = document.querySelector("[data-page-root]")
    const painted = root ? getComputedStyle(root).backgroundColor : ""
    const seeThrough = !painted || painted === "transparent" || /rgba\(0, 0, 0, 0\)/.test(painted)
    return seeThrough ? getComputedStyle(document.body).backgroundColor : painted
  } catch {
    return ""
  }
}

type VeilState = "idle" | "rising" | "clearing"

export function PageLeaveVeil() {
  const [state, setState] = useState<VeilState>("idle")
  const [color, setColor] = useState<string>("")
  const pathname = usePathname()
  /**
   * ALWAYS MOUNTED, AND THAT IS NOT AN OVERSIGHT. A transition needs a
   * starting frame: an element inserted already opaque has nothing to
   * animate from, so the veil would appear in one frame and the cut would be
   * back, in a different colour. It sits at opacity 0 with no transition of
   * its own and nothing to catch a tap, and the state attribute is what
   * moves it.
   */
  const stateRef = useRef<VeilState>("idle")
  /** The path the veil went up on. The veil clears once we are off it. */
  const leftFrom = useRef<string | null>(null)
  const timers = useRef<number[]>([])

  const clearTimers = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  const set = useCallback((next: VeilState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const startClearing = useCallback(() => {
    if (stateRef.current !== "rising") return
    leftFrom.current = null
    clearTimers()
    /*
      THE COLOUR CHANGES HERE, AND NOBODY SEES IT CHANGE.

      The sheet went up in the colour of the page being left. It comes off
      over a different page, which a creator may have painted black when the
      one behind it was white — and fading white away from a black page is
      the flash this whole thing exists to avoid, just at the other end.

      The veil is fully opaque at this instant, so re-reading the page
      underneath and repainting the sheet to match costs nothing visually.
      Each half of the transition then dissolves against its own page.
    */
    setColor(paintedPageColor())
    set("clearing")
    timers.current.push(window.setTimeout(() => set("idle"), PAGE_ARRIVE_MS))
  }, [clearTimers, set])

  useEffect(() => {
    const onLeaving = () => {
      /*
        MEASURED, NOT ASSUMED. The product page paints its own background from
        the creator's theme, so the only way to match it is to read what is on
        screen. `[data-page-root]` is the page's outermost element; body is the
        fallback for a page that has not marked one.
      */
      setColor(paintedPageColor())
      leftFrom.current = window.location.pathname
      clearTimers()
      set("rising")
      timers.current.push(
        window.setTimeout(() => {
          /* A back that did nothing must still give the page back. */
          if (stateRef.current === "rising") {
            leftFrom.current = null
            set("clearing")
            timers.current.push(window.setTimeout(() => set("idle"), PAGE_ARRIVE_MS))
          }
        }, GIVE_UP_MS),
      )
    }

    /*
      A popstate is the browser's navigation, not React's, so there is no
      pending state to watch. Two frames after it the route below has
      rendered and the veil can come off what is now on screen. One frame is
      not enough: React commits on the first and paints on the second.
    */
    const onPopState = () => {
      if (leftFrom.current === null) return
      requestAnimationFrame(() => requestAnimationFrame(startClearing))
    }

    window.addEventListener(EVENT, onLeaving)
    window.addEventListener("popstate", onPopState)
    /* Restored from the back/forward cache: whatever was happening is over. */
    window.addEventListener("pageshow", startClearing)
    return () => {
      window.removeEventListener(EVENT, onLeaving)
      window.removeEventListener("popstate", onPopState)
      window.removeEventListener("pageshow", startClearing)
      clearTimers()
    }
  }, [clearTimers, set, startClearing])

  /**
   * The other way the route can change: the fallback path, where there is no
   * history entry to go back to and the control pushes the creator's page
   * instead. That is React's own navigation and it has no popstate.
   */
  useEffect(() => {
    if (leftFrom.current !== null && pathname !== leftFrom.current) startClearing()
  }, [pathname, startClearing])

  return (
    <div
      aria-hidden="true"
      className="page-leave-veil"
      data-state={state}
      style={color ? { background: color } : undefined}
    />
  )
}
