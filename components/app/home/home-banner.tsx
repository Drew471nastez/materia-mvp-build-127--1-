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
 * counted on the server and the plan), most important first, at most five, with the
 * step the card names next leading. Only this store's things: connect payouts, a first sale, what Pro
 * would really have saved.
 *
 * THE SLIDESHOW. Six seconds a slide, the time drawn in the slide's own
 * segment under the text; it waits while a mouse is over the banner, while
 * focus is inside it, while a finger is on it, while it is off screen and
 * while the tab is hidden. The segments pick a slide (arrow keys move
 * between them), a sideways swipe on a phone does too. A change is the text
 * alone: it fades and slides a few pixels, line by line, in the one fixed
 * height, so nothing under it moves. The clock is a CSS animation on
 * `transform`, run by the compositor, and the slide changes when it ends:
 * no timer runs, and a slide change renders the banner and nothing else.
 * Screen readers hear a change they asked for and none they did not
 * (aria-live off while it plays by itself).
 *
 * THE GLOBE (components/app/home/globe) has its own column: the text's
 * right padding and the globe's place are one set of numbers, per banner
 * width (container queries on the banner, so the sidebar cannot throw them
 * out), and the text column ends where the globe's atmosphere begins.
 *
 * THE BACKGROUND is light grey with a pattern too soft to name: a few
 * blurred shapes as static gradients, a sheen and a grain, a hairline and a
 * shadow for depth. Painted once; nothing in it moves or blurs live.
 *
 * Buttons go where the sidebar's rows go and the same way
 * (components/app/app-link).
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react"
import { AppLink } from "@/components/app/app-link"
import { announcementsFor, fromFacts, type Announcement, type SalesSummary } from "@/lib/home/announcements"
import type { ProgressFacts } from "@/lib/home/progress"
import { BannerGlobe } from "./globe"

/** How long a slide stays, in ms. */
export const SLIDE_MS = 6000

export interface HomeBannerProps {
  /** What the account has done, as Getting started reads it (lib/home/progress). Read only. */
  facts: ProgressFacts
  planId: string
  /** The sales, counted on the server over every order (app/app/page.tsx, lib/home/announcements salesSummaryFrom). */
  sales: SalesSummary
  /** Opens Home's share sheet, when there is an address to hand out. */
  onShare?: () => void
}

export const HomeBanner = memo(function HomeBanner({ facts, planId, sales, onShare }: HomeBannerProps) {
  /* One clock for the page view: the same on the server and in the browser to the second, so the words agree. */
  const [now] = useState(() => Date.now())
  const list = useMemo(() => announcementsFor(fromFacts(facts, sales, planId, !!onShare), now), [facts, sales, planId, onShare, now])
  return <BannerView list={list} onShare={onShare} />
})

/* ─── The view ─────────────────────────────────────────────────────────── */

/** Why the clock is held. Any of them holds it. */
const HOVER = 1
const FOCUS = 2
const TOUCH = 4
const HIDDEN = 8

