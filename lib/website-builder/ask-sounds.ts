/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS
 * ===========================================================================
 * "They sound like a whale." The first set rang through a 1.5s hall, with
 * notes a few cents apart beating against each other and ticks that slid in
 * pitch. These are made the way UI sounds in a shipped app are: short, a
 * soft wooden strike over a little low thump, a small tight room, and no
 * note that moves once it has started.
 *
 *   sent           a soft "tock" up: a quiet E5 grace, then A5 38ms later
 *   upload         a light double tick, G6 twice, 75ms apart
 *   question       D5 then F#5, a major third up, a little slower
 *   done           C5, E5 and G5 rolled quickly into a warm major chord
 *   error          a low soft pair falling, E4 to C#4, darker than the rest
 *   record-start   one tick, E6, as the microphone opens
 *   record-stop    one lower tick, B5, as it closes
 *
 * HOW EACH STRIKE IS MADE:
 *
 *   note      a sine at the note with a soft 3 to 8ms attack and an
 *             exponential fall. One oscillator per partial, never two
 *             detuned ones, so nothing beats or wobbles; no glide, no
 *             vibrato: every frequency is set once.
 *   partials  the second harmonic and a quick fourth over the note, each
 *             falling faster than it: the marimba and soft bell colour,
 *             bright at the strike and warm as it fades.
 *   body      a low sine thump, the note folded down into 120 to 240Hz,
 *             over in under a tenth of a second: weight under the strike,
 *             felt more than heard.
 *   click     a few milliseconds of band passed noise at the start, the
 *             mallet touching the bar, quiet enough to be a texture.
 *   tone      a fixed low pass per sound (darkest for error), then panned a
 *             little left or right so a pair of notes sits side by side.
 *
 * THE ROOM AND THE MASTER, shared by every sound on a context:
 *
 *   room      a ConvolverNode on an impulse made here: 0.4s of stereo noise
 *             falling 60 dB, darkening as it goes, after a 6ms pre-delay,
 *             then a 3.2kHz high cut so the tail is never watery. Each
 *             sound sends 10 to 14 percent of itself to it.
 *   master    a 60Hz high pass (no mud under the thump), then a limiter (a
 *             DynamicsCompressorNode at -6 dBFS, ratio 12) that nothing
 *             reaches on its own; it is there so two sounds landing
 *             together can never clip.
 *
 * SYNTHESISED, NOT FILES. Nothing to download, nothing to decode, the same
 * on every device. Every sound peaks at about -16 dBFS (PEAK_GAIN),
 * rendered offline in Chromium and measured by scripts/check-ask-sounds.mjs
 * (peak, RMS, spectral centroid, the tail to -60 dB).
 *
 * WHEN IT MAY PLAY. Browsers only let audio start from a person's gesture,
 * and iOS (Safari and the app's WKWebView) only from a tap's end. So the one
 * context is made and resumed inside the first press or key anywhere on the
 * page (armAskSounds), and a sound asked for before any gesture is simply
 * not played: nothing here ever plays on page load. Every entry point is
 * wrapped so that a browser without Web Audio, a context the system took
 * away, or a node that refuses a value is silence, never an exception. A
 * browser without a convolver, a compressor or a stereo panner plays the
 * same notes without them.
 *
 * On iOS 17 and later the page's audio session is set to "ambient": the
 * sounds respect the silent switch and mix with whatever else is playing,
 * as a system click does. An ambient session has no microphone, so while
 * the composer records it goes back to "auto" (openMicrophoneSession).
 *
 * The scheduling is pure against the context it is handed, so
 * tests/ask-sounds.test.ts drives it with a stub and reads back every node,
 * connection, ramp and stop, and builds it on the server without one.
 */

export type AskSound = "record-start" | "record-stop" | "sent" | "upload" | "question" | "done" | "error"

export const ASK_SOUNDS: readonly AskSound[] = ["record-start", "record-stop", "sent", "upload", "question", "done", "error"]

/** The loudest any sound gets, after the room and the limiter: -16 dBFS. */
export const PEAK_DBFS = -16
export const PEAK_GAIN = Math.pow(10, PEAK_DBFS / 20)

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
  detune: ParamLike
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
export interface ConvolverLike extends NodeLike {
  buffer: BufferLike | null
  normalize: boolean
}
export interface CompressorLike extends NodeLike {
  threshold: ParamLike
  knee: ParamLike
  ratio: ParamLike
  attack: ParamLike
  release: ParamLike
}
export interface PannerLike extends NodeLike {
  pan: ParamLike
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
  createConvolver?(): ConvolverLike
  createDynamicsCompressor?(): CompressorLike
  createStereoPanner?(): PannerLike
  resume?(): Promise<void>
}

/* ── The room: one reverb, one high pass and one limiter per context ───── */

/** Silence for an exponential ramp, which cannot reach zero: -80 dBFS, 64 dB under the loudest. */
const FLOOR = 0.0001

/** The reverb's impulse: how long it rings, and the gap before it starts. A small room, not a hall. */
export const REVERB = { seconds: 0.4, preDelay: 0.006, decayDb: 60 } as const

/** The high cut after the reverb, so its tail stays dry and never sounds watery. */
export const ROOM_HIGH_CUT = 3200

/** The high pass on the master: nothing under it but rumble that reads as mud on laptop speakers. */
export const HIGH_PASS = 60

/** The limiter. Set 10 dB above PEAK_GAIN, so it only ever catches two sounds landing together. */
export const LIMITER = { threshold: -6, knee: 0, ratio: 12, attack: 0.002, release: 0.12 } as const

/**
 * A new compressor starts about 10 dB down and comes up over its first
 * ~120ms of running (measured in Chromium; WebKit shares the kernel). So the
 * room is built inside the first gesture, well before anything plays, and a
 * sound asked for in that first moment waits until it has settled.
 */
export const LIMITER_SETTLE = 0.15

/**
 * A compressor raises everything by a fixed "makeup" gain worked out from its
 * curve (the Web Audio spec: the gain at full scale, inverted, to the power
 * 0.6). The limiter is a safety, not a loudness control, so the master trim
 * takes that back out: below the threshold the chain is unity.
 */
export function limiterMakeup(l: { threshold: number; ratio: number } = LIMITER): number {
  const fullRangeDb = l.threshold + (0 - l.threshold) / l.ratio
  return Math.pow(1 / Math.pow(10, fullRangeDb / 20), 0.6)
}

/** A fixed seed per channel: the room is the same room every time. */
function seeded(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return (s / 0xffffffff) * 2 - 1
  }
}

