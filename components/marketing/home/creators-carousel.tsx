"use client"

import { useEffect, useRef } from "react"
import { BookOpen, CalendarClock, Dumbbell, Frame, Mic, Music2, PlayCircle, Shirt, SlidersHorizontal, Smile, Store, Video, type LucideIcon } from "lucide-react"
import { StoryHeading } from "../story-heading"
import type { SectionStyle } from "./lazy-section"
import { SALE_POP_CSS, SalePop, type SalePopItem } from "./motion/sale-pop"
import { MOTION_STYLE_PRECEDENCE } from "./motion/use-motion-gate"

export type CreatorCard = {
  slug: string
  kind: string
  sells: string
  name: string
  alt: string
  /** One real thing this creator sells on their Storelib shop, as its product tile shows it. */
  product: { title: string; price: string; icon: LucideIcon }
}

/** Photos: Unsplash (free licence), cropped 4:5 and stored as 400w/720w WebP
 * under public/home/creators. Every name and product is fictional. */
export const CREATORS: readonly CreatorCard[] = [
  { slug: "youtubers", kind: "YouTubers", sells: "Presets, merch & memberships", name: "Lena Marsh", alt: "Lena, a YouTuber, laughing in a red sweater", product: { title: "Cozy Edit LUT pack", price: "$18", icon: Video } },
  { slug: "musicians", kind: "Musicians", sells: "Beats & sample packs", name: "Jalen Brooks", alt: "Jalen performing on stage through a cloud of light and smoke", product: { title: "Drum Kit Vol. 2", price: "$29", icon: Music2 } },
  { slug: "authors", kind: "Authors", sells: "E-books & signed copies", name: "Clara Whitfield", alt: "An open paperback beside reading glasses and a latte", product: { title: "The Salt Year, e-book", price: "$14.99", icon: BookOpen } },
  { slug: "educators", kind: "Educators", sells: "Online courses", name: "Rosa Delgado", alt: "Rosa, an educator, smiling in a striped cardigan", product: { title: "Spanish in 6 Weeks", price: "$149", icon: PlayCircle } },
  { slug: "influencers", kind: "Influencers", sells: "Merch drops", name: "Amara Osei", alt: "Amara, an influencer, in a bold patterned top", product: { title: "Autumn Drop hoodie", price: "$58", icon: Shirt } },
  { slug: "podcasters", kind: "Podcasters", sells: "Bonus episodes & memberships", name: "The Late Signal", alt: "A studio microphone on a boom arm against a dark wall", product: { title: "Signal+ membership", price: "$6/mo", icon: Mic } },
  { slug: "artists", kind: "Artists", sells: "Prints & original pieces", name: "Iris Calder", alt: "Paint brushes dragging bright orange paint across a canvas", product: { title: "Ember, A3 giclée print", price: "$85", icon: Frame } },
  { slug: "streamers", kind: "Streamers", sells: "Sub perks & emote packs", name: "Kai Navarro", alt: "Kai streaming at a glowing desk setup with a headset on", product: { title: "Season 4 emote pack", price: "$4.99", icon: Smile } },
  { slug: "coaches", kind: "Coaches", sells: "1:1 calls & programs", name: "Dev Mehta", alt: "Dev, a coach, smiling in a white tee against a concrete wall", product: { title: "60-min strategy call", price: "$120", icon: CalendarClock } },
  { slug: "agencies", kind: "Agencies", sells: "Storefronts for every client", name: "Northfield Studio", alt: "Two agency partners high-fiving across a desk", product: { title: "Shop setup, done for you", price: "$640", icon: Store } },
  { slug: "photographers", kind: "Photographers", sells: "Photo presets & prints", name: "Jonah Price", alt: "Jonah tossing a camera toward the lens in an autumn forest", product: { title: "Film Tones presets", price: "$24", icon: SlidersHorizontal } },
  { slug: "fitness", kind: "Fitness", sells: "Training plans & challenges", name: "Sasha Ivanova", alt: "Sasha holding a plank on a pink mat in a sunlit studio", product: { title: "21-day core challenge", price: "$39", icon: Dumbbell } },
]

export const CREATORS_HEADING = "Storelib is for creators. Whatever you make."

/** The sale notifications under the rail, worded as Storelib's own in-app "new sale" notice (lib/notify/templates/catalog.ts). */
const SALES: readonly SalePopItem[] = [
  { who: "Maya Ross", what: "Drum Kit Vol. 2", amount: "$29.00" },
  { who: "Tom Kessler", what: "Spanish in 6 Weeks", amount: "$149.00" },
  { who: "Priya Shah", what: "Autumn Drop hoodie", amount: "$58.00" },
  { who: "Leo Martin", what: "60-min strategy call", amount: "$120.00" },
  { who: "Hana Wright", what: "Film Tones presets", amount: "$24.00" },
  { who: "Sam Ortiz", what: "Signal+ membership", amount: "$6.00" },
]

