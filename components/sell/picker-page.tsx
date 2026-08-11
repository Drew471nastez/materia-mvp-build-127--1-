"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"

import { triggerHaptic } from "@/lib/native-bridge"
import { lockScroll } from "@/lib/scroll-lock"

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

/**
 * ===========================================================================
 *  AND THE LEVELS INSIDE IT PUSH TOO
 * ===========================================================================
 *
 * The category picker is three lists deep — who it is for, what kind of thing,
 * which thing — and moving between them was a content swap: the rows were
 * simply different on the next frame. That is the same hard cut the panel
 * itself used to be, one level down, and it is worse there because the chrome
 * does not move at all, so nothing on the screen says a navigation happened.
 *
 * So a level arrives the way the panel does. Forward, the new list comes in
 * from the right while the old one slides a quarter of the way left and dims;
 * back, exactly the reverse. Both layers are in the DOM for the length of it —
 * the outgoing one is a SNAPSHOT, the node that was live when the level
 * changed, which is why it can keep rendering rows for a state that has
 * already moved on.
 *
 * The live layer is never a snapshot, because ticking a row has to show on the
 * row you ticked. Only what is leaving is frozen.
 */
/* Matched to the panel's own out-and-in rather than shorter than both. A
   level that finishes moving before the header has caught up reads as two
   things happening, not one. */
const LEVEL_MS = 360
/** How far the outgoing list travels, and how far the incoming one comes from
 *  when going back. A quarter, not a whole screen: the layer underneath is
 *  meant to read as still being there. */
const LEVEL_SHIFT = "25%"
/* Raised from 0.55. A layer that dims almost to half reads as being taken
   away rather than as stepping back, and the point of a push is that what you
   came from is still there. */
const LEVEL_DIM = "0.62"

type Stage = "closed" | "arming" | "open" | "leaving"