const impulses = new Map<number, [Float32Array, Float32Array]>()

/**
 * THE IMPULSE RESPONSE, made once per sample rate. Stereo noise, a different
 * seed per side so the tail is wide, shaped by:
 *
 *   pre-delay   6ms of nothing, so the strike is heard clean before the room
 *               answers it
 *   envelope    a 2ms fade in, then an exponential fall of 60 dB over 0.4s
 *   damping     a one pole low pass that closes from about 6kHz to 1.2kHz
 *               along the tail, as real rooms lose their highs first
 *
 * Scaled to unit energy per side and played with `normalize` off, so the wet
 * level is exactly the send level in every browser.
 */
export function impulseResponse(sampleRate: number): [Float32Array, Float32Array] {
  const cached = impulses.get(sampleRate)
  if (cached) return cached
  const rate = sampleRate > 0 ? sampleRate : 48000
  const length = Math.max(1, Math.round(rate * REVERB.seconds))
  const delay = Math.round(rate * REVERB.preDelay)
  const fadeIn = Math.max(1, Math.round(rate * 0.002))
  const tail = Math.max(1, length - delay)
  /* Per sample: the envelope's fall, and the cutoff's, as multipliers, so the loop has no pow or exp in it. */
  const fall = Math.exp(-((REVERB.decayDb / 20) * Math.LN10) / tail)
  const darken = Math.pow(1200 / 6000, 1 / tail)
  const sides: Float32Array[] = []
  for (const seed of [0x51a7e, 0x2c0ffee]) {
    const data = new Float32Array(length)
    const noise = seeded(seed)
    let y = 0
    let energy = 0
    let level = 1
    let cutoff = 6000
    let a = 1
    for (let i = delay; i < length; i++) {
      /* One pole low pass, its coefficient worked out every 32 samples: the cutoff barely moves in between. */
      if ((i - delay) % 32 === 0) a = 1 - Math.exp((-2 * Math.PI * cutoff) / rate)
      y += a * (noise() - y)
      const v = y * level * Math.min(1, (i - delay + 1) / fadeIn)
      data[i] = v
      energy += v * v
      level *= fall
      cutoff *= darken
    }
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0
    for (let i = 0; i < length; i++) data[i] *= scale
    sides.push(data)
  }
  const pair: [Float32Array, Float32Array] = [sides[0], sides[1]]
  impulses.set(sampleRate, pair)
  return pair
}