const SIZES = "(max-width: 640px) 66vw, (max-width: 1280px) 24vw, 300px"

function Card({ c, idx, copy }: { c: CreatorCard; idx: number; copy: boolean }) {
  const Icon = c.product.icon
  return (
    <li className="cc-card" data-idx={idx} aria-hidden={copy || undefined} inert={copy || undefined}>
      <div className="cc-body">
        <div className="cc-photo">
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
          <span className="cc-prod">
            <span className="cc-prod-ic" aria-hidden="true">
              <Icon size={17} strokeWidth={1.9} />
            </span>
            <span className="cc-prod-t">
              <b>{c.product.title}</b>
              <small>{c.name}</small>
            </span>
            <span className="cc-prod-p">{c.product.price}</span>
          </span>
        </div>
        <span className="cc-info">
          <span className="cc-kind">{c.kind}</span>
          <span className="cc-sells">{c.sells}</span>
        </span>
      </div>
    </li>
  )
}

/**
 * Section 7: who Storelib is for. An endless, transform-only rail of creator
 * cards that drifts left on its own, eases to a stop under the mouse or while
 * a card has focus, and can be dragged or swiped. Each card is a creator and
 * one thing they sell, as the product tile on their shop shows it. Under the
 * rail, Storelib's own "new sale" notifications stack in. Reduced motion
 * shows the same cards as a still grid.
 */
