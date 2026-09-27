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
 * THE SLIDES ARE SWIPER'S, AND A CHANGE IS ITS FADE. "For the banner with
 * the globe, the transition thing of the announcement, make sure it's very
 * smooth ... using this actually on swipe and autoplay as well ... make it:
 * new Swiper('.swiper', { effect: 'fade' }) ... make sure it feels smooth,
 * clean, non laggy the whole thing there, doesn't cause lag."
 *
 * So one announcement dissolves into the next, and the clock, a segment, an
 * arrow key and a finger all ask Swiper for that same fade (SWIPER_OPTIONS).
 * Swiper 14 is already a dependency (components/product/media-swiper). Only
 * the core, EffectFade and their two stylesheets come in here: no Autoplay
 * (THE CLOCK below is the autoplay and the indicator in one animation, and a
 * second timer beside it could only disagree), no Navigation (the segments
 * are the control; the banner has no arrows), no A11y and no Keyboard, both
 * of which would write over the aria this file sets by hand and put another
 * listener on the document.
 *
 * WHAT COMING BACK TO SWIPER COST, MEASURED RATHER THAN ASSUMED. Three
 * things had sent this file to embla-carousel before, and each one is now a
 * number from scripts/check-home-banner.mjs:
 *
 *   ITS LOOP RE-APPENDS SLIDES, and on /app a DOM insertion restyles the
 *   whole page through the :has() rules on <html> in globals.css. So there
 *   is no loop here: `rewind`. With a fade nothing travels sideways, so "on
 *   to the next" and "back to the first" look the same, and rewind moves no
 *   node, needs no duplicate, and reads the same for the clock, a swipe and
 *   the segments. Swiper adds and removes nothing: the probe counts 0 nodes
 *   added or removed inside the banner over a whole run, and a change of
 *   slide recalculates the slides it writes opacity on, not the document.
 *
 *   IT WILL NOT LOOP TWO SLIDES, which two account states have. Rewind has
 *   no such floor: 1, 2, 3 and 5 announcements are each measured, and one
 *   slide is not a carousel at all (no Swiper, no segments, no clock).
 *
 *   ITS TOUCH LISTENERS ARE THE DOCUMENT'S AND CAN CANCEL A SCROLL. Swiper
 *   14 attaches touchstart and touchmove to `document` with
 *   { passive: false } whatever `passiveListeners` says (that parameter is
 *   dead in 14: shared/swiper-core.mjs sets it and never reads it), and a
 *   blocking touchmove listener on the document holds up every scroll on
 *   the page. QUIET, below, takes those three off again and leaves Swiper's
 *   pointer listeners, which cannot hold a scroll up, so the browser decides
 *   the first move (touch-action: pan-y on the viewport): up or down is the
 *   page's scroll, at once, and sideways is the fade's.
 *
 *   Every slide is mounted once and stays mounted; Swiper stacks them with
 *   one transform each and crossfades them by opacity alone, so the banner
 *   has one height at each width whatever the slide says and nothing about a
 *   change touches layout.
 *
 * THE CLOCK is SLIDE_MS a slide, drawn in the slide's own segment under the
 * text: a CSS animation on `transform`, and Swiper fades on when it ends, so
 * no timer runs. It waits while a mouse is over the banner, while focus is
 * inside it, while a finger is on it, while it is off screen and while the
 * tab is hidden, and goes on after. The segments pick a slide (arrow keys
 * move between them), each a 44px target. Screen readers hear a change they
 * asked for and none they did not (aria-live off while it plays by itself).
 * With reduced motion nothing plays by itself and a change asked for is
 * simply there: no fade, no momentum.
 *
 * THE GLOBE (components/app/home/globe) has its own column and never moves
 * with the slides: the text's right padding and the globe's place are one
 * set of numbers, per banner width (container queries on the banner, so the
 * sidebar cannot throw them out), and the text column ends where the
 * globe's atmosphere begins. Swiper stops where the globe's grip starts, so
 * the two never share a finger: on the ball it is the globe's, on the text
 * Swiper's.
 *
 * THE BACKGROUND is light grey, painted once; nothing in it moves.
 *
 * Buttons go where the sidebar's rows go and the same way
 * (components/app/app-link).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import Swiper from "swiper"
