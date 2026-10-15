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
 * THE BURST (round 11, a confetti in round 15, quieter since). A like sends a
 * soft ring out from the icon, a few small hearts in two waves (in the like's
 * red and a pink) and a few sparks with them, each a little off an even ring,
 * rising and shrinking as they fade: translate, scale, rotate and opacity
 * only (the compositor's), every one gone within BURST_MS, and taken out of
 * the page when done. One burst per like (a like pressed again while one is
 * in the air replaces it). An
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
export const BURST_MS = 720
export const BURST_COUNT = 8
/** The sparks thrown with the hearts: a few small dots, not a second ring of hearts. */
export const SPARK_COUNT = 3
/** The like's own red, set on the tiny hearts rather than taken from the button, whose colour is still settling when they leave. */
const BURST_COLOR = "#c4290c"
/* A few of the like's colours, kept quiet: its red, a warm pink, and a little gold for the sparks. */
const HEART_COLORS = [BURST_COLOR, "#e8476a", "#ff7a8a", BURST_COLOR, "#f0567a"]
const SPARK_COLORS = ["#f5b324", "#ff7a8a", BURST_COLOR, "#ffcf5c", "#e8476a"]

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
    /* Two waves: the first half close and quick, the second further and a beat later, so it reads as confetti, not a ring. */
    const outer = i >= count / 2
    const k = outer ? i - count / 2 : i
    const n = outer ? count - count / 2 : count / 2
    const a = (k / n) * Math.PI * 2 - Math.PI / 2 + (outer ? Math.PI / n : 0) + (k % 2 ? 0.16 : -0.1)
    const reach = size * (outer ? (k % 3 === 0 ? 1.45 : k % 3 === 1 ? 1.25 : 1.6) : k % 3 === 0 ? 0.85 : k % 3 === 1 ? 0.72 : 0.95)
    out.push({
      x: Math.cos(a) * reach,
      y: Math.sin(a) * reach - size * 0.18,
      s: outer ? (k % 3 === 0 ? 0.42 : k % 3 === 1 ? 0.52 : 0.6) : k % 3 === 0 ? 0.5 : k % 3 === 1 ? 0.62 : 0.72,
      r: (k % 2 ? 1 : -1) * (10 + (k % 4) * 7),
      delay: outer ? 60 + (k % 4) * 14 : (k % 5) * 8,
    })
  }
  return out
}

/** The sparks: round dots on a ring between the two waves, each a little off it. */
export function sparkPaths(size: number, count = SPARK_COUNT): BurstPath[] {
  const out: BurstPath[] = []
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2 + 0.31 + (i % 2 ? 0.12 : -0.08)
    const reach = size * (i % 2 ? 1.6 : 1.85)
    out.push({ x: Math.cos(a) * reach, y: Math.sin(a) * reach - size * 0.1, s: i % 3 === 0 ? 1.2 : 0.85, r: 0, delay: 30 + (i % 3) * 18 })
  }
  return out
}

/*
  A TINY HEART IS AN HTML BOX, NOT AN SVG. Chrome will not run an animation
  of an <svg> element on the compositor (measured: compositeFailed on the
  svg, none on a box), so each one is a small box in the like's red, cut to
  the heart's shape by a mask drawn once.
*/
/* Single quotes: this is written inside a style="..." attribute, and a double quote there ended the attribute, so the hearts never drew (round 15). */
const HEART_MASK = `url('data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${HEART_PATH}"/></svg>`)}') center / contain no-repeat`
const particleStyle = (dot: number, color: string) =>
  `position:absolute;left:${-dot / 2}px;top:${-dot / 2}px;width:${dot}px;height:${dot}px;background:${color};-webkit-mask:${HEART_MASK};mask:${HEART_MASK};opacity:0`
const sparkStyle = (dot: number, color: string) =>
  `position:absolute;left:${-dot / 2}px;top:${-dot / 2}px;width:${dot}px;height:${dot}px;border-radius:999px;background:${color};opacity:0`
