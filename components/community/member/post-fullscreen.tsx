"use client"

/**
 * ===========================================================================
 *  A POST, OPENED ON A PHONE: OUT OF ITS CARD (round 17)
 * ===========================================================================
 * Round 19, the owner: "get rid of the bottom sheet for a post on a phone; a
 * full screen page, like a Substack note; a swipe down or the back button
 * closes it. The comment box is a floating bar at the bottom, on the keyboard
 * when it is up, and the comments scroll under it. At the top, as you scroll,
 * a soft blur comes in under the status bar." All of that stays.
 *
 * WHAT ROUND 17 REPLACED, AND WHY. Round 16's page sheet (and round 15's push
 * before it) were turned down on a real iPhone: "I don't like the animation
 * and whole opening of a post in the community, and the close is not
 * smooth." Its engine drove the sheet from one number, scaled the whole
 * community behind it and kept a backdrop blur on the moving page; measured
 * at 4x CPU, its open stopped for 344ms part way up (scripts/check-
 * communities-post17.mjs). NOW the post grows out of the card it was pressed
 * in and shrinks back into it (post-morph.ts, Material's container morph,
 * done so it never shows two contents at once), and every move is a set of
 * Web Animations on the compositor (post-stage.ts), started only once the
 * post is drawn and its first picture decoded. The community behind never
 * moves, scales or blurs; a light scrim fades over it. The style is one
 * constant (post-morph.ts POST_MOTION) if another feel is wanted.
 *
 * THE CLOSE, IN ORDER (post-morph.ts morphCloseSteps): the keyboard down,
 * the feed put back to the scroll it had when the post opened (iOS pans the
 * page under a focused field) while the post still covers it, the card's
 * rectangle read after that, a copy of the card made, the top's blur off,
 * then the one move: the container onto the card, the post's content out and
 * the copy in. It lands on the card showing the copy, and the layer is
 * hidden on the next frame; nothing moves after. A Back the browser drew
 * itself (Safari's edge swipe) is not moved again.
 *
 * THE TAB BAR stays (lib/ui/layers.ts "post": the bar is lifted over the
 * post); the room at the page's foot is the bar's.
 *
 * THE KEYBOARD (images/73.webp, 76.jpg; keyboard-plan.ts). The page always
 * reaches the foot of the screen and beyond, opaque white; only the room at
 * its foot changes, so the comment box rides up and whatever any number says,
 * what is under the box is the page's own white. Round 16 shortened the page
 * to the keyboard and drew a white block as the box's shadow; the post's
 * scroller clips (overflow: auto), so the block ended where the page ended.
 *
 * THE READOUT. ?kbdebug=1 on any address, or a long press (about 1.5s) on the
 * face beside the comment box (the app has no address bar), turns on a small
 * panel of the numbers that placed the box, remembered on this phone; the
 * same press turns it off.
 *
 * Reduced motion: a plain fade.
 */
