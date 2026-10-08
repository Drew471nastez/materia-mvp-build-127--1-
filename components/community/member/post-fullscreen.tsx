"use client"

/**
 * ===========================================================================
 *  A POST, OPENED ON A PHONE: THE CARD GROWS INTO THE SCREEN
 * ===========================================================================
 * Round 19, the owner: "get rid of the bottom sheet for a post on a phone.
 * Tapping a post morphs it into a full screen page, like a Substack note; a
 * swipe down or the back button morphs it back into the card, smoothly. The
 * comment box is a floating bar at the bottom, on the keyboard when it is
 * up, and the comments scroll under it. At the top, as you scroll, a soft
 * blur comes in under the status bar."
 *
 * THE MORPH (round 22, the owner: "I don't like the morph, it glitches").
 * It was a clip-path opening from the card's box. WebKit does not run a
 * clip-path animation on the compositor: every frame repainted the whole
 * screen of post and pictures on the main thread, so it stuttered whenever
 * the page was busy, and the corner rounding the swipe wrote per touch move
 * repainted again. Now only translate, scale and opacity move. The page is a white
 * box that grows from the card's box to the screen (translate and scale),
 * and the post inside it is scaled back by the inverse on the same frame,
 * so the words never stretch: they ride from where the card's words were
 * to their place. Both are sampled from iOS's curve into keyframes (an
 * inverse of an eased scale is not itself an eased scale, so one easing on
 * each would wobble), played linear. The post fades in over the card in the
 * first quarter; closing runs the same backwards to wherever the card is
 * now, the post fading out over the card in the last stretch. A card no
 * longer on screen gets a short drop and fade instead. The feed dims a
 * little and comes back.
 *
 * THE SWIPE. With the post at its top, a finger pulling down takes the page
 * with it from the first pixel (the browser's own scroll is refused for that
 * gesture, so iOS cannot bounce the content under the finger). It shrinks a
 * little as it goes, as an iOS card does, and the dim lifts: a move and a
 * scale per touch move, nothing repainted. Let go far enough, or moving down fast
 * enough, and it morphs back into the card from where it was let go;
 * otherwise it springs back. A pull that reaches the end of the comments is
 * held too, so it never scrolls the feed under the page.
 *
 * THE TOP. A strip as tall as the status bar and the back button, with a
 * light backdrop blur (6px, a thin white) that fades out downwards (a mask),
 * whose opacity follows the scroll over the first 80px and stops at 85%:
 * nothing over the post at rest, a soft hint under the clock once it moves.
 *
 * THE BOTTOM. The comment box is the comments section's own (comments.tsx
 * floatComposer): sticky at the foot of the page's scroll, a frosted pill,
 * with the comments scrolling under it. The page is the height of what is
 * on screen (--vv-h, --vv-top), so with the keyboard up the pill sits on it.
 *
 * Everything that moves is translate, scale and opacity, written by Web
 * Animations or once per touch event: nothing goes through React while it
 * moves. Reduced motion: it appears and goes, no morph.
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"

const OPEN_MS = 420
/** How long the open waits for the post's pictures to decode before it moves anyway. */
const DECODE_WAIT_MS = 140
const CLOSE_MS = 340
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)"
/** The back button's row under the status bar. */
const BAR_PX = 52
/** Pulled this far, or let go moving down this fast (px/ms), it closes. */
const CLOSE_PULL = 120
const CLOSE_FLICK = 0.5
/** How far the scroll goes before the top blur is all the way in. */
const BLUR_IN_PX = 80
/** All the way in, the blur is this strong: a hint under the clock, not a frosted bar (round 20, the owner: "too heavy"). */
const BLUR_MAX = 0.85

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/**
 * The height of the bar at the top, status bar included, in px: the inner box's own top padding, read from its computed
 * style. No element is added to the page to measure it (round 21: a probe appended on the open forced a second layout of
 * the whole page in the tap's first frame).
 */
function topBarPx(inner: HTMLElement): number {
  return parseFloat(getComputedStyle(inner).paddingTop) || BAR_PX
}

/** Where the card is now, if it is on screen at all. */
function cardBox(origin: (() => HTMLElement | null) | undefined): DOMRect | null {
  const el = origin?.()
  if (!el || !el.isConnected) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) return null
  return rect
}

