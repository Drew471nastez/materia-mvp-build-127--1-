"use client"

/**
 * ===========================================================================
 *  A POST, OPENED ON A PHONE: A SCREEN PUSHED IN FROM THE RIGHT (round 15)
 * ===========================================================================
 * Round 19, the owner: "get rid of the bottom sheet for a post on a phone; a
 * full screen page, like a Substack note; a swipe down or the back button
 * closes it. The comment box is a floating bar at the bottom, on the keyboard
 * when it is up, and the comments scroll under it. At the top, as you scroll,
 * a soft blur comes in under the status bar." All of that stays.
 *
 * WHAT ROUND 15 REPLACED, AND WHY. Rounds 19 to 24 grew the card into the
 * page and shrank it back into the card (a box moved and scaled, the post
 * inside scaled back, a fade at each end). The owner's recording
 * (images/74.mp4) and scripts/check-communities-post15.mjs found four faults
 * in it, all from landing one layout on another:
 *   a. a blank band above the post as it went: the page's own white top
 *      (status bar and back bar) moving with it over the feed;
 *   b. the post's header and the community's crossfading over each other:
 *      the back bar was a separate strip that jumped to the top and faded;
 *   c. the card in the wrong place, then a snap: the page landed on the
 *      card's box holding the opened post's layout (a 19px title, the whole
 *      picture), not the card's;
 *   d. a second animation after it looked settled: the page faded out over
 *      the card on an ease-in, so for the last 60 to 80ms the title and the
 *      picture were drawn twice.
 * And on the way in the feed's header went white in one frame (the page,
 * still transparent, already covered it) and the tab bar vanished.
 *
 * NOW: AN iOS PUSH (post-motion.ts says why this model). One opaque page,
 * holding the post with its own back bar, slides in from the right over the
 * feed, which stays exactly where it was under a light dim; Back slides it
 * out to the right; a pull down from the top follows the finger and, let go
 * far enough or fast enough, drops it away; in the app a swipe from the left
 * edge follows the finger and closes it. Only `translate` and the dim's
 * opacity move, on the compositor. Nothing is ever drawn over the card, so
 * nothing has to give way to it: when the page has left the screen it is
 * hidden on that frame and taken out after.
 *
 * THE CLOSE, IN ORDER (post-motion.ts closeSteps): the feed is put back to
 * the scroll it had when the post opened (iOS pans the page under a fixed
 * field when the keyboard comes up) while the post still covers it; then the
 * one move; then hidden, the layer let go, the post taken out, the history
 * step given back. A Back the browser drew itself (Safari's edge swipe) is
 * not moved again.
 *
 * THE TAB BAR stays (lib/ui/layers.ts "post": the bar is lifted over the
 * post), and the page ends at its top.
 *
 * THE KEYBOARD (images/73.webp). The page is the part of the screen that can
 * be seen (post-motion.ts postBox), read from the visual viewport, or in the
 * iOS app (where WKWebView says nothing) from the iPhone's own keyboard
 * height, so the comment box at its foot sits on the keyboard's bar. Under
 * the page a white skirt runs on past the screen's foot, so whatever is left
 * between the page and the keys when a platform's number is off is white,
 * never the feed.
 *
 * Reduced motion: it appears and goes, no move.
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"
import { useLayer } from "@/lib/ui/layers"
import { edgeSwipeEnvironment } from "@/lib/navigation/edge-swipe"
import { KEYBOARD_CHANGE_EVENT } from "@/lib/ui/keyboard-safe-sheet"
import {
  BACK_CIRCLE,
  BACK_HIT,
  BAR_PX,
  BROWSER_EDGE_PX,
  DIM,
  POP_MS,
  PUSH_EASE,
  PUSH_MS,
  cancelMs,
  closeSteps,
  closedByBrowserSwipe,
  feedRestore,
  finishMs,
  iosKeyboardFor,
  judgeMove,
  postBox,
  postBoxHeightCss,
  pullOffset,
  pullVerdict,
  releaseVelocity,
  shouldComplete,
  startsAtEdge,
  PULL_SLOP,
  type CloseTrigger,
} from "./post-motion"

/** How far the scroll goes before the top blur is all the way in. */
const BLUR_IN_PX = 80
/** All the way in, the blur is this strong: a hint under the clock, not a frosted bar (round 20, the owner: "too heavy"). */
const BLUR_MAX = 0.85
/** The status bar's room above the back bar. */
const SAFE_TOP = "max(env(safe-area-inset-top, 0px), 12px)"

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/* When a finger last landed at the screen's left edge: a popstate soon after is the browser's own swipe back (closedByBrowserSwipe). */
let lastEdgeTouch = -Infinity
if (typeof document !== "undefined") {
  document.addEventListener(
    "touchstart",
    (e) => {
      const x = e.touches[0]?.clientX
      if (x !== undefined && x <= BROWSER_EDGE_PX) lastEdgeTouch = performance.now()
    },
    { passive: true, capture: true },
  )
}

