"use client"

/**
 * ===========================================================================
 *  THE HEART (round 10, its burst round 11)
 * ===========================================================================
 * A like's icon, a little bigger than the other icons in a post's footer.
 * Two hearts in one box: the outline always, and a filled one over it that
 * grows into it on a like (a short overshoot, then rest) and fades away on
 * an unlike. The icon itself gives one small beat when it fills. Only the
 * icon moves, never the button around it, and only by scale and opacity on
 * the compositor; the count beside it stays where it is.
 *
 * THE BURST (round 11). A like also sends eight tiny hearts out from the
 * icon, in the like's own red, each on its own line a little off an even
 * ring, rising and shrinking as they fade: translate, scale, rotate and opacity
 * only (the compositor's), every
 * one gone within BURST_MS, and taken out of the page when done. One burst
 * per like (a like pressed again while one is in the air replaces it). An
 * unlike is only the quiet un-fill: the filled heart fades as it settles a
 * little smaller, nothing thrown, no beat. Nothing moves with reduced motion.
 *
 * Nothing moves on the first draw or when a post is read again with the
 * same answer: only a change of `on` while drawn beats.
 */
import { Heart } from "lucide-react"
import { useEffect, useLayoutEffect, useRef, useState } from "react"

const BEAT_MS = 460
const FILL_MS = 400
const UNFILL_MS = 240
export const BURST_MS = 560
export const BURST_COUNT = 14
/** The like's own red, set on the tiny hearts rather than taken from the button, whose colour is still settling when they leave. */
const BURST_COLOR = "#c4290c"

/** The small heart a burst throws, as one path (lucide's heart, filled). */
const HEART_PATH = "M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"

export interface BurstPath {
  x: number
  y: number
  s: number
  r: number
  delay: number
}

/**
 * Where each tiny heart goes: evenly round the icon with a small turn and
 * reach of its own (fixed, so every burst looks the same), drifting up a
 * little as it fades, as a like feels.
 */
export function burstPaths(size: number, count = BURST_COUNT): BurstPath[] {
  const out: BurstPath[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2 + (i % 2 ? 0.18 : -0.12)
    const reach = size * (i % 3 === 0 ? 1.0 : i % 3 === 1 ? 0.86 : 1.12)
    out.push({
      x: Math.cos(a) * reach,
      y: Math.sin(a) * reach - size * 0.14,
      s: i % 3 === 0 ? 0.7 : i % 3 === 1 ? 0.92 : 1.08,
      r: (i % 2 ? 1 : -1) * (8 + (i % 4) * 5),
      delay: (i % 5) * 10,
    })
  }
  return out
}

/*
  A TINY HEART IS AN HTML BOX, NOT AN SVG. Chrome will not run an animation
  of an <svg> element on the compositor (measured: compositeFailed on the
  svg, none on a box), so each one is a small box in the like's red, cut to
  the heart's shape by a mask drawn once.
*/
const HEART_MASK = `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${HEART_PATH}"/></svg>`)}") center / contain no-repeat`
const particleStyle = (dot: number) =>
  `position:absolute;left:${-dot / 2}px;top:${-dot / 2}px;width:${dot}px;height:${dot}px;background:${BURST_COLOR};-webkit-mask:${HEART_MASK};mask:${HEART_MASK};opacity:0`

/* The burst in the air for each heart, so a like pressed again (or an unlike) takes it away. */
const flying = new WeakMap<HTMLElement, HTMLElement>()

function clearBurst(host: HTMLElement) {
  flying.get(host)?.remove()
  flying.delete(host)
}

