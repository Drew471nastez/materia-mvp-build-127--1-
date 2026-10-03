/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS
 * ===========================================================================
 * "The send sound must be smoother and cleaner, a modern satisfying sound
 * with reverb, made like a real producer would. The sound when the chat
 * finishes, when it asks a question, and the other states too."
 *
 *   record-start   a soft tick gliding up a fifth, as the microphone opens
 *   record-stop    the same tick gliding down, as it closes
 *   sent           a soft pluck, A5 then E6 70ms later: a message leaving
 *   question       D5 then B5, a sixth up, the top note left hanging the way
 *                  a voice rises at the end of a question
 *   done           C, E and G rolled quickly into a warm major chord: the
 *                  answer is in, or a section is written
 *   error          a soft low minor third falling, E4 to C#4
 *
 * HOW EACH IS MADE, as a producer would in a synth:
 *
 *   voice     two oscillators a few cents apart (a little width and life,
 *             no chorus wobble), a quiet octave partial that fades first,
 *             a short attack (4 to 12ms, never a click) and an exponential
 *             release, through a gentle low pass that closes as the note
 *             decays, so each starts bright and settles warm. Panned a
 *             little left or right, so the notes sit beside each other.
 *   room      every voice sends a little of itself to one shared reverb:
 *             a ConvolverNode playing an impulse response made here, 1.5s
 *             of stereo noise falling 60 dB, darkening as it goes, after a
 *             15ms pre-delay. Made once per sample rate and kept. Mixed low,
 *             about a fifth of the dry level, so it is air around the
 *             sound rather than a hall.
 *   master    dry and wet meet in a limiter (a DynamicsCompressorNode at
 *             -6 dBFS, ratio 12) that nothing reaches on its own; it is
 *             there so two sounds landing together can never clip.
 *
 * SYNTHESISED, NOT FILES. Nothing to download, nothing to decode, the same
 * on every device. QUIET: the loudest moment of any of them is about -20
 * dBFS (PEAK_GAIN), measured on the real graph by scripts/check-ask-ai.mjs.
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

export type AskSound = "record-start" | "record-stop" | "sent" | "question" | "done" | "error"

export const ASK_SOUNDS: readonly AskSound[] = ["record-start", "record-stop", "sent", "question", "done", "error"]

/** The loudest any sound gets, after the room and the limiter: 0.1 of full scale, -20 dBFS. */
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

/* ── The room: one reverb and one limiter per context ──────────────────── */

/** Silence for an exponential ramp, which cannot reach zero. */
const FLOOR = 0.0001

/** The reverb's impulse: how long it rings, and the gap before it starts. */
export const REVERB = { seconds: 1.5, preDelay: 0.015, decayDb: 60 } as const

