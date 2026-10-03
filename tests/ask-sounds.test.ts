/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS, SCHEDULED AGAINST A STUB AUDIOCONTEXT
 * ===========================================================================
 * lib/website-builder/ask-sounds.ts builds each sound from a few Web Audio
 * nodes, through one shared room (a convolver reverb) and a limiter. Here a
 * stub context records every node, connection, ramp, start and stop. How
 * loud and how long each one really is, with the room ringing, is rendered
 * and measured in Chromium by scripts/check-ask-ai.mjs (SOUNDS).
 *
 *   EVERY SOUND   all six exist and build, on the server too, with no
 *                 AudioContext anywhere
 *   SHAPE         ticks glide, sent is a rising pluck, question a rising
 *                 sixth left hanging, done a major chord rolled upwards,
 *                 error a low minor third falling
 *   VOICE         two oscillators a few cents apart, a 4ms or softer attack,
 *                 an exponential release, a low pass that closes, a little
 *                 pan
 *   ROOM          one convolver per context, its impulse made here once:
 *                 stereo, 1.5s, a pre-delay, falling 60 dB; sent to at 15
 *                 to 25 percent; a limiter after, its makeup gain trimmed
 *   TIDY          every source starts and stops, every node reaches the
 *                 output, a voice lets go once played and the room stays
 *   WHEN          never before a person has touched the page; one context;
 *                 a suspended one is resumed first; off stays off; nothing
 *                 ever throws
 *   MICROPHONE    the iOS audio session is ambient for the sounds and auto
 *                 while recording
 *
 * Run with:  npm run test:push
 */
import {
  ASK_SOUNDS,
  LIMITER,
  LIMITER_SETTLE,
  PEAK_GAIN,
  REVERB,
  SOUND_DESIGN,
  SOUND_LENGTH,
  SOUNDS_KEY,
  armAskSounds,
  closeMicrophoneSession,
  impulseResponse,
  limiterMakeup,
  openMicrophoneSession,
  playAskSound,
  resetAskSoundsForTest,
  scheduleSound,
  setSoundsOn,
  soundsOn,
  type AskSound,
} from "../lib/website-builder/ask-sounds"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const section = (name: string) => console.log(`\n${name}`)

/* ── the stub ────────────────────────────────────────────────────────── */

type Event = { kind: "set" | "linear" | "exp"; value: number; time: number }

class Param {
  value = 0
  events: Event[] = []
  setValueAtTime(value: number, time: number) { this.events.push({ kind: "set", value, time }) }
  linearRampToValueAtTime(value: number, time: number) { this.events.push({ kind: "linear", value, time }) }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError("an exponential ramp cannot reach zero")
    this.events.push({ kind: "exp", value, time })
  }
  /** The value at time t, as Web Audio computes it from the events. */
  at(t: number): number {
    let v = this.value
    let from = { value: this.value, time: 0 }
    for (const e of this.events) {
      if (e.kind === "set") {
        if (e.time <= t) { v = e.value; from = { value: e.value, time: e.time } } else break
        continue
      }
      if (t >= e.time) { v = e.value; from = { value: e.value, time: e.time }; continue }
      const f = (t - from.time) / (e.time - from.time)
      if (f < 0) break
      v = e.kind === "linear" ? from.value + (e.value - from.value) * f : from.value * Math.pow(e.value / from.value, f)
      break
    }
    return v
  }
}

class Node {
  kind: string
  outputs: Node[] = []
  disconnected = false
  constructor(kind: string) { this.kind = kind }
  connect(destination: Node) { this.outputs.push(destination); return destination }
  disconnect() { this.disconnected = true }
}
class Gain extends Node { gain = new Param(); constructor() { super("gain"); this.gain.value = 1 } }
class Source extends Node {
  started: number | null = null
  stopped: number | null = null
  onended: (() => void) | null = null
  start(when = 0) { this.started = when }
  stop(when = 0) { this.stopped = when }
}
class Oscillator extends Source { type = "sine"; frequency = new Param(); detune = new Param(); constructor() { super("oscillator") } }
class Filter extends Node { type = "lowpass"; frequency = new Param(); Q = new Param(); constructor() { super("filter") } }
class Buffer {
  channels: Float32Array[]
  constructor(channels: number, length: number) { this.channels = Array.from({ length: channels }, () => new Float32Array(length)) }
  getChannelData(channel = 0) { return this.channels[channel] }
}
class BufferSource extends Source { buffer: Buffer | null = null; constructor() { super("buffer-source") } }
class Convolver extends Node { buffer: Buffer | null = null; normalize = true; constructor() { super("convolver") } }
class Compressor extends Node {
  threshold = new Param(); knee = new Param(); ratio = new Param(); attack = new Param(); release = new Param()
  constructor() { super("compressor") }
}
class Panner extends Node { pan = new Param(); constructor() { super("panner") } }