const ringStyle = (d: number) =>
  `position:absolute;left:${-d / 2}px;top:${-d / 2}px;width:${d}px;height:${d}px;border-radius:999px;border:2px solid ${BURST_COLOR};opacity:0`

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
  const dot = Math.max(4, Math.round(size * 0.26))
  const spark = Math.max(2, Math.round(size * 0.1))
  const paths = burstPaths(size)
  const sparks = sparkPaths(size)
  layer.innerHTML =
    `<i data-heart-ring="" style="${ringStyle(size * 1.1)}"></i>` +
    paths.map((_, i) => `<i data-heart-particle="" style="${particleStyle(dot, HEART_COLORS[i % HEART_COLORS.length])}"></i>`).join("") +
    sparks.map((_, i) => `<i data-heart-spark="" style="${sparkStyle(spark, SPARK_COLORS[i % SPARK_COLORS.length])}"></i>`).join("")
  const runs: Animation[] = []
  /* A soft ring out from the heart under the confetti: one pulse, gone before the hearts. */
  runs.push((layer.children[0] as HTMLElement).animate([{ scale: "0.35", opacity: 0.55 }, { scale: "1.9", opacity: 0 }], { duration: 460, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "both" }))
  sparks.forEach((p, i) => {
    const el = layer.children[1 + paths.length + i] as HTMLElement
    const at = (k: number, lift = 0) => `${(p.x * k).toFixed(1)}px ${(p.y * k - lift).toFixed(1)}px`
    runs.push(
      el.animate(
        [
          { translate: at(0.3), scale: `${0.4 * p.s}`, opacity: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.8), scale: `${1.2 * p.s}`, opacity: 0.55, offset: 0.35, easing: "ease-out" },
          { translate: at(1, size * 0.12), scale: `${0.2 * p.s}`, opacity: 0 },
        ],
        { duration: BURST_MS - 160 - p.delay, delay: p.delay, easing: "linear", fill: "both" },
      ),
    )
  })
  paths.forEach((p, i) => {
    const el = layer.children[1 + i] as HTMLElement
    /* Out fast, a short float at full strength, then a soft fade as it drifts up: easing per stretch, the whole run linear. */
    const at = (k: number, lift = 0) => `${(p.x * k).toFixed(1)}px ${(p.y * k - lift).toFixed(1)}px`
    runs.push(
      el.animate(
        [
          { translate: at(0), scale: `${0.2 * p.s}`, rotate: "0deg", opacity: 0, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.35), scale: `${0.72 * p.s}`, rotate: `${p.r * 0.25}deg`, opacity: 0.45, offset: 0.18, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.62), scale: `${1.08 * p.s}`, rotate: `${p.r * 0.5}deg`, opacity: 0.62, offset: 0.38, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { translate: at(0.82, size * 0.04), scale: `${p.s}`, rotate: `${p.r * 0.72}deg`, opacity: 0.5, offset: 0.58, easing: "ease-out" },
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
 * load): a soft "bubble pop" about a tenth of a second long, very quiet;
 * an unlike is a lower, softer, shorter falling tap (likeSound below). One sound per
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
 * a post sent is one soft falling pop (round 30, POST_POP below; it was a
 * whoosh, then a two note chime). Both are made on the spot (no file).
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

/** Made ready in a press, for a sound played a moment later (a post's chime once the server has it): a browser starts audio only from a press. */
export function primeSounds(): void {
  soundContext()
}

/*
  ROUND 30, THE OWNER: the post sound "needs to be more smooth and clean, it doesn't really make sense". Round 29's two
  note chime was still a little tune, and a tune asks to be listened to. A post sent is now ONE soft, round pop, like a
  drop landing in water: a sine that glides down from 600Hz to 420Hz over its first 90ms, so it is a single falling
  "bloop" and not a note; a faint second partial an octave over it for the first 60ms, so a phone's small speaker
  still has something to play; a 9ms eased rise (a raised cosine, so no click) and an exponential fall, the last 12ms
  brought to exactly zero (so no click at the end either); all through a low pass at 1800Hz, so nothing in it is bright.
  About a fifth of a second, peaking near a like's quiet. POST_POP is the shape, for the probe to render offline and
  measure (scripts/check-composer-round30.mjs).
*/
export const POST_POP = {
  /** The glide: where the pop starts, where it settles, and how long it takes to get there (seconds). */
  from: 600,
  to: 420,
  glide: 0.09,
  /** The eased rise, the peak, and the whole length (seconds). */
  rise: 0.009,
  peak: 0.026,
  length: 0.19,
  /** The last stretch, ramped to exactly zero. */
  tail: 0.012,
  /** The faint octave partial: its share of the peak and how long it lasts. */
  partial: { share: 0.14, length: 0.06 },
  lowpass: 1800,
} as const

/** The pop, drawn into any context (a live one, or an offline one for a test) from `at`, into `out`. Answers when it is over. */
export function postPop(ctx: BaseAudioContext, at: number, out: AudioNode): number {
  const P = POST_POP
  const soften = ctx.createBiquadFilter()
  soften.type = "lowpass"
  soften.frequency.setValueAtTime(P.lowpass, at)
  soften.Q.setValueAtTime(0.4, at)
  soften.connect(out)
  /* A raised cosine from 0 to 1: the rise has no corner at its start or its top. */
  const ease = (n: number, peak: number) => {
    const c = new Float32Array(n)
    for (let i = 0; i < n; i++) c[i] = peak * 0.5 * (1 - Math.cos((Math.PI * i) / (n - 1)))
    return c
  }
  let live = 0
  let end = at
  const voice = (ratio: number, peak: number, length: number) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = "sine"
    osc.frequency.setValueAtTime(P.from * ratio, at)
    osc.frequency.exponentialRampToValueAtTime(P.to * ratio, at + P.glide)
    gain.gain.setValueCurveAtTime(ease(32, peak), at, P.rise)
    gain.gain.exponentialRampToValueAtTime(peak * 0.02, at + length - P.tail)
    gain.gain.linearRampToValueAtTime(0, at + length)
    osc.connect(gain)
    gain.connect(soften)
    osc.start(at)
    osc.stop(at + length + 0.005)
    end = Math.max(end, at + length + 0.005)
    live++
    osc.onended = () => {
      osc.disconnect()
      gain.disconnect()
      /* The filter goes with the last voice. */
      if (--live === 0) soften.disconnect()
    }
  }
  voice(1, P.peak, P.length)
  voice(2, P.peak * P.partial.share, P.partial.length)
  return end
}

/** A post sent: the one soft pop (POST_POP), played once the server has the post. */
export function postSound(): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    postPop(ctx, ctx.currentTime + 0.004, ctx.destination)
    return true
  } catch {
    return false
  }
}

