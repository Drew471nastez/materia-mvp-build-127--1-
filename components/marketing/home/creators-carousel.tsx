"use client"

import { useEffect, useRef, useState, type CSSProperties } from "react"
import { StoryHeading } from "../story-heading"
import type { SectionStyle } from "./lazy-section"
import { MORPH_PILL_CSS, MorphPillCluster } from "./motion/morph-pill-cluster"
import { ORBIT_BADGE_CSS, OrbitBadge } from "./motion/orbit-badge"
import { SALE_POP_CSS, SalePop, type SalePopItem } from "./motion/sale-pop"
import { MOTION_STYLE_PRECEDENCE } from "./motion/use-motion-gate"

type Shape = "arch" | "tear" | "tilt"
export type CreatorCard = {
  slug: string
  kind: string
  sells: string
  name: string
  alt: string
  sale: string
  shape: Shape
  overlay?: "eq" | "live" | "rec"
}

/** Photos: Unsplash (free licence), cropped 4:5 and stored as 400w/720w WebP
 * under public/home/creators. Every name is fictional. */
export const CREATORS: readonly CreatorCard[] = [
  { slug: "youtubers", kind: "YouTubers", sells: "Presets, merch & memberships", name: "Lena Marsh", alt: "Lena, a YouTuber, laughing in a red sweater", sale: "+$18.00", shape: "arch" },
  { slug: "musicians", kind: "Musicians", sells: "Beats & sample packs", name: "Jalen Brooks", alt: "Jalen performing on stage through a cloud of light and smoke", sale: "+$29.00", shape: "tear", overlay: "eq" },
  { slug: "authors", kind: "Authors", sells: "E-books & signed copies", name: "Clara Whitfield", alt: "An open paperback beside reading glasses and a latte", sale: "+$14.99", shape: "tilt" },
  { slug: "educators", kind: "Educators", sells: "Online courses", name: "Rosa Delgado", alt: "Rosa, an educator, smiling in a striped cardigan", sale: "+$149.00", shape: "arch" },
  { slug: "influencers", kind: "Influencers", sells: "Merch drops", name: "Amara Osei", alt: "Amara, an influencer, in a bold patterned top", sale: "+$42.00", shape: "tilt" },
  { slug: "podcasters", kind: "Podcasters", sells: "Bonus episodes & memberships", name: "The Late Signal", alt: "A studio microphone on a boom arm against a dark wall", sale: "+$6.00/mo", shape: "tear", overlay: "rec" },
  { slug: "artists", kind: "Artists", sells: "Prints & original pieces", name: "Iris Calder", alt: "Paint brushes dragging bright orange paint across a canvas", sale: "+$85.00", shape: "arch" },
  { slug: "streamers", kind: "Streamers", sells: "Sub perks & emote packs", name: "Kai Navarro", alt: "Kai streaming at a glowing desk setup with a headset on", sale: "+$4.99", shape: "tear", overlay: "live" },
  { slug: "coaches", kind: "Coaches", sells: "1:1 calls & programs", name: "Dev Mehta", alt: "Dev, a coach, smiling in a white tee against a concrete wall", sale: "+$120.00", shape: "tilt" },
  { slug: "agencies", kind: "Agencies", sells: "Storefronts for every client", name: "Northfield Studio", alt: "Two agency partners high-fiving across a desk", sale: "+$640.00", shape: "arch" },
  { slug: "photographers", kind: "Photographers", sells: "Photo presets & prints", name: "Jonah Price", alt: "Jonah tossing a camera toward the lens in an autumn forest", sale: "+$24.00", shape: "tilt" },
  { slug: "fitness", kind: "Fitness", sells: "Training plans & challenges", name: "Sasha Ivanova", alt: "Sasha holding a plank on a pink mat in a sunlit studio", sale: "+$39.00", shape: "arch" },
]