import { useEffect, useLayoutEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { ChevronLeft } from "lucide-react"
import { useLayer } from "@/lib/ui/layers"
import { hapticTap } from "@/lib/native-bridge"
import { edgeSwipeEnvironment } from "@/lib/navigation/edge-swipe"
import { useKeyboardPlan } from "./visible-box"
import { footCss } from "./keyboard-plan"
import { BACK_CIRCLE, BACK_HIT, BAR_PX, BROWSER_EDGE_PX, closedByBrowserSwipe, edgeOffset, feedRestore, judgeMove, pullOffset, pullVerdict, releaseVelocity, shouldComplete, startsAtEdge, PULL_SLOP, type CloseTrigger } from "./post-motion"
import { CLIPS, CLOSE_MS, OPEN_MS, POST_MOTION } from "./post-morph"
import { postStage, type PostStage } from "./post-stage"

/** How far the scroll goes before the top blur is all the way in. */
const BLUR_IN_PX = 80
/** All the way in, the blur is this strong: a hint under the clock, not a frosted bar (round 20, the owner: "too heavy"). */
const BLUR_MAX = 0.85
/** The status bar's room above the back bar. */
const SAFE_TOP = "max(env(safe-area-inset-top, 0px), 12px)"
/** The long press on the face beside the comment box that turns the readout on or off. */
export const KB_DEBUG_PRESS_MS = 1500

function reduced(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
}

/*
  THE KEYBOARD READOUT. ?kbdebug=1 on any address turns it on, ?kbdebug=0 off; the long press toggles it. Kept in local
  storage, so it stays on on this phone (the opened post's own address drops the query, and the app has no address bar).
*/
export const KB_DEBUG_KEY = "storelib:kbdebug"
function readKbDebugFlag(): boolean {
  if (typeof window === "undefined") return false
  try {
    const asked = new URLSearchParams(window.location.search).get("kbdebug")
    if (asked === "1") window.localStorage.setItem(KB_DEBUG_KEY, "1")
    else if (asked === "0") window.localStorage.removeItem(KB_DEBUG_KEY)
    return window.localStorage.getItem(KB_DEBUG_KEY) === "1" || window.sessionStorage.getItem(KB_DEBUG_KEY) === "1"
  } catch {
    return false
  }
}
export function kbDebugOn(): boolean {
  return readKbDebugFlag()
}
/** The long press: on if it was off, off if it was on; remembered on this phone. */
export function toggleKbDebug(): boolean {
  const on = !readKbDebugFlag()
  try {
    if (on) window.localStorage.setItem(KB_DEBUG_KEY, "1")
    else {
      window.localStorage.removeItem(KB_DEBUG_KEY)
      window.sessionStorage.removeItem(KB_DEBUG_KEY)
    }
  } catch {
    /* No storage: on for as long as this post is open. */
  }
  return on
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

/** The community's frame, marked while a post is open over it (globals.css: the keyboard does not shorten it then). */
function communityShell(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-community-shell]")
}

export interface PostFullscreenProps {
  open: boolean
  label: string
  title: string
  /** Asked to close (the back button, a swipe, Escape): the parent sets `open` false. */
  onRequestClose: () => void
  /** The open has arrived. */
  onShown: () => void
  /** It has gone (landed and hidden): the parent takes it out. */
  onGone: () => void
  /** The card it was pressed in (grown from, landed on), or null: then it fades. */
  origin?: () => HTMLElement | null
  /** Waited for before the move starts (at most PREPARE_CAP_MS): the comments read ahead, say. */
  prepare?: () => Promise<unknown>
  contentRef: React.RefObject<HTMLDivElement | null>
  children: React.ReactNode
}

const CLIP = "absolute inset-0 [[data-moving]_&]:overflow-hidden"

export function PostFullscreen({ open, label, title, onRequestClose, onShown, onGone, origin, prepare, contentRef, children }: PostFullscreenProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const liftRef = useRef<HTMLDivElement>(null)
  const clip0 = useRef<HTMLDivElement>(null)
  const clip1 = useRef<HTMLDivElement>(null)
  const clip2 = useRef<HTMLDivElement>(null)
  const clip3 = useRef<HTMLDivElement>(null)
  const cloneHostRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const blurRef = useRef<HTMLDivElement>(null)
  const debugRef = useRef<HTMLDivElement>(null)
  /* The engine (post-stage.ts). */
  const stageRef = useRef<PostStage | null>(null)
  const stage = () => {
    if (stageRef.current) return stageRef.current
    const layer = layerRef.current
    const scrim = scrimRef.current
    const lift = liftRef.current
    const clips = [clip0.current, clip1.current, clip2.current, clip3.current]
    const cloneHost = cloneHostRef.current
    const page = pageRef.current
    if (!layer || !scrim || !lift || !cloneHost || !page || clips.some((c) => !c)) return null
    stageRef.current = postStage({ layer, scrim, lift, clips: clips as HTMLElement[], cloneHost, page })
    return stageRef.current
  }
  const done = useRef({ onShown, onGone, onRequestClose, origin, prepare })
  useEffect(() => {
    done.current = { onShown, onGone, onRequestClose, origin, prepare }
  })
  /* What closed it (null: a Back, or the parent). */
  const how = useRef<CloseTrigger | null>(null)
  const closing = useRef(false)
  /* The feed's scroll when the post opened: where it is put back before the close moves. */
  const noted = useRef<number | null>(null)
  /*
    THE CLOSE STARTS IN THE PRESS ITSELF (round 17). Back, Escape, a pull or the edge swipe let go start the move here, in the
    event, and tell the parent once the move is over: waiting for the parent's render first left the post still under a
    finger that had let go for 150ms at 4x CPU (scripts/check-communities-post17.mjs PART=pull), and a render a frame into
    the close still landed in it. A close from outside (the browser's
    Back) comes through the `open` effect below.
  */
  const request = (trigger: CloseTrigger) => {
    if (closing.current) return
    how.current ??= trigger
    /* The parent hears of it once the move is over (beginClose's end): its render then lands after the move, not in it. */
    beginClose(trigger, true)
  }
  /* Settled: nothing moving, so the top's blur may come on. */
  const settle = (on: boolean) => layerRef.current?.toggleAttribute("data-settled", on)

  /* THE TAB BAR stays, over the post, for as long as the post is in the page (lib/ui/layers.ts). */
  useLayer("post", true, layerRef)

  /* ── THE KEYBOARD (keyboard-plan.ts) ── the room at the page's foot, before the first frame and on every move of it. */
  useKeyboardPlan(
    true,
    () => pageRef.current,
    () => layerRef.current,
    (plan, facts) => {
      const page = pageRef.current
      if (!page) return
      page.style.setProperty("--post-top", `${plan.top}px`)
      page.style.setProperty("--post-foot", footCss(plan))
      page.dataset.box = plan.source
      page.toggleAttribute("data-typing", facts.typing)
      const panel = debugRef.current
      if (panel) {
        const on = kbDebugOn()
        panel.hidden = !on
        if (on)
          requestAnimationFrame(() => {
            const box = page.querySelector<HTMLElement>("[data-comment-box=comment]")?.getBoundingClientRect()
            const r = (n: number | undefined) => (n === undefined ? "-" : String(Math.round(n)))
            panel.textContent = [
              `${facts.env}  used ${plan.source}  ${facts.typing ? "typing" : "not typing"}`,
              `page top ${plan.top}  foot room ${plan.foot === "tabs" ? "tab bar" : plan.foot}`,
              `innerHeight ${facts.innerH}  layout ${facts.layoutH}  scrollY ${facts.scrollY}`,
              `vv.height ${facts.vvH}  vv.offsetTop ${facts.vvTop}`,
              `native kb ${facts.native || "-"}  table kb ${facts.table ?? "-"}  floor ${facts.published || "-"}`,
              `no keyboard ${facts.fullH ?? "-"}  web view resizes ${facts.resizes ? "yes" : "no"}`,
              `comment box top ${r(box?.top)} bottom ${r(box?.bottom)}  screen ${window.innerHeight}`,
            ].join("\n")
          })
      }
      /*
        THE BOX IN SIGHT ON THE KEYBOARD. The comment box sticks to the scroller's foot only inside the comments section; a long
        post puts that section below the foot, and the box with it. Typing, the page is scrolled by just enough to bring it up.
      */
      if (!facts.typing) return
      const scroller = scrollRef.current
      const dock = page.querySelector<HTMLElement>("[data-comments-composer]")
      if (!scroller || !dock) return
      const over = dock.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom
      if (over > 1) scroller.scrollTop += over
    },
  )

  /* ── IN ── out of the card, once the post is drawn and its first picture decoded (post-stage.ts). */
  useLayoutEffect(() => {
    noted.current = window.scrollY
    communityShell()?.setAttribute("data-post-over", "")
    const st = stage()
    let arrived = false
    const shown = () => {
      if (arrived) return
      arrived = true
      if (!closing.current) settle(true)
      done.current.onShown()
    }
    if (!st) {
      shown()
      return
    }
    void st.open({ style: POST_MOTION, origin: done.current.origin?.() ?? null, reduced: reduced(), prepare: done.current.prepare }).then(shown)
    /* A page in the background draws no frames: it has still arrived. */
    const t = window.setTimeout(shown, OPEN_MS + 700)
    return () => window.clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(
    () => () => {
      communityShell()?.removeAttribute("data-post-over")
    },
    [],
  )

  /* ── OUT ── post-morph.ts morphCloseSteps, in order. */
  const closeTimer = useRef(0)
  function beginClose(trigger: CloseTrigger, ours = false) {
    if (closing.current) return
    closing.current = true
    const layer = layerRef.current
    const page = pageRef.current
    let gone = false
    const end = () => {
      if (gone) return
      gone = true
      window.clearTimeout(closeTimer.current)
      if (layer) layer.style.visibility = "hidden"
      if (ours) done.current.onRequestClose()
      done.current.onGone()
    }
    /* BLUR: the keyboard goes down with the post, not after it. */
    const active = document.activeElement as HTMLElement | null
    if (active && page?.contains(active)) active.blur()
    /* HOLD-FEED: the feed exactly where it was, while the post still covers it. */
    const back = noted.current === null ? null : feedRestore(noted.current, window.scrollY)
    if (back !== null) window.scrollTo({ top: back, behavior: "instant" as ScrollBehavior })
    const st = stage()
    /* A Back the browser already drew as its own swipe: no second move. */
    if (!st || trigger === "browser-swipe") {
      end()
      return
    }
    /* BLUR-OFF, then the one move (MEASURE-CARD and CLONE-CARD are the stage's, after the feed is in place). */
    settle(false)
    void st.close({ style: POST_MOTION, origin: done.current.origin?.() ?? null, reduced: reduced() }).then(end)
    /* A tab in the background draws no frames: it still goes. */
    closeTimer.current = window.setTimeout(end, CLOSE_MS + 600)
  }
  useLayoutEffect(() => {
    if (open || closing.current) return
    beginClose(how.current ?? (closedByBrowserSwipe(performance.now() - lastEdgeTouch, edgeSwipeEnvironment()) ? "browser-swipe" : "history"))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  /* ── THE TOP BLUR ── follows the scroll, once a frame (and is only a blur once settled: the class says so). */
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
    ── THE READOUT'S LONG PRESS ── on the face beside the comment box. Held still for KB_DEBUG_PRESS_MS: on (or off), a light
    tap of the phone's haptics (hapticTap, which reaches iOS too), and the panel shown at once.
  */
  useEffect(() => {
    const page = pageRef.current
    if (!page) return
    let timer = 0
    let at: { x: number; y: number } | null = null
    const cancel = () => {
      window.clearTimeout(timer)
      timer = 0
      at = null
    }
    const onDown = (e: PointerEvent) => {
      const face = (e.target as Element | null)?.closest?.("[data-comment-box=comment] > [data-app-avatar]")
      if (!face) return
      at = { x: e.clientX, y: e.clientY }
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        const on = toggleKbDebug()
        hapticTap("light")
        const panel = debugRef.current
        if (panel) {
          panel.hidden = !on
          if (on) panel.textContent = "Keyboard readout on. Tap the comment box to see the numbers.\nHold the face again to turn it off."
        }
      }, KB_DEBUG_PRESS_MS)
    }
    const onMove = (e: PointerEvent) => {
      if (at && Math.hypot(e.clientX - at.x, e.clientY - at.y) > 10) cancel()
    }
    page.addEventListener("pointerdown", onDown, { passive: true })
    page.addEventListener("pointermove", onMove, { passive: true })
    page.addEventListener("pointerup", cancel, { passive: true })
    page.addEventListener("pointercancel", cancel, { passive: true })
    return () => {
      cancel()
      page.removeEventListener("pointerdown", onDown)
      page.removeEventListener("pointermove", onMove)
      page.removeEventListener("pointerup", cancel)
      page.removeEventListener("pointercancel", cancel)
    }
  }, [])

  /*
    ── THE PULL DOWN AND THE EDGE SWIPE ── native listeners: React's touchmove is passive, and these have to refuse the
    browser's scroll. A finger pulling down with the post at its top takes it; a finger from the left edge (the app on iOS
    only: a browser has its own swipe back there) takes it sideways. The post follows the finger and shrinks a little (set
    directly, at the finger's own pace); let go past the line it closes into its card with the same container move, from
    where the finger left it, or it goes back to rest.
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
      settle(false)
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
        stage()?.follow(edgeX, 0)
      } else {
        offset = Math.max(0, pullOffset(dy))
        stage()?.follow(0, offset)
      }
      samples.push([e.timeStamp, offset])
      if (samples.length > 10) samples.shift()
    }
    const onEnd = (e: TouchEvent) => {
      const was = mode
      mode = null
      if (was !== "edge" && was !== "pull") return
      if (was === "pull") scroller.style.overflowY = overflow
      samples.push([e.timeStamp, offset])
      const v = releaseVelocity(samples)
      const shut = was === "edge" ? shouldComplete(edgeX, W(), v) : pullVerdict({ dy: offset, velocity: v, height: H() }) === "close"
      if (shut) {
        request(was)
        return
      }
      void stage()
        ?.springBack()
        .then(() => {
          if (!closing.current) settle(true)
        })
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
    <div ref={layerRef} className="pointer-events-none fixed inset-0 z-[130]" data-post-fullscreen="" data-layer-kind="post" data-post-motion={POST_MOTION}>
      {/* Over the community: a light dim, nothing else. The community itself never moves, scales or blurs. */}
      <div ref={scrimRef} aria-hidden className="absolute inset-0 bg-black" style={{ opacity: 0 }} data-post-scrim="" />
      {/* What a finger moves, and what the sheet, push and fade styles move. */}
      <div ref={liftRef} className="absolute inset-0" data-post-lift="">
        {/* THE CONTAINER: four clips, each setting two of its edges and rounding one corner (post-morph.ts), white while the container moves. */}
        <div ref={clip0} className={CLIP} data-clip={CLIPS[0]}>
          <div ref={clip1} className={CLIP} data-clip={CLIPS[1]}>
            <div ref={clip2} className={CLIP} data-clip={CLIPS[2]}>
              <div ref={clip3} className={`${CLIP} [[data-morph]_&]:bg-white`} data-clip={CLIPS[3]}>
                <div
                  ref={pageRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label={label}
                  data-post-overlay="phone"
                  data-keyboard-own=""
                  className={`absolute inset-x-0 bottom-0 flex flex-col bg-white ${open ? "pointer-events-auto" : "pointer-events-none"}`}
                  style={{ top: "var(--post-top, 0px)", paddingBottom: "var(--post-foot, var(--buyer-tabs-h, 0px))" }}
                >
                  {/* THE SKIRT: the page's white runs on past the screen's foot, under the keyboard and the tab bar. It clips with the container while it moves, and nothing cuts it at rest. */}
                  <div aria-hidden className="absolute inset-x-0 top-full h-[100lvh] bg-white" data-post-skirt="" />
                  <div ref={scrollRef} data-post-overlay-scroll="" data-sheet-scroll="" className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain [-webkit-overflow-scrolling:touch]">
                    <div className="flex min-h-full flex-col" style={{ paddingTop: `calc(${SAFE_TOP} + ${BAR_PX}px)` }}>
                      <div ref={contentRef} className="flex min-h-full flex-1 flex-col bg-white" data-post-overlay-phase="">
                        {children}
                      </div>
                    </div>
                  </div>
                  {/* THE TOP: part of the page, so it moves with it and is never a second header over the community's. A soft blur under the status bar once the post scrolls (only once settled: nothing moving carries a blur), and the way back. */}
                  <div data-post-fullscreen-top="" className="pointer-events-none absolute inset-x-0 top-0 z-[5] overflow-hidden" style={{ height: `calc(${SAFE_TOP} + ${BAR_PX + 18}px)` }}>
                    <div
                      ref={blurRef}
                      aria-hidden
                      className="absolute inset-0 bg-white/80 [mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)] [-webkit-mask-image:linear-gradient(to_bottom,#000_40%,rgba(0,0,0,0.6)_70%,transparent)] [[data-settled]_&]:bg-white/60 [[data-settled]_&]:backdrop-blur-[6px] [[data-settled]_&]:[-webkit-backdrop-filter:blur(6px)]"
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
                          className="flex items-center justify-center rounded-full border border-[#e6e8eb] bg-white text-[#1a1a2e] shadow-[0_1px_2px_rgba(16,24,40,0.08),0_4px_12px_-6px_rgba(16,24,40,0.18)] transition-[background-color,scale] duration-150 ease-out group-active/back:scale-[0.94] group-active/back:bg-[#f1f2f4] [[data-settled]_&]:bg-white/90 [[data-settled]_&]:backdrop-blur-md"
                          style={{ width: BACK_CIRCLE, height: BACK_CIRCLE }}
                        >
                          <ChevronLeft className="h-[22px] w-[22px] -translate-x-px" strokeWidth={2.2} aria-hidden />
                        </span>
                      </button>
                      <span className="pointer-events-none absolute inset-x-16 truncate text-center text-[16px] font-semibold text-[#1a1a2e]">{title}</span>
                    </div>
                  </div>
                </div>
                {/* Where the copy of the card goes for a container move, over the page (it fades in as the page fades out on a close). */}
                <div ref={cloneHostRef} aria-hidden className="pointer-events-none absolute inset-0" data-post-clone-host="" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* THE READOUT (?kbdebug=1, or the long press on the face beside the comment box). */}
      <div ref={debugRef} hidden aria-hidden className="pointer-events-none absolute left-2 right-2 z-[10] whitespace-pre-wrap rounded-lg bg-[#1a1a2e]/85 px-2.5 py-2 font-mono text-[10.5px] leading-[1.45] text-white" style={{ top: "calc(env(safe-area-inset-top, 0px) + 56px)" }} data-kbdebug="" />
    </div>,
    document.body,
  )
}
