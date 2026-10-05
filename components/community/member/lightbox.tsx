"use client"

/**
 * ===========================================================================
 *  A POST'S PICTURES AND VIDEOS, ONE AT A TIME
 * ===========================================================================
 * Pressing a thumbnail in an opened post opens this over everything: the
 * picture as large as the screen allows on black, the post's other
 * pictures, GIFs and videos a swipe (or an arrow key, or the side buttons)
 * away. On a phone two fingers zoom and one finger then moves the picture;
 * a double tap zooms in and out; a swipe down closes. Escape, the close
 * button and the browser's Back close it too (it is one step of history,
 * useHistoryLayer), and the page under it never moves.
 *
 * Only the picture on screen and its two neighbours are mounted. Pictures
 * come through the image optimizer at the size the screen needs
 * (optimizedSrcSet), videos only start loading when pressed (StorelibVideo),
 * and a video by address only loads its player when pressed, or at once
 * when the viewer was opened by pressing that video (`autoplay`).
 *
 * Round 8: it is the community's one viewer for anything somebody presses
 * to look at, not only a post's grid: a picture or a video linked in a
 * comment, a chat, a message, the about page or a lesson's notes, a lesson's
 * picture file (media-viewer.tsx opens it from anywhere). A picture from a
 * member only route or a short lived signed address is shown as it is
 * (`raw`), never through the optimizer, and a video file by its address
 * plays in the browser's own player (`clip`).
 *
 * Round 9: the slider follows the finger and is let go like the app's
 * sheets, and the picture grows out of its thumbnail and back (THE SLIDER
 * below). Moves are compositor only (translate, scale, opacity and a clip, as Web
 * Animations), and with reduced motion nothing slides.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react"
import { StorelibVideo } from "@/components/video/storelib-video"
import { optimizedImageUrl, optimizedSrcSet } from "@/lib/images/optimized-url"
import { EMBED_NAMES, embedPlayerSrc, type ViewerItem } from "@/lib/communities/post-media"
import { SHEET_CLOSE_EASE, SHEET_EASE } from "@/components/ui/bottom-sheet"
import { ProviderMark } from "./media-providers"
/* The app's sheet arithmetic, so the slider is let go the way a sheet is (pure: no DOM, no React). */
import { curveCss, releaseVelocity, rubberBand, snapMotion, snapTarget, type Sample } from "@/components/website-builder/sheet-gestures"

/**
 * ONE STEP OF HISTORY FOR SOMETHING OPEN OVER THE PAGE. Opening pushes an
 * entry (at `url` when given, so the address shows what is open; the same
 * address otherwise); the browser's Back (or a phone's back swipe) closes
 * it; closing it any other way steps back over that entry, so Back after
 * closing goes where it went before. Layers nest: a lightbox over an opened
 * post is a second entry. The entry carries Next's own state with it, so
 * the router sees the page it already has and loads nothing.
 */
export function useHistoryLayer(open: boolean, onClose: () => void, url?: string | null): void {
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open || typeof window === "undefined") return
    const marker = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    let mine = true
    try {
      window.history.pushState({ ...(window.history.state ?? {}), storelibLayer: marker }, "", url || window.location.href)
    } catch {
      mine = false
    }
    const onPop = () => {
      if ((window.history.state as { storelibLayer?: string } | null)?.storelibLayer === marker) return
      mine = false
      close.current()
    }
    window.addEventListener("popstate", onPop)
    return () => {
      window.removeEventListener("popstate", onPop)
      if (mine && (window.history.state as { storelibLayer?: string } | null)?.storelibLayer === marker) window.history.back()
    }
  }, [open, url])
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const on = () => setReduced(mq.matches)
    on()
    mq.addEventListener("change", on)
    return () => mq.removeEventListener("change", on)
  }, [])
  return reduced
}