/** cubic-bezier(x1, y1, x2, y2) as a function of time, solved for x by Newton then bisection. */
function bezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const ax = 3 * x1 - 3 * x2 + 1, bx = 3 * x2 - 6 * x1, cx = 3 * x1
  const ay = 3 * y1 - 3 * y2 + 1, by = 3 * y2 - 6 * y1, cy = 3 * y1
  const x = (u: number) => ((ax * u + bx) * u + cx) * u
  const y = (u: number) => ((ay * u + by) * u + cy) * u
  const dx = (u: number) => (3 * ax * u + 2 * bx) * u + cx
  return (t) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let u = t
    for (let i = 0; i < 6; i++) {
      const d = dx(u)
      if (Math.abs(d) < 1e-6) break
      const next = u - (x(u) - t) / d
      if (next < 0 || next > 1) break
      u = next
    }
    if (Math.abs(x(u) - t) > 1e-4) {
      let lo = 0, hi = 1
      u = t
      for (let i = 0; i < 24; i++) {
        if (x(u) < t) lo = u
        else hi = u
        u = (lo + hi) / 2
      }
    }
    return y(u)
  }
}
const ease = bezier(0.32, 0.72, 0, 1)
/** Keyframes per morph: enough that the counter-scale stays exact between them. */
const STEPS = 24

/** The page's box (page coordinates: 0,0 is the page's own top left) and how large its post is drawn. */
type Shape = { left: number; top: number; right: number; bottom: number; scale: number; anchorX: number; anchorY: number }

/**
 * Where the page goes, and its post, for one shape. The page is drawn W by H and moved and scaled onto the shape's box
 * (origin top left); the post (`inner`, inside the page's scroll, which is at `scrollTop`) is scaled back by the inverse
 * and moved so its point (0, `bar`), the top of the post, lands on (anchorX, anchorY) at `scale`.
 */
type Move = { translate: string; scale: string }
function placement(sh: Shape, W: number, H: number, bar: number, scrollTop: number): { page: Move; inner: Move } {
  const sx = Math.max(0.001, (sh.right - sh.left) / W)
  const sy = Math.max(0.001, (sh.bottom - sh.top) / H)
  const ax = sh.scale / sx
  const ay = sh.scale / sy
  /* translate and scale as their own properties: scale applies first, about the top left, then the move. */
  const ix = (sh.anchorX - sh.left) / sx
  const iy = (sh.anchorY - sh.top) / sy + scrollTop - ay * bar
  return {
    page: { translate: `${sh.left}px ${sh.top}px`, scale: `${sx} ${sy}` },
    inner: { translate: `${ix}px ${iy}px`, scale: `${ax} ${ay}` },
  }
}
const REST: Move = { translate: "0px 0px", scale: "1" }
function put(el: HTMLElement | null, m: Move | null) {
  if (!el) return
  el.style.translate = m ? m.translate : ""
  el.style.scale = m ? m.scale : ""
}

function mix(a: Shape, b: Shape, k: number): Shape {
  const m = (x: number, y: number) => x + (y - x) * k
  return { left: m(a.left, b.left), top: m(a.top, b.top), right: m(a.right, b.right), bottom: m(a.bottom, b.bottom), scale: m(a.scale, b.scale), anchorX: m(a.anchorX, b.anchorX), anchorY: m(a.anchorY, b.anchorY) }
}

/** The page whole and in place. */
function fullShape(W: number, H: number, bar: number, scrollTop: number): Shape {
  return { left: 0, top: 0, right: W, bottom: H, scale: 1, anchorX: 0, anchorY: bar - scrollTop }
}

/** The page on the card: its box the card's, its post's top on the card's top. */
function cardShape(card: DOMRect, pageTop: number): Shape {
  return { left: card.left, top: card.top - pageTop, right: card.right, bottom: card.bottom - pageTop, scale: 1, anchorX: card.left, anchorY: card.top - pageTop }
}

/** Where a swipe has the page: down by `dy`, shrunk by `s` about its top centre. */
function pulledShape(dy: number, s: number, W: number, H: number, bar: number, scrollTop: number): Shape {
  const left = (W * (1 - s)) / 2
  return { left, top: dy, right: left + W * s, bottom: dy + H * s, scale: s, anchorX: left, anchorY: dy + s * (bar - scrollTop) }
}

