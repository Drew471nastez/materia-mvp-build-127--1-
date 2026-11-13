"use client"

import { memo, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUSINESS_MOCK_CSS, BookingPage, CommunityPage, CoursePage, EbookPage, TeePage } from "./showcase-mocks/business-mocks"
import { PILLS_CSS } from "./showcase-mocks/pills"
import { useAutoTabs } from "./showcase-mocks/use-auto-tabs"

/*
  Landing round, the owner: "every business one home at all. Please look at
  something else." So the section is no longer five made-up storefronts
  behind five pills. It is what a Storelib store sells, as a quiet list
  beside one real product page for the line that is chosen.
*/
export const BUSINESS_HEADING = "One store for everything you sell."
export const BUSINESS_SLIDE_MS = 5200

type Kind = {
  id: string
  label: string
  line: string
  page: ReactNode
  alt: string
}

export const BUSINESS_SLIDES: Kind[] = [
  {
    id: "digital",
    label: "Digital products",
    line: "Ebooks, templates, music and files, delivered the moment someone pays.",
    page: <EbookPage />,
    alt: "A digital product page on Storelib: Weeknight Green, Priya Raman's PDF cookbook of 84 pages, $18, downloaded right after paying.",
  },
  {
    id: "courses",
    label: "Courses",
    line: "Video lessons people take at their own pace, picking up where they left off.",
    page: <CoursePage />,
    alt: "A course page on Storelib: Wheel throwing, from first centering, by Mei Lin. 12 lessons, $89, the first lesson free to watch.",
  },
  {
    id: "communities",
    label: "Communities",
    line: "Free or paid spaces with posts, events and chat, on your own page.",
    page: <CommunityPage />,
    alt: "A community page on Storelib: Saturday Run Club, free, 842 members, the next long run in Prospect Park and its spaces.",
  },
  {
    id: "physical",
    label: "Physical products",
    line: "Your own stock, or printed on demand and shipped for you.",
    page: <TeePage />,
    alt: "A product page on Storelib: the Pines Tour Tee by Hollow Pines in black, $32, sizes S to XXL, printed and shipped in 3 to 5 days.",
  },
  {
    id: "bookings",
    label: "Bookings",
    line: "Calls and sessions people pick a time for and pay for in one go.",
    page: <BookingPage />,
    alt: "A booking page on Storelib: a 45 minute Spanish conversation with Elena Ruiz, $35, with open times on Tuesday 18 November.",
  },
]

/* A page never changes once drawn; switching re-renders only the frame around it. */
const KindPage = memo(function KindPage({ i }: { i: number }) {
  const s = BUSINESS_SLIDES[i]
  return (
    <MockFrame w={640} ratio="640/520" label={s.alt}>
      {s.page}
    </MockFrame>
  )
})

