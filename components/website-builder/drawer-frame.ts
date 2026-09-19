"use client"

/**
 * ===========================================================================
 *  WHERE A SITE'S DRAWER IS, AND WHAT STOPS MOVING WHILE IT IS OPEN
 * ===========================================================================
 * A built site has two drawers that slide over the page, the nav menu and
 * the cart, and both have to answer the same two awkward questions. This is
 * the answer once. Three bugs went into it, one per paragraph.
 *
 * IT OPENED AT THE TOP OF THE PAGE. Inside the editor a drawer is portalled
 * into `#wb-preview-root`, which is `position: relative` and
 * `overflow-y: auto` — it IS the scroller. An absolutely positioned child of
 * a scroller is laid out against its CONTENT box and scrolls with it, so
 * `top: 0` is the top of the whole page rather than the top of what is on
 * screen. Scroll down, open the menu, and it is drawn a screen or two above
 * you. So the drawer is pinned: `top` is the scroller's `scrollTop` and its
 * height is the scroller's `clientHeight`.
 *
 * THE PAGE KEPT SCROLLING UNDERNEATH. On a published site the lock was
 * `overflow: hidden` on the body, which iOS ignores for touch scrolling, the
 * same thing the explore filters sheet hit. It is the position-fixed lock
 * now, with the offset carried on `top` and put back on close. When scoped
 * there was no lock at all; the scroller takes one of its own, which works
 * because it is a real overflow container rather than the body.
 *
 * IT WAS HALF HEIGHT. Tapping the hamburger in the editor also selects the
 * header, so the inspector sheet opens on the same tap, publishes its peek
 * and the canvas subtracts it as padding. The canvas changes height and the
 * WINDOW never resizes, so a `resize` listener hears nothing and a drawer
 * measured once is left at the wrong size for as long as it is open. A
 * ResizeObserver on the scroller hears all of it.
 *
 * Measured by scripts/check-nav-drawer.mjs, which drives a real page rather
 * than a virtual-time one: frames do not run under a virtual clock, so a
 * ResizeObserver never fires there and the third bug is invisible.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react"

/**
 * One pace for every drawer on a built site. Open settles a touch slower
 * than close, which is how a physical thing behaves: it arrives, it leaves.
 * A link inside a drawer waits CLOSE_MS before asking for its page, so the
 * close is seen rather than cut off by the navigation.
 */
export const DRAWER_OPEN_MS = 360
export const DRAWER_CLOSE_MS = 260
export const DRAWER_OPEN_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
export const DRAWER_CLOSE_EASE = "cubic-bezier(0.4, 0, 1, 1)"
export const drawerSlide = (open: boolean) =>
  open ? `transform ${DRAWER_OPEN_MS}ms ${DRAWER_OPEN_EASE}` : `transform ${DRAWER_CLOSE_MS}ms ${DRAWER_CLOSE_EASE}`
export const drawerFade = (open: boolean) =>
  open ? `opacity 300ms ${DRAWER_OPEN_EASE}` : `opacity 220ms cubic-bezier(0.4, 0, 0.6, 1)`

/**
 * ===========================================================================
 *  DISMISSING BY TAPPING AWAY, WITHOUT THE TAP DOING ANYTHING ELSE
 * ===========================================================================
 * The backdrop closed on `click`, which is two problems on a built site.
 *
 * IT ARRIVES LAST. A click is synthesised at the end of a press and a
 * release, and anything in between that cancels it takes the dismissal with
 * it. A pointer going down on the backdrop is already the whole gesture:
 * there is nothing else a press there can mean.
 *
 * AND IT DOES NOT STAY ON THE BACKDROP. A portal renders outside the
 * header's markup but stays inside its REACT tree, so the event still
 * bubbles to the section wrapper, which in the editor selects the section
 * and opens its settings. Tapping away to dismiss a menu opened the header
 * panel instead, which is the "clicking away does nothing" in the report:
 * something happened, but not the thing that was meant.
 *
 * So the dismissal is bound to the element natively, runs on pointerdown,
 * and stops there.
 */
export function useBackdropDismiss(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  return useCallback((node: HTMLDivElement | null) => {
    if (!node) return

    /*
      AND THE CLICK THAT ARRIVES AFTER IT.

      Closing on the press is the point, but the release still produces a
      click, and by then the backdrop has stopped taking pointer events — so
      that click lands on whatever was underneath. In the editor that selects
      a section and opens its panel; on a published site it can follow a link
      the menu was covering. Measured by scripts/check-nav-drawer.mjs, which
      counts what gets past the backdrop: one event did.

      So the press takes the next click with it, once, and gives up waiting
      after a moment in case no click ever comes.
    */
    const swallowNextClick = () => {
      const eat = (e: Event) => {
        e.stopPropagation()
        e.preventDefault()
        window.removeEventListener("click", eat, true)
      }
      window.addEventListener("click", eat, true)
      window.setTimeout(() => window.removeEventListener("click", eat, true), 700)
    }

    const dismiss = (e: Event) => {
      e.stopPropagation()
      e.preventDefault()
      if (e.type === "pointerdown") swallowNextClick()
      closeRef.current()
    }

    /* Native, not React's synthetic listener: React's runs from the root
       container, so a handler above this one in the React tree can see the
       event first. This one cannot be reached before the backdrop has it. */
    node.addEventListener("pointerdown", dismiss)
    /* A browser with no pointer events, and a keyboard or assistive click
       that never produces one. It is not reached after a pointerdown,
       because that press has already taken this click. */
    node.addEventListener("click", dismiss)
  }, [])
}