function BannerView({ list, onShare }: { list: Announcement[]; onShare?: () => void }) {
  const count = list.length
  const [currentId, setCurrentId] = useState(list[0]?.id)
  const [leavingId, setLeavingId] = useState<string | null>(null)
  const [dir, setDir] = useState(1)
  /* A change the reader asked for is read out; one the clock made is not. */
  const [live, setLive] = useState<"off" | "polite">("off")
  const rootRef = useRef<HTMLElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const tabsRef = useRef<HTMLDivElement | null>(null)

  /* The slide showing stays the one showing when the list changes under it (a count arriving, a sale coming in). */
  const found = list.findIndex((a) => a.id === currentId)
  const index = found >= 0 ? found : 0
  const current = list[index]

  const go = useCallback(
    (to: number, direction: number, asked: boolean) => {
      if (count < 2) return
      const next = list[((to % count) + count) % count]
      if (!next || next.id === current?.id) return
      setLeavingId(current?.id ?? null)
      setCurrentId(next.id)
      setDir(direction)
      setLive(asked ? "polite" : "off")
    },
    [count, list, current],
  )

  /*
    WHY THE CLOCK IS HELD LIVES OUTSIDE REACT. A hover, a focus, a finger
    down or the banner leaving the screen only pauses the segment's
    animation; as state, each of them re-rendered the banner inside the
    touch that started a scroll (measured: the longest tasks of a swipe
    that began on the banner). Now they set one attribute on the tabs.
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

  /* ── Swipe, on a touch screen ───────────────────────────────────────── */
  /*
    THE TEXT RIDES THE FINGER, THEN LEAVES THE WAY IT WAS THROWN. It used to
    move 30% of the finger's way, at most 28px, and spring back before the
    next slide faded in: a nudge and a jump. Now it follows the finger 1:1
    (with resistance past 90px) and fades as it goes; let go past a third of
    the text's width, or with a flick, and it carries on out on the same
    curve while the next slide comes in from the other side. Short of that
    it settles back. All on `translate` and `opacity` of one element, set as
    styles, so nothing in React renders until the slide actually changes.
  */
  const swipe = useRef<{ id: number; x: number; y: number; dx: number; on: boolean; t: number; v: number } | null>(null)
  const setTrack = (dx: number, ms: number) => {
    const t = trackRef.current
    if (!t) return
    t.style.transition = ms ? `translate ${ms}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${ms}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none"
    t.style.translate = dx ? `${dx}px 0` : ""
    t.style.opacity = dx ? String(Math.max(0, 1 - Math.abs(dx) / 220)) : ""
  }
  const resist = (dx: number) => {
    const a = Math.abs(dx)
    return Math.sign(dx) * (a <= 90 ? a : 90 + (a - 90) * 0.35)
  }
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return
    setBit(TOUCH, true)
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, on: false, t: e.timeStamp, v: 0 }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current
    if (!s || s.id !== e.pointerId || count < 2) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (!s.on && Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.2) s.on = true
    if (!s.on) return
    const dt = Math.max(1, e.timeStamp - s.t)
    s.v = s.v * 0.5 + ((dx - s.dx) / dt) * 0.5
    s.t = e.timeStamp
    s.dx = dx
    setTrack(resist(dx), 0)
  }
  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = swipe.current
    if (!s || s.id !== e.pointerId) return
    swipe.current = null
    window.setTimeout(() => setBit(TOUCH, false), 250)
    const width = trackRef.current?.getBoundingClientRect().width ?? 240
    const flick = Math.abs(s.v) > 0.35 && Math.sign(s.v) === Math.sign(s.dx)
    const far = Math.abs(s.dx) > width / 3
    if (e.type !== "pointerup" || !s.on || !(far || flick) || count < 2) {
      setTrack(0, 420)
      return
    }
    const way = s.dx < 0 ? 1 : -1
    /* Out the way it was thrown, then the next slide in from the other side, the text back in place under it. */
    setTrack(-way * 120, 200)
    window.setTimeout(() => {
      /* The slide it threw is already gone: it does not come back to fade out a second time. */
      const t = trackRef.current
      t?.setAttribute("data-thrown", "")
      go(index + way, way, true)
      setTrack(0, 0)
      window.setTimeout(() => t?.removeAttribute("data-thrown"), 600)
    }, 170)
  }

  /* ── The segments, as tabs ──────────────────────────────────────────── */
  const onTabKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys: Record<string, number> = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: count - 1 }
    if (!(e.key in keys)) return
    e.preventDefault()
    const to = ((keys[e.key] % count) + count) % count
    go(to, to > index || (e.key === "ArrowRight" && to === 0) ? 1 : -1, true)
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
      <div className="home-banner-inner">
        <div
          className="home-banner-text"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <div
            ref={trackRef}
            className="home-banner-stack"
            aria-live={live}
            style={{ "--in": `${dir * 14}px`, "--out": `${dir * -10}px` } as CSSProperties}
          >
            {list.map((a, i) => {
              const state = a.id === current?.id ? "active" : a.id === leavingId ? "leaving" : "idle"
              return (
                <div
                  key={a.id}
                  id={`home-banner-slide-${a.id}`}
                  role={count > 1 ? "tabpanel" : "group"}
                  aria-roledescription="slide"
                  aria-label={`${i + 1} of ${count}`}
                  /* Not aria-hidden, and data-slide rather than data-state: a slide not showing is
                     already visibility hidden (out of the accessibility tree, unfocusable) and inert,
                     and either attribute changing anywhere makes a :has() on <html> in globals.css
                     (the nav pill's dialog rule, the cookie banner's) restyle the whole page:
                     measured at 363 elements a slide change. */
                  inert={state !== "active"}
                  data-slide={state}
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
                    {a.action === "share" && onShare ? (
                      <button type="button" className="home-banner-cta" onClick={onShare}>
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
                    onClick={() => go(i, i >= index ? 1 : -1, true)}
                  >
                    <span className="home-banner-tab-track">
                      {/*
                        EVERY SEGMENT KEEPS ITS FILL, and the showing one runs it (data-on).
                        Mounting a new fill for each slide was a DOM insertion, and any
                        insertion on /app makes the :has() rules on <html> in globals.css
                        restyle the whole page: measured at 363 elements, every six seconds.
                        An attribute change costs a handful.
                      */}
                      <span
                        className="home-banner-tab-fill"
                        style={{ animationDuration: `${SLIDE_MS}ms` }}
                        onAnimationEnd={on ? () => go(index + 1, 1, false) : undefined}
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
 * the halo to), so the text stops at `--gx + 0.452 * --g + --gap` from the
 * right: the same numbers place the globe and end the text, and cannot
 * disagree. Per banner width, by container query, because the sidebar
 * makes the viewport a poor guide to how wide the banner is.
 */
const BANNER_CSS = `
.home-banner {
  container-type: inline-size;
  border: 1px solid #e3e5ea;
  background: #eff1f4;
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
    radial-gradient(60% 120% at 12% 0%, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0) 70%),
    linear-gradient(180deg, #f4f5f7 0%, #eceef1 100%);
}

/*
  ONE HEIGHT, TALL ENOUGH FOR THE LONGEST SLIDE AT EVERY WIDTH, AND NO
  TALLER, WITH THE BUTTON AND THE SEGMENTS TOGETHER AT THE FOOT. "The banner
  shouldn't look fat, and not so much space between the lines and the
  button." The button row sits at the bottom of the text (margin-top: auto)
  and the segments 8px under it, so whatever room a short slide leaves is
  above the button, never between it and the segments. Every line is 48
  characters at most (lib/home/announcements). Phone type to 619px (15/20
  title, 13/17 body, two lines each): 18 + 16 + 4 + 40 + 4 + 34 + 12 + 34 +
  8 + 16 + 10 = 196. From 620 (19/24, 14/19, two lines each): 20 + 16 + 5 +
  48 + 5 + 38 + 12 + 34 + 8 + 16 + 12 = 214. From 860, one line each: 20 +
  16 + 5 + 24 + 5 + 19 + 12 + 34 + 8 + 16 + 12 = 171, so 172, the globe
  sized to sit inside it. scripts/check-home-banner.mjs holds every slide of
  every state to it.
*/
.home-banner-inner {
  --g: 168px;
  --gx: 56px;
  --gy: 4px;
  --gap: 8px;
  --pad-l: 18px;
  position: relative;
  height: 196px;
}
@container (min-width: 380px) {
  .home-banner-inner { --g: 180px; --gx: 64px; --pad-l: 20px; }
}
@container (min-width: 460px) {
  .home-banner-inner { --g: 204px; --gx: 96px; --gy: 6px; --gap: 14px; --pad-l: 26px; }
}
@container (min-width: 620px) {
  .home-banner-inner { --g: 236px; --gx: 132px; --gy: 4px; --gap: 22px; --pad-l: 32px; height: 214px; }
}
@container (min-width: 860px) {
  .home-banner-inner { --g: 204px; --gx: 140px; --gy: 0px; --gap: 32px; --pad-l: 36px; height: 172px; }
}

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

.home-banner-text {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  padding: 18px calc(var(--gx) + var(--g) * 0.452 + var(--gap)) 10px var(--pad-l);
  touch-action: pan-y;
}
@container (min-width: 620px) {
  .home-banner-text { padding-top: 20px; padding-bottom: 12px; }
}
.home-banner-stack {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  max-width: 560px;
}
.home-banner-slide {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  visibility: hidden;
}
.home-banner-slide > * {
  /* Never squeezed: a title or a line clipped to fit would be a sentence cut in half. */
  flex-shrink: 0;
  opacity: 0;
  translate: var(--in) 0;
  transition: none;
}
.home-banner-slide[data-slide="active"] { visibility: visible; }
.home-banner-slide[data-slide="active"] > * {
  opacity: 1;
  translate: 0 0;
  transition:
    opacity 380ms cubic-bezier(0.22, 1, 0.36, 1),
    translate 520ms cubic-bezier(0.22, 1, 0.36, 1);
}
.home-banner-slide[data-slide="active"] > :nth-child(2) { transition-delay: 40ms; }
.home-banner-slide[data-slide="active"] > :nth-child(3) { transition-delay: 80ms; }
.home-banner-slide[data-slide="active"] > :nth-child(4) { transition-delay: 120ms; }
.home-banner-slide[data-slide="leaving"] {
  visibility: hidden;
  transition: visibility 0s linear 300ms;
}
.home-banner-slide[data-slide="leaving"] > * {
  opacity: 0;
  translate: var(--out) 0;
  transition:
    opacity 220ms cubic-bezier(0.4, 0, 1, 1),
    translate 300ms cubic-bezier(0.4, 0, 1, 1);
}

.home-banner-stack[data-thrown] .home-banner-slide[data-slide="leaving"],
.home-banner-stack[data-thrown] .home-banner-slide[data-slide="leaving"] > * {
  visibility: hidden;
  opacity: 0;
  transition: none;
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

.home-banner-tabs {
  display: flex;
  gap: 2px;
  height: 16px;
  margin-top: 8px;
  margin-left: -4px;
  flex: 0 0 auto;
}
.home-banner-tab {
  display: flex;
  align-items: center;
  width: 30px;
  height: 16px;
  padding: 0 4px;
  border-radius: 6px;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.home-banner-tab:focus-visible { box-shadow: 0 0 0 2px #8b5cf6; }
/* The segment is 16px tall to keep the banner low; its target reaches 10px further up and down. */
.home-banner-tab { position: relative; }
.home-banner-tab::after { content: ""; position: absolute; inset: -10px -1px; }
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
.home-banner-tab:hover .home-banner-tab-track { background: rgba(26, 26, 46, 0.24); }
.home-banner-tab-fill {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: rgba(26, 26, 46, 0.72);
  transform-origin: left center;
  transform: scaleX(0);
}
/* The showing slide's segment fills over SLIDE_MS; the clock is this animation, and the slide changes when it ends. */
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

/* Reduced motion keeps the clock and loses the movement: the text changes in place, and the segment
   under it only marks which slide is showing. */
@keyframes home-banner-fill-still {
  from { transform: scaleX(1); }
  to { transform: scaleX(1); }
}
@media (prefers-reduced-motion: reduce) {
  .home-banner-tab[data-on] .home-banner-tab-fill { animation-name: home-banner-fill-still; }
  .home-banner-slide > *,
  .home-banner-slide[data-slide="active"] > *,
  .home-banner-slide[data-slide="leaving"] > * { translate: 0 0; transition: opacity 160ms linear; transition-delay: 0ms; }
}
`