/** How much a pull of `dy` shrinks the page (an iOS card: a little, never below 0.9). */
function pullScale(dy: number, H: number): number {
  return 1 - Math.min(1, Math.max(0, dy) / Math.max(1, H)) * 0.1
}

/** Keyframes for page and post from `a` to `b` on iOS's curve, to be played linear. */
function morphFrames(a: Shape, b: Shape, W: number, H: number, bar: number, scrollTop: number): { page: Keyframe[]; inner: Keyframe[] } {
  const page: Keyframe[] = []
  const inner: Keyframe[] = []
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    const f = placement(mix(a, b, ease(t)), W, H, bar, scrollTop)
    page.push({ ...f.page, offset: t })
    inner.push({ ...f.inner, offset: t })
  }
  return { page, inner }
}

export interface PostFullscreenProps {
  open: boolean
  label: string
  title: string
  /** The card it grows from and goes back into. */
  origin?: () => HTMLElement | null
  /** Asked to close (the back button, a swipe, Escape): the parent sets `open` false. */
  onRequestClose: () => void
  /** The open has arrived. */
  onShown: () => void
  /** It has gone: the parent takes it out. */
  onGone: () => void
  contentRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

export function PostFullscreen({ open, label, title, origin, onRequestClose, onShown, onGone, contentRef, children }: PostFullscreenProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  /* A white ground behind the page once it has arrived (see IN), dropped for a swipe and a close. */
  const groundRef = useRef<HTMLDivElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const done = useRef({ onShown, onGone, onRequestClose })
  useEffect(() => {
    done.current = { onShown, onGone, onRequestClose }
  })
  /* Where a swipe has the page when it lets go: the close starts from there. */
  const pulled = useRef(0)
  const closing = useRef(false)

  /** The page's size and the numbers every frame of a morph is worked out from, read once per move. */
  const measure = () => {
    const page = pageRef.current!
    const inner = innerRef.current!
    const box = page.getBoundingClientRect()
    /* The layout box, not the moved one: offsetWidth/Height ignore translate and scale. */
    return { W: page.offsetWidth || box.width, H: page.offsetHeight || box.height, pageTop: page.offsetTop, bar: topBarPx(inner), scrollTop: scrollRef.current?.scrollTop ?? 0 }
  }

  /* ── IN ── drawn on the card on its first frame; moves once its pictures are decoded (at most DECODE_WAIT_MS). */
  useLayoutEffect(() => {
    const page = pageRef.current
    const inner = innerRef.current
    const scrim = scrimRef.current
    const top = topRef.current
    const ground = groundRef.current
    if (!page || !inner || !scrim || !top || !ground) return
    const shown = () => {
      /* Arrived: the white ground behind the page is up, so a keyboard or iOS moving the screen never shows the feed. */
      ground.style.opacity = "1"
      page.style.willChange = ""
      inner.style.willChange = ""
      done.current.onShown()
    }
    if (reduced() || typeof page.animate !== "function") {
      shown()
      return
    }
    const card = cardBox(origin)
    const m = measure()
    const from = card ? cardShape(card, m.pageTop) : null
    const frames = from ? morphFrames(from, fullShape(m.W, m.H, m.bar, 0), m.W, m.H, m.bar, 0) : null
    /* The first frame, before anything moves: on the card, and see-through over it. */
    page.style.willChange = "translate, scale, opacity"
    inner.style.willChange = "translate, scale"
    if (frames) {
      put(page, { translate: String(frames.page[0].translate), scale: String(frames.page[0].scale) })
      put(inner, { translate: String(frames.inner[0].translate), scale: String(frames.inner[0].scale) })
    } else {
      put(page, { translate: "0px 24px", scale: "1" })
    }
    page.style.opacity = "0"
    scrim.style.opacity = "0"
    top.style.opacity = "0"
    const anims: Animation[] = []
    let cancelled = false
    let started = false
    const start = () => {
      if (cancelled || started) return
      started = true
      put(page, null)
      page.style.opacity = ""
      put(inner, null)
      scrim.style.opacity = ""
      top.style.opacity = ""
      if (frames) {
        anims.push(page.animate(frames.page, { duration: OPEN_MS, easing: "linear" }))
        anims.push(inner.animate(frames.inner, { duration: OPEN_MS, easing: "linear" }))
        /* The post comes in over the card in the first quarter, while the two are still nearly the same box. */
        anims.push(page.animate([{ opacity: 0 }, { opacity: 1, offset: 0.24 }, { opacity: 1 }], { duration: OPEN_MS, easing: "linear" }))
      } else {
        anims.push(page.animate([{ opacity: 0, translate: "0px 24px" }, { opacity: 1, translate: "0px 0px" }], { duration: OPEN_MS, easing: EASE }))
      }
      anims.push(scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" }))
      anims.push(top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS * 0.5, delay: OPEN_MS * 0.5, easing: "ease-out", fill: "backwards" }))
      anims[0].onfinish = shown
    }
    /* A picture decoding in the middle of the move is a dropped frame: the post's own pictures first, never long. */
    const pictures = Array.from(page.querySelectorAll("img")).filter((img) => !img.complete || !img.naturalWidth)
    if (!pictures.length) start()
    else {
      const t = window.setTimeout(start, DECODE_WAIT_MS)
      void Promise.allSettled(pictures.map((img) => img.decode?.() ?? Promise.resolve())).then(() => {
        window.clearTimeout(t)
        start()
      })
    }
    return () => {
      cancelled = true
      anims.forEach((x) => x.cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── OUT ── from wherever it is (mid open, or a swipe's let go), back into the card. */
  useLayoutEffect(() => {
    if (open) return
    closing.current = true
    const page = pageRef.current
    const inner = innerRef.current
    const scrim = scrimRef.current
    const top = topRef.current
    const scroller = scrollRef.current
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      done.current.onGone()
    }
    if (!page || !inner || !scrim || !top || !scroller || reduced() || typeof page.animate !== "function") {
      end()
      return
    }
    const m = measure()
    /* Where the page is now: pulled by a swipe, or whole. A close in the middle of the open starts from the whole page. */
    const dy = pulled.current
    const now: Shape = dy > 0 ? pulledShape(dy, pullScale(dy, m.H), m.W, m.H, m.bar, m.scrollTop) : fullShape(m.W, m.H, m.bar, m.scrollTop)
    const fromDim = Number(getComputedStyle(scrim).opacity)
    const fromTop = Number(getComputedStyle(top).opacity)
    if (groundRef.current) groundRef.current.style.opacity = "0"
    for (const el of [page, inner, scrim, top]) for (const x of el.getAnimations()) x.cancel()
    page.style.willChange = "translate, scale, opacity"
    inner.style.willChange = "translate, scale"
    const card = cardBox(origin)
    let main: Animation
    if (card) {
      const frames = morphFrames(now, cardShape(card, m.pageTop), m.W, m.H, m.bar, m.scrollTop)
      /* The last frame stays on the nodes (fill), so nothing can snap back for a frame before the parent takes it out. */
      main = page.animate(frames.page, { duration: CLOSE_MS, easing: "linear", fill: "forwards" })
      inner.animate(frames.inner, { duration: CLOSE_MS, easing: "linear", fill: "forwards" })
      put(top, null)
      /*
        THE CARD COMES BACK UNDER IT. The page holds the whole post and the card a shorter version of it, so over the
        last stretch the page fades out over the card, which is already where the page is going.
      */
      page.animate([{ opacity: 1 }, { opacity: 1, offset: 0.5 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "ease-in", fill: "forwards" })
    } else {
      /* The card is not on screen any more: a short drop from where the page is, and gone. */
      const f = placement(now, m.W, m.H, m.bar, m.scrollTop)
      const drop = placement({ ...now, top: now.top + 40, bottom: now.bottom + 40, anchorY: now.anchorY + 40 }, m.W, m.H, m.bar, m.scrollTop)
      main = page.animate([{ ...f.page, opacity: 1 }, { ...drop.page, opacity: 0 }], { duration: 240, easing: EASE, fill: "forwards" })
    }
    scrim.animate([{ opacity: fromDim }, { opacity: 0 }], { duration: CLOSE_MS, easing: EASE, fill: "forwards" })
    top.animate([{ opacity: fromTop }, { opacity: 0 }], { duration: CLOSE_MS * 0.4, easing: "ease-out", fill: "forwards" })
    main.onfinish = end
    /* A tab in the background draws no frames: it still goes. */
    const t = window.setTimeout(end, CLOSE_MS + 250)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* ── THE TOP BLUR ── follows the scroll, once a frame. */
  useEffect(() => {
    const scroller = scrollRef.current
    const blur = blurRef.current
    if (!scroller || !blur) return
    let frame = 0
    const paint = () => {
      frame = 0
      blur.style.opacity = String(Math.max(0, Math.min(1, scroller.scrollTop / BLUR_IN_PX)) * BLUR_MAX)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    paint()
    scroller.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      scroller.removeEventListener("scroll", onScroll)
      cancelAnimationFrame(frame)
    }
  }, [])

  /* ── THE SWIPE DOWN ── native listeners: React's touchmove is passive, and this one has to refuse the browser's scroll. */
  useEffect(() => {
    const scroller = scrollRef.current
    const page = pageRef.current
    const scrim = scrimRef.current
    if (!scroller || !page || !scrim) return
    let startY = 0
    let startX = 0
    let decided: "drag" | "scroll" | "none" | null = null
    let samples: { t: number; y: number }[] = []
    let atTop = false
    let atEnd = false
    let frozenOverflow = ""
    /* One move for the page and the bar over it, per touch move: the compositor's, nothing repainted. */
    const pullMove = (dy: number): Move => {
      const s = pullScale(dy, page.offsetHeight || window.innerHeight)
      return { translate: `${((page.offsetWidth || window.innerWidth) * (1 - s)) / 2}px ${dy}px`, scale: String(s) }
    }
    const set = (dy: number) => {
      pulled.current = dy
      const h = page.offsetHeight || window.innerHeight
      const p = Math.min(1, dy / h)
      const mv = pullMove(dy)
      put(page, mv)
      put(topRef.current, mv)
      scrim.style.opacity = String(Math.max(0, 1 - p * 1.2))
    }
    const onStart = (e: TouchEvent) => {
      if (closing.current || e.touches.length > 1) {
        decided = "none"
        return
      }
      const target = e.target as HTMLElement | null
      if (target?.closest?.("textarea, input, [contenteditable='true'], [data-sheet-no-drag]")) {
        decided = "none"
        return
      }
      startY = e.touches[0].clientY
      startX = e.touches[0].clientX
      decided = null
      samples = [{ t: e.timeStamp, y: startY }]
      atTop = scroller.scrollTop <= 0
      atEnd = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1
    }
    const onMove = (e: TouchEvent) => {
      if (decided === "none" || decided === "scroll" || e.touches.length > 1) return
      const y = e.touches[0].clientY
      const dy = y - startY
      const dx = e.touches[0].clientX - startX
      if (decided === null) {
        if (Math.abs(dy) < 4 && Math.abs(dx) < 4) return
        if (Math.abs(dx) > Math.abs(dy)) {
          decided = "none"
          return
        }
        if (dy > 0 && atTop) {
          decided = "drag"
          if (groundRef.current) groundRef.current.style.opacity = "0"
          frozenOverflow = scroller.style.overflowY
          scroller.style.overflowY = "hidden"
          page.style.willChange = "translate, scale"
          for (const a of page.getAnimations()) a.cancel()
          for (const a of innerRef.current?.getAnimations() ?? []) a.cancel()
          put(innerRef.current, null)
        } else {
          /* At the end of the comments, a push further is refused, so it cannot scroll the feed under the page. */
          if (dy < 0 && atEnd && e.cancelable) e.preventDefault()
          decided = "scroll"
          return
        }
      }
      if (e.cancelable) e.preventDefault()
      samples.push({ t: e.timeStamp, y })
      if (samples.length > 8) samples.shift()
      set(Math.max(0, dy))
    }
    const onEnd = (e: TouchEvent) => {
      if (decided !== "drag") {
        decided = null
        return
      }
      decided = null
      scroller.style.overflowY = frozenOverflow
      page.style.willChange = ""
      const recent = samples.filter((s) => e.timeStamp - s.t < 100)
      const first = recent[0]
      const last = recent[recent.length - 1]
      const v = first && last && last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
      if (pulled.current > CLOSE_PULL || v > CLOSE_FLICK) {
        done.current.onRequestClose()
        return
      }
      /* Back up, at about the speed it was let go. */
      const from = pulled.current
      const fromMove = pullMove(from)
      pulled.current = 0
      put(page, null)
      put(topRef.current, null)
      scrim.style.opacity = ""
      if (reduced() || typeof page.animate !== "function") {
        if (groundRef.current) groundRef.current.style.opacity = "1"
        return
      }
      const springBack: Keyframe[] = [{ ...fromMove }, { ...REST }]
      page.animate(springBack, { duration: 300, easing: EASE })
      topRef.current?.animate(springBack, { duration: 300, easing: EASE })
      const back = scrim.animate([{ opacity: Math.max(0, 1 - (from / (page.offsetHeight || 1)) * 1.2) }, { opacity: 1 }], { duration: 300, easing: EASE })
      back.onfinish = () => {
        if (!closing.current && groundRef.current) groundRef.current.style.opacity = "1"
      }
    }
    scroller.addEventListener("touchstart", onStart, { passive: true })
    scroller.addEventListener("touchmove", onMove, { passive: false })
    scroller.addEventListener("touchend", onEnd)
    scroller.addEventListener("touchcancel", onEnd)
    return () => {
      scroller.removeEventListener("touchstart", onStart)
      scroller.removeEventListener("touchmove", onMove)
      scroller.removeEventListener("touchend", onEnd)
      scroller.removeEventListener("touchcancel", onEnd)
    }
  }, [])

  /* Escape, for a keyboard on a tablet. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog]")) {
        e.preventDefault()
        done.current.onRequestClose()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  if (typeof document === "undefined") return null
  return createPortal(
    <div className="fixed inset-0 z-[130]" data-post-fullscreen="" style={open ? undefined : { pointerEvents: "none" }}>
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-[#0f1115]/30" data-post-fullscreen-scrim="" />
      {/* Past the screen's edges both ways, so iOS sliding the screen for the keyboard never shows the feed. */}
      <div ref={groundRef} aria-hidden className="absolute inset-x-0 -bottom-[100vh] -top-[100vh] bg-white" style={{ opacity: 0 }} data-post-fullscreen-ground="" />
      <div
        ref={pageRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-post-overlay="phone"
        className="absolute inset-x-0 top-[var(--vv-top,0px)] flex h-[var(--vv-h,100dvh)] origin-top-left flex-col overflow-hidden bg-white"
      >
        <div
          ref={scrollRef}
          data-post-overlay-scroll=""
          data-sheet-scroll=""
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
        >
          <div ref={innerRef} className="flex min-h-full origin-top-left flex-col" style={{ paddingTop: `calc(max(env(safe-area-inset-top, 0px), 12px) + ${BAR_PX}px)` }}>
            <div ref={contentRef} className="flex min-h-full flex-1 flex-col bg-white" data-post-overlay-phase="">
              {children}
            </div>
          </div>
        </div>
      </div>
      {/* THE TOP: a soft blur under the status bar once the post moves, and the way back. Beside the page, not in it, so the morph's scale never squeezes it; a swipe moves it with the page. */}
      <div ref={topRef} className="pointer-events-none absolute inset-x-0 top-[var(--vv-top,0px)] z-[5] origin-top-left" style={{ height: `calc(max(env(safe-area-inset-top, 0px), 12px) + ${BAR_PX + 18}px)` }}>
        <div
          ref={blurRef}
          aria-hidden
          className="absolute inset-0 bg-white/60 backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)] [mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)]"
          style={{ opacity: 0 }}
          data-post-fullscreen-blur=""
        />
        <div className="relative flex items-center px-3" style={{ height: BAR_PX, marginTop: "max(env(safe-area-inset-top, 0px), 12px)" }}>
          <button
            type="button"
            aria-label="Back"
            onClick={() => done.current.onRequestClose()}
            className="pointer-events-auto flex h-10 w-10 touch-manipulation items-center justify-center rounded-full border border-[#e6e8eb] bg-white/85 text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_12px_-6px_rgba(16,24,40,0.18)] outline-none backdrop-blur-md transition-[background-color,opacity] duration-150 active:bg-[#f1f2f4] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/20 [-webkit-tap-highlight-color:transparent]"
            data-post-overlay-close=""
          >
            <ChevronLeft className="h-[22px] w-[22px] -translate-x-px" strokeWidth={2.2} />
          </button>
          <span className="pointer-events-none absolute inset-x-16 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}
