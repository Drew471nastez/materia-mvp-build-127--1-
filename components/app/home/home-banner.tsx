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
 * THE SLIDES ARE A CAROUSEL FROM A LIBRARY, embla-carousel. "Import
 * something regular and fix it from scratch. Some basic swiper: when I touch
 * it's clean and smooth, and when it's autoplaying make sure it's smooth and
 * clean as well." Before this the change was timed by hand in CSS (a fade,
 * then a hand rolled slide, then a fade again), and every version had a
 * frame where it blocked or flashed.
 *
 * Embla rather than Swiper, which the product gallery uses: Embla loops by
 * moving slides with transform and never moves a DOM node, where Swiper's
 * loop re-appends slides (on /app a DOM insertion restyles the whole page
 * through the :has() rules on <html>) and will not loop two slides at all,
 * which two account states have. Swiper also listens to touchmove on the
 * whole document with a listener that can cancel it, which makes every
 * scroll on the page wait for the page's thread. Embla is headless, so the
 * look stays ours.
 *
 *   A finger drags the slides one to one and a flick carries on with
 *   momentum to the next or the one before, snapping into place: Embla's
 *   physics, handed the finger by pointer events (THE FINGER, below). The
 *   browser decides on the first move (touch-action: pan-y on the
 *   viewport): up or down is the page's scroll, at once, and sideways is
 *   the carousel's, so a scroll that starts on the banner still scrolls the
 *   page and a swipe never does.
 *
 *   The clock slides to the next the same way, and from the last to the
 *   first it carries on forwards: a loop has no end to jump back from.
 *
 *   Every slide is mounted once and stays mounted, in one row; the track
 *   moves by transform alone, on its own compositor layer, and the banner
 *   has one height at each width whatever the slide says.
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
import { memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react"
import useEmblaCarousel from "embla-carousel-react"
import { AppLink } from "@/components/app/app-link"
import { announcementsFor, fromFacts, type Announcement, type SalesSummary } from "@/lib/home/announcements"
import type { ProgressFacts } from "@/lib/home/progress"
import { BannerGlobe } from "./globe"

/** How long a slide stays, in ms. */
export const SLIDE_MS = 9000

/**
 * The carousel's settings. `loop`, so the clock goes from the last slide to
 * the first forwards. `duration` is Embla's own unit (higher is slower, 25
 * its default): 30 is a calm glide that lands in about half a second.
 * `watchDrag: false`: the finger is handed to Embla by pointer events below
 * (see THE FINGER), because Embla's own touch listeners hold the page's
 * scroll up.
 */
export const CAROUSEL_OPTIONS = { loop: true, align: "start", duration: 30, watchDrag: false } as const
/** Embla's own window for measuring a throw (DragTracker logInterval). */
const FLICK_LOG_MS = 170

type EmblaApi = NonNullable<ReturnType<typeof useEmblaCarousel>[1]>

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

function BannerView({ list, onShare, onGuide }: { list: Announcement[]; onShare?: () => void; onGuide?: () => void }) {
  const count = list.length
  /* One slide is not a carousel: nothing to drag, nothing to loop. */
  const options = useMemo(() => ({ ...CAROUSEL_OPTIONS, active: count > 1 }), [count])
  const [viewportRef, embla] = useEmblaCarousel(options)
  const [selected, setSelected] = useState(0)
  const index = Math.min(selected, Math.max(0, count - 1))
  /* A change the reader asked for is read out; one the clock made is not. */
  const [live, setLive] = useState<"off" | "polite">("off")
  const asked = useRef(false)
  /* Reduced motion, read live: a change is a jump rather than a glide. */
  const calm = useRef(false)
  const rootRef = useRef<HTMLElement>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)
  /* For the carousel's handlers, which outlive a render. */
  const shown = useRef({ list, id: list[index]?.id })
  shown.current = { list, id: list[index]?.id }

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

  /* ── The carousel's events ───────────────────────────────────────────── */
  useEffect(() => {
    if (!embla) return
    const onSelect = (api: EmblaApi) => {
      setSelected(api.selectedScrollSnap())
      setLive(asked.current ? "polite" : "off")
    }
    /* The list changed under it (a count arriving, a sale coming in): the slide showing stays the one showing. */
    const onReInit = (api: EmblaApi) => {
      const at = shown.current.list.findIndex((a) => a.id === shown.current.id)
      if (at >= 0 && at !== api.selectedScrollSnap()) api.scrollTo(at, true)
      setSelected(api.selectedScrollSnap())
    }
    embla.on("select", onSelect).on("reInit", onReInit)
    return () => {
      embla.off("select", onSelect).off("reInit", onReInit)
    }
  }, [embla])

  /* ── The finger ─────────────────────────────────────────────────────── */
  /*
    EMBLA'S PHYSICS, FED BY POINTER EVENTS. Embla's own drag listens to
    touchmove with a listener that may cancel it, and a listener like that
    on the banner makes every scroll that starts there wait for the page's
    thread before it can begin: measured with scripts/check-home-scroll.mjs
    (BANNER_BASE), flicks starting on the banner had touchmoves waiting 133ms
    at the 95th percentile against 65ms, and 199 of 303 frames presented
    against 234 of 251. So Embla's drag is off (watchDrag:
    false) and this hands it the pointer's moves instead, the way its own
    drag does (@embla-carousel DragHandler and DragTracker, 8.5.1): the same
    target, friction, snap and flick force, so a throw lands where Embla
    would land it. Pointer events never hold a scroll up: pan-y lets the
    browser take a vertical move at once (a pointercancel here), and a
    sideways one comes here.
  */
  useEffect(() => {
    if (!embla || count < 2) return
    const root = embla.rootNode()
    let drag: { id: number; mouse: boolean; x0: number; y0: number; last: number; on: boolean; from: PointerEvent; prev: PointerEvent } | null = null
    /* A drag ends in a click where the mouse comes up; that click is the drag's, not the button's under it. */
    let draggedUntil = -1

    const down = (e: PointerEvent) => {
      if (drag || (e.pointerType === "mouse" && e.button !== 0)) return
      const en = embla.internalEngine()
      /* A finger landing on a slide on its way catches it where it is drawn. */
      en.scrollBody.useFriction(0).useDuration(0)
      en.target.set(en.location)
      drag = { id: e.pointerId, mouse: e.pointerType === "mouse", x0: e.clientX, y0: e.clientY, last: e.clientX, on: false, from: e, prev: e }
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
      const en = embla.internalEngine()
      en.scrollBody.useFriction(0.3).useDuration(0.75)
      en.animation.start()
      en.target.add(e.clientX - drag.last)
      drag.last = e.clientX
      /* The throw is measured over the last FLICK_LOG_MS of the drag. */
      if (e.timeStamp - drag.from.timeStamp > FLICK_LOG_MS) drag.from = e
      drag.prev = e
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const d = drag
      drag = null
      if (d.mouse && root.hasPointerCapture(e.pointerId)) root.releasePointerCapture(e.pointerId)
      const en = embla.internalEngine()
      /* How hard it was thrown: none when the finger stopped before letting go, or the browser took the move. */
      const time = e.timeStamp - d.from.timeStamp
      const speed = time > 0 ? (d.prev.clientX - d.from.clientX) / time : 0
      const flick = e.type === "pointerup" && d.on && e.timeStamp - d.prev.timeStamp <= FLICK_LOG_MS && Math.abs(speed) > 0.1
      const raw = flick ? speed * (d.mouse ? 300 : 400) : 0
      /* A throw past a fifth of the width goes to the next slide, a softer one lands on the nearest. */
      const nearest = en.scrollTarget.byDistance(raw, true).distance
      const force = Math.abs(raw) < Math.min(225, Math.max(50, en.percentOfView.measure(20)))
        ? nearest
        : en.scrollTarget.byIndex(en.index.add(Math.sign(raw) * -1).get(), 0).distance
      const factor = raw === 0 || force === 0 || Math.abs(raw) <= Math.abs(force) ? 0 : Math.abs((Math.abs(raw) - Math.abs(force)) / raw)
      en.scrollBody.useDuration(25 - 10 * factor).useFriction(0.68 + factor / 50)
      en.scrollTo.distance(force, true)
      if (d.on && Math.abs(d.last - d.x0) > 10) draggedUntil = e.timeStamp + 400
      setBit(TOUCH, false)
      /* Reduced motion: the drag followed the finger, and the rest of the way is a jump, not a glide. */
      if (calm.current) embla.scrollTo(embla.selectedScrollSnap(), true)
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
  }, [embla, count, setBit])

  /** A segment, an arrow key: to that slide, the shorter way round. */
  const go = useCallback((to: number) => {
    if (!embla || count < 2) return
    asked.current = true
    embla.scrollTo(((to % count) + count) % count, calm.current)
  }, [embla, count])
  /** The clock: the showing segment's fill ended. */
  const advance = useCallback(() => {
    if (!embla || count < 2) return
    asked.current = false
    embla.scrollNext(calm.current)
  }, [embla, count])

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
        {/* Embla's viewport: its first child is the track, and the track's children are the slides. */}
        <div ref={viewportRef} className="home-banner-text">
          <div className="home-banner-track" aria-live={live}>
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
                     them through to the track. */
                  inert={!on}
                  data-slide={on ? "active" : "idle"}
                  data-announcement={a.id}
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
  THE CAROUSEL (embla-carousel). Its viewport runs from the banner's left
  edge to the globe's grip, and no further: the globe is drawn see-through,
  and text sliding under it read as a smudge across the ball. A slide
  leaves by the banner's own edge on the left; on the right it fades
  through --fade, room the text never rests in, so nothing is cut by a hard
  line in the air. The mask is still; only the track moves. pan-y: a
  vertical move is the page's scroll, a sideways one is Embla's. Not
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
  -webkit-mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
  mask-image: linear-gradient(to right, #000 calc(100% - var(--fade)), transparent);
}
/*
  The track is moved by Embla with translate3d and nothing else; its own
  layer, so a frame of a move is the compositor's and never a repaint of the
  text. The slides are laid out once, side by side, and never mounted,
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
