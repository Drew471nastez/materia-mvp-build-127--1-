"use client"

import { useEffect, useRef, useState } from "react"
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
 * the same scroll position. A second copy makes the wrap visually continuous. */
export function BuildShowcase() {
  const outer = useRef<HTMLElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const interaction = useRef(0)
  const drag = useRef<{ x: number; left: number; id: number } | null>(null)
  const [paused, setPaused] = useState(false)
  const [mounted, setMounted] = useState(false)
  const step = () => {
    const el = track.current
    const first = el?.querySelector<HTMLElement>("[data-showcase-slide]")
    return first
      ? first.getBoundingClientRect().width +
          parseFloat(getComputedStyle(el!).columnGap)
      : 0
  }
  const move = (direction: number) => {
    const el = track.current,
      size = step()
    if (!el || !size) return
    const period = size * EXAMPLES.length
    let left = el.scrollLeft
    if (direction < 0 && left < size / 2) {
      el.scrollTo({ left: left + period, behavior: "auto" })
      left += period
    } else if (direction > 0 && left >= period - 0.5) {
      el.scrollTo({ left: left - period, behavior: "auto" })
      left -= period
    }
    el.scrollTo({
      left: (Math.round(left / size) + direction) * size,
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "auto"
        : "smooth",
    })
  }
  useEffect(() => {
    const section = outer.current,
      el = track.current
    if (!section || !el) return
    setMounted(true)
    const reduce = matchMedia("(prefers-reduced-motion:reduce)")
    let visible = false,
      hovered = false,
      frame = 0
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
    const enter = (event: PointerEvent) => {
        if (event.pointerType === "mouse") hovered = true
      },
      leave = () => {
        hovered = false
      }
    const observer =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              requestPaint()
            },
            { threshold: 0.12 },
          )
        : null
    observer?.observe(section)
    if (!observer) visible = true
    const timer = setInterval(() => {
      if (
        !visible ||
        paused ||
        hovered ||
        document.hidden ||
        section.matches(":focus-within") ||
        reduce.matches ||
        drag.current ||
        performance.now() < interaction.current
      )
        return
      const size = step(),
        period = size * EXAMPLES.length
      if (!size) return
      if (el.scrollLeft >= period - 0.5)
        el.scrollTo({ left: el.scrollLeft - period, behavior: "auto" })
      el.scrollTo({
        left: (Math.round(el.scrollLeft / size) + 1) * size,
        behavior: "smooth",
      })
    }, 4000)
    el.addEventListener("pointerenter", enter)
    el.addEventListener("pointerleave", leave)
    addEventListener("scroll", requestPaint, { passive: true })
    addEventListener("resize", requestPaint)
    reduce.addEventListener("change", requestPaint)
    paint()
    return () => {
      clearInterval(timer)
      cancelAnimationFrame(frame)
      observer?.disconnect()
      el.removeEventListener("pointerenter", enter)
      el.removeEventListener("pointerleave", leave)
      removeEventListener("scroll", requestPaint)
      removeEventListener("resize", requestPaint)
      reduce.removeEventListener("change", requestPaint)
    }
  }, [paused])
  const pauseInteraction = () => {
    interaction.current = performance.now() + 8000
  }
  return (
    <section
      ref={outer}
      className="build-showcase"
      aria-labelledby="build-showcase-title"
      data-build-showcase=""
      data-own-look=""
    >
      <style>{CSS}</style>
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
          <div
            className="build-showcase-controls"
            style={{ visibility: mounted ? "visible" : "hidden" }}
          >
            <button
              type="button"
              aria-label="Previous example"
              onClick={() => {
                pauseInteraction()
                move(-1)
              }}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M19 12H5m6-6-6 6 6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label="Next example"
              onClick={() => {
                pauseInteraction()
                move(1)
              }}
            >
              <svg
                aria-hidden="true"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path d="M5 12h14m-6-6 6 6-6 6" />
              </svg>
            </button>
            <button
              type="button"
              aria-label={paused ? "Play showcase" : "Pause showcase"}
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
            >
              <svg
                aria-hidden="true"
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="currentColor"
              >
                {paused ? (
                  <path d="m5 3 8 5-8 5Z" />
                ) : (
                  <>
                    <rect x="4" y="3" width="3" height="10" rx=".7" />
                    <rect x="10" y="3" width="3" height="10" rx=".7" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>
        <div
          ref={track}
          className="build-showcase-track"
          role="region"
          aria-roledescription="carousel"
          aria-label="What you can build with Storelib"
          tabIndex={0}
          onWheel={pauseInteraction}
          onTouchStart={pauseInteraction}
          onKeyDown={pauseInteraction}
          onPointerDown={(e) => {
            pauseInteraction()
            if (e.pointerType !== "mouse" || e.button !== 0) return
            drag.current = {
              x: e.clientX,
              left: e.currentTarget.scrollLeft,
              id: e.pointerId,
            }
            e.currentTarget.setPointerCapture(e.pointerId)
            e.currentTarget.dataset.dragging = "true"
          }}
          onPointerMove={(e) => {
            const d = drag.current
            if (d && d.id === e.pointerId) {
              e.currentTarget.scrollLeft = d.left - (e.clientX - d.x)
              e.preventDefault()
            }
          }}
          onPointerUp={(e) => {
            drag.current = null
            delete e.currentTarget.dataset.dragging
            if (e.currentTarget.hasPointerCapture(e.pointerId))
              e.currentTarget.releasePointerCapture(e.pointerId)
            pauseInteraction()
          }}
          onPointerCancel={(e) => {
            drag.current = null
            delete e.currentTarget.dataset.dragging
            pauseInteraction()
          }}
        >
          {[0, 1].flatMap((copy) =>
            EXAMPLES.map((example, i) => (
              <figure
                className="build-showcase-slide"
                data-showcase-slide=""
                key={`${copy}-${i}`}
                aria-hidden={copy === 1 || undefined}
              >
                {/* Original optimized Storelib demo screenshots; no full-size third-party downloads. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={example.src!}
                  alt={copy === 0 ? example.alt : ""}
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
.build-showcase { position:relative; z-index:2; margin-top:-38px; padding:0 18px; color:#f8f8f8; background:transparent; }
.build-showcase-card { max-width:1560px; margin:auto; overflow:hidden; border-radius:36px; background:#081211; padding:58px 0 34px; transition:transform 220ms ease-out; transform:translate3d(0,calc((1 - var(--showcase-enter,0))*24px),0); }
.build-showcase-top { padding:0 48px; display:flex; align-items:flex-end; justify-content:space-between; gap:32px; margin-bottom:34px; }
.build-showcase h2 { max-width:760px; margin:0; font-size:clamp(38px,4.6vw,68px); line-height:1.08; font-weight:500; letter-spacing:-.05em; }
.build-showcase-controls { display:flex; gap:8px; flex-shrink:0; }
.build-showcase-controls button { display:grid; place-items:center; width:40px; height:40px; border:1px solid rgba(255,255,255,.22); border-radius:50%; background:transparent; color:#fff; cursor:pointer; font-size:17px; }
.build-showcase-controls button:hover { background:rgba(255,255,255,.09); }
.build-showcase-controls button:focus-visible,.build-showcase-track:focus-visible { outline:2px solid #b599ff; outline-offset:4px; }
.build-showcase-track { display:flex; gap:20px; padding:0 48px 14px; overflow-x:auto; scrollbar-width:none; overscroll-behavior-x:contain; cursor:grab; touch-action:pan-x pan-y; scroll-snap-type:x proximity; }
.build-showcase-track::-webkit-scrollbar { display:none; }
.build-showcase-track[data-dragging] { cursor:grabbing; scroll-snap-type:none; user-select:none; }
.build-showcase-slide { position:relative; flex:0 0 min(56vw,680px); margin:0; overflow:hidden; border-radius:20px; background:#17191a; scroll-snap-align:start; }
.build-showcase-slide img { display:block; width:100%; height:auto; aspect-ratio:16/10; object-fit:cover; pointer-events:none; }
.build-showcase-slide figcaption { padding:16px 20px; font-size:14px; color:#fff; }
@media(max-width:767px){.build-showcase{padding:0 10px;margin-top:-30px}.build-showcase-card{border-radius:28px;padding:32px 0 18px}.build-showcase-top{padding:0 22px;gap:22px;margin-bottom:24px;align-items:start;flex-direction:column}.build-showcase h2{font-size:clamp(34px,8.5vw,48px);max-width:520px}.build-showcase-controls button{width:34px;height:34px}.build-showcase-track{padding-inline:22px;gap:14px}.build-showcase-slide{flex-basis:84vw;border-radius:16px}}
@media(prefers-reduced-motion:reduce){.build-showcase-card{transform:none;transition:none}.build-showcase h2 span{color:#f8f8f8!important}}
`