class StubContext {
  currentTime = 0
  sampleRate = 48000
  state = "running"
  destination = new Node("destination")
  made: Node[] = []
  resumes = 0
  failing = false
  protected keep<T extends Node>(node: T): T { if (this.failing) throw new Error("no"); this.made.push(node); return node }
  createGain() { return this.keep(new Gain()) }
  createOscillator() { return this.keep(new Oscillator()) }
  createBiquadFilter() { return this.keep(new Filter()) }
  createBuffer(channels: number, length: number) { return new Buffer(channels, length) }
  createBufferSource() { return this.keep(new BufferSource()) }
  createConvolver() { return this.keep(new Convolver()) }
  createDynamicsCompressor() { return this.keep(new Compressor()) }
  createStereoPanner() { return this.keep(new Panner()) }
  resume() { this.resumes++; this.state = "running"; return Promise.resolve() }
}

/** An older browser: no convolver, no compressor, no stereo panner. */
class BareContext extends StubContext {
  constructor() {
    super()
    for (const m of ["createConvolver", "createDynamicsCompressor", "createStereoPanner"]) (this as unknown as Record<string, unknown>)[m] = undefined
  }
}

const reaches = (node: Node, target: Node, seen = new Set<Node>()): boolean => {
  if (node === target) return true
  if (seen.has(node)) return false
  seen.add(node)
  return node.outputs.some((next) => reaches(next, target, seen))
}

function play(sound: AskSound, at = 1, ctx: StubContext = new StubContext()) {
  const out = new Node("out")
  const end = scheduleSound(ctx as never, sound, at, out as never)
  const oscillators = ctx.made.filter((n): n is Oscillator => n instanceof Oscillator)
  /* A voice is two oscillators into one envelope; the octave partial has its own. */
  const voices = new Map<Gain, Oscillator[]>()
  for (const o of oscillators) {
    const g = o.outputs[0] as Gain
    voices.set(g, [...(voices.get(g) ?? []), o])
  }
  const bodies = [...voices.entries()].filter(([, os]) => os.length === 2).map(([gain, os]) => ({ gain, oscillators: os, start: os[0].started ?? 0 }))
  bodies.sort((a, b) => a.start - b.start)
  const filters = ctx.made.filter((n): n is Filter => n instanceof Filter)
  const convolvers = ctx.made.filter((n): n is Convolver => n instanceof Convolver)
  const compressors = ctx.made.filter((n): n is Compressor => n instanceof Compressor)
  const panners = ctx.made.filter((n): n is Panner => n instanceof Panner)
  return { ctx, out, end, oscillators, bodies, filters, convolvers, compressors, panners }
}

/** A voice's pitch at its start (with its detune taken out: the pair is symmetric). */
const pitch = (b: { oscillators: Oscillator[]; start: number }) => b.oscillators[0].frequency.at(b.start)
const ratio = (a: number, b: number) => b / a
const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance

// ---------------------------------------------------------------------------
section("Every sound, and none of them needs an AudioContext to exist")
// ---------------------------------------------------------------------------
{
  check(
    "six sounds: the two ticks, sent, question, done and error",
    ASK_SOUNDS.join(",") === "record-start,record-stop,sent,question,done,error" && ASK_SOUNDS.every((s) => SOUND_DESIGN[s] && SOUND_LENGTH[s] > 0),
  )
  check("this test runs with no window and no AudioContext at all", typeof (globalThis as { window?: unknown }).window === "undefined" && typeof (globalThis as { AudioContext?: unknown }).AudioContext === "undefined")
  let threw = false
  try { for (const s of ASK_SOUNDS) play(s) } catch { threw = true }
  check("each one builds against a context it is handed", !threw)
  let threwBare = false
  let bareSources = 0
  try { for (const s of ASK_SOUNDS) bareSources += play(s, 1, new BareContext()).oscillators.length } catch { threwBare = true }
  check("and against a browser without a convolver, a compressor or a panner: the same notes, dry", !threwBare && bareSources > 0)
  let threwServer = false
  try { playAskSound("done"); armAskSounds(); openMicrophoneSession(); closeMicrophoneSession() } catch { threwServer = true }
  check("on the server nothing plays and nothing throws", !threwServer)
  const signatures = ASK_SOUNDS.map((s) => SOUND_DESIGN[s].voices.map((v) => `${v.frequency}>${v.glideTo ?? ""}@${v.offset}`).join(" "))
  check("no two sound alike", new Set(signatures).size === ASK_SOUNDS.length)
}