export const CREATORS_HEADING = "Storelib is for creators. Whatever you make."
export const CREATORS_SELL_LABELS = [
  "merch drops",
  "online courses",
  "sample packs",
  "memberships",
  "1:1 coaching",
  "photo presets",
  "e-books",
] as const
const TILE_LABELS = ["Chefs", "Game devs", "Designers", "Tutors", "Dancers", "Makers"] as const
const SALES: readonly SalePopItem[] = [
  { who: "Maya R.", what: "Drum Kit Vol. 2 from Jalen", amount: "$29.00" },
  { who: "Tom K.", what: "a 6-week course from Rosa", amount: "$149.00" },
  { who: "Priya S.", what: "the Autumn hoodie from Amara", amount: "$58.00" },
  { who: "Leo M.", what: "a coaching call with Dev", amount: "$120.00" },
  { who: "Hana W.", what: "Film Tones presets from Jonah", amount: "$24.00" },
]

const SIZES = "(max-width: 640px) 66vw, (max-width: 1280px) 24vw, 300px"

function Card({ c, idx, copy }: { c: CreatorCard; idx: number; copy: boolean }) {
  return (
    <li className="cc-card" data-idx={idx} data-shape={c.shape} aria-hidden={copy || undefined} inert={copy || undefined}>
      <div className="cc-body">
        <div className="cc-shape">
          <img
            className="cc-img"
            src={`/home/creators/${c.slug}-400.webp`}
            srcSet={`/home/creators/${c.slug}-400.webp 400w, /home/creators/${c.slug}-720.webp 720w`}
            sizes={SIZES}
            width={400}
            height={500}
            alt={copy ? "" : c.alt}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
          <span className="cc-shade" aria-hidden="true" />
          {c.overlay === "eq" ? (
            <span className="cc-eq" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((b) => (
                <span key={b} data-story-continuous="" style={{ "--b": b } as CSSProperties} />
              ))}
            </span>
          ) : c.overlay ? (
            <span className="cc-badge">
              <OrbitBadge tone="glass" color="red">
                {c.overlay === "live" ? "Live now" : "Ep. 112 out"}
              </OrbitBadge>
            </span>
          ) : null}
          <span className="cc-meta">
            <span className="cc-who">{c.name}</span>
            <span className="cc-kind">{c.kind}</span>
            <span className="cc-sells">{c.sells}</span>
          </span>
        </div>
        <span className="cc-sale" aria-hidden="true">
          <span className="cc-sale-dot" />
          <b>{c.sale}</b> new order
        </span>
      </div>
    </li>
  )
}

function YouTile({ idx, copy }: { idx: number; copy: boolean }) {
  return (
    <li className="cc-card cc-you" data-idx={idx} data-shape="tilt" aria-hidden={copy || undefined} inert={copy || undefined}>
      <div className="cc-body">
        <div className="cc-shape cc-tile">
          <span className="cc-orb cc-orb-a" data-story-continuous="" aria-hidden="true" />
          <span className="cc-orb cc-orb-b" data-story-continuous="" aria-hidden="true" />
          <span className="cc-tile-top">
            <OrbitBadge tone="glass">Your shop, next</OrbitBadge>
          </span>
          <span className="cc-tile-mid">
            <span className="cc-tile-kicker">Also built for</span>
            <MorphPillCluster labels={TILE_LABELS} tone="dark" size="md" interval={1900} />
          </span>
          <a className="cc-tile-cta" href="/signup" tabIndex={copy ? -1 : undefined}>
            Open your shop
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M3 8h9m-4-4 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>
      </div>
    </li>
  )
}

/**
 * Section 7: who Storelib is for. An endless, transform-only rail of creator
 * cards that drifts left, eases to a stop under the pointer, can be dragged or
 * swiped, and nudged with the arrows. Hovering (or, on touch, the centre or
 * tapped card) turns a card into a bubble: its corners spring into a dome or a
 * leaf while it lifts. Reduced motion shows the same cards as a still grid.
 */
