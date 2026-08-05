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
const CLOSE_MS = 240
/** How far a flick is projected past where the finger let go, per unit of
 *  velocity. Tuned so a lazy push and a hard flick both leave the screen at a
 *  speed that looks like the one you gave it. */
const FLICK_PROJECTION = 180
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
  posters,
  alt,
  onClose,
}: {
  /** One picture — what a conversation opens. */
  src?: string | null
  /** Several — what a listing's gallery opens. Takes precedence over `src`. */
  images?: string[] | null
  /** Which of `images` to open on. */
  index?: number
  /**
   * The already-decoded version of the photo being opened, if the caller has
   * one — typically `currentSrc` of the <img> that was tapped.
   *
   * A viewer that opens on a raw storage URL while the page behind it rendered
   * the same photograph through an image optimiser is opening a DIFFERENT
   * resource, at a different URL, none of it in cache. So the first thing you
   * see is black, for as long as a full-resolution original takes to arrive, on
   * a tap whose entire purpose is to look more closely at something already on
   * screen. Drawing the version the browser has already decoded costs nothing
   * and is instant; the full-size one replaces it when it lands.
   *
   * ONE PER PHOTO, positionally, and that matters: a single poster shown on
   * whichever slide you happen to be on is the picture you TAPPED drawn over a
   * different picture the moment you swipe. Every entry is optional, so a
   * caller that only has the one it opened on passes the rest as null and those
   * slides simply behave as they did.
   */
  posters?: (string | null)[] | null
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
  /** Which full-size photographs have decoded — a poster is removed when its
   *  own one has, never when a different slide's did. */
  const [full, setFull] = useState<Set<number>>(() => new Set())
  const markFull = useCallback((n: number) => {
    setFull((prev) => (prev.has(n) ? prev : new Set(prev).add(n)))
  }, [])

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

    /**
     * EVERYTHING THAT SURVIVES A CLOSE IS RESET HERE.
     *
     * The caller is supposed to mount this only while a photo is open, and all
     * three now do. But "supposed to" is not a mechanism, and the one call site
     * that kept it mounted permanently is where every one of these bugs was
     * found — so an open leaves nothing of the last one behind, whether the
     * instance is fresh or not.
     *
     * `resetView()` rather than assigning `view.current`, which is what this
     * used to do. Setting the ref alone changed the number and never repainted,
     * so the <img> kept the transform from the last time you pinched: close a
     * photograph while zoomed into its corner, open the next one, and it
     * appeared magnified and off-centre while the state said it was not.
     * resetView writes the identity transform to the node AND restores the
     * rail's overflow, which is set to hidden while zoomed so a pan is not also
     * a swipe — and which otherwise stayed hidden, leaving the next photo
     * unswipeable.
     *
     * `full` is which photographs have decoded, and it is why a poster is taken
     * down. Carried over, index 0 of the NEW photo is already "decoded", so its
     * poster never shows and you get the black frame the poster exists to
     * prevent — from the second photo onward, every time.
     */
    resetView()
    setFull(new Set())
    // The gesture machine too. `mode` is what every pointer handler branches
    // on, and a close landing mid-gesture — a fling is exactly that — leaves it
    // on "drag" or "pinch" with a stale origin. The next photo then starts its
    // first touch already believing it is halfway through the last one's.
    g.current.mode = "none"
    pts.current.clear()
    pendingDrag.current = null
    /**
     * THE LATCH THAT MADE THE SECOND PHOTO UNCLOSEABLE.
     *
     * `closing` guards against running the close twice, and it was set to true
     * and never set back. That is harmless where the viewer is mounted
     * conditionally and torn down with the ref inside it — a listing and a
     * profile both do that — and it is fatal in a conversation, which renders
     * `<ImageViewer src={viewing} />` permanently and merely passes null when
     * nothing is open. The component instance survives, so the ref survives:
     *
     *   open a photo, close it        closing := true, onClose fires, fine
     *   open a second photo           the same instance, closing still true
     *   try to close it               close() returns at the guard, every time
     *
     * The X does nothing, tapping the black does nothing, the back gesture
     * fires popstate which calls close() and also does nothing. A full-screen
     * layer over the app with no way out of it. That is "it doesn't close, it
     * stays blocked", and it is reproducible on the second photo you open in
     * any conversation.
     *
     * Opening is the moment the previous close is definitively over, so this is
     * where the latch is released.
     */
    closing.current = false
    // Positioned before paint, so the viewer is never seen on the wrong photo.
    if (rail) rail.scrollLeft = index * rail.clientWidth
    void rootRef.current?.offsetWidth
    openNow()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list[0]])

  /**
   * THE VIEWER'S OWN TRANSFORM IS NOT REACT'S TO WRITE.
   *
   * It used to be an inline style driven by a `phase` state, and that is what
   * made the dismiss jump: letting go fired `setPhase("gone")`, React
   * re-rendered, and the style attribute it wrote replaced the position the
   * finger had dragged the picture to. The photo teleported back to the centre
   * and only then faded — a snap in the middle of the one gesture that is
   * supposed to be continuous.
   *
   * So React renders the structure and nothing else about the movement. Every
   * frame of the open, the drag and the close is written to the node here,
   * which also means there is no render in the path of a gesture at all.
   */
  const closing = useRef(false)

  const paintFrame = useCallback((dx: number, dy: number, animate: number | null) => {
    const root = rootRef.current
    const scrim = scrimRef.current
    const chrome = chromeRef.current
    if (!root || !scrim) return
    // Up is damped to a third: there is nothing above to dismiss to, but a
    // picture that refuses to move at all reads as a dead gesture rather than
    // as a boundary.
    const travel = dy < 0 ? dy * 0.34 : dy
    const k = Math.min(1, Math.abs(travel) / 460)
    const ease = animate === null ? "none" : `transform ${animate}ms cubic-bezier(0.22, 0.9, 0.24, 1), opacity ${animate}ms ease-out`
    root.style.transition = ease
    scrim.style.transition = animate === null ? "none" : `opacity ${animate}ms ease-out`
    if (chrome) chrome.style.transition = scrim.style.transition
    root.style.transform = `translate3d(${dx * 0.55}px, ${travel}px, 0) scale(${1 - k * 0.16})`
    // The BACKDROP carries almost all of the fade and the picture almost none.
    // Fading the photograph itself as it leaves is what makes a dismiss feel
    // like a dialog closing rather than like a thing being thrown away — you
    // are moving an object, and objects do not become transparent when you push
    // them.
    scrim.style.opacity = String(Math.max(0, 1 - k * 0.9))
    if (chrome) chrome.style.opacity = String(Math.max(0, 1 - k * 1.6))
  }, [])

  /**
   * ONE STYLE WRITE PER FRAME, whatever the pointer does.
   *
   * `pointermove` is not capped at the refresh rate — a 120Hz phone delivers
   * moves faster than it paints, and coalesced events can arrive several at a
   * time. Writing the transform inside the handler therefore meant several
   * style recalculations per frame, all but the last of which were thrown away
   * before anything was drawn. That is invisible work that competes with the
   * frame you actually wanted.
   *
   * The latest position is kept and painted once, inside a frame callback, so
   * the write happens exactly when the compositor is about to use it and at
   * exactly the display's rate — 60 on a 60Hz screen, 120 on a 120Hz one.
   */
  const pendingDrag = useRef<{ dx: number; dy: number } | null>(null)
  const dragRaf = useRef(0)
  const flushDrag = useCallback(() => {
    dragRaf.current = 0
    const at = pendingDrag.current
    if (!at) return
    pendingDrag.current = null
    paintFrame(at.dx, at.dy, null)
  }, [paintFrame])

  const scheduleDrag = useCallback(
    (dx: number, dy: number) => {
      pendingDrag.current = { dx, dy }
      if (!dragRaf.current) dragRaf.current = requestAnimationFrame(flushDrag)
    },
    [flushDrag],
  )

  useEffect(() => () => cancelAnimationFrame(dragRaf.current), [])

  /** Promoted for the length of the gesture and no longer. A compositor layer
   *  held for the life of the screen is memory nobody asked for. */
  const promote = useCallback((on: boolean) => {
    const root = rootRef.current
    if (root) root.style.willChange = on ? "transform, opacity" : ""
  }, [])

  const openNow = useCallback(() => {
    const root = rootRef.current
    const scrim = scrimRef.current
    const chrome = chromeRef.current
    if (!root || !scrim) return
    root.style.transition = `transform ${OPEN_MS}ms cubic-bezier(0.22, 0.9, 0.24, 1), opacity ${OPEN_MS}ms ease-out`
    scrim.style.transition = `opacity ${OPEN_MS}ms ease-out`
    if (chrome) chrome.style.transition = scrim.style.transition
    root.style.transform = "translate3d(0, 0, 0) scale(1)"
    root.style.opacity = "1"
    scrim.style.opacity = "1"
    if (chrome) chrome.style.opacity = "1"
  }, [])

  /**
   * Close, optionally CARRYING ON from where the finger let go.
   *
   * A flick is thrown: the exit continues along the direction and at the speed
   * it was given, projected past the edge, over a duration that gets shorter
   * the harder you threw it. Anything else — the X, Escape, a tap on the black
   * — has no motion behind it, so it scales down in place, which is what a
   * dialog does.
   */
  const close = useCallback(
    (fling?: { dx: number; dy: number; v: number }) => {
      if (closing.current) return
      closing.current = true
      const root = rootRef.current
      const scrim = scrimRef.current
      const chrome = chromeRef.current
      if (fling && root && scrim) {
        const speed = Math.abs(fling.v)
        // Between a third of a second at rest and a tenth for a hard flick.
        const ms = Math.max(150, Math.min(320, 320 - speed * 90))
        const to = fling.dy + Math.sign(fling.dy || 1) * Math.max(200, speed * FLICK_PROJECTION)
        root.style.transition = `transform ${ms}ms cubic-bezier(0.2, 0.6, 0.2, 1), opacity ${ms}ms ease-out`
        scrim.style.transition = `opacity ${ms}ms ease-out`
        if (chrome) chrome.style.transition = scrim.style.transition
        root.style.transform = `translate3d(${fling.dx * 0.55}px, ${to}px, 0) scale(0.86)`
        root.style.opacity = "0"
        scrim.style.opacity = "0"
        if (chrome) chrome.style.opacity = "0"
        window.setTimeout(onClose, ms)
        return
      }
      if (root && scrim) {
        root.style.transition = `transform ${CLOSE_MS}ms cubic-bezier(0.3, 0, 0.6, 1), opacity ${CLOSE_MS}ms ease-in`
        scrim.style.transition = `opacity ${CLOSE_MS}ms ease-in`
        if (chrome) chrome.style.transition = scrim.style.transition
        root.style.transform = "translate3d(0, 0, 0) scale(0.94)"
        root.style.opacity = "0"
        scrim.style.opacity = "0"
        if (chrome) chrome.style.opacity = "0"
      }
      window.setTimeout(onClose, CLOSE_MS)
    },
    [onClose],
  )

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
    // NO HAPTIC HERE. Paging is a continuous gesture, not a decision — you
    // swipe through six photographs in three seconds and every one of them
    // buzzing turns the viewer into a rattle. Haptics are for the things that
    // COMMIT: the zoom toggling, the dismiss letting go. A vibration on every
    // frame of a scroll is a vibration that stops meaning anything.
  }, [list.length, resetView])

  /**
   * ROTATING THE PHONE LEFT THE RAIL BETWEEN TWO PHOTOGRAPHS.
   *
   * The rail is a scroll-snap track of full-width slides, and which photo you
   * are on is a scrollLeft in PIXELS. Rotate, and every slide is a different
   * number of pixels wide while scrollLeft is still the old one — so an offset
   * that was exactly photo 2 becomes somewhere in the middle of photo 1, and
   * the viewer sits showing the right-hand edge of one picture beside the
   * left-hand edge of the next.
   *
   * The comment on the rail claims the browser holds position through a
   * rotation. It holds the OFFSET; it cannot know that the offset meant "the
   * third photograph" — nothing told it that. So we re-derive it from the index
   * we already keep, on both the resize and the orientation change, because iOS
   * fires them at different moments and whichever lands second is the one that
   * has the final geometry.
   *
   * `behavior: instant` deliberately: a rotation is not a page change, and a
   * smooth scroll here would animate a photograph sideways for no reason as the
   * device settles.
   *
   * The zoom is reset too. A picture magnified to a corner of a portrait screen
   * is magnified to somewhere else entirely on a landscape one, and the pan
   * limits `setView` computes were measured against a box that no longer exists.
   */
  useEffect(() => {
    if (!open) return
    let raf = 0
    const reanchor = () => {
      cancelAnimationFrame(raf)
      // One frame later: on the resize event itself the new width is not
      // always committed yet, and anchoring to a stale clientWidth is the very
      // thing this exists to prevent.
      raf = requestAnimationFrame(() => {
        const rail = railRef.current
        if (!rail || rail.clientWidth === 0) return
        resetView()
        rail.scrollTo({ left: iRef.current * rail.clientWidth, behavior: "instant" as ScrollBehavior })
      })
    }
    window.addEventListener("resize", reanchor)
    window.addEventListener("orientationchange", reanchor)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", reanchor)
      window.removeEventListener("orientationchange", reanchor)
    }
  }, [open, resetView])

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

  /** Back to rest from wherever the finger left it — a spring, not a cut. */
  const releaseDrag = useCallback(() => {
    cancelAnimationFrame(dragRaf.current)
    dragRaf.current = 0
    pendingDrag.current = null
    paintFrame(0, 0, 340)
    const root = rootRef.current
    if (root) root.style.opacity = "1"
    window.setTimeout(() => promote(false), 360)
  }, [paintFrame, promote])

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
    if (s.mode === "watch" && Math.abs(dy) > 8) {
      s.mode = "drag"
      promote(true)
    }
    if (s.mode === "drag") scheduleDrag(dx, dy)
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
      cancelAnimationFrame(dragRaf.current)
      dragRaf.current = 0
      // Painted once more from the exact last sample, so the exit starts where
      // the finger actually was rather than one frame behind it.
      if (pendingDrag.current) {
        paintFrame(pendingDrag.current.dx, pendingDrag.current.dy, null)
        pendingDrag.current = null
      }
      // BOTH DIRECTIONS. Up is a dismiss too — it is the same gesture with the
      // same intent, and a viewer that only answers downwards is one you have
      // to learn rather than one you already know.
      if (Math.abs(s.dy) > DISMISS_AT || Math.abs(s.v) > DISMISS_V) {
        void triggerHaptic("light")
        close({ dx: s.dx, dy: s.dy < 0 ? s.dy * 0.34 : s.dy, v: s.v })
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
        className="absolute inset-0 bg-black"
        // Closed values only. Everything after this frame is written by
        // `openNow`, `paintFrame` and `close` — see the note on `closing`.
        style={{ opacity: 0 }}
      />

      <div
        ref={rootRef}
        className="absolute inset-0"
        style={{ transform: "translate3d(0, 0, 0) scale(0.94)", opacity: 0 }}
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
                className="relative flex h-full w-full shrink-0 snap-center items-center justify-center"
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
                {/* Underneath, and only until THIS photograph has decoded. */}
                {posters?.[n] && !full.has(n) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posters[n] as string}
                    alt=""
                    aria-hidden
                    draggable={false}
                    className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
                  />
                )}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={(el) => {
                    imgRefs.current[n] = el
                    // Belt and braces for a cached image. Measured in Chromium,
                    // `onLoad` does still fire for one — it is not complete at
                    // the moment this callback runs — so that is what carries
                    // it there. This exists for the engines where a cached
                    // decode can land before the listener is attached, because
                    // the failure is silent and permanent: a low-res poster
                    // left sitting on top of a full-size photograph that is
                    // ready and hidden. `complete` is the STATE rather than the
                    // notification, so reading it cannot miss anything.
                    if (el?.complete && el.naturalWidth > 0) markFull(n)
                  }}
                  onLoad={() => markFull(n)}
                  src={url}
                  alt={n === i ? alt || "Fotografie" : ""}
                  draggable={false}
                  decoding={n === i ? "sync" : "async"}
                  loading={Math.abs(n - i) <= 1 ? "eager" : "lazy"}
                  className={cn(
                    "relative max-h-full max-w-full select-none object-contain",
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
        style={{ opacity: 0 }}
      >
        <button
          type="button"
          aria-label="Închide"
          // Wrapped: `close` takes an optional fling, and handing it a mouse
          // event would be read as one.
          onClick={() => close()}
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