// ---------------------------------------------------------------------------
section("Each sound, its shape")
// ---------------------------------------------------------------------------
{
  const start = play("record-start")
  const stop = play("record-stop")
  const [up] = start.bodies
  const [down] = stop.bodies
  check("record start is one soft tick: a pair of triangles", start.bodies.length === 1 && up.oscillators.every((o) => o.type === "triangle"))
  check("that glides up a fifth", near(ratio(up.oscillators[0].frequency.at(1), up.oscillators[0].frequency.at(1.08)), 1.5), `${up.oscillators[0].frequency.at(1)} -> ${up.oscillators[0].frequency.at(1.08)}`)
  check("and record stop glides down the same fifth", stop.bodies.length === 1 && near(ratio(down.oscillators[0].frequency.at(1), down.oscillators[0].frequency.at(1.08)), 1 / 1.5))
  check("both over in about a tenth of a second", SOUND_LENGTH["record-start"] <= 0.15 && SOUND_LENGTH["record-stop"] <= 0.15, JSON.stringify(SOUND_LENGTH))

  const sent = play("sent")
  check("sent is two notes", sent.bodies.length === 2)
  check("rising a fifth, the second 50 to 90ms after the first", near(ratio(pitch(sent.bodies[0]), pitch(sent.bodies[1])), 1.5) && sent.bodies[1].start - sent.bodies[0].start >= 0.05 && sent.bodies[1].start - sent.bodies[0].start <= 0.09)
  check(
    "a pluck: triangles, a 5ms attack, a filter that shuts to a quarter or less",
    SOUND_DESIGN.sent.voices.every((v) => v.wave === "triangle" && v.attack <= 0.006 && v.dark <= v.bright / 4),
  )

  const question = play("question")
  check("question is two notes", question.bodies.length === 2)
  check("rising a major sixth", near(ratio(pitch(question.bodies[0]), pitch(question.bodies[1])), Math.pow(2, 9 / 12)))
  const [q1, q2] = SOUND_DESIGN.question.voices
  check(
    "rounder and slower than sent: sines, a softer attack, a wider gap, the top note left ringing longer",
    q1.wave === "sine" && q2.wave === "sine" && q1.attack >= 0.01 && q2.offset > SOUND_DESIGN.sent.voices[1].offset && q2.decay > q1.decay,
  )

  const done = play("done")
  const [c, e, g] = done.bodies
  check("done is three notes", done.bodies.length === 3)
  check("a major chord: a major third and a fifth over the root", near(ratio(pitch(c), pitch(e)), Math.pow(2, 4 / 12)) && near(ratio(pitch(c), pitch(g)), 1.5))
  check("rolled upwards quickly, all three within 120ms", c.start < e.start && e.start < g.start && g.start - c.start <= 0.12)
  check("in sines, and ringing about three quarters of a second", done.oscillators.every((o) => o.type === "sine") && SOUND_LENGTH.done >= 0.7 && SOUND_LENGTH.done <= 1.05)
  check("spread from left to right as it rises", SOUND_DESIGN.done.voices[0].pan < SOUND_DESIGN.done.voices[1].pan && SOUND_DESIGN.done.voices[1].pan < SOUND_DESIGN.done.voices[2].pan)

  const error = play("error")
  check("error is two notes", error.bodies.length === 2)
  check("falling a minor third", near(ratio(pitch(error.bodies[0]), pitch(error.bodies[1])), Math.pow(2, -3 / 12)))
  check("and low: the lowest notes of any sound, under 400Hz", error.bodies.every((b) => pitch(b) < 400) && ASK_SOUNDS.filter((s) => s !== "error").every((s) => SOUND_DESIGN[s].voices.every((v) => v.frequency >= 500)))
  check("darker than the rest: its filter starts lowest", SOUND_DESIGN.error.voices.every((v) => ASK_SOUNDS.filter((s) => s !== "error").every((s) => SOUND_DESIGN[s].voices.every((w) => v.bright < w.bright))))
}

