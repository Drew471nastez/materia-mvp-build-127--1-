"use client"

import { memo, useCallback, useEffect, useRef, useState, type ComponentType, type PointerEvent } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUSINESS_MOCK_CSS, BrainScene, ClubScene, CoachScene, CourseScene, HeadphonesScene } from "./showcase-mocks/business-mocks"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

/*
  WHAT YOU CAN SELL (landing round 8).
  Round 7 took "One store for everything you sell" off the page; the owner:
  "Keep the One store for everything you sell section, of course", with a
  clearer, simpler heading, a cleaner and wider structure, and pictures that
  move.

  So: the heading and one line at the page's one left edge (home-wrap plus
  the heading inset, like the showcase), the pill tabs of the ideas section,
  and under them one stage as wide as the showcase cards. Each tab is a
  scene on its own ground (showcase-mocks/business-mocks.tsx) with a short
  moment playing in it.

  Autoplay: the chosen pill fills with a thin line as its turn runs, and that
  line is the clock (when its animation ends, the next tab comes up). It
  pauses while a mouse rests on the stage, while a finger is on it (and for
  a moment after), while the section is off screen and while the browser tab
  is hidden, and carries on from where it stopped. Picking a tab shows it
  and starts its turn again; autoplay keeps going. With reduced motion
  nothing turns by itself and the scenes stand finished.
*/
export const BUSINESS_HEADING = "What will you sell?"
export const BUSINESS_SUB = "Downloads, things you ship, courses, paid communities and booked calls. Each one gets its own page and checkout."
export const BUSINESS_SLIDE_MS = 6500
/** How long autoplay waits after a finger leaves the stage. */
export const BUSINESS_TOUCH_RESUME_MS = 2500

type Kind = {
  id: string
  label: string
  /** The shorter label on a phone. */
  tab: string
  Scene: ComponentType
  alt: string
}

export const BUSINESS_SLIDES: readonly Kind[] = [
  {
    id: "digital",
    label: "Digital products",
    tab: "Digital",
    Scene: BrainScene,
    alt: "A digital product on Storelib: Second Brain, a dark Notion dashboard by Jun Park for $24, shown on a tablet with its cover, four areas and a task list being ticked off, then duplicated into the buyer's Notion.",
  },
  {
    id: "physical",
    label: "Physical products",
    tab: "Physical",
    Scene: HeadphonesScene,
    alt: "A physical product on Storelib: HN1 Studio Headphones by Halfnote Audio, $189, black headphones shot on a yellow backdrop, added to the cart and shipped from the studio in 2 days.",
  },
  {
    id: "courses",
    label: "Courses",
    tab: "Courses",
    Scene: CourseScene,
    alt: "A course on Storelib: Mixing in key, for new DJs, by Tomás Reyes. 16 lessons, $79. Lesson 3 plays to the end and the next lesson comes up.",
  },
  {
    id: "communities",
    label: "Communities",
    tab: "Communities",
    Scene: ClubScene,
    alt: "A community on Storelib: Applied AI Club, $12 a month, 2,480 members, with a live build on Wednesday and new posts arriving in its show-and-tell space.",
  },
  {
    id: "bookings",
    label: "Bookings",
    tab: "Bookings",
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

/** Section 4b: the kinds of things a Storelib store sells, one moving scene each, on autoplay. */
export function BusinessCarousel() {
  const t = useAutoTabs(BUSINESS_SLIDES.length)
  const n = BUSINESS_SLIDES.length
  const { go } = t

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

  /* On a phone the pills are one row that may be wider than the screen: the chosen one is brought into view inside the row (the page itself never scrolls for it). */
  const row = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const r = row.current
    if (!r || r.scrollWidth <= r.clientWidth) return
    const tab = r.children[t.index] as HTMLElement | undefined
    if (!tab) return
    r.scrollTo({ left: tab.offsetLeft - (r.clientWidth - tab.offsetWidth) / 2, behavior: t.reduce ? "auto" : "smooth" })
  }, [t.index, t.reduce])

  const run = t.run && !held
  return (
    <section
      ref={t.rootRef}
      className="biz"
      data-story-section="business"
      data-business=""
      data-run={run || undefined}
      data-live={t.live || undefined}
      data-auto={t.playing || undefined}
      aria-labelledby="biz-title"
    >
      <ShowcaseStyles styles={BUSINESS_STYLES} />
      <div className="biz-head">
        <StoryHeading id="biz-title" className="biz-h" text={BUSINESS_HEADING} accent={["sell"]} />
        <p className="biz-sub">{BUSINESS_SUB}</p>
      </div>
      <div className="biz-tabs-row">
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
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                  e.preventDefault()
                  const to = (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n
                  go(to)
                  document.getElementById(`biz-tab-${BUSINESS_SLIDES[to].id}`)?.focus()
                }}
              >
                <span className="biz-tab-l">{s.label}</span>
                <span className="biz-tab-s">{s.tab}</span>
                {/* The turn's clock, drawn: a line that fills under the label. A CSS animation, so nothing ticks while it is paused or off screen. */}
                {on && t.playing && (
                  <i
                    key={t.index}
                    className="biz-prog"
                    style={{ animationDuration: `${BUSINESS_SLIDE_MS}ms` }}
                    onAnimationEnd={t.advance}
                    aria-hidden="true"
                  />
                )}
              </button>
            )
          })}
        </div>
      </div>
      <div className="biz-stage-wrap">
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
      </div>
    </section>
  )
}