import type { Swiper as SwiperClass, SwiperOptions } from "swiper/types"
import { EffectFade } from "swiper/modules"
import { AppLink } from "@/components/app/app-link"
import { announcementsFor, fromFacts, type Announcement, type SalesSummary } from "@/lib/home/announcements"
import type { ProgressFacts } from "@/lib/home/progress"
import { BannerGlobe } from "./globe"

/* Swiper's own two, and no more: the core's layout and the fade. */
import "swiper/css"
import "swiper/css/effect-fade"

/** How long a slide stays, in ms. */
export const SLIDE_MS = 9000
/**
 * How long the fade takes, in ms. The two slides cross early (the curve
 * below is steep at its start, so the one coming in passes the one going out
 * inside the first 60ms) and the rest is the tail settling, which is what
 * reads as smooth rather than as a cut.
 */
export const FADE_MS = 260

/**
 * new Swiper(el, SWIPER_OPTIONS), which is the owner's snippet plus the
 * decisions that belong to this banner:
 *
 *   effect fade, crossFade   The announcement going out loses exactly the
 *                            opacity the one coming in gains, so some text
 *                            is on screen in every frame of a change and the
 *                            two are never both readable. Without crossFade
 *                            Swiper leaves the old slide at full opacity
 *                            under the new one, which for text is two
 *                            sentences printed over each other.
 *   rewind, not loop         No DOM move, no duplicate slide, and two slides
 *                            work (see the header).
 *   resistanceRatio 0.05     A drag past the first or the last slide moves
 *                            a third of a pixel: the text does not dim at an
 *                            edge, and Swiper still rewinds on release. At a
 *                            flat 0 it moves nothing at all, and nothing is
 *                            what onTouchEnd reads it as
 *                            (`currentTranslate === startTranslate` returns
 *                            before it can rewind), so a swipe on the last
 *                            slide did nothing whatever.
 *   followFinger false       A SWIPE ASKS FOR THE CHANGE; IT DOES NOT DRAW
 *                            IT. There is nothing travelling under the finger
 *                            for a fade to keep up with, and half a drag is
 *                            half a dissolve: two sentences printed over each
 *                            other and two buttons of different widths lying
 *                            one on the other, held there for as long as the
 *                            thumb rests. Swiper reads the swipe exactly as
 *                            before (direction, distance, the rewind at
 *                            either end) and draws the one fade when the
 *                            finger lifts, so a swipe, a segment and the
 *                            clock all show the same 260ms.
 *   touchRatio 2             And a shorter swipe is enough to mean it.
 *   touchEventsTarget        The whole viewport, so a swipe that begins on
 *                            the segments changes the slide too.
 *   touchStartPreventDefault A finger down on the banner is the button's to
 *                            answer (it fetches its page ahead) and the
 *                            browser's to route; Swiper must not eat it.
 *   preventClicks            The click that ends a drag does not press the
 *                            button under the finger. Swiper's own answer to
 *                            the problem, on its own click listener.
 */
export const SWIPER_OPTIONS: SwiperOptions = {
  effect: "fade",
  fadeEffect: { crossFade: true },
  speed: FADE_MS,
  rewind: true,
  resistance: true,
  resistanceRatio: 0.05,
  followFinger: false,
  touchRatio: 2,
  touchEventsTarget: "container",
  touchStartPreventDefault: false,
  preventClicks: true,
  preventClicksPropagation: true,
  modules: [EffectFade],
}