// ---------------------------------------------------------------------------
section("Every note, made the same careful way")
// ---------------------------------------------------------------------------
{
  for (const sound of ASK_SOUNDS) {
    const r = play(sound)
    const problems: string[] = []
    for (const b of r.bodies) {
      const cents = b.oscillators.map((o) => o.detune.at(b.start)).sort((x, y) => x - y)
      if (!(cents[0] === -cents[1] && cents[1] > 0 && cents[1] <= 8)) problems.push(`detune ${cents}`)
      const rise = b.gain.gain.events.find((ev) => ev.kind === "linear")
      const attack = rise ? rise.time - b.start : 0
      if (attack < 0.004) problems.push(`attack ${attack}`)
      const fall = b.gain.gain.events.find((ev) => ev.kind === "exp")
      if (!fall || fall.value > 0.001) problems.push("no exponential release to silence")
      const filter = b.gain.outputs[0] as Filter
      if (!(filter instanceof Filter) || filter.type !== "lowpass" || !(filter.frequency.at(b.start + 0.5) < filter.frequency.at(b.start))) problems.push("no closing low pass")
      const panner = filter.outputs[0] as Panner
      if (!(panner instanceof Panner) || Math.abs(panner.pan.at(b.start)) > 0.3) problems.push("pan")
    }
    check(`${sound}: detuned pairs, an attack of 4ms or more, an exponential release, a closing low pass, a little pan`, problems.length === 0, problems.join("; "))
  }
  check("no note is set louder than 0.15 before the room: modest, the probe measures the rest", ASK_SOUNDS.every((s) => SOUND_DESIGN[s].voices.every((v) => v.peak <= 0.15)))
  check("and the target after it all is -20 dBFS", Math.abs(20 * Math.log10(PEAK_GAIN) + 20) < 1e-9)
}

// ---------------------------------------------------------------------------
section("The room, and the limiter")
// ---------------------------------------------------------------------------
{
  const r = play("sent")
  const [convolver] = r.convolvers
  check("one convolver, normalize off so the send level is the wet level", r.convolvers.length === 1 && convolver.normalize === false && !!convolver.buffer)
  const ir = convolver.buffer!
  const [left, right] = ir.channels
  check("its impulse is stereo, 1.5s long", ir.channels.length === 2 && left.length === Math.round(48000 * REVERB.seconds) && REVERB.seconds >= 1.2 && REVERB.seconds <= 1.8)
  const delay = Math.round(48000 * REVERB.preDelay)
  check("with a pre-delay of silence first", left.slice(0, delay).every((v) => v === 0) && Math.abs(left[delay + 400]) + Math.abs(left[delay + 401]) > 0)
  const rms = (d: Float32Array, from: number, to: number) => Math.sqrt(d.slice(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from))
  const head = rms(left, delay, delay + 4800)
  const tail = rms(left, left.length - 4800, left.length)
  check("and a tail that falls about 60 dB", 20 * Math.log10(tail / head) < -45, `${(20 * Math.log10(tail / head)).toFixed(1)} dB`)
  const zeroCross = (d: Float32Array, from: number, to: number) => { let n = 0; for (let i = from + 1; i < to; i++) if (Math.sign(d[i]) !== Math.sign(d[i - 1])) n++; return n / (to - from) }
  check("darkening as it goes: fewer crossings late than early", zeroCross(left, left.length - 9600, left.length) < zeroCross(left, delay, delay + 9600) * 0.6)
  check("each side different, so the tail is wide", left.some((v, i) => v !== right[i]))
  const energy = left.reduce((s, v) => s + v * v, 0)
  check("scaled to unit energy", Math.abs(energy - 1) < 1e-3, String(energy))
  check("made once per sample rate and kept", impulseResponse(48000) === impulseResponse(48000) && impulseResponse(44100)[0].length === Math.round(44100 * REVERB.seconds))

  const again = scheduleSound(r.ctx as never, "done", 2, r.out as never)
  check("the room is built once per context: a second sound adds no convolver or limiter", again > 2 && r.ctx.made.filter((n) => n instanceof Convolver).length === 1 && r.ctx.made.filter((n) => n instanceof Compressor).length === 1)

  const sends = ASK_SOUNDS.map((s) => [s, SOUND_DESIGN[s].wet] as const)
  check(
    "the room is mixed low: 15 to 25 percent for the notes, less for the ticks",
    sends.every(([s, w]) => (s.startsWith("record") ? w > 0 && w < 0.15 : w >= 0.15 && w <= 0.25)),
    JSON.stringify(Object.fromEntries(sends)),
  )
  const sendGains = r.ctx.made.filter((n): n is Gain => n instanceof Gain && n.outputs.some((o) => o instanceof Gain && o.outputs[0] instanceof Convolver))
  check("each note sends to it at that level", sendGains.length >= 2 && sendGains.every((gn) => gn.gain.events.some((ev) => near(ev.value, SOUND_DESIGN.sent.wet, 1e-9))))

  const [limiter] = r.compressors
  check(
    "one limiter after dry and wet: -6 dBFS, ratio 12, fast",
    r.compressors.length === 1 && limiter.threshold.value === LIMITER.threshold && limiter.ratio.value >= 10 && limiter.attack.value <= 0.005 && reaches(convolver, limiter),
  )
  const trim = limiter.outputs[0] as Gain
  check("its makeup gain taken back out, so below the threshold the chain is unity", trim instanceof Gain && near(trim.gain.value * limiterMakeup(), 1, 1e-9) && near(limiterMakeup(), 1.4625, 0.001), String(limiterMakeup()))
  check("well above the loudest sound: 14 dB of room", LIMITER.threshold - 20 * Math.log10(PEAK_GAIN) >= 12)

  const fresh = new StubContext()
  const out = new Node("out")
  const end = scheduleSound(fresh as never, "sent", 0, out as never)
  const firstStart = Math.min(...fresh.made.filter((n): n is Source => n instanceof Source).map((s) => s.started ?? 0))
  check("a sound asked for the instant the room is built waits for the limiter to settle", near(firstStart, LIMITER_SETTLE, 1e-9) && near(end - LIMITER_SETTLE, SOUND_LENGTH.sent, 1e-9))
}

