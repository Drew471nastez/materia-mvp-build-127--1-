"use client"

import { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore, type AnimationEvent, type ComponentType, type CSSProperties, type PointerEvent } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUSINESS_MOCK_CSS, ClubScene, CoachScene, CourseScene, DigitalScene, PhysicalScene, STORE_STEP_S } from "./showcase-mocks/business-mocks"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

/*
  WHAT YOU CAN SELL (landing rounds 8 and 9).
  Round 8 brought the section back as pills over one wide stage. Round 9, the
  owner: "I don't like the pill shapes and the underline under the pill
  there; come up with another design, more smooth and clean", and the stage
  should read as designed, not as one big tinted box.

  So the five kinds are plain words. On a computer they are an index down the
  left of the stage, as tall as it: a name, a line saying what that covers,
  hairlines between. On a tablet they are one quiet row over the stage. There
  is no track, no pill and no line under anything: the chosen word is dark,
  the others grey, and beside the chosen one a small ring closes as its turn
  runs.

  Autoplay: that ring is the clock (when it has closed, the next kind comes
  up). It pauses while a mouse rests on the stage, while a finger is on it
  (and for a moment after), while the section is off screen and while the
  browser tab is hidden, and carries on from where it stopped. Picking a word
  shows it and starts its turn again; autoplay keeps going. With reduced
  motion nothing turns by itself, the ring stands closed and the scenes stand
  finished.

  Round 10, the owner: the section "occupies too much height of the entire
  page", the scenes are too tall ("reduce it just a little, 5 to 10%"), and
  the line under the heading "doesn't make sense". The line is gone; the
  stage is drawn at 1100 x 570 instead of 1040 x 600, about a tenth shorter
  at the same width with every scene the same picture, and it never stands
  taller than 66svh, so on a laptop (1440 x 800) the heading, the index and
  the stage are one screen.
*/
/*
  Round 11, the owner: "I don't like the heading 'What will you sell?', and
  this section should have a subheading, max 10 words." The heading says what
  the section shows, and one short line under it names the five kinds in
  plain words, set tight under the heading so the heading, the index and the
  stage still stand on one laptop screen.
*/
/*
  Round 12, the owner disliked the section on a phone: a row of words cut at
  both edges over one stage taller than the screen, its scenes cut at the
  foot. On a phone (below 768px) there is no row of words and no autoplay
  now. The five kinds are five cards in a row that slides under the thumb, the
  next one showing at the right edge: each card its name and what it covers,
  then its scene, drawn at 360 x 520 so the heading, a card's name and the
  whole card stand on one phone screen. The row is the browser's own scroll
  with snap points (no script moves it, nothing listens to the finger), so a
  swipe is as smooth as the page. A card's moment plays when it is the one in
  view or beside it, and is reset only when two cards away, out of sight.
*/
/*
  Round 13, the owner: a better heading than "One store, every kind of
  product", compact and specific, and far less purple in it. It names what
  the five cards are, ways a store takes money; one word carries the accent,
  in a softer violet than the page's (BUSINESS_ACCENT_COLOR). The line under
  it names the five in plain words.
*/
export const BUSINESS_HEADING = "Five ways to get paid"
/** The one accented word. */
export const BUSINESS_ACCENT = ["paid"] as const
/** Its colour: a quiet violet, greyer than the page's #7c3aed. */
export const BUSINESS_ACCENT_COLOR = "#7e6fb8"
/** The line under the heading: at most ten words (the owner). */
export const BUSINESS_SUB = "Downloads, goods, courses, communities and calls, one checkout."
export const BUSINESS_SLIDE_MS = 6500
/** How long autoplay waits after a finger leaves the stage. */
export const BUSINESS_TOUCH_RESUME_MS = 2500
/** Below this width the kinds are a row of cards that slides (the phone layout). */
export const BUSINESS_RAIL_QUERY = "(max-width: 767px)"
/** How long the row must be still before the card in view counts as chosen (a swipe changes nothing while it moves). */
export const BUSINESS_RAIL_SETTLE_MS = 140

type Kind = {
  id: string
  label: string
  /** The shorter label on a tablet's row. */
  tab: string
  /** What the kind covers, under its name in the computer's index and on a phone's card. */
  line: string
  /** Its turn, when it is not the usual length. */
  ms?: number
  Scene: ComponentType
  alt: string
}

