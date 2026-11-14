"use client"

import { memo, type ComponentType } from "react"
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
  its middle (a transform). The website builder shows a candle studio's
  store, the community is a strength coaching group.
*/
export const IDEAS_HEADINGS = [IDEAS_HEADING, "A drag and drop editor.", "Full control over design."] as const
export const IDEAS_SUB = "No code and nothing to install. Drag sections in, change anything on the page itself, and publish when it looks right."
/** How long each heading stays, in seconds; the three take turns in one CSS loop. */
export const IDEAS_HEADING_S = 3.6

type IdeasTab = {
  id: string
  title: string
  alt: string
  Mock: ComponentType
}

export const IDEAS_TABS: readonly IdeasTab[] = [
  {
    id: "website",
    title: "Website builder",
    alt: "Storelib's website builder: the dark bar with Publish, the Header, Page and Footer sections of Saltmoor's home page in the sidebar, and the page itself, a small candle studio's store. The Hero, then the Featured products section is selected, then Publish changes puts it live.",
    Mock: WebsiteBuilderMock,
  },
  {
    id: "onepage",
    title: "OnePage editor",
    alt: "Storelib's OnePage editor: Desmond Ayo's links, his pack of 14 film LUTs, a free LUT and a grade review call on the Links tab, beside his live page on the Ember theme, as his email signup block is switched on and saved.",
    Mock: OnePageEditorMock,
  },
  {
    id: "community",
    title: "Community",
    alt: "Inside The Strength Room, a paid Storelib community where coach Rina Castillo runs strength training for women: the community card, the next live form check, the space chips, and the pinned post with the new program getting a like while a member writes a new post.",
    Mock: CommunityMock,
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

/** Section 4: a heading that changes by itself, tabs on a hairline, and Storelib's own editors behind them. */
export function IdeasComeToLife() {
  const t = useAutoTabs(IDEAS_TABS.length)
  const n = IDEAS_TABS.length
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
        <p className="ideas-sub">{IDEAS_SUB}</p>
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
        key={t.index}
        className="smk-clock"
        data-on={t.playing || undefined}
        style={{ animationDuration: `${BUILDER_DURATION_MS}ms` }}
        onAnimationEnd={t.advance}
        aria-hidden="true"
      />
      <div className="ideas-stage" {...t.hoverProps}>
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
            >
              <IdeasMock i={i} />
            </div>
          )
        })}
      </div>
    </section>
  )
}

/*
  White, centred. The heading's three lines stand in one grid cell and take
  turns on one CSS loop (transform and opacity only), running only while the
  section is on screen and the tab visible; with reduced motion the first
  line stands still. The tabs are words on a hairline above the picture, and
  a picture changes by a crossfade. On a phone the picture is the
  same desktop editor, only smaller (the owner: not adapted to the phone).
*/
const CSS = `
.ideas{position:relative;background:#fff;color:#18181b;overflow-x:clip}
.ideas-head{max-width:1120px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px));text-align:center}
.ideas .ideas-h{margin-inline:auto;font-size:clamp(36px,5vw,72px)}
.ideas-stack{display:grid}
.ideas-line{grid-area:1/1;align-self:center;opacity:0;transform:translate3d(0,.45em,0)}
.ideas-line:first-child{opacity:1;transform:none}
.ideas-line em{font-style:normal;color:var(--story-accent,#7c3aed)}
@media(prefers-reduced-motion:no-preference){
  .ideas-line{animation:ideas-flip ${IDEAS_HEADINGS.length * IDEAS_HEADING_S}s cubic-bezier(.2,.8,.2,1) infinite both paused}
  .ideas[data-live] .ideas-line{animation-play-state:running}
}
@keyframes ideas-flip{0%{opacity:0;transform:translate3d(0,.45em,0)}6%,29%{opacity:1;transform:none}34%,100%{opacity:0;transform:translate3d(0,-.4em,0)}}
.ideas-sub{max-width:56ch;margin:18px auto 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#65616e;text-wrap:pretty}
.ideas-tabs-row{display:flex;justify-content:center;margin:clamp(24px,3vw,36px) var(--landing-gutter,16px) clamp(18px,2.2vw,28px)}
.ideas-tabs{display:flex;gap:clamp(18px,3vw,40px);max-width:100%;box-shadow:inset 0 -1px 0 #e7e7ea}
.ideas-tab{position:relative;height:38px;padding:0 2px;border:0;border-radius:0;background:none;color:#8a8794;font-family:inherit;font-size:16px;font-weight:500;letter-spacing:-.01em;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .3s ease}
.ideas-tab::after{content:"";position:absolute;left:0;right:0;bottom:0;height:2px;border-radius:2px;background:#18181b;transform:scaleX(0);transform-origin:50% 50%;transition:transform .45s cubic-bezier(.22,1,.36,1)}
.ideas-tab[aria-selected="true"]{color:#18181b}
.ideas-tab[aria-selected="true"]::after{transform:none}
@media(hover:hover){.ideas-tab:not([aria-selected="true"]):hover{color:#18181b}}
.ideas-tab:focus-visible{outline:2px solid #18181b;outline-offset:2px;border-radius:4px}
@media(max-width:767px){.ideas-tab{font-size:15px}}
@media(max-width:379px){.ideas-tabs{gap:14px}.ideas-tab{font-size:14px}}
.ideas[data-run] .smk-clock[data-on]{animation-play-state:running}
.ideas-stage{position:relative;display:grid;max-width:1180px;margin:0 auto;padding:0 var(--landing-gutter,clamp(16px,6vw,96px));box-sizing:content-box}
.ideas-panel{grid-area:1/1;border-radius:clamp(9px,1.3vw,17px);overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(16,24,40,.08),0 1px 2px rgba(16,24,40,.05),0 28px 60px -30px rgba(16,24,40,.35);transition:opacity .55s cubic-bezier(.2,.7,.2,1)}
.ideas-panel[data-pane="active"]{z-index:2;animation:ideas-in .55s cubic-bezier(.2,.7,.2,1) both}
.ideas-panel[data-pane="leaving"]{z-index:1}
.ideas-panel[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
.ideas-panel[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none;transition:none}
@keyframes ideas-in{from{opacity:0}}
.ideas-mock{aspect-ratio:1280/752;background:#fff;pointer-events:none;user-select:none;-webkit-user-select:none}
@media(max-width:767px){
  .ideas .ideas-h{font-size:clamp(30px,8.4vw,40px)}
  .ideas-sub{font-size:16px}
}
@media(prefers-reduced-motion:reduce){
  .ideas-line{animation:none!important}
  .ideas-panel{animation:none!important;transition:none!important}
  .ideas-tab,.ideas-tab::after{transition:none}
}
`

/** This section's stylesheets: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const IDEAS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-pills", precedence: SHOWCASE_PRECEDENCE, css: PILLS_CSS },
  { href: "w12-smk-builder", precedence: SHOWCASE_PRECEDENCE, css: BUILDER_CSS },
  { href: "w12-ideas", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
