/**
 * ===========================================================================
 *  ASK STORELIB'S FOUR SOUNDS
 * ===========================================================================
 * "There should be a sound when I record with the voice recorder: when I
 * click record and when I close the recording. Also a very good, clean sound
 * when the AI finishes. And when a prompt is sent, a sound, very smooth and
 * clean, like a whoosh."
 *
 *   record-start   a short soft tick that rises, as the microphone opens
 *   record-stop    the same tick falling, as it closes
 *   sent           a quiet airy whoosh, filtered noise swept upwards, ~230ms
 *   done           two notes a fifth apart with a soft attack, ~420ms, when
 *                  a run finishes (or stops to ask) and when a section is
 *                  written
 *
 * SYNTHESISED, NOT FILES. Each is a few Web Audio nodes scheduled on one
 * shared AudioContext: nothing to download, nothing to decode, and the same
 * on every device. QUIET: the loudest moment of any of them is about -20
 * dBFS (PEAK_GAIN), measured on the real graph by scripts/check-ask-ai.mjs.
 *
 * WHEN IT MAY PLAY. Browsers only let audio start from a person's gesture,
 * and iOS (Safari and the app's WKWebView) only from a tap's end. So the
 * context is made and resumed inside the first press or key anywhere on the
 * page (armAskSounds), and a sound asked for before any gesture is simply
 * not played: nothing here ever plays on page load. Every entry point is
 * wrapped so that a browser without Web Audio, a context the system took
 * away, or a node that refuses a value is silence, never an exception.
 *
 * On iOS 17 and later the page's audio session is set to "ambient": the
 * sounds respect the silent switch and mix with whatever else is playing,
 * as a system click does.
 *
 * The scheduling is pure against the context it is handed, so
 * tests/ask-sounds.test.ts drives it with a stub and reads back every node,
 * connection, ramp and stop.
 */

export type AskSound = "record-start" | "record-stop" | "sent" | "done"

export const ASK_SOUNDS: readonly AskSound[] = ["record-start", "record-stop", "sent", "done"]

/** The loudest any sound gets: 0.1 of full scale, -20 dBFS. */
export const PEAK_GAIN = 0.1

/** Remembered per browser; on unless somebody turned them off. */
export const SOUNDS_KEY = "storelib.ask.sounds"

/* ── As much of Web Audio as this uses, so a test can stand in for it ───── */

