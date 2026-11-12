"use client"

import { useShowcaseMotion } from "./use-showcase-motion"
import { StoryHeading } from "./story-heading"
/*
  Nine fictional Storelib businesses, as three wide–OnePage–wide pages:
  storefronts, OnePages and communities, each with its own name, palette and
  type. Every picture is rendered from the live mockups in
  components/marketing/home/showcase-mocks (the same brands sections 4 and 6
  use) as one small webp, so the moving gallery composites flat images.

  EACH CARD IS ITS PICTURE'S OWN SHAPE (main's round 60, kept in the wave 12
  merge): the wide pictures are 1440 x 900 (16:10) and the OnePages 540 x 960
  (9:16), and the cards are those shapes, so a picture fills its card with no
  bars, no blurred copy behind it and nothing cropped. The columns follow
  (16:10 and 9:16 at one height are 1.6 : 0.5625 wide, so 256fr 90fr 256fr).
*/
const wide = (brand: string, label: string, alt: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  alt,
  label,
  format: "wide",
  width: 1440,
  height: 900,
})
const portrait = (brand: string, label: string, alt: string) => ({
  src: `/home/showcase/a-${brand}.webp`,
  alt,
  label,
  format: "portrait",
  width: 540,
  height: 960,
})
const GROUPS = [
  [
    wide("hollow", "Sell merch your fans wear", "Hollow Pines, a band's merch store with hoodies, tees and caps"),
    portrait("maya", "A link in bio that sells", "Maya Okafor's OnePage with a marathon plan, run club and coaching links"),
    wide("darkroom", "Bring your community together", "The Darkroom Club, a film photography community feed with spaces and events"),
  ],
  [
    wide("gridline", "Sell templates and downloads", "Gridline Studio's storefront for Notion and Figma templates"),
    portrait("lio", "Share what you create", "Lio Tanaka's dark OnePage with photos, presets and print links"),
    wide("founders", "A members' club for founders", "Founders After Five, a community where a member shares a $10k MRR milestone"),
  ],
  [
    wide("bloom", "Teach what you know", "Brush & Bloom's watercolor course site with modules and reviews"),
    portrait("priya", "Give every link a home", "Sol & Sage's OnePage with a cookbook, recipes and a cooking class"),
    wide("kiln", "Gather people around a craft", "Kiln & Clay Collective, a pottery community sharing glaze recipes"),
  ],
]
export const SHOWCASE_EXAMPLES = GROUPS.flat()
export const SHOWCASE_HEADING =
  "Build your page, sell your products, reach your audience, and manage everything in one platform."