const TEXT_INPUT = /^(text|search|url|tel|email|password|number)$/
function takesKeyboard(el: Element | null): boolean {
  const h = el as HTMLElement | null
  if (!h) return false
  if (h.isContentEditable || h.tagName === "TEXTAREA") return true
  return h.tagName === "INPUT" && TEXT_INPUT.test(((h as HTMLInputElement).type || "text").toLowerCase())
}

/** The iOS app (not Android's): the one place the keyboard's height has to come from the table. */
function iosApp(): boolean {
  if (typeof document === "undefined" || !document.documentElement.classList.contains("capacitor")) return false
  return /iPhone|iPad|iPod/.test(navigator.userAgent)
}

/** Where the page is moved to now: its inline translate (a finger), else what an animation has it at. */
function offsetOf(el: HTMLElement): { x: number; y: number } {
  const t = el.style.translate || getComputedStyle(el).translate
  if (!t || t === "none") return { x: 0, y: 0 }
  const [x = "0", y = "0"] = t.split(" ")
  return { x: parseFloat(x) || 0, y: parseFloat(y) || 0 }
}

export interface PostFullscreenProps {
  open: boolean
  label: string
  title: string
  /** Asked to close (the back button, a swipe, Escape): the parent sets `open` false. */
  onRequestClose: () => void
  /** The open has arrived. */
  onShown: () => void
  /** It has gone (off the screen and hidden): the parent takes it out. */
  onGone: () => void
  contentRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

export function PostFullscreen({ open, label, title, onRequestClose, onShown, onGone, contentRef, children }: PostFullscreenProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const done = useRef({ onShown, onGone, onRequestClose })
  useEffect(() => {
    done.current = { onShown, onGone, onRequestClose }
  })
  /* What closed it (null: a Back, or the parent), and the finger's speed when it let go of a swipe. */
  const how = useRef<CloseTrigger | null>(null)
  const letGo = useRef(0)
  const closing = useRef(false)
  /* The feed's scroll when the post opened: where it is put back before the close moves. */
  const noted = useRef<number | null>(null)
  const request = (trigger: CloseTrigger) => {
    if (closing.current) return
    how.current ??= trigger
    done.current.onRequestClose()
  }

  /* THE TAB BAR stays, over the post, for as long as the post is in the page (lib/ui/layers.ts). */
  useLayer("post", true, layerRef)

  /* ── THE PAGE ON THE VISIBLE SCREEN ── before the first frame, and again whenever the viewport or the keyboard moves. */
  useLayoutEffect(() => {
    const layer = layerRef.current
    const page = pageRef.current
    if (!layer || !page) return
    const app = iosApp()
    let last = ""
    const apply = () => {
      const vv = window.visualViewport
      const layoutH = layer.offsetHeight || window.innerHeight
      const typing = takesKeyboard(document.activeElement) && page.contains(document.activeElement)
      const published = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--kb-inset")) || 0
      const box = postBox({
        layoutH,
        innerH: window.innerHeight,
        vvTop: Math.round(vv?.offsetTop ?? 0),
        vvH: Math.round(vv?.height ?? window.innerHeight),
        typing,
        publishedInset: published,
        appKeyboard: app && typing ? iosKeyboardFor(window.innerWidth, layoutH) : null,
      })
      const key = `${box.top}|${box.height}|${box.aboveTabs}|${typing}`
      if (key === last) return
      last = key
      page.style.top = `${Math.round(box.top)}px`
      page.style.height = postBoxHeightCss(box)
      page.dataset.box = box.source
      page.toggleAttribute("data-typing", typing)
    }
    apply()
    let raf = 0
    const soon = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(apply)
    }
    /* The keyboard going down is reported late on iOS: looked at again as it goes. */
    const onFocusOut = () => {
      soon()
      window.setTimeout(apply, 80)
      window.setTimeout(apply, 260)
    }
    const vv = window.visualViewport
    vv?.addEventListener("resize", apply)
    vv?.addEventListener("scroll", apply)
    window.addEventListener("resize", apply)
    window.addEventListener(KEYBOARD_CHANGE_EVENT, apply)
    document.addEventListener("focusin", soon)
    document.addEventListener("focusout", onFocusOut)
    return () => {
      cancelAnimationFrame(raf)
      vv?.removeEventListener("resize", apply)
      vv?.removeEventListener("scroll", apply)
      window.removeEventListener("resize", apply)
      window.removeEventListener(KEYBOARD_CHANGE_EVENT, apply)
      document.removeEventListener("focusin", soon)
      document.removeEventListener("focusout", onFocusOut)
    }
  }, [])