/*
  CHEAP ON THE PRESS. The burst is made on the frame after the press (the
  fill has already been drawn), in one small layer of its own fixed over
  the heart at the end of the page, so making it restyles those few new
  nodes and nothing of the post around it (a layer inside the card restyled
  the whole card, about 25ms a like at 4x CPU, measured). It is parsed in one
  go, then each tiny heart is given its run.
*/
function burst(host: HTMLElement, size: number) {
  clearBurst(host)
  const r = host.getBoundingClientRect()
  if (!r.width) return
  const layer = document.createElement("span")
  layer.setAttribute("data-heart-burst", "")
  layer.setAttribute("aria-hidden", "true")
  layer.style.cssText = `position:fixed;left:${(r.left + r.width / 2).toFixed(1)}px;top:${(r.top + r.height / 2).toFixed(1)}px;width:0;height:0;pointer-events:none;z-index:2147483000;contain:layout style`
  const dot = Math.max(5, Math.round(size * 0.34))
  const paths = burstPaths(size)
  layer.innerHTML = paths.map(() => `<i data-heart-particle="" style="${particleStyle(dot)}"></i>`).join("")
  const runs: Animation[] = []
  paths.forEach((p, i) => {
    const el = layer.children[i] as HTMLElement
    /* Out fast, a short float at full strength, then a soft fade as it drifts up: easing per stretch, the whole run linear. */
    const at = (k: number, lift = 0) => `${(p.x * k).toFixed(1)}px ${(p.y * k - lift).toFixed(1)}px`
    runs.push(
      el.animate(
        [
          { translate: at(0), scale: `${0.2 * p.s}`, rotate: "0deg", opacity: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.35), scale: `${0.72 * p.s}`, rotate: `${p.r * 0.25}deg`, opacity: 0.85, offset: 0.18, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.62), scale: `${1.08 * p.s}`, rotate: `${p.r * 0.5}deg`, opacity: 1, offset: 0.38, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.82, size * 0.04), scale: `${p.s}`, rotate: `${p.r * 0.72}deg`, opacity: 1, offset: 0.58, easing: "ease-out" },
          { translate: at(1, size * 0.22), scale: `${0.28 * p.s}`, rotate: `${p.r}deg`, opacity: 0, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
        ],
        { duration: BURST_MS - p.delay, delay: p.delay, easing: "linear", fill: "both" },
      ),
    )
  })
  document.body.appendChild(layer)
  flying.set(host, layer)
  const gone = () => {
    layer.remove()
    if (flying.get(host) === layer) flying.delete(host)
  }
  let left = runs.length
  for (const a of runs) {
    a.onfinish = () => {
      if (--left <= 0) gone()
    }
    a.oncancel = a.onfinish
  }
  /* A net under it: whatever happens to the animations, nothing is left in the page. */
  window.setTimeout(gone, BURST_MS + 120)
}

/**
 * The button around it carries `group/like` and aria-pressed: the fill follows
 * that one attribute (no class or attribute of its own changes on a press,
 * so a press restyles the button and nothing else). `on` only starts the
 * beat, the fill's grow and the burst. The fill's own transition is there
 * only for the way out (the un-fill); the way in is the grow, so the two
 * never fight.
 */