// ---------------------------------------------------------------------------
section("Tidy")
// ---------------------------------------------------------------------------
{
  for (const sound of ASK_SOUNDS) {
    const r = play(sound, 2)
    const sources = r.ctx.made.filter((n): n is Source => n instanceof Source)
    check(`${sound}: every source starts when asked or after, and stops by its end`, sources.every((s) => (s.started ?? 0) >= 2) && sources.every((s) => s.stopped !== null && (s.stopped ?? 0) <= r.end + 1e-9))
    check(`${sound}: says how long it is`, near(r.end - 2, SOUND_LENGTH[sound], 1e-9))
    check(`${sound}: every node it made reaches the output`, r.ctx.made.every((n) => reaches(n, r.out)))
    for (const s of sources) s.onended?.()
    const room = new Set<Node>([...r.convolvers, ...r.compressors])
    const voiceNodes = r.ctx.made.filter((n) => n instanceof Source || n instanceof Panner || (n instanceof Filter && n.outputs[0] instanceof Panner) || (n instanceof Gain && n.outputs[0] instanceof Filter))
    check(`${sound}: its notes let go of their nodes once played`, voiceNodes.length > 0 && voiceNodes.every((n) => n.disconnected))
    check(`${sound}: and the room stays for the next one`, [...room].every((n) => !n.disconnected))
  }
}