export interface ParamLike {
  value: number
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
export interface NodeLike {
  connect(destination: NodeLike): unknown
  disconnect?(): void
}
export interface GainLike extends NodeLike {
  gain: ParamLike
}
export interface SourceLike extends NodeLike {
  start(when?: number): void
  stop(when?: number): void
  onended?: (() => void) | null
}
export interface OscillatorLike extends SourceLike {
  type: string
  frequency: ParamLike
}
export interface FilterLike extends NodeLike {
  type: string
  frequency: ParamLike
  Q: ParamLike
}
export interface BufferLike {
  getChannelData(channel: number): Float32Array
}
export interface BufferSourceLike extends SourceLike {
  buffer: BufferLike | null
}
export interface ContextLike {
  currentTime: number
  sampleRate: number
  destination: NodeLike
  state?: string
  createGain(): GainLike
  createOscillator(): OscillatorLike
  createBiquadFilter(): FilterLike
  createBuffer(channels: number, length: number, sampleRate: number): BufferLike
  createBufferSource(): BufferSourceLike
  resume?(): Promise<void>
}

/* ── The sounds ────────────────────────────────────────────────────────── */

/** Silence for an exponential ramp, which cannot reach zero. */
const FLOOR = 0.0001

/**
 * When each one's sources stop, in seconds from its start. What is heard is
 * shorter: a tick is over in about 100ms, the whoosh in 230ms and the chime
 * in about 400ms, each measured to where it has fallen 40 dB below its own
 * peak (tests/ask-sounds.test.ts); the tail after that is the fade to
 * silence, so nothing ends on a click.
 */
export const SOUND_LENGTH: Record<AskSound, number> = {
  "record-start": 0.16,
  "record-stop": 0.16,
  sent: 0.24,
  done: 0.53,
}

/** A gain node shaped as an envelope: up to `peak` by `attack`, down to nothing by `end`. */
function envelope(ctx: ContextLike, at: number, peak: number, attack: number, end: number): GainLike {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(FLOOR, at)
  gain.gain.linearRampToValueAtTime(peak, at + attack)
  gain.gain.exponentialRampToValueAtTime(FLOOR, at + end)
  return gain
}

/** Lets go of a source's nodes once it has played, so a long session does not collect them. */
function release(source: SourceLike, nodes: NodeLike[]) {
  source.onended = () => {
    for (const node of nodes) {
      try {
        node.disconnect?.()
      } catch {
        /* already gone */
      }
    }
  }
}

/**
 * THE TICK. A triangle wave, soft and rounded but with enough of an edge to
 * read as a click rather than a tone, gliding a fifth up (opening) or down
 * (closing) in 70ms, with a 5ms attack and a quick fall.
 */
function tick(ctx: ContextLike, at: number, out: NodeLike, rising: boolean): number {
  const end = SOUND_LENGTH["record-start"]
  const osc = ctx.createOscillator()
  osc.type = "triangle"
  const [from, to] = rising ? [620, 930] : [930, 620]
  osc.frequency.setValueAtTime(from, at)
  osc.frequency.exponentialRampToValueAtTime(to, at + 0.07)
  const gain = envelope(ctx, at, PEAK_GAIN, 0.005, 0.15)
  osc.connect(gain)
  gain.connect(out)
  osc.start(at)
  osc.stop(at + end)
  release(osc, [osc, gain])
  return at + end
}

/**
 * The noise the whoosh is cut from: the same every time (a fixed seed), so
 * the sound is the sound and not a slightly different one per message.
 */
function noise(ctx: ContextLike, seconds: number): BufferLike {
  const length = Math.max(1, Math.round(ctx.sampleRate * seconds))
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let seed = 0x2f6b1d
  for (let i = 0; i < length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = (seed / 0xffffffff) * 2 - 1
  }
  return buffer
}

/** How loud the noise is let through: calibrated so the whoosh peaks at PEAK_GAIN (measured, see the probe). */
export const WHOOSH_LEVEL = 0.235

/**
 * THE WHOOSH. White noise through a band pass that sweeps from 450Hz to
 * 2.8kHz, swelling in over 85ms and gone at 230ms: air moving past, quiet
 * enough to sit under whatever else is on. Straight ramps, up and down, so
 * it is a swell rather than a hit, and it ends exactly when it says.
 */
function whoosh(ctx: ContextLike, at: number, out: NodeLike): number {
  const end = SOUND_LENGTH.sent
  const source = ctx.createBufferSource()
  source.buffer = noise(ctx, end + 0.02)
  const band = ctx.createBiquadFilter()
  band.type = "bandpass"
  band.Q.setValueAtTime(0.9, at)
  band.frequency.setValueAtTime(450, at)
  band.frequency.exponentialRampToValueAtTime(2800, at + 0.2)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0, at)
  gain.gain.linearRampToValueAtTime(WHOOSH_LEVEL, at + 0.085)
  gain.gain.linearRampToValueAtTime(0, at + 0.23)
  source.connect(band)
  band.connect(gain)
  gain.connect(out)
  source.start(at)
  source.stop(at + end)
  release(source, [source, band, gain])
  return at + end
}

/**
 * ONE NOTE OF THE CHIME: a sine with a quiet octave above it for a little
 * shimmer, a 14ms attack so it does not click, and a long exponential fall.
 */
function note(ctx: ContextLike, at: number, out: NodeLike, frequency: number, peak: number, end: number): void {
  const body = ctx.createOscillator()
  body.type = "sine"
  body.frequency.setValueAtTime(frequency, at)
  const bodyGain = envelope(ctx, at, peak, 0.014, end)
  body.connect(bodyGain)
  bodyGain.connect(out)
  body.start(at)
  body.stop(at + end + 0.01)
  release(body, [body, bodyGain])

  const shimmer = ctx.createOscillator()
  shimmer.type = "sine"
  shimmer.frequency.setValueAtTime(frequency * 2, at)
  const shimmerGain = envelope(ctx, at, peak * 0.16, 0.01, end * 0.55)
  shimmer.connect(shimmerGain)
  shimmerGain.connect(out)
  shimmer.start(at)
  shimmer.stop(at + end * 0.55 + 0.01)
  release(shimmer, [shimmer, shimmerGain])
}

/** The chime's two notes: E5, then B5 a fifth above, 110ms later. Their peaks together stay under PEAK_GAIN. */
export const CHIME = [
  { frequency: 659.25, offset: 0, peak: 0.068, end: 0.36 },
  { frequency: 987.77, offset: 0.11, peak: 0.074, end: 0.41 },
] as const

