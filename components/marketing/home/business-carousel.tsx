"use client"

import { memo, type ReactNode } from "react"
import { ArrowRight, Pause, Play } from "lucide-react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { STORE_CSS, StoreDesktop, StoreMobile } from "./showcase-mocks/store-mock"
import { ONEPAGE_CSS, OnePageDesktop, OnePagePhone } from "./showcase-mocks/onepage-mock"
import { COMMUNITY_CSS, CommunityDesktop, CommunityMobile } from "./showcase-mocks/community-mock"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

export const BUSINESS_HEADING = "Made for every kind of business."
export const BUSINESS_SUBLINE = "Explore the different ways people can create, sell, and connect on Storelib."
const SLIDE_MS = 6500

type Slide = {
  id: string
  label: string
  url: string | null
  tint: string
  desktop: ReactNode
  mobile: ReactNode
  desktopAlt: string
  mobileAlt: string
  desktopCaption: [string, string]
  mobileCaption: [string, string]
}

export const BUSINESS_SLIDES: Slide[] = [
  {
    id: "digital",
    label: "Digital Products",
    url: "gridline.studio",
    tint: "linear-gradient(150deg,#e8ecff 0%,#f4f1ff 55%,#fff1e8 100%)",
    desktop: <StoreDesktop brand="gridline" />,
    mobile: <StoreMobile brand="gridline" />,
    desktopAlt: "Gridline Studio's storefront selling Notion and Figma templates as instant downloads.",
    mobileAlt: "Gridline's Second Brain OS product page on a phone, $29 with a Buy now button.",
    desktopCaption: ["Gridline Studio", "A template shop with bundles, reviews and instant downloads."],
    mobileCaption: ["Product page", "Buyers check out in seconds and get the file right away."],
  },
  {
    id: "courses",
    label: "Courses",
    url: "brushandbloom.art",
    tint: "linear-gradient(150deg,#eef1e8 0%,#f8f3ea 60%,#fbe9df 100%)",
    desktop: <StoreDesktop brand="bloom" />,
    mobile: <StoreMobile brand="bloom" />,
    desktopAlt: "Brush & Bloom's course site for a 21-day watercolor course, $129.",
    mobileAlt: "The Loose Florals course page on a phone, with a free preview lesson and the curriculum.",
    desktopCaption: ["Brush & Bloom", "A watercolor course with free lessons, modules and reviews."],
    mobileCaption: ["Course page", "Students preview a lesson, then enroll in one tap."],
  },
  {
    id: "communities",
    label: "Communities",
    url: "darkroom.club",
    tint: "linear-gradient(150deg,#fbf0e3 0%,#f6f3ef 55%,#ece9f8 100%)",
    desktop: <CommunityDesktop brand="darkroom" />,
    mobile: <CommunityMobile brand="darkroom" />,
    desktopAlt: "The Darkroom Club community feed with spaces, posts, an event and a weekly leaderboard.",
    mobileAlt: "The Darkroom Club on a phone: a pinned roll swap event and members' posts.",
    desktopCaption: ["The Darkroom Club", "2,318 film photographers sharing work, critique and events."],
    mobileCaption: ["Member app view", "Members post, comment and RSVP from anywhere."],
  },
  {
    id: "onepage",
    label: "OnePage",
    url: null,
    tint: "linear-gradient(150deg,#e3ecdc 0%,#f5f1e7 60%,#f6e3d0 100%)",
    desktop: <OnePageDesktop brand="priya" />,
    mobile: <OnePagePhone brand="priya" />,
    desktopAlt: "Sol & Sage's OnePage on a desktop browser: a cookbook, recipes and a cooking class.",
    mobileAlt: "Sol & Sage's OnePage on a phone, selling the Weeknight Green cookbook for $18.",
    desktopCaption: ["Sol & Sage", "A cookbook, recipes and live classes behind one link."],
    mobileCaption: ["Link in bio", "Sells, books and grows the list straight from a bio."],
  },
  {
    id: "physical",
    label: "Physical Products",
    url: "hollowpines.shop",
    tint: "linear-gradient(150deg,#e9e6dc 0%,#f4efe4 55%,#f3e2d6 100%)",
    desktop: <StoreDesktop brand="hollow" />,
    mobile: <StoreMobile brand="hollow" />,
    desktopAlt: "Hollow Pines' merch store with hoodies, tees and caps from the Long Winter collection.",
    mobileAlt: "The Pinewood Heavyweight Hoodie product page on a phone, $68 with sizes and Add to cart.",
    desktopCaption: ["Hollow Pines", "Tour merch with sizes, colors and live stock."],
    mobileCaption: ["Product page", "Swatches, sizes and Add to cart that feel native."],
  },
]

