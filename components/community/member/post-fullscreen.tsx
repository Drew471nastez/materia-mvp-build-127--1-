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
 * THE MORPH. The page is drawn full screen from the first frame, clipped to
 * the card's own box (clip-path inset, rounded like the card) with its
 * content moved down to where the card's content was, so the first frame
 * looks like the card. The clip opens to the screen and the content rises to
 * its place, together, on iOS's curve. Closing runs the same backwards, to
 * wherever the card is now; a card no longer on screen gets a short drop
 * and fade instead. The feed under it dims a little and comes back.
 *
 * THE SWIPE. With the post at its top, a finger pulling down takes the page
 * with it from the first pixel (the browser's own scroll is refused for that
 * gesture, so iOS cannot bounce the content under the finger), its corners
 * round and the dim lifts. Let go far enough, or moving down fast enough,
 * and it morphs back into the card from where it was let go; otherwise it
 * springs back. A pull that reaches the end of the comments is held too, so
 * it never scrolls the feed under the page.
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
 * Everything that moves is clip-path, transform and opacity, written by Web
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
/** The card's corner (ui.ts CARD rounded-2xl); 0 on a phone, where the card runs edge to edge (PHONE_ROW), so it is read from the card. */
const CARD_RADIUS_FALLBACK = 16
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

/** The height of the bar at the top, status bar included, in px. */
function topBarPx(): number {
  const probe = document.createElement("div")
  probe.style.cssText = "position:fixed;top:0;height:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none"
  document.body.appendChild(probe)
  const inset = probe.getBoundingClientRect().height
  probe.remove()
  return Math.max(inset, 12) + BAR_PX
}

/** Where the card is now, if it is on screen at all. */
function cardBox(origin: (() => HTMLElement | null) | undefined): { rect: DOMRect; radius: number } | null {
  const el = origin?.()
  if (!el || !el.isConnected) return null
  const rect = el.getBoundingClientRect()
  if (rect.width < 40 || rect.height < 40 || rect.bottom < 0 || rect.top > window.innerHeight) return null
  const radius = parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0
  return { rect, radius: Number.isFinite(radius) ? radius : CARD_RADIUS_FALLBACK }
}

