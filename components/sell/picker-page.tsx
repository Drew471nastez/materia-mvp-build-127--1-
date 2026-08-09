"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"

import { triggerHaptic } from "@/lib/native-bridge"

/**
 * ===========================================================================
 *  A SUBPAGE, NOT A SHEET
 * ===========================================================================
 *
 * Category, brand, condition, size, colour, type, era and style were bottom
 * sheets. A sheet is the right shape for a short, self-contained decision that
 * belongs to the screen behind it — and none of these are that. Choosing a
 * category is three questions deep, choosing a brand means searching, and every
 * one of them is a step IN the task rather than an aside from it. A panel
 * covering two thirds of the screen, over a form you can still half see, is the
 * wrong promise for work that has its own back button.
 *
 * So they arrive the way a deeper screen arrives everywhere else on a phone:
 * in from the right, out to the right. Same direction, same curve and the same
 * durations as the checkout's subpages, because two grammars for "deeper into
 * the same task" inside one app is precisely what reads as unfinished.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THE TRANSITION ACTUALLY SMOOTH
 * ---------------------------------------------------------------------------
 * All of it was learned the hard way on the bottom sheet this replaces, and
 * none of it is optional:
 *
 *   `arming`   The panel exists off-screen for ONE frame before it moves, and
 *              its contents mount in that frame. A transition needs two frames
 *              — one showing the start, one showing the end — and mounting a
 *              hundred rows on the frame the transform starts spends the
 *              animation's opening on building DOM. `offsetHeight` is read
 *              deliberately in that frame, because two style changes inside one
 *              frame are otherwise collapsed into one and the panel appears in
 *              place rather than sliding.
 *
 *   `leaving`  It stays mounted, and painted, for exactly as long as it is
 *              still moving. Unmounting on close removes the element
 *              mid-animation, which is as abrupt as having no animation at all.
 *              And the slide out also gets its own clean frame, because closing
 *              is always triggered by a state change in the caller — picking a
 *              category re-renders the form that owns this — and a transition
 *              begins on the frame its starting value is computed.
 *
 *   portal     Declared inside the sell form, which is itself a full-screen
 *              fixed panel that runs its own transform animation. A `fixed`
 *              child of a transformed element is positioned against THAT
 *              element rather than the viewport and joins its compositing
 *              context: a layer inside a layer, clipped by an ancestor. At the
 *              top of the document it answers to the viewport and its transform
 *              is its own business.
 *
 *   thunk      `children` is a function. As a node, the caller has to BUILD the
 *              whole picker on every one of its own renders — a hundred and
 *              sixty React elements per keystroke in the title field, eight
 *              panels over, thrown away unread.
 *
 *   transform  And nothing else. Anything animating width, height, top, or
 *              opacity across a full-screen subtree drops the whole thing onto
 *              the main thread.
 */
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/**
 * Longer than they were, and not equal to each other.
 *
 * 340/280 was the right curve at the wrong length: fast enough that the panel
 * was simply THERE, which is the same information a hard cut carries. A push
 * has to be long enough to be read as travel. Arriving gets the full glide;
 * leaving is getting out of the way of a decision already made, so it is
 * quicker — the asymmetry is what stops the back gesture feeling sluggish at a
 * duration that is right for the way in.
 *
 * These are also the numbers `.sell-pushable` / `.sell-pushed` use in
 * globals.css, because the form behind travels with the panel and two
 * animations that are meant to be one movement have to end together.
 */
const IN_MS = 420
const OUT_MS = 360

/** How far in from the left edge a swipe-back may start. */
const EDGE_PX = 28
/** Release past this fraction of the width, or flick, to go back. */
const BACK_FRACTION = 0.32
const FLICK_VELOCITY = 0.45

type Stage = "closed" | "arming" | "open" | "leaving"

