"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, X } from "lucide-react"
import { triggerHaptic } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"

/**
 * A photo, full size — in a conversation and on a listing.
 *
 * Tapping a picture and having nothing happen is the single most obvious thing
 * missing from either. In a chat, half the photos people send are a label, a
 * stain or a serial number, and a 240px bubble is not enough to answer the
 * question they were sent to answer. On a listing it is worse: the whole
 * decision to spend money on a second-hand coat is made by looking closely at
 * photographs of it, and the gallery would not let you.
 *
 * ---------------------------------------------------------------------------
 * The three gestures, and why one pointer means two different things
 * ---------------------------------------------------------------------------
 * At 1x a drag is either "put this away" (down) or "show me the next one"
 * (sideways), decided once, on the first ten pixels, and then held for the rest
 * of that touch. Zoomed in, the same drag is "look over there" — there is
 * nothing to dismiss and nothing to page to, because you are inside one
 * picture. Two pointers are always a pinch. Double tap toggles between the two
 * worlds.
 *
 * None of it goes through React: the transforms and the backdrop's opacity are
 * written straight to the nodes. Sixty state updates a second holding a
 * full-screen photograph is exactly the shape of a viewer that stutters.
 *
 * ---------------------------------------------------------------------------
 * Why the double tap is measured from pointer events
 * ---------------------------------------------------------------------------
 * It used to be counted in `onClick`, and that is a dependency on an event the
 * browser synthesises at its own discretion. A click is only dispatched if the
 * engine decides the gesture was a tap — a few pixels of thumb drift, a
 * cancelled touch, or the second tap of a double being swallowed as a
 * dblclick candidate each mean no click at all. So the gesture people try
 * FIRST worked most of the time and, unpredictably, did not. Pointer events are
 * dispatched whatever the gesture turns out to be, so the tap is counted from
 * what the finger actually did: down and up within 250ms, having moved less
 * than 12px, twice inside 300ms and within 44px of each other.
 */

const SPRING = "transform 320ms cubic-bezier(0.32, 0.72, 0, 1), opacity 320ms ease"
/** Paging is shorter and firmer than the dismiss: it is a change of subject, not
 *  a release, and it must land before the eye goes looking for the next photo. */
