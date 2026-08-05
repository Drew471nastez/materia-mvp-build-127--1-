"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * A photo, full size — in a conversation and on a listing.
 *
 * ---------------------------------------------------------------------------
 * Rewritten on the browser's own scroller, and that is the whole point
 * ---------------------------------------------------------------------------
 * The previous version drove paging itself: a flex track translated by
 * `-index * width`, an axis lock deciding on the tenth pixel whether a drag was
 * a page or a dismiss, a commit heuristic on release, a resize listener to
 * recompute every rail, and a zoom transform layered on top of all of it. Every
 * one of those is a piece of state that can disagree with the others, and the
 * symptoms were exactly what that looks like from outside: sometimes it opened,
 * sometimes it did not; sometimes the layout shifted; sometimes a swipe landed
 * between two photographs.
 *
 * None of that machinery is here any more. The strip is a horizontal scroller
 * with CSS scroll snapping, which is the same primitive the platform uses for
 * its own photo viewers. The browser owns momentum, the rubber band at the
 * ends, the snap, and the position through a resize or a rotation — and it
 * cannot desync from itself. Which photo you are on is READ from
 * `scrollLeft`, never stored and reconciled.
 *
 * What is left for this file is the part the browser has no opinion about:
 * zoom, the drag-down dismiss, and the entrance.
 *
 * ---------------------------------------------------------------------------
 * How the two gestures stay out of each other's way
 * ---------------------------------------------------------------------------
 * `touch-action: pan-x` on each slide gives the browser the horizontal axis and
 * keeps the vertical one for us, so a sideways swipe is a page and a downward
 * drag is a dismiss with nothing to arbitrate — the platform decides, at the
 * same threshold it uses everywhere else, which is why it feels native.
 *
 * Zoomed in, that reverses: the scroller is frozen (`overflow: hidden`) and the
 * slide takes `touch-action: none`, so one finger pans inside the picture and
 * two pinch it. Unfreezing restores the scroll position because it was never
 * given up — freezing a scroller does not move it.
 *
 * The double tap is measured from POINTER events, not from `click`. A click is
 * only dispatched if the engine decides the gesture was a tap, and a few pixels
 * of drift, a cancelled touch, or the second tap of a pair being swallowed as a
 * dblclick candidate each mean no click at all — so the gesture people try
 * first worked most of the time and, unpredictably, did not.
 */

const OPEN_MS = 260
const CLOSE_MS = 220
const MAX_SCALE = 4
const ZOOM_TO = 2.5
/** A dismiss: far enough, or fast enough. */
const DISMISS_AT = 110
const DISMISS_V = 0.55
/** A tap: brief, and it did not go anywhere. */
const TAP_MS = 250
const TAP_SLOP = 12
/** Two taps: close in time and in place. */
const DOUBLE_MS = 300
const DOUBLE_SLOP = 44

type View = { scale: number; x: number; y: number }
const IDENTITY: View = { scale: 1, x: 0, y: 0 }

