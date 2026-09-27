"use client"

/**
 * ===========================================================================
 *  HOME'S BANNER: WHAT MATTERS NOW, BESIDE THE GLOBE
 * ===========================================================================
 * "The banner with the globe should present announcements that matter, a
 * slideshow based on the user's progress ... autoplay, performance
 * optimized, good on mobile ... the content should not overlap into the
 * globe."
 *
 * WHAT IT SAYS is lib/home/announcements.ts: rules on the creator's real
 * state (the facts Getting started reads, lib/home/progress, the sales
 * counted on the server and the plan), most important first, at most five,
 * with the step the card names next leading. Only this store's things:
 * connect payouts, a first sale, what Pro would really have saved.
 *
 * THE SLIDES MOVE ON THE COMPOSITOR, ONE TRACK, NO LIBRARY. "Still
 * glitchy, not smooth, laggy and flashy on autoplay and on finger swipe on
 * phones. I want it smooth, like 200fps." embla-carousel (the version
 * before this) animated the track from a requestAnimationFrame loop on the
 * page's thread: every frame of a glide was a script writing a transform,
 * and Home's thread also draws the globe every frame. On a slowed phone the
 * glide then moved in steps of a third of the banner (124px in one frame,
 * 168px across the loop, measured by scripts/check-home-banner-motion.mjs),
 * and its select event re-rendered the banner as each glide began.
 *
 * Now a glide is one Web Animation on the track's `transform`, which the
 * browser hands to the compositor: it runs on its own thread at the
 * screen's rate whatever the page's thread is doing, and nothing in React
 * renders for it. Which slide is showing lives in a ref, and the few
 * attributes that say so (inert, data-slide, the segment's data-on) are set
 * on the DOM directly, so a change renders nothing.
 *
 *   THE LOOP. The track holds a copy of the last slide before the first and
 *   a copy of the first after the last (aria-hidden, inert). From the last
 *   slide the clock glides on to the copy of the first, and at the end the
 *   track's resting place is the real first, which looks exactly the same:
 *   the resting transform is written before the glide starts and the glide
 *   names both of its ends, so the swap needs no frame of its own. No
 *   opacity, no jump back, no slide ever moved in the DOM.
 *
 *   THE FINGER. Pointer events on the viewport, with touch-action pan-y: up
 *   or down is the page's scroll at once (a pointercancel here), sideways is
 *   the carousel's. A finger landing on a slide mid glide catches it where
 *   it is drawn. The track follows the finger one to one by transform, and
 *   on release the speed of the last VELOCITY_WINDOW_MS picks the slide (a
 *   flick always goes on one), and the landing glide starts at the finger's
 *   own speed (its curve's first slope is the throw), so the hand off has no
 *   kink. The drag's own click is not a press on the button under it.
 *
 *   Every slide is mounted once and stays mounted, in one row; the banner
 *   has one height at each width whatever the slide says. The slides hold
 *   words only, so there is no picture to decode before one slides in.
 *
 *   THE FADE at the text's right edge is a still layer of the banner's own
 *   background laid over the track, not a mask on the moving part, so no
 *   frame of a glide has to redraw a mask.
 *
 * THE CLOCK is SLIDE_MS a slide, drawn in the slide's own segment under the
 * text: a CSS animation on `transform`, and the carousel moves on when it
 * ends, so no timer runs. It waits while a mouse is over the banner, while
 * focus is inside it, while a finger is on it, while it is off screen and
 * while the tab is hidden, and goes on after. The segments pick a slide
 * (arrow keys move between them), each a 44px target. Screen readers hear a
 * change they asked for and none they did not (aria-live off while it plays
 * by itself). With reduced motion the clock still turns the slides, and a
 * change is simply there: no glide, no momentum.
 *
 * THE GLOBE (components/app/home/globe) has its own column and never moves
 * with the slides: the text's right padding and the globe's place are one
 * set of numbers, per banner width (container queries on the banner, so the
 * sidebar cannot throw them out), and the text column ends where the
 * globe's atmosphere begins. The carousel stops where the globe's grip
 * starts, so the two never share a finger: on the ball it is the globe's,
 * on the text the carousel's.
 *
 * THE BACKGROUND is light grey, painted once; nothing in it moves.
 *
 * Buttons go where the sidebar's rows go and the same way
 * (components/app/app-link).
 */
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type AnimationEvent, type KeyboardEvent, type ReactNode } from "react"
import { AppLink } from "@/components/app/app-link"
import { announcementsFor, fromFacts, type Announcement, type SalesSummary } from "@/lib/home/announcements"
import type { ProgressFacts } from "@/lib/home/progress"
import { BannerGlobe } from "./globe"