/**
 * The like's sound, or the unlike's. Answers whether one was played.
 *
 * A like is a bubble pop: a sine that leaps up an octave in its first 30ms
 * and is gone by 110ms, through a low pass so it is round rather than
 * bright, with a faint glassy overtone a moment after. An unlike is a
 * quieter, shorter tap that falls.
 */
export function likeSound(on: boolean): boolean {
  const ctx = soundContext()
  if (!ctx) return false
  try {
    const t = ctx.currentTime + 0.004
    const soften = ctx.createBiquadFilter()
    soften.type = "lowpass"
    soften.frequency.setValueAtTime(on ? 3200 : 1800, t)
    soften.Q.setValueAtTime(0.7, t)
    soften.connect(ctx.destination)
    const tone = (type: OscillatorType, from: number, to: number, bend: number, peak: number, length: number, at = t) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = type
      osc.frequency.setValueAtTime(from, at)
      osc.frequency.exponentialRampToValueAtTime(to, at + bend)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(peak, at + 0.005)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length)
      osc.connect(gain)
      gain.connect(soften)
      osc.start(at)
      osc.stop(at + length + 0.02)
      osc.onended = () => {
        osc.disconnect()
        gain.disconnect()
      }
    }
    if (on) {
      tone("sine", 520, 1080, 0.03, 0.06, 0.11)
      tone("triangle", 2160, 2600, 0.04, 0.012, 0.07, t + 0.028)
    } else {
      tone("sine", 480, 300, 0.05, 0.026, 0.08)
    }
    window.setTimeout(() => soften.disconnect(), 300)
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
