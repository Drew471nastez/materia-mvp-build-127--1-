"use client"

import { useShowcaseMotion } from "./use-showcase-motion"
import { StoryHeading } from "./story-heading"
/*
  Nine fictional Storelib businesses, three of each kind: storefronts,
  OnePages and communities. Each picture is rendered from the live mockups in
  components/marketing/home/showcase-mocks (the same brands sections 4 and 6
  use), as one small webp, so the moving gallery composites flat images.
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
export const SHOWCASE_EXAMPLES = [
  wide("hollow", "Sell merch your fans wear", "Hollow Pines, a band's merch store with hoodies, tees and caps"),
  portrait("maya", "A link in bio that sells", "Maya Okafor's OnePage with a marathon plan, run club and coaching links"),
  wide("darkroom", "Bring your community together", "The Darkroom Club, a film photography community feed with spaces and events"),
  wide("gridline", "Sell templates and downloads", "Gridline Studio's storefront for Notion and Figma templates"),
  portrait("lio", "Share what you create", "Lio Tanaka's dark OnePage with photos, presets and print links"),
  wide("founders", "A members' club for founders", "Founders After Five, a community where a member shares a $10k MRR milestone"),
  wide("bloom", "Teach what you know", "Brush & Bloom's watercolor course site with modules and reviews"),
  portrait("priya", "Give every link a home", "Sol & Sage's OnePage with a cookbook, recipes and a cooking class"),
  wide("kiln", "Gather people around a craft", "Kiln & Clay Collective, a pottery community sharing glaze recipes"),
]
const EXAMPLES = SHOWCASE_EXAMPLES
export const SHOWCASE_HEADING = "Create your page. Grow your business."

/** Native scrolling for touch/trackpads; mouse dragging and quiet autoplay use
 * the same scroll position. Neighboring copies make wrapping in both directions visually continuous. */
export function BuildShowcase() {
  const track = useShowcaseMotion()
  return (
    <section
      className="build-showcase"
      aria-labelledby="build-showcase-title"
      data-build-showcase=""
      data-own-look=""
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
            accent={["grow"]}
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
            className="build-showcase-track keen-slider"
            data-keen-slider-disabled="true"
            suppressHydrationWarning
            data-showcase-count={EXAMPLES.length}
            role="region"
            aria-roledescription="carousel"
            aria-label="What you can build with Storelib"
            tabIndex={0}
            aria-describedby="build-showcase-help"
          >
            {EXAMPLES.map((example) => (
              <figure
                className="build-showcase-slide keen-slider__slide"
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
        </div>
      </div>
    </section>
  )
}

const CSS = `
.build-showcase {position:relative;z-index:2;margin:-48px 0 32px;color:#fafafa;background:#071011;border:1px solid rgba(255,255,255,.1);border-radius:48px;box-shadow:0 -12px 40px rgba(0,0,0,.08)}
.build-showcase-card {width:100%;max-width:1980px;margin:0 auto;padding:clamp(52px,6vw,88px) 0 clamp(44px,5vw,72px)}
.build-showcase-top {margin:0 clamp(22px,6vw,96px) clamp(32px,4vw,52px)}
.build-showcase h2 {max-width:900px;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-viewport {margin-inline:clamp(22px,6vw,96px)}
.build-showcase-track {--showcase-gap:21.6px;--showcase-height:clamp(240px,32vw,460px);position:relative;display:flex;gap:var(--showcase-gap);height:var(--showcase-height);overflow-x:auto;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;user-select:none;-webkit-user-select:none}
.build-showcase-track[data-keen-ready] {gap:0;overflow:hidden}
.build-showcase-track.keen-slider:not([data-keen-slider-disabled]) {touch-action:pan-y pinch-zoom}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:5px;border-radius:5px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
.build-showcase-slide {position:relative;flex:0 0 calc(var(--showcase-height)*1.6);width:calc(var(--showcase-height)*1.6);height:var(--showcase-height);margin:0;border:1px solid rgba(255,255,255,.12);border-radius:5px;background:#171b1e;overflow:hidden}
.build-showcase-slide[data-format="portrait"] {flex-basis:calc(var(--showcase-height)*.5625);width:calc(var(--showcase-height)*.5625);background:linear-gradient(160deg,#242031,#1b2023)}
.build-showcase-media {height:100%;display:flex;align-items:center;justify-content:center}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:contain;border-radius:5px;pointer-events:none}
.build-showcase-slide figcaption {position:absolute;inset:auto 0 0;min-height:80px;display:flex;align-items:flex-end;padding:36px 16px 14px;font-size:14px;line-height:1.35;color:#fff;text-shadow:0 1px 4px #000;background:linear-gradient(transparent,rgba(0,0,0,.55) 50%,rgba(0,0,0,.88))}
@media(min-width:1024px){.build-showcase-track{--showcase-height:clamp(210px,calc((100vw - 2*clamp(22px,6vw,96px) - 57.2px)/3.7625),460px)}}
@media(max-width:767px){.build-showcase{margin-top:-32px;border-radius:32px}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-track{--showcase-height:min(340px,calc((100vw - 2*clamp(22px,6vw,96px) - 22px)/1.6));--showcase-gap:14.4px}.build-showcase-slide figcaption{min-height:66px;padding:30px 10px 10px;font-size:12px}}
`
