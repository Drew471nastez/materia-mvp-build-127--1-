"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"

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
    setPlace({
      top,
      ...(align === "right"
        ? { right: Math.max(EDGE, window.innerWidth - r.right) }
        : { left: Math.min(Math.max(r.left + r.width / 2, EDGE), window.innerWidth - EDGE), transform: "translateX(-50%)" }),
      // Never taller than what is left below the button.
      maxHeight: Math.max(160, window.innerHeight - top - EDGE),
    })
  }, [anchorRef, align, gap])

  // Before paint, so the panel never appears at 0,0 and then jumps.
  useLayoutEffect(() => {
    if (!mounted) return
    measure()
  }, [mounted, measure])

  useEffect(() => {
    if (!mounted) return
    const onChange = () => measure()
    window.addEventListener("resize", onChange)
    // The editor's own panes scroll; a button inside one moves with it.
    window.addEventListener("scroll", onChange, true)
    const a = anchorRef.current
    const ro = a && typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null
    if (a && ro) ro.observe(a)
    return () => {
      window.removeEventListener("resize", onChange)
      window.removeEventListener("scroll", onChange, true)
      ro?.disconnect()
    }
  }, [mounted, measure, anchorRef])

  if (!mounted || !place) return null

  return createPortal(
    <div
      ref={ref}
      className={className}
      style={{
        position: "fixed",
        top: place.top,
        left: place.left,
        right: place.right,
        transform: place.transform,
        maxHeight: place.maxHeight,
        zIndex: CHROME_POPOVER_Z,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  )
}