/** Each desktop page is a complete wide–OnePage–wide composition. */
export function BuildShowcase() {
  const track = useShowcaseMotion()
  return (
    <section
      className="build-showcase"
      aria-labelledby="build-showcase-title"
      data-build-showcase=""
      data-own-look=""
      data-showcase-pristine=""
      suppressHydrationWarning
    >
      <style>{CSS}</style>
      <p id="build-showcase-help" className="build-showcase-help">
        Drag or swipe to browse. Use arrow keys to move and Space to pause or
        resume automatic movement.
      </p>
      <div className="build-showcase-card">
        <div className="build-showcase-top">
          <StoryHeading
            id="build-showcase-title"
            text={SHOWCASE_HEADING}
            accent={["everything"]}
            dark
            showcase
          />
        </div>
        <div
          className="build-showcase-viewport"
          data-story-reveal=""
          data-story-visible="true"
        >
          <div
            ref={track}
            className="build-showcase-track"
            suppressHydrationWarning
            data-showcase-count={GROUPS.length}
            role="region"
            aria-roledescription="carousel"
            aria-label="What you can build with Storelib"
            tabIndex={0}
            aria-describedby="build-showcase-help"
          >
            {GROUPS.map((group, index) => (
              <div
                className="build-showcase-group"
                data-showcase-group=""
                key={index}
              >
                {group.map((example) => (
                  <figure
                    className="build-showcase-slide"
                    data-format={example.format}
                    data-showcase-slide=""
                    key={example.label}
                  >
                    <div className="build-showcase-media">
                      {/* Original optimized Storelib demo screenshots; no full-size third-party downloads. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={example.src!}
                        alt={example.alt}
                        width={example.width}
                        height={example.height}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                      />
                    </div>
                    <figcaption>{example.label}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

const CSS = `
/* The hairline is an inset shadow, not a border, so it takes no width: the cards line up with the bar above to the pixel. */
.build-showcase {position:relative;z-index:2;margin:-20px 0 40px;color:#fafafa;background:#090909;border-radius:40px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1),0 -8px 32px rgba(0,0,0,.08)}
.build-showcase-card {width:100%;max-width:var(--showcase-max,2020px);margin:0 auto;padding:clamp(72px,7vw,112px) 0 clamp(96px,9vw,156px)}
.build-showcase-top {margin:0 calc(var(--showcase-gutter,clamp(20px,5.15vw,84px)) + var(--landing-card-inset,14px)) clamp(38px,4.8vw,65px)}
.build-showcase h2 {max-width:none;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase .story-heading {--story-muted:#85858c;transition:opacity 400ms ease}.build-showcase[data-showcase-browsing] .story-heading {opacity:.64}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-viewport {position:relative;overflow:hidden;margin-inline:var(--showcase-gutter,clamp(20px,5.15vw,84px));mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.build-showcase-viewport::after {content:"";position:absolute;inset:0 auto 0 0;width:var(--showcase-gutter,clamp(20px,5.15vw,84px));background:#090909;pointer-events:none;opacity:0;transition:opacity 200ms ease}
@media(max-width:767px){.build-showcase[data-showcase-pristine] .build-showcase-viewport::after{opacity:1}}
/*
  THE RAIL. Before the script it is a plain horizontal scroller, so the cards
  can be reached without it; once lib/ui/rail-motion has it (data-rail-ready),
  nothing scrolls natively and each group or card is moved by a transform.
  touch-action leaves vertical swipes to the page; overscroll-behavior keeps
  a sideways trackpad swipe from turning into the browser's back gesture.
*/
.build-showcase-track {--showcase-gap:12px;position:relative;display:flex;gap:24px;overflow-x:auto;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;overscroll-behavior-x:contain;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.build-showcase-track[data-rail-ready] {overflow:visible;touch-action:pan-y pinch-zoom;overscroll-behavior-x:none}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:4px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
/* Round 61: the moving boxes keep their own GPU layers for as long as the rail runs; adding and dropping them at every autoplay step re-rasterised the pictures at the start of each move. */
.build-showcase-track[data-rail-ready] .build-showcase-group {will-change:transform;backface-visibility:hidden}
@media(max-width:767px){.build-showcase-track[data-rail-ready] .build-showcase-group{will-change:auto}.build-showcase-track[data-rail-ready] .build-showcase-slide{will-change:transform;backface-visibility:hidden}}
.build-showcase-group {display:grid;grid-template-columns:256fr 90fr 256fr;gap:var(--showcase-gap);align-items:center;flex:0 0 100%;width:100%;padding:10px var(--landing-card-inset,14px);min-width:0;box-sizing:border-box}
.build-showcase-slide {position:relative;min-width:0;width:100%;height:auto;aspect-ratio:16/10;margin:0;border:1px solid rgba(255,255,255,.12);border-radius:5px;contain:paint;isolation:isolate;background:#151515;overflow:hidden}
.build-showcase-slide[data-format="portrait"] {aspect-ratio:9/16}
.build-showcase-media {position:relative;height:100%}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:cover;pointer-events:none;-webkit-user-drag:none}
.build-showcase-slide figcaption {position:absolute;inset:auto 0 0;min-height:80px;display:flex;align-items:flex-end;padding:36px 16px 14px;font-size:14px;line-height:1.35;color:#fff;text-shadow:0 1px 4px #000;background:linear-gradient(transparent,rgba(0,0,0,.55) 50%,rgba(0,0,0,.88))}
/* Round 61: the pictures appear where they are, a fade and nothing else. Hidden only once the script is there to show them. */
.build-showcase-track[data-rail-ready] {opacity:0;transition:opacity 650ms cubic-bezier(.25,.1,.25,1)}
.build-showcase-viewport[data-showcase-entered] .build-showcase-track {opacity:1}
@media(max-width:767px){.build-showcase{margin-top:-12px;border-radius:28px}.build-showcase-card{padding:64px 0 108px}.build-showcase-top{margin-inline:var(--showcase-gutter,clamp(20px,5.15vw,84px))}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0;mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent)}.build-showcase-track{--showcase-gap:10px;--showcase-height:clamp(180px,58vw,360px);height:var(--showcase-height);gap:var(--showcase-gap);padding-left:var(--showcase-gutter,clamp(20px,5.15vw,84px))}.build-showcase-group{display:contents}.build-showcase-slide,.build-showcase-slide[data-format="portrait"]{height:var(--showcase-height);flex:0 0 auto;min-width:0;width:calc(var(--showcase-height)*1.6);aspect-ratio:auto}.build-showcase-slide[data-format="portrait"]{width:calc(var(--showcase-height)*.5625)}.build-showcase-slide figcaption{min-height:76px;padding:36px 16px 14px;font-size:14px}}
@media(prefers-reduced-motion:reduce){.build-showcase-track[data-rail-ready]{opacity:1;transition:none}.build-showcase .story-heading{opacity:1;transition:none}}
`