/* Slides never change once drawn; switching re-renders only the frame around them. */
const BizPreviews = memo(function BizPreviews({ i }: { i: number }) {
  const s = BUSINESS_SLIDES[i]
  return (
    <>
      <figure className="biz-desktop">
        <div className="biz-window">
          {s.url && (
            <div className="biz-chrome" aria-hidden="true">
              <i />
              <i />
              <i />
              <span>{s.url}</span>
            </div>
          )}
          <MockFrame w={1040} ratio="16/9" label={s.desktopAlt}>
            {s.desktop}
          </MockFrame>
        </div>
        <figcaption>
          <b>{s.desktopCaption[0]}</b> {s.desktopCaption[1]}
        </figcaption>
      </figure>
      <figure className="biz-mobile">
        <div className="biz-phone">
          <MockFrame w={390} ratio="9/16" label={s.mobileAlt}>
            {s.mobile}
          </MockFrame>
        </div>
        <figcaption>
          <b>{s.mobileCaption[0]}</b> {s.mobileCaption[1]}
        </figcaption>
      </figure>
    </>
  )
})

/** Section 6: five kinds of business, each as a desktop and a phone preview. */
export function BusinessCarousel() {
  const t = useAutoTabs(BUSINESS_SLIDES.length)
  return (
    <section
      ref={t.rootRef}
      className="biz"
      data-story-section="business"
      data-business=""
      data-run={t.run || undefined}
      aria-labelledby="biz-title"
      aria-roledescription="carousel"
    >
      <ShowcaseStyles styles={BUSINESS_STYLES} />
      <div className="biz-in">
        <div className="biz-head">
          <StoryHeading id="biz-title" text={BUSINESS_HEADING} accent={["business"]} />
          <p>{BUSINESS_SUBLINE}</p>
        </div>
        <div className="biz-controls">
          <div className="biz-tabs" role="tablist" aria-label="Kinds of business">
            {BUSINESS_SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`biz-tab-${s.id}`}
                aria-controls={`biz-slide-${s.id}`}
                aria-selected={i === t.index}
                tabIndex={i === t.index ? 0 : -1}
                className="biz-tab"
                onClick={() => t.select(i)}
                onKeyDown={(e) => {
                  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return
                  e.preventDefault()
                  const to = (i + (e.key === "ArrowRight" ? 1 : -1) + BUSINESS_SLIDES.length) % BUSINESS_SLIDES.length
                  t.select(to)
                  document.getElementById(`biz-tab-${BUSINESS_SLIDES[to].id}`)?.focus()
                }}
              >
                {s.label}
                <span
                  className="biz-progress"
                  data-on={(i === t.index && t.playing) || undefined}
                  style={{ animationDuration: `${SLIDE_MS}ms` }}
                  onAnimationEnd={i === t.index ? t.advance : undefined}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
          <span className="biz-buttons">
            {!t.reduce && (
              <button
                type="button"
                className="biz-round"
                data-playing={t.playing || undefined}
                aria-label={t.playing ? "Pause the slideshow" : "Play the slideshow"}
                onClick={() => t.setPlaying(!t.playing)}
              >
                <Pause className="biz-icon-pause" />
                <Play className="biz-icon-play" />
              </button>
            )}
            <button type="button" className="biz-next" onClick={() => t.select(t.index + 1)}>
              Next
              <ArrowRight />
            </button>
          </span>
        </div>
        <div className="biz-stage" {...t.hoverProps}>
          {BUSINESS_SLIDES.map((s, i) => {
            const state = t.states.get(i)
            if (!state) return null
            return (
              <div
                key={s.id}
                id={`biz-slide-${s.id}`}
                role="tabpanel"
                aria-roledescription="slide"
                aria-label={`${i + 1} of ${BUSINESS_SLIDES.length}: ${s.label}`}
                aria-hidden={state !== "active" || undefined}
                className="biz-slide"
                data-pane={state}
                style={{ background: s.tint }}
              >
                <BizPreviews i={i} />
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

const CSS = `
.biz{position:relative;background:#fff;color:#18181b}
.biz-in{max-width:1400px;margin:0 auto;padding:clamp(64px,8vw,120px) var(--landing-gutter,clamp(22px,6vw,96px))}
.biz-head{max-width:900px}
.biz-head .story-heading{font-size:clamp(36px,5vw,72px)}
.biz-head p{max-width:52ch;margin:20px 0 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#65616e;text-wrap:pretty}
.biz-controls{display:flex;align-items:center;justify-content:space-between;gap:16px;margin:clamp(32px,4vw,48px) 0 20px}
.biz-tabs{display:flex;gap:8px;min-width:0;overflow-x:auto;scrollbar-width:none;scroll-snap-type:x proximity;padding:2px;margin:-2px}
.biz-tabs::-webkit-scrollbar{display:none}
.biz-tab{position:relative;flex:none;height:44px;padding:0 20px;border:0;border-radius:999px;background:#f3f2f5;color:#3f3c46;font:500 15px/1 var(--font-inter,Inter),Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer;overflow:hidden;scroll-snap-align:start;transition:background-color .35s cubic-bezier(.2,.7,.2,1),color .35s}
.biz-tab:hover{background:#ebe9ef}
.biz-tab[aria-selected="true"]{background:#18181b;color:#fff}
.biz-tab:focus-visible,.biz-round:focus-visible,.biz-next:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
.biz-progress{position:absolute;left:20px;right:20px;bottom:7px;height:2px;border-radius:2px;background:linear-gradient(90deg,#a78bfa,#7c3aed);transform:scaleX(0);transform-origin:left;opacity:0}
.biz-progress[data-on]{opacity:1;animation-name:biz-progress;animation-timing-function:linear;animation-fill-mode:both;animation-play-state:paused}
.biz[data-run] .biz-progress[data-on]{animation-play-state:running}
@keyframes biz-progress{to{transform:scaleX(1)}}
.biz-buttons{flex:none;display:flex;gap:8px}
.biz-round,.biz-next{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;border:0;border-radius:999px;cursor:pointer;font:500 15px/1 var(--font-inter,Inter),Inter,system-ui,sans-serif;transition:background-color .2s,transform .2s}
.biz-round{width:44px;background:#f3f2f5;color:#18181b}
.biz-round:hover{background:#ebe9ef}
.biz-next{padding:0 18px 0 20px;background:#18181b;color:#fff}
.biz-next:hover{background:#2c2a33}
.biz-next:active{transform:scale(.97)}
.biz-round svg,.biz-next svg{width:16px;height:16px}
.biz-round .biz-icon-play,.biz-round[data-playing] .biz-icon-pause{display:block}
.biz-round .biz-icon-pause,.biz-round[data-playing] .biz-icon-play{display:none}
.biz-stage{position:relative;display:grid;border-radius:clamp(22px,2.6vw,32px);overflow:hidden;background:#f6f6f7}
.biz-slide{grid-area:1/1;contain-intrinsic-block-size:auto 0px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,.29fr);gap:clamp(20px,3vw,48px);align-items:start;padding:clamp(24px,4vw,64px)}
.biz-slide[data-pane="active"]{z-index:2;animation:biz-in .4s cubic-bezier(.2,.7,.2,1) both}
.biz-slide[data-pane="leaving"]{z-index:1}
.biz-slide[data-pane="next"]{z-index:0;opacity:0;pointer-events:none}
.biz-slide[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none}
@keyframes biz-in{from{opacity:0}}
.biz-slide[data-pane="active"] .biz-window{animation:biz-rise .75s cubic-bezier(.2,.7,.2,1) both}
.biz-slide[data-pane="active"] .biz-phone{animation:biz-rise .75s .08s cubic-bezier(.2,.7,.2,1) both}
@keyframes biz-rise{from{transform:translate3d(0,22px,0) scale(.985)}}
.biz figure{margin:0;min-width:0}
.biz-window{border-radius:clamp(10px,1.2vw,14px);overflow:hidden;background:#fff;box-shadow:0 1px 2px rgba(20,16,40,.06),0 24px 60px -12px rgba(20,16,40,.22)}
.biz-chrome{display:flex;align-items:center;gap:6px;height:clamp(22px,2.2vw,32px);padding:0 12px;background:#f7f6f4;border-bottom:1px solid #eae7e2}
.biz-chrome i{width:clamp(6px,.6vw,9px);height:clamp(6px,.6vw,9px);border-radius:50%;background:#dcd8d1}
.biz-chrome span{margin:0 auto;padding:3px clamp(16px,4vw,64px);border-radius:6px;background:#ebe8e3;font-size:clamp(9px,.8vw,12px);color:#6b665e}
.biz-phone{border-radius:clamp(22px,2.6vw,38px);padding:clamp(5px,.55vw,8px);background:#111;box-shadow:0 30px 60px -16px rgba(20,16,40,.4)}
.biz-phone .smk-frame{border-radius:clamp(17px,2.1vw,31px)}
.biz figcaption{margin-top:16px;font-size:14px;line-height:1.5;color:#65616e;text-wrap:pretty}
.biz figcaption b{color:#18181b;font-weight:600}
@media(max-width:767px){
  .biz-head .story-heading{font-size:clamp(32px,9vw,40px)}
  .biz-controls{flex-direction:column;align-items:stretch}
  .biz-tabs{margin-inline:calc(-1*var(--landing-gutter,22px));padding-inline:var(--landing-gutter,22px);scroll-padding-inline:var(--landing-gutter,22px)}
  .biz-tab{padding:0 16px;font-size:14px}
  .biz-progress{left:16px;right:16px}
  .biz-buttons{justify-content:flex-end;order:2}
  .biz-slide{grid-template-columns:1fr;gap:0;padding:18px 16px 22px}
  .biz-desktop figcaption{max-width:50%;min-height:96px}
  .biz .biz-mobile{position:relative;z-index:1;width:44%;margin:-60% 2% 0 auto}
  .biz-mobile figcaption{margin-top:10px;font-size:12.5px}
  .biz-desktop figcaption{font-size:12.5px}
}
@media(prefers-reduced-motion:reduce){.biz-slide,.biz-window,.biz-phone{animation:none!important}}
`

/** This section's stylesheets (the mocks it shares with the ideas section under the same names, so each is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-store", precedence: SHOWCASE_PRECEDENCE, css: STORE_CSS },
  { href: "w12-smk-onepage", precedence: SHOWCASE_PRECEDENCE, css: ONEPAGE_CSS },
  { href: "w12-smk-community", precedence: SHOWCASE_PRECEDENCE, css: COMMUNITY_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
