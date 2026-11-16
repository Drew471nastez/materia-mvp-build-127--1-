"use client"

import { useEffect, useRef } from "react"
import { StoryHeading } from "../story-heading"
import { RAIL_AXIS, bindRailGesture } from "../rail-gesture"
import { frameLeg, type FrameLeg } from "../rail-frames"
import type { SectionStyle } from "./lazy-section"

export type CreatorCard = {
  slug: string
  kind: string
  sells: string
  name: string
  alt: string
}

/** Photos: Unsplash (free licence), cropped 4:5 and stored as 400w/720w WebP
 * under public/home/creators. Every name is fictional.
 * Landing round 9, the owner's own picks: Musicians (a man's portrait on an
 * orange ground), Photographers and Fitness are Pexels photos (free licence),
 * cropped and stored the same way. */
export const CREATORS: readonly CreatorCard[] = [
  { slug: "youtubers", kind: "YouTubers", sells: "Presets, merch & memberships", name: "Lena Marsh", alt: "A video editor at a dark desk, cutting a clip on a wide monitor, a phone charging beside it" },
  { slug: "musicians", kind: "Musicians", sells: "Songs, vinyl & lessons", name: "Jules Arden", alt: "A musician in profile, a cap on and locs falling, lit in deep red" },
  { slug: "authors", kind: "Authors", sells: "E-books & signed copies", name: "Clara Whitfield", alt: "An open book in a slant of window light on a dark sofa" },
  { slug: "educators", kind: "Educators", sells: "Online courses", name: "Teo Alvarez", alt: "Teo in his sunlit painting studio, an apron on and a brush in hand" },
  { slug: "influencers", kind: "Influencers", sells: "Merch drops", name: "Adaeze Nwosu", alt: "Adaeze, an influencer, in a bold patterned top" },
  { slug: "artists", kind: "Artists", sells: "Prints & original pieces", name: "Iris Calder", alt: "Iris painting on a canvas at an easel" },
  { slug: "streamers", kind: "Streamers", sells: "Sub perks & emote packs", name: "Kai Navarro", alt: "Kai streaming at a glowing desk setup with a headset on" },
  { slug: "coaches", kind: "Coaches", sells: "1:1 calls & programs", name: "Dev Mehta", alt: "Dev, a coach, smiling in a white tee against a concrete wall" },
  { slug: "agencies", kind: "Agencies", sells: "Storefronts for every client", name: "Northfield Studio", alt: "An agency partner showing a client a page on a laptop across a table, in black and white" },
  { slug: "photographers", kind: "Photographers", sells: "Photo presets & prints", name: "Noa Price", alt: "Noa in silhouette, her camera raised to her eye against a sky going from blue to orange" },
  { slug: "fitness", kind: "Fitness", sells: "Training plans & challenges", name: "Cole Whitaker", alt: "Cole walking through a dark gym with a dumbbell in each hand, in black and white" },
]

export const CREATORS_HEADING = "Storelib is for creators. Whatever you make."

const SIZES = "(max-width: 640px) 66vw, (max-width: 1280px) 24vw, 300px"

/* The feel of a finger on the rail (landing round 7). */
/** How far a finger moves before the gesture is read as across (the rail's) or down (the page's): rail-gesture.ts (landing round 9: 4px, where round 7 waited 8). */
export const AXIS_SLOP = RAIL_AXIS.slop
/** A throw slows by e every this many seconds: about the glide of a flicked list on a phone. */
const COAST_TAU = 0.42
/** The fastest throw, px a second. */
const MAX_THROW = 3200
/** After a hold or a throw, the drift waits this long, then eases back in over RAMP_UP_MS. */
const RESUME_AFTER_MS = 1400
const RAMP_UP_MS = 1800
const RAMP_DOWN_MS = 650
/** Landing round 11: the photos are fetched and decoded from this far ahead of the section, this many at a time. */
export const CREATORS_PRELOAD = { marginPx: 1600, parallel: 3 } as const