export function LikeHeart({ on, size = 20, strokeWidth = 1.75 }: { on: boolean; size?: number; strokeWidth?: number }) {
  const box = useRef<HTMLSpanElement>(null)
  const was = useRef(on)
  useLayoutEffect(() => {
    if (was.current === on) return
    was.current = on
    const el = box.current
    if (!el) return
    const fill = el.querySelector<HTMLElement | SVGElement>("[data-heart-fill]")
    if (!on) {
      clearBurst(el)
      if (typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
      fill?.animate([{ scale: "1", opacity: 1 }, { scale: "0.82", opacity: 0 }], { duration: UNFILL_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" })
      return
    }
    if (typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
    el.animate(
      [{ scale: "1" }, { scale: "1.22", offset: 0.28 }, { scale: "0.94", offset: 0.62 }, { scale: "1.02", offset: 0.82 }, { scale: "1" }],
      { duration: BEAT_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
    fill?.animate(
      [
        { scale: "0.28", opacity: 0 },
        { scale: "0.92", opacity: 0.55, offset: 0.35 },
        { scale: "1.12", opacity: 1, offset: 0.68 },
        { scale: "1", opacity: 1 },
      ],
      { duration: FILL_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    )
    const frame = requestAnimationFrame(() => burst(el, size))
    return () => cancelAnimationFrame(frame)
  }, [on, size])
  return (
    <span ref={box} className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden data-heart="">
      <Heart className="absolute inset-0 h-full w-full" strokeWidth={strokeWidth} />
      <Heart
        className="absolute inset-0 h-full w-full scale-[0.82] fill-current opacity-0 transition-[scale,opacity] duration-[260ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-aria-pressed/like:scale-100 group-aria-pressed/like:opacity-100 group-aria-pressed/like:transition-none motion-reduce:transition-none"
        strokeWidth={strokeWidth}
        data-heart-fill=""
      />
    </span>
  )
}

/**
 * ===========================================================================
 *  THE LIKE'S SOUND (round 12)
 * ===========================================================================
 * A like plays a tiny sound made on the spot with Web Audio (no file to
 * load): a soft rising "pop" a little under a fifth of a second long, very
 * quiet; an unlike is a lower, softer, shorter falling one. One sound per
 * press, made in the press itself (a browser lets a page start audio only
 * from a press). Never when the page is hidden, never with reduced motion
 * (a person who asked for a calmer screen gets a quieter one too), and
 * never when the member has turned Sounds off: a switch kept in this
 * browser (SOUNDS_KEY), on unless turned off. SoundsSwitch below is that
 * switch, for any settings list to show.
 */
export const SOUNDS_KEY = "storelib:sounds"
const SOUNDS_EVENT = "storelib:sounds-change"

export function soundsOn(): boolean {
  try {
    return window.localStorage.getItem(SOUNDS_KEY) !== "off"
  } catch {
    return true
  }
}

export function setSoundsOn(on: boolean) {
  try {
    if (on) window.localStorage.removeItem(SOUNDS_KEY)
    else window.localStorage.setItem(SOUNDS_KEY, "off")
  } catch {
    /* Private mode: the switch lasts for this page. */
  }
  window.dispatchEvent(new CustomEvent(SOUNDS_EVENT, { detail: { on } }))
}

let audio: AudioContext | null = null

/** The page's one audio context, when a sound may play now (SOUNDS above); null when it may not. */
function soundContext(): AudioContext | null {
  if (typeof window === "undefined" || typeof document === "undefined") return null
  if (document.visibilityState !== "visible" || !soundsOn() || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return null
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  try {
    audio ??= new Ctx()
    if (audio.state === "suspended") void audio.resume()
    return audio
  } catch {
    return null
  }
}

/**
 * ===========================================================================
 *  A COMMENT SENT, A POST SENT (round 13)
 * ===========================================================================
 * The same switch, the same rules, the same quiet: a comment sent is a soft
 * two note "tick" (a little under a tenth of a second, lower than a like);
 * a post sent is a short, soft "whoosh": filtered noise whose band sweeps
 * up and fades over about a third of a second, very quiet. Both are made on
 * the spot (no file), in the press itself.
 */
export function commentSound(): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    const t = ctx.currentTime + 0.004
    const note = (freq: number, at: number, peak: number, length: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(freq, at)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.006)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + length + 0.02)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    }
    note(587, t, 0.03, 0.07)
    note(880, t + 0.045, 0.024, 0.09)
    return true
  } catch {
    return false
  }
}

/** Made ready in a press, for a sound played a moment later (a post's whoosh once the server has it): a browser starts audio only from a press. */
export function primeSounds(): void {
  soundContext()
}

/** A soft tap when Post is pressed, before the network answers. */
export function postPressSound(): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    const t = ctx.currentTime + 0.002
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "triangle"
    osc.frequency.setValueAtTime(420, t)
    osc.frequency.exponentialRampToValueAtTime(680, t + 0.07)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.028, t + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
    }
    return true
  } catch {
    return false
  }
}

/** The post's whoosh: noise through a band that sweeps up, with a soft chime when it lands. */
export function postSound(): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    const length = 0.34
    const t = ctx.currentTime + 0.003
    const frames = Math.ceil(ctx.sampleRate * length)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
    const noise = ctx.createBufferSource()
    noise.buffer = buffer
    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.Q.setValueAtTime(0.85, t)
    band.frequency.setValueAtTime(480, t)
    band.frequency.exponentialRampToValueAtTime(2400, t + length * 0.68)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.044, t + length * 0.22)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + length)
    const chime = ctx.createOscillator()
    const chimeGain = ctx.createGain()
    chime.type = "sine"
    chime.frequency.setValueAtTime(880, t + length * 0.42)
    chimeGain.gain.setValueAtTime(0.0001, t + length * 0.42)
    chimeGain.gain.exponentialRampToValueAtTime(0.018, t + length * 0.5)
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, t + length * 0.92)
    noise.connect(band)
    band.connect(gain)
    chime.connect(chimeGain)
    gain.connect(ctx.destination)
    chimeGain.connect(ctx.destination)
    noise.start(t)
    chime.start(t + length * 0.42)
    noise.stop(t + length + 0.02)
    chime.stop(t + length + 0.02)
    noise.onended = () => {
      noise.disconnect()
      band.disconnect()
      gain.disconnect()
      chime.disconnect()
      chimeGain.disconnect()
    }
    return true
  } catch {
    return false
  }
}

