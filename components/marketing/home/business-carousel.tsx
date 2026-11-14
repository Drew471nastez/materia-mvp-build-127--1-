"use client"

import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import { StoryHeading } from "@/components/marketing/story-heading"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUSINESS_MOCK_CSS, BookingPage, CapPage, CommunityPage, CoursePage, TemplatePage } from "./showcase-mocks/business-mocks"

/*
  ONE STORE FOR EVERYTHING YOU SELL (landing round 4).

  The owner: "make sure that this section is interactive. Like, as I scroll,
  it stops, the section freezes at some point, and as I scroll, it just
  scrolls to courses, communities, physical products, bookings, and then it
  lets me scroll out of the section."

  So the section is a tall track with the whole section pinned inside it by
  position: sticky. Scrolling through the track steps through the five kinds;
  at its end the pin lets go and the page carries on. No scroll listener and
  no layout read while scrolling: one invisible marker per kind lies in the
  track, and an IntersectionObserver with a one pixel line across the middle
  of the screen says which marker is under it. That changes one number in
  React five times over the whole track; everything that moves is a CSS
  transition on opacity and transform.

  A kind can still be clicked: the page scrolls to that kind's place in the
  track (smoothly), so the pin and the choice never disagree. With reduced
  motion, and on a screen too short to hold the pinned section, there is no
  track: the same section is a plain list (on a computer) or a row of tabs
  (on a phone) beside one page, and a click only changes the page.

  It stands on the white sheet (round 3): dark words, and each product on a
  white card over its own coloured ground, so nothing is a white slab on
  black. About half of what it shows ships in a box: a physical product comes
  second.
*/
export const BUSINESS_HEADING = "One store for everything you sell."

type Kind = {
  id: string
  label: string
  /** The label in the phone's pill row. */
  tab: string
  line: string
  page: ReactNode
  alt: string
}

export const BUSINESS_SLIDES: Kind[] = [
  {
    id: "digital",
    label: "Digital products",
    tab: "Digital",
    line: "Templates, ebooks, music and files, delivered the moment someone pays.",
    page: <TemplatePage />,
    alt: "A digital product page on Storelib: Studio OS for Notion by Priya Raman, $29, a workspace with clients, projects and invoices, duplicated into Notion in one click.",
  },
  {
    id: "physical",
    label: "Physical products",
    tab: "Physical",
    line: "Your own stock, or printed on demand and shipped for you.",
    page: <CapPage />,
    alt: "A product page on Storelib: the Marigold Cap by Field Day, $34, in marigold, navy or bone, embroidered in Porto and shipped in 2 days.",
  },
  {
    id: "courses",
    label: "Courses",
    tab: "Courses",
    line: "Video lessons people take at their own pace, picking up where they left off.",
    page: <CoursePage />,
    alt: "A course page on Storelib: Mixing in key, for new DJs, by Tomás Reyes. 16 lessons, $79, the first lesson free to watch.",
  },
  {
    id: "communities",
    label: "Communities",
    tab: "Communities",
    line: "Free or paid spaces with posts, events and chat, on your own page.",
    page: <CommunityPage />,
    alt: "A community page on Storelib: Second Serve, a padel community, $9 a month, 1,960 members, social doubles on Thursday and its spaces.",
  },
  {
    id: "bookings",
    label: "Bookings",
    tab: "Bookings",
    line: "Calls and sessions people pick a time for and pay for in one go.",
    page: <BookingPage />,
    alt: "A booking page on Storelib: a 30 minute portfolio review on a video call with Ines Duarte, a brand designer, $60, with times on Tuesday to Thursday.",
  },
]

/** The pinned mode is off under reduced motion and on a screen this short or shorter (the CSS below reads the same query). */
export const BUSINESS_PLAIN_QUERY = "(prefers-reduced-motion: reduce), (max-height: 600px)"

/* A page never changes once drawn; changing the kind only changes the attributes around it. */
const KindPage = memo(function KindPage({ i }: { i: number }) {
  const s = BUSINESS_SLIDES[i]
  return (
    <MockFrame w={640} ratio="640/520" label={s.alt}>
      {s.page}
    </MockFrame>
  )
})