  /* ── IN ── from the right, on the first frame. */
  useLayoutEffect(() => {
    noted.current = window.scrollY
    const page = pageRef.current
    const scrim = scrimRef.current
    if (!page || !scrim) return
    let arrived = false
    const shown = () => {
      if (arrived) return
      arrived = true
      page.style.willChange = ""
      done.current.onShown()
    }
    if (reduced() || typeof page.animate !== "function") {
      shown()
      return
    }
    page.style.willChange = "translate"
    const W = page.offsetWidth || window.innerWidth
    const a = page.animate([{ translate: `${W}px 0px` }, { translate: "0px 0px" }], { duration: PUSH_MS, easing: PUSH_EASE })
    scrim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: PUSH_MS, easing: PUSH_EASE })
    /* A finger that catches it on the way in cancels the move: it has still arrived. */
    a.onfinish = shown
    a.oncancel = shown
    const t = window.setTimeout(shown, PUSH_MS + 250)
    return () => window.clearTimeout(t)
  }, [])

  /* ── OUT ── closeSteps, in order. */
  useLayoutEffect(() => {
    if (open) return
    closing.current = true
    const layer = layerRef.current
    const page = pageRef.current
    const scrim = scrimRef.current
    const trigger: CloseTrigger = how.current ?? (closedByBrowserSwipe(performance.now() - lastEdgeTouch, edgeSwipeEnvironment()) ? "browser-swipe" : "history")
    const still = reduced() || !page || typeof page.animate !== "function"
    const steps = closeSteps(trigger, still)
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      /* HIDE-PAGE on the move's last frame: nothing of it is drawn again. */
      if (layer) layer.style.visibility = "hidden"
      done.current.onGone()
    }
    /* The keyboard goes down with the post, not after it. */
    const active = document.activeElement as HTMLElement | null
    if (active && page?.contains(active)) active.blur()
    /* HOLD-FEED: the feed exactly where it was, while the post still covers it. */
    const back = noted.current === null ? null : feedRestore(noted.current, window.scrollY)
    if (back !== null) window.scrollTo({ top: back, behavior: "instant" as ScrollBehavior })
    if (!page || !scrim || steps.includes("cut")) {
      end()
      return
    }
    const from = offsetOf(page)
    const dimFrom = Number(getComputedStyle(scrim).opacity)
    for (const el of [page, scrim]) for (const x of el.getAnimations()) x.cancel()
    page.style.translate = ""
    scrim.style.opacity = ""
    page.style.willChange = "translate"
    const W = page.offsetWidth || window.innerWidth
    const H = window.innerHeight
    const down = steps.includes("slide-down")
    const to = down ? `${from.x}px ${Math.max(H, from.y + 1)}px` : `${W}px ${from.y}px`
    const remaining = down ? H - from.y : W - from.x
    const fromFinger = trigger === "pull" || trigger === "edge"
    const ms = fromFinger ? finishMs(remaining, letGo.current) : POP_MS
    const easing = fromFinger ? "cubic-bezier(0.2, 0.8, 0.25, 1)" : PUSH_EASE
    /* The last frame stays on the page (fill) until it is hidden, so it can never be drawn back at rest for a frame. */
    const main = page.animate([{ translate: `${from.x}px ${from.y}px` }, { translate: to }], { duration: ms, easing, fill: "forwards" })
    scrim.animate([{ opacity: dimFrom }, { opacity: 0 }], { duration: ms, easing, fill: "forwards" })
    main.onfinish = end
    /* A tab in the background draws no frames: it still goes. */
    const t = window.setTimeout(end, ms + 250)
    return () => window.clearTimeout(t)
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

  /*
    ── THE PULL DOWN AND THE EDGE SWIPE ── native listeners: React's touchmove is passive, and these have to refuse the
    browser's scroll. A finger from the left edge (the app on iOS only: a browser has its own swipe back there) takes the page
    sideways; a finger pulling down with the post at its top takes it down. Each follows the finger from the first pixel it
    claims, moving only `translate` and the dim.
  */
  useEffect(() => {
    const page = pageRef.current
    const scroller = scrollRef.current
    const scrim = scrimRef.current
    if (!page || !scroller || !scrim) return
    const edgeOn = edgeSwipeEnvironment()
    let mode: "edge?" | "edge" | "pull" | "scroll" | "none" | null = null
    let startX = 0
    let startY = 0
    let atTop = false
    let atEnd = false
    let samples: Array<[number, number]> = []
    let overflow = ""
    let offset = 0
    const W = () => page.offsetWidth || window.innerWidth
    const H = () => page.offsetHeight || window.innerHeight
    const take = () => {
      for (const el of [page, scrim]) for (const a of el.getAnimations()) a.cancel()
      page.style.willChange = "translate"
    }
    const onStart = (e: TouchEvent) => {
      if (closing.current || e.touches.length > 1) {
        mode = "none"
        return
      }
      const t = e.touches[0]
      startX = t.clientX
      startY = t.clientY
      samples = [[e.timeStamp, 0]]
      offset = 0
      if (edgeOn && startsAtEdge(startX)) {
        mode = "edge?"
        return
      }
      const target = e.target as HTMLElement | null
      if (target?.closest?.("textarea, input, [contenteditable='true'], [data-sheet-no-drag]")) {
        mode = "none"
        return
      }
      mode = null
      atTop = scroller.scrollTop <= 0
      atEnd = scroller.scrollTop >= scroller.scrollHeight - scroller.clientHeight - 1
    }
    const onMove = (e: TouchEvent) => {
      if (mode === "none" || mode === "scroll" || e.touches.length > 1) return
      const t = e.touches[0]
      const dx = t.clientX - startX
      const dy = t.clientY - startY
      if (mode === "edge?") {
        const v = judgeMove(dx, dy)
        if (v === "wait") return
        if (v === "give-up") {
          mode = "scroll"
          return
        }
        mode = "edge"
        take()
      }
      if (mode === null) {
        if (Math.abs(dy) < PULL_SLOP && Math.abs(dx) < PULL_SLOP) return
        if (Math.abs(dx) > Math.abs(dy) || !(dy > 0 && atTop)) {
          /* At the end of the comments a push further is refused, so it cannot scroll the feed under the page. */
          if (dy < 0 && atEnd && e.cancelable) e.preventDefault()
          mode = "scroll"
          return
        }
        mode = "pull"
        overflow = scroller.style.overflowY
        scroller.style.overflowY = "hidden"
        take()
      }
      if (e.cancelable) e.preventDefault()
      if (mode === "edge") {
        offset = Math.max(0, Math.min(W(), dx))
        page.style.translate = `${offset}px 0px`
        scrim.style.opacity = String(Math.max(0, 1 - offset / W()))
        samples.push([e.timeStamp, offset])
      } else {
        offset = pullOffset(dy)
        page.style.translate = `0px ${offset}px`
        scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, offset) / H()))
        samples.push([e.timeStamp, offset])
      }
      if (samples.length > 10) samples.shift()
    }
    const springBack = (ms: number) => {
      const from = page.style.translate || "0px 0px"
      const dim = Number(scrim.style.opacity || 1)
      page.style.translate = ""
      scrim.style.opacity = ""
      if (reduced()) return
      page.animate([{ translate: from }, { translate: "0px 0px" }], { duration: ms, easing: PUSH_EASE })
      scrim.animate([{ opacity: dim }, { opacity: 1 }], { duration: ms, easing: PUSH_EASE })
    }
    const onEnd = (e: TouchEvent) => {
      const was = mode
      mode = null
      if (was !== "edge" && was !== "pull") return
      if (was === "pull") scroller.style.overflowY = overflow
      samples.push([e.timeStamp, offset])
      const v = releaseVelocity(samples)
      if (was === "edge") {
        if (shouldComplete(offset, W(), v)) {
          letGo.current = Math.max(0, v)
          request("edge")
        } else springBack(cancelMs(offset))
        return
      }
      if (pullVerdict({ dy: offset, velocity: v, height: H() }) === "close") {
        letGo.current = Math.max(0, v)
        request("pull")
      } else springBack(300)
    }
    page.addEventListener("touchstart", onStart, { passive: true })
    page.addEventListener("touchmove", onMove, { passive: false })
    page.addEventListener("touchend", onEnd)
    page.addEventListener("touchcancel", onEnd)
    return () => {
      page.removeEventListener("touchstart", onStart)
      page.removeEventListener("touchmove", onMove)
      page.removeEventListener("touchend", onEnd)
      page.removeEventListener("touchcancel", onEnd)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* Escape, for a keyboard on a tablet. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("[data-lightbox], [role=alertdialog]")) {
        e.preventDefault()
        request("escape")
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (typeof document === "undefined") return null
  return createPortal(
    <div ref={layerRef} className="pointer-events-none fixed inset-0 z-[130]" data-post-fullscreen="" data-layer-kind="post">
      {/* The feed under it, dimmed a little while the post is over it (iOS's dim under a push). */}
      <div ref={scrimRef} aria-hidden className="absolute inset-0" style={{ backgroundColor: `rgba(15, 17, 21, ${DIM})` }} data-post-fullscreen-scrim="" />
      <div
        ref={pageRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-post-overlay="phone"
        className={`absolute inset-x-0 flex flex-col bg-white shadow-[-12px_0_32px_-16px_rgba(16,24,40,0.28)] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{ top: "var(--vv-top, 0px)", height: "calc(var(--vv-h, 100dvh) - var(--buyer-tabs-h, 0px))" }}
      >
        {/* THE SKIRT: the page's white runs on past the screen's foot, under the keyboard and the tab bar, so nothing behind ever shows between the comment box and the keys. */}
        <div aria-hidden className="absolute inset-x-0 top-full h-[100lvh] bg-white" data-post-skirt="" />
        <div
          ref={scrollRef}
          data-post-overlay-scroll=""
          data-sheet-scroll=""
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex min-h-full flex-col" style={{ paddingTop: `calc(${SAFE_TOP} + ${BAR_PX}px)` }}>
            <div ref={contentRef} className="flex min-h-full flex-1 flex-col bg-white" data-post-overlay-phase="">
              {children}
            </div>
          </div>
        </div>
        {/* THE TOP: part of the page, so it moves with it and is never a second header over the community's. A soft blur under the status bar once the post scrolls, and the way back. */}
        <div data-post-fullscreen-top="" className="pointer-events-none absolute inset-x-0 top-0 z-[5]" style={{ height: `calc(${SAFE_TOP} + ${BAR_PX + 18}px)` }}>
          <div
            ref={blurRef}
            aria-hidden
            className="absolute inset-0 bg-white/60 backdrop-blur-[6px] [-webkit-backdrop-filter:blur(6px)] [mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)]"
            style={{ opacity: 0 }}
            data-post-fullscreen-blur=""
          />
          <div className="relative flex items-center" style={{ height: BAR_PX, marginTop: SAFE_TOP }}>
            {/* BACK: the circle is 40px; the tap is the whole corner, from the screen's edge across BACK_HIT.width and the bar's height. */}
            <button
              type="button"
              aria-label="Back"
              onClick={() => request("back")}
              className="group/back pointer-events-auto absolute left-0 top-0 flex touch-manipulation items-center justify-start pl-3 outline-none [-webkit-tap-highlight-color:transparent] focus-visible:[&>span]:ring-2 focus-visible:[&>span]:ring-[#1a1a2e]/20"
              style={{ width: BACK_HIT.width, height: BACK_HIT.height }}
              data-post-overlay-close=""
            >
              <span
                className="flex items-center justify-center rounded-full border border-[#e6e8eb] bg-white/90 text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_12px_-6px_rgba(16,24,40,0.18)] backdrop-blur-md transition-[background-color,scale] duration-150 ease-out group-active/back:scale-[0.94] group-active/back:bg-[#f1f2f4]"
                style={{ width: BACK_CIRCLE, height: BACK_CIRCLE }}
              >
                <ChevronLeft className="h-[22px] w-[22px] -translate-x-px" strokeWidth={2.2} aria-hidden />
              </span>
            </button>
            <span className="pointer-events-none absolute inset-x-16 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</span>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