/**
 * QUIET: SWIPER'S DOCUMENT TOUCH LISTENERS, TAKEN OFF AGAIN.
 *
 * attachEvents (shared/swiper-core.mjs) puts `touchstart` and `touchmove` on
 * the document with { passive: false }, and `touchstart` on the element, and
 * it does that whatever `passiveListeners` is set to. A blocking touchmove
 * listener on the document is a promise to the browser that the page may
 * cancel any scroll, so every scroll anywhere waits for the page's thread
 * before it can start.
 *
 * Swiper reads a gesture from pointer events just as well: touchstart only
 * records the touch's identifier, and while that identifier is unset (the
 * listener gone) onTouchMove and onTouchEnd take the pointer path
 * (core/events/onTouchMove: `if (e.type === 'pointermove') { if
 * (data.touchId !== null) return }`). Pointer events cannot cancel a scroll,
 * so the browser starts one the moment a move is vertical.
 */
function quiet(swiper: SwiperClass) {
  const handlers = swiper as unknown as { onTouchStart: EventListener; onTouchMove: EventListener; onDocumentTouchStart: EventListener }
  document.removeEventListener("touchstart", handlers.onDocumentTouchStart)
  document.removeEventListener("touchmove", handlers.onTouchMove)
  swiper.el.removeEventListener("touchstart", handlers.onTouchStart)
}

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
/** Reduced motion holds it too: nothing plays by itself, and a change asked for is instant. */
const CALM = 16