function Card({ c, idx, copy }: { c: CreatorCard; idx: number; copy: boolean }) {
  return (
    <li className="cc-card" data-idx={idx} aria-hidden={copy || undefined} inert={copy || undefined}>
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
        <span className="cc-shade" aria-hidden="true" />
        <span className="cc-meta">
          <span className="cc-who">{c.name}</span>
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
 * a card has focus, and can be dragged or swiped. Each card is a photo with
 * the creator's name, what kind of creator they are and what they sell, set
 * on a soft shade at its foot. Cards stay still under the pointer (no lift,
 * no zoom). Reduced motion shows the same cards as a still grid.
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
    /* x: how far the rail has travelled left, in px, whenever no animation holds it. */
    let x = 0
    let visible = typeof IntersectionObserver !== "function"
    let hovering = false
    let focused = false
    /* After a touch, a drag or a throw the drift waits until this moment (performance.now()) before it picks up again. */
    let holdUntil = 0
    let holdTimer = 0
    let paintFrame = 0
    let drag: { fromX: number } | null = null
    /*
     * LANDING ROUND 8 (the owner: "more smooth, butterish, optimized, no lag
     * or stutter"). Round 7 ran the throw, the easing back into the drift and
     * the slowing under a mouse in a frame loop that set the transform from
     * script every frame. Now every one of those is a Web Animation on the
     * compositor, each a curve with the right speed at both ends, chained one
     * after the other: ease in (0 to cruising), cruise (a straight line, one
     * copy of the cards a lap, forever), ease out (cruising to 0), coast (a
     * throw's speed decaying by e every COAST_TAU, then still) and the
     * arrow keys' nudge. The main thread does no work per frame unless a
     * finger or the mouse is holding the rail, and then only the one
     * transform per frame the hand moved. Taking the motion back (a press, a
     * hover, a resize) reads the rail's place once, at that moment.
     */
    /* Landing round 12: on a touch screen a leg is run by the page's own frames (rail-frames.ts), so a finger catches the rail exactly where it is drawn. */
    let motion: { anim: Animation | FrameLeg; frames: boolean; kind: "in" | "cruise" | "out" | "coast" | "nudge"; t0: number; ms: number; speed: number } | null = null

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
    const wrap = (v: number) => (loop > 0 ? ((v % loop) + loop) % loop : v)
    /*
     * LANDING ROUND 12 (perf). The rail was its own layer for good
     * (will-change in the stylesheet, and a 3D translate is a layer by
     * itself): 1.6M px on a phone and 3.0M at 1440, held all the way down the
     * page. Now the place is a flat translate, and the layer is asked for
     * (promote) only while the rail is live: on screen, in a visible tab,
     * motion allowed. That is when it drifts, glides and is dragged, so it
     * never builds a layer on the first frame of a move; off screen it is
     * painted flat and holds nothing.
     */
    const tf = (v: number) => `translate(${(-v).toFixed(2)}px)`
    const promote = () => {
      const want = live() ? "transform" : ""
      if (track.style.willChange !== want) track.style.willChange = want
    }

    const paint = () => {
      paintFrame = 0
      x = wrap(x)
      track.style.transform = tf(x)
    }
    /*
     * The rail's place this moment, and the animation let go. LANDING ROUND 11
     * (the owner: "with touch, when I put my finger on it, it glitches when I
     * try to swipe"). Round 8 read the running animation's place off the
     * style and cancelled it. The compositor, which draws the animation, can
     * be a frame or more ahead of the main thread's idea of where it is (more
     * in WebKit, where it runs in another process), and a throw at 2000px a
     * second is 30px a frame: the finger landed and the rail stepped under
     * it. Now the animation is paused first, which pins what is drawn and
     * what is read to one moment; its place is read from that, written as
     * the rail's own transform in the same task, and only then is the
     * animation cancelled. One place, drawn once: nothing moves under the
     * finger.
     */
    /*
     * LANDING ROUND 12 (the owner, again: "on touch, when the finger goes down
     * to swipe, it glitches and stutters left and right before it swipes").
     * Pausing pins the page's clock, but in WebKit the compositor that draws
     * the animation runs in another process, ahead of it: the place read
     * here could be behind what was on screen, and the rail stepped back
     * before it followed the finger. On a touch screen the motion is now the
     * page's own frames (rail-frames.ts): the place last written is what is
     * drawn, and it is kept as it is.
     */
    const halt = () => {
      if (!motion) return
      const { anim } = motion
      if (motion.frames) {
        x = (anim as FrameLeg).at()
        motion = null
        paint()
        anim.cancel()
        return
      }
      anim.pause()
      const m = getComputedStyle(track).transform
      if (m && m !== "none") x = -new DOMMatrixReadOnly(m).m41
      motion = null
      paint()
      anim.cancel()
    }
    /* One leg of motion on the compositor, from x to x + by. The end is written to the style first, so nothing flashes when the animation lets go. */
    const play = (kind: NonNullable<typeof motion>["kind"], by: number, ms: number, easing: string, speed: number, then?: () => void) => {
      if (loop <= 0 || typeof track.animate !== "function" || ms <= 0) {
        x += by
        paint()
        then?.()
        return
      }
      const from = wrap(x)
      const frames = touch.matches
      let anim: Animation | FrameLeg
      if (frames) {
        /* Written each frame (paint wraps it round the loop). */
        anim = frameLeg(from, by, ms, kind === "cruise" ? "linear" : easing, (v) => {
          x = v
          paint()
        }, kind === "cruise")
      } else {
        anim = track.animate([{ transform: tf(from) }, { transform: tf(from + by) }], kind === "cruise" ? { duration: ms, iterations: Infinity, easing: "linear" } : { duration: ms, easing })
        x = from + by
        if (kind !== "cruise") paint()
        else x = from
      }
      motion = { anim, frames, kind, t0: performance.now(), ms, speed }
      if (!live()) anim.pause()
      anim.onfinish = () => {
        if (motion?.anim !== anim) return
        motion = null
        anim.cancel()
        then ? then() : update()
      }
    }
    /* What the rail's speed should settle at now: nothing while it is held, looked at or waiting, its drift otherwise. */
    const goal = () => (hovering || focused || drag || performance.now() < holdUntil ? 0 : cruise())
    /*
     * Decide the next leg. Easing in or out is a smootherstep of the speed
     * (p * p * p * (p * (p * 6 - 15) + 10)); as a position over time that is
     * close to a cubic Bézier whose ends have the right slopes: in, 0 then
     * twice the average (cruising); out, twice the average then 0.
     */
    const update = () => {
      clearTimeout(holdTimer)
      if (!live() || drag || loop <= 0) return
      const want = goal()
      const kind = motion?.kind
      if (want > 0) {
        if (kind === "cruise" || kind === "in") return
        if (kind === "coast" || kind === "nudge") return
        halt()
        play("in", (want * RAMP_UP_MS) / 2000, RAMP_UP_MS, "cubic-bezier(.5,0,.75,.5)", want, () => play("cruise", loop, (loop / want) * 1000, "linear", want))
        return
      }
      if (kind === "cruise" || kind === "in") {
        /* From the speed it has now: cruising, or the share of it an ease in has reached. */
        let v = motion!.speed
        if (kind === "in") {
          const p = Math.min(1, (performance.now() - motion!.t0) / motion!.ms)
          v *= p * p * p * (p * (p * 6 - 15) + 10)
        }
        halt()
        play("out", (v * RAMP_DOWN_MS) / 2000, RAMP_DOWN_MS, "cubic-bezier(.25,.5,.5,1)", 0)
        return
      }
      /* Waiting out a hold, standing still: no frames, one timer to wake it when the wait is over. */
      const wait = holdUntil - performance.now()
      if (!motion && wait > 0) holdTimer = window.setTimeout(update, wait + 1)
    }
    /*
     * A throw: v * COAST_TAU * (1 - e^(-t / COAST_TAU)) px after t seconds,
     * until it is under 4px a second. As a Bézier: it leaves at the finger's
     * speed (its first slope) and comes to rest with none.
     */
    const coast = (v: number) => {
      const tauMs = COAST_TAU * 1000
      const ms = Math.min(2800, Math.max(260, tauMs * Math.log(Math.abs(v) / 4)))
      const by = v * COAST_TAU * (1 - Math.exp(-ms / tauMs))
      const slope = Math.abs((v * ms) / 1000 / by)
      const x1 = Math.min(0.33, 1 / slope)
      play("coast", by, ms, `cubic-bezier(${x1.toFixed(3)},${Math.min(1, slope * x1).toFixed(3)},.32,1)`, 0, () => {
        holdUntil = performance.now() + RESUME_AFTER_MS
        update()
      })
    }
    /* Shown or hidden (scrolled away, another tab): whatever is moving pauses where it is, and goes on from there. */
    const resume = () => {
      promote()
      if (!motion) return update()
      if (live()) motion.anim.play()
      else motion.anim.pause()
    }

    const onEnter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = true
        update()
      }
    }
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") {
        hovering = false
        update()
      }
    }
    const onFocus = () => {
      focused = viewport.matches(":focus-visible") || !!viewport.querySelector(":focus-visible")
      update()
    }
    const onBlur = () => {
      focused = false
      update()
    }
    /*
     * A FINGER ON THE RAIL (landing round 7, the owner: "more buttery, more
     * realistic", and never fighting the page's own scroll; landing round 9:
     * "on mobile the swipe must feel very smooth"). Touching holds the rail
     * where it is. Whose the gesture is, is rail-gesture.ts: decided after
     * 4px, the rail's only if it went clearly more across than down, read
     * from touch events so an iPhone hands it over at once; then the rail
     * follows the finger 1:1 from that very point. A gesture going down is
     * the page's (touch-action: pan-y, and nothing is ever cancelled) and the
     * rail lets go at once. On release it coasts with the finger's last
     * speed, slowing smoothly, then waits a moment and eases back into its
     * drift from a standstill.
     */
    const gesture = bindRailGesture(viewport, {
      press: () => {
        if (reduce.matches) return false
        halt()
        clearTimeout(holdTimer)
        drag = { fromX: x }
      },
      start: () => {
        viewport.dataset.dragging = ""
        if (drag) drag.fromX = x
      },
      move: (dx) => {
        if (!drag) return
        /* The finger leads: x is set from it here, 1:1, and drawn once a frame, only in a frame it moved. */
        x = drag.fromX - dx
        if (!paintFrame) paintFrame = requestAnimationFrame(paint)
      },
      release: ({ dragged, axis, speed, touch: finger, cancelled }) => {
        drag = null
        delete viewport.dataset.dragging
        if (paintFrame) {
          cancelAnimationFrame(paintFrame)
          paint()
        }
        const throwSpeed = dragged ? Math.max(-MAX_THROW, Math.min(MAX_THROW, speed)) : 0
        /* Dragged, or a finger that rested on the rail without moving: wait a little before drifting again. Handed to the page's scroll, or a mouse click: none. */
        const heldStill = !dragged && axis === null && finger && !cancelled
        holdUntil = dragged || heldStill ? performance.now() + RESUME_AFTER_MS : performance.now()
        if (dragged && Math.abs(throwSpeed) > 40 && live()) coast(throwSpeed)
        else update()
      },
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault()
        halt()
        holdUntil = performance.now() + RESUME_AFTER_MS
        play("nudge", (e.key === "ArrowRight" ? 1 : -1) * step, 520, "cubic-bezier(.22,1,.36,1)", 0)
      }
    }
    const sync = () => {
      promote()
      halt()
      measure()
      paint()
      update()
    }

    /*
     * THE PHOTOS (landing round 9, "images optimized so they don't lag"). They
     * are lazy in the markup. Left to the browser, each one was fetched and
     * decoded as its card drifted or was thrown into view: a hitch per card,
     * and empty cards on a fast swipe. Now, from a screen before the rail
     * arrives, they are fetched and decoded two at a time, off the main
     * thread, so by the time a finger is on the rail every card is a decoded
     * picture. The second copy of the cards is the same files.
     */
    /*
     * LANDING ROUND 11 (the owner: "make sure the images are smooth and clean,
     * don't glitch or take too long to load"): decoding starts two screens
     * ahead (CREATORS_PRELOAD), three at a time, and a card's photo (and its
     * copy's, the same file) is shown only once it is decoded, easing in
     * (data-shown, the stylesheet) over the card's own ground: never half
     * drawn, never a pop. One already there when the script came is shown at
     * once.
     */
    const all = [...track.querySelectorAll<HTMLImageElement>("img")]
    const show = (img: HTMLImageElement, now: boolean) => {
      for (const twin of all) if (twin === img || twin.getAttribute("src") === img.getAttribute("src")) if (!twin.hasAttribute("data-shown")) twin.setAttribute("data-shown", now ? "now" : "")
    }
    const pending: HTMLImageElement[] = []
    for (const img of track.querySelectorAll<HTMLImageElement>("li:not([aria-hidden]) img")) {
      if (img.complete && img.naturalWidth > 0) show(img, true)
      else pending.push(img)
    }
    track.dataset.ccReady = ""
    const next = (): void => {
      const img = pending.shift()
      if (!img) return
      img.loading = "eager"
      const done = () => {
        /* Landing round 12 (perf): decoded while the rail is still off screen, it is simply there; the ease in is for a photo that arrives in sight (the audit found 34 to 48 of these fades running two screens away). */
        show(img, !visible)
        next()
      }
      if (typeof img.decode === "function") img.decode().then(done, done)
      else if (img.complete) done()
      else img.addEventListener("load", done, { once: true })
    }
    let warmed = false
    const near =
      typeof IntersectionObserver === "function"
        ? new IntersectionObserver(
            (entries) => {
              if (warmed || !entries.some((e) => e.isIntersecting)) return
              warmed = true
              for (let i = 0; i < CREATORS_PRELOAD.parallel; i++) next()
            },
            { rootMargin: `${CREATORS_PRELOAD.marginPx}px 0px` },
          )
        : null
    if (!near) for (let i = 0; i < CREATORS_PRELOAD.parallel; i++) next()
    near?.observe(section)

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
    viewport.addEventListener("keydown", onKey)
    viewport.addEventListener("focusin", onFocus)
    viewport.addEventListener("focusout", onBlur)
    document.addEventListener("visibilitychange", resume)
    reduce.addEventListener("change", sync)
    /* Wave 13 perf: the first measure comes from the ResizeObserver's first report, after the browser has laid the rail out, not as the section mounts (a forced layout of the page). */
    if (!ro) sync()
    return () => {
      cancelAnimationFrame(paintFrame)
      clearTimeout(holdTimer)
      motion?.anim.cancel()
      io?.disconnect()
      ro?.disconnect()
      viewport.removeEventListener("pointerenter", onEnter)
      viewport.removeEventListener("pointerleave", onLeave)
      gesture.destroy()
      near?.disconnect()
      pending.length = 0
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
      {/* A header, not a div: the page's 1400px column rule for a section's divs does not reach it, so it takes the shared home width (landing round 7). */}
      <header className="cc-head">
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
      </header>

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
    </section>
  )
}

