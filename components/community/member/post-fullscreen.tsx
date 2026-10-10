"use client"

/**
 * ===========================================================================
 *  A POST, OPENED ON A PHONE: iOS's PAGE SHEET (round 16)
 * ===========================================================================
 * Round 19, the owner: "get rid of the bottom sheet for a post on a phone; a
 * full screen page, like a Substack note; a swipe down or the back button
 * closes it. The comment box is a floating bar at the bottom, on the keyboard
 * when it is up, and the comments scroll under it. At the top, as you scroll,
 * a soft blur comes in under the status bar." All of that stays.
 *
 * WHAT ROUND 16 REPLACED, AND WHY. Round 15 pushed the page in from the right
 * and let a pull drop it downwards; the owner: "I don't like how a post opens
 * right now... very glitchy", and it came in one way and left another. Round
 * 14 before it grew the card into the page (two copies of the post on screen).
 * NOW the post is iOS's page sheet (page-sheet.ts): one opaque page rises from
 * the foot on a spring while the community behind eases back (a slight
 * scale, rounded corners, a soft dim) and stays exactly where it was; every
 * close is the same motion in reverse; a pull down is that motion following
 * the finger, and so is the app's edge swipe. At rest the page covers the
 * whole screen, as the owner asked in round 19. Only `translate`, `scale`
 * and `opacity` move, on the compositor, and the post is drawn once.
 *
 * THE CLOSE, IN ORDER (post-motion.ts closeSteps): the feed is put back to the
 * scroll it had when the post opened (iOS pans the page under a fixed field
 * when the keyboard comes up) while the post still covers it; the community
 * is eased back, unseen, under the covering page; then the one move down;
 * then hidden, the community let go, the layer let go, the post taken out,
 * the history step given back. A Back the browser drew itself (Safari's edge
 * swipe) is not moved again.
 *
 * THE TAB BAR stays (lib/ui/layers.ts "post": the bar is lifted over the
 * post), and the page ends at its top.
 *
 * THE KEYBOARD (images/73.webp, 76.jpg). The page is the part of the screen
 * that can be seen (post-motion.ts postBox, visible-box.ts). Whatever any
 * number says, while the comment box is typed in one opaque white block runs
 * from the box's top edge down past the foot of the screen, over every part
 * of the post (THE BLOCK below), so a gap between the box and the keys can
 * only ever be white.
 *
 * Reduced motion: it appears and goes, no move.
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"
import { useLayer } from "@/lib/ui/layers"
import { edgeSwipeEnvironment } from "@/lib/navigation/edge-swipe"
import { useVisibleBox } from "./visible-box"
import { BACK_CIRCLE, BACK_HIT, BAR_PX, BROWSER_EDGE_PX, closeSteps, closedByBrowserSwipe, edgeOffset, feedRestore, judgeMove, postBoxHeightCss, pullOffset, pullVerdict, releaseVelocity, shouldComplete, startsAtEdge, PULL_SLOP, type CloseTrigger } from "./post-motion"
import { CLOSE_MS, OPEN_MS, closeMsFrom, progressFromOffset, springVelocity } from "./page-sheet"
import { SheetBackdrop, communityFrame, sheetStage, type SheetStage } from "./page-sheet-stage"

/** How far the scroll goes before the top blur is all the way in. */
const BLUR_IN_PX = 80
/** All the way in, the blur is this strong: a hint under the clock, not a frosted bar (round 20, the owner: "too heavy"). */
const BLUR_MAX = 0.85
/** The status bar's room above the back bar. */
const SAFE_TOP = "max(env(safe-area-inset-top, 0px), 12px)"

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/*
  THE KEYBOARD READOUT (round 16). ?kbdebug=1 on any address turns it on for this tab (kept in session storage, because the
  opened post's own address drops the query), ?kbdebug=0 turns it off. While the comment box is typed in, a small panel shows
  innerHeight, visualViewport's height and offsetTop, the scroll, the box's rect and which measurement placed it.
*/
const KB_DEBUG_KEY = "storelib:kbdebug"
function readKbDebugFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    const asked = new URLSearchParams(window.location.search).get("kbdebug")
    if (asked === "1") window.sessionStorage.setItem(KB_DEBUG_KEY, "1")
    else if (asked === "0") window.sessionStorage.removeItem(KB_DEBUG_KEY)
    return window.sessionStorage.getItem(KB_DEBUG_KEY) === "1"
  } catch {
    return false
  }
}
let kbDebug = readKbDebugFlag()
export function kbDebugOn(): boolean {
  if (!kbDebug) kbDebug = readKbDebugFlag()
  return kbDebug
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
  const backdropRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const debugRef = useRef<HTMLDivElement>(null)
  /* The sheet's driver (page-sheet-stage.tsx): the page, the backdrop's dim and bands, and the community easing back. */
  const stageRef = useRef<SheetStage | null>(null)
  const stage = () => {
    const page = pageRef.current
    if (!stageRef.current && page) stageRef.current = sheetStage(page, backdropRef.current, communityFrame())
    return stageRef.current
  }
  const done = useRef({ onShown, onGone, onRequestClose })
  useEffect(() => {
    done.current = { onShown, onGone, onRequestClose }
  })
  /* What closed it (null: a Back, or the parent), and the finger's speed when it let go of a swipe. */
  const how = useRef<CloseTrigger | null>(null)
  const letGo = useRef(0)
  const closing = useRef(false)
  /* A finger has the sheet (a pull or the edge swipe): nothing lets the community go under it. */
  const holding = useRef(false)
  /* The feed's scroll when the post opened: where it is put back before the close moves. */
  const noted = useRef<number | null>(null)
  const request = (trigger: CloseTrigger) => {
    if (closing.current) return
    how.current ??= trigger
    done.current.onRequestClose()
  }

  /* THE TAB BAR stays, over the post, for as long as the post is in the page (lib/ui/layers.ts). */
  useLayer("post", true, layerRef)

  /* ── THE PAGE ON THE VISIBLE SCREEN ── before the first frame, and again whenever the viewport or the keyboard moves (visible-box.ts). */
  useVisibleBox(
    true,
    () => pageRef.current,
    () => layerRef.current,
    (box, typing, _layoutH, facts) => {
      const page = pageRef.current
      if (!page) return
      page.style.top = `${Math.round(box.top)}px`
      page.style.height = postBoxHeightCss(box)
      page.dataset.box = box.source
      page.toggleAttribute("data-typing", typing)
      /* ?kbdebug=1: what the box was placed from, on screen, for a screenshot if a gap is ever still there. */
      const panel = debugRef.current
      if (panel) {
        const on = typing && kbDebugOn()
        panel.hidden = !on
        /* Read on the next frame, once the box has been brought onto the page's foot (below). */
        if (on)
          requestAnimationFrame(() => {
            const dock = page.querySelector<HTMLElement>("[data-comment-box=comment]")?.getBoundingClientRect()
            const r = (n: number | undefined) => (n === undefined ? "-" : String(Math.round(n)))
            panel.textContent = [
              `used ${box.source}  box top ${Math.round(box.top)} h ${Math.round(box.height)}`,
              `innerHeight ${facts.innerH}  layout ${facts.layoutH}`,
              `vv.height ${facts.vvH}  vv.offsetTop ${facts.vvTop}`,
              `scrollY ${facts.scrollY}  native kb ${facts.native || "-"}  table kb ${facts.table ?? "-"}`,
              `comment box top ${r(dock?.top)} bottom ${r(dock?.bottom)} left ${r(dock?.left)} w ${r(dock?.width)}`,
            ].join("\n")
          })
      }
      /*
        THE BOX IN SIGHT ON THE KEYBOARD. The comment box sticks to the page's foot only inside the comments section; with the
        page shortened to what the keyboard leaves, a long post puts that section below the foot and the box with it, out of
        sight. Typing, the page is scrolled by just enough to bring the box onto the foot.
      */
      if (!typing) return
      const scroller = scrollRef.current
      const dock = page.querySelector<HTMLElement>("[data-comments-composer]")
      if (!scroller || !dock) return
      const over = dock.getBoundingClientRect().bottom - page.getBoundingClientRect().bottom
      if (over > 1) scroller.scrollTop += over
    },
  )

  /* ── IN ── up from the foot on the spring, the community easing back, from the first frame painted. */
  useLayoutEffect(() => {
    noted.current = window.scrollY
    const st = stage()
    let arrived = false
    const shown = () => {
      if (arrived) return
      arrived = true
      /* Arrived: the page covers the screen, so the community is let go of (unseen), and carries nothing of ours while the post is open. */
      if (!closing.current && !holding.current && (st?.at() ?? 1) >= 1) st?.release()
      done.current.onShown()
    }
    if (!st || reduced() || typeof pageRef.current?.animate !== "function") {
      st?.set(1)
      shown()
      return
    }
    st.set(0)
    /* A finger that catches it on the way in stops the move where it is: it has still arrived. */
    void st.run(0, 1, OPEN_MS).then(() => {
      if (st.at() >= 1) shown()
    })
    const t = window.setTimeout(shown, OPEN_MS + 300)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ── OUT ── closeSteps, in order. */
  useLayoutEffect(() => {
    if (open) return
    closing.current = true
    const layer = layerRef.current
    const page = pageRef.current
    const trigger: CloseTrigger = how.current ?? (closedByBrowserSwipe(performance.now() - lastEdgeTouch, edgeSwipeEnvironment()) ? "browser-swipe" : "history")
    const still = reduced() || !page || typeof page.animate !== "function"
    const steps = closeSteps(trigger, still)
    const st = stage()
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      /* HIDE-PAGE on the move's last frame, then RELEASE-COMMUNITY: at that frame it is at its own size, so nothing shows. */
      if (layer) layer.style.visibility = "hidden"
      st?.release()
      done.current.onGone()
    }
    /* The keyboard goes down with the post, not after it. */
    const active = document.activeElement as HTMLElement | null
    if (active && page?.contains(active)) active.blur()
    /* HOLD-FEED: the feed exactly where it was, while the post still covers it. */
    const back = noted.current === null ? null : feedRestore(noted.current, window.scrollY)
    if (back !== null) window.scrollTo({ top: back, behavior: "instant" as ScrollBehavior })
    if (!st || steps.includes("cut")) {
      end()
      return
    }
    /* RECEDE: from wherever the page is (a finger may have it part way), the community where a sheet there leaves it. */
    st.stop()
    const from = st.at()
    st.set(from)
    const H = window.innerHeight
    const fromFinger = trigger === "pull" || trigger === "edge"
    const ms = fromFinger ? closeMsFrom(from, H, letGo.current) : CLOSE_MS
    /* SLIDE-DOWN. Held at its last frame (fill) until it is hidden, so it can never be drawn back at rest for a frame. */
    void st.run(from, 0, ms, { hold: true, velocity: fromFinger ? springVelocity(letGo.current, from * H) : 0 }).then(end)
    /* A tab in the background draws no frames: it still goes. */
    const t = window.setTimeout(end, ms + 300)
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

  /*
    ── THE PULL DOWN AND THE EDGE SWIPE ── native listeners: React's touchmove is passive, and these have to refuse the
    browser's scroll. A finger pulling down with the post at its top takes the sheet down; a finger from the left edge (the app
    on iOS only: a browser has its own swipe back there) takes it down by its sideways travel. Either is the sheet's own motion
    following the finger (page-sheet.ts: the page, the community easing forward, the dim), from the first pixel it claims.
  */
  useEffect(() => {
    const page = pageRef.current
    const scroller = scrollRef.current
    if (!page || !scroller) return
    const edgeOn = edgeSwipeEnvironment()
    let mode: "edge?" | "edge" | "pull" | "scroll" | "none" | null = null
    let startX = 0
    let startY = 0
    let atTop = false
    let atEnd = false
    let samples: Array<[number, number]> = []
    let overflow = ""
    let offset = 0
    let edgeX = 0
    const W = () => page.offsetWidth || window.innerWidth
    const H = () => window.innerHeight
    const take = () => {
      holding.current = true
      stage()?.stop()
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
      edgeX = 0
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
        edgeX = Math.max(0, Math.min(W(), dx))
        offset = edgeOffset(edgeX, W(), H())
      } else offset = Math.max(0, pullOffset(dy))
      stage()?.set(progressFromOffset(offset, H()))
      samples.push([e.timeStamp, offset])
      if (samples.length > 10) samples.shift()
    }
    /* Not far enough: back up to rest on the spring, and the community let go once it is covered again. */
    const springBack = (ms: number) => {
      const st = stage()
      if (!st) return
      const from = st.at()
      if (reduced()) {
        st.set(1)
        st.release()
        return
      }
      void st.run(from, 1, ms).then(() => {
        if (!closing.current && st.at() >= 1) st.release()
      })
    }
    const onEnd = (e: TouchEvent) => {
      const was = mode
      mode = null
      if (was !== "edge" && was !== "pull") return
      holding.current = false
      if (was === "pull") scroller.style.overflowY = overflow
      samples.push([e.timeStamp, offset])
      const v = releaseVelocity(samples)
      if (was === "edge") {
        if (shouldComplete(edgeX, W(), v)) {
          letGo.current = Math.max(0, v)
          request("edge")
        } else springBack(320)
        return
      }
      if (pullVerdict({ dy: offset, velocity: v, height: H() }) === "close") {
        letGo.current = Math.max(0, v)
        request("pull")
      } else springBack(320)
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
      {/* Between the community and the sheet: the dim, and the dark edge round the community as it eases back (page-sheet-stage.tsx). */}
      <SheetBackdrop ref={backdropRef} />
      <div
        ref={pageRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-post-overlay="phone"
        className={`absolute inset-x-0 flex flex-col rounded-t-[12px] bg-white shadow-[0_-8px_28px_-14px_rgba(16,24,40,0.3)] ${open ? "pointer-events-auto" : "pointer-events-none"}`}
        style={{ top: "var(--vv-top, 0px)", height: "calc(var(--vv-h, 100dvh) - var(--buyer-tabs-h, 0px))" }}
      >
        {/* THE SKIRT: the page's white runs on past the screen's foot, under the keyboard and the tab bar, so nothing behind ever shows between the comment box and the keys. */}
        <div aria-hidden className="absolute inset-x-0 top-full h-[100lvh] bg-white" data-post-skirt="" />
        <div
          ref={scrollRef}
          data-post-overlay-scroll=""
          data-sheet-scroll=""
          className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain rounded-t-[12px] [-webkit-overflow-scrolling:touch]"
        >
          <div className="flex min-h-full flex-col" style={{ paddingTop: `calc(${SAFE_TOP} + ${BAR_PX}px)` }}>
            <div ref={contentRef} className="flex min-h-full flex-1 flex-col bg-white" data-post-overlay-phase="">
              {children}
            </div>
          </div>
        </div>
        {/* THE TOP: part of the page, so it moves with it and is never a second header over the community's. A soft blur under the status bar once the post scrolls, and the way back. */}
        <div data-post-fullscreen-top="" className="pointer-events-none absolute inset-x-0 top-0 z-[5] overflow-hidden rounded-t-[12px]" style={{ height: `calc(${SAFE_TOP} + ${BAR_PX + 18}px)` }}>
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
      {/* ?kbdebug=1 (THE KEYBOARD READOUT): hidden unless asked for, and only while a field in the post is typed in. */}
      <div ref={debugRef} hidden aria-hidden className="pointer-events-none absolute left-2 right-2 z-[10] whitespace-pre rounded-lg bg-[#1a1a2e]/85 px-2.5 py-2 font-mono text-[10.5px] leading-[1.45] text-white" style={{ top: "calc(env(safe-area-inset-top, 0px) + 56px)" }} data-kbdebug="" />
    </div>,
    document.body,
  )
}