const noises = new Map<number, Float32Array>()

/** The click's noise: 30ms of white noise, made once per sample rate, the same every time. */
export function clickNoise(sampleRate: number): Float32Array {
  const cached = noises.get(sampleRate)
  if (cached) return cached
  const rate = sampleRate > 0 ? sampleRate : 48000
  const data = new Float32Array(Math.max(1, Math.round(rate * 0.03)))
  const noise = seeded(0x7a11)
  for (let i = 0; i < data.length; i++) data[i] = noise()
  noises.set(sampleRate, data)
  return data
}

interface Bus {
  out: NodeLike
  /** The context's clock when the limiter has settled (LIMITER_SETTLE). */
  readyAt: number
  /** Into the high pass and the limiter untouched. */
  dry: NodeLike
  /** Into the reverb; null where there is no convolver, and the strike sends nothing. */
  room: NodeLike | null
  /** The click's noise as a buffer of this context, made once. */
  noise: BufferLike
}

const buses = new WeakMap<object, Bus>()

/**
 * The shared end of every sound on a context, built the first time a sound
 * plays there and kept:
 *
 *   dry ────────────────────────────────────┐
 *   room → convolver → low pass (high cut) ─┴→ high pass 60Hz → limiter → trim → out
 */
function busFor(ctx: ContextLike, out: NodeLike): Bus {
  const known = buses.get(ctx)
  if (known && known.out === out) return known

  const trim = ctx.createGain()
  trim.gain.value = 1
  let master: NodeLike = trim
  let readyAt = 0
  if (ctx.createDynamicsCompressor) {
    readyAt = ctx.currentTime + LIMITER_SETTLE
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = LIMITER.threshold
    limiter.knee.value = LIMITER.knee
    limiter.ratio.value = LIMITER.ratio
    limiter.attack.value = LIMITER.attack
    limiter.release.value = LIMITER.release
    trim.gain.value = 1 / limiterMakeup()
    limiter.connect(trim)
    master = limiter
  }
  trim.connect(out)

  const highPass = ctx.createBiquadFilter()
  highPass.type = "highpass"
  highPass.frequency.value = HIGH_PASS
  highPass.Q.value = Math.SQRT1_2
  highPass.connect(master)

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(highPass)

  let room: NodeLike | null = null
  if (ctx.createConvolver) {
    const convolver = ctx.createConvolver()
    convolver.normalize = false
    const [left, right] = impulseResponse(ctx.sampleRate)
    const buffer = ctx.createBuffer(2, left.length, ctx.sampleRate)
    buffer.getChannelData(0).set(left)
    buffer.getChannelData(1).set(right)
    convolver.buffer = buffer
    const cut = ctx.createBiquadFilter()
    cut.type = "lowpass"
    cut.frequency.value = ROOM_HIGH_CUT
    cut.Q.value = 0.5
    const input = ctx.createGain()
    input.gain.value = 1
    input.connect(convolver)
    convolver.connect(cut)
    cut.connect(highPass)
    room = input
  }

  const samples = clickNoise(ctx.sampleRate)
  const noise = ctx.createBuffer(1, samples.length, ctx.sampleRate)
  noise.getChannelData(0).set(samples)

  const bus = { out, readyAt, dry, room, noise }
  buses.set(ctx, bus)
  return bus
}

