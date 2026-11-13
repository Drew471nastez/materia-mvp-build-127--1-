"use client"

import { memo } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUSINESS_MOCK_CSS } from "./showcase-mocks/business-mocks"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityBuilderMock, OnePageEditorMock, WebsiteBuilderMock } from "./showcase-mocks/builder-mocks"
import { PILLS_CSS } from "./showcase-mocks/pills"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

export const IDEAS_HEADING = "See your ideas come to life."

/* Wave 13 (the owner): no caption under the picture, so a tab is its label and its mock. */
export const IDEAS_TABS = [
  {
    id: "website",
    label: "Website",
    more: " builder",
    title: "Website builder",
    alt: "Storelib's website builder: the dark bar with Publish, the sections of the Brush & Bloom home page in the sidebar, and the page itself with the Hero section selected, then Curriculum, then published.",
    Mock: WebsiteBuilderMock,
  },
  {
    id: "onepage",
    label: "OnePage",
    more: " editor",
    title: "OnePage editor",
    alt: "Storelib's OnePage editor: Maya Okafor's links and products on the Links tab beside the live phone preview, as her email signup block is switched on and saved.",
    Mock: OnePageEditorMock,
  },
  {
    id: "community",
    label: "Community",
    more: " builder",
    title: "Community builder",
    alt: "Storelib's community builder for Dawn Chorus Birders: Denise Walker writes a Saturday walk in Epping Forest in the composer and posts it to Walks, at the top of the posts list.",
    Mock: CommunityBuilderMock,
  },
] as const

/* The mocks never change once drawn; switching tabs re-renders only the frame around them. */
const IdeasMock = memo(function IdeasMock({ i }: { i: number }) {
  const { Mock, alt } = IDEAS_TABS[i]
  return (
    <MockFrame label={alt} className="ideas-mock bm-frame">
      <Mock />
    </MockFrame>
  )
})

/** Section 4: light, centered pill tabs over large, faithful previews of Storelib's own builders. */
export function IdeasComeToLife() {
  const t = useAutoTabs(IDEAS_TABS.length)
  return (
    <section
      ref={t.rootRef}
      className="ideas"
      data-story-section="ideas"
      data-ideas=""
      data-run={t.run || undefined}
      aria-labelledby="ideas-title"
    >
      <ShowcaseStyles styles={IDEAS_STYLES} />
      <div className="ideas-in">
        <div className="ideas-head">
          <StoryHeading id="ideas-title" text={IDEAS_HEADING} accent={["life"]} />
          <p>Every Storelib builder shows you the real thing while you make it. No previews to refresh, no code, nothing to guess.</p>
        </div>
        <div className="ideas-tabs smk-pills" role="tablist" aria-label="Storelib builders">
          {IDEAS_TABS.map((tab, i) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`ideas-tab-${tab.id}`}
              aria-controls={`ideas-panel-${tab.id}`}
              aria-selected={i === t.index}
              tabIndex={i === t.index ? 0 : -1}
              className="smk-pill"
              onClick={() => t.select(i)}
              onKeyDown={(e) => {
                if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                e.preventDefault()
                const to = (i + (e.key === "ArrowRight" ? 1 : -1) + IDEAS_TABS.length) % IDEAS_TABS.length
                t.select(to)
                document.getElementById(`ideas-tab-${IDEAS_TABS[to].id}`)?.focus()
              }}
            >
              {tab.label}
              <span className="ideas-more">{tab.more}</span>
            </button>
          ))}
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
          {IDEAS_TABS.map((tab, i) => {
            const state = t.states.get(i)
            if (!state) return null
            return (
              <div
                key={tab.id}
                id={`ideas-panel-${tab.id}`}
                role="tabpanel"
                aria-labelledby={`ideas-tab-${tab.id}`}
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
      </div>
    </section>
  )
}

/*
  Light (wave 13): white, everything centred, no backdrop behind the picture.
  The picture has its own depth (a hairline and a soft shadow) and changes by
  a crossfade only: nothing slides in.
*/
const CSS = `
.ideas{position:relative;background:#fff;color:#18181b}
.ideas-in{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px));text-align:center}
.ideas-head{max-width:880px;margin:0 auto}
.ideas-head .story-heading{margin-inline:auto;font-size:clamp(36px,5vw,72px)}
.ideas-head p{max-width:56ch;margin:20px auto 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#65616e;text-wrap:pretty}
.ideas-tabs{margin:clamp(28px,3.6vw,44px) auto clamp(24px,3vw,40px)}
.ideas[data-run] .smk-clock[data-on]{animation-play-state:running}
.ideas-stage{position:relative;display:grid;max-width:1240px;margin:0 auto;text-align:left}
.ideas-panel{grid-area:1/1;border-radius:clamp(12px,1.3vw,18px);overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(16,24,40,.08),0 1px 2px rgba(16,24,40,.05),0 28px 60px -30px rgba(16,24,40,.35);transition:opacity .5s cubic-bezier(.2,.7,.2,1)}
.ideas-panel[data-pane="active"]{z-index:2;animation:ideas-in .5s cubic-bezier(.2,.7,.2,1) both}
.ideas-panel[data-pane="leaving"]{z-index:1}
.ideas-panel[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
.ideas-panel[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none;transition:none}
@keyframes ideas-in{from{opacity:0}}
.ideas-mock{aspect-ratio:16/10;background:#fff}
@media(max-width:767px){
  .ideas-head .story-heading{font-size:clamp(32px,9vw,40px)}
  .ideas-more{display:none}
  .ideas-mock{aspect-ratio:390/640}
}
@media(prefers-reduced-motion:reduce){.ideas-panel{animation:none!important;transition:none!important}}
`

/** This section's stylesheets (the frame, pills and storefront mocks it shares with the business carousel under the same names): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const IDEAS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-pills", precedence: SHOWCASE_PRECEDENCE, css: PILLS_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-smk-builder", precedence: SHOWCASE_PRECEDENCE, css: BUILDER_CSS },
  { href: "w12-ideas", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
