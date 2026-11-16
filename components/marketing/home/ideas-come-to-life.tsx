"use client"

import { memo, useState, type ComponentType } from "react"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityMock, OnePageEditorMock, WebsiteBuilderMock } from "./showcase-mocks/builder-mocks"
import { PILLS_CSS } from "./showcase-mocks/pills"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

export const IDEAS_HEADING = "See your ideas come to life."

/*
  Landing round 4 (the owner): the heading changes by itself, two or three
  lines that flip on their own clock, over a line about building without
  code; the editors behind tabs: Website builder, OnePage editor, Community.
  One community only.

  Landing round 5 (the owner): tabs, "not as pill shapes". Plain words on a
  hairline, the chosen one dark with a short rule under it that grows from
  its middle (a transform). The community is a strength coaching group.

  Landing round 6 (the owner): the tabs "with pill shapes like how it was
  before": round 4's grey track again, the chosen tab a white pill that
  settles in (transform and opacity), the same 38px row, so the section
  keeps its height. The website builder shows a simple, clean merch brand,
  Plain Weather, and the line under the heading is shorter.

  Landing round 8 (the owner): the merch brand "more bold, more colorful,
  more funky, like a real Storelib store" (since removed, wave 18). The
  Strength Room gets a real emblem and a cover with its
  name in heavy yellow. The tabs and the autoplay are as they were.

  Landing round 9 (the owner): the heading, the line under it and the pill
  tabs are centred, on a phone and on a computer. The picture is "too big"
  on a computer: from 768px it is 88% of the page's shared width, centred
  (a phone keeps the full width). The depth under the picture "comes in very
  stutterish and gets cut by the section's container": every panel carried
  its own wide shadow, so a switch laid one shadow over another and took it
  away again, and the lazy box (paint containment) cut it at the foot. The
  panels now stand in one frame that never changes, a hairline border and no
  shadow, so a switch only cross fades what is inside it.

  Landing round 10 (the owner): the picture is still "too big" on a computer,
  "reduce it a little more, but keep the things", and the line under the
  heading goes. From 768px the frame is 78% of the shared width and never
  taller than the screen under the tabs allows (100svh less 170px), so on a
  1440x800 laptop the tabs and the whole picture stand in one screen. The
  editor inside is drawn in the frame's own width, so it shrinks whole. A
  phone keeps the full width.

  Landing round 11 (the owner): the Website builder tab moves on, "very
  smoothly", from the merch brand to a second site, loudlib (the owner's own
  store, a dark sample pack shop), and the OnePage editor tab from Desmond
  Ayo's page to Idris Kane's, both inside the same editor. A tab has
  `scenes`: the autoplay clock runs once per scene, and at the end of one
  that is not the last the panel's data-scene goes up and the editor's
  contents cross fade (opacity only, builder-mocks.tsx .bm-s1/.bm-s2); the
  editor's own chrome stays. The panel that leaves keeps its scene while it
  fades out, and is set back to the first only once it is at rest. The frame gets a little depth: one soft layered
  shadow on the frame that never changes, so nothing comes and goes when a
  tab or a scene changes, and it ends inside the section's own padding,
  so the lazy box never cuts it.

  Wave 18 (the owner, of the merch brand: "I don't like it at all"): it
  is gone and the Website builder tab shows one site, loudlib, for one
  scripted moment (Hero, products, Publish), then moves on. The other
  invented brands tried there had been turned down too; loudlib is the
  owner's own store and tells the whole story alone. The OnePage editor
  still moves from Desmond Ayo's page to Idris Kane's.
*/
export const IDEAS_HEADINGS = [IDEAS_HEADING, "A drag and drop editor.", "Full control over design."] as const
/** How long each heading stays, in seconds; the three take turns in one CSS loop. */
export const IDEAS_HEADING_S = 3.6

type IdeasTab = {
  id: string
  title: string
  alt: string
  Mock: ComponentType
  /** How many scripted moments the tab plays before the next tab (landing round 11). */
  scenes: number
}