function reducedNow(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/** The open and the close, on iOS's curves (the app's sheets, bottom-sheet.tsx). */
const OPEN_MS = 300
const CLOSE_MS = 240
/** A press on an arrow, a key or a button slides this long. */
const STEP_MS = 280
const MAX_ZOOM = 4
/** A finger this far before the gesture is decided (sideways is the slider, down is closing). */
const SLOP = 8
/** Pulled down this far, or let go moving down this fast, it closes. */
const CLOSE_PULL = 110
const CLOSE_FLICK = 0.45
const SAMPLES = 12

/**
 * Where something is drawn, as the two properties that move it: `translate`
 * and `scale` (each its own CSS property, so the compositor moves it and
 * nothing is laid out again).
 */
type Pose = { translate: string; scale: string }
const pose = (x: number, y = 0, s = 1): Pose => ({ translate: `${x.toFixed(1)}px ${y.toFixed(1)}px`, scale: s.toFixed(4) })
const IDENTITY: Pose = { translate: "0px 0px", scale: "1" }
function put(el: HTMLElement, p: Pose | null): void {
  el.style.translate = p ? p.translate : ""
  el.style.scale = p ? p.scale : ""
}
/** Where the track rests for slide `i` of `n`: a share of its own width, so a resized window needs nothing redone. */
const rest = (i: number, n: number) => `${(-i * 100) / n}% 0`

/** The track's offset now, in pixels, a running slide included (its keyframes are in pixels). */
function readX(el: HTMLElement): number {
  const t = getComputedStyle(el).translate
  return !t || t === "none" ? 0 : parseFloat(t) || 0
}

/** An element on screen, as a rectangle, or null when it is not there to go back to. */
function onScreen(el: HTMLElement | null | undefined): DOMRect | null {
  if (!el || !el.isConnected) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth) return null
  return r
}

/**
 * How a picture at `to` (where it is laid out) has to be moved, scaled and
 * cropped to cover `from` (a thumbnail, cropped to fill): the same picture,
 * drawn where and as the thumbnail is. The crop is in the picture's own
 * pixels, before the scale.
 */
function coverFrom(from: DOMRect, to: DOMRect, radius: number): Pose & { clipPath: string } {
  const s = Math.max(from.width / to.width, from.height / to.height)
  const tx = from.left + from.width / 2 - (to.left + to.width / 2)
  const ty = from.top + from.height / 2 - (to.top + to.height / 2)
  const ix = Math.max(0, (to.width - from.width / s) / 2)
  const iy = Math.max(0, (to.height - from.height / s) / 2)
  return { ...pose(tx, ty, s), clipPath: `inset(${iy.toFixed(1)}px ${ix.toFixed(1)}px round ${(radius / s).toFixed(1)}px)` }
}

/**
 * ===========================================================================
 *  THE SLIDER (round 9)
 * ===========================================================================
 * The finger moves the row of pictures itself: each move writes the track's
 * position once per frame, straight to the element, and React draws
 * nothing while it moves. Let go, the row carries on at the finger's speed
 * and comes to rest on the picture it would have reached (the app's sheet
 * arithmetic, components/website-builder/sheet-gestures.ts: the release
 * speed over the last few samples, the projected stop, a curve that leaves
 * at that speed and only slows), at most one picture either way, with a
 * rubber band past the first and the last. A pull down moves the picture
 * with the finger, shrinking a little as the black thins, and closes past a
 * distance or a flick; short of that it springs back.
 *
 * The pictures either side of the one shown are mounted and loading, so a
 * swipe never lands on an empty slide. Opening grows the picture out of the
 * thumbnail that was pressed (when the caller says where it is: `originOf`)
 * and closing shrinks it back into it, cropped as the thumbnail is; with no
 * thumbnail on screen it fades. All of it is translate, scale, opacity and a clip,
 * as Web Animations, so it runs on the compositor whatever the page is
 * doing.
 */