/** The like's sound, or the unlike's. Answers whether one was played. */
export function likeSound(on: boolean): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    const t = ctx.currentTime + 0.004
    const tone = (from: number, to: number, peak: number, length: number, at = t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.setValueAtTime(from, at)
      osc.frequency.exponentialRampToValueAtTime(to, at + length * 0.55)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + length + 0.02)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    }
    if (on) {
      tone(392, 587, 0.048, 0.16)
      tone(659, 988, 0.038, 0.13, t + 0.012)
      tone(1046, 1318, 0.022, 0.1, t + 0.024)
    } else {
      tone(440, 349, 0.022, 0.1)
      tone(262, 196, 0.012, 0.08, t + 0.05)
    }
    return true
  } catch {
    return false
  }
}

/** What the Sounds switch says it covers. */
export const SOUNDS_DETAIL = "Likes, comments and posts"

/** The Sounds switch's state, kept in step with every other switch on the page (and with another tab's change on its next read). */
export function useSounds(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true)
  useEffect(() => {
    setOn(soundsOn())
    const sync = (e: Event) => setOn((e as CustomEvent<{ on: boolean }>).detail?.on ?? soundsOn())
    const storage = (e: StorageEvent) => {
      if (e.key === SOUNDS_KEY) setOn(soundsOn())
    }
    window.addEventListener(SOUNDS_EVENT, sync)
    window.addEventListener("storage", storage)
    return () => {
      window.removeEventListener(SOUNDS_EVENT, sync)
      window.removeEventListener("storage", storage)
    }
  }, [])
  return [on, setSoundsOn]
}

/** The Sounds switch, for a settings list: "Sounds", on by default, kept in this browser. */
export function SoundsSwitch({ className = "" }: { className?: string }) {
  const [on] = useSounds()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setSoundsOn(!on)}
      className={`flex min-h-11 w-full items-center gap-3 rounded-[10px] px-3 text-left outline-none transition-colors hover:bg-[#f6f7f8] focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/15 [-webkit-tap-highlight-color:transparent] ${className}`}
      data-sounds-switch={on ? "on" : "off"}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14.5px] font-medium text-[#1a1a2e]">Sounds</span>
        <span className="block text-[12.5px] text-[#6b7280]">{SOUNDS_DETAIL}</span>
      </span>
      <span className={`relative h-6 w-10 shrink-0 rounded-full transition-colors duration-200 motion-reduce:transition-none ${on ? "bg-[#1a1a2e]" : "bg-[#d9dce1]"}`} aria-hidden>
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(16,24,40,0.2)] transition-[translate] duration-200 ease-out motion-reduce:transition-none ${on ? "translate-x-4" : "translate-x-0"}`} />
      </span>
    </button>
  )
}
