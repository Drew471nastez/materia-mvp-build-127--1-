"use client"

import { useEffect, useRef, type CSSProperties } from "react"
import { StoryHeading } from "./story-heading"

type Item = { label: string; photo: string }

/*
  WHAT CREATORS SELL, IN TWO ROWS (landing round, the owner: "keep only 2
  rows, not 3"). Edge to edge, one moving left and one right. Communities,
  never Memberships: memberships were folded into communities
  (tests/memberships-folded). Mostly digital, a few things that ship (round 11).

  Landing round 7, the owner: no more pills. Each thing is a photograph on a
  rounded square, tilted a few degrees (every third one turned into a
  diamond), and its name in large dark type beside it, the rows drifting in
  opposite directions and fading to white at both sides. The photos are from
  Unsplash (free licence), cropped square, 256px WebP under
  public/home/possibilities.

  Landing round 9, the owner:
    smaller  "the texts and icons are too big; reduce them a little, not
             much": the photos, the words and the room between them are
             about an eighth smaller.
    hover    "on hover over the images there should be something smooth
             going on around them": under a mouse a photo straightens (a
             diamond turns square, its picture staying upright), lifts a
             few pixels and two thin rings open round it, the outer one a
             beat later, while its row glides to a stop. Only transform and
             opacity move; nothing is transitioned on a phone.
    photos   tote bags, online courses, presets, vinyl records, communities
             and templates were too plain (a blank bag, a hand ticking a
             list). New ones from Pexels (free licence), each showing the
             thing: printed totes on a rack, a lesson on a laptop, colour
             scopes on a screen, a record on a deck, friends out together,
             site layouts on a monitor.

  Landing round 11, the owner: "don't add ceramics, or totes or whatever;
  add more digital products like before", and photos that clearly show the
  thing rather than stock moods. The list leans digital again, as it did
  before round 4 (presets, sample packs, ebooks, LUTs, fonts, Procreate
  brushes, stock footage, music, templates, podcasts, courses, coaching,
  communities), with three things that ship (merch, art prints, hoodies)
  and tickets. Candles, ceramics, jewelry, totes and vinyl are gone. New
  photos from Unsplash (free licence), each the thing itself: Lightroom's
  Develop panel, a lit pad controller, a Kindle in hand, a colour graded
  timeline, a letterpress type case, a painting on an iPad with a pencil,
  a cinema camera, a recording studio. Still never "Memberships"
  (tests/memberships-folded: memberships live inside communities).
*/
const ROW_1: Item[] = [
  { label: "Presets", photo: "presets" },
  { label: "Online courses", photo: "courses" },
  { label: "Merch", photo: "merch" },
  { label: "Sample packs", photo: "samples" },
  { label: "Ebooks", photo: "ebooks" },
  { label: "Communities", photo: "communities" },
  { label: "LUTs", photo: "luts" },
  { label: "Coaching", photo: "coaching" },
  { label: "Fonts", photo: "fonts" },
]
const ROW_2: Item[] = [
  { label: "Music", photo: "music" },
  { label: "Templates", photo: "templates" },
  { label: "Art prints", photo: "prints" },
  { label: "Podcasts", photo: "podcasts" },
  { label: "Procreate brushes", photo: "brushes" },
  { label: "Event tickets", photo: "tickets" },
  { label: "Stock footage", photo: "footage" },
  { label: "Hoodies", photo: "hoodies" },
  { label: "Workshops", photo: "workshops" },
]

export const MARQUEE_ROWS = [
  { items: ROW_1, direction: "left", seconds: 96 },
  { items: ROW_2, direction: "right", seconds: 104 },
] as const

/** Each photo's tilt in degrees, in turn along a row; 45 is a diamond. The second row starts further along, so the rows never tilt in step. */
export const MARQUEE_TILTS = [-7, 45, 6, -4, 45, 9, -10, 45, 4] as const

