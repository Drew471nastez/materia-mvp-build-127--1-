"use client"

import { useRef } from "react"
import { useShowcaseMotion } from "./use-showcase-motion"
import { StoryHeading } from "./story-heading"
import { HERO_SLIDES } from "@/lib/marketing/hero-media"

const EXAMPLES = [
  {
    ...HERO_SLIDES[0],
    label: "Your online store",
    format: "wide",
    width: 1200,
    height: 750,
  },
  {
    src: "/marketing/hero/tile-onepage-noor.webp",
    alt: "Noor's Storelib OnePage, with products and booking links",
    label: "OnePage, your way",
    format: "portrait",
    width: 360,
    height: 450,
  },
  {
    ...HERO_SLIDES[3],
    label: "Bring your community together",
    format: "wide",
    width: 1200,
    height: 750,
  },
  {
    src: "/marketing/hero/tile-onepage-theo.webp",
    alt: "Theo's Storelib OnePage, with presets and courses",
    label: "Share what you create",
    format: "portrait",
    width: 360,
    height: 450,
  },
  {
    ...HERO_SLIDES[7],
    label: "Build a website that feels like you",
    format: "wide",
    width: 1200,
    height: 750,
  },
  {
    src: "/marketing/hero/tile-onepage-ana.webp",
    alt: "Ana's Storelib OnePage, with pottery and community links",
    label: "Give every link a home",
    format: "portrait",
    width: 360,
    height: 450,
  },
]
export const SHOWCASE_HEADING =
  "Build your website, sell your products, and bring your community together in one connected place."

/** Native scrolling for touch/trackpads; mouse dragging and quiet autoplay use
 * the same scroll position. Neighboring copies make wrapping in both directions visually continuous. */
export function BuildShowcase() {
  const track = useRef<HTMLDivElement>(null)
  useShowcaseMotion(track, EXAMPLES.length)
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
          <p className="story-eyebrow">Built around your business</p>
          <StoryHeading
            id="build-showcase-title"
            text={SHOWCASE_HEADING}
            accent={["website", "products", "community"]}
            showcase
          />
        </div>
        <div
          ref={track}
          className="build-showcase-track"
          data-showcase-count={EXAMPLES.length}
          role="region"
          aria-roledescription="carousel"
          aria-label="What you can build with Storelib"
          tabIndex={0}
          aria-describedby="build-showcase-help"
        >
          {[0, 1, 2].flatMap((copy) =>
            EXAMPLES.map((example, i) => (
              <figure
                className="build-showcase-slide"
                data-format={example.format}
                data-showcase-slide=""
                key={`${copy}-${i}`}
                aria-hidden={copy !== 1 || undefined}
              >
                <div className="build-showcase-media">
                  {/* Original optimized Storelib demo screenshots; no full-size third-party downloads. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={example.src!}
                    alt={copy === 1 ? example.alt : ""}
                    width={example.width}
                    height={example.height}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                  />
                </div>
                <figcaption>{example.label}</figcaption>
              </figure>
            )),
          )}
        </div>
      </div>
    </section>
  )
}

const CSS = `
.build-showcase {container-type:inline-size;position:relative;z-index:2;margin:0;padding:0;color:#18181b;background:#fff}
.build-showcase-card {width:100%;margin:0;background:#fff;padding:clamp(52px,7vw,104px) 0 clamp(52px,6vw,88px)}
.build-showcase-top {margin:0 clamp(22px,6vw,96px) clamp(32px,4vw,56px)}
.build-showcase h2 {max-width:1150px;margin:0;font-size:clamp(38px,5.4vw,82px)}
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-track {--showcase-height:clamp(240px,32vw,460px);position:relative;margin-inline:clamp(22px,6vw,96px);display:flex;gap:24px;padding:0 0 8px;overflow-x:auto;scrollbar-width:none;overscroll-behavior-x:contain;cursor:grab;touch-action:pan-x pan-y;user-select:none;-webkit-user-select:none;-webkit-overflow-scrolling:touch}
.build-showcase-track:focus-visible {outline:2px solid #7c3aed;outline-offset:5px;border-radius:24px}
.build-showcase-track::-webkit-scrollbar {display:none}
.build-showcase-track[data-dragging] {cursor:grabbing}
.build-showcase-slide {position:relative;flex:0 0 calc(var(--showcase-height)*1.6);margin:0;border:1px solid #e9e7ee;border-radius:24px;background:#f4f1f7;overflow:hidden}
.build-showcase-slide[data-format="portrait"] {flex-basis:calc(var(--showcase-height)*.5625);background:linear-gradient(160deg,#f4ecff,#f8f6ef)}
.build-showcase-media {height:var(--showcase-height);display:flex;align-items:center;justify-content:center}
.build-showcase-slide img {display:block;width:100%;height:100%;object-fit:contain;pointer-events:none}
.build-showcase-slide figcaption {min-height:62px;display:flex;align-items:center;padding:16px 20px;font-size:14px;line-height:1.4;color:#343039;background:#faf9fc;border-top:1px solid #e9e7ee}
@media(min-width:1024px){.build-showcase-track{--showcase-height:clamp(210px,calc((100cqw - 2*clamp(22px,6vw,96px) - 54px)/3.7625),460px)}}
@media(max-width:767px){.build-showcase h2{font-size:clamp(38px,9.5vw,50px)}.build-showcase-track{--showcase-height:min(340px,calc((100cqw - 2*clamp(22px,6vw,96px) - 22px)/1.6));gap:16px}.build-showcase-slide{border-radius:18px}.build-showcase-slide figcaption{min-height:76px;padding:12px;font-size:12px}}
`