export function ImageViewer({
  src,
  images,
  index = 0,
  alt,
  onClose,
}: {
  /** One picture — what a conversation opens. */
  src?: string | null
  /** Several — what a listing's gallery opens. Takes precedence over `src`. */
  images?: string[] | null
  /** Which of `images` to open on. */
  index?: number
  alt?: string
  onClose: () => void
}) {
  // One code path whatever the caller had: given a list of length one, paging
  // is impossible rather than special-cased.
  const list = useMemo(() => {
    const many = (images ?? []).filter((u): u is string => typeof u === "string" && u.length > 0)
    if (many.length > 0) return many
    return src ? [src] : []
  }, [images, src])
  const open = list.length > 0

  const rootRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])

  const [i, setI] = useState(index)
  const iRef = useRef(index)
  iRef.current = i
  const [zoomed, setZoomed] = useState(false)

  /**
   * Where the current picture is, written straight to the node.
   *
   * A pinch is two fingers changing three numbers sixty times a second. Through
   * React that is sixty renders of a full-screen photograph, which is exactly
   * how a viewer ends up feeling like a web page instead of a photo app.
   */
  const view = useRef<View>({ ...IDENTITY })
  const img = useCallback(() => imgRefs.current[iRef.current] ?? null, [])

  const paintView = useCallback(
    (animate: boolean) => {
      const el = img()
      if (!el) return
      el.style.transition = animate ? "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)" : "none"
      const v = view.current
      el.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
    },
    [img],
  )

  const setView = useCallback(
    (next: View, animate: boolean) => {
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale))
      const el = img()
      let { x, y } = next
      if (scale <= 1.001) {
        x = 0
        y = 0
      } else if (el) {
        // Past the edges there is nothing to look at, so panning stops where
        // the picture does.
        const maxX = ((scale - 1) * el.clientWidth) / 2
        const maxY = ((scale - 1) * el.clientHeight) / 2
        x = Math.max(-maxX, Math.min(maxX, x))
        y = Math.max(-maxY, Math.min(maxY, y))
      }
      view.current = { scale, x, y }
      paintView(animate)
      const on = scale > 1.001
      setZoomed(on)
      // Freeze the scroller while zoomed: a pan inside the picture must not
      // also be a swipe to the next one. It keeps its position — hiding
      // overflow does not scroll anything.
      const rail = railRef.current
      if (rail) rail.style.overflowX = on ? "hidden" : "auto"
    },
    [img, paintView],
  )

  const resetView = useCallback(() => {
    view.current = { ...IDENTITY }
    paintView(false)
    setZoomed(false)
    const rail = railRef.current
    if (rail) rail.style.overflowX = "auto"
  }, [paintView])

  // ── open, close ────────────────────────────────────────────────────────────

  /**
   * A LAYOUT effect, which cannot lose the race the old one lost.
   *
   * The portal is mounted by the same commit this runs in, so the refs are
   * attached and the browser has not painted yet. The previous version waited
   * for an animation frame instead and could run before the elements existed —
   * leaving a full-screen layer at opacity 0, invisible and swallowing taps,
   * which is "sometimes it opens and doesn't open".
   *
   * The reflow between the closed values and the open ones is what makes it a
   * transition rather than part of the first paint.
   */
  useLayoutEffect(() => {
    if (!open) return
    const rail = railRef.current
    iRef.current = index
    setI(index)
    view.current = { ...IDENTITY }
    setZoomed(false)
    // Positioned before paint, so the viewer is never seen on the wrong photo.
    if (rail) rail.scrollLeft = index * rail.clientWidth
    void rootRef.current?.offsetWidth
    setPhase("open")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list[0]])

  const [phase, setPhase] = useState<"closed" | "open" | "gone">("closed")

  const close = useCallback(() => {
    setPhase("gone")
    window.setTimeout(onClose, CLOSE_MS)
  }, [onClose])

  /**
   * Nothing behind it moves while it is up.
   *
   * A fixed layer over a page that can still scroll is a layer that moves: on a
   * phone, scrolling the document collapses the browser's own chrome, the
   * visual viewport changes height, and everything pinned to a corner shifts
   * while you are looking at a photograph. Both scrollers are locked, because
   * there are two — the document on the web, and the app shell in Capacitor,
   * where the document is clipped and `.marketing-flex-wrapper` is what scrolls.
   */
  useEffect(() => {
    if (!open) return
    const shell = document.querySelector<HTMLElement>(".marketing-flex-wrapper")
    const bodyPrev = document.body.style.overflow
    const shellPrev = shell?.style.overflow ?? ""
    document.body.style.overflow = "hidden"
    if (shell) shell.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = bodyPrev
      if (shell) shell.style.overflow = shellPrev
    }
  }, [open])

  // The phone's back gesture closes the picture, not the screen behind it.
  useEffect(() => {
    if (!open) return
    window.history.pushState({ viewer: true }, "")
    const onPop = () => close()
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (window.history.state?.viewer) window.history.back()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight") goTo(iRef.current + 1)
      else if (e.key === "ArrowLeft") goTo(iRef.current - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, close])

  // ── paging: read from the scroller, never stored ──────────────────────────

  const onRailScroll = useCallback(() => {
    const rail = railRef.current
    if (!rail || rail.clientWidth === 0) return
    const next = Math.round(rail.scrollLeft / rail.clientWidth)
    if (next === iRef.current || next < 0 || next >= list.length) return
    // Arriving at a new picture already magnified into somebody else's corner
    // is a viewer that has lost track of what you are looking at.
    resetView()
    iRef.current = next
    setI(next)
    void triggerHaptic("light")
  }, [list.length, resetView])

  const goTo = useCallback(
    (n: number) => {
      const rail = railRef.current
      if (!rail) return
      const clamped = Math.max(0, Math.min(list.length - 1, n))
      resetView()
      rail.scrollTo({ left: clamped * rail.clientWidth, behavior: "smooth" })
    },
    [list.length, resetView],
  )

  // ── the vertical gestures this file still owns ────────────────────────────

  const pts = useRef(new Map<number, { x: number; y: number }>())
  const g = useRef({
    mode: "none" as "none" | "watch" | "drag" | "pan" | "pinch",
    x0: 0,
    y0: 0,
    ox: 0,
    oy: 0,
    dy: 0,
    dx: 0,
    lastY: 0,
    lastT: 0,
    v: 0,
    downAt: 0,
    startDist: 0,
    startScale: 1,
  })
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  const spread = () => {
    const l = [...pts.current.values()]
    return l.length < 2 ? 0 : Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y)
  }

  /** Only the dismiss moves the whole viewer; paging never does. */
  const paintDrag = useCallback((dx: number, dy: number) => {
    const root = rootRef.current
    const scrim = scrimRef.current
    if (!root || !scrim) return
    const travel = dy < 0 ? dy * 0.3 : dy
    const scale = Math.max(0.82, 1 - Math.abs(travel) / 1400)
    root.style.transition = "none"
    scrim.style.transition = "none"
    root.style.transform = `translate3d(${dx * 0.5}px, ${travel}px, 0) scale(${scale})`
    scrim.style.opacity = String(Math.max(0, 1 - Math.abs(travel) / 420))
  }, [])

  const releaseDrag = useCallback(() => {
    const root = rootRef.current
    const scrim = scrimRef.current
    if (!root || !scrim) return
    root.style.transition = "transform 300ms cubic-bezier(0.32, 0.72, 0, 1)"
    scrim.style.transition = "opacity 300ms ease"
    root.style.transform = "translate3d(0, 0, 0) scale(1)"
    scrim.style.opacity = "1"
  }, [])

  const toggleZoom = useCallback(
    (cx: number, cy: number) => {
      void triggerHaptic("light")
      if (view.current.scale > 1.001) {
        setView({ ...IDENTITY }, true)
        return
      }
      const el = img()
      if (!el) return
      const r = el.getBoundingClientRect()
      const mx = r.left + r.width / 2
      const my = r.top + r.height / 2
      setView({ scale: ZOOM_TO, x: (mx - cx) * (ZOOM_TO - 1), y: (my - cy) * (ZOOM_TO - 1) }, true)
    },
    [img, setView],
  )

  const onDown = (e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = g.current
    if (pts.current.size === 2) {
      s.mode = "pinch"
      s.startDist = spread() || 1
      s.startScale = view.current.scale
      return
    }
    s.mode = view.current.scale > 1.001 ? "pan" : "watch"
    s.x0 = e.clientX
    s.y0 = e.clientY
    s.ox = view.current.x
    s.oy = view.current.y
    s.dx = 0
    s.dy = 0
    s.lastY = e.clientY
    s.lastT = performance.now()
    s.v = 0
    s.downAt = performance.now()
  }

  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId)) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const s = g.current

    if (s.mode === "pinch" && pts.current.size >= 2) {
      const d = spread() || 1
      setView({ ...view.current, scale: s.startScale * (d / s.startDist) }, false)
      return
    }

    const dx = e.clientX - s.x0
    const dy = e.clientY - s.y0
    s.dx = dx
    s.dy = dy
    const now = performance.now()
    if (now > s.lastT) s.v = (e.clientY - s.lastY) / (now - s.lastT)
    s.lastY = e.clientY
    s.lastT = now

    if (s.mode === "pan") {
      setView({ scale: view.current.scale, x: s.ox + dx, y: s.oy + dy }, false)
      return
    }

    // `touch-action: pan-x` means a horizontal gesture never reaches this
    // handler as a drag — the browser has already taken it for the scroller. So
    // anything that gets here and is moving vertically is a dismiss, and there
    // is no axis to arbitrate.
    if (s.mode === "watch" && Math.abs(dy) > 8) s.mode = "drag"
    if (s.mode === "drag") paintDrag(dx, dy)
  }

  const onUp = (e: React.PointerEvent) => {
    pts.current.delete(e.pointerId)
    const s = g.current

    if (s.mode === "pinch") {
      if (pts.current.size === 1) {
        const rest = [...pts.current.values()][0]
        s.mode = view.current.scale > 1.001 ? "pan" : "watch"
        s.x0 = rest.x
        s.y0 = rest.y
        s.ox = view.current.x
        s.oy = view.current.y
        return
      }
      // Under 1x it springs back rather than staying small.
      setView(view.current, true)
      s.mode = "none"
      return
    }
    if (pts.current.size > 0) return

    const brief = performance.now() - s.downAt < TAP_MS
    const still = Math.hypot(s.dx, s.dy) < TAP_SLOP
    if (brief && still && (s.mode === "watch" || s.mode === "pan")) {
      const prev = lastTap.current
      const now = performance.now()
      if (now - prev.t < DOUBLE_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_SLOP) {
        lastTap.current = { t: 0, x: 0, y: 0 }
        toggleZoom(e.clientX, e.clientY)
      } else {
        lastTap.current = { t: now, x: e.clientX, y: e.clientY }
      }
      s.mode = "none"
      return
    }

    if (s.mode === "drag") {
      if (s.dy > DISMISS_AT || s.v > DISMISS_V) {
        void triggerHaptic("light")
        close()
      } else {
        releaseDrag()
      }
    } else if (s.mode === "pan") {
      setView(view.current, true)
    }
    s.mode = "none"
  }

  /** Desktop: the wheel zooms, anchored under the cursor. */
  const onWheel = (e: React.WheelEvent) => {
    const el = img()
    if (!el) return
    e.preventDefault()
    const r = el.getBoundingClientRect()
    const mx = r.left + r.width / 2
    const my = r.top + r.height / 2
    const v = view.current
    const next = Math.min(MAX_SCALE, Math.max(1, v.scale * (1 - e.deltaY / 400)))
    const k = next / v.scale
    setView({ scale: next, x: v.x + (mx - e.clientX) * (k - 1), y: v.y + (my - e.clientY) * (k - 1) }, false)
  }

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[110]" role="dialog" aria-modal="true">
      <div
        ref={scrimRef}
        className="absolute inset-0 bg-black transition-opacity"
        style={{ opacity: phase === "open" ? 1 : 0, transitionDuration: `${phase === "open" ? OPEN_MS : CLOSE_MS}ms` }}
      />

      <div
        ref={rootRef}
        className="absolute inset-0"
        style={{
          transform: phase === "open" ? "translate3d(0,0,0) scale(1)" : "translate3d(0,0,0) scale(0.94)",
          opacity: phase === "open" ? 1 : 0,
          transition: `transform ${phase === "open" ? OPEN_MS : CLOSE_MS}ms cubic-bezier(0.32, 0.72, 0, 1), opacity ${
            phase === "open" ? OPEN_MS : CLOSE_MS
          }ms ease`,
          willChange: "transform, opacity",
        }}
      >
        {/* THE SCROLLER. Everything about moving between photographs is here,
            and all of it belongs to the browser: momentum, the snap, the rubber
            band at the ends, and holding position through a rotation. */}
        <div
          ref={railRef}
          onScroll={onRailScroll}
          className="viewer-rail h-full w-full overflow-x-auto overflow-y-hidden overscroll-contain"
          style={{ scrollSnapType: "x mandatory" }}
        >
          <div className="flex h-full w-full">
            {list.map((url, n) => (
              <div
                key={`${url}-${n}`}
                className="flex h-full w-full shrink-0 snap-center items-center justify-center"
                // The browser takes the horizontal axis and leaves us the
                // vertical one — until the picture is zoomed, when it takes
                // neither and every finger is ours.
                style={{ touchAction: zoomed && n === i ? "none" : "pan-x" }}
                onPointerDown={n === i ? onDown : undefined}
                onPointerMove={n === i ? onMove : undefined}
                onPointerUp={n === i ? onUp : undefined}
                onPointerCancel={n === i ? onUp : undefined}
                onWheel={n === i ? onWheel : undefined}
                onDoubleClick={n === i ? (e) => toggleZoom(e.clientX, e.clientY) : undefined}
                onClick={(e) => {
                  // Tapping the black closes it, and only the black: a click
                  // that came from the photograph is a tap on the photograph.
                  if (e.target === e.currentTarget) close()
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={(el) => {
                    imgRefs.current[n] = el
                  }}
                  src={url}
                  alt={n === i ? alt || "Fotografie" : ""}
                  draggable={false}
                  decoding={n === i ? "sync" : "async"}
                  loading={Math.abs(n - i) <= 1 ? "eager" : "lazy"}
                  className={cn(
                    "max-h-full max-w-full select-none object-contain",
                    n === i && "will-change-transform",
                    n === i ? (zoomed ? "cursor-zoom-out" : "cursor-zoom-in") : "cursor-default",
                  )}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* The chrome arrives WITH the photograph and leaves with it — it used to
          snap to full opacity over a picture still sliding in, and stay solid
          over one already leaving, which is two things on different rules in
          the same third of a second.

          `absolute inset-0` so it is the same box as the root and every offset
          resolves as written, and so it can carry a z-index at all: an
          unpositioned wrapper with an opacity of its own makes a stacking
          context but cannot be ordered, and the layer above would swallow the
          close button. Transparent to the pointer, with only the controls
          taking it back. */}
      <div
        ref={chromeRef}
        className="pointer-events-none absolute inset-0 z-30"
        style={{
          opacity: phase === "open" ? 1 : 0,
          transition: `opacity ${phase === "open" ? OPEN_MS : CLOSE_MS}ms ease`,
        }}
      >
        <button
          type="button"
          aria-label="Închide"
          onClick={close}
          className="no-tap-fade pointer-events-auto absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-transform active:scale-90"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <X className="h-5 w-5" />
        </button>

        {list.length > 1 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[12.5px] font-semibold tabular-nums text-white backdrop-blur-sm"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
          >
            {i + 1} / {list.length}
          </div>
        )}

        {list.length > 1 && (
          <>
            <Arrow side="left" disabled={i === 0} onClick={() => goTo(i - 1)} />
            <Arrow side="right" disabled={i === list.length - 1} onClick={() => goTo(i + 1)} />
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Arrow({ side, disabled, onClick }: { side: "left" | "right"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Fotografia anterioară" : "Fotografia următoare"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pointer-events-auto absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm transition-all md:flex",
        "hover:bg-white/25 active:scale-90 disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {side === "left" ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
    </button>
  )
}