export const IDEAS_TABS: readonly IdeasTab[] = [
  {
    id: "website",
    title: "Website builder",
    alt: "Storelib's website builder: the dark bar with Publish, the Header, Page and Footer sections of the home page in the sidebar, and the page itself, loudlib, a sample pack store: a purple sale bar, a dark header, the new bundle over a club photo, and the bestselling packs as black boxes. The Hero, then the products are selected, then Publish changes puts it live.",
    Mock: WebsiteBuilderMock,
    scenes: 1,
  },
  {
    id: "onepage",
    title: "OnePage editor",
    alt: "Storelib's OnePage editor: Desmond Ayo's links, his pack of 14 film LUTs, a free LUT and a grade review call on the Links tab, beside his live page on the Ember theme, as his email signup block is switched on and saved. Then Idris Kane's page, a photographer's: his photo melting into a dark page, his portfolio, bookings, prints and showreel, as his email signup is switched on.",
    Mock: OnePageEditorMock,
    scenes: 2,
  },
  {
    id: "community",
    title: "Community",
    alt: "Inside The Strength Room, a paid Storelib community where coach Rina Castillo runs strength training for women: its barbell emblem, the community card with the name in heavy yellow on the cover, the next live form check, the space chips, and the pinned post with the new program getting a like while a member writes a new post.",
    Mock: CommunityMock,
    scenes: 1,
  },
]

/* The mocks never change once drawn; switching tabs re-renders only the frame around them. */
const IdeasMock = memo(function IdeasMock({ i }: { i: number }) {
  const { Mock, alt } = IDEAS_TABS[i]
  return (
    <MockFrame label={alt} className="ideas-mock bm-frame">
      <Mock />
    </MockFrame>
  )
})

function Accented({ text }: { text: string }) {
  const at = text.lastIndexOf(" ")
  return (
    <>
      {text.slice(0, at + 1)}
      <em>{text.slice(at + 1)}</em>
    </>
  )
}

