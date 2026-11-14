"use client"

import { memo, useCallback, useEffect, useRef, useState, type ComponentType } from "react"
import { RailMotion, SHOWCASE_MOTION, type RailMotionConfig } from "@/lib/ui/rail-motion"
import type { SectionStyle } from "./lazy-section"
import { FRAME_CSS, MockFrame, SHOWCASE_PRECEDENCE, ShowcaseStyles } from "./showcase-mocks/frame"
import { BUILDER_CSS, BUILDER_DURATION_MS, CommunityBuilderMock, DesignMock, OnePageEditorMock, WebsiteBuilderMock } from "./showcase-mocks/builder-mocks"

export const IDEAS_HEADING = "See your ideas come to life."

type IdeasSlide = {
  id: string
  title: string
  /** The heading this slide flips the section's heading to; its last word is the accent. */
  heading: string
  line: string
  alt: string
  Mock: ComponentType
}

/*
  Landing round (the owner): the heading flips with the slides, "See your
  ideas come to life." then "Full control over design." and on, as the
  carousel moves; one slide per builder, the same drawing on a phone.
*/
export const IDEAS_SLIDES: readonly IdeasSlide[] = [
  {
    id: "website",
    title: "Website builder",
    heading: IDEAS_HEADING,
    line: "Pick a section, change it, publish. The page you edit is the page people see.",
    alt: "Storelib's website builder: the dark bar with Publish, the Header, Page and Footer sections of the Hearth & Hand home page in the sidebar, and the page itself, a sourdough course. The Curriculum section is selected, then Publish changes puts it live.",
    Mock: WebsiteBuilderMock,
  },
  {
    id: "design",
    title: "Design",
    heading: "Full control over design.",
    line: "Colors, type and motion for every section, from the theme or your own.",
    alt: "The Hero section open in Storelib's website builder: its color scheme changes from Light to Dark and the page's hero turns dark as it is picked.",
    Mock: DesignMock,
  },
  {
    id: "onepage",
    title: "OnePage editor",
    heading: "One page for every link.",
    line: "Links, products and an email signup, with the live page beside you as you edit.",
    alt: "Storelib's OnePage editor: Nina Sato's links, her EP, a vinyl record and guitar lessons on the Links tab beside her live page on the Air theme, as her email signup block is switched on and saved.",
    Mock: OnePageEditorMock,
  },
  {
    id: "community",
    title: "Community editor",
    heading: "A home for your community.",
    line: "Edit the page people see before they join, right on the page itself.",
    alt: "Storelib's community page editor for Kiln & Clay Collective: the community's About page beside the Edit page panel, as its tagline is rewritten, outlined on the page, and saved.",
    Mock: CommunityBuilderMock,
  },
]

/*
  THE CAROUSEL'S MOTION: lib/ui/rail-motion, the one the gallery under the
  hero uses (drag and swipe with momentum and snap, a flick is a whole step,
  the trackpad, the arrow keys, and autoplay played on the compositor). A
  slide stays in front for one scripted moment of its editor, then the next
  one glides in; the loop has no copies.
*/
export const IDEAS_MOTION: RailMotionConfig = {
  ...SHOWCASE_MOTION,
  autoplayStepMs: 1100,
  autoplayIntervalMs: BUILDER_DURATION_MS - 600,
  autoplayResumeMs: 9000,
}