/* Resuming a context is a promise, so this part waits for it, inside a function rather than at the top level. */
async function whenItPlays() {
  section("When it plays, and when it does not")
  const listeners = new Map<string, (() => void)[]>()
  const stored = new Map<string, string>()
  let made = 0
  let lastContext: StubContext | null = null
  let makeSuspended = false
  class Ctor extends StubContext {
    constructor() {
      super()
      made++
      if (makeSuspended) this.state = "suspended"
      lastContext = this
    }
  }
  const session = { type: "auto" }
  const nav = (globalThis as { navigator?: object }).navigator
  if (nav) Object.defineProperty(nav, "audioSession", { configurable: true, value: session })
  const w = {
    AudioContext: Ctor,
    localStorage: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) },
    addEventListener: (type: string, fn: () => void) => listeners.set(type, [...(listeners.get(type) ?? []), fn]),
    removeEventListener: (type: string, fn: () => void) => listeners.set(type, (listeners.get(type) ?? []).filter((f) => f !== fn)),
  }
  ;(globalThis as unknown as { window: unknown }).window = w
  const gesture = (type = "pointerdown") => (listeners.get(type) ?? []).forEach((fn) => fn())
  const flush = () => new Promise((r) => setTimeout(r, 0))

  resetAskSoundsForTest()
  playAskSound("done")
  check("before anybody has touched the page, nothing is made and nothing plays", made === 0)
  armAskSounds()
  armAskSounds()
  check("armed once, whatever calls it", (listeners.get("pointerdown") ?? []).length === 1 && (listeners.get("touchend") ?? []).length === 1)
  gesture("pointerdown")
  check("the first press makes the one context, inside the gesture", made === 1 && lastContext !== null)
  const ctx = lastContext as unknown as StubContext
  check("and builds the room then, so its limiter has settled before the first sound", ctx.made.some((n) => n instanceof Convolver) && ctx.made.some((n) => n instanceof Compressor))
  check("but plays nothing you could hear", !ctx.made.some((n) => n instanceof Oscillator))
  check("and lets go of the listeners once it is running", (listeners.get("pointerdown") ?? []).length === 0 && (listeners.get("keydown") ?? []).length === 0)
  if (nav) check("on iOS 17 and later the page's audio session becomes ambient, as a system sound is", session.type === "ambient")
  const before = ctx.made.length
  playAskSound("sent")
  check("then a sound plays on that same context, through the same room", made === 1 && ctx.made.length > before && ctx.made.filter((n) => n instanceof Convolver).length === 1)

  setSoundsOn(false)
  check("off is remembered", stored.get(SOUNDS_KEY) === "off" && soundsOn() === false)
  const quiet = ctx.made.length
  for (const s of ASK_SOUNDS) playAskSound(s)
  check("and off is silent, every sound", ctx.made.length === quiet)
  setSoundsOn(true)
  check("on again", soundsOn() === true && stored.get(SOUNDS_KEY) === "on")
  check("on by default", soundsOn({ getItem: () => null, setItem: () => {} }) === true)
  check("and on when storage refuses to be read", soundsOn({ getItem: () => { throw new Error("blocked") }, setItem: () => {} }) === true)

  ctx.state = "suspended"
  const resumesBefore = ctx.resumes
  const count = ctx.made.length
  playAskSound("question")
  await flush()
  check("a context the system suspended is resumed first, then the sound plays", ctx.resumes > resumesBefore && ctx.made.length > count)

  ctx.failing = true
  let threw = false
  try { playAskSound("error") } catch { threw = true }
  check("a context that refuses to make a node is silence, not an exception", !threw)
  ctx.failing = false

  if (nav) {
    section("The microphone and the audio session")
    openMicrophoneSession()
    check("opening the microphone puts the session back to auto: an ambient one has no input on iOS", session.type === "auto")
    closeMicrophoneSession()
    check("and closing it makes it ambient again, for the sounds", session.type === "ambient")
    resetAskSoundsForTest()
    session.type = "auto"
    openMicrophoneSession()
    gesture("pointerdown")
    check("a context first made while the microphone is open leaves the session alone", session.type === "auto")
    closeMicrophoneSession()
    check("until the microphone closes", session.type === "ambient")
    resetAskSoundsForTest()
    session.type = "auto"
    openMicrophoneSession()
    closeMicrophoneSession()
    check("with no sounds made on the page, closing leaves it on auto", session.type === "auto")
  }

  resetAskSoundsForTest()
  makeSuspended = true
  ;(globalThis as unknown as { window: unknown }).window = { ...w, AudioContext: undefined }
  let threw2 = false
  try { armAskSounds(); gesture("keydown"); playAskSound("done") } catch { threw2 = true }
  check("a browser without Web Audio is silent and never throws", !threw2)
  delete (globalThis as unknown as { window?: unknown }).window
  if (nav) delete (nav as { audioSession?: unknown }).audioSession
  resetAskSoundsForTest()
  let threw3 = false
  try { playAskSound("sent"); armAskSounds() } catch { threw3 = true }
  check("and on the server there is no window: nothing happens", !threw3)
}

void whenItPlays().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
})
