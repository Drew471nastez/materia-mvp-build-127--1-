"use client"

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

/**
 * ===========================================================================
 *  THE LITTLE "i" BESIDE A LABEL
 * ===========================================================================
 *
 * A form asks for things whose answer is obvious to whoever wrote the form and
 * not to whoever is filling it in. The answer to each is one sentence long, and
 * there are two ordinary places to put a sentence like that, both worse than
 * this one:
 *
 *   UNDER THE LABEL, always visible. Every field grows a line of grey text, the
 *   form doubles in height, and the sentences are read exactly once — after
 *   which they are permanent furniture between you and the control you came to
 *   use.
 *
 *   IN A HELP PAGE. Nobody leaves a half-filled form to read one.
 *
 * So it is on demand: a mark you can ignore, and one sentence when you ask. The
 * mark is always visible and hovering it opens the sentence, which is the right
 * way round — a mark that appears on hover is a mark you cannot know to point
 * at, and revealing and opening on the same movement leaves no state in which
 * you can see that help exists and choose whether to read it.
 *
 * ---------------------------------------------------------------------------
 * THE BUBBLE IS DRAWN IN A PORTAL, AND THAT IS NOT OVER-ENGINEERING
 * ---------------------------------------------------------------------------
 * It began as an absolutely-positioned child of the mark, and it was CUT OFF —
 * a black box sliced along the edge of the row it sat in. Everything above it
 * in the tree is a candidate for that: the sell form's rows use
 * `overflow-hidden` to keep their own backgrounds inside their corners, the
 * sheet the form lives in is `overflow-hidden` with the content scrolling
 * inside it, and cards clip their children by design. An absolutely-positioned
 * element is clipped by the nearest ancestor with an overflow, and every one of
 * those is a legitimate style that has nothing to do with tooltips.
 *
 * Fixing it one container at a time means finding every container, forever, and
 * a tooltip that is correct only where somebody remembered is not correct. In a
 * portal on `document.body` there is no ancestor left to clip it, and the same
 * measurement that makes that possible also lets it FLIP above the mark when
 * there is no room below and stay inside the window horizontally.
 *
 * The cost is that hover can no longer be pure CSS: `.info-tip:hover > bubble`
 * cannot match a node that is no longer a descendant. So the open state is held
 * here, and a short close delay lets the pointer travel from the mark onto the
 * bubble without it disappearing on the way.
 */

/** How far the bubble sits from the mark, and from the window's edges. */
const GAP = 9
const EDGE = 12
const WIDTH = 272
/** Long enough to cross the gap with a mouse, short enough not to feel sticky. */
const CLOSE_DELAY_MS = 90

type Placement = { top: number; left: number; below: boolean; arrowLeft: number }

export function InfoTip({
  children,
  className,
  label = "Mai multe informații",
}: {
  /** One sentence. If it needs two, it is not a tooltip. */
  children: React.ReactNode
  className?: string
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<Placement | null>(null)
  const id = useId()
  const wrap = useRef<HTMLSpanElement>(null)
  const mark = useRef<HTMLButtonElement>(null)
  const bubble = useRef<HTMLSpanElement>(null)
  const closeTimer = useRef<number | null>(null)

  const cancelClose = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }, [])

  const closeSoon = useCallback(() => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS)
  }, [cancelClose])

  useEffect(() => cancelClose, [cancelClose])

  /**
   * Measured before the browser paints, so the bubble is never seen in the
   * wrong place. Height is read from the bubble itself once it exists, which is
   * why this runs again while open rather than only on the way in.
   */
  useLayoutEffect(() => {
    if (!open) return
    const measure = () => {
      const m = mark.current
      if (!m) return
      const r = m.getBoundingClientRect()
      const h = bubble.current?.offsetHeight ?? 0
      const vw = window.innerWidth
      const vh = window.innerHeight

      // Below unless there genuinely is not room, in which case above. Not
      // "whichever side has more space": flipping on a near-tie makes the
      // bubble jump between sides as the page scrolls a few pixels.
      const below = r.bottom + GAP + h + EDGE <= vh || r.top - GAP - h < EDGE

      // Anchored to the mark's left edge, pulled back a little so the bubble
      // starts under the word the mark follows rather than under the mark, then
      // clamped so neither end leaves the window.
      const wanted = r.left - 6
      const left = Math.min(Math.max(EDGE, wanted), Math.max(EDGE, vw - WIDTH - EDGE))

      setPlace({
        top: below ? r.bottom + GAP : r.top - GAP - h,
        left,
        below,
        // The arrow tracks the MARK, not the bubble, so it still points at the
        // control after the clamp above has moved the box.
        arrowLeft: Math.min(Math.max(10, r.left + r.width / 2 - left - 4.5), WIDTH - 20),
      })
    }
    measure()
    window.addEventListener("resize", measure)
    window.addEventListener("scroll", measure, true)
    return () => {
      window.removeEventListener("resize", measure)
      window.removeEventListener("scroll", measure, true)
    }
  }, [open, children])

  /**
   * A tap or a click anywhere else closes it.
   *
   * On a pointer this is redundant with the hover handlers; on touch there is
   * no "untap", so without it the only way to dismiss one is to tap the mark
   * again, which nobody does. They tap the thing they were trying to reach, the
   * bubble stays over it, and the form appears stuck.
   *
   * `pointerdown` rather than `click`, so the bubble is gone before whatever is
   * underneath receives the press.
   */
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      const t = e.target as Node
      if (wrap.current?.contains(t) || bubble.current?.contains(t)) return
      setOpen(false)
    }
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("pointerdown", away)
    document.addEventListener("keydown", esc)
    return () => {
      document.removeEventListener("pointerdown", away)
      document.removeEventListener("keydown", esc)
    }
  }, [open])

  const bubbleNode =
    open && place && typeof document !== "undefined"
      ? createPortal(
          <span
            ref={bubble}
            id={id}
            role="tooltip"
            // Kept interactive so the pointer can travel onto it and the text
            // can be selected; the close timer is cancelled while it is here.
            onPointerEnter={cancelClose}
            onPointerLeave={closeSoon}
            className="info-tip-bubble info-tip-bubble-open"
            style={{ top: place.top, left: place.left, width: WIDTH }}
          >
            {children}
            <span
              aria-hidden
              className="info-tip-arrow"
              style={{
                left: place.arrowLeft,
                ...(place.below ? { top: -4 } : { bottom: -4 }),
              }}
            />
          </span>,
          document.body,
        )
      : null

  return (
    <span
      ref={wrap}
      className={cn("info-tip relative inline-flex align-middle", className)}
      onPointerEnter={(e) => {
        // Hover opens it on a mouse. A touch "pointerenter" fires on tap and
        // would race the click handler below into an immediate re-close.
        if (e.pointerType !== "touch") {
          cancelClose()
          setOpen(true)
        }
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") closeSoon()
      }}
    >
      <button
        ref={mark}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onFocus={() => setOpen(true)}
        onBlur={closeSoon}
        className={cn(
          "info-tip-mark flex h-[17px] w-[17px] items-center justify-center rounded-full",
          "bg-[#7c3aed]/10 text-[11px] font-bold leading-none text-[#7c3aed]",
          open && "info-tip-mark-open",
        )}
      >
        i
      </button>
      {bubbleNode}
    </span>
  )
}