export function CreatorsCarousel({ tone = "light" }: { tone?: "light" | "dark" }) {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)
  const pausedRef = useRef(false)
  const nudgeRef = useRef<(dir: number) => void>(() => {})
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    pausedRef.current = paused
    nudgeRef.current(0)
  }, [paused])

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!section || !viewport || !track) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    const touch = matchMedia("(hover: none), (pointer: coarse)")
    const count = CREATORS.length + 1
    let cards: HTMLElement[] = []
    let loop = 0
    let step = 1
    let cardW = 0
    let lead = 0
    let viewW = 0
    let x = 0
    let v = 0
    let glide = 0
    let last = 0
    let raf = 0
    let visible = typeof IntersectionObserver !== "function"
    let hovering = false
    let active = -1
    let pinned: { idx: number; until: number } | null = null
    let drag: { id: number; lastX: number; lastT: number; moved: number; vel: number; captured: boolean } | null = null
    let suppressClick = false

    const measure = () => {
      cards = Array.from(track.querySelectorAll<HTMLElement>("[data-idx]"))
      const first = cards[0]
      const second = cards[1]
      const copy = cards[count]
      if (!first || !second || !copy) return
      lead = first.offsetLeft
      step = second.offsetLeft - first.offsetLeft || 1
      loop = copy.offsetLeft - first.offsetLeft
      cardW = first.offsetWidth
      viewW = viewport.clientWidth
    }
    const live = () => visible && !document.hidden && !reduce.matches
    const cruise = () => (touch.matches ? 30 : 38)

    const setActive = (idx: number) => {
      if (idx === active) return
      active = idx
      for (const card of cards) card.toggleAttribute("data-active", Number(card.dataset.idx) === idx)
    }
    const paint = (now: number) => {
      if (loop > 0) x = ((x % loop) + loop) % loop
      track.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0)`
      if (!touch.matches) return setActive(-1)
      if (pinned && now > pinned.until) pinned = null
      const centre = Math.round((x + viewW / 2 - lead - cardW / 2) / step)
      setActive(pinned ? pinned.idx : ((centre % count) + count) % count)
    }
    const frame = (t: number) => {
      raf = 0
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
      last = t
      const goal = hovering || pausedRef.current || drag ? 0 : cruise()
      if (!drag) {
        // Critically damped approach: buttery slow-down and pick-up.
        v += (goal - v) * (1 - Math.exp(-dt * (Math.abs(v) > Math.abs(goal) ? 2.6 : 1.8)))
        let move = v * dt
        if (glide) {
          // Arrow nudges ease out over a card width on top of the drift.
          let part = glide * (1 - Math.exp(-dt * 7))
          if (Math.abs(glide - part) < 0.4) part = glide
          glide -= part
          move += part
        }
        x += move
      }
      paint(t)
      if (live() && (drag || glide || goal || Math.abs(v) > 0.4)) schedule()
      else last = 0
    }
    const schedule = () => {
      if (!raf && live()) raf = requestAnimationFrame(frame)
    }

    nudgeRef.current = (dir) => {
      if (dir) glide += dir * step
      schedule()
    }

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = true
        schedule()
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = false
        schedule()
      }
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || reduce.matches) return
      drag = { id: e.pointerId, lastX: e.clientX, lastT: e.timeStamp, moved: 0, vel: 0, captured: false }
      suppressClick = false
    }
    const onMove = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.lastX
      const dts = Math.max(1, e.timeStamp - drag.lastT) / 1000
      drag.moved += Math.abs(dx)
      drag.lastX = e.clientX
      drag.lastT = e.timeStamp
      if (!drag.captured && drag.moved > 6) {
        drag.captured = true
        viewport.setPointerCapture(e.pointerId)
        viewport.dataset.dragging = ""
        pinned = null
      }
      if (!drag.captured) return
      x -= dx
      drag.vel = drag.vel * 0.6 + (-dx / dts) * 0.4
      v = 0
      schedule()
    }
    const onUp = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      if (drag.captured) {
        suppressClick = true
        v = Math.max(-2600, Math.min(2600, drag.vel))
        delete viewport.dataset.dragging
      } else if (touch.matches && e.type === "pointerup") {
        const card = (e.target as Element).closest<HTMLElement>("[data-idx]")
        if (card) pinned = { idx: Number(card.dataset.idx), until: performance.now() + 2800 }
      }
      drag = null
      schedule()
      if (!raf) paint(performance.now())
    }
    const onClick = (e: MouseEvent) => {
      if (suppressClick) {
        e.preventDefault()
        e.stopPropagation()
        suppressClick = false
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault()
        nudgeRef.current(e.key === "ArrowRight" ? 1 : -1)
      }
    }
    const sync = () => {
      measure()
      paint(performance.now())
      schedule()
    }

    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              schedule()
            },
            { rootMargin: "80px 0px" },
          )
        : null
    io?.observe(section)
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(sync) : null
    ro?.observe(viewport)
    viewport.addEventListener("pointerenter", onEnter)
    viewport.addEventListener("pointerleave", onLeave)
    viewport.addEventListener("pointerdown", onDown)
    viewport.addEventListener("pointermove", onMove)
    viewport.addEventListener("pointerup", onUp)
    viewport.addEventListener("pointercancel", onUp)
    viewport.addEventListener("click", onClick, true)
    viewport.addEventListener("keydown", onKey)
    document.addEventListener("visibilitychange", schedule)
    reduce.addEventListener("change", sync)
    sync()
    return () => {
      cancelAnimationFrame(raf)
      io?.disconnect()
      ro?.disconnect()
      viewport.removeEventListener("pointerenter", onEnter)
      viewport.removeEventListener("pointerleave", onLeave)
      viewport.removeEventListener("pointerdown", onDown)
      viewport.removeEventListener("pointermove", onMove)
      viewport.removeEventListener("pointerup", onUp)
      viewport.removeEventListener("pointercancel", onUp)
      viewport.removeEventListener("click", onClick, true)
      viewport.removeEventListener("keydown", onKey)
      document.removeEventListener("visibilitychange", schedule)
      reduce.removeEventListener("change", sync)
      nudgeRef.current = () => {}
    }
  }, [])

  const renderSet = (copy: boolean) => [
    ...CREATORS.map((c, i) => <Card key={`${copy ? "b" : "a"}-${c.slug}`} c={c} idx={i} copy={copy} />),
    <YouTile key={copy ? "b-you" : "a-you"} idx={CREATORS.length} copy={copy} />,
  ]

  return (
    <section
      ref={sectionRef}
      className="cc-section"
      data-story-section="creators"
      data-tone={tone}
      aria-labelledby="creators-carousel-title"
    >
      <style href="w12-creators-carousel" precedence="w12-section">{CREATORS_CSS}</style>
      <div className="cc-head">
        <div className="cc-head-copy">
          <p className="story-eyebrow cc-eyebrow">For creators</p>
          <StoryHeading
            id="creators-carousel-title"
            text={CREATORS_HEADING}
            accent={["creators"]}
            dark={tone === "dark"}
          />
          <p className="cc-sub">
            Musicians drop sample packs. Coaches fill their calendars. Streamers ship merch on a
            Friday night. One storefront holds all of it, under your name, with nothing to stitch
            together.
          </p>
        </div>
        <div className="cc-head-side">
          <MorphPillCluster prefix="Sell" labels={CREATORS_SELL_LABELS} size="lg" tone={tone} className="cc-pill" />
          <div className="cc-ctas">
            <a className="cc-btn cc-btn-primary" href="/signup">
              Start selling for free
            </a>
            <a className="cc-btn cc-btn-ghost" href="/explore">
              See creator shops
            </a>
          </div>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="cc-viewport"
        role="region"
        aria-roledescription="carousel"
        aria-label="Creators who sell on Storelib"
        tabIndex={0}
      >
        <ul ref={trackRef} className="cc-track">
          {renderSet(false)}
          {renderSet(true)}
        </ul>
      </div>

      <div className="cc-foot">
        <SalePop items={SALES} tone={tone} className="cc-salepop" />
        <div className="cc-controls">
          <button type="button" className="cc-ctl" aria-label="Previous creator" onClick={() => nudgeRef.current(-1)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M10 3.5 5.5 8l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            type="button"
            className="cc-ctl"
            aria-pressed={paused}
            aria-label={paused ? "Play carousel" : "Pause carousel"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M5 3.5v9l7-4.5z" fill="currentColor" />
              </svg>
            ) : (
              <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
                <path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
              </svg>
            )}
          </button>
          <button type="button" className="cc-ctl" aria-label="Next creator" onClick={() => nudgeRef.current(1)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </section>
  )
}

export const CREATORS_CSS = `
.cc-section{--cc-bg:#fff;--cc-ink:#18181b;--cc-muted:#66646f;--cc-line:rgba(24,24,27,.1);--cc-ctl:#f3f2f6;--cc-w:clamp(232px,64vw,262px);--cc-gap:14px;--cc-gutter:var(--landing-gutter,clamp(20px,6vw,96px));--cc-spring:cubic-bezier(.34,1.56,.64,1);position:relative;background:var(--cc-bg);color:var(--cc-ink);overflow:clip;padding-block:clamp(64px,8vw,120px)}
@supports (transition-timing-function:linear(0,1)){.cc-section{--cc-spring:linear(0,.009,.035 2.1%,.141,.281 6.7%,.723 12.9%,.938 16.7%,1.017,1.077,1.121,1.149 24.3%,1.159,1.163,1.161,1.154 29.9%,1.129 32.8%,1.051 39.6%,1.017 43.1%,.991,.977 51%,.974 53.8%,.975 57.1%,.997 69.8%,1.003 76.9%,1)}}
.cc-section[data-tone="dark"]{--cc-bg:#0b0b0c;--cc-ink:#fafafa;--cc-muted:#a1a1aa;--cc-line:rgba(255,255,255,.14);--cc-ctl:#1a1a1d;border-radius:clamp(28px,4vw,56px)}
@media(min-width:768px){.cc-section{--cc-w:clamp(236px,21vw,300px);--cc-gap:20px}}
.cc-section .cc-head,.cc-section .cc-foot{max-width:1400px;margin-inline:auto;padding-inline:var(--cc-gutter);box-sizing:border-box}
.cc-head{display:grid;gap:28px;align-items:end}
@media(min-width:1024px){.cc-head{grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:56px}}
.cc-head-copy .story-heading{font-size:clamp(36px,5vw,72px)}
.cc-section[data-tone="dark"] .cc-eyebrow{background:rgba(124,58,237,.16);border-color:rgba(167,139,250,.28);color:#d8ccff}
.cc-sub{max-width:56ch;margin:22px 0 0;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:var(--cc-muted);text-wrap:pretty}
.cc-head-side{display:grid;gap:26px;justify-items:start}
@media(min-width:1024px){.cc-head-side{justify-items:end;padding-bottom:6px}}
.cc-pill{--mp-prefix:var(--cc-ink);min-height:44px}
.cc-ctas{display:flex;flex-wrap:wrap;gap:10px}
.cc-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 22px;border-radius:999px;font-size:15px;font-weight:500;letter-spacing:-.01em;text-decoration:none;transition:transform 420ms var(--cc-spring),background-color 200ms ease,box-shadow 200ms ease}
.cc-btn:active{transform:scale(.97)}
.cc-btn-primary{background:var(--cc-ink);color:var(--cc-bg)}
.cc-btn-primary:hover{transform:translate3d(0,-2px,0)}
.cc-btn-ghost{color:var(--cc-ink);box-shadow:inset 0 0 0 1px var(--cc-line)}
.cc-btn-ghost:hover{background:var(--cc-ctl)}
.cc-btn:focus-visible,.cc-ctl:focus-visible,.cc-viewport:focus-visible,.cc-tile-cta:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}

[data-landing-story] [data-story-section="creators"] > .cc-viewport{max-width:none;padding-inline:0}
.cc-viewport{position:relative;margin-top:clamp(36px,5vw,64px);overflow:hidden;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none;outline-offset:-4px}
.cc-viewport[data-dragging]{cursor:grabbing}
.cc-track{display:flex;gap:var(--cc-gap);width:max-content;margin:0;padding:30px var(--cc-gutter) 26px;list-style:none;will-change:transform;backface-visibility:hidden}
.cc-card{flex:none;width:var(--cc-w);margin:0;padding:0}
.cc-body{position:relative;transform:translate3d(0,0,0);transition:transform 820ms var(--cc-spring)}
.cc-shape{position:relative;display:block;overflow:hidden;aspect-ratio:4/5;border-radius:28px;background:#e8e6ee;isolation:isolate;transform:translateZ(0);transition:border-radius 860ms var(--cc-spring)}
.cc-section[data-tone="dark"] .cc-shape{background:#1a1a1d}
.cc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.001);transition:transform 1100ms cubic-bezier(.2,.8,.2,1);pointer-events:none}
.cc-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(8,8,10,.72),rgba(8,8,10,.28) 34%,rgba(8,8,10,0) 58%);pointer-events:none}
.cc-meta{position:absolute;left:20px;right:20px;bottom:18px;display:grid;gap:3px;color:#fff}
.cc-who{font-size:12px;font-weight:500;opacity:.72;letter-spacing:.01em}
.cc-kind{font-size:clamp(22px,1.9vw,26px);font-weight:500;letter-spacing:-.035em;line-height:1.1}
.cc-sells{font-size:13.5px;line-height:1.35;opacity:.86}
.cc-sale{position:absolute;top:-15px;left:50%;z-index:2;display:inline-flex;align-items:center;gap:7px;padding:8px 13px 8px 10px;border-radius:999px;background:#fff;color:#18181b;font-size:12.5px;white-space:nowrap;box-shadow:0 10px 26px -12px rgba(24,24,27,.5),0 0 0 1px rgba(24,24,27,.06);opacity:0;transform:translate3d(-50%,10px,0) scale(.55);transition:opacity 200ms ease,transform 620ms var(--cc-spring);pointer-events:none}
.cc-sale b{font-weight:600;color:#15803d}
.cc-sale-dot{position:relative;width:7px;height:7px;border-radius:999px;background:#16a34a}
.cc-sale-dot::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#16a34a;opacity:0}
.cc-badge{position:absolute;top:16px;right:16px}
.cc-badge .ob-root{font-size:12px;padding:6px 11px 6px 8px}
.cc-eq{position:absolute;top:18px;right:18px;display:flex;align-items:flex-end;gap:3px;height:22px;padding:7px 9px;border-radius:999px;background:rgba(12,12,14,.5);box-sizing:content-box}
.cc-eq span{width:3px;height:100%;border-radius:2px;background:#fff;transform-origin:50% 100%;animation:cc-eq 1.1s ease-in-out calc(var(--b) * -0.23s) infinite alternate}
@keyframes cc-eq{0%{transform:scaleY(.25)}100%{transform:scaleY(1)}}

/* The bubble. Corners spring into a dome (arch), a leaf (tear) or a tilt. */
.cc-card[data-shape="arch"]{--cc-on:50% 50% 30px 30px / 40% 40% 30px 30px}
.cc-card[data-shape="tear"]{--cc-on:50% 34px 30px 30px / 40% 34px 30px 30px}
.cc-card[data-shape="tilt"]{--cc-on:34px 50% 30px 30px / 34px 40% 30px 30px}
@media(hover:hover) and (pointer:fine){
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-body{transform:translate3d(0,-8px,0) scale(1.035)}
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-shape{border-radius:var(--cc-on)}
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-img{transform:scale(1.08)}
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-sale{opacity:1;transform:translate3d(-50%,0,0) scale(1)}
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-sale-dot::after{animation:cc-ping 1.6s ease-out infinite}
}
.cc-card[data-active] .cc-body{transform:translate3d(0,-6px,0) scale(1.03)}
.cc-card[data-active] .cc-shape{border-radius:var(--cc-on)}
.cc-card[data-active] .cc-img{transform:scale(1.07)}
.cc-card[data-active] .cc-sale{opacity:1;transform:translate3d(-50%,0,0) scale(1)}
.cc-card[data-active] .cc-sale-dot::after{animation:cc-ping 1.6s ease-out infinite}
@keyframes cc-ping{0%{transform:scale(1);opacity:.5}100%{transform:scale(3.2);opacity:0}}

/* Motion tile: the next creator could be you. */
.cc-tile{background:radial-gradient(120% 90% at 0% 0%,#3b1d8f 0%,rgba(59,29,143,0) 60%),radial-gradient(120% 90% at 100% 100%,#4338ca 0%,rgba(67,56,202,0) 55%),#0f0b1d;color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:20px;box-sizing:border-box}
.cc-orb{position:absolute;border-radius:999px;pointer-events:none}
.cc-orb-a{width:62%;aspect-ratio:1;top:18%;left:-14%;background:radial-gradient(circle at 35% 35%,rgba(167,139,250,.85),rgba(124,58,237,0) 68%);animation:cc-drift-a 9s ease-in-out infinite alternate}
.cc-orb-b{width:54%;aspect-ratio:1;bottom:6%;right:-12%;background:radial-gradient(circle at 60% 40%,rgba(99,102,241,.9),rgba(79,70,229,0) 66%);animation:cc-drift-b 11s ease-in-out infinite alternate}
@keyframes cc-drift-a{0%{transform:translate3d(0,0,0) scale(1)}100%{transform:translate3d(38%,22%,0) scale(1.18)}}
@keyframes cc-drift-b{0%{transform:translate3d(0,0,0) scale(1.1)}100%{transform:translate3d(-30%,-26%,0) scale(.9)}}
.cc-tile-top,.cc-tile-mid,.cc-tile-cta{position:relative}
.cc-tile-mid{display:grid;gap:12px;justify-items:start}
.cc-tile-kicker{font-size:clamp(22px,1.9vw,26px);font-weight:500;letter-spacing:-.035em;line-height:1.1}
.cc-tile-cta{white-space:nowrap;display:inline-flex;align-items:center;justify-content:space-between;gap:10px;min-height:46px;padding:0 18px;border-radius:999px;background:#fff;color:#18181b;font-size:14.5px;font-weight:500;text-decoration:none;transition:transform 420ms var(--cc-spring)}
.cc-tile-cta:hover{transform:translate3d(2px,0,0)}

.cc-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:6px}
.cc-salepop{min-width:0;flex:1 1 auto;max-width:360px}
.cc-controls{display:flex;gap:8px;flex:none}
.cc-ctl{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:999px;background:var(--cc-ctl);color:var(--cc-ink);cursor:pointer;transition:transform 380ms var(--cc-spring),background-color 200ms ease}
.cc-ctl:hover{transform:scale(1.06)}
.cc-ctl:active{transform:scale(.94)}
@media(max-width:480px){.cc-ctas{width:100%}.cc-ctas .cc-btn{flex:1 1 100%}.cc-foot{flex-wrap:wrap}.cc-salepop{flex-basis:100%;max-width:none;order:2}.cc-controls{margin-left:auto}}

/* The cards' loops, named (not .cc-card *): a rule ending in * makes every section's data-story-in-view change restyle that whole section in Chromium (300 to 800 elements, 30 to 130 ms at 4x CPU, each time one scrolls in or out). */
[data-landing-story] [data-story-section][data-story-in-view="false"] .cc-card :is(.cc-eq span,.ob-ring,.ob-orbit,.mp-sat),[data-landing-story][data-story-paused] .cc-card :is(.cc-eq span,.ob-ring,.ob-orbit,.mp-sat){animation-play-state:paused!important}

/* Reduced motion: the same cards, standing still in a grid. */
@media(prefers-reduced-motion:reduce){
  .cc-viewport{cursor:auto;touch-action:auto}
  .cc-track{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));width:auto;max-width:1400px;margin-inline:auto;transform:none!important;will-change:auto;box-sizing:border-box;padding-top:12px}
  @media(min-width:768px){.cc-track{grid-template-columns:repeat(auto-fill,minmax(200px,1fr))}}
  @media(min-width:1180px){.cc-track{grid-template-columns:repeat(6,1fr)}}
  .cc-card{width:auto}
  .cc-card[aria-hidden="true"]{display:none}
  .cc-controls{display:none}
  .cc-section *{animation:none!important;transition:none!important}
  .cc-card .cc-body,.cc-card .cc-img{transform:none!important}
  .cc-card .cc-shape{border-radius:24px!important}
  .cc-sale{display:none}
  .cc-you{grid-column:1/-1}
  .cc-you .cc-shape{aspect-ratio:auto;min-height:220px}
  .cc-you .cc-tile-cta{align-self:flex-start}
  .cc-meta{left:14px;right:14px;bottom:14px}
  .cc-kind{font-size:clamp(18px,4.6vw,24px)}
  .cc-sells{font-size:12.5px}
}
`

/** This section's stylesheets, as it and its motion pieces draw them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CREATORS_STYLES: readonly SectionStyle[] = [
  { href: "w12-creators-carousel", precedence: "w12-section", css: CREATORS_CSS },
  { href: "w12-morph-pill", precedence: MOTION_STYLE_PRECEDENCE, css: MORPH_PILL_CSS },
  { href: "w12-orbit-badge", precedence: MOTION_STYLE_PRECEDENCE, css: ORBIT_BADGE_CSS },
  { href: "w12-sale-pop", precedence: MOTION_STYLE_PRECEDENCE, css: SALE_POP_CSS },
]