/** Section 6: the kinds of things a Storelib store sells, a list beside the product page of the one chosen. */
export function BusinessCarousel() {
  const t = useAutoTabs(BUSINESS_SLIDES.length)
  const n = BUSINESS_SLIDES.length
  return (
    <section
      ref={t.rootRef}
      className="biz"
      data-story-section="business"
      data-business=""
      data-run={t.run || undefined}
      aria-labelledby="biz-title"
    >
      <ShowcaseStyles styles={BUSINESS_STYLES} />
      <div className="biz-in">
        <StoryHeading id="biz-title" className="biz-h" text={BUSINESS_HEADING} accent={["everything"]} />
        <div className="biz-grid">
          <div className="biz-list" role="tablist" aria-orientation="vertical" aria-label="What you can sell">
            {BUSINESS_SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`biz-tab-${s.id}`}
                aria-controls={`biz-slide-${s.id}`}
                aria-selected={i === t.index}
                tabIndex={i === t.index ? 0 : -1}
                className="biz-kind"
                onClick={() => t.select(i)}
                onKeyDown={(e) => {
                  const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
                  if (!step) return
                  e.preventDefault()
                  const to = (i + step + n) % n
                  t.select(to)
                  document.getElementById(`biz-tab-${BUSINESS_SLIDES[to].id}`)?.focus()
                }}
              >
                <b>{s.label}</b>
                <span>{s.line}</span>
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
                  aria-labelledby={`biz-tab-${s.id}`}
                  aria-hidden={state !== "active" || undefined}
                  className="biz-slide"
                  data-pane={state}
                >
                  <KindPage i={i} />
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

/*
  A list on the left, the page on the right (the page first on a phone).
  The chosen line is dark with a short rule beside it; the others are quiet.
  No pills and no line that fills: autoplay is the invisible clock, and a page
  changes by a crossfade only.
*/
const CSS = `
.biz{position:relative;background:#fff;color:#18181b}
.biz-in{max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px))}
.biz .biz-h{max-width:900px;font-size:clamp(36px,5vw,72px)}
.biz[data-run] .smk-clock[data-on]{animation-play-state:running}
.biz-grid{display:grid;grid-template-columns:minmax(0,5fr) minmax(0,8fr);gap:clamp(32px,5vw,80px);align-items:center;margin-top:clamp(32px,4vw,56px)}
.biz-list{display:grid;gap:4px}
.biz-kind{position:relative;display:grid;gap:4px;padding:16px 0 16px 22px;border:0;background:none;text-align:left;font:inherit;color:#a1a1aa;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.biz-kind::before{content:"";position:absolute;left:0;top:16px;bottom:16px;width:2px;border-radius:2px;background:#18181b;transform:scaleY(0);transform-origin:top;transition:transform .45s cubic-bezier(.2,.75,.2,1)}
.biz-kind b{font-size:clamp(18px,1.6vw,22px);font-weight:600;letter-spacing:-.01em}
.biz-kind span{font-size:15px;line-height:1.5;max-width:40ch}
@media(hover:hover) and (pointer:fine){.biz-kind:hover{color:#52525b}}
.biz-kind[aria-selected="true"]{color:#18181b}
.biz-kind[aria-selected="true"] span{color:#52525b}
.biz-kind[aria-selected="true"]::before{transform:none}
.biz-kind:focus-visible{outline:2px solid #7c3aed;outline-offset:2px;border-radius:8px}
.biz-stage{position:relative;display:grid;border-radius:clamp(16px,1.8vw,24px);overflow:hidden;background:#f2f2f3;box-shadow:0 0 0 1px rgba(16,24,40,.04)}
.biz-slide{grid-area:1/1;contain-intrinsic-block-size:auto 0px;transition:opacity .55s cubic-bezier(.2,.7,.2,1)}
.biz-slide[data-pane="active"]{z-index:2;animation:biz-in .55s cubic-bezier(.2,.7,.2,1) both}
.biz-slide[data-pane="leaving"]{z-index:1}
.biz-slide[data-pane="next"]{z-index:0;opacity:0;pointer-events:none;transition:none}
.biz-slide[data-pane="rest"]{z-index:0;opacity:0;content-visibility:hidden;pointer-events:none;transition:none}
@keyframes biz-in{from{opacity:0}}
@media(max-width:899px){
  .biz-grid{grid-template-columns:1fr;gap:20px}
  .biz-stage{order:-1}
  .biz-list{gap:0}
  .biz-kind{padding:10px 0 10px 16px}
  .biz-kind::before{top:10px;bottom:10px}
  .biz-kind b{font-size:17px}
  .biz-kind span{display:none}
}
@media(max-width:767px){
  .biz .biz-h{font-size:clamp(32px,9vw,40px)}
}
@media(prefers-reduced-motion:reduce){
  .biz-slide{animation:none!important;transition:none!important}
  .biz-kind,.biz-kind::before{transition:none}
}
`

/** This section's stylesheets (the frame it shares with the ideas section under the same name, so it is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-pills", precedence: SHOWCASE_PRECEDENCE, css: PILLS_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
