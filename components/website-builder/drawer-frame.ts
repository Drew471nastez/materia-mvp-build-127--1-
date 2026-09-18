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
import { useEffect, useState, type CSSProperties } from "react"

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
      const prev = {
        position: body.position,
        top: body.top,
        left: body.left,
        right: body.right,
        width: body.width,
        overflow: body.overflow,
      }
      body.position = "fixed"
      body.top = `-${scrollY}px`
      body.left = "0"
      body.right = "0"
      body.width = "100%"
      body.overflow = "hidden"

      undo.push(() => {
        body.position = prev.position
        body.top = prev.top
        body.left = prev.left
        body.right = prev.right
        body.width = prev.width
        body.overflow = prev.overflow
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