export const CREATORS_CSS = `
.cc-section{--cc-bg:#fff;--cc-ink:#18181b;--cc-muted:#6b6b76;--cc-photo:#ecebf0;--cc-w:clamp(236px,66vw,268px);--cc-gap:14px;--cc-gutter:var(--home-edge,clamp(20px,5.15vw,84px));--cc-ease:cubic-bezier(.22,1,.36,1);position:relative;background:var(--cc-bg);color:var(--cc-ink);overflow:clip;padding-block:clamp(64px,8vw,120px)}
.cc-section[data-tone="dark"]{--cc-bg:#0b0b0c;--cc-ink:#fafafa;--cc-muted:#a1a1aa;--cc-photo:#1a1a1d;border-radius:clamp(28px,4vw,56px)}
@media(min-width:768px){.cc-section{--cc-w:clamp(240px,21vw,296px);--cc-gap:20px}}
/* Landing round 7: the shared home width (globals.css, --home-max and --home-edge), the heading set in by --home-head-inset like the showcase's. */
.cc-section .cc-head{width:100%;max-width:var(--home-max,2020px);margin-inline:auto;padding-inline:calc(var(--cc-gutter) + var(--home-head-inset,14px));box-sizing:border-box}
.cc-head{display:grid;gap:28px;align-items:end;justify-items:start}
@media(min-width:1024px){.cc-head{grid-template-columns:minmax(0,1fr) auto;gap:56px}}
.cc-head .story-heading{font-size:clamp(36px,5vw,72px);max-width:15ch}

/* Landing round 4 (the owner: "don't make the button solid purple"): the one call to action is a calm white pill on a hairline, its arrow in a small violet disc that leads the eye; on hover the disc nudges and the pill takes the faintest violet tint. */
.cc-cta{display:inline-flex;align-items:center;gap:12px;height:52px;padding:0 8px 0 24px;border-radius:999px;background:#fff;color:#18181b;font-size:15.5px;font-weight:600;letter-spacing:-.01em;text-decoration:none;white-space:nowrap;box-shadow:inset 0 0 0 1px rgba(24,24,27,.12),0 1px 2px rgba(24,24,27,.06),0 8px 24px -14px rgba(76,29,149,.35);transition:background-color 200ms ease,box-shadow 200ms ease,transform 200ms var(--cc-ease)}
.cc-cta-ic{display:grid;place-items:center;width:36px;height:36px;border-radius:50%;background:#7c3aed;color:#fff}
.cc-cta-ic svg{transition:transform 300ms var(--cc-ease)}
.cc-cta:hover{background:#faf8ff;box-shadow:inset 0 0 0 1px rgba(124,58,237,.28),0 1px 2px rgba(24,24,27,.06),0 10px 28px -14px rgba(76,29,149,.45)}
.cc-cta:hover .cc-cta-ic svg{transform:translate3d(2px,0,0)}
.cc-cta:active{transform:scale(.98)}
.cc-cta:focus-visible,.cc-viewport:focus-visible{outline:2px solid #7c3aed;outline-offset:3px}
@media(min-width:1024px){.cc-cta{margin-bottom:10px}}

[data-landing-story] [data-story-section="creators"] > .cc-viewport{max-width:none;padding-inline:0}
.cc-viewport{position:relative;margin-top:clamp(36px,5vw,60px);overflow:hidden;touch-action:pan-y;cursor:grab;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;outline-offset:-4px}
/* Landing round 8, the owner: "full width, not with a fade". The rail runs from one edge of the screen to the other at every width, with no mask; at rest its first card starts on the content edge (the showcase cards' edge, the shared box's gutter). */
.cc-section{--cc-start:max(var(--cc-gutter),calc((100% - var(--home-max,2020px)) / 2 + var(--cc-gutter)))}
.cc-viewport[data-dragging]{cursor:grabbing}
.cc-track{display:flex;gap:var(--cc-gap);width:max-content;margin:0;padding:10px var(--cc-start) 8px;list-style:none;backface-visibility:hidden}
.cc-card{flex:none;width:var(--cc-w);margin:0;padding:0}
/* The card as it was before the product tiles: the photo, and on a soft shade at its foot the creator's name, their kind and what they sell. It stays still under the pointer. */
.cc-photo{position:relative;display:block;overflow:hidden;aspect-ratio:4/5;border-radius:23px;background:var(--cc-photo);isolation:isolate}
.cc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;pointer-events:none}
/* Landing round 11: once the script is there, a photo waits for its decode, then eases in (opacity and a 2.5% zoom settling, inside the card's clip) over the card's ground. */
.cc-track[data-cc-ready] .cc-img{opacity:0;transform:scale(1.025);transition:opacity 620ms cubic-bezier(.33,0,.2,1),transform 1100ms cubic-bezier(.22,1,.36,1)}
.cc-track[data-cc-ready] .cc-img[data-shown]{opacity:1;transform:none}
.cc-track[data-cc-ready] .cc-img[data-shown="now"]{transition:none}
.cc-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(8,8,10,.72),rgba(8,8,10,.28) 34%,rgba(8,8,10,0) 58%);pointer-events:none}
/* Landing round 9, the owner: "all the card images should have a very subtle cinematic grain". One 192px tile of fine noise (16KB) for every card, drawn at 96px over the photo and under the shade and the words: black and white specks a few percent strong. A still picture in the card's own layer: no filter, no blend mode, nothing per frame. */
.cc-photo::after{content:"";position:absolute;inset:0;background:url(/home/creators/grain.webp) 0 0/96px 96px;opacity:.55;pointer-events:none}
.cc-shade,.cc-meta{z-index:1}
/* On a phone the rail needs only the first five of the second copy to loop (five cards are wider than any phone): a third less to draw and keep. */
@media(max-width:767px){.cc-card[aria-hidden="true"]:nth-child(n+18){display:none}}
.cc-meta{position:absolute;left:20px;right:20px;bottom:18px;display:grid;gap:3px;color:#fff}
.cc-who{font-size:12px;font-weight:500;opacity:.72;letter-spacing:.01em}
.cc-kind{font-size:clamp(22px,1.9vw,26px);font-weight:500;letter-spacing:-.035em;line-height:1.1}
.cc-sells{font-size:13.5px;line-height:1.35;opacity:.86}

/* Reduced motion: the same cards, standing still in a grid. */
@media(prefers-reduced-motion:reduce){
  .cc-viewport{cursor:auto;touch-action:auto}
  .cc-track{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));width:auto;max-width:none;margin-inline:auto;transform:none!important;will-change:auto;box-sizing:border-box}
  @media(min-width:768px){.cc-track{grid-template-columns:repeat(auto-fill,minmax(220px,1fr))}}
  @media(min-width:1180px){.cc-track{grid-template-columns:repeat(4,1fr)}}
  .cc-card{width:auto}
  .cc-card[aria-hidden="true"]{display:none}
  .cc-track[data-cc-ready] .cc-img{opacity:1;transform:none;transition:none}
  .cc-cta,.cc-cta-ic svg{transition:none!important;transform:none!important}
  .cc-meta{left:14px;right:14px;bottom:14px}
  .cc-kind{font-size:clamp(18px,4.6vw,24px)}
  .cc-sells{font-size:12.5px}
}
`

/** This section's stylesheet: put in place while idle, before it mounts (lazy-section.tsx, SectionStyle). */
export const CREATORS_STYLES: readonly SectionStyle[] = [{ href: "w12-creators-carousel", precedence: "w12-section", css: CREATORS_CSS }]