export function PickerPage({
  open,
  title,
  onClose,
  onBack,
  level = "",
  depth = 0,
  sticky,
  children,
}: {
  open: boolean
  title: string
  onClose: () => void
  /** One level back inside the panel. Without it the arrow closes it. */
  onBack?: () => void
  /** Identity of the list currently showing. A change animates. */
  level?: string
  /** How deep that list is, which is the only way to know which way to move. */
  depth?: number
  /** Rendered above the levels and outside them — a search field belongs to the
   *  picker, not to whichever list it is filtering. */
  sticky?: () => React.ReactNode
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

  /**
   * THE PAGE BEHIND IS HELD UNTIL THE PANEL HAS ACTUALLY GONE.
   *
   * This was keyed on `open`, so the lock was released the instant the caller
   * flipped the flag — a third of a second BEFORE the panel finished sliding
   * off it. On iOS, restoring `overflow` re-establishes the document scroller
   * and snaps it back to where it was, which happens in full view through the
   * space the panel is vacating: the page behind visibly jumps while the
   * subpage is still travelling over it. Nothing about the transform was wrong;
   * what read as an unclean close was the scroller underneath it.
   *
   * Keyed on the STAGE instead, which stays non-closed for exactly as long as
   * the panel is on screen. Counted, because a sheet or an alert can be open
   * over this one — see lib/scroll-lock.
   */
  useEffect(() => {
    if (stage === "closed") return
    return lockScroll()
  }, [stage])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (onBack ?? onClose)()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
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

  /**
   * THE LEVEL STACK.
   *
   * `live` is recomputed every render, so ticking a row shows on the row you
   * ticked. `out` is a SNAPSHOT taken at the moment the level changed — the
   * node that was live one render ago — which is the only way a list can carry
   * on painting rows for a state that has already moved past it.
   *
   * Setting state during render is the sanctioned way to derive from a changed
   * prop: React re-runs the component immediately, and the guard makes the
   * second pass a no-op rather than a loop.
   */
  const live = painted ? children() : null
  const levelRef = useRef(level)
  const depthRef = useRef(depth)
  const lastNode = useRef<React.ReactNode>(null)
  const [out, setOut] = useState<{ key: string; node: React.ReactNode; forward: boolean } | null>(null)

  if (painted && level !== levelRef.current) {
    setOut({ key: levelRef.current, node: lastNode.current, forward: depth >= depthRef.current })
    levelRef.current = level
    depthRef.current = depth
  }
  lastNode.current = live

  const inRef = useRef<HTMLDivElement>(null)
  const outRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!out) return
    const i = inRef.current
    const o = outRef.current
    if (!i || !o) return
    const f = out.forward
    const move = `transform ${LEVEL_MS}ms ${EASE}, opacity ${LEVEL_MS}ms ${EASE}`

    i.style.transition = "none"
    i.style.transform = f ? "translate3d(100%, 0, 0)" : `translate3d(-${LEVEL_SHIFT}, 0, 0)`
    i.style.opacity = f ? "1" : LEVEL_DIM
    i.style.willChange = "transform, opacity"
    o.style.transition = "none"
    o.style.transform = "translate3d(0, 0, 0)"
    o.style.opacity = "1"
    o.style.willChange = "transform, opacity"
    // The start state has to be COMPUTED, or the browser collapses both style
    // changes into one frame and the lists simply swap.
    void i.offsetHeight

    const raf = requestAnimationFrame(() => {
      i.style.transition = move
      i.style.transform = "translate3d(0, 0, 0)"
      i.style.opacity = "1"
      o.style.transition = move
      o.style.transform = f ? `translate3d(-${LEVEL_SHIFT}, 0, 0)` : "translate3d(100%, 0, 0)"
      o.style.opacity = f ? LEVEL_DIM : "1"
    })
    const t = window.setTimeout(() => {
      // Handed back: a layer per level, held for the life of the form, is
      // memory the compositor cannot reuse.
      i.style.transition = ""
      i.style.transform = ""
      i.style.opacity = ""
      i.style.willChange = ""
      setOut(null)
    }, LEVEL_MS + 20)
    return () => {
      cancelAnimationFrame(raf)
      window.clearTimeout(t)
    }
  }, [out])

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
      /**
       * UNDER THE SITE HEADER ON A DESKTOP, OVER EVERYTHING ON A PHONE.
       *
       * At z-110 the picker covered the header at every width, so choosing a
       * brand on a monitor took the search, the categories and the account menu
       * off the screen — and this panel is a centred dialog there, not a
       * full-screen push, so there was no reason for it to.
       *
       * 35 sits above the sell form's own desktop layer (30) and below the
       * sticky header (40). On a phone it stays at 110, where covering
       * everything IS the behaviour: the picker is the screen.
       */
      className="fixed inset-0 z-[110] md:z-[35]"
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
            {/* KEYED ON THE TITLE, so React replaces the node and the CSS
                animation plays again. The header is the only chrome a subpage
                has, and a breadcrumb that swaps instantly while the list
                underneath it travels for a third of a second is the one part
                of the push that was still a cut. A rise rather than a slide:
                it is correct in both directions, and picking a side would be
                wrong half the time. */}
            <h1
              key={title}
              className="picker-title min-w-0 truncate text-[17px] font-semibold tracking-[-0.015em] text-neutral-900"
            >
              {title}
            </h1>
          </div>
        </header>

        {/* Above the levels and outside them: a search field belongs to the
            picker, not to whichever list it happens to be filtering, and it
            would otherwise slide off with the level it was sitting in. */}
        {painted && sticky ? <div className="shrink-0">{sticky()}</div> : null}

        <div className="relative min-h-0 flex-1 overflow-hidden">
          {out && (
            <div
              key={`out-${out.key}`}
              ref={outRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 overflow-hidden bg-white"
            >
              {out.node}
            </div>
          )}
          <div
            key={level}
            ref={inRef}
            className="absolute inset-0 overflow-y-auto overscroll-contain bg-white"
            // The list scrolls one way. Saying so lets the browser commit to
            // the gesture on the first touch instead of holding a frame to see
            // whether a horizontal pan is coming.
            style={{ touchAction: "pan-y" }}
          >
            {live}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
