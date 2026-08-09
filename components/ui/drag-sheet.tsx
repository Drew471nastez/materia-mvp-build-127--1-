"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/* The drag handlers write transition values straight onto the DOM node, and
   React only rewrites a style property when its own value changes between
   renders — so the imperative release animation and the React-driven
   open/close transition must share one easing string, or the first drag would
   leave a stale curve behind for every open/close after it. */
const SHEET_EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
const SHEET_MS = 360
const SHEET_TRANSITION = `transform ${SHEET_MS}ms ${SHEET_EASE}`

/* Release past this fraction of the sheet's height means dismiss. */
const DISMISS_FRACTION = 0.3
/* px per ms — a downward flick dismisses even from a short drag. */
const FLICK_VELOCITY = 0.5

/**
 * ===========================================================================
 *  WHAT A SHEET IS DOING, AS ONE VARIABLE
 * ===========================================================================
 *
 * Two problems used to be solved separately here, badly:
 *
 *   1. A CLOSED SHEET WAS STILL PAINTING. The panel is never unmounted — it has
 *      to exist to be able to slide — and when closed it sits at
 *      `translateY(100%)`, immediately below the viewport, carrying a shadow
 *      that points UP. So it cast a forty-pixel blurred black band back INTO
 *      the visible area for as long as it was closed, which is almost always.
 *      The sell form renders EIGHT of these. That was the black fade along the
 *      bottom of the form.
 *
 *   2. A CLOSED SHEET WAS STILL RENDERING ITS CONTENTS. Eight pickers' worth of
 *      options — every category, every brand, thirty-one styles — reconciled on
 *      every keystroke in the title field, and all of it built during the sell
 *      form's own mount. That is the "it takes a while before the options come
 *      up" on the first tap: the work was never done lazily, it was done
 *      constantly, and the frame you tapped on was competing with it.
 *
 * One state variable answers both, because both are the same question — is this
 * sheet on screen at all:
 *
 *   closed    not painted, and its children are not mounted
 *   arming    children mounted, panel still parked below the screen and not yet
 *             painted. One frame, in which the browser builds the list.
 *   open      up, and moving or arrived
 *   leaving   sliding down, still painted, children still mounted
 *
 * `arming` is the frame that makes the animation smooth. Mounting a list and
 * starting a transform on the SAME frame means the transform's first frames are
 * spent building DOM, which is the stutter at the start of an opening sheet.
 * Here the list is built in a frame where nothing is moving, and the slide
 * starts against a layout that is already settled.
 *
 * It is also why `visibility` needs no delayed transition any more. The old
 * version had to keep a closed sheet visible for exactly the length of its
 * slide with `visibility 0s linear 360ms`, which is a duration written in two
 * places and true only by coincidence. `leaving` IS that interval.
 */
type Stage = "closed" | "arming" | "open" | "leaving"