/** The page clipped to `r` (viewport coordinates; the page is at the visual viewport's top). */
function insetFor(r: DOMRect, radius: number, pageTop: number, pageH: number): string {
  const top = Math.max(0, r.top - pageTop)
  const bottom = Math.max(0, pageTop + pageH - r.bottom)
  const left = Math.max(0, r.left)
  const right = Math.max(0, window.innerWidth - r.right)
  return `inset(${top}px ${right}px ${bottom}px ${left}px round ${radius}px)`
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

  /* ── IN ── drawn as the card on its first frame; moves once its pictures are decoded (at most DECODE_WAIT_MS). */
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
      done.current.onShown()
    }
    if (reduced() || typeof page.animate !== "function") {
      shown()
      return
    }
    const card = cardBox(origin)
    const pageBox = page.getBoundingClientRect()
    const bar = topBarPx()
    const from = card ? insetFor(card.rect, card.radius, pageBox.top, pageBox.height) : null
    const shift = card ? card.rect.top - pageBox.top - bar : 0
    /* The first frame, before anything moves: the card's shape, the post where the card's words are, and see-through over the card. */
    if (from) {
      page.style.clipPath = from
      inner.style.transform = `translateY(${shift}px)`
    } else {
      page.style.transform = "translateY(24px)"
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
      page.style.clipPath = ""
      page.style.transform = ""
      page.style.opacity = ""
      inner.style.transform = ""
      scrim.style.opacity = ""
      top.style.opacity = ""
      const opts: KeyframeAnimationOptions = { duration: OPEN_MS, easing: EASE }
      if (from) {
        anims.push(page.animate([{ clipPath: from }, { clipPath: "inset(0px 0px 0px 0px round 0px)" }], opts))
        anims.push(inner.animate([{ transform: `translateY(${shift}px)` }, { transform: "translateY(0)" }], opts))
        /* The whole post comes in over the card in the first third, so the card never snaps into it. */
        anims.push(page.animate([{ opacity: 0 }, { opacity: 1, offset: 0.32 }, { opacity: 1 }], { duration: OPEN_MS, easing: "linear" }))
      } else {
        anims.push(page.animate([{ opacity: 0, transform: "translateY(24px)" }, { opacity: 1, transform: "translateY(0)" }], opts))
      }
      anims.push(scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS, easing: "ease-out" }))
      anims.push(top.animate([{ opacity: 0 }, { opacity: 1 }], { duration: OPEN_MS * 0.6, delay: OPEN_MS * 0.4, easing: "ease-out", fill: "backwards" }))
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
      anims.forEach((a) => a.cancel())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── OUT ── from wherever it is (a swipe's let go included), back into the card. */
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
    const now = getComputedStyle(page)
    const fromTransform = now.transform === "none" ? "translateY(0px)" : now.transform
    const fromClip = now.clipPath && now.clipPath !== "none" ? now.clipPath : "inset(0px 0px 0px 0px round 0px)"
    const fromDim = Number(getComputedStyle(scrim).opacity)
    if (groundRef.current) groundRef.current.style.opacity = "0"
    for (const el of [page, inner, scrim, top]) for (const a of el.getAnimations()) a.cancel()
    page.style.transform = ""
    page.style.clipPath = ""
    scrim.style.opacity = ""
    const card = cardBox(origin)
    const pageBox = page.getBoundingClientRect()
    const bar = topBarPx()
    const opts: KeyframeAnimationOptions = { duration: CLOSE_MS, easing: EASE, fill: "forwards" }
    let main: Animation
    if (card) {
      const to = insetFor(card.rect, card.radius, pageBox.top, pageBox.height)
      main = page.animate([{ transform: fromTransform, clipPath: fromClip }, { transform: "translateY(0px)", clipPath: to }], opts)
      /* Scrolled down into the comments, the post's top is above the page: brought down to the card's place with the rest. */
      const shift = card.rect.top - pageBox.top - bar + scroller.scrollTop
      inner.animate([{ transform: "translateY(0)" }, { transform: `translateY(${shift}px)` }], opts)
      /*
        THE CARD COMES BACK UNDER IT. The page holds the whole post (every line, every picture) and the card a shorter
        version of it, so the page gave way to the card in one frame at the end: a snap. Over the last stretch of the
        move the page fades out over the card, which is already where the page is going.
      */
      page.animate([{ opacity: 1 }, { opacity: 1, offset: 0.55 }, { opacity: 0 }], { duration: CLOSE_MS, easing: "linear", fill: "forwards" })
    } else {
      /* The card is not on screen any more: a short drop from where the page is, and gone. */
      main = page.animate([{ transform: fromTransform, opacity: 1 }, { transform: `translateY(${pulled.current + 40}px)`, opacity: 0 }], { ...opts, duration: 240 })
    }
    scrim.animate([{ opacity: fromDim }, { opacity: 0 }], opts)
    top.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS * 0.5, easing: "ease-out", fill: "forwards" })
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
    const set = (dy: number) => {
      pulled.current = dy
      const h = page.offsetHeight || window.innerHeight
      const p = Math.min(1, dy / h)
      page.style.transform = `translateY(${dy}px)`
      page.style.clipPath = `inset(0px 0px 0px 0px round ${Math.min(28, dy / 5)}px)`
      scrim.style.opacity = String(1 - p * 1.2)
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
          page.style.willChange = "transform"
          for (const a of page.getAnimations()) a.cancel()
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
      pulled.current = 0
      page.style.transform = ""
      page.style.clipPath = ""
      scrim.style.opacity = ""
      if (reduced() || typeof page.animate !== "function") {
        if (groundRef.current) groundRef.current.style.opacity = "1"
        return
      }
      page.animate([{ transform: `translateY(${from}px)`, clipPath: `inset(0px 0px 0px 0px round ${Math.min(28, from / 5)}px)` }, { transform: "translateY(0px)", clipPath: "inset(0px 0px 0px 0px round 0px)" }], { duration: 300, easing: EASE })
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
        className="absolute inset-x-0 top-[var(--vv-top,0px)] flex h-[var(--vv-h,100dvh)] flex-col overflow-hidden bg-white"
      >
        <div
          ref={scrollRef}
          data-post-overlay-scroll=""
          data-sheet-scroll=""
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
        >
          <div ref={innerRef} className="flex min-h-full flex-col" style={{ paddingTop: `calc(max(env(safe-area-inset-top, 0px), 12px) + ${BAR_PX}px)` }}>
            <div ref={contentRef} className="flex min-h-full flex-1 flex-col bg-white" data-post-overlay-phase="">
              {children}
            </div>
          </div>
        </div>

        {/* THE TOP: a soft blur under the status bar once the post moves, and the way back. */}
        <div ref={topRef} className="pointer-events-none absolute inset-x-0 top-0 z-[5]" style={{ height: `calc(max(env(safe-area-inset-top, 0px), 12px) + ${BAR_PX + 18}px)` }}>
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
      </div>
    </div>,
    document.body,
  )
}