/*
  THE LOOP. Each row is one track holding the same list three times; the
  track slides by exactly one copy (a third of itself) and starts over, so
  the seam is never seen. Each item carries its own right margin instead of
  the track having a gap, so the three copies are the same width to the
  pixel. Three copies, not two: one copy is about 3,800px at its widest,
  near the width of a 4K screen. Only `transform` moves, on the compositor
  (no layout or paint per frame). Both stop off screen and in a background
  tab. With reduced motion the rows stand still: one copy each, wrapped.

  THE FADES are two white layers over each row's ends, standing still, so
  the moving track is never masked or repainted. A row clips sideways only,
  so a photo's shadow and a diamond's corners are never cut along its top
  or bottom; the fades reach past the row by the same room.

  UNDER THE MOUSE a row glides to a stop rather than freezing: its CSS
  animation's playback rate is eased down to zero, and back up when the
  pointer leaves (easeRow below).
*/
const CSS = `
.um{position:relative;background:#fff;color:#18181b;overflow:clip;padding-block:clamp(64px,8vw,120px)}
.um-head{box-sizing:border-box;width:100%;max-width:var(--home-max,2020px);margin:0 auto clamp(30px,3.4vw,52px);padding-inline:calc(var(--home-edge,clamp(20px,5.15vw,84px)) + var(--home-head-inset,14px))}
.um-sub{margin:18px 0 0;max-width:46ch;font-size:clamp(16px,1.4vw,19px);line-height:1.6;color:#6b6874;text-wrap:pretty}
[data-landing-story] [data-story-section] > .um-rows,.um-rows{max-width:none;margin:0;padding:0;display:flex;flex-direction:column;gap:clamp(10px,1.6vw,28px)}
.um-row{--pic:clamp(54px,5.6vw,108px);position:relative;width:100%;overflow:hidden;overflow:clip visible;padding-block:calc(var(--pic) * .1)}
.um-row::before,.um-row::after{content:"";position:absolute;top:-30px;bottom:-30px;z-index:1;width:clamp(44px,13vw,260px);pointer-events:none}
.um-row::before{left:0;background:linear-gradient(90deg,#fff,rgba(255,255,255,.82) 30%,rgba(255,255,255,.4) 64%,rgba(255,255,255,0))}
.um-row::after{right:0;background:linear-gradient(270deg,#fff,rgba(255,255,255,.82) 30%,rgba(255,255,255,.4) 64%,rgba(255,255,255,0))}
.um-track{display:flex;width:max-content;will-change:transform;backface-visibility:hidden;animation:um-left var(--um-s,64s) linear infinite}
.um-row[data-dir="right"] .um-track{animation-name:um-right}
.um-copy{display:flex;align-items:center;margin:0;padding:0;list-style:none;flex:none}
.um-item{flex:none;display:flex;align-items:center;gap:clamp(14px,1.35vw,25px);margin-right:clamp(40px,4.8vw,92px);white-space:nowrap;font-size:clamp(18px,1.75vw,31px);font-weight:500;line-height:1;letter-spacing:-.025em;color:#18181b}
.um-pic{position:relative;flex:none;width:var(--pic);height:var(--pic);border-radius:24%;transform:rotate(var(--tilt,0deg))}
.um-pic[data-diamond]{width:calc(var(--pic) * .84);height:calc(var(--pic) * .84);margin-inline:calc(var(--pic) * .08)}
.um-face{position:absolute;inset:0;border-radius:inherit;overflow:hidden;background:#ecebf0;box-shadow:0 10px 22px -14px rgba(24,24,27,.34)}
.um-pic img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;-webkit-user-drag:none;user-select:none}
.um-pic[data-diamond] img{transform:rotate(-45deg) scale(1.42)}
.um-pic::before,.um-pic::after{content:"";position:absolute;border-radius:27%;border:1px solid rgba(24,24,27,.2);opacity:0;pointer-events:none}
.um-pic::before{inset:-7px;transform:scale(.88)}
.um-pic::after{inset:-15px;border-color:rgba(24,24,27,.09);border-radius:29%;transform:scale(.84)}
@media(hover:hover) and (pointer:fine){
  .um-pic,.um-pic img{transition:transform .6s cubic-bezier(.22,1,.36,1)}
  .um-pic::before,.um-pic::after{transition:opacity .45s ease,transform .7s cubic-bezier(.22,1,.36,1)}
  .um-pic::after{transition-delay:.07s}
  .um-item:hover .um-pic{transform:translate3d(0,-4px,0) rotate(0deg) scale(1.06)}
  .um-item:hover .um-pic[data-diamond] img{transform:rotate(0deg) scale(1.42)}
  .um-item:hover .um-pic::before,.um-item:hover .um-pic::after{opacity:1;transform:scale(1)}
}
.um[data-um-paused] .um-track,[data-story-paused] .um-track{animation-play-state:paused}
@keyframes um-left{from{transform:translate3d(0,0,0)}to{transform:translate3d(calc(-100% / 3),0,0)}}
@keyframes um-right{from{transform:translate3d(calc(-100% / 3),0,0)}to{transform:translate3d(0,0,0)}}
@media(max-width:767px){.um-head{margin-bottom:22px}}
@media(prefers-reduced-motion:reduce){
  .um-track{animation:none;width:auto;will-change:auto;padding-inline:var(--home-edge,20px)}
  .um-copy{flex:1 1 auto;flex-wrap:wrap;justify-content:center;gap:24px 40px}
  .um-copy[aria-hidden]{display:none}
  .um-item{margin:0}
  .um-row::before,.um-row::after{display:none}
  .um-pic,.um-pic img,.um-pic::before,.um-pic::after{transition:none}
}
`

function Row({ items, direction, seconds, shift }: (typeof MARQUEE_ROWS)[number] & { shift: number }) {
  const copy = (k: number) => (
    <ul key={k} className="um-copy" aria-hidden={k > 0 || undefined}>
      {items.map(({ label, photo }, i) => {
        const tilt = MARQUEE_TILTS[(i + shift) % MARQUEE_TILTS.length]
        return (
          <li key={label} className="um-item">
            <span className="um-pic" data-diamond={tilt === 45 ? "" : undefined} style={{ "--tilt": `${tilt}deg` } as CSSProperties}>
              <span className="um-face">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/home/possibilities/${photo}.webp`} alt="" width={256} height={256} decoding="async" fetchPriority="low" draggable={false} />
              </span>
            </span>
            {label}
          </li>
        )
      })}
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

/** "Unlimited possibilities": what creators sell, two edge-to-edge rows of photos and names moving left and right. */
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
      {/* A header, not a div: the page's 1400px column rule for a section's divs does not reach it, so it takes the shared home width. */}
      <header className="um-head">
        <StoryHeading id="um-title" text="Unlimited possibilities" accent={["possibilities"]} />
        <p className="um-sub">Whatever you make, there is a place for it on Storelib. Sell it, book it, teach it or ship it.</p>
      </header>
      <div className="um-rows">
        {MARQUEE_ROWS.map((row, i) => (
          <Row key={i} {...row} shift={i * 4} />
        ))}
      </div>
    </section>
  )
}