/** Section 4: a heading that changes by itself, pill tabs on a grey track, and Storelib's own editors behind them. */
export function IdeasComeToLife() {
  const t = useAutoTabs(IDEAS_TABS.length)
  const n = IDEAS_TABS.length
  /* The scene a tab is on (landing round 11). The panel that is leaving keeps the one it showed until it is at rest. */
  const [shown, setShown] = useState({ index: 0, scene: 0 })
  const scene = shown.index === t.index ? shown.scene : 0
  /* Once the old panel has faded out (no panel is leaving), the scene follows the new tab: set while rendering, no timer of its own. */
  const fading = [...t.states.values()].includes("leaving")
  if (shown.index !== t.index && !fading) setShown({ index: t.index, scene: 0 })
  const onClockEnd = () => {
    if (scene + 1 < IDEAS_TABS[t.index].scenes) setShown({ index: t.index, scene: scene + 1 })
    else t.advance()
  }
  return (
    <section
      ref={t.rootRef}
      className="ideas"
      data-story-section="ideas"
      data-ideas=""
      data-run={t.run || undefined}
      data-live={t.live || undefined}
      aria-labelledby="ideas-title"
    >
      <ShowcaseStyles styles={IDEAS_STYLES} />
      <div className="ideas-head">
        {/* One heading for assistive tech; the lines that take turns are what the eye reads. */}
        <h2 id="ideas-title" className="story-heading ideas-h" aria-label={IDEAS_HEADING}>
          <span className="ideas-stack" aria-hidden="true">
            {IDEAS_HEADINGS.map((h, i) => (
              <span key={h} className="ideas-line" style={{ animationDelay: `${i * IDEAS_HEADING_S - 0.6}s` }}>
                <Accented text={h} />
              </span>
            ))}
          </span>
        </h2>
      </div>
      <div className="ideas-tabs-row">
        <div className="ideas-tabs" role="tablist" aria-label="Storelib's editors">
          {IDEAS_TABS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`ideas-tab-${s.id}`}
              aria-controls={`ideas-panel-${s.id}`}
              aria-selected={i === t.index}
              tabIndex={i === t.index ? 0 : -1}
              className="ideas-tab"
              onClick={() => t.select(i)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                e.preventDefault()
                const to = (i + (e.key === "ArrowRight" ? 1 : -1) + n) % n
                t.select(to)
                document.getElementById(`ideas-tab-${IDEAS_TABS[to].id}`)?.focus()
              }}
            >
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      </div>
      {/* The autoplay clock: one scripted moment, then the next tab. Invisible, and paused while unseen (use-auto-tabs.ts). */}
      <span
        key={`${t.index}-${scene}`}
        className="smk-clock"
        data-on={t.playing || undefined}
        style={{ animationDuration: `${BUILDER_DURATION_MS}ms` }}
        onAnimationEnd={onClockEnd}
        aria-hidden="true"
      />
      <div className="ideas-stage" {...t.hoverProps}>
        <div className="ideas-frame">
          {IDEAS_TABS.map((s, i) => {
            const state = t.states.get(i)
            if (!state) return null
            return (
              <div
                key={s.id}
                id={`ideas-panel-${s.id}`}
                role="tabpanel"
                aria-labelledby={`ideas-tab-${s.id}`}
                aria-hidden={state !== "active" || undefined}
                className="ideas-panel"
                data-pane={state}
                data-mock-live={(state === "active" && t.live) || undefined}
                data-scene={i === shown.index ? shown.scene : 0}
              >
                <IdeasMock i={i} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/*
  White. The heading's three lines stand in one grid cell and take
  turns on one CSS loop (transform and opacity only), running only while the
  section is on screen and the tab visible; with reduced motion the first
  line stands still. The tabs are pills on a grey track above the picture, and
  a picture changes by a crossfade. On a phone the picture is the
  same desktop editor, only smaller (the owner: not adapted to the phone).
*/
const CSS = `
.ideas{position:relative;background:#fff;color:#18181b;overflow-x:clip}
/* Landing round 7: the page's one width (app/globals.css, .home-wrap): the editor as wide as the showcase cards under the hero, the heading, its line and the tabs from the same left edge, set in by the heading inset. */
/* Prefixed with the page root: the editorial rule "[data-landing-story] [data-story-section] > div" (1400px, the old gutter) is more specific than a class. */
[data-landing-story] .ideas>.ideas-head,.ideas-head{box-sizing:border-box;max-width:var(--home-max,2020px);margin:0 auto;padding:0 calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px));text-align:center}
.ideas .ideas-h{margin-inline:auto;font-size:clamp(36px,5vw,72px)}
.ideas-stack{display:grid}
.ideas-line{grid-area:1/1;align-self:center;opacity:0;transform:translate3d(0,.45em,0)}
.ideas-line:first-child{opacity:1;transform:none}
.ideas-line em{font-style:normal;color:var(--story-accent,#7c3aed)}
@media(prefers-reduced-motion:no-preference){
  .ideas-line{animation:ideas-flip ${IDEAS_HEADINGS.length * IDEAS_HEADING_S}s cubic-bezier(.22,1,.36,1) infinite both paused}
  .ideas[data-live] .ideas-line{animation-play-state:running}
}
/* Landing round 8 (the owner: "the flip thing is delayed"): the old line left from 29% (of the 10.8s loop, each line's turn is 33.3%) and the next came in only from 33.3%, so for a moment the heading was empty and every change read as late. Now the old line leaves (31% to 35%) while the next comes in (0 to 4.5% of its own turn, 486ms, was 648ms): one line hands over to the next in about 0.75s instead of 1.1s, with no empty moment. */
@keyframes ideas-flip{0%{opacity:0;transform:translate3d(0,.45em,0)}4.5%,31%{opacity:1;transform:none}35%,100%{opacity:0;transform:translate3d(0,-.4em,0)}}
[data-landing-story] .ideas>.ideas-tabs-row,.ideas-tabs-row{box-sizing:border-box;display:flex;justify-content:center;max-width:var(--home-max,2020px);margin:clamp(24px,3vw,36px) auto clamp(18px,2.2vw,28px);padding:0 calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px))}
.ideas-tabs{display:flex;gap:2px;max-width:100%;padding:4px;border-radius:999px;background:#f1f1f2}
.ideas-tab{position:relative;height:30px;padding:0 13px;border:0;border-radius:999px;background:transparent;color:#55525c;font-family:inherit;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.ideas-tab::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.08);opacity:0;transform:scale(.85);transition:opacity .35s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.ideas-tab span{position:relative}
.ideas-tab[aria-selected="true"]{color:#18181b}
.ideas-tab[aria-selected="true"]::before{opacity:1;transform:none}
@media(hover:hover){.ideas-tab:not([aria-selected="true"]):hover{color:#18181b}}
.ideas-tab:focus-visible{outline:2px solid #18181b;outline-offset:2px}
@media(max-width:379px){.ideas-tab{padding:0 10px;font-size:12.5px}}
@media(max-width:359px){.ideas-tab{padding:0 8px;font-size:12px}}
.ideas[data-run] .smk-clock[data-on]{animation-play-state:running}
[data-landing-story] .ideas>.ideas-stage,.ideas-stage{position:relative;display:grid;max-width:var(--home-max,2020px);margin:0 auto;padding:0 var(--home-edge,clamp(20px,5.15vw,84px));box-sizing:border-box}
/* Landing round 9: one frame for every panel, with the corners and a hairline; no shadow anywhere, so nothing comes and goes at the foot when a tab changes and nothing is there for the lazy box to cut. Landing round 10: from 768px it is 78% of the shared width, and no wider than a frame (1280/752) as tall as the screen less 170px (the tabs, their gap and a margin), centred. */
.ideas-frame{grid-area:1/1;display:grid;box-sizing:border-box;width:100%;justify-self:center;border:1px solid #e3e3e6;border-radius:clamp(9px,1.3vw,17px);overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(16,24,40,.04),0 6px 16px -6px rgba(16,24,40,.08),0 22px 44px -22px rgba(16,24,40,.16)}
/* Landing round 11 (the owner: "a little more depth, just a little"): the shadow above sits on the frame, which never changes or moves, so a tab or a scene changing never touches it; the shadow reaches 22px under the frame, inside the section's own padding below it, so the section's box never cuts it and no height changes. */
@media(min-width:768px){.ideas-frame{width:min(78%,calc((100svh - 170px) * 1280 / 752))}}
.ideas-panel{grid-area:1/1;background:#fff;transition:opacity .55s cubic-bezier(.2,.7,.2,1)}
.ideas-panel[data-pane="active"]{z-index:2;animation:ideas-in .55s cubic-bezier(.2,.7,.2,1) both}
.ideas-panel[data-pane="leaving"]{z-index:1}
.ideas-panel[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
.ideas-panel[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none;transition:none}
@keyframes ideas-in{from{opacity:0}}
.ideas-mock{aspect-ratio:1280/752;background:#fff;pointer-events:none;user-select:none;-webkit-user-select:none}
@media(max-width:767px){
  .ideas .ideas-h{font-size:clamp(30px,8.4vw,40px)}
}
@media(prefers-reduced-motion:reduce){
  .ideas-line{animation:none!important}
  .ideas-panel{animation:none!important;transition:none!important}
  .ideas-tab,.ideas-tab::before{transition:none}
}
`

/** This section's stylesheets: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const IDEAS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-pills", precedence: SHOWCASE_PRECEDENCE, css: PILLS_CSS },
  { href: "w12-smk-builder", precedence: SHOWCASE_PRECEDENCE, css: BUILDER_CSS },
  { href: "w12-ideas", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