/* ── One strike ────────────────────────────────────────────────────────── */

export interface Strike {
  /** Hz. Set once: nothing glides. */
  frequency: number
  /** Seconds after the sound starts. */
  offset: number
  /** Against the sound's other strikes, 0 to 1. */
  level: number
  /** Seconds to the peak: 3 to 8ms, soft, never a click of its own. */
  attack: number
  /** Seconds from the strike to silence (FLOOR), an exponential fall. */
  decay: number
  /** The low thump's level against the note; 0 for none. */
  body: number
  /** The mallet noise's level against the note; 0 for none. */
  click: number
  /** -1 left to 1 right. */
  pan: number
}

/** A partial over the note: its ratio, its level against the note, and how much of the note's decay it lasts. */
export interface Overtone {
  ratio: number
  level: number
  decay: number
}

export interface SoundDesign {
  strikes: Strike[]
  /** The whole sound's level: calibrated so it peaks at PEAK_GAIN through the room and the limiter. */
  gain: number
  /** How much of each strike goes to the room, against its dry level. */
  wet: number
  /** The low pass every strike of this sound goes through, Hz. */
  tone: number
  /** The click's band, Hz. */
  clickBand: number
  partials: readonly Overtone[]
}

/** The thump's pitch: the note folded down by octaves into 120 to 240Hz. */
export function bodyFrequency(note: number): number {
  let f = note
  while (f >= 240) f /= 2
  while (f < 120) f *= 2
  return f
}

/** How long the thump lasts: short, so it is weight and not a second note. */
export const BODY_DECAY = 0.09

/** How long the mallet noise lasts. */
export const CLICK_DECAY = 0.018

/** Lets go of a strike's nodes once its last source has played, so a long session does not collect them. */
function releaseWhenDone(source: SourceLike, nodes: NodeLike[]) {
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

function envelopeGain(ctx: ContextLike, at: number, peak: number, attack: number, length: number): GainLike {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(FLOOR, at)
  gain.gain.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), at + attack)
  gain.gain.exponentialRampToValueAtTime(FLOOR, at + Math.max(length, attack + 0.005))
  return gain
}

function sine(ctx: ContextLike, at: number, frequency: number): OscillatorLike {
  const osc = ctx.createOscillator()
  osc.type = "sine"
  osc.frequency.setValueAtTime(frequency, at)
  return osc
}

/**
 * One strike: the note and its partials, the thump under it and the click
 * on top, each with its own envelope, through the sound's low pass, panned,
 * then to the dry bus and a little of it to the room.
 */
function playStrike(ctx: ContextLike, start: number, bus: Bus, design: SoundDesign, strike: Strike): number {
  const at = start + strike.offset
  const stopAt = at + strike.decay + STOP_PAD
  const peak = design.gain * strike.level
  const made: NodeLike[] = []

  const tone = ctx.createBiquadFilter()
  tone.type = "lowpass"
  tone.frequency.setValueAtTime(design.tone, at)
  tone.Q.setValueAtTime(0.5, at)
  made.push(tone)

  const sources: SourceLike[] = []
  const voice = (frequency: number, level: number, attack: number, length: number) => {
    const env = envelopeGain(ctx, at, peak * level, attack, length)
    const osc = sine(ctx, at, frequency)
    osc.connect(env)
    env.connect(tone)
    made.push(env)
    sources.push(osc)
  }
  voice(strike.frequency, 1, strike.attack, strike.decay)
  for (const p of design.partials) voice(strike.frequency * p.ratio, p.level, strike.attack, strike.decay * p.decay)
  if (strike.body > 0) voice(bodyFrequency(strike.frequency), strike.body, Math.max(strike.attack, 0.004), Math.min(BODY_DECAY, strike.decay))

  if (strike.click > 0) {
    const noise = ctx.createBufferSource()
    noise.buffer = bus.noise
    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.setValueAtTime(design.clickBand, at)
    band.Q.setValueAtTime(0.9, at)
    const env = envelopeGain(ctx, at, peak * strike.click, 0.001, CLICK_DECAY)
    noise.connect(band)
    band.connect(env)
    env.connect(tone)
    made.push(band, env)
    sources.push(noise)
  }

  let tail: NodeLike = tone
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(strike.pan, at)
    tone.connect(panner)
    made.push(panner)
    tail = panner
  }
  tail.connect(bus.dry)
  if (bus.room && design.wet > 0) {
    const send = ctx.createGain()
    send.gain.setValueAtTime(design.wet, at)
    tail.connect(send)
    send.connect(bus.room)
    made.push(send)
  }

  for (const source of sources) {
    source.start(at)
    source.stop(stopAt)
  }
  made.push(...sources)
  /* Every source stops at the same moment; the note's own end lets the whole strike go. */
  releaseWhenDone(sources[0], made)
  return stopAt
}

