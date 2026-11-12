"use client"

import { useShowcaseMotion } from "./use-showcase-motion"
import { StoryHeading } from "./story-heading"
/*
  Nine fictional Storelib businesses, as three wide–OnePage–wide pages:
  storefronts, OnePages and communities, each with its own name, palette and
  type. Every picture is rendered from the live mockups in
  components/marketing/home/showcase-mocks (the same brands sections 4 and 6
  use) as one small webp, so the moving gallery composites flat images.
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
export const SHOWCASE_HEADING = "Build a world worth clicking into."

/** Each desktop page is a complete wide–OnePage–wide composition. */
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
            accent={["world"]}
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
            data-showcase-count={GROUPS.length}
            role="region"
            aria-roledescription="carousel"
            aria-label="What you can build with Storelib"
            tabIndex={0}
            aria-describedby="build-showcase-help"
          >
            {GROUPS.map((group, index) => (
              <div
                className="build-showcase-group keen-slider__slide"
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
.build-showcase {position:relative;z-index:2;margin:-20px 0 40px;color:#fafafa;background:#071011;border:1px solid rgba(255,255,255,.1);border-radius:40px;box-shadow:0 -8px 32px rgba(0,0,0,.08)}
.build-showcase-card {width:100%;max-width:1980px;margin:0 auto;padding:clamp(72px,7vw,112px) 0 clamp(96px,9vw,156px)}
.build-showcase-top {margin:0 clamp(22px,6vw,96px) clamp(40px,5vw,68px)}
.build-showcase h2 {max-width:760px;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-viewport {margin-inline:clamp(22px,6vw,96px);mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.build-showcase-track {--showcase-gap:16px;--showcase-height:clamp(210px,calc((min(100vw,1980px) - 2*clamp(22px,6vw,96px) - 72px)/3.83),460px);position:relative;display:flex;gap:24px;height:calc(var(--showcase-height)*1.12 + 20px);overflow-x:auto;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;user-select:none;-webkit-user-select:none}
.build-showcase-track[data-keen-ready] {gap:0;overflow:hidden}
.build-showcase-track.keen-slider:not([data-keen-slider-disabled]) {touch-action:pan-y pinch-zoom}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:4px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
.build-showcase-group {display:grid;grid-template-columns:1.6fr .63fr 1.6fr;gap:var(--showcase-gap);align-items:center;flex:0 0 100%;width:100%;padding:10px 14px;min-width:0}
.build-showcase-slide {position:relative;min-width:0;width:100%;height:var(--showcase-height);margin:0;border:1px solid rgba(255,255,255,.12);border-radius:5px;background:radial-gradient(ellipse at center,#252332,#11181c);overflow:hidden}
.build-showcase-slide[data-format="portrait"] {height:calc(var(--showcase-height)*1.12);background:linear-gradient(160deg,#242031,#1b2023)}
.build-showcase-media {height:100%;display:flex;align-items:center;justify-content:center}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:contain;border-radius:5px;pointer-events:none}
.build-showcase-slide figcaption {position:absolute;inset:auto 0 0;min-height:80px;display:flex;align-items:flex-end;padding:36px 16px 14px;font-size:14px;line-height:1.35;color:#fff;text-shadow:0 1px 4px #000;background:linear-gradient(transparent,rgba(0,0,0,.55) 50%,rgba(0,0,0,.88))}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide {animation:showcase-card-enter 850ms cubic-bezier(.2,.7,.2,1) both}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide:nth-child(2) {animation-delay:90ms}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide:nth-child(3) {animation-delay:180ms}
.build-showcase[data-showcase-entered] .build-showcase-top {animation:showcase-heading-enter 700ms cubic-bezier(.2,.7,.2,1) both}
@keyframes showcase-heading-enter{from{opacity:.6;translate:0 16px}to{opacity:1;translate:0 0}}
@keyframes showcase-card-enter{from{opacity:.45;translate:0 28px;scale:.98}to{opacity:1;translate:0 0;scale:1}}
@media(max-width:767px){.build-showcase{margin-top:-12px;border-radius:28px}.build-showcase-card{padding:64px 0 108px}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0;mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent)}.build-showcase-track{--showcase-gap:12px;--showcase-height:clamp(280px,82vw,420px);height:var(--showcase-height);gap:12px}.build-showcase-group{display:contents}.build-showcase-slide,.build-showcase-slide[data-format="portrait"]{height:var(--showcase-height);flex:0 0 100%;min-width:100%;width:100%}.build-showcase-slide figcaption{min-height:76px;padding:36px 16px 14px;font-size:14px}}
@media(prefers-reduced-motion:reduce){.build-showcase-viewport[data-showcase-entered] .build-showcase-slide{animation:none}.build-showcase[data-showcase-entered] .build-showcase-top{animation:none}}
`