export const BUSINESS_SLIDES: readonly Kind[] = [
  {
    id: "digital",
    label: "Digital products",
    tab: "Digital",
    line: "E-books, video courses, downloads",
    Scene: DigitalScene,
    alt: "Digital products on Storelib: Ruth Calder's store sells Ancestral Kitchen, a cookbook of 80 recipes as a PDF for $34, and Daily Mobility, a video course of 21 lessons for $79. Both are in one order of $113; it is paid, the cookbook downloads and both are ready in the buyer's library.",
  },
  {
    id: "physical",
    label: "Physical products",
    tab: "Physical",
    line: "Goods you make and ship",
    /* The line of store designs turns four times in a turn. */
    ms: STORE_STEP_S * 4000,
    Scene: PhysicalScene,
    alt: "Store designs for physical products on Storelib: a soda, skincare, a balm, jewellery, a massage gun and phone cases. One stands in front, the others stacked behind it on each side, and the line turns on by itself.",
  },
  {
    id: "courses",
    label: "Courses",
    tab: "Courses",
    line: "Video lessons and modules",
    Scene: CourseScene,
    alt: "A course on Storelib: Mixing in key, for new DJs, by Tomás Reyes. 16 lessons, $79. Lesson 3 plays to the end and the next lesson comes up.",
  },
  {
    id: "communities",
    label: "Communities",
    tab: "Communities",
    line: "Members, posts, live events",
    Scene: ClubScene,
    alt: "A community on Storelib: Applied AI Club, hosted by Sam Adeyemi, under a banner of its members at work with its own logo and the line Build one AI tool a week. $12 a month, 2,480 members, a live build on Wednesday and new posts arriving in its show-and-tell space.",
  },
  {
    id: "bookings",
    label: "Bookings",
    tab: "Bookings",
    line: "Paid calls and sessions",
    Scene: CoachScene,
    alt: "A booking on Storelib: a 45 minute training plan call with Talia Moreno, a strength coach, $75. Thursday at 17:30 is picked and booked.",
  },
]

/* A scene never changes once drawn; switching changes only attributes on the panels around it. */
const KindScene = memo(function KindScene({ i }: { i: number }) {
  const { Scene, alt } = BUSINESS_SLIDES[i]
  return (
    <MockFrame label={alt} className="bz-frame">
      <Scene />
    </MockFrame>
  )
})

const NEXT_KEYS = ["ArrowRight", "ArrowDown"]
const PREV_KEYS = ["ArrowLeft", "ArrowUp"]

/* The layout follows the width, read from the browser (the section is only ever drawn there: lazy-section.tsx). */
const subscribeRail = (on: () => void) => {
  const q = matchMedia(BUSINESS_RAIL_QUERY)
  q.addEventListener("change", on)
  return () => q.removeEventListener("change", on)
}
const railNow = () => matchMedia(BUSINESS_RAIL_QUERY).matches
const railOnServer = () => false