/** A little past the last envelope's end, so no source is cut while still sounding. */
const STOP_PAD = 0.01

/* ── The sounds ────────────────────────────────────────────────────────── */

/** The marimba and soft bell colour every sound but error shares: the octave, and a quick double octave. */
const WOOD: readonly Overtone[] = [
  { ratio: 2, level: 0.22, decay: 0.45 },
  { ratio: 4, level: 0.07, decay: 0.2 },
]

/** Error's: the octave only, quieter. Rounder and darker. */
const SOFT: readonly Overtone[] = [{ ratio: 2, level: 0.14, decay: 0.45 }]

const strike = (s: Partial<Strike> & Pick<Strike, "frequency" | "decay">): Strike => ({
  offset: 0,
  level: 1,
  attack: 0.004,
  body: 0.45,
  click: 0.3,
  pan: 0,
  ...s,
})

/**
 * Every sound, as strikes. `gain` is calibrated so each one, rendered
 * through the room and the limiter, peaks at PEAK_GAIN (measured offline in
 * Chromium by scripts/check-ask-sounds.mjs; the stub test holds the shapes).
 */
export const SOUND_DESIGN: Record<AskSound, SoundDesign> = {
  /* A single tick, high, almost dry: the microphone is open. */
  "record-start": {
    gain: 0.182,
    wet: 0.1,
    tone: 7000,
    clickBand: 4200,
    partials: WOOD,
    strikes: [strike({ frequency: 1318.51, attack: 0.003, decay: 0.075, body: 0.3, click: 0.3 })],
  },
  /* The same tick a fourth lower: closed. */
  "record-stop": {
    gain: 0.18,
    wet: 0.1,
    tone: 7000,
    clickBand: 3600,
    partials: WOOD,
    strikes: [strike({ frequency: 987.77, attack: 0.003, decay: 0.075, body: 0.3, click: 0.3 })],
  },
  /* A soft tock up: a quiet grace a fourth below, then the note, left then right. */
  sent: {
    gain: 0.123,
    wet: 0.14,
    tone: 6500,
    clickBand: 3400,
    partials: WOOD,
    strikes: [
      strike({ frequency: 659.25, level: 0.55, attack: 0.003, decay: 0.07, body: 0.5, click: 0.35, pan: -0.08 }),
      strike({ frequency: 880, offset: 0.038, attack: 0.004, decay: 0.12, body: 0.6, click: 0.35, pan: 0.08 }),
    ],
  },
  /* Two light ticks, the same high note: something is in. Less body, a brighter click. */
  upload: {
    gain: 0.166,
    wet: 0.12,
    tone: 7500,
    clickBand: 4600,
    partials: WOOD,
    strikes: [
      strike({ frequency: 1567.98, level: 1, attack: 0.003, decay: 0.06, body: 0.25, click: 0.35, pan: -0.06 }),
      strike({ frequency: 1567.98, offset: 0.075, level: 0.75, attack: 0.003, decay: 0.065, body: 0.25, click: 0.35, pan: 0.06 }),
    ],
  },
  /* Up a major third, a softer attack, the top note a little longer: a voice rising at the end of a question. */
  question: {
    gain: 0.121,
    wet: 0.14,
    tone: 5200,
    clickBand: 3000,
    partials: WOOD,
    strikes: [
      strike({ frequency: 587.33, level: 0.85, attack: 0.006, decay: 0.13, body: 0.5, click: 0.2, pan: -0.1 }),
      strike({ frequency: 739.99, offset: 0.09, attack: 0.006, decay: 0.16, body: 0.45, click: 0.2, pan: 0.1 }),
    ],
  },
  /* C major rolled up in 110ms, the root's thump under it, spread left to right. */
  done: {
    gain: 0.127,
    wet: 0.14,
    tone: 5400,
    clickBand: 3000,
    partials: WOOD,
    strikes: [
      strike({ frequency: 523.25, level: 0.9, attack: 0.005, decay: 0.2, body: 0.7, click: 0.22, pan: -0.15 }),
      strike({ frequency: 659.25, offset: 0.055, level: 0.85, attack: 0.005, decay: 0.21, body: 0.35, click: 0.18, pan: 0 }),
      strike({ frequency: 783.99, offset: 0.11, attack: 0.005, decay: 0.24, body: 0.3, click: 0.18, pan: 0.15 }),
    ],
  },
  /* Low, soft and dark: a minor third falling, the slowest attack, a closed filter, a muffled click. */
  error: {
    gain: 0.127,
    wet: 0.12,
    tone: 2600,
    clickBand: 1600,
    partials: SOFT,
    strikes: [
      strike({ frequency: 329.63, attack: 0.008, decay: 0.12, body: 0.6, click: 0.12, pan: 0.06 }),
      strike({ frequency: 277.18, offset: 0.09, level: 0.95, attack: 0.008, decay: 0.16, body: 0.6, click: 0.1, pan: -0.06 }),
    ],
  },
}