export function CreatorsCarousel({ tone = "light" }: { tone?: "light" | "dark" }) {
  const sectionRef = useRef<HTMLElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const viewport = viewportRef.current
    const track = trackRef.current
    if (!section || !viewport || !track) return
    const reduce = matchMedia("(prefers-reduced-motion: reduce)")
    const touch = matchMedia("(hover: none), (pointer: coarse)")
    const count = CREATORS.length
    let loop = 0
    let step = 1
    let x = 0
    let v = 0
    let glide = 0
    let last = 0
    let raf = 0
    let visible = typeof IntersectionObserver !== "function"
    let hovering = false
    let focused = false
    let drag: { id: number; lastX: number; lastT: number; moved: number; vel: number; captured: boolean } | null = null
    let suppressClick = false
    /*
     * The steady drift runs on the compositor. Once the rail has eased up to
     * its cruising speed, the motion is handed to a Web Animation (the same
     * straight line, one copy of the cards per lap), and the frame loop
     * stops: a transform set from script on every frame made Chromium
     * re-layer the whole page each frame (5 to 9 ms at 4x CPU) for as long as
     * the section was on screen. Anything that changes the speed (a pointer,
     * a drag, a key, focus, a resize) takes the motion back from where the
     * animation has got to, so nothing jumps.
     */
    let drift: Animation | null = null
    let cruiseFrom = 0
    let cruiseSpeed = 0
    const cruiseX = () => (drift ? cruiseFrom + ((Number(drift.currentTime) || 0) / 1000) * cruiseSpeed : x)

    const measure = () => {
      const cards = track.querySelectorAll<HTMLElement>("[data-idx]")
      const first = cards[0]
      const second = cards[1]
      const copy = cards[count]
      if (!first || !second || !copy) return
      step = second.offsetLeft - first.offsetLeft || 1
      loop = copy.offsetLeft - first.offsetLeft
    }
    const live = () => visible && !document.hidden && !reduce.matches
    const cruise = () => (touch.matches ? 30 : 36)

    const paint = () => {
      if (loop > 0) x = ((x % loop) + loop) % loop
      track.style.transform = `translate3d(${(-x).toFixed(2)}px,0,0)`
    }
    const startCruise = (speed: number) => {
      if (loop <= 0 || speed <= 0 || typeof track.animate !== "function") return false
      x = ((x % loop) + loop) % loop
      cruiseFrom = x
      cruiseSpeed = speed
      drift = track.animate(
        [{ transform: `translate3d(${(-x).toFixed(2)}px,0,0)` }, { transform: `translate3d(${(-(x + loop)).toFixed(2)}px,0,0)` }],
        { duration: (loop / speed) * 1000, iterations: Infinity, easing: "linear" },
      )
      return true
    }
    const stopCruise = () => {
      if (!drift) return
      x = cruiseX()
      v = cruiseSpeed
      paint()
      drift.cancel()
      drift = null
      last = 0
    }
    const frame = (t: number) => {
      raf = 0
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016
      last = t
      const goal = hovering || focused || drag ? 0 : cruise()
      if (!drag) {
        // Critically damped approach: a soft slow-down and pick-up, never a jolt.
        v += (goal - v) * (1 - Math.exp(-dt * (Math.abs(v) > Math.abs(goal) ? 2.6 : 1.6)))
        let move = v * dt
        if (glide) {
          // Arrow-key nudges ease out over a card width on top of the drift.
          let part = glide * (1 - Math.exp(-dt * 7))
          if (Math.abs(glide - part) < 0.4) part = glide
          glide -= part
          move += part
        }
        x += move
      }
      paint()
      if (live() && !drag && !glide && goal && Math.abs(v - goal) < 0.5 && startCruise(goal)) last = 0
      else if (live() && (drag || glide || goal || Math.abs(v) > 0.4)) schedule()
      else last = 0
    }
    const schedule = () => {
      if (!raf && !drift && live()) raf = requestAnimationFrame(frame)
    }
    /* Something changes the speed: take the motion back from the compositor first. */
    const wake = () => {
      stopCruise()
      schedule()
    }
    /* Shown or hidden (scrolled away, another tab): a cruising rail just pauses where it is. */
    const resume = () => {
      if (!drift) return schedule()
      if (live()) drift.play()
      else drift.pause()
    }

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = true
        wake()
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = false
        wake()
      }
    }
    const onFocus = () => {
      focused = viewport.matches(":focus-visible") || !!viewport.querySelector(":focus-visible")
      wake()
    }
    const onBlur = () => {
      focused = false
      wake()
    }
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || reduce.matches) return
      stopCruise()
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
      }
      drag = null
      schedule()
      if (!raf) paint()
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
        glide += (e.key === "ArrowRight" ? 1 : -1) * step
        wake()
      }
    }
    const sync = () => {
      stopCruise()
      measure()
      paint()
      schedule()
    }

    const io =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            ([entry]) => {
              visible = entry.isIntersecting
              resume()
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
    viewport.addEventListener("focusin", onFocus)
    viewport.addEventListener("focusout", onBlur)
    document.addEventListener("visibilitychange", resume)
    reduce.addEventListener("change", sync)
    sync()
    return () => {
      cancelAnimationFrame(raf)
      drift?.cancel()
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
      viewport.removeEventListener("focusin", onFocus)
      viewport.removeEventListener("focusout", onBlur)
      document.removeEventListener("visibilitychange", resume)
      reduce.removeEventListener("change", sync)
    }
  }, [])

  const renderSet = (copy: boolean) => CREATORS.map((c, i) => <Card key={`${copy ? "b" : "a"}-${c.slug}`} c={c} idx={i} copy={copy} />)

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
        <StoryHeading
          id="creators-carousel-title"
          text={CREATORS_HEADING}
          accent={["creators"]}
          dark={tone === "dark"}
        />
        <a className="cc-cta" href="/signup">
          Start selling for free
          <span className="cc-cta-ic" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="16" height="16">
              <path d="M3.5 8h8.5M8.5 4.5 12 8l-3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </a>
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
      </div>
    </section>
  )
}