/** The limiter. Set well above PEAK_GAIN, so it only ever catches two sounds landing together. */
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
 *   pre-delay   15ms of nothing, so the first note is heard clean before
 *               the room answers it
 *   envelope    an 8ms fade in, then an exponential fall of 60 dB over 1.5s
 *   damping     a one pole low pass that closes from about 7kHz to 1kHz
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
  const fadeIn = Math.max(1, Math.round(rate * 0.008))
  const tail = Math.max(1, length - delay)
  /* Per sample: the envelope's fall, and the cutoff's, as multipliers, so the loop has no pow or exp in it. */
  const fall = Math.exp(-((REVERB.decayDb / 20) * Math.LN10) / tail)
  const darken = Math.pow(1000 / 7000, 1 / tail)
  const sides: Float32Array[] = []
  for (const seed of [0x51a7e, 0x2c0ffee]) {
    const data = new Float32Array(length)
    const noise = seeded(seed)
    let y = 0
    let energy = 0
    let level = 1
    let cutoff = 7000
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

interface Bus {
  out: NodeLike
  /** The context's clock when the limiter has settled (LIMITER_SETTLE). */
  readyAt: number
  /** Into the limiter untouched. */
  dry: NodeLike
  /** Into the reverb; null where there is no convolver, and the voice sends nothing. */
  room: NodeLike | null
}

const buses = new WeakMap<object, Bus>()

/**
 * The shared end of every sound on a context, built the first time a sound
 * plays there and kept:
 *
 *   dry ──────────────────────────────┐
 *   room → convolver → low pass 5kHz ─┴→ limiter → trim → out
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

  const dry = ctx.createGain()
  dry.gain.value = 1
  dry.connect(master)

  let room: NodeLike | null = null
  if (ctx.createConvolver) {
    const convolver = ctx.createConvolver()
    convolver.normalize = false
    const [left, right] = impulseResponse(ctx.sampleRate)
    const buffer = ctx.createBuffer(2, left.length, ctx.sampleRate)
    buffer.getChannelData(0).set(left)
    buffer.getChannelData(1).set(right)
    convolver.buffer = buffer
    const tone = ctx.createBiquadFilter()
    tone.type = "lowpass"
    tone.frequency.value = 5000
    tone.Q.value = 0.5
    const input = ctx.createGain()
    input.gain.value = 1
    input.connect(convolver)
    convolver.connect(tone)
    tone.connect(master)
    room = input
  }

  const bus = { out, readyAt, dry, room }
  buses.set(ctx, bus)
  return bus
}

/* ── One note ──────────────────────────────────────────────────────────── */

export interface Voice {
  /** Hz, where the note starts. */
  frequency: number
  /** Seconds after the sound starts. */
  offset: number
  /** The note's loudest, before the room. */
  peak: number
  /** Seconds to the peak: 4ms or more, so nothing clicks. */
  attack: number
  /** Seconds from the start to silence, an exponential fall. */
  decay: number
  wave: "sine" | "triangle"
  /** Cents either side for the two oscillators. */
  detune: number
  /** The octave partial's level against the note; it fades in half the time. */
  overtone: number
  /** The low pass at the attack, and where it has closed to by the end. */
  bright: number
  dark: number
  /** -1 left to 1 right. */
  pan: number
  /** A glide: the frequency it reaches, and how fast. */
  glideTo?: number
  glideTime?: number
}

/** Lets go of a voice's nodes once its last source has played, so a long session does not collect them. */
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

function envelopeGain(ctx: ContextLike, at: number, peak: number, attack: number, end: number): GainLike {
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(FLOOR, at)
  gain.gain.linearRampToValueAtTime(Math.max(peak, FLOOR * 2), at + attack)
  gain.gain.exponentialRampToValueAtTime(FLOOR, at + end)
  return gain
}

function oscillator(ctx: ContextLike, at: number, wave: string, voice: Voice, ratio: number, cents: number): OscillatorLike {
  const osc = ctx.createOscillator()
  osc.type = wave
  osc.frequency.setValueAtTime(voice.frequency * ratio, at)
  if (voice.glideTo) osc.frequency.exponentialRampToValueAtTime(voice.glideTo * ratio, at + (voice.glideTime ?? 0.05))
  if (cents) osc.detune.setValueAtTime(cents, at)
  return osc
}

/**
 * One note: two detuned oscillators and a quiet octave into an envelope,
 * through a closing low pass, panned, then to the dry bus and a little of it
 * to the room.
 */
function playVoice(ctx: ContextLike, start: number, bus: Bus, voice: Voice, wet: number): number {
  const at = start + voice.offset
  const end = at + voice.decay
  const stopAt = end + 0.02
  const made: NodeLike[] = []

  /* Each oscillator at half the note, so the pair together reaches its peak. */
  const body = envelopeGain(ctx, at, voice.peak / 2, voice.attack, voice.decay)
  made.push(body)
  const sources: OscillatorLike[] = []
  for (const cents of [-voice.detune, voice.detune]) {
    const osc = oscillator(ctx, at, voice.wave, voice, 1, cents)
    osc.connect(body)
    sources.push(osc)
  }

  const filter = ctx.createBiquadFilter()
  filter.type = "lowpass"
  filter.Q.setValueAtTime(0.5, at)
  filter.frequency.setValueAtTime(voice.bright, at)
  filter.frequency.exponentialRampToValueAtTime(voice.dark, at + voice.decay * 0.6)
  made.push(filter)
  body.connect(filter)

  if (voice.overtone > 0) {
    const shine = envelopeGain(ctx, at, voice.peak * voice.overtone, voice.attack, voice.decay * 0.5)
    const osc = oscillator(ctx, at, "sine", voice, 2, 0)
    osc.connect(shine)
    shine.connect(filter)
    made.push(shine)
    sources.push(osc)
  }

  let tail: NodeLike = filter
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner()
    panner.pan.setValueAtTime(voice.pan, at)
    filter.connect(panner)
    made.push(panner)
    tail = panner
  }
  tail.connect(bus.dry)
  if (bus.room && wet > 0) {
    const send = ctx.createGain()
    send.gain.setValueAtTime(wet, at)
    tail.connect(send)
    send.connect(bus.room)
    made.push(send)
  }

  for (const source of sources) {
    source.start(at)
    source.stop(stopAt)
  }
  made.push(...sources)
  /* Every source stops at the same moment; the first one's end lets the whole voice go. */
  releaseWhenDone(sources[0], made)
  return stopAt
}