/** Section 4b: the kinds of things a Storelib store sells, one moving scene each; on autoplay from a tablet up, a row of cards on a phone. */
export function BusinessCarousel() {
  const t = useAutoTabs(BUSINESS_SLIDES.length)
  const n = BUSINESS_SLIDES.length
  const { go, advance } = t
  const rail = useSyncExternalStore(subscribeRail, railNow, railOnServer)

  /* A finger on the stage holds the turn; it carries on a moment after the finger lifts (or the browser takes the touch for a scroll). */
  const [held, setHeld] = useState(false)
  const release = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(release.current), [])
  const hold = useCallback((e: PointerEvent) => {
    if (e.pointerType === "mouse") return
    clearTimeout(release.current)
    setHeld(true)
  }, [])
  const letGo = useCallback((e: PointerEvent) => {
    if (e.pointerType === "mouse") return
    clearTimeout(release.current)
    release.current = setTimeout(() => setHeld(false), BUSINESS_TOUCH_RESUME_MS)
  }, [])

  /* The ring's second half closing is the end of the turn. */
  const turnEnd = useCallback(
    (e: AnimationEvent) => {
      if (e.animationName === "biz-ring-b") advance()
    },
    [advance],
  )

  /* On a tablet the words are one row that may be wider than the screen: the chosen one is brought into view inside the row (the page itself never scrolls for it). One read when the kind changes, never per frame. */
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const r = row.current
    if (!r || r.scrollWidth <= r.clientWidth) return
    const tab = r.children[t.index] as HTMLElement | undefined
    if (!tab) return
    r.scrollTo({ left: tab.offsetLeft - (r.clientWidth - tab.offsetWidth) / 2, behavior: t.reduce ? "auto" : "smooth" })
  }, [t.index, t.reduce])

  /*
    The phone's row: which card is in view, read once the row has been still
    for a moment (never while it moves, so a swipe does no work but the
    browser's own scroll). Its moment and its neighbours' play.
  */
  const railRef = useRef<HTMLDivElement>(null)
  const [railAt, setRailAt] = useState(0)
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(settle.current), [])
  const onRailScroll = useCallback(() => {
    clearTimeout(settle.current)
    settle.current = setTimeout(() => {
      const r = railRef.current
      const first = r?.firstElementChild as HTMLElement | null | undefined
      if (!r || !first) return
      const next = r.children[1] as HTMLElement | undefined
      const pitch = next ? next.offsetLeft - first.offsetLeft : first.offsetWidth
      if (pitch > 0) setRailAt(Math.max(0, Math.min(n - 1, Math.round(r.scrollLeft / pitch))))
    }, BUSINESS_RAIL_SETTLE_MS)
  }, [n])

  const run = t.run && !held && !rail
  return (
    <section
      ref={t.rootRef}
      className="biz"
      data-story-section="business"
      data-business=""
      data-rail={rail || undefined}
      data-run={run || undefined}
      data-live={t.live || undefined}
      data-auto={(t.playing && !rail) || undefined}
      aria-labelledby="biz-title"
    >
      <ShowcaseStyles styles={BUSINESS_STYLES} />
      <div className="biz-head">
        <StoryHeading id="biz-title" className="biz-h" text={BUSINESS_HEADING} accent={[...BUSINESS_ACCENT]} />
        <p className="biz-sub">{BUSINESS_SUB}</p>
      </div>
      <div className="biz-body">
        {rail ? (
          <div ref={railRef} className="biz-rail" role="list" aria-label="What you can sell" onScroll={onRailScroll}>
            {BUSINESS_SLIDES.map((s, i) => (
              <div key={s.id} className="biz-card" role="listitem" aria-labelledby={`biz-card-${s.id}`}>
                <div className="biz-card-h">
                  <h3 id={`biz-card-${s.id}`}>{s.label}</h3>
                  <p>{s.line}</p>
                </div>
                <div className={Math.abs(i - railAt) <= 1 ? "biz-slide bz-on" : "biz-slide"} data-pane="rail">
                  <KindScene i={i} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <div ref={row} className="biz-tabs" role="tablist" aria-label="What you can sell">
              {BUSINESS_SLIDES.map((s, i) => {
                const on = i === t.index
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={`biz-tab-${s.id}`}
                    aria-controls={`biz-slide-${s.id}`}
                    aria-selected={on}
                    tabIndex={on ? 0 : -1}
                    className="biz-tab"
                    onClick={() => go(i)}
                    onKeyDown={(e) => {
                      const step = NEXT_KEYS.includes(e.key) ? 1 : PREV_KEYS.includes(e.key) ? -1 : 0
                      if (!step) return
                      e.preventDefault()
                      const to = (i + step + n) % n
                      go(to)
                      document.getElementById(`biz-tab-${BUSINESS_SLIDES[to].id}`)?.focus()
                    }}
                  >
                    <span className="biz-mark" aria-hidden="true">
                      {/* The turn's clock, drawn: a ring that closes, two halves turning one after the other. A CSS animation on transform, so nothing ticks while it is paused or off screen. */}
                      {on && (
                        <span
                          key={t.index}
                          className="biz-ring"
                          style={{ "--biz-ms": `${s.ms ?? BUSINESS_SLIDE_MS}ms` } as CSSProperties}
                          onAnimationEnd={turnEnd}
                        >
                          <i className="a">
                            <b />
                          </i>
                          <i className="b">
                            <b />
                          </i>
                        </span>
                      )}
                    </span>
                    <span className="biz-tab-w">
                      <span className="biz-tab-l">{s.label}</span>
                      <span className="biz-tab-s">{s.tab}</span>
                      <span className="biz-tab-d">{s.line}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div
              className="biz-stage"
              {...t.hoverProps}
              onPointerDown={hold}
              onPointerUp={letGo}
              onPointerCancel={letGo}
            >
              {BUSINESS_SLIDES.map((s, i) => {
                const state = t.states.get(i)
                if (!state) return null
                const on = state === "active" || state === "leaving"
                return (
                  <div
                    key={s.id}
                    id={`biz-slide-${s.id}`}
                    role="tabpanel"
                    aria-labelledby={`biz-tab-${s.id}`}
                    aria-hidden={state !== "active" || undefined}
                    className={on ? "biz-slide bz-on" : "biz-slide"}
                    data-pane={state}
                  >
                    <KindScene i={i} />
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </section>
  )
}

/*
  White, like the ideas section above it. The heading block and the body share
  one left edge: the page's (app/globals.css, --home-edge, --home-max), the
  words set in by the heading inset. From 1280px the body is two columns, the
  index and the stage, the same height; from 768px the words are a row over
  a stage as wide as the showcase cards; below that, the row of cards. A
  scene changes by a crossfade over the one before; nothing in here animates
  layout.
*/
const CSS = `
.biz{position:relative;background:#fff;color:#18181b;overflow-x:clip}
/* Prefixed with the page root: the editorial rule "[data-landing-story] [data-story-section] > div" (1400px, the old gutter) is more specific than a class. */
[data-landing-story] .biz>.biz-head,.biz-head{box-sizing:border-box;max-width:var(--home-max,2020px);margin:0 auto;padding:0 calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px))}
.biz .biz-h{--story-accent:${BUSINESS_ACCENT_COLOR};margin-inline:0;max-width:16ch;font-size:clamp(36px,5vw,72px)}
.biz-sub{margin:clamp(8px,.9vw,14px) 0 0;max-width:64ch;font-size:clamp(16px,1.25vw,19px);line-height:1.45;letter-spacing:-.005em;color:#65616e}
[data-landing-story] .biz>.biz-body,.biz-body{box-sizing:border-box;display:grid;grid-template-columns:minmax(0,1fr);row-gap:clamp(8px,1.4vw,16px);max-width:var(--home-max,2020px);margin:clamp(20px,3vw,44px) auto 0;padding:0 var(--home-edge,clamp(20px,5.15vw,84px))}
/* The words. A row here, an index from 1280px. The row reaches the screen's edges, so one wider than the screen slides under the thumb. */
.biz-tabs{display:flex;gap:clamp(18px,2.6vw,34px);margin:0 calc(var(--home-edge,20px) * -1);padding:0 calc(var(--home-edge,20px) + var(--home-head-inset,14px));overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
.biz-tabs::-webkit-scrollbar{display:none}
.biz-tab{flex:none;display:flex;align-items:center;gap:8px;min-height:44px;margin:0;padding:0;border:0;background:none;color:#a1a1aa;font-family:inherit;font-size:16px;font-weight:550;line-height:1.2;letter-spacing:-.01em;text-align:left;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.biz-tab[aria-selected="true"]{color:#18181b}
@media(hover:hover){.biz-tab:not([aria-selected="true"]):hover{color:#52525b}}
.biz-tab:focus-visible{outline:2px solid #18181b;outline-offset:4px;border-radius:6px}
.biz-tab-w{display:grid}
.biz-tab-s,.biz-tab-d{display:none}
/* Beside each word a dot, and on the chosen one the ring of its turn. */
.biz-mark{position:relative;flex:none;width:14px;height:14px}
.biz-mark::before{content:"";position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:#d4d4d8;transition:opacity .3s ease}
.biz-tab[aria-selected="true"] .biz-mark::before{opacity:0}
.biz-ring{position:absolute;inset:0;border-radius:50%;box-shadow:inset 0 0 0 1.5px #e4e4e7}
.biz-ring>i{position:absolute;top:0;bottom:0;width:50%;overflow:hidden}
.biz-ring>.a{left:50%}
.biz-ring>.b{left:0}
/* Each half holds the whole ring cut to its right side; turned, that side sweeps through the half. At rest both are home: a closed ring. */
.biz-ring b{position:absolute;top:0;width:200%;height:100%;border-radius:50%;box-shadow:inset 0 0 0 1.5px #18181b;clip-path:inset(0 0 0 50%)}
.biz-ring>.a b{left:-100%}
.biz-ring>.b b{left:0;transform:rotate(180deg)}
.biz[data-auto] .biz-ring b{animation:biz-ring-a var(--biz-ms,6500ms) linear both paused}
.biz[data-auto] .biz-ring>.b b{animation-name:biz-ring-b}
.biz[data-auto][data-run] .biz-ring b{animation-play-state:running}
@keyframes biz-ring-a{0%{transform:rotate(-180deg)}50%,100%{transform:rotate(0deg)}}
@keyframes biz-ring-b{0%,50%{transform:rotate(0deg)}100%{transform:rotate(180deg)}}
@media(max-width:767px){
  .biz .biz-h{font-size:clamp(32px,9vw,40px)}
  .biz-sub{font-size:16px}
  [data-landing-story] .biz>.biz-body,.biz-body{margin-top:24px}
}
/*
  The phone's row of cards. The browser's own scroll, edge to edge, each card
  stopping at the page's left edge with the next one showing at the right.
  A card is a little narrower than the page's column, so the next one shows
  22px; the gap is the page's edge, so nothing of the card before shows at
  the left; snap-stop keeps a flick to one card at a time; the spacer after
  the last card lets it stop at the left edge like the others.
*/
.biz-rail{display:flex;gap:var(--home-edge,20px);margin:0 calc(var(--home-edge,20px) * -1);padding:0 var(--home-edge,20px) 2px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x mandatory;scroll-padding-inline:var(--home-edge,20px);scrollbar-width:none;-webkit-tap-highlight-color:transparent}
.biz-rail::-webkit-scrollbar{display:none}
.biz-rail::after{content:"";flex:none;width:22px}
.biz-card{flex:none;width:calc(100% - 22px);scroll-snap-align:start;scroll-snap-stop:always}
.biz-card-h{margin:0 0 12px;padding:0 2px}
.biz-card-h h3{margin:0;font-size:18px;font-weight:650;line-height:1.25;letter-spacing:-.015em;color:#18181b}
.biz-card-h p{margin:2px 0 0;font-size:14px;line-height:1.4;color:#65616e}
.biz-rail .biz-slide{position:relative;border-radius:18px;overflow:hidden;isolation:isolate;background:#f0eff1;transition:none}
.biz-rail .smk{pointer-events:none;user-select:none;-webkit-user-select:none}
@media(min-width:1280px){
  /* The stage takes the room beside the index up to 66svh tall (its drawing is 1100 x 570); on a short window the index takes what is left. */
  [data-landing-story] .biz>.biz-body,.biz-body{grid-template-columns:minmax(clamp(232px,18vw,330px),1fr) minmax(0,calc(66vh * 1100 / 570));grid-template-columns:minmax(clamp(232px,18vw,330px),1fr) minmax(0,calc(66svh * 1100 / 570));column-gap:clamp(28px,3vw,64px)}
  .biz-tabs{display:grid;grid-template-rows:repeat(5,minmax(0,1fr));gap:0;margin:0;padding:0 0 0 var(--home-head-inset,14px);overflow:visible}
  .biz-tab{flex-direction:row-reverse;justify-content:space-between;gap:16px;min-height:0;border-top:1px solid #ececee;font-size:clamp(19px,1.5vw,26px);font-weight:600;letter-spacing:-.02em;white-space:normal}
  .biz-tab:last-child{border-bottom:1px solid #ececee}
  .biz-tab-w{gap:clamp(4px,.4vw,7px)}
  .biz-tab-d{display:block;font-size:clamp(13px,.95vw,15.5px);font-weight:400;line-height:1.35;letter-spacing:0;color:#a1a1aa;transition:color .35s ease}
  .biz-tab[aria-selected="true"] .biz-tab-d{color:#65616e}
  .biz-mark{width:18px;height:18px}
}
.biz-stage{position:relative;display:grid;border-radius:clamp(14px,1.4vw,22px);overflow:hidden;isolation:isolate;background:#f0eff1;-webkit-tap-highlight-color:transparent}
.biz-stage .smk{pointer-events:none;user-select:none;-webkit-user-select:none}
.biz-slide{grid-area:1/1;border-radius:inherit;overflow:hidden;transition:opacity .6s cubic-bezier(.2,.7,.2,1)}
.biz-slide[data-pane="active"]{z-index:2;animation:biz-in .6s cubic-bezier(.2,.7,.2,1) backwards}
.biz-slide[data-pane="leaving"]{z-index:1}
.biz-slide[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
/* A scene put away is hidden, not content-visibility:hidden: Chrome does not restart the moments of a subtree that comes back from being skipped, so a scene shown a second time stood empty. */
.biz-slide[data-pane="rest"]{z-index:0;opacity:0;visibility:hidden;pointer-events:none;transition:none}
@keyframes biz-in{from{opacity:0}}
/* Off screen, or the browser tab hidden: every moment in the scenes waits where it is. */
.biz:not([data-live]) .bz-on *,.biz:not([data-live]) .bz-on *::after{animation-play-state:paused!important}
@media(prefers-reduced-motion:reduce){
  .biz-slide{animation:none!important;transition:none!important}
  .biz-tab,.biz-tab-d,.biz-mark::before{transition:none}
}
`

/** This section's stylesheets (the frame it shares with the ideas section under the same name, so it is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