function chime(ctx: ContextLike, at: number, out: NodeLike): number {
  for (const n of CHIME) note(ctx, at + n.offset, out, n.frequency, n.peak, n.end)
  return at + SOUND_LENGTH.done
}

/**
 * Schedules one sound at `at` (the context's clock) into `out`, and returns
 * when it ends. Pure against the context it is given.
 */
export function scheduleSound(ctx: ContextLike, sound: AskSound, at: number, out: NodeLike = ctx.destination): number {
  switch (sound) {
    case "record-start":
      return tick(ctx, at, out, true)
    case "record-stop":
      return tick(ctx, at, out, false)
    case "sent":
      return whoosh(ctx, at, out)
    case "done":
      return chime(ctx, at, out)
  }
}

/* ── Whether they are on ───────────────────────────────────────────────── */

type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void }

function storage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** On, unless this browser has turned them off. A browser that blocks storage keeps the default. */
export function soundsOn(store: StorageLike | null = storage()): boolean {
  try {
    return store?.getItem(SOUNDS_KEY) !== "off"
  } catch {
    return true
  }
}

export function setSoundsOn(on: boolean, store: StorageLike | null = storage()): void {
  try {
    store?.setItem(SOUNDS_KEY, on ? "on" : "off")
  } catch {
    /* a per-browser convenience only */
  }
}

/* ── The one context, made and woken by a person's gesture ─────────────── */

type ContextCtor = new (options?: { latencyHint?: string }) => ContextLike

interface Player {
  context: ContextLike | null
  /** A press or a key has happened on this page. Until then nothing plays. */
  gestured: boolean
  armed: boolean
}

const player: Player = { context: null, gestured: false, armed: false }

function contextCtor(): ContextCtor | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function makeContext(): ContextLike | null {
  if (player.context) return player.context
  const Ctor = contextCtor()
  if (!Ctor) return null
  try {
    player.context = new Ctor({ latencyHint: "interactive" })
  } catch {
    return null
  }
  /* iOS 17+: respect the silent switch and mix with other audio, as a system sound does. */
  try {
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session) session.type = "ambient"
  } catch {
    /* not every browser lets it be set */
  }
  return player.context
}

/** Inside a gesture: make the context if it is not there, and wake it. */
function wake(): void {
  player.gestured = true
  try {
    const ctx = makeContext()
    if (!ctx) return
    if (ctx.state !== "running") void ctx.resume?.().catch(() => {})
    /*
      A one sample silent buffer, played inside the gesture: what older iOS
      needs before it lets a context make any sound at all. Inaudible, and
      harmless everywhere else.
    */
    const silent = ctx.createBufferSource()
    silent.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || 22050)
    silent.connect(ctx.destination)
    silent.start(0)
  } catch {
    /* no sound is the worst that happens */
  }
}

const GESTURES = ["pointerdown", "pointerup", "touchend", "keydown", "click"] as const

/**
 * Listens for the first gestures on the page, where the context may be made
 * and woken. Idempotent. The listeners let go once the context is running.
 */
export function armAskSounds(): void {
  if (player.armed || typeof window === "undefined") return
  player.armed = true
  const onGesture = () => {
    wake()
    if (player.context?.state === "running") {
      for (const type of GESTURES) window.removeEventListener(type, onGesture, true)
      player.armed = false
      /* Re-armed if the system suspends it later (a phone call, the app in the background). */
    }
  }
  for (const type of GESTURES) window.addEventListener(type, onGesture, { capture: true, passive: true })
}

/**
 * Plays one sound now, if sounds are on and a person has touched the page.
 * Never throws, never waits.
 */
export function playAskSound(sound: AskSound): void {
  try {
    if (!soundsOn() || !player.gestured) return
    const ctx = makeContext()
    if (!ctx) return
    const go = () => {
      try {
        scheduleSound(ctx, sound, ctx.currentTime + 0.012)
      } catch {
        /* a node that refused a value is silence */
      }
    }
    if (ctx.state === "running") {
      go()
      return
    }
    /* Suspended by the system since (iOS "interrupted", a tab in the background): wake it, then play, else stay quiet. */
    armAskSounds()
    const resumed = ctx.resume?.()
    if (!resumed) return
    void resumed.then(() => (ctx.state === "running" ? go() : undefined)).catch(() => {})
  } catch {
    /* silence */
  }
}

/** For tests: forget the context and the gesture, as a fresh page would. */
export function resetAskSoundsForTest(): void {
  player.context = null
  player.gestured = false
  player.armed = false
}