/* ── The sounds ────────────────────────────────────────────────────────── */

export interface SoundDesign {
  voices: Voice[]
  /** How much of each voice goes to the room, against its dry level. */
  wet: number
}

const note = (v: Partial<Voice> & Pick<Voice, "frequency" | "peak" | "decay">): Voice => ({
  offset: 0,
  attack: 0.008,
  wave: "sine",
  detune: 4,
  overtone: 0.15,
  bright: 4200,
  dark: 1500,
  pan: 0,
  ...v,
})

/**
 * Every sound, as notes. The peaks are calibrated so each one, rendered
 * through the room and the limiter, reaches PEAK_GAIN (measured offline in
 * Chromium by scripts/check-ask-ai.mjs; the stub test holds the shapes).
 */
export const SOUND_DESIGN: Record<AskSound, SoundDesign> = {
  /* A tick, not a note: triangle for a little edge, a 4ms attack, a fifth of glide, almost dry. */
  "record-start": {
    wet: 0.08,
    voices: [note({ frequency: 740, glideTo: 1110, glideTime: 0.05, peak: 0.147, attack: 0.004, decay: 0.12, wave: "triangle", detune: 3, overtone: 0, bright: 3800, dark: 1800 })],
  },
  "record-stop": {
    wet: 0.08,
    voices: [note({ frequency: 1110, glideTo: 740, glideTime: 0.05, peak: 0.147, attack: 0.004, decay: 0.12, wave: "triangle", detune: 3, overtone: 0, bright: 3800, dark: 1800 })],
  },
  /* A pluck: triangle under a filter that shuts fast, two notes a fifth apart, rising, left then right. */
  sent: {
    wet: 0.22,
    voices: [
      note({ frequency: 880, peak: 0.113, attack: 0.005, decay: 0.24, wave: "triangle", overtone: 0.2, bright: 5200, dark: 1300, pan: -0.18 }),
      note({ frequency: 1318.51, offset: 0.07, peak: 0.102, attack: 0.005, decay: 0.34, wave: "triangle", overtone: 0.2, bright: 5200, dark: 1300, pan: 0.18 }),
    ],
  },
  /* Rounder and slower: sines, a softer attack, the upper note held longer, unresolved. */
  question: {
    wet: 0.25,
    voices: [
      note({ frequency: 587.33, peak: 0.113, attack: 0.012, decay: 0.3, overtone: 0.12, bright: 3200, dark: 1600, pan: -0.12 }),
      note({ frequency: 987.77, offset: 0.14, peak: 0.118, attack: 0.012, decay: 0.55, overtone: 0.12, bright: 3200, dark: 1600, pan: 0.12 }),
    ],
  },
  /* C major, rolled from the bottom in 100ms, spread left to right, ringing out. */
  done: {
    wet: 0.22,
    voices: [
      note({ frequency: 523.25, peak: 0.079, decay: 0.75, pan: -0.25, detune: 5, overtone: 0.18, bright: 3800 }),
      note({ frequency: 659.25, offset: 0.05, peak: 0.073, decay: 0.8, pan: 0, detune: 5, overtone: 0.18, bright: 3800 }),
      note({ frequency: 783.99, offset: 0.1, peak: 0.07, decay: 0.9, pan: 0.25, detune: 5, overtone: 0.18, bright: 3800 }),
    ],
  },
  /* Low, dark and soft: triangle through a closed filter, a minor third falling. */
  error: {
    wet: 0.18,
    voices: [
      note({ frequency: 329.63, peak: 0.098, attack: 0.012, decay: 0.3, wave: "triangle", overtone: 0.4, bright: 2200, dark: 1000, pan: 0.1 }),
      note({ frequency: 277.18, offset: 0.13, peak: 0.098, attack: 0.012, decay: 0.45, wave: "triangle", overtone: 0.4, bright: 2200, dark: 1000, pan: -0.1 }),
    ],
  },
}

/**
 * When each one's sources stop, in seconds from its start. The room rings on
 * after this, falling away over REVERB.seconds.
 */
export const SOUND_LENGTH: Record<AskSound, number> = Object.fromEntries(
  ASK_SOUNDS.map((sound) => [sound, Math.max(...SOUND_DESIGN[sound].voices.map((v) => v.offset + v.decay + 0.02))]),
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
  for (const voice of design.voices) end = Math.max(end, playVoice(ctx, start, bus, voice, design.wet))
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