export function Lightbox({
  items,
  start,
  communityId,
  onClose,
  autoplay = false,
  originOf,
}: {
  items: ViewerItem[]
  start: number
  communityId: string
  onClose: () => void
  autoplay?: boolean
  /** The thumbnail item `i` was opened from, to grow out of and go back into. */
  originOf?: (i: number) => HTMLElement | null
}) {
  const n = items.length
  const [index, setIndex] = useState(Math.max(0, Math.min(start, n - 1)))
  const [phase, setPhase] = useState<"opening" | "open" | "closing">("opening")
  const [zoom, setZoom] = useState({ s: 1, x: 0, y: 0 })
  const reduced = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const chromeRef = useRef<HTMLDivElement>(null)
  const indexRef = useRef(index)
  indexRef.current = index
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{ kind: "swipe" | "pan" | "pinch" | null; x0: number; y0: number; d0: number; s0: number; zx: number; zy: number; axis: "x" | "y" | null; base: number }>({ kind: null, x0: 0, y0: 0, d0: 0, s0: 1, zx: 0, zy: 0, axis: null, base: 0 })
  const samples = useRef<Sample[]>([])
  const drag = useRef({ x: 0, y: 0 })
  const raf = useRef<number | null>(null)
  const lastTap = useRef(0)
  const closing = useRef(false)
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })
  const originRef = useRef(originOf)
  originRef.current = originOf

  const width = () => rootRef.current?.clientWidth || window.innerWidth
  const media = (i: number) => trackRef.current?.querySelector<HTMLElement>(`[data-lightbox-slide="${i}"] [data-lightbox-media]`) ?? null

  /* One write a frame, whatever the finger sends. */
  const paint = useCallback(() => {
    raf.current = null
    const track = trackRef.current
    const stage = stageRef.current
    if (!track || !stage) return
    const { x, y } = drag.current
    track.style.translate = `${(-indexRef.current * width() + x).toFixed(1)}px 0`
    const down = Math.max(0, y)
    put(stage, down ? pose(0, down, 1 - Math.min(down, 400) / 2200) : null)
    const fade = Math.max(0, 1 - down / 420)
    if (backRef.current) backRef.current.style.opacity = String(fade)
    if (chromeRef.current) chromeRef.current.style.opacity = String(down ? Math.max(0, 1 - down / 120) : 1)
  }, [])
  const schedule = () => {
    if (raf.current == null) raf.current = requestAnimationFrame(paint)
  }

  /** The way out: into the thumbnail when it is on screen, a fade otherwise; from wherever the picture is now. */
  const finish = useCallback(() => {
    if (closing.current) return
    closing.current = true
    setPhase("closing")
    if (raf.current != null) cancelAnimationFrame(raf.current)
    raf.current = null
    const stage = stageRef.current
    const back = backRef.current
    const done = () => onCloseRef.current()
    if (!stage || !back || reducedNow() || typeof stage.animate !== "function") {
      window.setTimeout(done, reducedNow() ? 0 : CLOSE_MS)
      return
    }
    const i = indexRef.current
    const el = media(i)
    const now = el?.getBoundingClientRect()
    const target = zoomRef.current.s > 1 ? null : onScreen(originRef.current?.(i))
    const backFrom = Number(getComputedStyle(back).opacity)
    back.style.opacity = "0"
    back.animate([{ opacity: backFrom }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-out" })
    if (chromeRef.current) chromeRef.current.style.opacity = "0"
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      done()
    }
    window.setTimeout(end, CLOSE_MS + 200)
    if (el && now && now.width > 0 && target) {
      /* Where it is laid out, without the pull's move: the way back starts from where it is seen. */
      put(stage, null)
      const laid = el.getBoundingClientRect()
      const from = pose(now.left + now.width / 2 - (laid.left + laid.width / 2), now.top + now.height / 2 - (laid.top + laid.height / 2), now.width / laid.width)
      const to = coverFrom(target, laid, 12)
      put(el, to)
      el.style.clipPath = to.clipPath
      el.animate([{ ...from, clipPath: "inset(0px 0px round 0px)" }, to], { duration: CLOSE_MS, easing: SHEET_CLOSE_EASE }).onfinish = end
      return
    }
    const fromP: Pose = { translate: stage.style.translate || IDENTITY.translate, scale: stage.style.scale || IDENTITY.scale }
    const down = drag.current.y > 0
    stage.style.opacity = "0"
    stage.animate([{ opacity: 1, ...fromP }, { opacity: 0, ...(down ? pose(0, Math.max(drag.current.y, 0) + 160, 0.9) : pose(0, 0, 0.96)) }], { duration: CLOSE_MS, easing: SHEET_CLOSE_EASE }).onfinish = end
  }, [])

  useHistoryLayer(true, finish)

  /* The way in: out of the thumbnail, from the very first frame. */
  useLayoutEffect(() => {
    const stage = stageRef.current
    const back = backRef.current
    const opened = () => setPhase((p) => (p === "opening" ? "open" : p))
    if (!stage || !back || reducedNow() || typeof stage.animate !== "function") {
      opened()
      return
    }
    back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS - 60, easing: "ease-out" })
    chromeRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" })
    const el = media(index)
    const laid = el?.getBoundingClientRect()
    const from = onScreen(originRef.current?.(index))
    if (el && laid && laid.width > 0 && laid.height > 0 && from) {
      el.animate([coverFrom(from, laid, 12), { ...IDENTITY, clipPath: "inset(0px 0px round 0px)" }], { duration: OPEN_MS, easing: SHEET_EASE }).onfinish = opened
      return
    }
    stage.animate([{ opacity: 0, scale: "0.96" }, { opacity: 1, scale: "1" }], { duration: OPEN_MS - 60, easing: SHEET_EASE }).onfinish = opened
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** To slide `to`, from wherever the track is, leaving at `velocity` (px/ms) when a finger let it go. */
  const go = useCallback(
    (to: number, velocity = 0) => {
      const track = trackRef.current
      const target = Math.max(0, Math.min(n - 1, to))
      if (!track) return
      const w = width()
      const from = track.getAnimations().length ? readX(track) : -indexRef.current * w + drag.current.x
      for (const a of track.getAnimations()) a.cancel()
      drag.current = { x: 0, y: drag.current.y }
      const end = -target * w
      if (target !== indexRef.current) {
        setZoom({ s: 1, x: 0, y: 0 })
        setIndex(target)
      }
      track.style.translate = rest(target, n)
      if (reducedNow() || Math.abs(end - from) < 0.5 || typeof track.animate !== "function") return
      const motion = velocity ? snapMotion(end - from, velocity) : null
      track.animate([{ translate: `${from.toFixed(1)}px 0` }, { translate: `${end.toFixed(1)}px 0` }], motion ? { duration: motion.ms, easing: curveCss(motion.curve) } : { duration: STEP_MS, easing: SHEET_EASE })
    },
    [n],
  )

  /* Back to rest after a pull down that did not close. */
  const settleDown = (velocity: number) => {
    const stage = stageRef.current
    const back = backRef.current
    const y = drag.current.y
    drag.current = { x: drag.current.x, y: 0 }
    if (!stage || y <= 0) return
    const from: Pose = { translate: stage.style.translate || IDENTITY.translate, scale: stage.style.scale || IDENTITY.scale }
    put(stage, null)
    if (back) back.style.opacity = "1"
    if (chromeRef.current) chromeRef.current.style.opacity = "1"
    if (reducedNow() || typeof stage.animate !== "function") return
    const motion = snapMotion(-y, velocity)
    stage.animate([from, IDENTITY], { duration: motion.ms, easing: curveCss(motion.curve) })
    back?.animate([{ opacity: Math.max(0, 1 - y / 420) }, { opacity: 1 }], { duration: Math.min(motion.ms, 240), easing: "ease-out" })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        /* First, and marked: a sheet under the viewer (an opened post) leaves an Escape that was used alone. */
        e.preventDefault()
        e.stopPropagation()
        finish()
      } else if (e.key === "ArrowRight") go(indexRef.current + 1)
      else if (e.key === "ArrowLeft") go(indexRef.current - 1)
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [finish, go])

  /* The page under it stays still: before the first frame, so its restyle is not one of the opening's frames. */
  useLayoutEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(
    () => () => {
      if (raf.current != null) cancelAnimationFrame(raf.current)
    },
    [],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (closing.current) return
    if ((e.target as HTMLElement).closest("button, a, iframe, video, [data-lightbox-media-control]")) return
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const pts = [...pointers.current.values()]
    const z = zoomRef.current
    if (pts.length === 2 && items[indexRef.current]?.kind === "image") {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      /* A slide half way under the first finger goes back, and the two fingers zoom. */
      if (drag.current.x) go(indexRef.current)
      gesture.current = { kind: "pinch", x0: 0, y0: 0, d0: d || 1, s0: z.s, zx: z.x, zy: z.y, axis: null, base: 0 }
      return
    }
    if (pts.length === 1) {
      const now = Date.now()
      if (now - lastTap.current < 280 && items[indexRef.current]?.kind === "image") {
        lastTap.current = 0
        setZoom((zz) => (zz.s > 1 ? { s: 1, x: 0, y: 0 } : { s: 2.5, x: 0, y: 0 }))
        return
      }
      lastTap.current = now
      /* Caught mid-slide: the track stops where it is and the finger takes it from there. */
      const track = trackRef.current
      if (track?.getAnimations().length) {
        const x = readX(track)
        for (const a of track.getAnimations()) a.cancel()
        drag.current = { x: x + indexRef.current * width(), y: 0 }
        track.style.translate = `${x.toFixed(1)}px 0`
      }
      gesture.current = { kind: z.s > 1 ? "pan" : "swipe", x0: e.clientX, y0: e.clientY, d0: 0, s0: z.s, zx: z.x, zy: z.y, axis: null, base: drag.current.x }
      samples.current = [{ y: e.clientX, t: e.timeStamp || performance.now() }]
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const g = gesture.current
    if (g.kind === "pinch") {
      const pts = [...pointers.current.values()]
      if (pts.length < 2) return
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const s = Math.max(1, Math.min(MAX_ZOOM, g.s0 * (d / g.d0)))
      setZoom({ s, x: s === 1 ? 0 : g.zx, y: s === 1 ? 0 : g.zy })
    } else if (g.kind === "pan") {
      setZoom((z) => ({ ...z, x: g.zx + (e.clientX - g.x0), y: g.zy + (e.clientY - g.y0) }))
    } else if (g.kind === "swipe") {
      const dx = e.clientX - g.x0
      const dy = e.clientY - g.y0
      if (!g.axis && Math.hypot(dx, dy) > SLOP) g.axis = Math.abs(dx) > Math.abs(dy) || g.base !== 0 ? "x" : dy > 0 ? "y" : null
      if (!g.axis) return
      const t = e.timeStamp || performance.now()
      if (g.axis === "x") {
        let x = g.base + dx
        /* Past the first or the last picture the row gives, less and less, like a scroll view's edge. */
        const min = -(n - 1 - indexRef.current) * width()
        const max = indexRef.current * width()
        if (x > max) x = max + rubberBand(x - max, 120)
        else if (x < min) x = min - rubberBand(min - x, 120)
        drag.current = { x, y: 0 }
        samples.current.push({ y: e.clientX, t })
      } else {
        drag.current = { x: drag.current.x, y: Math.max(0, dy) }
        samples.current.push({ y: e.clientY, t })
      }
      if (samples.current.length > SAMPLES) samples.current.shift()
      schedule()
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (g.kind === "swipe" && g.axis) {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current)
        paint()
      }
      const v = e.type === "pointercancel" ? 0 : releaseVelocity(samples.current, e.timeStamp || performance.now())
      if (g.axis === "x") {
        const w = width()
        const at = indexRef.current
        const current = -at * w + drag.current.x
        /* Ascending by where the track would be (snapTarget's order): the next picture first. */
        const stops = [at + 1, at, at - 1].filter((i) => i >= 0 && i < n)
        const pick = snapTarget({ offsets: stops.map((i) => -i * w), current, velocity: v, totalDelta: drag.current.x - g.base })
        go(stops[pick], v)
      } else if (drag.current.y > CLOSE_PULL || (v > CLOSE_FLICK && drag.current.y > 24)) finish()
      else settleDown(v)
    } else if (g.kind === "swipe" && drag.current.x) {
      go(indexRef.current)
    }
    if (pointers.current.size === 0) {
      gesture.current = { ...g, kind: null, axis: null }
    } else if (g.kind === "pinch") {
      const [p] = [...pointers.current.values()]
      const z = zoomRef.current
      gesture.current = { kind: "pan", x0: p.x, y0: p.y, d0: 0, s0: z.s, zx: z.x, zy: z.y, axis: null, base: 0 }
    }
  }

  if (typeof document === "undefined" || !n) return null
  const ms = reduced ? 0 : 160

  return createPortal(
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label={items.some((i) => i.kind !== "image" && i.kind !== "gif") ? "Pictures and videos" : "Pictures"}
      data-lightbox=""
      data-lightbox-phase={phase}
      className="fixed inset-0 z-[160] touch-none select-none overflow-hidden overscroll-contain"
      style={phase === "closing" ? { pointerEvents: "none" } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div ref={backRef} aria-hidden className="absolute inset-0 bg-[#0b0c0f]/[0.94]" style={{ willChange: "opacity" }} onClick={finish} data-lightbox-back="" />
      <div ref={stageRef} className="absolute inset-0" data-lightbox-stage="">
        <div
          ref={trackRef}
          className="absolute inset-y-0 left-0 flex"
          data-lightbox-track=""
          style={{ width: `${n * 100}%`, translate: rest(index, n), willChange: "translate" }}
        >
          {items.map((item, i) => (
            <div key={i} className="relative flex h-full items-center justify-center px-0 sm:px-16" style={{ width: `${100 / n}%` }} onClick={(e) => e.target === e.currentTarget && finish()} data-lightbox-slide={i}>
              {Math.abs(i - index) <= 1 ? <Slide item={item} communityId={communityId} active={i === index} autoplay={autoplay && i === start} zoom={i === index ? zoom : null} /> : null}
            </div>
          ))}
        </div>
      </div>

      <div ref={chromeRef} className="pointer-events-none absolute inset-0" data-lightbox-chrome="">
        <div className="absolute inset-x-0 top-0 flex items-center justify-between px-2 pt-[max(8px,env(safe-area-inset-top))]">
          <span className="px-3 text-[13.5px] font-medium tabular-nums text-white/80" data-lightbox-count="">
            {n > 1 ? `${index + 1} / ${n}` : ""}
          </span>
          <button type="button" aria-label="Close" onClick={finish} className="pointer-events-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-white/90 outline-none transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/40" data-lightbox-close="">
            <X className="h-6 w-6" strokeWidth={2} />
          </button>
        </div>
        {n > 1 ? (
          <>
            <button type="button" aria-label="Previous" disabled={index === 0} onClick={() => go(index - 1)} className="pointer-events-auto absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 disabled:opacity-0 sm:flex" style={{ transition: `background-color ${ms}ms, opacity ${ms}ms` }} data-lightbox-prev="">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" aria-label="Next" disabled={index === n - 1} onClick={() => go(index + 1)} className="pointer-events-auto absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white outline-none hover:bg-white/20 disabled:opacity-0 sm:flex" style={{ transition: `background-color ${ms}ms, opacity ${ms}ms` }} data-lightbox-next="">
              <ChevronRight className="h-6 w-6" />
            </button>
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}

function Slide({ item, communityId, active, autoplay, zoom }: { item: ViewerItem; communityId: string; active: boolean; autoplay: boolean; zoom: { s: number; x: number; y: number } | null }) {
  /* The first slide plays at once only the first time it is shown; moving away and back waits for a press. */
  const [first, setFirst] = useState(autoplay)
  useEffect(() => {
    if (!active) setFirst(false)
  }, [active])
  if (item.kind === "image" || item.kind === "gif") {
    const shaped = !!(item.w && item.h)
    const own = item.kind === "image" && !item.raw
    const srcSet = own ? optimizedSrcSet(item.url, [640, 828, 1080, 1200, 1920, 2048]) : ""
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={own ? optimizedImageUrl(item.url, 1080) : item.url}
        srcSet={srcSet || undefined}
        sizes={srcSet ? "100vw" : undefined}
        alt=""
        draggable={false}
        decoding="async"
        /* The one shown first, its neighbours right behind it: all three load now, so a swipe never lands on an empty slide. */
        loading="eager"
        fetchPriority={active ? "high" : "low"}
        referrerPolicy={item.kind === "gif" ? "no-referrer" : undefined}
        width={item.w}
        height={item.h}
        className={shaped ? "block object-contain" : "max-h-[calc(100dvh-112px)] max-w-full object-contain"}
        style={{
          /* Its box is the picture, fitted to the screen before it has loaded, so the open can grow it out of the thumbnail from the first frame. */
          ...(shaped ? { width: `min(100%, calc((100dvh - 112px) * ${(item.w! / item.h!).toFixed(5)}))`, height: "auto", aspectRatio: `${item.w} / ${item.h}` } : null),
          ...(zoom ? { scale: String(zoom.s), translate: `${zoom.x}px ${zoom.y}px`, transition: "scale 120ms ease-out" } : null),
        }}
        data-lightbox-image=""
        data-lightbox-media=""
      />
    )
  }
  const box = "w-full max-w-[min(1100px,calc((100dvh-140px)*16/9))] overflow-hidden bg-black sm:rounded-xl"
  if (item.kind === "video") {
    return (
      <div className={box} data-lightbox-media-control="" data-lightbox-media="">
        <StorelibVideo communityId={communityId} videoId={item.videoId} poster={item.poster} key={active ? "on" : "off"} />
      </div>
    )
  }
  if (item.kind === "clip") {
    return (
      <div className={`${box} flex items-center justify-center`} data-lightbox-media-control="" data-lightbox-media="">
        {active ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video src={item.url} poster={item.poster} controls playsInline preload="metadata" autoPlay={first} className="max-h-[calc(100dvh-140px)] w-full bg-black" data-lightbox-clip="" />
        ) : null}
      </div>
    )
  }
  return (
    <div className={box} data-lightbox-media-control="" data-lightbox-media="">
      <EmbedPlayer key={active ? "on" : "off"} item={item} autoplay={active && first} posterWidth={960} />
    </div>
  )
}

/**
 * A YouTube, Vimeo or Loom video in a 16:9 box: its picture and a play
 * button, and the privacy player only once pressed (or at once with
 * `autoplay`), so a post with a video loads none of the site's page until
 * somebody asks. The site's mark sits in the poster's corner (round 12).
 */
export function EmbedPlayer({ item, autoplay = false, posterWidth = 720, className = "" }: { item: Extract<ViewerItem, { kind: "embed" }>; autoplay?: boolean; posterWidth?: number; className?: string }) {
  const [play, setPlay] = useState(autoplay)
  return (
    <div className={`relative aspect-video w-full overflow-hidden bg-black ${className}`} data-embed-player={item.provider} data-embed-state={play ? "playing" : "idle"}>
      {play ? (
        <iframe src={embedPlayerSrc(item)} title={item.title || `${EMBED_NAMES[item.provider]} video`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="absolute inset-0 h-full w-full border-0" />
      ) : (
        <button type="button" onClick={() => setPlay(true)} aria-label={item.title ? `Play ${item.title}` : `Play ${EMBED_NAMES[item.provider]} video`} className="group/play absolute inset-0 flex cursor-pointer items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60" data-embed-play="">
          <EmbedPosterFace item={item} posterWidth={posterWidth} />
        </button>
      )}
    </div>
  )
}

/** The poster alone, nothing to press (a comment still on its way). */
export function EmbedPoster({ item, posterWidth = 420 }: { item: Extract<ViewerItem, { kind: "embed" }>; posterWidth?: number }) {
  return (
    <div className="relative flex aspect-video w-full items-center justify-center overflow-hidden bg-black" data-embed-player={item.provider} data-embed-state="idle">
      <EmbedPosterFace item={item} posterWidth={posterWidth} />
    </div>
  )
}

function EmbedPosterFace({ item, posterWidth }: { item: Extract<ViewerItem, { kind: "embed" }>; posterWidth: number }) {
  return (
    <>
      {item.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={optimizedImageUrl(item.thumb, posterWidth)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <span className="absolute inset-0 bg-[#1f2230]" aria-hidden />
      )}
      <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-black/60 text-white transition-[scale] duration-150 group-hover/play:scale-105 motion-reduce:transition-none">
        <Play className="ml-1 h-6 w-6 fill-current" />
      </span>
      <span className="absolute bottom-2 left-2 inline-flex items-center gap-1.5 rounded-md bg-black/55 py-0.5 pl-1 pr-1.5 text-[11.5px] font-medium leading-5 text-white" aria-hidden data-embed-site="">
        <ProviderMark provider={item.provider} size={15} />
        {EMBED_NAMES[item.provider]}
      </span>
    </>
  )
}