/** Section 6: the kinds of things a Storelib store sells, stepped through by scrolling while the section holds still. */
export function BusinessCarousel() {
  const n = BUSINESS_SLIDES.length
  const [index, setIndex] = useState(0)
  const [left, setLeft] = useState<number | null>(null)
  const current = useRef(0)
  const track = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLDivElement>(null)

  const show = useCallback((i: number) => {
    if (i === current.current) return
    setLeft(current.current)
    current.current = i
    setIndex(i)
  }, [])

  /* One observer for the five markers: the one crossing the middle of the screen is the kind on show. */
  useEffect(() => {
    const el = track.current
    if (!el || typeof IntersectionObserver !== "function") return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) show(Number((e.target as HTMLElement).dataset.step))
      },
      { rootMargin: "-50% 0px -50% 0px", threshold: 0 },
    )
    el.querySelectorAll<HTMLElement>("[data-step]").forEach((m) => io.observe(m))
    return () => io.disconnect()
  }, [show])

  /* On a phone the tabs are one row that may be wider than the screen: the chosen tab is brought into view inside the row (the page itself never scrolls for it). */
  useEffect(() => {
    const row = list.current
    if (!row || row.scrollWidth <= row.clientWidth) return
    const tab = row.children[index] as HTMLElement | undefined
    if (!tab) return
    const to = tab.offsetLeft - (row.clientWidth - tab.offsetWidth) / 2
    row.scrollTo({ left: to, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })
  }, [index])

  /* A click picks the kind; while pinned it also scrolls to that kind's place in the track, so scrolling on carries on from there. */
  const pick = (i: number) => {
    show(i)
    const el = track.current
    if (!el || window.matchMedia(BUSINESS_PLAIN_QUERY).matches) return
    const step = el.querySelector<HTMLElement>('[data-step="1"]')?.offsetHeight ?? 0
    const top = el.getBoundingClientRect().top + window.scrollY + i * step
    window.scrollTo({ top, behavior: "smooth" })
  }

  const paneState = (i: number) => (i === index ? "active" : i === left ? "leaving" : "rest")

  return (
    <section className="biz" data-story-section="business" data-business="" aria-labelledby="biz-title">
      <ShowcaseStyles styles={BUSINESS_STYLES} />
      <div ref={track} className="biz-track" style={{ ["--biz-n" as string]: n }}>
        <div className="biz-pin">
          <div className="biz-in">
            <div className="biz-side">
              <StoryHeading id="biz-title" className="biz-h" text={BUSINESS_HEADING} accent={["everything"]} />
              <div ref={list} className="biz-list" role="tablist" aria-orientation="vertical" aria-label="What you can sell">
                {BUSINESS_SLIDES.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    id={`biz-tab-${s.id}`}
                    aria-controls={`biz-slide-${s.id}`}
                    aria-selected={i === index}
                    tabIndex={i === index ? 0 : -1}
                    className="biz-kind"
                    onClick={() => pick(i)}
                    onKeyDown={(e) => {
                      const step = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 0
                      if (!step) return
                      e.preventDefault()
                      const to = (i + step + n) % n
                      pick(to)
                      document.getElementById(`biz-tab-${BUSINESS_SLIDES[to].id}`)?.focus({ preventScroll: true })
                    }}
                  >
                    <b className="biz-kind-l">{s.label}</b>
                    <b className="biz-kind-s">{s.tab}</b>
                    <span className="biz-kind-d">{s.line}</span>
                  </button>
                ))}
              </div>
              <p className="biz-line" aria-hidden="true">
                {BUSINESS_SLIDES.map((s, i) => (
                  <span key={s.id} data-on={i === index || undefined}>
                    {s.line}
                  </span>
                ))}
              </p>
            </div>
            <div className="biz-stage">
              {BUSINESS_SLIDES.map((s, i) => (
                <div
                  key={s.id}
                  id={`biz-slide-${s.id}`}
                  role="tabpanel"
                  aria-labelledby={`biz-tab-${s.id}`}
                  aria-hidden={i !== index || undefined}
                  className="biz-slide"
                  data-pane={paneState(i)}
                >
                  <KindPage i={i} />
                </div>
              ))}
            </div>
          </div>
        </div>
        {BUSINESS_SLIDES.map((s, i) => (
          <i key={s.id} className="biz-step" data-step={i} style={{ ["--i" as string]: i }} aria-hidden="true" />
        ))}
      </div>
    </section>
  )
}