export interface DrawerFrame {
  /** False until the client has mounted, when there is no portal target yet. */
  mounted: boolean
  /** Where to portal to: the editor's canvas, or the document. */
  target: HTMLElement | null
  /** `absolute` only when the portal really went into the canvas. */
  positionClass: "absolute" | "fixed"
  /** Top and height, covering exactly the rectangle the visitor can see. */
  frameStyle: CSSProperties
}

export function useDrawerFrame(open: boolean, scopedToPreview: boolean, onClose: () => void): DrawerFrame {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  const [pin, setPin] = useState<{ top: number; height: number } | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)

    const undo: Array<() => void> = [() => window.removeEventListener("keydown", onKey)]

    const scroller = scopedToPreview ? document.getElementById("wb-preview-root") : null

    if (scroller) {
      const startTop = scroller.scrollTop
      const measure = () => setPin({ top: scroller.scrollTop, height: scroller.clientHeight })
      measure()

      const prevOverflow = scroller.style.overflow
      const prevTouch = scroller.style.touchAction
      scroller.style.overflow = "hidden"
      scroller.style.touchAction = "none"

      const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null
      ro?.observe(scroller)
      window.addEventListener("resize", measure)

      undo.push(() => {
        ro?.disconnect()
        window.removeEventListener("resize", measure)
        scroller.style.overflow = prevOverflow
        scroller.style.touchAction = prevTouch
        // `overflow: hidden` can clamp the offset; put it back verbatim.
        scroller.scrollTop = startTop
      })
    } else {
      setPin(null)
      const scrollY = window.scrollY
      const body = document.body.style
      const root = document.documentElement.style
      /*
        AND THE PAGE'S OWN SCROLLBAR GOES WITH IT.

        Pinning the body freezes the page, but the document is still the
        thing that scrolls, and on a screen with classic scrollbars its bar
        stayed drawn down the right edge beside the open drawer: a control
        for scrolling a page that could not be scrolled. It is the bar in
        the cart screenshot.

        The document's overflow is hidden while the drawer is open. That
        takes the bar's column away, which would shift everything left by
        its width, so the body is padded by exactly that width for as long
        as the bar is gone. Overlay scrollbars have no width and get no
        padding, so nothing moves there either.
      */
      const barWidth = window.innerWidth - document.documentElement.clientWidth
      const prev = {
        position: body.position,
        top: body.top,
        left: body.left,
        right: body.right,
        width: body.width,
        overflow: body.overflow,
        paddingRight: body.paddingRight,
        rootOverflow: root.overflow,
      }
      body.position = "fixed"
      body.top = `-${scrollY}px`
      body.left = "0"
      body.right = "0"
      body.width = "100%"
      body.overflow = "hidden"
      if (barWidth > 0) body.paddingRight = `${barWidth}px`
      root.overflow = "hidden"

      undo.push(() => {
        body.position = prev.position
        body.top = prev.top
        body.left = prev.left
        body.right = prev.right
        body.width = prev.width
        body.overflow = prev.overflow
        body.paddingRight = prev.paddingRight
        root.overflow = prev.rootOverflow
        window.scrollTo(0, scrollY)
      })
    }

    return () => { undo.forEach((fn) => fn()) }
  }, [open, onClose, scopedToPreview])

  const previewRoot = mounted && scopedToPreview ? document.getElementById("wb-preview-root") : null

  return {
    mounted,
    target: mounted ? (previewRoot ?? document.body) : null,
    positionClass: previewRoot ? "absolute" : "fixed",
    // Held through the close animation so a drawer slides out from where it
    // was rather than jumping on the way.
    frameStyle: pin ? { top: pin.top, height: pin.height } : { top: 0, bottom: 0 },
  }
}

/**
 * ===========================================================================
 *  A COOKIE NOTICE MUST NOT COVER AN OPEN MENU
 * ===========================================================================
 * The drawers were z-90 and z-95, which beats everything a built site draws.
 * It does not beat the cookie banner, which is `fixed bottom-0 z-[9999]` —
 * and that banner sits across the bottom of the screen, exactly where the
 * menu keeps Search, Account, Wishlist and Create account.
 *
 * Measured on a live published site at phone size: the Search row reported
 * its own topmost element at its centre as
 *
 *     div.flex flex-col gap-3 p-5 sm:flex-row sm:i…
 *
 * which is the banner's top bar, and a tap on Search left the address at "/".
 * The rows were not dead; the tap never reached them.
 *
 * The banner's own file already records this bug happening once before, to
 * the Sites editor's Chat / Preview / Code bar, and answers it by hiding
 * itself there. A public site cannot hide it, so the menu goes above it
 * instead — which is the right order anyway: a cookie notice is the lowest
 * thing on a page, and an open dialog is the highest.
 *
 * Named here rather than written twice, because the nav drawer and the cart
 * drawer are the same surface at different edges and drifting apart is how
 * one of them gets fixed.
 */
export const DRAWER_BACKDROP_Z = "z-[10000]"
export const DRAWER_PANEL_Z = "z-[10001]"
