"use client"

import { useEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/* The drag handlers write transition values straight onto the DOM node, and
   React only rewrites a style property when its own value changes between
   renders — so the imperative release animation and the React-driven
   open/close transition must share one easing string, or the first drag would
   leave a stale curve behind for every open/close after it. */
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const SHEET_TRANSITION = `transform 360ms ${SHEET_EASE}`

/* Release past this fraction of the sheet's height means dismiss. */
const DISMISS_FRACTION = 0.3
/* px per ms — a downward flick dismisses even from a short drag. */
const FLICK_VELOCITY = 0.5

/**
 * Bottom sheet that tracks the finger. Dragging is armed only from the
 * handle/header zone so scrollable content inside never fights the gesture;
 * release past 30% of the height or a fast downward flick dismisses,
 * anything less springs back. From `md` up it renders as a centred modal
 * with no drag — a mouse has no business flinging a panel around.
 */
export function DragSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)

  // The md breakpoint has to be known in JS, not just in classes: the closed
  // resting pose differs per mode (offscreen slide vs centred fade) and the
  // touch handlers must refuse to arm on desktop.
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  // Drag state lives in a ref and is applied straight to the DOM: routing a
  // touchmove per frame through setState would re-render the entire picker
  // list under the finger, and the sheet would visibly stutter on mid-range
  // phones.
  const drag = useRef({ armed: false, startY: 0, dy: 0, lastY: 0, lastT: 0, velocity: 0 })

  const onTouchStart = (e: React.TouchEvent) => {
    if (isDesktop) return
    const t = e.touches[0]
    drag.current = { armed: true, startY: t.clientY, dy: 0, lastY: t.clientY, lastT: e.timeStamp, velocity: 0 }
    // Transitions off for the duration of the drag, otherwise the sheet eases
    // towards the finger a frame behind instead of sitting under it.
    if (sheetRef.current) sheetRef.current.style.transition = "none"
    if (scrimRef.current) scrimRef.current.style.transition = "none"
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    const el = sheetRef.current
    if (!d.armed || !el) return
    const t = e.touches[0]
    const raw = t.clientY - d.startY
    // Downward follows the finger with slight resistance; upward is clamped —
    // the sheet is already fully open, there is nowhere further to go.
    const dy = raw > 0 ? raw * 0.95 : 0
    const dt = e.timeStamp - d.lastT
    if (dt > 0) {
      // Exponentially smoothed so a single janky frame can't fake a flick.
      d.velocity = 0.6 * ((t.clientY - d.lastY) / dt) + 0.4 * d.velocity
    }
    d.dy = dy
    d.lastY = t.clientY
    d.lastT = e.timeStamp
    el.style.transform = `translateY(${dy}px)`
    // The scrim thins as the sheet travels, so letting go mid-drag never
    // produces a jump from a stale full-dark overlay.
    if (scrimRef.current) {
      const h = el.offsetHeight || 1
      scrimRef.current.style.opacity = String(Math.max(0, 1 - dy / h))
    }
  }

  const onTouchEnd = () => {
    const d = drag.current
    const el = sheetRef.current
    if (!d.armed || !el) return
    d.armed = false
    const h = el.offsetHeight || 1
    el.style.transition = SHEET_TRANSITION
    // Clearing the inline value hands the scrim back to its class transition.
    if (scrimRef.current) scrimRef.current.style.transition = ""
    // A flick counts even from a short drag, but only with some real travel
    // behind it — the velocity estimate over the couple of milliseconds of a
    // sloppy tap is pure noise.
    if (d.dy > h * DISMISS_FRACTION || (d.velocity > FLICK_VELOCITY && d.dy > 12)) {
      el.style.transform = "translateY(100%)"
      if (scrimRef.current) scrimRef.current.style.opacity = "0"
      onClose()
    } else {
      el.style.transform = "translateY(0px)"
      if (scrimRef.current) scrimRef.current.style.opacity = "1"
    }
  }

  const panelStyle: React.CSSProperties = isDesktop
    ? {
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(12px)",
        transition: `opacity 240ms ease, transform 320ms ${SHEET_EASE}`,
      }
    : {
        transform: open ? "translateY(0)" : "translateY(100%)",
        transition: SHEET_TRANSITION,
      }

  return (
    <div className={cn("fixed inset-0 z-[120]", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[88vh] flex-col overflow-hidden rounded-t-[26px] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.28)] md:inset-0 md:m-auto md:h-[70vh] md:max-w-lg md:rounded-2xl md:pb-0"
        style={panelStyle}
      >
        {/* Only this zone arms the drag. The content below scrolls, and a
            sheet that dismisses itself when someone flings a long brand list
            towards the top is unusable. */}
        <div
          className="shrink-0 touch-none select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* No grab handle. The pill was the only thing on these sheets that
              looked like it belonged to an older app, and it advertised a
              gesture that is a liability on a picker: fling a long brand list
              upward and a drag-to-dismiss reads it as a dismissal. The header
              still arms the drag for anyone who reaches for it; the X is the
              stated way out, and it is a real 44pt target now rather than a
              20px icon with 6px of padding. */}
          <div className="flex items-center justify-between gap-2 border-b border-neutral-100 py-2 pl-4 pr-2 md:py-2.5">
            <h2 className="min-w-0 truncate text-[16.5px] font-semibold tracking-[-0.01em] text-neutral-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={() => {
                void triggerHaptic("light")
                onClose()
              }}
              aria-label="Închide"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-[background-color,transform] duration-150 active:scale-[0.94] active:bg-neutral-100"
            >
              <X className="h-[21px] w-[21px]" strokeWidth={2.2} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  )
}
