"use client"

import { useEffect, useRef } from "react"
import { useShowcaseMotion } from "./use-showcase-motion"
import { HERO_SLIDES } from "@/lib/marketing/hero-media"

const EXAMPLES = [
  HERO_SLIDES[0],
  HERO_SLIDES[4],
  HERO_SLIDES[3],
  HERO_SLIDES[7],
  HERO_SLIDES[5],
]
const LABELS = [
  "Websites",
  "OnePages",
  "Communities",
  "Website builder",
  "Creator pages",
]
const WORDS = ["Build", "anything.", "Make", "it", "yours."]

/** Native scrolling for touch/trackpads; mouse dragging and quiet autoplay use
 * the same scroll position. Neighboring copies make wrapping in both directions visually continuous. */
export function BuildShowcase() {
  const outer = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  useShowcaseMotion(track, EXAMPLES.length)
  useEffect(() => {
    const section = outer.current,
      el = track.current
    if (!section || !el) return
    const reduce = matchMedia("(prefers-reduced-motion:reduce)")
    let frame = 0
    const paint = () => {
      frame = 0
      const rect = section.getBoundingClientRect()
      const progress = reduce.matches
        ? 1
        : Math.max(
            0,
            Math.min(1, (innerHeight - rect.top) / (innerHeight * 0.85)),
          )
      section.style.setProperty(
        "--showcase-enter",
        String(Math.min(1, progress * 2.5)),
      )
      section
        .querySelectorAll<HTMLElement>("[data-showcase-word]")
        .forEach((word, i) => {
          const fill = reduce.matches
            ? 1
            : Math.max(0, Math.min(1, progress * WORDS.length - i))
          const tone = Math.round(110 + fill * 138)
          word.style.color = `rgb(${tone},${tone},${tone})`
        })
    }
    const requestPaint = () => {
      if (!frame) frame = requestAnimationFrame(paint)
    }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              requestPaint()
            },
            { threshold: 0.12 },
          )
        : null
    observer?.observe(section)
    addEventListener("scroll", requestPaint, { passive: true })
    addEventListener("resize", requestPaint)
    reduce.addEventListener("change", requestPaint)
    paint()
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      removeEventListener("scroll", requestPaint)
      removeEventListener("resize", requestPaint)
      reduce.removeEventListener("change", requestPaint)
    }
  }, [])
  return (
    <section
      ref={outer}
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
          <h2 id="build-showcase-title">
            {WORDS.map((word, i) => (
              <span
                key={word}
                data-showcase-word=""
                style={{ color: i === 0 ? "#f8f8f8" : "#6e6e6e" }}
              >
                {word}
                {i < WORDS.length - 1 ? " " : ""}
              </span>
            ))}
          </h2>
        </div>
        <div
          ref={track}
          className="build-showcase-track"
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
                data-showcase-slide=""
                key={`${copy}-${i}`}
                aria-hidden={copy !== 1 || undefined}
              >
                {/* Original optimized Storelib demo screenshots; no full-size third-party downloads. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={example.src!}
                  alt={copy === 1 ? example.alt : ""}
                  width={1200}
                  height={750}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
                <figcaption>{LABELS[i]}</figcaption>
              </figure>
            )),
          )}
        </div>
      </div>
    </section>
  )
}

const CSS = `
.build-showcase { position:relative; z-index:2; margin-top:-24px; padding:0; color:#f8f8f8; background:transparent; }
.build-showcase-card { width:100%; margin:0; overflow:hidden; border-radius:40px 40px 0 0; background:#040505; padding:58px 0 34px; transition:transform 220ms ease-out; transform:translate3d(0,calc((1 - var(--showcase-enter,0))*24px),0); }
.build-showcase-top { padding:0 clamp(24px,6vw,96px); display:flex; align-items:flex-end; justify-content:space-between; gap:32px; margin-bottom:34px; }
.build-showcase h2 { max-width:760px; margin:0; font-size:clamp(36px,4.3vw,64px); line-height:1.08; font-weight:500; letter-spacing:-.05em; }
.build-showcase-help {position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.build-showcase-track:focus-visible {outline:none;box-shadow:inset 0 0 0 1px rgba(185,160,255,.4)}
.build-showcase-track { display:flex; gap:20px; padding:0 0 14px; overflow-x:auto; scrollbar-width:none; overscroll-behavior-x:contain; cursor:grab; touch-action:pan-x pan-y; user-select:none;-webkit-user-select:none;-webkit-overflow-scrolling:touch; }
.build-showcase-track::-webkit-scrollbar { display:none; }
.build-showcase-track[data-dragging] { cursor:grabbing; user-select:none; }
.build-showcase-slide { position:relative; flex:0 0 min(56vw,680px); margin:0; overflow:hidden; border-radius:20px; background:#17191a; }
.build-showcase-slide img { display:block; width:100%; height:auto; aspect-ratio:16/10; object-fit:cover; pointer-events:none; }
.build-showcase-slide figcaption { padding:16px 20px; font-size:14px; color:#fff; }
@media(max-width:767px){.build-showcase{padding:0;margin-top:-18px}.build-showcase-card{border-radius:28px 28px 0 0;padding:32px 0 18px}.build-showcase-top{padding:0 22px;gap:22px;margin-bottom:24px;align-items:start;flex-direction:column}.build-showcase h2{font-size:clamp(32px,8vw,45px);max-width:520px}.build-showcase-track{padding-inline:0;gap:14px}.build-showcase-slide{flex-basis:84vw;border-radius:16px}}
@media(min-width:1024px){.build-showcase h2{font-size:clamp(34px,4.15vw,61px)}.build-showcase-slide figcaption{font-size:13.3px}}
@media(prefers-reduced-motion:reduce){.build-showcase-card{transform:none;transition:none}.build-showcase h2 span{color:#f8f8f8!important}}
`