export const CREATORS_CSS = `
.cc-section{--cc-bg:#fff;--cc-ink:#18181b;--cc-muted:#6b6b76;--cc-photo:#ecebf0;--cc-w:clamp(236px,66vw,268px);--cc-gap:14px;--cc-gutter:var(--landing-gutter,clamp(20px,6vw,96px));--cc-ease:cubic-bezier(.22,1,.36,1);position:relative;background:var(--cc-bg);color:var(--cc-ink);overflow:clip;padding-block:clamp(64px,8vw,120px)}
.cc-section[data-tone="dark"]{--cc-bg:#0b0b0c;--cc-ink:#fafafa;--cc-muted:#a1a1aa;--cc-photo:#1a1a1d;border-radius:clamp(28px,4vw,56px)}
@media(min-width:768px){.cc-section{--cc-w:clamp(240px,21vw,296px);--cc-gap:20px}}
.cc-section .cc-head,.cc-section .cc-foot{max-width:1400px;margin-inline:auto;padding-inline:var(--cc-gutter);box-sizing:border-box}
.cc-head{display:grid;gap:28px;align-items:end;justify-items:start}
@media(min-width:1024px){.cc-head{grid-template-columns:minmax(0,1fr) auto;gap:56px}}
.cc-head .story-heading{font-size:clamp(36px,5vw,72px);max-width:15ch}

/* The one call to action: a solid pill with the arrow in its own disc. */
.cc-cta{display:inline-flex;align-items:center;gap:14px;height:52px;padding:0 6px 0 24px;border-radius:999px;background:var(--cc-ink);color:var(--cc-bg);font-size:15.5px;font-weight:600;letter-spacing:-.01em;text-decoration:none;white-space:nowrap;box-shadow:0 1px 2px rgba(24,24,27,.1),0 6px 16px -10px rgba(24,24,27,.4);transition:transform 360ms var(--cc-ease),box-shadow 360ms var(--cc-ease)}
.cc-cta-ic{display:grid;place-items:center;width:40px;height:40px;border-radius:999px;background:#7c3aed;color:#fff;transition:transform 360ms var(--cc-ease)}
.cc-cta-ic svg{transition:transform 360ms var(--cc-ease)}
.cc-cta:hover{transform:translate3d(0,-1px,0);box-shadow:0 1px 2px rgba(24,24,27,.1),0 12px 24px -12px rgba(24,24,27,.45)}
.cc-cta:hover .cc-cta-ic svg{transform:translate3d(2px,0,0)}
.cc-cta:active{transform:scale(.98)}
.cc-cta:focus-visible,.cc-viewport:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
@media(min-width:1024px){.cc-cta{margin-bottom:10px}}

[data-landing-story] [data-story-section="creators"] > .cc-viewport{max-width:none;padding-inline:0}
.cc-viewport{position:relative;margin-top:clamp(36px,5vw,60px);overflow:hidden;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none;outline-offset:-4px}
.cc-viewport[data-dragging]{cursor:grabbing}
.cc-track{display:flex;gap:var(--cc-gap);width:max-content;margin:0;padding:10px var(--cc-gutter) 8px;list-style:none;will-change:transform;backface-visibility:hidden}
.cc-card{flex:none;width:var(--cc-w);margin:0;padding:0}
.cc-body{display:block;transform:translate3d(0,0,0);transition:transform 520ms var(--cc-ease)}
.cc-photo{position:relative;display:block;overflow:hidden;aspect-ratio:4/5;border-radius:20px;background:var(--cc-photo);isolation:isolate;transform:translateZ(0)}
.cc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scale(1.001);transition:transform 900ms var(--cc-ease);pointer-events:none}
.cc-prod{position:absolute;left:10px;right:10px;bottom:10px;display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;border-radius:14px;background:#fff;color:#18181b;box-shadow:0 1px 2px rgba(0,0,0,.08),0 10px 24px -14px rgba(0,0,0,.45)}
.cc-prod-ic{display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:10px;background:#f3efff;color:#6d28d9}
.cc-prod-t{display:grid;min-width:0;flex:1 1 auto;line-height:1.25}
.cc-prod-t b{font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-prod-t small{font-size:11.5px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cc-prod-p{flex:none;font-size:13px;font-weight:600;font-variant-numeric:tabular-nums}
.cc-info{display:grid;gap:2px;padding:14px 4px 0}
.cc-kind{font-size:18px;font-weight:600;letter-spacing:-.02em;line-height:1.25}
.cc-sells{font-size:14px;line-height:1.4;color:var(--cc-muted)}
@media(hover:hover) and (pointer:fine){
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-body{transform:translate3d(0,-6px,0)}
  .cc-viewport:not([data-dragging]) .cc-card:hover .cc-img{transform:scale(1.04)}
}

.cc-foot{display:flex;margin-top:clamp(24px,3vw,36px)}
.cc-salepop{width:min(100%,360px)}

/* Reduced motion: the same cards, standing still in a grid. */
@media(prefers-reduced-motion:reduce){
  .cc-viewport{cursor:auto;touch-action:auto}
  .cc-track{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));width:auto;max-width:1400px;margin-inline:auto;transform:none!important;will-change:auto;box-sizing:border-box}
  @media(min-width:768px){.cc-track{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}}
  @media(min-width:1180px){.cc-track{grid-template-columns:repeat(4,1fr)}}
  .cc-card{width:auto}
  .cc-card[aria-hidden="true"]{display:none}
  .cc-body,.cc-img,.cc-cta,.cc-cta-ic svg{transition:none!important;transform:none!important}
  .cc-prod{left:8px;right:8px;bottom:8px}
  @media(max-width:767px){.cc-prod{padding:7px 9px;gap:8px}.cc-prod-ic,.cc-prod-t small{display:none}.cc-prod-t b{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}}
}
`

/** This section's stylesheets, as it and its motion pieces draw them: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CREATORS_STYLES: readonly SectionStyle[] = [
  { href: "w12-creators-carousel", precedence: "w12-section", css: CREATORS_CSS },
  { href: "w12-sale-pop", precedence: MOTION_STYLE_PRECEDENCE, css: SALE_POP_CSS },
]