/** How long a slide stays, in ms. */
export const SLIDE_MS = 9000

/** The clock's glide to the next slide, and a segment's: a calm half second, on one curve. */
export const GLIDE_MS = 560
export const GLIDE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)"
/** A throw's landing is never quicker or slower than these. */
const THROW_MIN_MS = 220
const THROW_MAX_MS = 480
/** How far ahead a throw is carried, in ms of its speed, when choosing the slide it lands on. */
const THROW_PROJECT_MS = 240
/** A throw at least this fast (px per ms) goes on to the next slide, however short the drag. */
const FLICK_SPEED = 0.35
/** Only the finger's last moves count toward a throw's speed. */
const VELOCITY_WINDOW_MS = 100
/** A drag let go this long after the finger stopped is no throw at all. */
const STOPPED_MS = 60

export interface HomeBannerProps {
  /** What the account has done, as Getting started reads it (lib/home/progress). Read only. */
  facts: ProgressFacts
  planId: string
  /** The sales, counted on the server over every order (app/app/page.tsx, lib/home/announcements salesSummaryFrom). */
  sales: SalesSummary
  /** Opens Home's share sheet, when there is an address to hand out. */
  onShare?: () => void
  /** Opens Getting started's guide (the welcome slide's button). */
  onGuide?: () => void
}

export const HomeBanner = memo(function HomeBanner({ facts, planId, sales, onShare, onGuide }: HomeBannerProps) {
  /* One clock for the page view: the same on the server and in the browser to the second, so the words agree. */
  const [now] = useState(() => Date.now())
  const list = useMemo(() => announcementsFor(fromFacts(facts, sales, planId, !!onShare), now), [facts, sales, planId, onShare, now])
  return <BannerView list={list} onShare={onShare} onGuide={onGuide} />
})

/* ─── The view ─────────────────────────────────────────────────────────── */

/** Why the clock is held. Any of them holds it. */
const HOVER = 1
const FOCUS = 2
const TOUCH = 4
const HIDDEN = 8

/**
 * WHERE THE TRACK STANDS is counted in SLOTS: slot 0 is the first thing in
 * the track. With more than one slide the track is [copy of the last, the
 * slides, copy of the first], so slide i sits in slot i + 1; with one it is
 * just the slide, in slot 0. At rest the transform is a percentage of the
 * track's own width (one slide), so a resize never leaves it between two.
 */
const restAt = (slot: number) => `translate3d(${-slot * 100}%, 0, 0)`
const pxAt = (slot: number, width: number) => `translate3d(${(-slot * width).toFixed(2)}px, 0, 0)`