/**
 * Bottom sheet that tracks the finger.
 *
 * The grabber at the top is the drag target and says so — a light grey pill,
 * the one shape every phone user already knows means "pull this down". Dragging
 * is armed only from that zone and the header beneath it, so a long list inside
 * never fights the gesture: flinging a brand list upward has to scroll it, not
 * dismiss the sheet. Release past 30% of the height, or flick down, and it
 * goes; anything less springs back.
 *
 * From `md` up it renders as a centred modal with no drag — a mouse has no
 * business flinging a panel around.
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

  const [stage, setStage] = useState<Stage>("closed")
  // Read inside the effect below, which is keyed on `open` alone — the stage it
  // is transitioning FROM must not re-run it.
  const stageRef = useRef<Stage>("closed")
  stageRef.current = stage
  const leaveTimer = useRef(0)

  useEffect(() => {
    window.clearTimeout(leaveTimer.current)
    if (open) {
      // A sheet still on its way down already has its children mounted, so
      // there is nothing to arm: catch it and send it back up from wherever it
      // got to. Re-arming would blank it mid-slide.
      if (stageRef.current === "leaving") setStage("open")
      else if (stageRef.current !== "open") setStage("arming")
      return
    }
    if (stageRef.current === "closed") return
    setStage("leaving")
    leaveTimer.current = window.setTimeout(() => setStage("closed"), SHEET_MS)
  }, [open])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  /**
   * The frame between mounting the list and moving the panel.
   *
   * `offsetHeight` is read deliberately: a transition needs the browser to have
   * COMPUTED the starting value, and two style changes inside one frame are
   * otherwise collapsed into one — the sheet would appear in place rather than
   * slide. Forcing the flush here and setting the destination in the next frame
   * is the same two-step the sell sheet's own slide uses.
   */
  useLayoutEffect(() => {
    if (stage !== "arming") return
    void sheetRef.current?.offsetHeight
    const id = requestAnimationFrame(() => setStage((s) => (s === "arming" ? "open" : s)))
    return () => cancelAnimationFrame(id)
  }, [stage])

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
    // Downward follows the finger with slight resistance; upward is rubber-
    // banded rather than clamped dead — the sheet is already fully open, so
    // there is nowhere further to go, but a hard stop feels like a broken
    // gesture rather than the end of one.
    const dy = raw > 0 ? raw * 0.95 : Math.max(-28, raw * 0.16)
    const dt = e.timeStamp - d.lastT
    if (dt > 0) {
      // Exponentially smoothed so a single janky frame can't fake a flick.
      d.velocity = 0.6 * ((t.clientY - d.lastY) / dt) + 0.4 * d.velocity
    }
    d.dy = dy
    d.lastY = t.clientY
    d.lastT = e.timeStamp
    el.style.transform = `translate3d(0, ${dy}px, 0)`
    // The scrim thins as the sheet travels, so letting go mid-drag never
    // produces a jump from a stale full-dark overlay.
    if (scrimRef.current) {
      const h = el.offsetHeight || 1
      scrimRef.current.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / h))
    }
  }

  const onTouchEnd = () => {
    const d = drag.current
    const el = sheetRef.current
    if (!d.armed || !el) return
    d.armed = false
    const h = el.offsetHeight || 1
    // Clearing the inline value hands the scrim back to its class transition.
    if (scrimRef.current) scrimRef.current.style.transition = ""
    // A flick counts even from a short drag, but only with some real travel
    // behind it — the velocity estimate over the couple of milliseconds of a
    // sloppy tap is pure noise.
    el.style.transition = SHEET_TRANSITION
    if (d.dy > h * DISMISS_FRACTION || (d.velocity > FLICK_VELOCITY && d.dy > 12)) {
      el.style.transform = "translate3d(0, 100%, 0)"
      if (scrimRef.current) scrimRef.current.style.opacity = "0"
      // Nothing is hidden here. `leaving` is what keeps the sheet painted for
      // exactly as long as it is still moving, and it starts on this call.
      onClose()
    } else {
      el.style.transform = "translate3d(0, 0, 0)"
      if (scrimRef.current) scrimRef.current.style.opacity = "1"
      void triggerHaptic("light")
    }
  }

  const up = stage === "open"
  const painted = stage !== "closed"

  const panelStyle: React.CSSProperties = isDesktop
    ? {
        opacity: up ? 1 : 0,
        transform: up ? "translate3d(0, 0, 0)" : "translate3d(0, 12px, 0)",
        transition: `opacity 220ms ease, transform 320ms ${SHEET_EASE}`,
        // Opacity 0 already hides it, but a fully transparent element is still
        // a painted one. On a desktop that costs little; being consistent costs
        // less than remembering which of the two branches is the careful one.
        visibility: painted ? "visible" : "hidden",
        willChange: painted ? "transform, opacity" : "auto",
      }
    : {
        transform: up ? "translate3d(0, 0, 0)" : "translate3d(0, 100%, 0)",
        transition: SHEET_TRANSITION,
        // `arming` is deliberately NOT painted: the panel is parked below the
        // viewport during it and its shadow points up, so one visible frame
        // there is a black band across the bottom of the form.
        visibility: up || stage === "leaving" ? "visible" : "hidden",
        // Asked for before the movement starts and released when it is over —
        // a full-width layer built on the first frame of an animation is the
        // hitch at the beginning of it.
        willChange: painted ? "transform" : "auto",
      }

  const close = useCallback(() => {
    void triggerHaptic("light")
    onClose()
  }, [onClose])

  return (
    <div className={cn("fixed inset-0 z-[120]", !open && "pointer-events-none")} aria-hidden={!open}>
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-black/45 transition-opacity duration-300"
        style={{ opacity: up ? 1 : 0 }}
        onClick={close}
      />
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        className="absolute inset-x-0 bottom-0 flex max-h-[86vh] flex-col overflow-hidden rounded-t-[28px] bg-white pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-8px_40px_-8px_rgba(0,0,0,0.28)] md:inset-0 md:m-auto md:h-[70vh] md:max-w-lg md:rounded-[22px] md:pb-0"
        style={panelStyle}
      >
        {/* Only this zone arms the drag. The content below scrolls, and a sheet
            that dismisses itself when someone flings a long brand list towards
            the top is unusable. */}
        <div
          className="shrink-0 touch-none select-none"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {/* THE GRABBER. It is not decoration: this sheet can be pulled down,
              and the pill is the one shape that says so without a word, on
              every phone anybody has used. It is also the target — 36 by 5
              pixels of pill inside 22 pixels of tappable band, because the
              affordance and the hit area are not the same thing. */}
          <div className="flex h-[22px] items-end justify-center pb-[7px] md:hidden">
            <span aria-hidden className="h-[5px] w-9 rounded-full bg-neutral-300" />
          </div>

          {/* Title centred with the close on the right, the way a phone sheet
              is laid out — the title belongs to the sheet, not to the row of
              controls. The spacer keeps it optically centred against the
              button rather than shifted by its width. */}
          <div className="relative flex items-center justify-center px-14 pb-2.5 pt-1 md:px-14 md:pb-3 md:pt-3.5">
            <h2 className="min-w-0 truncate text-[16.5px] font-semibold tracking-[-0.015em] text-neutral-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={close}
              aria-label="Închide"
              className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-100 text-neutral-500 transition-[background-color,transform] duration-150 active:scale-[0.92] active:bg-neutral-200"
            >
              <X className="h-[17px] w-[17px]" strokeWidth={2.6} />
            </button>
          </div>
        </div>

        {/* A hairline, not a border on the header — so it sits under the
            grabber and the title as one edge rather than boxing them in. */}
        <div aria-hidden className="h-px shrink-0 bg-neutral-100" />

        {/* MOUNTED ONLY WHILE IT IS ON SCREEN. Eight of these live in the sell
            form; keeping their lists in the tree meant reconciling every
            category, every brand and thirty-one styles on every keystroke in
            the title field. */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{painted ? children : null}</div>
      </div>
    </div>
  )
}