/*
  THE TRACK. One screen for the pinned section plus one step for each kind
  after the first; the pin is sticky at the top of the screen and leaves room
  for the site's bar. Marker i covers the scroll positions where the middle
  of the screen is within half a step of kind i's place, the first and last
  reaching to the ends of the track. Without the pin (reduced motion, a short
  screen) the track is as tall as the section and the markers are not drawn.

  A list beside the page on a computer; on a phone the heading, the pill row
  of "Make the work", the chosen kind's line, and the page. A page changes by
  a crossfade with a slight rise, and its coloured ground with it.
*/
const CSS = `
.biz{position:relative;background:#fff;color:#18181b}
.biz-track{--biz-step:62svh;--biz-top:72px;position:relative;height:calc(100svh + (var(--biz-n) - 1) * var(--biz-step))}
.biz-pin{position:sticky;top:0;height:100svh;display:flex;align-items:center;padding-top:var(--biz-top);box-sizing:border-box}
.biz-step{position:absolute;left:0;width:1px;top:calc(50svh + (var(--i) - .5) * var(--biz-step));height:var(--biz-step);pointer-events:none;visibility:hidden}
.biz-step[data-step="0"]{top:0;height:calc(50svh + .5 * var(--biz-step))}
.biz-step:last-child{height:calc(50svh + .5 * var(--biz-step))}
.biz-in{width:100%;max-width:1400px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px));box-sizing:border-box;display:grid;grid-template-columns:minmax(0,5fr) minmax(0,7fr);gap:clamp(32px,5vw,80px);align-items:center}
.biz .biz-h{max-width:12ch;font-size:clamp(34px,4.2vw,64px)}
.biz-list{display:grid;gap:2px;margin-top:clamp(20px,3vh,36px)}
.biz-kind{position:relative;display:grid;gap:3px;padding:12px 18px;border:0;border-radius:16px;background:none;text-align:left;font:inherit;color:#8e8c96;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:color .35s ease}
.biz-kind::before{content:"";position:absolute;inset:0;border-radius:inherit;background:#f2f2f3;opacity:0;transform:scale(.97);transition:opacity .4s ease,transform .5s cubic-bezier(.22,1,.36,1)}
.biz-kind > *{position:relative}
.biz-kind-l{font-size:clamp(17px,1.5vw,21px);font-weight:600;letter-spacing:-.01em;color:#55525c;transition:color .35s ease}
.biz-kind-s{display:none}
.biz-kind-d{font-size:14.5px;line-height:1.5;max-width:40ch}
@media(hover:hover) and (pointer:fine){.biz-kind:not([aria-selected="true"]):hover .biz-kind-l{color:#18181b}}
.biz-kind[aria-selected="true"]{color:#55525c}
.biz-kind[aria-selected="true"] .biz-kind-l{color:#18181b}
.biz-kind[aria-selected="true"]::before{opacity:1;transform:none}
.biz-kind:focus-visible{outline:2px solid #18181b;outline-offset:2px}
.biz-line{display:none}
.biz-stage{position:relative;display:grid;width:min(100%,calc((100svh - var(--biz-top) - 72px) * 1.2308));justify-self:center;border-radius:clamp(15px,1.8vw,23px);overflow:hidden;box-shadow:0 0 0 1px rgba(16,24,40,.06),0 30px 60px -36px rgba(16,24,40,.35)}
.biz-stage .smk{pointer-events:none;user-select:none;-webkit-user-select:none}
.biz-slide{grid-area:1/1;opacity:0;transform:translate3d(0,14px,0) scale(.985);transition:opacity .6s cubic-bezier(.2,.7,.2,1),transform .7s cubic-bezier(.2,.7,.2,1)}
.biz-slide[data-pane="active"]{z-index:2;opacity:1;transform:none}
.biz-slide[data-pane="leaving"]{z-index:1;opacity:0;transform:none;transition-duration:.6s,0s;transition-delay:.15s,0s}
.biz-slide[data-pane="rest"]{z-index:0;transition:none}
@media(max-width:899px){
  .biz-track{--biz-top:64px;--biz-step:56svh}
  .biz-in{grid-template-columns:minmax(0,1fr);gap:14px;align-content:center}
  .biz .biz-h{max-width:none;font-size:clamp(30px,8.4vw,40px)}
  /* The pill row of "Make the work": same track, same 30px tabs, the chosen one white. It reaches the screen's edges, so a row wider than a small phone slides under the thumb. */
  .biz-list{display:flex;gap:0;margin:16px calc(-1 * var(--landing-gutter,22px)) 0;padding-inline:var(--landing-gutter,22px);overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none}
  .biz-list::-webkit-scrollbar{display:none}
  .biz-kind{flex:none;display:block;height:38px;padding:4px 0;border-radius:0;color:#55525c;background:#f1f1f2}
  .biz-kind:first-child{padding-left:4px;border-radius:999px 0 0 999px}
  .biz-kind:last-child{padding-right:4px;border-radius:0 999px 999px 0}
  .biz-kind::before{display:none}
  .biz-kind-l,.biz-kind-d{display:none}
  .biz-kind-s{display:block;height:30px;padding:0 13px;border-radius:999px;font-size:13px;font-weight:500;line-height:30px;white-space:nowrap;transition:color .35s ease,background-color .35s ease}
  .biz-kind[aria-selected="true"]{color:#18181b}
  .biz-kind[aria-selected="true"] .biz-kind-s{background:#fff}
  .biz-kind:focus-visible{outline-offset:-2px}
  .biz-line{display:grid;margin-top:12px;font-size:15px;line-height:1.5;color:#55525c;min-height:3em}
  .biz-line span{grid-area:1/1;opacity:0;transition:opacity .4s ease}
  .biz-line span[data-on]{opacity:1}
  .biz-stage{width:100%;max-width:calc((100svh - var(--biz-top) - 260px) * 1.2308)}
}
@media(max-width:479px){.biz-kind-s{padding:0 9px;font-size:12.5px}}
/* No pin: reduced motion, or a screen too short to hold it. The same section, as a plain list (or tabs) beside one page. */
@media(prefers-reduced-motion:reduce),(max-height:600px){
  .biz-track{height:auto}
  .biz-pin{position:relative;height:auto;padding-top:0}
  .biz-step{display:none}
  .biz-slide,.biz-line span{transition:none!important}
  .biz-kind,.biz-kind::before,.biz-kind-l,.biz-kind-s{transition:none}
  .biz-stage{width:100%;max-width:none}
}
`

/** This section's stylesheets (the frame it shares with the ideas section under the same name, so it is added once): put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const BUSINESS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-business", precedence: SHOWCASE_PRECEDENCE, css: BUSINESS_MOCK_CSS },
  { href: "w12-biz", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