/* A slide never changes once drawn; moving the carousel only changes the attributes around it. */
const IdeasMock = memo(function IdeasMock({ i }: { i: number }) {
  const { Mock, alt } = IDEAS_SLIDES[i]
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

/** Section 4: a heading that flips with the slides, over a carousel of Storelib's own editors. */
export function IdeasComeToLife() {
  const [index, setIndex] = useState(0)
  const [seen, setSeen] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [left, setLeft] = useState<number | null>(null)
  const front = useRef(0)
  const motion = useRef<RailMotion | null>(null)
  const cleanup = useRef<(() => void) | null>(null)

  /* The slide in front changed (mid-glide, or under the hand): the heading flips to it, the one before flips away. */
  const onIndex = useCallback((i: number) => {
    if (i === front.current) return
    setLeft(front.current)
    front.current = i
    setIndex(i)
  }, [])

  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      cleanup.current?.()
      cleanup.current = null
      if (!el) return
      const slides = () => [...el.querySelectorAll<HTMLElement>("[data-ideas-slide]")]
      el.dataset.railReady = "true"
      const rail = new RailMotion(el, slides(), slides(), IDEAS_MOTION, {
        onDragging: (dragging) => {
          if (dragging) el.dataset.dragging = "true"
          else delete el.dataset.dragging
        },
        onIndex,
      })
      motion.current = rail
      let frame = 0
      const remeasure = () => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => rail.measure(slides(), slides()))
      }
      const resize = typeof ResizeObserver === "function" ? new ResizeObserver(remeasure) : null
      resize?.observe(el)
      /* Autoplay and the editors' scripted moments run only while the carousel is on screen. */
      const io =
        typeof IntersectionObserver === "function"
          ? new IntersectionObserver(
              ([e]) => {
                rail.setVisible(e.intersectionRatio >= 0.4)
                setSeen(e.isIntersecting)
              },
              { threshold: [0, 0.4] },
            )
          : null
      if (io) io.observe(el)
      else {
        rail.setVisible(true)
        setSeen(true)
      }
      cleanup.current = () => {
        cancelAnimationFrame(frame)
        resize?.disconnect()
        io?.disconnect()
        rail.dispose()
        motion.current = null
        delete el.dataset.railReady
      }
    },
    [onIndex],
  )

  useEffect(() => {
    const sync = () => setHidden(document.hidden)
    sync()
    document.addEventListener("visibilitychange", sync)
    return () => {
      document.removeEventListener("visibilitychange", sync)
      cleanup.current?.()
    }
  }, [])

  const goTo = (to: number) => {
    const n = IDEAS_SLIDES.length
    let d = (((to - index) % n) + n) % n
    if (d > n / 2) d -= n
    if (d) motion.current?.step(d)
  }

  const live = seen && !hidden
  const lineState = (i: number) => (i === index ? "on" : i === left ? "off" : undefined)

  return (
    <section className="ideas" data-story-section="ideas" data-ideas="" aria-labelledby="ideas-title">
      <ShowcaseStyles styles={IDEAS_STYLES} />
      <div className="ideas-head">
        {/* One heading for assistive tech; the flipping lines are what the eye reads. */}
        <h2 id="ideas-title" className="story-heading ideas-h" aria-label={IDEAS_HEADING}>
          <span className="ideas-stack" aria-hidden="true">
            {IDEAS_SLIDES.map((s, i) => (
              <span key={s.id} className="ideas-line" data-flip={lineState(i)}>
                <Accented text={s.heading} />
              </span>
            ))}
          </span>
        </h2>
        <p className="ideas-sub">
          {IDEAS_SLIDES.map((s, i) => (
            <span key={s.id} className="ideas-subline" data-flip={lineState(i)} aria-hidden={i !== index || undefined}>
              {s.line}
            </span>
          ))}
        </p>
      </div>
      <div
        ref={attach}
        className="ideas-rail"
        tabIndex={0}
        role="region"
        aria-roledescription="carousel"
        aria-label="Storelib's editors. Drag, swipe or use the arrow keys."
      >
        {IDEAS_SLIDES.map((s, i) => (
          <div
            key={s.id}
            className="ideas-slide"
            data-ideas-slide=""
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${IDEAS_SLIDES.length}: ${s.title}`}
            data-active={i === index || undefined}
            data-mock-live={(i === index && live) || undefined}
          >
            <IdeasMock i={i} />
          </div>
        ))}
      </div>
      <div className="ideas-dots">
        {IDEAS_SLIDES.map((s, i) => (
          <button key={s.id} type="button" className="ideas-dot" aria-label={s.title} aria-current={i === index || undefined} onClick={() => goTo(i)}>
            <i />
          </button>
        ))}
      </div>
    </section>
  )
}

/*
  White, centred. The heading's lines stand in one grid cell and flip as the
  carousel moves: the one leaving lifts and fades, then the next one rises
  into its place, by transform and opacity only. The carousel is edge to edge:
  the slide in front centred, its neighbours showing at the sides, each
  slide its own box moved by rail-motion (a transform per slide).
*/
const CSS = `
.ideas{position:relative;background:#fff;color:#18181b;overflow-x:clip}
.ideas-head{max-width:1120px;margin:0 auto;padding:0 var(--landing-gutter,clamp(22px,6vw,96px));text-align:center}
.ideas .ideas-h{margin-inline:auto;font-size:clamp(36px,5vw,72px)}
.ideas-stack{display:grid}
.ideas-line{grid-area:1/1;align-self:center;opacity:0;transform:translate3d(0,.45em,0);transition:transform .7s cubic-bezier(.2,.8,.2,1),opacity .45s ease}
.ideas-line em{font-style:normal;color:var(--story-accent,#7c3aed)}
.ideas-line[data-flip="on"]{opacity:1;transform:none;transition-delay:.16s}
.ideas-line[data-flip="off"]{opacity:0;transform:translate3d(0,-.4em,0);transition-duration:.5s,.28s;transition-timing-function:cubic-bezier(.5,0,.75,0),ease}
.ideas-sub{display:grid;max-width:56ch;margin:18px auto 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#65616e;text-wrap:pretty}
.ideas-subline{grid-area:1/1;opacity:0;transform:translate3d(0,8px,0);transition:opacity .45s ease,transform .6s cubic-bezier(.2,.75,.2,1)}
.ideas-subline[data-flip="on"]{opacity:1;transform:none;transition-delay:.16s}
.ideas-subline[data-flip="off"]{transform:translate3d(0,-6px,0);transition-duration:.3s}
.ideas-rail{--iw:min(1180px,calc(100% - 200px));--ig:24px;position:relative;display:flex;gap:var(--ig);margin-top:clamp(32px,4vw,52px);padding-inline:calc((100% - var(--iw)) / 2);cursor:grab;touch-action:pan-y pinch-zoom;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none}
.ideas-rail:focus-visible .ideas-slide[data-active]{outline:2px solid #7c3aed;outline-offset:6px}
.ideas-rail[data-dragging]{cursor:grabbing}
.ideas-slide{flex:none;width:var(--iw);border-radius:clamp(11px,1.3vw,17px);overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(16,24,40,.08),0 1px 2px rgba(16,24,40,.05),0 28px 60px -30px rgba(16,24,40,.35);opacity:.45;transition:opacity .6s ease}
.ideas-rail[data-rail-ready] .ideas-slide{will-change:transform;backface-visibility:hidden}
.ideas-slide[data-active]{opacity:1}
.ideas-mock{aspect-ratio:1280/752;background:#fff;pointer-events:none}
.ideas-dots{display:flex;justify-content:center;gap:4px;margin-top:clamp(18px,2vw,26px)}
.ideas-dot{display:grid;place-items:center;width:36px;height:36px;padding:0;border:0;background:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.ideas-dot i{display:block;width:8px;height:8px;border-radius:50%;background:#d4d4d8;transition:background-color .3s ease,transform .3s ease}
.ideas-dot[aria-current] i{background:#18181b;transform:scale(1.15)}
.ideas-dot:focus-visible{outline:2px solid #7c3aed;outline-offset:-4px;border-radius:50%}
@media(max-width:767px){
  .ideas .ideas-h{font-size:clamp(30px,8.4vw,40px)}
  .ideas-rail{--iw:calc(100% - 44px);--ig:10px}
  .ideas-mock{aspect-ratio:640/836}
  .ideas-slide{opacity:.6}
}
@media(prefers-reduced-motion:reduce){
  .ideas-line,.ideas-subline{transition:none!important;transform:none!important}
  .ideas-slide{transition:none}
}
`

/** This section's stylesheets: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const IDEAS_STYLES: readonly SectionStyle[] = [
  { href: "w12-smk-frame", precedence: SHOWCASE_PRECEDENCE, css: FRAME_CSS },
  { href: "w12-smk-builder", precedence: SHOWCASE_PRECEDENCE, css: BUILDER_CSS },
  { href: "w12-ideas", precedence: SHOWCASE_PRECEDENCE, css: CSS },
]