/*
  White, like the ideas section above it. The heading block, the pills and
  the stage share one left edge: the page's (app/globals.css, --home-edge,
  --home-max), the words set in by the heading inset. A scene changes by a
  crossfade over the one before; nothing in here animates layout.
*/
const CSS = `
.biz{position:relative;background:#fff;color:#18181b;overflow-x:clip}
/* Prefixed with the page root: the editorial rule "[data-landing-story] [data-story-section] > div" (1400px, the old gutter) is more specific than a class. */
[data-landing-story] .biz>.biz-head,.biz-head{box-sizing:border-box;max-width:var(--home-max,2020px);margin:0 auto;padding:0 calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px))}
.biz .biz-h{margin-inline:0;max-width:16ch;font-size:clamp(36px,5vw,72px)}
.biz-sub{max-width:52ch;margin:18px 0 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#65616e;text-wrap:pretty}
[data-landing-story] .biz>.biz-tabs-row,.biz-tabs-row{box-sizing:border-box;display:flex;max-width:var(--home-max,2020px);margin:clamp(24px,3vw,36px) auto clamp(18px,2.2vw,28px);padding:0 calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px))}
.biz-tabs{display:flex;gap:2px;max-width:100%;padding:4px;border-radius:999px;background:#f1f1f2;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
.biz-tabs::-webkit-scrollbar{display:none}
.biz-tab{position:relative;flex:none;height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#55525c;font-family:inherit;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.biz-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08);opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.biz-tab>span{position:relative}
.biz-tab-s{display:none}
.biz-tab[aria-selected="true"]{color:#18181b}
.biz-tab[aria-selected="true"]::before{opacity:1;transform:none}
@media(hover:hover){.biz-tab:not([aria-selected="true"]):hover{color:#18181b}}
.biz-tab:focus-visible{outline:2px solid #18181b;outline-offset:-2px}
/* The turn, filling: a 2px line inside the white pill, from its left. Transform only, paused unless the section runs. */
.biz-prog{position:absolute;left:13px;right:13px;bottom:4px;height:2px;border-radius:2px;background:#18181b;opacity:.75;transform:scaleX(0);transform-origin:0 50%;animation:biz-prog 1s linear both paused}
.biz[data-run] .biz-prog{animation-play-state:running}
@keyframes biz-prog{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@media(max-width:767px){
  .biz-tab-l{display:none}
  .biz-tab-s{display:inline}
  /* The row reaches the screen's edges, so a row wider than a small phone slides under the thumb. */
  [data-landing-story] .biz>.biz-tabs-row,.biz-tabs-row{padding:0 var(--home-edge,20px)}
  .biz .biz-h{font-size:clamp(32px,9vw,40px)}
  .biz-sub{font-size:16px}
}
@media(max-width:379px){.biz-tab{padding:0 10px;font-size:12.5px}.biz-prog{left:10px;right:10px}}
[data-landing-story] .biz>.biz-stage-wrap,.biz-stage-wrap{box-sizing:border-box;max-width:var(--home-max,2020px);margin:0 auto;padding:0 var(--home-edge,clamp(20px,5.15vw,84px))}
.biz-stage{position:relative;display:grid;border-radius:clamp(16px,1.6vw,26px);overflow:hidden;isolation:isolate;background:#f1f1f2;-webkit-tap-highlight-color:transparent}
.biz-stage .smk{pointer-events:none;user-select:none;-webkit-user-select:none}
.biz-slide{grid-area:1/1;border-radius:inherit;overflow:hidden;transition:opacity .6s cubic-bezier(.2,.7,.2,1)}
.biz-slide[data-pane="active"]{z-index:2;animation:biz-in .6s cubic-bezier(.2,.7,.2,1) both}
.biz-slide[data-pane="leaving"]{z-index:1}
.biz-slide[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
/* A scene put away is hidden, not content-visibility:hidden: Chrome does not restart the moments of a subtree that comes back from being skipped, so a scene shown a second time stood empty. */
.biz-slide[data-pane="rest"]{z-index:0;opacity:0;visibility:hidden;pointer-events:none;transition:none}
@keyframes biz-in{from{opacity:0}}
/* Off screen, or the browser tab hidden: every moment in the scenes waits where it is. */
.biz:not([data-live]) .bz-on *,.biz:not([data-live]) .bz-on *::after{animation-play-state:paused!important}
@media(prefers-reduced-motion:reduce){
  .biz-slide{animation:none!important;transition:none!important}
  .biz-tab,.biz-tab::before{transition:none}
  .biz-prog{display:none}
}
`

/** This section's stylesheets (the frame it shares with the ideas section under the same name, so it is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
