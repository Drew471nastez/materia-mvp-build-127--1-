"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { StoryHeading } from "./story-heading"

type Chip = { label: string; emoji: string }

/*
  WHAT CREATORS SELL, IN THREE ROWS (wave 12, the owner: "Unlimited
  possibilities", edge to edge, three rows, more of them). Communities, never
  Memberships: memberships were folded into communities
  (tests/memberships-folded). Wave 13, the owner: the emoji are back, the
  way the chips looked before wave 12 (an emoji and a word in a white pill).
*/
const ROW_1: Chip[] = [
  { label: "Presets", emoji: "🎛️" },
  { label: "Beats", emoji: "🎹" },
  { label: "Merch", emoji: "🛍️" },
  { label: "Online courses", emoji: "🎓" },
  { label: "Communities", emoji: "👥" },
  { label: "1:1 coaching", emoji: "🤝" },
  { label: "Ebooks", emoji: "📚" },
  { label: "Fonts", emoji: "✏️" },
  { label: "Templates", emoji: "📐" },
  { label: "Notion templates", emoji: "📋" },
  { label: "Photography", emoji: "📸" },
  { label: "Podcasts", emoji: "🎙️" },
]
const ROW_2: Chip[] = [
  { label: "Music", emoji: "🎵" },
  { label: "Software", emoji: "💻" },
  { label: "Workshops", emoji: "🧑‍🏫" },
  { label: "Event tickets", emoji: "🎟️" },
  { label: "Art prints", emoji: "🖼️" },
  { label: "Digital art", emoji: "🎨" },
  { label: "Video tutorials", emoji: "🎥" },
  { label: "Fitness plans", emoji: "🏋️" },
  { label: "Game assets", emoji: "🎮" },
  { label: "Plugins", emoji: "🧩" },
  { label: "Spreadsheets", emoji: "📊" },
  { label: "Worksheets", emoji: "📄" },
  { label: "Procreate brushes", emoji: "🖌️" },
]
const ROW_3: Chip[] = [
  { label: "Sample packs", emoji: "🥁" },
  { label: "3D models", emoji: "🧊" },
  { label: "Recipes", emoji: "🍳" },
  { label: "Travel guides", emoji: "🗺️" },
  { label: "Bookings", emoji: "📅" },
  { label: "Newsletters", emoji: "📬" },
  { label: "Stock footage", emoji: "🎬" },
  { label: "Color palettes", emoji: "🌈" },
  { label: "Icon packs", emoji: "💠" },
  { label: "Sewing patterns", emoji: "🧵" },
  { label: "Language lessons", emoji: "🗣️" },
  { label: "Design assets", emoji: "✨" },
  { label: "Link-in-bio", emoji: "🔗" },
]

export const MARQUEE_ROWS = [
  { items: ROW_1, direction: "left", seconds: 64 },
  { items: ROW_2, direction: "right", seconds: 72 },
  { items: ROW_3, direction: "left", seconds: 60 },
] as const

/*
  THE LOOP. Each row is one track holding the same list three times; the
  track slides by exactly one copy (a third of itself) and starts over, so
  the seam is never seen. Each chip carries its own right margin instead of
  the track having a gap, so the three copies are the same width to the
  pixel. Three copies, not two: the two still on screen at the end of a lap
  are over 4,000px, wider than any screen. Only `transform` moves, on the
  compositor (no layout or paint per frame). All three stop off screen and
  in a background tab. With reduced motion the rows stand still: one copy
  each, wrapped and centred.

  UNDER THE MOUSE (wave 13, the owner: no purple fade on hover, a smooth
  clean response instead). The chip under the pointer lifts and grows a
  little, its shadow fading in from a layer of its own (opacity only, so
  nothing repaints), and its row glides to a stop rather than freezing: the
  row's own CSS animation has its playback rate eased down to zero, and back
  up when the pointer leaves (easeRow below). Touch screens get a small
  press instead of a sticky hover.
*/
const CSS = `
.um{position:relative;background:#fff;color:#18181b;overflow:clip;padding-block:clamp(64px,8vw,120px)}
.um-head{max-width:1400px;margin:0 auto clamp(36px,4vw,56px);padding-inline:clamp(22px,6vw,96px);text-align:center}
.um-head .story-heading{margin-inline:auto}
.um-sub{margin:20px auto 0;max-width:46ch;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#6b6874;text-wrap:pretty}
[data-landing-story] [data-story-section] > .um-rows,.um-rows{max-width:none;margin:0;padding:0;display:flex;flex-direction:column;gap:clamp(4px,.6vw,8px)}
.um-row{position:relative;width:100%;overflow:hidden;padding-block:8px 12px}
.um-track{display:flex;width:max-content;will-change:transform;backface-visibility:hidden;animation:um-left var(--um-s,64s) linear infinite}
.um-row[data-dir="right"] .um-track{animation-name:um-right}
.um-copy{display:flex;margin:0;padding:0;list-style:none;flex:none}
.um-chip{position:relative;flex:none;display:inline-flex;align-items:center;gap:9px;height:48px;margin-right:12px;padding:0 22px 0 18px;border-radius:999px;background:#fff;border:1.5px solid #e5e5e5;box-shadow:0 1px 2px rgba(0,0,0,.05);white-space:nowrap;font-size:15.5px;font-weight:500;letter-spacing:-.005em;color:#404040;cursor:default;transform:translate3d(0,0,0);transition:transform .55s cubic-bezier(.22,1,.36,1)}
.um-chip::after{content:"";position:absolute;inset:-1.5px;border-radius:inherit;box-shadow:0 14px 28px -14px rgba(24,24,27,.32),0 2px 6px rgba(24,24,27,.06);opacity:0;transition:opacity .45s ease;pointer-events:none}
.um-emoji{font-size:18px;line-height:1;font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif}
@media(hover:hover) and (pointer:fine){
  .um-chip:hover{z-index:1;transform:translate3d(0,-3px,0) scale(1.06);color:#18181b}
  .um-chip:hover::after{opacity:1}
}
@media(hover:none){.um-chip:active{transform:scale(.96);transition-duration:.2s}}
.um[data-um-paused] .um-track,[data-story-paused] .um-track{animation-play-state:paused}
@keyframes um-left{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-100% / 3),0,0)}}
@keyframes um-right{from{transform:translate3d(calc(-100% / 3),0,0)}to{transform:translate3d(0,0,0)}}
@media(max-width:767px){
  .um-chip{height:42px;gap:7px;margin-right:10px;padding:0 17px 0 14px;font-size:14px}
  .um-emoji{font-size:16px}
}
@media(prefers-reduced-motion:reduce){
  .um-track{animation:none;width:auto;will-change:auto;padding-inline:clamp(16px,4vw,48px)}
  .um-copy{flex:1 1 auto;flex-wrap:wrap;justify-content:center;gap:10px}
  .um-copy[aria-hidden]{display:none}
  .um-chip{margin:0;transition:none}
  .um-chip::after{transition:none}
}
`