function BannerView({ list, onShare, onGuide }: { list: Announcement[]; onShare?: () => void; onGuide?: () => void }) {
  const count = list.length
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, Math.max(0, count - 1))
  /* A change the reader asked for is read out; one the clock made is not. */
  const [live, setLive] = useState<"off" | "polite">("off")
  const asked = useRef(false)
  /* Reduced motion, read live: a change asked for is simply there. */
  const calm = useRef(false)
  const rootRef = useRef<HTMLElement>(null)
  const viewRef = useRef<HTMLDivElement | null>(null)
  const swiperRef = useRef<SwiperClass | null>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  /* For Swiper's handlers, which outlive a render: which announcement is showing. */
  const shown = useRef(list[index]?.id)
  shown.current = list[index]?.id
  /* A new Swiper only when the announcements themselves change, never on a render. */
  const ids = list.map((a) => a.id).join(" ")

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

  /* ── Swiper ──────────────────────────────────────────────────────────── */
  /*
    ONE SWIPER FOR AS LONG AS THE ANNOUNCEMENTS ARE THE SAME. A slide is
    never mounted or unmounted by a change of slide, so nothing is inserted
    while it plays; when the announcements themselves change (a count
    arriving, a sale coming in) React replaces the slides and Swiper is built
    again over the new ones, on the announcement that was showing.
  */
  useEffect(() => {
    const el = viewRef.current
    if (!el || count < 2) return
    const at = Math.max(0, list.findIndex((a) => a.id === shown.current))
    const swiper = new Swiper(el, {
      ...SWIPER_OPTIONS,
      initialSlide: at,
      /* Reduced motion: the change is instant, and every call below reads this. */
      speed: calm.current ? 0 : FADE_MS,
      on: {
        slideChange(s) {
          setSelected(s.activeIndex)
          setLive(asked.current ? "polite" : "off")
        },
      },
    })
    quiet(swiper)
    swiperRef.current = swiper
    setSelected(at)
    return () => {
      swiperRef.current = null
      /* The DOM is React's: Swiper takes its own classes and inline styles back off it. */
      swiper.destroy(true, true)
    }
    /* `ids` stands in for the list, which is a new array on every render. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, count])

  /* Reduced motion: nothing plays by itself, and a change asked for has no fade. */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => {
      calm.current = mq.matches
      setBit(CALM, mq.matches)
      if (swiperRef.current) swiperRef.current.params.speed = mq.matches ? 0 : FADE_MS
    }
    sync()
    mq.addEventListener("change", sync)
    return () => mq.removeEventListener("change", sync)
  }, [setBit])

  /* ── The finger ─────────────────────────────────────────────────────── */
  /*
    SWIPER'S OWN DRAG, MINUS THE LISTENERS THAT HOLD A SCROLL UP (QUIET,
    above). What is left here is the two things Swiper does not do for this
    banner:

      THE CLOCK WAITS WHILE A FINGER IS DOWN. Swiper's touchStart and
      touchEnd cannot be used for that pair: on the gesture that matters, the
      one the browser takes for its scroll, Chrome sends pointercancel and
      Swiper 14 ignores pointercancel unless it takes itself for Safari or a
      webview (core/events/onTouchEnd), so the touchEnd to match would never
      come and the clock would stay held.

      AND THE DRAG IT LEFT OPEN IS CLOSED. That same ignored pointercancel
      leaves isTouched and isMoved set, and the next finger down is refused
      (`if (data.isTouched && data.isMoved) return`), which is a banner that
      answers one swipe and then no more. So the cancel is ended here and the
      slide showing settles back.
  */
  useEffect(() => {
    const root = rootRef.current
    if (!root || count < 2) return
    const down = () => {
      asked.current = true
      setBit(TOUCH, true)
    }
    const up = () => setBit(TOUCH, false)
    const cancel = (e: PointerEvent) => {
      setBit(TOUCH, false)
      const s = swiperRef.current
      if (!s || s.destroyed) return
      const d = s.touchEventsData
      if (!d.isTouched && !d.isMoved) return
      d.isTouched = false
      d.isMoved = false
      d.startMoving = false
      if (d.pointerId === e.pointerId) d.pointerId = null
      /* And the click after it is nobody's: left false, Swiper's own click listener would
         cancel every press on a segment or a button from here on. */
      s.allowClick = true
      s.slideTo(s.activeIndex)
    }
    root.addEventListener("pointerdown", down)
    /* On the window: a finger or a mouse let go outside the banner still ends it. */
    window.addEventListener("pointerup", up)
    window.addEventListener("pointercancel", cancel)
    return () => {
      root.removeEventListener("pointerdown", down)
      window.removeEventListener("pointerup", up)
      window.removeEventListener("pointercancel", cancel)
      setBit(TOUCH, false)
    }
  }, [count, setBit])

  /** A segment, an arrow key: a fade straight to that slide. */
  const go = useCallback((to: number) => {
    const s = swiperRef.current
    if (!s || count < 2) return
    asked.current = true
    s.slideTo(((to % count) + count) % count)
  }, [count])
  /** The clock: the showing segment's fill ended. `rewind` carries the last slide on to the first. */
  const advance = useCallback(() => {
    const s = swiperRef.current
    if (!s || count < 2) return
    asked.current = false
    s.slideNext()
  }, [count])

  /* ── The segments, as tabs ──────────────────────────────────────────── */
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    const to = ((keys[e.key] % count) + count) % count
    go(to)
    const tab = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[to]
    tab?.focus()
  }

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
        {/* Swiper's three: the viewport it is given, the wrapper it finds, and the slides in it. */}
        <div ref={viewRef} className="home-banner-text swiper">
          <div className="home-banner-track swiper-wrapper" aria-live={live}>
            {list.map((a, i) => {
              const on = i === index
              return (
                <div
                  key={a.id}
                  id={`home-banner-slide-${a.id}`}
                  role={count > 1 ? "tabpanel" : "group"}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  /* Not aria-hidden, and data-slide rather than data-state: either attribute changing
                     anywhere makes a :has() on <html> in globals.css (the nav pill's dialog rule, the
                     cookie banner's) restyle the whole page. inert keeps the slides beside the one
                     showing out of the tab order and the accessibility tree, and lets a finger on
                     them through to Swiper. */
                  inert={!on}
                  data-slide={on ? "active" : "idle"}
                  data-announcement={a.id}
                  className="home-banner-slide swiper-slide"
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
            })}
          </div>

          {count > 1 && (
            <div ref={tabsAt} role="tablist" aria-label="Announcements" className="home-banner-tabs" onKeyDown={onTabKey}>
              {list.map((a, i) => {
                const on = i === index
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    aria-controls={`home-banner-slide-${a.id}`}
                    aria-label={a.title}
                    tabIndex={on ? 0 : -1}
                    className="home-banner-tab"
                    data-on={on ? "" : undefined}
                    onClick={() => go(i)}
                  >
                    <span className="home-banner-tab-track">
                      {/*
                        EVERY SEGMENT KEEPS ITS FILL, and the showing one runs it (data-on).
                        Mounting a new fill for each slide was a DOM insertion, and any
                        insertion on /app makes the :has() rules on <html> in globals.css
                        restyle the whole page. An attribute change costs a handful.
                      */}
                      <span
                        className="home-banner-tab-fill"
                        style={{ animationDuration: `${SLIDE_MS}ms` }}
                        onAnimationEnd={on ? advance : undefined}
                      />
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

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
  SWIPER'S VIEWPORT runs from the banner's left edge to the globe's grip, and
  no further: the globe is drawn see-through, and a finger meant for the ball
  must not be read as a swipe. Nothing travels sideways any more, so there is
  no mask over the right hand edge: --fade is the text's own padding, room it
  never writes in, and the globe's atmosphere begins after it. pan-y: a
  vertical move is the page's scroll, a sideways one is Swiper's. Not
  selectable, or a mouse dragging the slides paints a text selection.

  These three rules name .home-banner as well, so they are a step more
  specific than the .swiper, .swiper-wrapper and .swiper-slide rules in
  swiper/css whatever order the two stylesheets land in.
*/
.home-banner .home-banner-text {
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
  The wrapper never moves: the fade sets virtualTranslate, so Swiper leaves
  it where it is and writes one transform per slide instead, which stacks
  them all on the same spot. The slides are laid out once, side by side, and
  never mounted, unmounted or re-keyed by a change.
*/
.home-banner .home-banner-track {
  display: flex;
  height: 100%;
  backface-visibility: hidden;
}
/*
  A CHANGE IS OPACITY AND NOTHING ELSE. Swiper writes the two slides'
  opacity and their transition's duration (FADE_MS, or 0 for a drag and for
  reduced motion); the curve is this one, the app's ease-out. It is steep at
  its start, so the slide coming in passes the one going out inside the first
  quarter of the change and the rest of the time is the tail: there is no
  frame with no text on it (what the two lose and gain is the same, so the
  pair always add to one) and no frame with two readable sentences.
*/
.home-banner .home-banner-slide {
  flex: 0 0 100%;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: var(--pad-t) var(--fade) var(--foot) var(--pad-l);
  transition-timing-function: cubic-bezier(0, 0, 0.2, 1);
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
  THE SEGMENTS stay where they are while the slides fade: inside the
  viewport, so a swipe that starts on them changes the slide too, and over
  the track. Each is a 44px square target with its 30px bar in the middle,
  the first bar lined up with the text; with more slides than 44px each
  allows before the globe, they share the room.
*/
.home-banner .home-banner-tabs {
  position: absolute;
  left: calc(var(--pad-l) - 7px);
  right: calc(var(--fade) - 7px);
  bottom: 0;
  height: var(--foot);
  display: flex;
  /* Over the slides, because swiper/css gives .swiper-wrapper a z-index of 1 and the
     segments are its next sibling: without this they are drawn under the slide showing,
     which has nothing to see through it and swallows every press on a segment. */
  z-index: 2;
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

/* Reduced motion: nothing plays by itself (CALM holds the clock, so this fill never ends and
   never asks for the next slide), the segment only marks which slide is showing, and a change
   asked for is simply there, with no fade (speed 0, calm in the view). */
@keyframes home-banner-fill-still {
  from { transform: scaleX(1); }
  to { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  .home-banner-tab[data-on] .home-banner-tab-fill { animation-name: home-banner-fill-still; }
}
`