const PAGE_SPRING = "transform 300ms cubic-bezier(0.22, 0.9, 0.28, 1)"
const DISMISS_AT = 110
const DISMISS_VELOCITY = 0.6
const MAX_SCALE = 4
/** Past this the axis of a drag is settled, and it does not change again. */
const AXIS_LOCK = 10
/** A tap: brief, and it did not go anywhere. */
const TAP_MS = 250
const TAP_SLOP = 12
/** Two taps: close together in time, and in the same place. */
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
  // One code path, whatever the caller had. A viewer that only knows how to
  // page when it was given an array is two viewers with one name; given a list
  // of length one, paging is simply impossible rather than special-cased.
  const list = useMemo(() => {
    const many = (images ?? []).filter((u): u is string => typeof u === "string" && u.length > 0)
    if (many.length > 0) return many
    return src ? [src] : []
  }, [images, src])
  const open = list.length > 0

  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  /** The close button, the counter and the arrows. See `settle`. */
  const chromeRef = useRef<HTMLDivElement>(null)
  const imgRefs = useRef<(HTMLImageElement | null)[]>([])
  const [i, setI] = useState(index)
  const iRef = useRef(index)
  iRef.current = i

  /**
   * Where the picture is, in one object, written straight to the node.
   *
   * A zoom is two fingers changing three numbers sixty times a second. Through
   * React that is sixty renders of a full-screen photograph, which is precisely
   * how a viewer ends up feeling like a web page rather than a photo app — so
   * the transform is composed here and applied to the element, and React is only
   * told when the gesture ENDS and something durable has changed.
   */
  const view = useRef<View>({ ...IDENTITY })
  const [zoomed, setZoomed] = useState(false)

  const currentImg = useCallback(() => imgRefs.current[iRef.current] ?? null, [])

  const paint = useCallback(
    (animate: boolean) => {
      const img = currentImg()
      if (!img) return
      const v = view.current
      img.style.transition = animate ? SPRING : "none"
      img.style.transform = `translate3d(${v.x}px, ${v.y}px, 0) scale(${v.scale})`
    },
    [currentImg],
  )

  const setView = useCallback(
    (next: View, animate: boolean) => {
      // Clamped here rather than at every call site, so no gesture can leave the
      // picture smaller than the frame or dragged off the edge of it.
      const scale = Math.min(MAX_SCALE, Math.max(1, next.scale))
      const img = currentImg()
      let { x, y } = next
      if (scale <= 1.001) {
        x = 0
        y = 0
      } else if (img) {
        // Past the edges there is nothing to look at, so panning stops where the
        // picture does.
        const maxX = ((scale - 1) * img.clientWidth) / 2
        const maxY = ((scale - 1) * img.clientHeight) / 2
        x = Math.max(-maxX, Math.min(maxX, x))
        y = Math.max(-maxY, Math.min(maxY, y))
      }
      view.current = { scale, x, y }
      paint(animate)
      setZoomed(scale > 1.001)
    },
    [currentImg, paint],
  )

  /** Where the track sits for a given index, in pixels. */
  const railFor = useCallback((n: number) => -n * (stageRef.current?.clientWidth ?? 0), [])

  const placeTrack = useCallback(
    (px: number, animate: boolean) => {
      const track = trackRef.current
      if (!track) return
      track.style.transition = animate ? PAGE_SPRING : "none"
      track.style.transform = `translate3d(${px}px, 0, 0)`
    },
    [],
  )

  /**
   * Move to another photo.
   *
   * The zoom is reset on the way, and it has to be: arriving at a new picture
   * already magnified 2.5× and panned to somebody else's corner is a viewer
   * that has lost track of what you are looking at. Reset BEFORE the index
   * changes, so it lands on the image being left rather than on the one
   * arriving — the arriving one is at identity already and would only be
   * animated away from it.
   */
  const goTo = useCallback(
    (n: number, animate = true) => {
      const clamped = Math.max(0, Math.min(list.length - 1, n))
      if (view.current.scale > 1.001) setView({ ...IDENTITY }, false)
      if (clamped !== iRef.current) void triggerHaptic("light")
      iRef.current = clamped
      setI(clamped)
      placeTrack(railFor(clamped), animate)
    },
    [list.length, placeTrack, railFor, setView],
  )

  /**
   * Where the picture actually is when a dismiss drag ends.
   *
   * A ref rather than state because it is written on every pointermove — sixty
   * times a second — and the only thing that ever reads it is the dismiss
   * animation, one frame later. Reset on every open so a viewer never inherits
   * the last one's ending position.
   */
  const drop = useRef({ x: 0, y: 0, scale: 1 })

  const settle = useCallback(
    (to: "open" | "gone") => {
      const stage = stageRef.current
      const scrim = scrimRef.current
      const chrome = chromeRef.current
      if (!stage || !scrim) return
      stage.style.transition = SPRING
      scrim.style.transition = SPRING
      // The chrome arrives WITH the photograph and leaves with it.
      //
      // It used to be outside the animation entirely, so a close button and a
      // counter snapped to full opacity over a picture that was still sliding
      // in, and stayed solid over one that was already leaving. Two things
      // moving to different rules in the same 300ms is what reads as the layout
      // shifting around the X.
      if (chrome) {
        chrome.style.transition = SPRING
        chrome.style.opacity = to === "open" ? "1" : "0"
      }
      if (to === "open") {
        drop.current = { x: 0, y: 0, scale: 1 }
        stage.style.transform = "translate3d(0, 0, 0) scale(1)"
        stage.style.opacity = "1"
        scrim.style.opacity = "1"
      } else {
        // FROM WHERE THE FINGER LEFT IT, not from a canonical position.
        //
        // This used to animate to a fixed `translate3d(0, 60px)` whatever the
        // drag had done — so letting go 200px down snapped the photo back UP to
        // 60 and then faded it, and a flick sideways teleported it back to
        // centre first. That contradiction between the gesture and what follows
        // it is the whole of "it feels cheap": the picture stops being the
        // thing you were holding.
        //
        // Continuing 140px past wherever it already is, on the axis it was
        // already travelling, is what makes the release read as letting go of
        // something rather than as an animation starting.
        const from = drop.current
        stage.style.transform = `translate3d(${from.x}px, ${from.y + 140}px, 0) scale(${Math.max(0.7, from.scale - 0.08)})`
        stage.style.opacity = "0"
        scrim.style.opacity = "0"
      }
    },
    [],
  )

  const close = useCallback(() => {
    settle("gone")
    window.setTimeout(onClose, 260)
  }, [onClose, settle])

  /**
   * OPEN, DETERMINISTICALLY.
   *
   * This used to set a `shown` flag, wait for the next animation frame, and
   * only then write the opening transform — which is a race against React's
   * commit. The portal is mounted by that same state change, so the frame
   * callback could run before the refs it needs exist; `settle` found them null
   * and returned, and the viewer stayed at the closed values it was born with:
   * a full-screen layer at opacity 0, invisible and swallowing taps. That is
   * "sometimes it opens and does not open".
   *
   * A LAYOUT effect cannot lose that race. It runs after React has attached the
   * refs and before the browser paints, so the element is guaranteed to be
   * there. The reflow between the two writes is what makes the transition
   * start: it commits the closed values as the computed ones, so changing them
   * on the next line is a change the browser animates rather than a value it
   * folds together with the initial paint.
   */
  useLayoutEffect(() => {
    if (!open) return
    view.current = { ...IDENTITY }
    setZoomed(false)
    iRef.current = index
    setI(index)
    placeTrack(railFor(index), false)
    // Commit the closed state, then leave it — see above.
    void stageRef.current?.offsetWidth
    settle("open")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, list[0]])

  /**
   * Nothing behind it moves while it is up.
   *
   * The viewer is a fixed layer over a page that could still scroll, and on a
   * phone that is not a cosmetic problem: scrolling the document collapses and
   * expands the browser's own chrome, the visual viewport changes height, and
   * every fixed thing in here — the close button most visibly, because it is
   * pinned to the top corner — moves while you are looking at a photograph.
   * That is the shifting layout with the X in it.
   *
   * Both scrollers are locked, because there are two: the document on the web,
   * and the app shell in Capacitor, where the document is clipped and
   * `.marketing-flex-wrapper` is the thing that actually scrolls.
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

  // A rotation or a resized window moves every rail by a different amount, and
  // the track is positioned in pixels — so without this the strip ends up
  // showing two half photos side by side.
  useEffect(() => {
    if (!open) return
    const onResize = () => placeTrack(railFor(iRef.current), false)
    window.addEventListener("resize", onResize)
    window.addEventListener("orientationchange", onResize)
    return () => {
      window.removeEventListener("resize", onResize)
      window.removeEventListener("orientationchange", onResize)
    }
  }, [open, placeTrack, railFor])

  // The phone's back gesture closes the picture, not the conversation.
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

  // Arrow keys and Escape, because on a desktop a gallery without them is a
  // gallery you have to use a mouse for.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      else if (e.key === "ArrowRight") goTo(iRef.current + 1)
      else if (e.key === "ArrowLeft") goTo(iRef.current - 1)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, close, goTo])

  // ---- gestures -------------------------------------------------------------
  const pts = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef({
    mode: "none" as "none" | "undecided" | "dismiss" | "page" | "pan" | "pinch",
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    rail: 0,
    lastY: 0,
    lastX: 0,
    lastT: 0,
    v: 0,
    vx: 0,
    dy: 0,
    dx: 0,
    downAt: 0,
    downX: 0,
    downY: 0,
  })
  /** The previous tap, for working out whether this one is the second of a pair. */
  const lastTap = useRef({ t: 0, x: 0, y: 0 })

  const centreOf = () => {
    const l = [...pts.current.values()]
    if (!l.length) return { x: 0, y: 0 }
    return { x: l.reduce((a, p) => a + p.x, 0) / l.length, y: l.reduce((a, p) => a + p.y, 0) / l.length }
  }
  const spreadOf = () => {
    const l = [...pts.current.values()]
    if (l.length < 2) return 0
    return Math.hypot(l[0].x - l[1].x, l[0].y - l[1].y)
  }

  /** Double tap, and double click: the one gesture everybody tries first. */
  const toggleZoom = useCallback(
    (clientX: number, clientY: number) => {
      const img = currentImg()
      if (!img) return
      void triggerHaptic("light")
      if (view.current.scale > 1.001) {
        setView({ ...IDENTITY }, true)
        return
      }
      const rect = img.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const target = 2.5
      // Zoom towards what was tapped, not towards the middle.
      setView({ scale: target, x: (cx - clientX) * (target - 1), y: (cy - clientY) * (target - 1) }, true)
    },
    [currentImg, setView],
  )

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    const stage = stageRef.current
    if (stage) stage.style.transition = "none"
    if (trackRef.current) trackRef.current.style.transition = "none"
    if (scrimRef.current) scrimRef.current.style.transition = "none"
    const img = imgRefs.current[iRef.current]
    if (img) img.style.transition = "none"

    if (pts.current.size === 2) {
      g.mode = "pinch"
      g.startDist = spreadOf() || 1
      g.startScale = view.current.scale
      const c = centreOf()
      g.originX = c.x
      g.originY = c.y
      g.startX = view.current.x
      g.startY = view.current.y
      return
    }
    // Zoomed in there is nothing to decide: one finger pans.
    g.mode = view.current.scale > 1.001 ? "pan" : "undecided"
    g.startX = e.clientX
    g.startY = e.clientY
    g.originX = view.current.x
    g.originY = view.current.y
    g.rail = -iRef.current * (stageRef.current?.clientWidth ?? 0)
    g.lastY = e.clientY
    g.lastX = e.clientX
    g.lastT = performance.now()
    g.v = 0
    g.vx = 0
    g.dy = 0
    g.dx = 0
    g.downAt = performance.now()
    g.downX = e.clientX
    g.downY = e.clientY
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pts.current.has(e.pointerId)) return
      pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      const g = gesture.current
      const stage = stageRef.current
      const scrim = scrimRef.current
      if (!stage || !scrim) return

      if (g.mode === "pinch" && pts.current.size >= 2) {
        const dist = spreadOf() || 1
        const scale = g.startScale * (dist / g.startDist)
        const c = centreOf()
        // The point under the fingers stays under the fingers: without
        // anchoring, a pinch zooms towards the middle of the image and whatever
        // you were actually looking at slides away from you.
        setView({ scale, x: g.startX + (c.x - g.originX), y: g.startY + (c.y - g.originY) }, false)
        return
      }

      const dx = e.clientX - g.startX
      const dy = e.clientY - g.startY
      g.dx = dx
      g.dy = dy

      const now = performance.now()
      const dt = now - g.lastT
      if (dt > 0) {
        g.v = (e.clientY - g.lastY) / dt
        g.vx = (e.clientX - g.lastX) / dt
      }
      g.lastY = e.clientY
      g.lastX = e.clientX
      g.lastT = now

      if (g.mode === "pan") {
        setView({ scale: view.current.scale, x: g.originX + dx, y: g.originY + dy }, false)
        return
      }

      // ONE DECISION, ONCE. A drag that re-picks its axis mid-gesture is a
      // photo that starts sliding sideways, changes its mind and falls
      // downwards — which is what an inbox row does when its swipe is fighting
      // the scroller, and the reason that rule exists there too.
      if (g.mode === "undecided") {
        if (Math.hypot(dx, dy) < AXIS_LOCK) return
        g.mode = Math.abs(dx) > Math.abs(dy) && list.length > 1 ? "page" : "dismiss"
      }

      if (g.mode === "page") {
        // Resisted at the two ends rather than stopped. A strip that will not
        // move says "there is nothing there" far more clearly than one that
        // simply ignores you.
        const atEnd = (iRef.current === 0 && dx > 0) || (iRef.current === list.length - 1 && dx < 0)
        placeTrack(g.rail + (atEnd ? dx * 0.32 : dx), false)
        return
      }

      // BOTH AXES. A dismiss drag that only moves vertically is a picture stuck
      // on a rail: your finger goes one way and the photo goes another, which
      // is the single clearest tell that a gesture is being interpreted rather
      // than followed.
      //
      // Upward travel is damped to a third because there is nothing up there to
      // dismiss to; sideways is damped a little as well, so the drag still
      // reads as being ABOUT going down.
      const travel = dy < 0 ? dy * 0.3 : dy
      const slide = dx * 0.6
      const scale = Math.max(0.72, 1 - Math.abs(travel) / 1200)
      drop.current = { x: slide, y: travel, scale }
      stage.style.transform = `translate3d(${slide}px, ${travel}px, 0) scale(${scale})`
      scrim.style.opacity = String(Math.max(0, 1 - Math.abs(travel) / 420))
    },
    [list.length, placeTrack, setView],
  )

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      pts.current.delete(e.pointerId)
      const g = gesture.current

      if (pts.current.size === 1 && g.mode === "pinch") {
        // One finger lifted mid-pinch — carry on as a pan from where it is.
        const remaining = [...pts.current.values()][0]
        g.mode = "pan"
        g.startX = remaining.x
        g.startY = remaining.y
        g.originX = view.current.x
        g.originY = view.current.y
        return
      }
      if (pts.current.size > 0) return

      if (g.mode === "pinch") {
        // Under 1x it springs back rather than staying small.
        setView(view.current, true)
        g.mode = "none"
        return
      }

      // A TAP — measured from the pointer, not from a click the browser may
      // never dispatch. See the note at the top of this file.
      const brief = performance.now() - g.downAt < TAP_MS
      const still = Math.hypot(e.clientX - g.downX, e.clientY - g.downY) < TAP_SLOP
      if ((g.mode === "undecided" || g.mode === "pan") && brief && still) {
        const prev = lastTap.current
        const now = performance.now()
        if (now - prev.t < DOUBLE_MS && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_SLOP) {
          lastTap.current = { t: 0, x: 0, y: 0 }
          toggleZoom(e.clientX, e.clientY)
        } else {
          lastTap.current = { t: now, x: e.clientX, y: e.clientY }
        }
        // Whatever the drag had started to do, undo it: a tap moved the picture
        // by a few pixels at most and it must end up exactly where it began.
        if (g.mode === "undecided") settle("open")
        g.mode = "none"
        return
      }

      if (g.mode === "page") {
        const w = stageRef.current?.clientWidth ?? 1
        // A third of the width, or any real flick. The velocity term is what
        // makes a quick short swipe work — insisting on distance alone means
        // paging only responds to slow, deliberate drags, which is the opposite
        // of how anybody flicks through photographs.
        const far = Math.abs(g.dx) > w / 3
        const fast = Math.abs(g.vx) > 0.45
        const dir = g.dx < 0 ? 1 : -1
        goTo(far || fast ? iRef.current + dir : iRef.current)
        g.mode = "none"
        return
      }

      if (g.mode === "dismiss") {
        if (g.dy > DISMISS_AT || g.v > DISMISS_VELOCITY) {
          void triggerHaptic("light")
          close()
        } else {
          settle("open")
        }
      } else if (g.mode === "pan") {
        setView(view.current, true)
      }
      g.mode = "none"
    },
    [close, goTo, settle, setView, toggleZoom],
  )

  /** Desktop: the wheel zooms, anchored under the cursor. */
  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      const img = currentImg()
      if (!img) return
      const rect = img.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const v = view.current
      const next = Math.min(MAX_SCALE, Math.max(1, v.scale * (1 - e.deltaY / 400)))
      const k = next / v.scale
      // Both axes by the same rule. The x term used to be an unreadable
      // expression with `cx` added and subtracted from itself twice over, and
      // it did not compute the same thing as the y one — so zooming with a
      // wheel drifted sideways while holding its vertical anchor, which reads
      // as the picture sliding out from under the cursor.
      setView(
        { scale: next, x: v.x + (cx - e.clientX) * (k - 1), y: v.y + (cy - e.clientY) * (k - 1) },
        false,
      )
    },
    [currentImg, setView],
  )

  if (!open || typeof document === "undefined") return null

  return createPortal(
    <div className="fixed inset-0 z-[110] overflow-hidden" role="dialog" aria-modal="true">
      <div ref={scrimRef} className="absolute inset-0 bg-black" style={{ opacity: 0 }} onClick={close} />

      {/* `absolute inset-0` so it is the same box as the root and every offset
          below resolves exactly as it did — and so it can carry a z-index at
          all. An unpositioned wrapper with an opacity of its own creates a
          stacking context but cannot be ordered, so the stage that follows it
          in the DOM would paint on top and the close button would stop being
          clickable. Transparent to the pointer, with only the controls
          themselves taking it back, so none of this is in the way of a drag. */}
      <div ref={chromeRef} className="pointer-events-none absolute inset-0 z-30" style={{ opacity: 0 }}>
        <button
          type="button"
          aria-label="Închide"
          onClick={close}
          className="pointer-events-auto absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition-transform active:scale-90"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <X className="h-5 w-5" />
        </button>

        {list.length > 1 && (
          <div
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-black/45 px-2.5 py-1 text-[12.5px] font-semibold text-white tabular-nums backdrop-blur-sm"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
          >
            {i + 1} / {list.length}
          </div>
        )}

        {/* Arrows on a pointer device only. On a phone they would sit under the
            thumb that is already swiping. */}
        {list.length > 1 && (
          <>
            <Arrow side="left" disabled={i === 0} onClick={() => goTo(i - 1)} />
            <Arrow side="right" disabled={i === list.length - 1} onClick={() => goTo(i + 1)} />
          </>
        )}
      </div>

      {/* The stage carries the dismiss; the track inside it carries the paging.
          Two transforms on two elements rather than one composed by hand: they
          are driven by different gestures at different moments, and composing
          them would mean every drag having to know what the other one had
          already done to the matrix. */}
      <div
        ref={stageRef}
        className="absolute inset-0"
        style={{ transform: "translate3d(0, 60px, 0) scale(0.92)", opacity: 0, willChange: "transform, opacity" }}
      >
        <div ref={trackRef} className="flex h-full w-full will-change-transform">
          {list.map((url, n) => (
            <div
              key={`${url}-${n}`}
              // Tapping the black closes it. The stage now covers the whole
              // viewport — it has to, because the strip slides across it — so
              // the scrim underneath can no longer be reached, and without this
              // the one gesture everybody uses to dismiss a full-screen photo
              // stopped working the moment paging was added. `e.target === e.currentTarget`
              // is what keeps it to the empty space: a click that came from the
              // photograph itself is a tap on the photograph.
              onClick={(e) => {
                if (e.target === e.currentTarget) close()
              }}
              className="flex h-full w-full shrink-0 items-center justify-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => {
                  imgRefs.current[n] = el
                }}
                src={url}
                alt={n === i ? alt || "Fotografie" : ""}
                // Only the photo you are on answers the finger. Without this a
                // drag begun on the sliver of the next picture showing at the
                // edge mid-swipe would pan a photo that is not on screen.
                onPointerDown={n === i ? onPointerDown : undefined}
                onPointerMove={n === i ? onPointerMove : undefined}
                onPointerUp={n === i ? onPointerUp : undefined}
                onPointerCancel={n === i ? onPointerUp : undefined}
                onWheel={n === i ? onWheel : undefined}
                onDoubleClick={n === i ? (e) => toggleZoom(e.clientX, e.clientY) : undefined}
                draggable={false}
                // `decoding="sync"` on the one being looked at: an async decode
                // is what makes a paged photo appear a beat after it arrives.
                decoding={n === i ? "sync" : "async"}
                loading={Math.abs(n - i) <= 1 ? "eager" : "lazy"}
                className={cn(
                  "max-h-[88vh] max-w-[94vw] select-none rounded-lg object-contain",
                  n === i && "will-change-transform",
                  n === i ? (zoomed ? "cursor-zoom-out" : "cursor-zoom-in") : "cursor-default",
                )}
                style={{ touchAction: "none" }}
              />
            </div>
          ))}
        </div>
      </div>

    </div>,
    document.body,
  )
}

function Arrow({
  side,
  disabled,
  onClick,
}: {
  side: "left" | "right"
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={side === "left" ? "Fotografia anterioară" : "Fotografia următoare"}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "pointer-events-auto absolute top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/12 text-white backdrop-blur-sm transition-all md:flex",
        "hover:bg-white/20 active:scale-90 disabled:pointer-events-none disabled:opacity-0",
        side === "left" ? "left-4" : "right-4",
      )}
    >
      {side === "left" ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
    </button>
  )
}
