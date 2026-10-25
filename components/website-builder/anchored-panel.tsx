"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { scrollMoves } from "@/lib/website-builder/scroll-moves"

/**
 * ===========================================================================
 *  A PANEL THAT HANGS FROM A BUTTON IN THE CHROME
 * ===========================================================================
 * The editor's top bar is `relative z-50`, which makes it a stacking context.
 * Anything rendered inside it is ranked against the bar's other children, and
 * the bar as a whole is ranked at 50 against everything else. So a panel that
 * drops out of the bar and over the canvas is not at its own z-index out
 * there: it is at 50, whatever number it declares.
 *
 * That is why the Publish panel went behind the code editor. The code pane is
 * `absolute inset-0 z-[80]` in the canvas, and 80 beats 50, so the panel was
 * painted underneath it: visible at the edges, unusable in the middle. Raising
 * the panel's own number cannot fix it, because that number is being compared
 * inside the bar and nowhere else.
 *
 * The mobile sheet already solved this by leaving: it renders into
 * `document.body`, where the layer it declares is the layer it gets. This is
 * the same move for the desktop popovers, in one place so the next one does
 * not have to rediscover it.
 *
 * `position: fixed` against the anchor's rect, so the panel tracks the button
 * without living inside it.
 */

/**
 * Above the code pane (80) and its full screen form (120), below Project
 * settings (150), which is a screen of its own and closes this on the way in.
 */
export const CHROME_POPOVER_Z = 130

export interface AnchoredPanelProps {
  /** The button this hangs from. */
  anchorRef: React.RefObject<HTMLElement | null>
  /** Right edge aligned with the anchor's, or centred under it. */
  align?: "right" | "center"
  /** Pixels between the anchor's bottom and the panel's top. */
  gap?: number
  className?: string
  role?: string
  "aria-label"?: string
  "data-state"?: string
  children: ReactNode
  /** Forwarded so the owner can still ask "did the click land in here". */
  panelRef?: React.RefObject<HTMLDivElement | null>
}

interface Placement {
  top: number
  left?: number
  right?: number
  transform?: string
  maxHeight: number
}

/** The gutter a panel keeps from the edge of the window. */
const EDGE = 8

export function AnchoredPanel({
  anchorRef,
  align = "right",
  gap = 10,
  className,
  children,
  panelRef,
  ...rest
}: AnchoredPanelProps) {
  const [mounted, setMounted] = useState(false)
  const [place, setPlace] = useState<Placement | null>(null)
  const ownRef = useRef<HTMLDivElement | null>(null)
  const ref = panelRef ?? ownRef

  useEffect(() => setMounted(true), [])

  const measure = useCallback(() => {
    const a = anchorRef.current
    if (!a) return
    const r = a.getBoundingClientRect()
    const top = r.bottom + gap
    /**
     * `right` rather than `left` for a right-aligned panel: the anchor's
     * right edge is known and the panel's width is not, so this places it
     * without having to measure the panel first and without the frame of
     * wrong position that measuring would cost.
     */
    const next: Placement = {
      top,
      ...(align === "right"
        ? { right: Math.max(EDGE, window.innerWidth - r.right) }
        : { left: Math.min(Math.max(r.left + r.width / 2, EDGE), window.innerWidth - EDGE), transform: "translateX(-50%)" }),
      // Never taller than what is left below the button.
      maxHeight: Math.max(160, window.innerHeight - top - EDGE),
    }
    /* Where it already is: no render. */
    setPlace((was) => (was && was.top === next.top && was.left === next.left && was.right === next.right && was.maxHeight === next.maxHeight ? was : next))
  }, [anchorRef, align, gap])

  // Before paint, so the panel never appears at 0,0 and then jumps.
  useLayoutEffect(() => {
    if (!mounted) return
    measure()
  }, [mounted, measure])

  /*
    ONLY A SCROLL THAT MOVES THE BUTTON, ONCE A FRAME (round 15). Every
    scroll in the document reached this, the canvas's above all, and each
    event read the button's box and set the panel's place: a layout and a
    render per wheel notch while a notice from an agent or a push was open,
    170 to 180ms of a slow laptop's scroll (scripts/check-wb-live-r15.mjs).
    The button is in the chrome; the canvas scrolling past does not move it.
  */
  useEffect(() => {
    if (!mounted) return
    let frame = 0
    const onChange = () => {
      if (!frame) frame = requestAnimationFrame(() => { frame = 0; measure() })
    }
    // The editor's own panes scroll; a button inside one moves with it (lib/website-builder/scroll-moves.ts).
    const onScroll = (e: Event) => {
      if (scrollMoves(e, anchorRef.current)) onChange()
    }
    window.addEventListener("resize", onChange)
    window.addEventListener("scroll", onScroll, true)
    const a = anchorRef.current
    const ro = a && typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null
    if (a && ro) ro.observe(a)
    return () => {
      if (frame) cancelAnimationFrame(frame)
      window.removeEventListener("resize", onChange)
      window.removeEventListener("scroll", onScroll, true)
      ro?.disconnect()
    }
  }, [mounted, measure, anchorRef])

  if (!mounted || !place) return null

  /**
   * =========================================================================
   *  TWO BOXES, BECAUSE ONE TRANSFORM CANNOT DO TWO JOBS
   * =========================================================================
   * A centred panel is placed by `transform: translateX(-50%)`, and the enter
   * animation the callers ask for is a transform too. The animation's
   * keyframes set `transform` outright, so for its whole length the centring
   * is simply gone: the panel starts half its own width to the right and
   * slides left into place. That is the "it comes in from the right side
   * weirdly" in the report, and it only ever showed on the centred one.
   *
   * So the outer box does nothing but sit where the panel goes, and the inner
   * box is the panel: the caller's classes, its animation, its size limit and
   * anything else it wants. Neither transform is ever asked to be the other.
   */
  return createPortal(
    <div
      style={{
        position: "fixed",
        top: place.top,
        left: place.left,
        right: place.right,
        transform: place.transform,
        zIndex: CHROME_POPOVER_Z,
      }}
    >
      <div ref={ref} className={className} style={{ maxHeight: place.maxHeight }} {...rest}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
