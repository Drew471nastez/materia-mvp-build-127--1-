"use client"

import { useShowcaseMotion } from "./use-showcase-motion"
import { StoryHeading } from "./story-heading"
import { HERO_SLIDES } from "@/lib/marketing/hero-media"

const portrait = (name: string, label: string) => ({
  src: `/marketing/hero/tile-onepage-${name}.webp`,
  alt: `${label}, a Storelib OnePage with products and links`,
  label: "OnePage",
  format: "portrait",
  width: 360,
  height: 450,
})
const wide = (index: number, label: string) => ({
  ...HERO_SLIDES[index],
  label,
  format: "wide",
  width: 1200,
  height: 750,
})
const GROUPS = [
  [
    wide(0, "Your online store"),
    portrait("noor", "OnePage, your way"),
    wide(7, "Your website builder"),
  ],
  [
    wide(3, "Your community"),
    portrait("theo", "Share what you create"),
    wide(5, "Your creator page"),
  ],
  [
    wide(2, "Your storefront"),
    portrait("ana", "Give every link a home"),
    wide(6, "Your digital products"),
  ],
]
export const SHOWCASE_HEADING =
  "Everything you need to create, sell, and manage your business online."

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
            accent={["create"]}
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
                      {/* Reuses the same cached source. Only the decorative fill is enlarged;
                          the foreground keeps the complete, uncropped interface. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="build-showcase-fill"
                        src={example.src!}
                        alt=""
                        aria-hidden="true"
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
.build-showcase {position:relative;z-index:2;margin:-20px 0 40px;color:#fafafa;background:#090909;border:1px solid rgba(255,255,255,.1);border-radius:40px;box-shadow:0 -8px 32px rgba(0,0,0,.08)}
.build-showcase-card {width:100%;max-width:1980px;margin:0 auto;padding:clamp(72px,7vw,112px) 0 clamp(96px,9vw,156px)}
.build-showcase-top {margin:0 clamp(22px,6vw,96px) clamp(40px,5vw,68px)}
.build-showcase h2 {max-width:1100px;margin:0;font-size:clamp(32px,3.4vw,58px);text-wrap:balance;line-height:1.13}
.build-showcase .story-heading {--story-muted:#85858c;transition:opacity 400ms ease}.build-showcase[data-showcase-browsing] .story-heading {opacity:.64}
.showcase-heading-break {display:none}
@media(min-width:768px){.showcase-heading-break{display:initial}}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-viewport {position:relative;opacity:calc(.4 + var(--showcase-reveal,1)*.6);translate:0 calc((1 - var(--showcase-reveal,1))*32px);transition:opacity 120ms linear,translate 120ms linear;margin-inline:clamp(22px,6vw,96px);mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 14px,#000 calc(100% - 14px),transparent)}
.build-showcase-viewport::after {content:"";position:absolute;inset:0 auto 0 0;width:clamp(22px,6vw,96px);background:#090909;pointer-events:none;opacity:0;transition:opacity 200ms ease}
@media(max-width:767px){.build-showcase[data-showcase-pristine] .build-showcase-viewport::after{opacity:1}.build-showcase-track[data-keen-slider-disabled]{padding-left:clamp(22px,6vw,96px)}}
.build-showcase-track {--showcase-gap:16px;--showcase-height:calc((min(100vw,1980px) - 2*clamp(22px,6vw,96px) - 62px)/3.2291666667);position:relative;display:flex;gap:24px;height:calc(var(--showcase-height) + 20px);overflow-x:auto;scrollbar-width:none;cursor:grab;touch-action:pan-x pan-y pinch-zoom;user-select:none;-webkit-user-select:none}
.build-showcase-track[data-keen-ready] {gap:0;overflow:hidden}
.build-showcase-track.keen-slider:not([data-keen-slider-disabled]) {touch-action:pan-y pinch-zoom}
.build-showcase-track:focus-visible {outline:2px solid #bca3ff;outline-offset:4px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
.build-showcase[data-showcase-browsing] .build-showcase-group {will-change:transform}
@media(max-width:767px){.build-showcase[data-showcase-browsing] .build-showcase-slide{will-change:transform}}
.build-showcase-group {display:grid;grid-template-columns:64fr 27fr 64fr;gap:var(--showcase-gap);align-items:center;flex:0 0 100%;width:100%;padding:10px 14px;min-width:0}
.build-showcase-slide {position:relative;min-width:0;width:100%;height:auto;aspect-ratio:4/3;margin:0;border:1px solid rgba(255,255,255,.12);border-radius:5px;contain:paint;isolation:isolate;background:radial-gradient(ellipse at center,#252525,#121212);overflow:hidden}
.build-showcase-slide[data-format="portrait"] {height:auto;aspect-ratio:9/16;background:#171717}
.build-showcase-media {position:relative;height:100%;display:flex;align-items:center;justify-content:center;isolation:isolate}

.build-showcase-media img {position:relative;z-index:1}
.build-showcase-slide img.build-showcase-fill {position:absolute;inset:-16px;width:calc(100% + 32px);height:calc(100% + 32px);max-width:none;object-fit:cover;filter:blur(12px);border-radius:0;z-index:0}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:contain;border-radius:5px;pointer-events:none}
.build-showcase-slide figcaption {position:absolute;inset:auto 0 0;min-height:80px;display:flex;align-items:flex-end;padding:36px 16px 14px;font-size:14px;line-height:1.35;color:#fff;text-shadow:0 1px 4px #000;background:linear-gradient(transparent,rgba(0,0,0,.55) 50%,rgba(0,0,0,.88))}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide {animation:showcase-card-enter 850ms cubic-bezier(.2,.7,.2,1) both}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide:nth-child(2) {animation-delay:90ms}
.build-showcase-viewport[data-showcase-entered] .build-showcase-slide:nth-child(3) {animation-delay:180ms}
.build-showcase[data-showcase-entered] .build-showcase-top {animation:showcase-heading-enter 700ms cubic-bezier(.2,.7,.2,1) both}
@keyframes showcase-heading-enter{from{opacity:.6;translate:0 16px}to{opacity:1;translate:0 0}}
@keyframes showcase-card-enter{from{opacity:.45;translate:0 28px;scale:.98}to{opacity:1;translate:0 0;scale:1}}
@media(max-width:767px){.build-showcase{margin-top:-12px;border-radius:28px}.build-showcase-card{padding:64px 0 108px}.build-showcase h2{font-size:clamp(30px,8vw,36px)}.build-showcase-viewport{margin-inline:0;mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 12px),transparent)}.build-showcase-track{--showcase-gap:12px;--showcase-height:clamp(180px,58vw,360px);height:var(--showcase-height);gap:12px}.build-showcase-group{display:contents}.build-showcase-slide,.build-showcase-slide[data-format="portrait"]{height:var(--showcase-height);flex:0 0 auto;min-width:0;width:calc(var(--showcase-height)*4/3)}.build-showcase-slide[data-format="portrait"]{width:calc(var(--showcase-height)*9/16)}.build-showcase-slide figcaption{min-height:76px;padding:36px 16px 14px;font-size:14px}}
@media(prefers-reduced-motion:reduce){.build-showcase-viewport[data-showcase-entered] .build-showcase-slide{animation:none}.build-showcase[data-showcase-entered] .build-showcase-top{animation:none}.build-showcase-viewport{opacity:1;translate:none;transition:none}.build-showcase .story-heading{opacity:1;transition:none}}
`