/**
 * When each one's sources stop, in seconds from its start. The room rings on
 * a little after this, falling 60 dB over REVERB.seconds.
 */
export const SOUND_LENGTH: Record<AskSound, number> = Object.fromEntries(
  ASK_SOUNDS.map((sound) => [sound, Math.max(...SOUND_DESIGN[sound].strikes.map((s) => s.offset + s.decay + STOP_PAD))]),
) as Record<AskSound, number>

/**
 * Schedules one sound at `at` (the context's clock) into `out`, through the
 * context's room and limiter, and returns when its sources end. Pure against
 * the context it is given.
 */
export function scheduleSound(ctx: ContextLike, sound: AskSound, at: number, out: NodeLike = ctx.destination): number {
  const design = SOUND_DESIGN[sound]
  const bus = busFor(ctx, out)
  const start = Math.max(at, bus.readyAt)
  let end = start
  for (const s of design.strikes) end = Math.max(end, playStrike(ctx, start, bus, design, s))
  return end
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

/* ── The page's audio session, on iOS 17 and later ─────────────────────── */

let microphoneOpen = false

function setSessionType(type: "ambient" | "auto"): void {
  try {
    if (typeof navigator === "undefined") return
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (session && session.type !== type) session.type = type
  } catch {
    /* not every browser lets it be set */
  }
}

/**
 * The microphone is about to open. An "ambient" session has no input on iOS,
 * so a recording made under it is refused or silent: back to "auto", which
 * becomes play and record while the microphone is on. Called inside the tap,
 * before getUserMedia.
 */
export function openMicrophoneSession(): void {
  microphoneOpen = true
  setSessionType("auto")
}

/** The microphone has closed: ambient again, if the sounds had set it. */
export function closeMicrophoneSession(): void {
  if (!microphoneOpen) return
  microphoneOpen = false
  if (player.context) setSessionType("ambient")
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
  /* iOS 17+: respect the silent switch and mix with other audio, as a system sound does. Not while recording. */
  if (!microphoneOpen) setSessionType("ambient")
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
    /* The room and its limiter, built now so the limiter has settled before the first sound (LIMITER_SETTLE). */
    if (soundsOn()) busFor(ctx, ctx.destination)
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
  microphoneOpen = false
}