function Row({ items, direction, seconds }: (typeof MARQUEE_ROWS)[number]) {
  const copy = (k: number) => (
    <ul key={k} className="um-copy" aria-hidden={k > 0 || undefined}>
      {items.map(({ label, emoji }) => (
        <li key={label} className="um-chip">
          <span className="um-emoji" aria-hidden="true">
            {emoji}
          </span>
          {label}
        </li>
      ))}
    </ul>
  )
  return (
    <div className="um-row" data-dir={direction}>
      <div className="um-track" data-story-continuous="" style={{ "--um-s": `${seconds}s` } as CSSProperties}>
        {[0, 1, 2].map(copy)}
      </div>
    </div>
  )
}

/**
 * Eases a row's loop to a new speed (0 stopped, 1 full) over `ms`, by the
 * playback rate of its CSS animation: the motion stays on the compositor and
 * only a handful of rate changes are sent while it eases. Returns a cancel.
 */
function easeRow(track: HTMLElement, to: number, ms: number): () => void {
  const anim = typeof track.getAnimations === "function" ? track.getAnimations()[0] : undefined
  if (!anim) return () => {}
  const from = anim.playbackRate
  const t0 = performance.now()
  let frame = 0
  const set = (rate: number) => {
    /* Never exactly zero: a zero rate would hold the animation's time and could not be eased out of on every engine. */
    const r = Math.max(0.0001, rate)
    if (typeof anim.updatePlaybackRate === "function") anim.updatePlaybackRate(r)
    else anim.playbackRate = r
  }
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms)
    const eased = 1 - Math.pow(1 - p, 3)
    set(from + (to - from) * eased)
    if (p < 1) frame = requestAnimationFrame(step)
  }
  frame = requestAnimationFrame(step)
  return () => cancelAnimationFrame(frame)
}

/** "Unlimited possibilities": what creators sell, three edge-to-edge rows moving left, right, left. */
export function ProductMarquee() {
  const ref = useRef<HTMLElement>(null)
  /* Off screen or in a background tab the rows stop, on /pricing too, where no LandingStory watches them. */
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver !== "function") return
    let visible = true
    const sync = () => el.toggleAttribute("data-um-paused", !visible || document.hidden)
    const io = new IntersectionObserver(
      ([e]) => {
        visible = e.isIntersecting
        sync()
      },
      { rootMargin: "120px 0px" },
    )
    io.observe(el)
    document.addEventListener("visibilitychange", sync)
    return () => {
      io.disconnect()
      document.removeEventListener("visibilitychange", sync)
    }
  }, [])

  /* A mouse over a row glides it to a stop; leaving lets it pick its speed back up. */
  useEffect(() => {
    const el = ref.current
    if (!el || typeof window.matchMedia !== "function" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return
    const offs: Array<() => void> = []
    for (const row of el.querySelectorAll<HTMLElement>(".um-row")) {
      const track = row.querySelector<HTMLElement>(".um-track")
      if (!track) continue
      let cancel = () => {}
      const enter = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return
        cancel()
        cancel = easeRow(track, 0, 700)
      }
      const leave = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") return
        cancel()
        cancel = easeRow(track, 1, 900)
      }
      row.addEventListener("pointerenter", enter)
      row.addEventListener("pointerleave", leave)
      offs.push(() => {
        cancel()
        row.removeEventListener("pointerenter", enter)
        row.removeEventListener("pointerleave", leave)
      })
    }
    return () => offs.forEach((off) => off())
  }, [])

  return (
    <section ref={ref} data-story-section="categories" className="um" aria-labelledby="um-title" data-unlimited="">
      <style>{CSS}</style>
      <div className="um-head">
        <StoryHeading id="um-title" text="Unlimited possibilities" accent={["possibilities"]} />
        <p className="um-sub">Whatever you make, there is a place for it on Storelib. Sell it, book it, teach it or ship it.</p>
      </div>
      <div className="um-rows">
        {MARQUEE_ROWS.map((row, i) => (
          <Row key={i} {...row} />
        ))}
      </div>
    </section>
  )
}
