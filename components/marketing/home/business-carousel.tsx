"use client"

import { memo, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import {
  BUSINESS_MOCK_CSS,
  WatercolorDesktop,
  WatercolorMobile,
  DarkroomDesktop,
  DarkroomMobile,
  WrenAshDesktop,
  WrenAshMobile,
  LowSeasonDesktop,
  LowSeasonMobile,
  SolDesktop,
  SolMobile,
} from "./showcase-mocks/business-mocks"
import { PILLS_CSS } from "./showcase-mocks/pills"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

/* Wave 13 (the owner): a different heading, no subheading, no pause or Next button. */
export const BUSINESS_HEADING = "Every business, one home."
export const BUSINESS_SLIDE_MS = 6500

type Slide = {
  id: string
  label: string
  desktop: ReactNode
  mobile: ReactNode
  desktopAlt: string
  mobileAlt: string
}

export const BUSINESS_SLIDES: Slide[] = [
  {
    id: "digital",
    label: "Digital Products",
    desktop: <LowSeasonDesktop />,
    mobile: <LowSeasonMobile />,
    desktopAlt: "Low Season, a travel photographer's Lightroom preset shop on Storelib: a before and after desert photo and four bestselling preset packs from $16.",
    mobileAlt: "Low Season's Algarve Coast preset pack on a phone: a before and after beach photo, 4.8 stars from 1,127 reviews, $24 and an Add to cart button.",
  },
  {
    id: "courses",
    label: "Courses",
    desktop: <WatercolorDesktop />,
    mobile: <WatercolorMobile />,
    desktopAlt: "Elena Ruiz's watercolor course page for Loose Florals in 21 Days: a free first lesson, Enroll for $129 and the four modules students paint.",
    mobileAlt: "A student inside Elena Ruiz's watercolor course on a phone: lesson 7, Three-stroke petals, 38% complete, with the lessons that come next.",
  },
  {
    id: "communities",
    label: "Communities",
    desktop: <DarkroomDesktop />,
    mobile: <DarkroomMobile />,
    desktopAlt: "The Darkroom Club, a film photography community on Storelib: the community card, the next roll swap night and a member's post of three photographs.",
    mobileAlt: "The Darkroom Club on a phone: spaces, the pinned roll swap night and a member's Cinestill photograph of Tokyo after the rain.",
  },
  {
    id: "onepage",
    label: "OnePage",
    desktop: <SolDesktop />,
    mobile: <SolMobile />,
    desktopAlt: "Sol & Sage's OnePage on a computer: Priya Raman's cookbook for $18, a free meal plan, a live cooking class and recipes.",
    mobileAlt: "Sol & Sage's OnePage on a phone, the link in Priya Raman's bio: her cookbook, meal plan, live class and recipes.",
  },
  {
    id: "physical",
    label: "Physical Products",
    desktop: <WrenAshDesktop />,
    mobile: <WrenAshMobile />,
    desktopAlt: "Wren & Ash, an indie folk duo's merch shop: the Long Winter Tour 2026 and new arrivals, a hoodie, a tour tee, the album on vinyl and a cap.",
    mobileAlt: "The Ashgrove Heavyweight Hoodie on a phone: $68, three colors, sizes S to XXL and Add to cart.",
  },
]

/* Slides never change once drawn; switching re-renders only the frame around them. */
const BizCards = memo(function BizCards({ i }: { i: number }) {
  const s = BUSINESS_SLIDES[i]
  return (
    <div className="biz-row">
      <div className="biz-card biz-desk">
        <MockFrame w={1024} ratio="4/3" label={s.desktopAlt}>
          {s.desktop}
        </MockFrame>
      </div>
      <div className="biz-card biz-mob">
        <MockFrame w={390} ratio="9/16" label={s.mobileAlt}>
          {s.mobile}
        </MockFrame>
      </div>
    </div>
  )
})

/** Section 6: five kinds of business, each a desktop page (4:3) beside its phone page (9:16), both the same height. */
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
        <StoryHeading id="biz-title" className="biz-h" text={BUSINESS_HEADING} accent={["home"]} />
        <div className="biz-tabs smk-pills" role="tablist" aria-label="Kinds of business">
          {BUSINESS_SLIDES.map((s, i) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              id={`biz-tab-${s.id}`}
              aria-controls={`biz-slide-${s.id}`}
              aria-selected={i === t.index}
              tabIndex={i === t.index ? 0 : -1}
              className="smk-pill"
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
            </button>
          ))}
        </div>
        {/* The autoplay clock: an invisible CSS animation, so nothing ticks while it is paused or off screen (use-auto-tabs.ts). */}
        <span
          key={t.index}
          className="smk-clock"
          data-on={t.playing || undefined}
          style={{ animationDuration: `${BUSINESS_SLIDE_MS}ms` }}
          onAnimationEnd={t.advance}
          aria-hidden="true"
        />
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
              >
                <BizCards i={i} />
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
.biz-in{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px))}
.biz .biz-h{max-width:900px;font-size:clamp(36px,5vw,72px)}
.biz-tabs{margin:clamp(28px,3.4vw,44px) 0 clamp(20px,2.2vw,28px)}
.biz[data-run] .smk-clock[data-on]{animation-play-state:running}
.biz-stage{position:relative;display:grid}
.biz-slide{grid-area:1/1;contain-intrinsic-block-size:auto 0px;transition:opacity .55s cubic-bezier(.2,.7,.2,1)}
.biz-slide[data-pane="active"]{z-index:2;animation:biz-in .55s cubic-bezier(.2,.7,.2,1) both}
.biz-slide[data-pane="leaving"]{z-index:1}
.biz-slide[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
.biz-slide[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none;transition:none}
@keyframes biz-in{from{opacity:0}}
.biz-row{display:grid;grid-template-columns:minmax(0,64fr) minmax(0,27fr);gap:clamp(12px,1.7vw,24px);align-items:start}
.biz-card{min-width:0;border-radius:clamp(10px,1.3vw,18px);overflow:hidden;background:#f4f4f5;box-shadow:0 0 0 1px rgba(16,24,40,.07),0 1px 2px rgba(16,24,40,.05),0 22px 44px -26px rgba(16,24,40,.32)}
@media(max-width:767px){
  .biz .biz-h{font-size:clamp(32px,9vw,40px)}
  .biz-tabs.smk-pills{display:flex;width:auto;max-width:none;margin-inline:calc(-1*var(--landing-gutter,22px));padding:4px var(--landing-gutter,22px);border-radius:0;background:none;box-shadow:none;overflow-x:auto;scrollbar-width:none;scroll-padding-inline:var(--landing-gutter,22px)}
  .biz-tabs::-webkit-scrollbar{display:none}
  .biz-tabs .smk-pill{flex:none;background:#f1f1f1}
  .biz-tabs .smk-pill[aria-selected="true"]{background:#fff}
  .biz-row{--h:min(66vw,280px);display:flex;gap:10px;margin-right:calc(-1*var(--landing-gutter,22px));padding:0 var(--landing-gutter,22px) 16px 0;overflow-x:auto;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-width:none}
  .biz-row::-webkit-scrollbar{display:none}
  .biz-card{flex:none;scroll-snap-align:start}
  .biz-desk{width:calc(var(--h)*4/3)}
  .biz-mob{width:calc(var(--h)*9/16)}
}
@media(prefers-reduced-motion:reduce){.biz-slide{animation:none!important;transition:none!important}}
`

/** This section's stylesheets (the pills and the frame it shares with the ideas section under the same names, so each is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-pills", precedence: SHOWCASE_PRECEDENCE, css: PILLS_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