function BannerView({ list, onShare, onGuide }: { list: Announcement[]; onShare?: () => void; onGuide?: () => void }) {
  const count = list.length
  const looped = count > 1
  const rootRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  /* The slide showing, and its id, which a new list keeps it by. Never React state: a change renders nothing. */
  const at = useRef(0)
  const shownId = useRef<string | undefined>(list[0]?.id)
  /* The glide running, if one is. */
  const glideRef = useRef<Animation | null>(null)
  /* A change the reader asked for is read out; one the clock made is not. */
  const asked = useRef(false)
  /* Reduced motion, read live: a change is a jump rather than a glide. */
  const calm = useRef(false)
  /* For the handlers, which outlive a render. */
  const shape = useRef({ count, looped, list })
  shape.current = { count, looped, list }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => { calm.current = mq.matches }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [])

  /*
    WHY THE CLOCK IS HELD LIVES OUTSIDE REACT. A hover, a focus, a finger
    down or the banner leaving the screen only pauses the segment's
    animation; as state, each of them re-rendered the banner inside the
    touch that started a scroll. They set one attribute on the tabs.
  */
  const holdRef = useRef(0)
  const applyHold = useCallback(() => {
    tabsRef.current?.toggleAttribute("data-held", holdRef.current !== 0)
  }, [])
  const setBit = useCallback((bit: number, on: boolean) => {
    holdRef.current = on ? holdRef.current | bit : holdRef.current & ~bit
    applyHold()
  }, [applyHold])
  /* The tabs, when they appear, start in whatever state the banner is in. */
  const tabsAt = useCallback((el: HTMLDivElement | null) => {
    tabsRef.current = el
    applyHold()
  }, [applyHold])

  /* Off screen or on a hidden tab, the clock waits. */
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let onScreen = true
    const sync = () => setBit(HIDDEN, !onScreen || document.visibilityState === "hidden")
    const io = typeof IntersectionObserver === "function"
      ? new IntersectionObserver(([entry]) => {
          onScreen = entry.isIntersecting
          sync()
        })
      : null
    io?.observe(el)
    document.addEventListener("visibilitychange", sync)
    sync()
    return () => {
      io?.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [setBit])

  /* ── Slots, and the track ───────────────────────────────────────────── */
  const slotOf = useCallback((i: number) => (shape.current.looped ? i + 1 : i), [])
  /** The slide a slot shows: a copy's slot is the slide it copies. */
  const slideAt = useCallback((slot: number) => {
    const { count: n, looped: loops } = shape.current
    if (!loops) return Math.max(0, Math.min(n - 1, Math.round(slot)))
    return (((Math.round(slot) - 1) % n) + n) % n
  }, [])
  /** The same picture, nearer the middle: a place over a copy is the same place over the slide it copies. */
  const inRange = useCallback((slot: number) => {
    const { count: n, looped: loops } = shape.current
    if (!loops) return slot
    if (slot > n + 0.5) return slot - n
    if (slot < 0.5) return slot + n
    return slot
  }, [])
  /* The viewport's exact width, fractions and all: a slot at rest is 100% of it, and a glide's px must end on the same place. */
  const width = () => viewportRef.current?.getBoundingClientRect().width || 1
  /** Where the track is drawn now, in slots, a glide's current frame included. */
  const standing = useCallback((): number => {
    const t = trackRef.current
    if (!t) return 0
    const m = new DOMMatrixReadOnly(getComputedStyle(t).transform)
    return -m.m41 / width()
  }, [])
  /** Stop a glide where it is drawn: its frame is written as the track's own transform first, so nothing jumps. */
  const catchGlide = useCallback((): number => {
    const t = trackRef.current
    const slot = inRange(standing())
    const running = glideRef.current
    glideRef.current = null
    if (t) t.style.transform = pxAt(slot, width())
    running?.cancel()
    return slot
  }, [inRange, standing])

  /*
    THE MARKS: which slide shows (inert on the others, data-slide) and which
    segment runs the clock (data-on, aria-selected, the tab stop). On the DOM
    directly. data-slide rather than data-state and inert rather than
    aria-hidden: either of those changing makes a :has() on <html> in
    globals.css restyle the whole page.
  */
  const mark = useCallback((i: number) => {
    const root = rootRef.current
    if (!root) return
    at.current = i
    shownId.current = shape.current.list[i]?.id
    root.querySelectorAll<HTMLElement>(".home-banner-slide[data-announcement]").forEach((s, k) => {
      const on = k === i
      if (s.inert === on) s.inert = !on
      if (s.dataset.slide !== (on ? "active" : "idle")) s.dataset.slide = on ? "active" : "idle"
    })
    tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]").forEach((tab, k) => {
      const on = k === i
      tab.setAttribute("aria-selected", on ? "true" : "false")
      tab.tabIndex = on ? 0 : -1
      tab.toggleAttribute("data-on", on)
    })
    trackRef.current?.setAttribute("aria-live", asked.current ? "polite" : "off")
  }, [])

  /**
   * Glide from `from` to `to` (slots) over `ms` on `easing`, on the
   * compositor. The resting transform, at the real slide `to` shows, is
   * written first; the animation names both its ends, so the moment it ends
   * the resting place is already there and is the same picture.
   */
  const glide = useCallback((from: number, to: number, ms: number, easing: string) => {
    const t = trackRef.current
    if (!t) return
    const running = glideRef.current
    glideRef.current = null
    const rest = slotOf(slideAt(to))
    t.style.transform = restAt(rest)
    running?.cancel()
    const w = width()
    if (calm.current || ms <= 0 || Math.abs(to - from) * w < 0.5 || typeof t.animate !== "function") return
    const a = t.animate([{ transform: pxAt(from, w) }, { transform: pxAt(to, w) }], { duration: ms, easing })
    glideRef.current = a
    a.onfinish = () => {
      if (glideRef.current === a) glideRef.current = null
    }
  }, [slideAt, slotOf])

  /* The list, first and whenever it changes: the slide showing stays the one showing, at rest. */
  useLayoutEffect(() => {
    const kept = list.findIndex((a) => a.id === shownId.current)
    const i = kept >= 0 ? kept : Math.min(at.current, Math.max(0, count - 1))
    const running = glideRef.current
    glideRef.current = null
    running?.cancel()
    if (trackRef.current) trackRef.current.style.transform = restAt(slotOf(i))
    mark(i)
  }, [list, count, mark, slotOf])

  /** A segment, an arrow key: to that slide, round the loop when that is the one step. */
  const go = useCallback((to: number) => {
    const { count: n, looped: loops } = shape.current
    if (!loops) return
    asked.current = true
    const from = catchGlide()
    const now = at.current
    const target = now === n - 1 && to === 0 ? n + 1 : now === 0 && to === n - 1 ? 0 : slotOf(to)
    mark(to)
    glide(from, target, GLIDE_MS, GLIDE_EASE)
  }, [catchGlide, glide, mark, slotOf])
  /** The clock: the showing segment's fill ended. On to the next, forwards, the last to the first by its copy. */
  const advance = useCallback(() => {
    if (!shape.current.looped) return
    asked.current = false
    const from = catchGlide()
    const target = Math.round(from) + 1
    mark(slideAt(target))
    glide(from, target, GLIDE_MS, GLIDE_EASE)
  }, [catchGlide, glide, mark, slideAt])
  const onFillEnd = (e: AnimationEvent<HTMLDivElement>) => {
    if (!/^home-banner-fill/.test(e.animationName)) return
    if (!(e.target as Element).closest("[role=tab]")?.hasAttribute("data-on")) return
    advance()
  }

  /* ── The finger ─────────────────────────────────────────────────────── */
  useEffect(() => {
    const root = viewportRef.current
    const track = trackRef.current
    if (!root || !track || count < 2) return
    type Drag = { id: number; mouse: boolean; x0: number; y0: number; s0: number; s: number; on: boolean; moves: { t: number; x: number }[] }
    let drag: Drag | null = null
    /* A drag ends in a click where the mouse comes up; that click is the drag's, not the button's under it. */
    let draggedUntil = -1

    const down = (e: PointerEvent) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return
      /* A finger landing on a slide on its way catches it where it is drawn. */
      const s0 = catchGlide()
      drag = { id: e.pointerId, mouse: e.pointerType === "mouse", x0: e.clientX, y0: e.clientY, s0, s: s0, on: false, moves: [{ t: e.timeStamp, x: e.clientX }] }
      asked.current = true
      setBit(TOUCH, true)
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x0
      if (!drag.on) {
        /* Not until the move is sideways: until then the browser may still make it the page's scroll. */
        if (Math.abs(dx) < 4 || Math.abs(dx) < Math.abs(e.clientY - drag.y0)) return
        drag.on = true
        if (drag.mouse) root.setPointerCapture(e.pointerId)
      }
      const w = width()
      /* One to one, and never past the copies at either end. */
      drag.s = Math.max(0, Math.min(count + 1, drag.s0 - dx / w))
      track.style.transform = pxAt(drag.s, w)
      drag.moves.push({ t: e.timeStamp, x: e.clientX })
      while (drag.moves.length > 2 && e.timeStamp - drag.moves[0].t > VELOCITY_WINDOW_MS) drag.moves.shift()
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (d.mouse && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
      setBit(TOUCH, false)
      const w = width()
      /* The throw: the finger's speed over its last moves, none if it had stopped or the browser took the move. */
      const first = d.moves[0]
      const last = d.moves[d.moves.length - 1]
      const live = e.type === "pointerup" && d.on && e.timeStamp - last.t <= STOPPED_MS && last.t > first.t
      const vx = live ? (last.x - first.x) / (last.t - first.t) : 0
      const v = -vx / w
      const base = Math.round(d.s0)
      let target = Math.round(d.s + v * THROW_PROJECT_MS)
      if (Math.abs(vx) >= FLICK_SPEED && Math.sign(d.s - d.s0) === Math.sign(v)) target = base + Math.sign(v)
      target = Math.max(base - 1, Math.min(base + 1, Math.max(0, Math.min(count + 1, target))))
      if (d.on && Math.abs(last.x - d.x0) > 10) draggedUntil = e.timeStamp + 400
      const i = slideAt(target)
      if (i !== at.current) mark(i)
      /*
        THE LANDING STARTS AT THE FINGER'S SPEED. An ease out whose first
        slope is the throw: slope = speed toward the slide x duration /
        distance, and the curve's first control point is (0.25, 0.25 x
        slope). A soft let go lands on the plain curve.
      */
      const dist = Math.abs(target - d.s) * w
      const toward = vx === 0 ? 0 : -vx * Math.sign(target - d.s)
      let ms: number
      let easing: string
      if (toward > 0.05 && dist > 1) {
        ms = Math.max(THROW_MIN_MS, Math.min(THROW_MAX_MS, (2.4 * dist) / toward))
        const slope = (toward * ms) / dist
        easing = `cubic-bezier(0.25, ${Math.min(1, 0.25 * slope).toFixed(3)}, 0.3, 1)`
      } else {
        ms = Math.max(THROW_MIN_MS, Math.min(THROW_MAX_MS, 240 + (200 * dist) / w))
        easing = "cubic-bezier(0.25, 0.8, 0.3, 1)"
      }
      glide(d.s, target, ms, easing)
    }
    const click = (e: MouseEvent) => {
      if (e.timeStamp > draggedUntil) return
      draggedUntil = -1
      e.preventDefault()
      e.stopPropagation()
    }
    /* A link or a picture dragged by the mouse would start the browser's own drag and cancel this one. */
    const noNativeDrag = (e: DragEvent) => e.preventDefault()

    root.addEventListener("pointerdown", down)
    root.addEventListener("pointermove", move)
    /* On the window: a mouse let go outside the banner before a drag began still ends it. */
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", up)
    root.addEventListener("click", click, true)
    root.addEventListener("dragstart", noNativeDrag)
    return () => {
      root.removeEventListener("pointerdown", down)
      root.removeEventListener("pointermove", move)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", up)
      root.removeEventListener("click", click, true)
      root.removeEventListener("dragstart", noNativeDrag)
      if (drag) setBit(TOUCH, false)
    }
  }, [count, catchGlide, glide, mark, setBit, slideAt])

  /* ── The segments, as tabs ──────────────────────────────────────────── */
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = at.current
    const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: count - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    const to = ((keys[e.key] % count) + count) % count
    go(to)
    const tab = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[to]
    tab?.focus()
  }

  /*
    A slide as drawn. The marks (inert, data-slide) are the first slide's
    here and then only ever set by `mark`: these values never change between
    renders, so React never writes over what mark has set.
  */
  const slide = (a: Announcement, i: number, copy: "" | "before" | "after"): ReactNode => (
    <div
      key={copy ? `${copy}-${a.id}` : a.id}
      {...(copy
        ? { "aria-hidden": true, "data-copy": copy, inert: true }
        : {
            id: `home-banner-slide-${a.id}`,
            role: count > 1 ? "tabpanel" : "group",
            "aria-roledescription": "slide",
            "aria-label": `${i + 1} of ${count}`,
            inert: i !== 0,
            "data-slide": i === 0 ? "active" : "idle",
            "data-announcement": a.id,
          })}
      className="home-banner-slide"
    >
      <p className={`home-banner-eyebrow${a.tone === "critical" ? " is-critical" : ""}`}>{a.eyebrow}</p>
      {/* "5 hours ago" is worked out on the server and again in the browser a moment later; across an
          hour's boundary the two differ by a word, which the next render settles. Not a reason to
          throw the server's page away. */}
      <h2 className="home-banner-title" suppressHydrationWarning>{a.title}</h2>
      <p className="home-banner-line" suppressHydrationWarning>{a.line}</p>
      <div className="home-banner-cta-row">
        {(a.action === "share" && onShare) || (a.action === "guide" && onGuide) ? (
          <button type="button" className="home-banner-cta" onClick={a.action === "share" ? onShare : onGuide}>
            {a.cta}
          </button>
        ) : (
          <AppLink href={a.href} className="home-banner-cta">
            {a.cta}
          </AppLink>
        )}
      </div>
    </div>
  )

  return (
    <section
      ref={rootRef}
      data-home-banner=""
      aria-roledescription="carousel"
      aria-label="Announcements"
      className="home-banner relative isolate overflow-hidden rounded-2xl"
      onPointerEnter={(e) => e.pointerType === "mouse" && setBit(HOVER, true)}
      onPointerLeave={(e) => e.pointerType === "mouse" && setBit(HOVER, false)}
      onFocus={() => setBit(FOCUS, true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBit(FOCUS, false)
      }}
    >
      <style href="home-banner" precedence="default">{BANNER_CSS}</style>
      <div aria-hidden="true" className="home-banner-bg" />
      <div className="home-banner-inner" data-count={count}>
        {/* The viewport: its first child is the track, and the track's children are the slides, with a copy at each end when they loop. */}
        <div ref={viewportRef} className="home-banner-text">
          <div ref={trackRef} className="home-banner-track" aria-live="off" style={{ transform: restAt(looped ? 1 : 0) }}>
            {looped && slide(list[count - 1], count - 1, "before")}
            {list.map((a, i) => slide(a, i, ""))}
            {looped && slide(list[0], 0, "after")}
          </div>

          {count > 1 && (
            <div ref={tabsAt} role="tablist" aria-label="Announcements" className="home-banner-tabs" onKeyDown={onTabKey} onAnimationEnd={onFillEnd}>
              {list.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  aria-selected={i === 0}
                  aria-controls={`home-banner-slide-${a.id}`}
                  aria-label={a.title}
                  tabIndex={i === 0 ? 0 : -1}
                  className="home-banner-tab"
                  data-on={i === 0 ? "" : undefined}
                  onClick={() => go(i)}
                >
                  <span className="home-banner-tab-track">
                    {/*
                      EVERY SEGMENT KEEPS ITS FILL, and the showing one runs it (data-on, set by mark).
                      Mounting a new fill for each slide was a DOM insertion, and any
                      insertion on /app makes the :has() rules on <html> in globals.css
                      restyle the whole page. An attribute change costs a handful.
                    */}
                    <span className="home-banner-tab-fill" style={{ animationDuration: `${SLIDE_MS}ms` }} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {/* The fade into the globe's room: the banner's own background over the track's right edge, still. */}
        <div aria-hidden="true" className="home-banner-fade" />

        <BannerGlobe className="home-banner-globe" />
      </div>
    </section>
  )
}

/* ─── The look ─────────────────────────────────────────────────────────── */

/**
 * THE GEOMETRY, in one place. `--g` is the globe's square box, `--gx` how
 * far its centre sits from the banner's right edge, `--gy` how far below
 * the middle. The ball's radius is 0.4 of the box and its atmosphere
 * reaches 0.452 (globe-scene GLOBE_RADIUS, and the 1.13 the renderers draw
 * the halo to), so the text stops `--gap` short of `--gx + 0.452 * --g`
 * from the right. The globe takes a finger out to 0.424 of the box (its
 * GRIP), and that is where the carousel ends (`--grip-r`): the same numbers
 * place the globe, end the carousel, the text and the segments, and cannot
 * disagree. Per banner width, by container
 * query, because the sidebar makes the viewport a poor guide to how wide
 * the banner is.
 */
const BANNER_CSS = `
.home-banner {
  container-type: inline-size;
  border: 1px solid #e3e5ea;
  background: #f3f4f6;
  box-shadow:
    0 1px 2px rgba(16, 24, 40, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.home-banner-bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  /* Clean light grey, a touch lighter at the top left where the light comes from. No violet, no
     pattern: "something more clean, smooth, not eye candy, more towards light grey". Painted once. */
  background:
    radial-gradient(60% 120% at 12% 0%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 70%),
    linear-gradient(180deg, #f6f7f9 0%, #f1f2f5 100%);
}

/*
  ONE HEIGHT, TALL ENOUGH FOR THE LONGEST SLIDE AT EVERY WIDTH, AND NO
  TALLER. "The banner shouldn't look fat, and not so much space between the
  lines and the button." The button row sits at the bottom of the text
  (margin-top: auto), and under it the segments' row, --foot: 44px, which is
  each segment's target, so a thumb can pick one. Every line is 48
  characters at most (lib/home/announcements). Phone type to 619px (15/20
  title, 13/17 body, two lines each): 18 + 16 + 4 + 40 + 4 + 34 + 12 + 34 +
  44 = 206. From 620 (19/24, 14/19, two lines each): 20 + 16 + 5 + 48 + 5 +
  38 + 12 + 34 + 44 = 222. From 860, one line each: 20 + 16 + 5 + 24 + 5 +
  19 + 12 + 34 + 44 = 179, so 180, the globe sized to sit inside it.
  scripts/check-home-banner.mjs holds every slide of every state to it.
*/
.home-banner-inner {
  --g: 168px;
  --gx: 56px;
  --gy: 4px;
  --gap: 8px;
  --pad-l: 18px;
  --pad-t: 18px;
  --foot: 44px;
  --grip-r: calc(var(--gx) + var(--g) * 0.424);
  /* From the text's end to the globe's grip: the room a slide fades through on its way past. */
  --fade: calc(var(--gap) + var(--g) * 0.028);
  position: relative;
  height: 206px;
}
/* One slide has no segments: the button sits at the foot, where they would start. */
.home-banner-inner[data-count="1"] { --foot: 10px; }
@container (min-width: 380px) {
  .home-banner-inner { --g: 180px; --gx: 64px; --pad-l: 20px; }
}
@container (min-width: 460px) {
  .home-banner-inner { --g: 204px; --gx: 96px; --gy: 6px; --gap: 14px; --pad-l: 26px; }
}
@container (min-width: 620px) {
  .home-banner-inner { --g: 236px; --gx: 132px; --gy: 4px; --gap: 22px; --pad-l: 32px; --pad-t: 20px; height: 222px; }
  .home-banner-inner[data-count="1"] { --foot: 12px; }
}
@container (min-width: 860px) {
  .home-banner-inner { --g: 204px; --gx: 140px; --gy: 0px; --gap: 32px; --pad-l: 36px; height: 180px; }
}

/* Beside the carousel, never under it: a finger on the ball is the globe's (components/app/home/globe). */
.home-banner-globe {
  position: absolute;
  width: var(--g);
  height: var(--g);
  right: calc(var(--gx) - var(--g) / 2);
  top: calc(50% - var(--g) / 2 + var(--gy));
}
/* Its shadow on the banner, thrown down and to the right, away from the light: painted once, it never moves. */
.home-banner-globe::before {
  content: "";
  position: absolute;
  left: 16%;
  right: 2%;
  top: 22%;
  bottom: -4%;
  border-radius: 50%;
  background: radial-gradient(closest-side, rgba(40, 46, 62, 0.14), rgba(40, 46, 62, 0.05) 58%, rgba(40, 46, 62, 0) 100%);
  pointer-events: none;
}

/*
  THE CAROUSEL. Its viewport runs from the banner's left edge to the globe's
  grip, and no further: the globe is drawn see-through, and text sliding
  under it read as a smudge across the ball. A slide leaves by the banner's
  own edge on the left; on the right it fades through --fade, room the text
  never rests in, so nothing is cut by a hard line in the air. pan-y: a
  vertical move is the page's scroll, a sideways one is the carousel's. Not
  selectable, or a mouse dragging the slides paints a text selection.
*/
.home-banner-text {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: var(--grip-r);
  overflow: hidden;
  touch-action: pan-y pinch-zoom;
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
/*
  THE FADE, AS A STILL LAYER. It was a mask on the viewport, and a mask on
  the box the track moves in is part of every frame of a glide. Now it is
  the banner's own background (the same two gradients as .home-banner-bg,
  over the same box, so it lines up exactly), shown only across --fade
  before the viewport's right edge: clear at its start, whole at the edge,
  nothing past it. Painted once; the track moves under it.
*/
.home-banner-fade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(60% 120% at 12% 0%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 70%),
    linear-gradient(180deg, #f6f7f9 0%, #f1f2f5 100%);
  -webkit-mask-image: linear-gradient(to right, transparent calc(100% - var(--grip-r) - var(--fade)), #000 calc(100% - var(--grip-r)), transparent calc(100% - var(--grip-r)));
  mask-image: linear-gradient(to right, transparent calc(100% - var(--grip-r) - var(--fade)), #000 calc(100% - var(--grip-r)), transparent calc(100% - var(--grip-r)));
}
/*
  The track moves by translate3d and nothing else: a Web Animation the
  compositor runs, or the finger's own transform. It is kept on its own
  layer all the time (will-change), so no glide starts by rasterising it
  again. The slides are laid out once, side by side, and never mounted,
  unmounted or re-keyed by a change.
*/
.home-banner-track {
  display: flex;
  height: 100%;
  will-change: transform;
  backface-visibility: hidden;
}
.home-banner-slide {
  flex: 0 0 100%;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--pad-t) var(--fade) var(--foot) var(--pad-l);
}
.home-banner-slide > * {
  /* Never squeezed: a title or a line clipped to fit would be a sentence cut in half. */
  flex-shrink: 0;
  max-width: 560px;
}

.home-banner-eyebrow {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: #6b7280;
}
.home-banner-eyebrow.is-critical { color: #b45309; }
.home-banner-eyebrow.is-critical::before {
  content: "";
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.16);
}
.home-banner-title {
  margin-top: 4px;
  font-size: 15px;
  line-height: 20px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: #1a1a2e;
  text-wrap: balance;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.home-banner-line {
  margin-top: 4px;
  font-size: 13px;
  line-height: 17px;
  color: #5f6673;
  text-wrap: pretty;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
@container (min-width: 620px) {
  .home-banner-title { margin-top: 5px; font-size: 19px; line-height: 24px; letter-spacing: -0.015em; }
  .home-banner-line { margin-top: 5px; font-size: 14px; line-height: 19px; -webkit-line-clamp: 2; }
}
.home-banner-cta-row { margin-top: auto; padding-top: 12px; }
@container (min-width: 860px) {
  .home-banner-title,
  .home-banner-line { -webkit-line-clamp: 1; }
}
.home-banner-cta {
  display: inline-flex;
  align-items: center;
  height: 34px;
  padding: 0 14px;
  border-radius: 10px;
  background: #16161a;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14), 0 1px 2px rgba(0, 0, 0, 0.18);
  transition: background-color 150ms ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.home-banner-cta:hover { background: #2a2a31; }
.home-banner-cta:active { background: #0b0b0d; }
.home-banner-cta:focus-visible { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #8b5cf6; }
@container (min-width: 620px) {
  .home-banner-cta { padding: 0 16px; }
}

/*
  THE SEGMENTS stay where they are while the slides move: inside the
  viewport, so a swipe that starts on them drags the slides too, and over
  the track. Each is a 44px square target with its 30px bar in the middle,
  the first bar lined up with the text; with more slides than 44px each
  allows before the globe, they share the room.
*/
.home-banner-tabs {
  position: absolute;
  left: calc(var(--pad-l) - 7px);
  right: calc(var(--fade) - 7px);
  bottom: 0;
  height: var(--foot);
  display: flex;
}
.home-banner-tab {
  display: flex;
  align-items: center;
  flex: 0 1 44px;
  min-width: 0;
  height: 44px;
  padding: 0 7px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.home-banner-tab-track {
  position: relative;
  display: block;
  width: 100%;
  height: 3px;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(26, 26, 46, 0.13);
  transition: background-color 200ms ease;
}
.home-banner-tab:focus-visible .home-banner-tab-track { box-shadow: 0 0 0 2px #fff, 0 0 0 4px #8b5cf6; }
.home-banner-tab:hover .home-banner-tab-track { background: rgba(26, 26, 46, 0.24); }
.home-banner-tab-fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(26, 26, 46, 0.72);
  transform-origin: left center;
  transform: scaleX(0);
}
/* The showing slide's segment fills over SLIDE_MS; the clock is this animation, and the carousel moves on when it ends. */
.home-banner-tab[data-on] .home-banner-tab-fill {
  animation-name: home-banner-fill;
  animation-timing-function: linear;
  animation-fill-mode: both;
}
.home-banner-tabs[data-held] .home-banner-tab-fill { animation-play-state: paused; }
@keyframes home-banner-fill {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

/* Reduced motion keeps the clock and loses the movement: the segment only marks which slide is
   showing, and the carousel jumps rather than glides (calm, in the view). */
@keyframes home-banner-fill-still {
  from { transform: scaleX(1); }
  to { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  .home-banner-tab[data-on] .home-banner-tab-fill { animation-name: home-banner-fill-still; }
}
`