export function PickerPage({
  open,
  title,
  onClose,
  onBack,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  /** One level back inside the panel. Without it the arrow closes it. */
  onBack?: () => void
  children: () => React.ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  /**
   * A SUBPAGE ON A PHONE, A DIALOG ON A MONITOR.
   *
   * Sliding a full-screen panel in from the right is the grammar of a device
   * you hold in one hand and navigate a screen at a time. On a 27-inch monitor
   * it is a whole desktop being replaced to pick a colour — and there is no
   * back gesture there either, so the same panel would also be harder to leave.
   * Above md it is a centred dialog over a dimmed page, which is what it was
   * before and what the rest of the app's desktop dialogs are.
   *
   * The breakpoint has to be known in JS and not only in classes, because the
   * closed pose differs per mode and the transform is written inline.
   */
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)")
    const update = () => setIsDesktop(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [])

  const [stage, setStage] = useState<Stage>("closed")
  const stageRef = useRef<Stage>("closed")
  stageRef.current = stage
  const leaveTimer = useRef(0)

  useEffect(() => {
    window.clearTimeout(leaveTimer.current)
    if (open) {
      // Already on its way out: catch it and send it back where it came from.
      // Re-arming would blank it mid-slide, because `arming` is not painted.
      if (stageRef.current === "leaving") setStage("open")
      else if (stageRef.current !== "open") setStage("arming")
      return
    }
    if (stageRef.current === "closed") return
    const id = requestAnimationFrame(() => {
      setStage("leaving")
      leaveTimer.current = window.setTimeout(() => setStage("closed"), OUT_MS)
    })
    return () => cancelAnimationFrame(id)
  }, [open])

  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])

  useLayoutEffect(() => {
    if (stage !== "arming") return
    void panelRef.current?.offsetHeight
    const id = requestAnimationFrame(() => setStage((s) => (s === "arming" ? "open" : s)))
    return () => cancelAnimationFrame(id)
  }, [stage])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (onBack ?? onClose)()
    }
    window.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener("keydown", onKey)
    }
  }, [open, onBack, onClose])

  /**
   * SWIPE BACK FROM THE EDGE.
   *
   * The bottom sheet could be pulled down and this cannot, so without a gesture
   * the only way out of a picker would be a 40px arrow in the corner — on a
   * screen people reach one-handed, in the corner their thumb reaches last. An
   * edge swipe is the gesture the platform already trained them on.
   *
   * It arms only within 28 pixels of the left edge, so a finger anywhere else
   * scrolls the list exactly as it did. Everything is written straight to the
   * node and coalesced into a frame: touch events outrun the compositor, and a
   * setState per move would re-render the whole picker under the finger.
   */
  const drag = useRef({ armed: false, startX: 0, dx: 0, lastX: 0, lastT: 0, velocity: 0, width: 1 })
  const frameId = useRef(0)

  const paint = useCallback(() => {
    frameId.current = 0
    const d = drag.current
    const el = panelRef.current
    if (!d.armed || !el) return
    el.style.transform = `translate3d(${d.dx}px, 0, 0)`
  }, [])

  const onTouchStart = (e: React.TouchEvent) => {
    if (isDesktop) return
    const t = e.touches[0]
    if (t.clientX > EDGE_PX) return
    const el = panelRef.current
    drag.current = {
      armed: true,
      startX: t.clientX,
      dx: 0,
      lastX: t.clientX,
      lastT: e.timeStamp,
      velocity: 0,
      // Once. It cannot change while a finger is on the screen, and reading it
      // per move is a synchronous layout flush per move.
      width: el?.offsetWidth || 1,
    }
    if (el) el.style.transition = "none"
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const d = drag.current
    if (!d.armed) return
    const t = e.touches[0]
    const raw = t.clientX - d.startX
    // Rightward follows the finger; leftward is rubber-banded rather than
    // clamped dead, because a hard stop reads as a broken gesture.
    d.dx = raw > 0 ? raw : Math.max(-24, raw * 0.16)
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.velocity = 0.6 * ((t.clientX - d.lastX) / dt) + 0.4 * d.velocity
    d.lastX = t.clientX
    d.lastT = e.timeStamp
    if (!frameId.current) frameId.current = requestAnimationFrame(paint)
  }

  const onTouchEnd = () => {
    const d = drag.current
    const el = panelRef.current
    if (!d.armed || !el) return
    d.armed = false
    if (frameId.current) {
      cancelAnimationFrame(frameId.current)
      frameId.current = 0
    }
    el.style.transition = `transform ${OUT_MS}ms ${EASE}`
    if (d.dx > d.width * BACK_FRACTION || (d.velocity > FLICK_VELOCITY && d.dx > 16)) {
      el.style.transform = "translate3d(100%, 0, 0)"
      // Nothing is unmounted here. `leaving` is what keeps the panel painted
      // for exactly as long as it is still moving, and it starts on this call.
      ;(onBack ?? onClose)()
    } else {
      el.style.transform = "translate3d(0, 0, 0)"
      void triggerHaptic("light")
    }
  }

  useEffect(
    () => () => {
      if (frameId.current) cancelAnimationFrame(frameId.current)
    },
    [],
  )

  const up = stage === "open"
  const painted = stage !== "closed"

  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted || typeof document === "undefined") return null

  const panelStyle: React.CSSProperties = isDesktop
    ? {
        opacity: up ? 1 : 0,
        // The centring lives in the SAME declaration as the animation, because
        // an inline transform replaces the class one outright — a `-translate-
        // x-1/2` in the className would simply be gone, and the dialog would
        // open in the bottom-right quadrant.
        transform: up ? "translate(-50%, -50%)" : "translate(-50%, calc(-50% + 10px))",
        transition: `opacity 200ms ease, transform ${IN_MS}ms ${EASE}`,
        visibility: painted ? "visible" : "hidden",
        willChange: painted ? "transform, opacity" : "auto",
      }
    : {
        transform: up ? "translate3d(0, 0, 0)" : "translate3d(100%, 0, 0)",
        transition: `transform ${up ? IN_MS : OUT_MS}ms ${EASE}`,
        // `arming` is deliberately unpainted: the panel is parked off the right
        // edge during it, and a visible frame there is a flash at the margin.
        visibility: up || stage === "leaving" ? "visible" : "hidden",
        // Asked for before the movement starts and released when it is over: a
        // full-screen layer built on the first frame of an animation is the
        // hitch at the beginning of it.
        willChange: painted ? "transform" : "auto",
      }

  return createPortal(
    <div
      className="fixed inset-0 z-[110]"
      style={{ pointerEvents: open ? "auto" : "none" }}
      aria-hidden={!open}
    >
      {/* Desktop only. A phone subpage covers the screen completely, so there
          is nothing behind it to dim and a scrim would be an invisible layer
          composited on every frame of the slide. */}
      <div
        className="absolute inset-0 hidden bg-black/45 md:block"
        style={{
          opacity: up ? 1 : 0,
          transition: `opacity ${IN_MS}ms ${EASE}`,
          willChange: painted ? "opacity" : "auto",
        }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-0 flex flex-col bg-white md:inset-auto md:left-1/2 md:top-1/2 md:h-[72vh] md:w-full md:max-w-lg md:overflow-hidden md:rounded-[22px] md:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
        style={panelStyle}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {/* The same header as the form it came from — back arrow left, title
            centred — because a subpage that restyles the chrome is a subpage
            that reads as a different app. It pays the status-bar inset itself. */}
        <header
          className="relative shrink-0 border-b border-neutral-200/80 bg-white"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <div className="relative flex h-14 items-center justify-center px-14">
            <button
              type="button"
              onClick={() => {
                void triggerHaptic("light")
                ;(onBack ?? onClose)()
              }}
              aria-label="Înapoi"
              className="absolute left-1 flex h-11 w-11 items-center justify-center rounded-full text-neutral-900 transition-colors duration-150 active:bg-neutral-100 md:hover:bg-neutral-100"
            >
              <ChevronLeft className="h-[24px] w-[24px]" strokeWidth={2.3} />
            </button>
            <h1 className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.015em] text-neutral-900">
              {title}
            </h1>
          </div>
        </header>

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          // The list scrolls one way. Saying so lets the browser commit to the
          // gesture on the first touch instead of holding a frame to see
          // whether a horizontal pan is coming.
          style={{ touchAction: "pan-y" }}
        >
          {painted ? children() : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
