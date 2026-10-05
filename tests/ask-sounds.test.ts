/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS, SCHEDULED AGAINST A STUB AUDIOCONTEXT
 * ===========================================================================
 * lib/website-builder/ask-sounds.ts builds each sound from a few Web Audio
 * nodes, through one shared room (a small convolver reverb), a high pass and
 * a limiter. Here a stub context records every node, connection, ramp, start
 * and stop. How loud, how bright and how long each one really is, with the
 * room ringing, is rendered and measured in Chromium by
 * scripts/check-ask-sounds.mjs.
 *
 *   EVERY SOUND   all seven exist and build, on the server too, with no
 *                 AudioContext anywhere
 *   SHAPE         short: sent a tock up, upload a double tick, question a
 *                 major third rising, done a major chord rolled upwards,
 *                 error a low minor third falling, the two mic ticks
 *   STRIKE        a 3 to 8ms attack, an exponential fall, a low thump, wood
 *                 partials that fade first, a short click, a fixed tone; no
 *                 glide, no vibrato, no detuned pair
 *   ROOM          one convolver per context, its impulse made here once:
 *                 stereo, 0.4s, a pre-delay, falling 60 dB, a high cut; sent
 *                 to at 12 to 18 percent; a 60Hz high pass and a limiter
 *                 after, its makeup gain trimmed
 *   TIDY          every source starts and stops, every node reaches the
 *                 output, a strike lets go once played and the room stays
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
  BODY_DECAY,
  HIGH_PASS,
  LIMITER,
  LIMITER_SETTLE,
  PEAK_DBFS,
  PEAK_GAIN,
  REVERB,
  ROOM_HIGH_CUT,
  SOUND_DESIGN,
  SOUND_LENGTH,
  SOUNDS_KEY,
  armAskSounds,
  bodyFrequency,
  clickNoise,
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

/** One strike as the stub saw it: the sines into their envelopes, the click, all into one low pass. */
interface Heard {
  tone: Filter
  start: number
  note: Oscillator
  noteGain: Gain
  sines: Oscillator[]
  click: BufferSource | null
}

function play(sound: AskSound, at = 1, ctx: StubContext = new StubContext()) {
  const out = new Node("out")
  const end = scheduleSound(ctx as never, sound, at, out as never)
  const oscillators = ctx.made.filter((n): n is Oscillator => n instanceof Oscillator)
  const clicks = ctx.made.filter((n): n is BufferSource => n instanceof BufferSource)
  const byTone = new Map<Filter, Heard>()
  const strikeOf = (tone: Filter, start: number) => {
    let s = byTone.get(tone)
    if (!s) {
      s = { tone, start, note: null as never, noteGain: null as never, sines: [], click: null }
      byTone.set(tone, s)
    }
    return s
  }
  for (const o of oscillators) {
    const env = o.outputs[0] as Gain
    const s = strikeOf(env.outputs[0] as Filter, o.started ?? 0)
    s.sines.push(o)
  }
  for (const c of clicks) {
    const band = c.outputs[0] as Filter
    const env = band.outputs[0] as Gain
    strikeOf(env.outputs[0] as Filter, c.started ?? 0).click = c
  }
  const strikes = [...byTone.values()].sort((a, b) => a.start - b.start)
  /* The note is the sine its design names; the first one made for the strike. */
  for (const s of strikes) {
    s.note = s.sines[0]
    s.noteGain = s.note.outputs[0] as Gain
  }
  const filters = ctx.made.filter((n): n is Filter => n instanceof Filter)
  const convolvers = ctx.made.filter((n): n is Convolver => n instanceof Convolver)
  const compressors = ctx.made.filter((n): n is Compressor => n instanceof Compressor)
  const panners = ctx.made.filter((n): n is Panner => n instanceof Panner)
  return { ctx, out, end, oscillators, clicks, strikes, filters, convolvers, compressors, panners }
}

/** A strike's pitch, read from the oscillator itself. */
const pitch = (s: Heard) => s.note.frequency.at(s.start)
const ratio = (a: number, b: number) => b / a
const near = (a: number, b: number, tolerance = 0.01) => Math.abs(a - b) <= tolerance
const semitones = (n: number) => Math.pow(2, n / 12)
const attackOf = (g: Gain, start: number) => (g.gain.events.find((ev) => ev.kind === "linear")?.time ?? start) - start
const endOf = (g: Gain, start: number) => (g.gain.events.find((ev) => ev.kind === "exp")?.time ?? start) - start

// ---------------------------------------------------------------------------
section("Every sound, and none of them needs an AudioContext to exist")
// ---------------------------------------------------------------------------
{
  check(
    "seven sounds: the two ticks, sent, upload, question, done and error",
    ASK_SOUNDS.join(",") === "record-start,record-stop,sent,upload,question,done,error" && ASK_SOUNDS.every((s) => SOUND_DESIGN[s] && SOUND_LENGTH[s] > 0),
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
  try { playAskSound("done"); playAskSound("upload"); armAskSounds(); openMicrophoneSession(); closeMicrophoneSession() } catch { threwServer = true }
  check("on the server nothing plays and nothing throws", !threwServer)
  const signatures = ASK_SOUNDS.map((s) => SOUND_DESIGN[s].strikes.map((v) => `${v.frequency}@${v.offset}`).join(" "))
  check("no two sound alike", new Set(signatures).size === ASK_SOUNDS.length)
}

// ---------------------------------------------------------------------------
section("Each sound, its shape: short, and one family")
// ---------------------------------------------------------------------------
{
  const start = play("record-start")
  const stop = play("record-stop")
  check("record start is one tick, record stop one lower tick", start.strikes.length === 1 && stop.strikes.length === 1 && pitch(stop.strikes[0]) < pitch(start.strikes[0]))
  check("both over in under a tenth of a second", SOUND_LENGTH["record-start"] <= 0.1 && SOUND_LENGTH["record-stop"] <= 0.1, JSON.stringify(SOUND_LENGTH))

  const sent = play("sent")
  const [grace, tock] = sent.strikes
  check("sent is a soft tock up: a quiet grace, then the note a fourth above it", sent.strikes.length === 2 && near(ratio(pitch(grace), pitch(tock)), semitones(5)) && SOUND_DESIGN.sent.strikes[0].level < SOUND_DESIGN.sent.strikes[1].level)
  check("  the note 30 to 50ms after the grace", tock.start - grace.start >= 0.03 && tock.start - grace.start <= 0.05)
  check("  and over in 120 to 180ms", SOUND_LENGTH.sent >= 0.12 && SOUND_LENGTH.sent <= 0.18, String(SOUND_LENGTH.sent))

  const upload = play("upload")
  const [t1, t2] = upload.strikes
  check("upload is a light double tick: the same note twice, 60 to 90ms apart, the second softer", upload.strikes.length === 2 && near(pitch(t1), pitch(t2)) && t2.start - t1.start >= 0.06 && t2.start - t1.start <= 0.09 && SOUND_DESIGN.upload.strikes[1].level < SOUND_DESIGN.upload.strikes[0].level)
  check("  over in about 150ms", SOUND_LENGTH.upload >= 0.12 && SOUND_LENGTH.upload <= 0.18, String(SOUND_LENGTH.upload))
  check("  light: less thump than any of the notes", SOUND_DESIGN.upload.strikes.every((u) => (["sent", "question", "done", "error"] as const).every((s) => SOUND_DESIGN[s].strikes.every((v) => u.body < v.body))))

  const question = play("question")
  check("question is two notes, rising a major third", question.strikes.length === 2 && near(ratio(pitch(question.strikes[0]), pitch(question.strikes[1])), semitones(4)))
  const [q1, q2] = SOUND_DESIGN.question.strikes
  check("  gentler than sent: a softer attack, a wider gap, the top note a little longer", q1.attack > SOUND_DESIGN.sent.strikes[1].attack && q2.offset > SOUND_DESIGN.sent.strikes[1].offset && q2.decay > q1.decay)
  check("  about a quarter of a second", SOUND_LENGTH.question >= 0.22 && SOUND_LENGTH.question <= 0.28, String(SOUND_LENGTH.question))

  const done = play("done")
  const [c, e, g] = done.strikes
  check("done is three notes", done.strikes.length === 3)
  check("  a major chord: a major third and a fifth over the root", near(ratio(pitch(c), pitch(e)), semitones(4)) && near(ratio(pitch(c), pitch(g)), 1.5))
  check("  rolled upwards quickly, all three within 120ms", c.start < e.start && e.start < g.start && g.start - c.start <= 0.12)
  check("  about a third of a second, the longest of them", SOUND_LENGTH.done >= 0.32 && SOUND_LENGTH.done <= 0.38 && ASK_SOUNDS.every((s) => SOUND_LENGTH[s] <= SOUND_LENGTH.done))
  check("  spread from left to right as it rises, the root's thump under it", SOUND_DESIGN.done.strikes[0].pan < SOUND_DESIGN.done.strikes[1].pan && SOUND_DESIGN.done.strikes[1].pan < SOUND_DESIGN.done.strikes[2].pan && SOUND_DESIGN.done.strikes[0].body >= Math.max(...SOUND_DESIGN.done.strikes.map((s) => s.body)))

  const error = play("error")
  check("error is two notes, falling a minor third", error.strikes.length === 2 && near(ratio(pitch(error.strikes[0]), pitch(error.strikes[1])), semitones(-3)))
  check("  low: the lowest notes of any sound, under 400Hz", error.strikes.every((s) => pitch(s) < 400) && ASK_SOUNDS.filter((s) => s !== "error").every((s) => SOUND_DESIGN[s].strikes.every((v) => v.frequency >= 500)))
  check("  soft: the slowest attack and the quietest click", SOUND_DESIGN.error.strikes.every((v) => ASK_SOUNDS.filter((s) => s !== "error").every((s) => SOUND_DESIGN[s].strikes.every((w) => v.attack >= w.attack && v.click <= w.click))))
  check("  darker than the rest: its low pass and its click band the lowest", ASK_SOUNDS.filter((s) => s !== "error").every((s) => SOUND_DESIGN.error.tone < SOUND_DESIGN[s].tone && SOUND_DESIGN.error.clickBand < SOUND_DESIGN[s].clickBand))
  check("  about a quarter of a second", SOUND_LENGTH.error >= 0.22 && SOUND_LENGTH.error <= 0.28, String(SOUND_LENGTH.error))
}

// ---------------------------------------------------------------------------
section("Every strike, made the same careful way: nothing glides, nothing wobbles")
// ---------------------------------------------------------------------------
{
  for (const sound of ASK_SOUNDS) {
    const r = play(sound)
    const design = SOUND_DESIGN[sound]
    const problems: string[] = []
    r.strikes.forEach((s, i) => {
      const want = design.strikes[i]
      if (!near(pitch(s), want.frequency, 1e-6)) problems.push(`pitch ${pitch(s)}`)
      const attack = attackOf(s.noteGain, s.start)
      if (attack < 0.003 - 1e-9 || attack > 0.008 + 1e-9) problems.push(`attack ${attack}`)
      const fall = s.noteGain.gain.events.find((ev) => ev.kind === "exp")
      if (!fall || fall.value > 0.001) problems.push("no exponential fall to silence")
      /* The thump: the note folded into 120 to 240Hz, over in under a tenth of a second. */
      const body = s.sines.find((o) => near(o.frequency.at(s.start), bodyFrequency(want.frequency), 1e-6) && o !== s.note)
      if (want.body > 0) {
        const f = body?.frequency.at(s.start) ?? 0
        if (!body || f < 120 || f >= 240) problems.push(`thump ${f}`)
        else if (endOf(body.outputs[0] as Gain, s.start) > BODY_DECAY + 1e-9) problems.push("thump too long")
      }
      /* The partials: whole multiples of the note, each gone before it. */
      for (const p of design.partials) {
        const o = s.sines.find((x) => near(x.frequency.at(s.start), want.frequency * p.ratio, 1e-6))
        if (!o) problems.push(`no partial at ${p.ratio}x`)
        else if (!(endOf(o.outputs[0] as Gain, s.start) < endOf(s.noteGain, s.start))) problems.push(`partial ${p.ratio}x outlasts the note`)
      }
      /* The click: band passed noise, over in a few milliseconds, under the note. */
      if (want.click > 0) {
        const band = s.click?.outputs[0] as Filter | undefined
        const env = band?.outputs[0] as Gain | undefined
        if (!s.click || !band || band.type !== "bandpass" || !env) problems.push("no click")
        else {
          if (endOf(env, s.start) > 0.025) problems.push("click too long")
          if (!(want.click < 1)) problems.push("click as loud as the note")
        }
      }
      if (s.tone.type !== "lowpass" || s.tone.frequency.events.length !== 1) problems.push("the tone filter moves")
      const panner = s.tone.outputs[0] as Panner
      if (!(panner instanceof Panner) || Math.abs(panner.pan.at(s.start)) > 0.3) problems.push("pan")
    })
    check(`${sound}: a 3 to 8ms attack, an exponential fall, a thump at 120 to 240Hz, partials that fade first, a short click, a fixed tone, a little pan`, problems.length === 0, problems.join("; "))
    const moving = r.oscillators.filter((o) => o.frequency.events.length !== 1 || o.frequency.events[0].kind !== "set" || o.detune.events.length > 0)
    check(`${sound}: every oscillator a sine with its frequency set once: no glide, no vibrato, no detuned pair to beat`, moving.length === 0 && r.oscillators.every((o) => o.type === "sine"), `${moving.length} moving`)
  }
  check("every sound's level modest before the room: 0.2 or less, the probe measures the rest", ASK_SOUNDS.every((s) => SOUND_DESIGN[s].gain > 0 && SOUND_DESIGN[s].gain <= 0.2))
  check("and the target after it all is -11 dBFS, five up from -16 so the send is heard", PEAK_DBFS === -11 && Math.abs(20 * Math.log10(PEAK_GAIN) - PEAK_DBFS) < 1e-9)
  const n1 = clickNoise(48000)
  check("the click's noise is 30ms, made once per sample rate and kept", n1 === clickNoise(48000) && n1.length === Math.round(48000 * 0.03) && n1.some((v) => v !== 0))
}

// ---------------------------------------------------------------------------
section("The room: small, tight and dark; the master: a high pass and a limiter")
// ---------------------------------------------------------------------------
{
  const r = play("sent")
  const [convolver] = r.convolvers
  check("one convolver, normalize off so the send level is the wet level", r.convolvers.length === 1 && convolver.normalize === false && !!convolver.buffer)
  const ir = convolver.buffer!
  const [left, right] = ir.channels
  check("its impulse is stereo and short: 0.25 to 0.45s, a room not a hall", ir.channels.length === 2 && left.length === Math.round(48000 * REVERB.seconds) && REVERB.seconds >= 0.25 && REVERB.seconds <= 0.45)
  const delay = Math.round(48000 * REVERB.preDelay)
  check("with a short pre-delay of silence first", REVERB.preDelay > 0 && REVERB.preDelay <= 0.015 && left.slice(0, delay).every((v) => v === 0) && Math.abs(left[delay + 200]) + Math.abs(left[delay + 201]) > 0)
  const rms = (d: Float32Array, from: number, to: number) => Math.sqrt(d.slice(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from))
  const head = rms(left, delay, delay + 1200)
  const tail = rms(left, left.length - 1200, left.length)
  check("and a tail that falls about 60 dB", 20 * Math.log10(tail / head) < -45, `${(20 * Math.log10(tail / head)).toFixed(1)} dB`)
  const zeroCross = (d: Float32Array, from: number, to: number) => { let n = 0; for (let i = from + 1; i < to; i++) if (Math.sign(d[i]) !== Math.sign(d[i - 1])) n++; return n / (to - from) }
  check("darkening as it goes: fewer crossings late than early", zeroCross(left, left.length - 2400, left.length) < zeroCross(left, delay, delay + 2400) * 0.7)
  check("each side different, so the tail is wide", left.some((v, i) => v !== right[i]))
  const energy = left.reduce((s, v) => s + v * v, 0)
  check("scaled to unit energy", Math.abs(energy - 1) < 1e-3, String(energy))
  check("made once per sample rate and kept", impulseResponse(48000) === impulseResponse(48000) && impulseResponse(44100)[0].length === Math.round(44100 * REVERB.seconds))
  const cut = convolver.outputs[0] as Filter
  check("then a high cut, 4kHz or lower, so the tail is never watery", cut instanceof Filter && cut.type === "lowpass" && cut.frequency.value === ROOM_HIGH_CUT && ROOM_HIGH_CUT <= 4000)

  const again = scheduleSound(r.ctx as never, "done", 2, r.out as never)
  check("the room is built once per context: a second sound adds no convolver or limiter", again > 2 && r.ctx.made.filter((n) => n instanceof Convolver).length === 1 && r.ctx.made.filter((n) => n instanceof Compressor).length === 1)

  const sends = ASK_SOUNDS.map((s) => [s, SOUND_DESIGN[s].wet] as const)
  check(
    "the room is mixed low: 12 to 18 percent for the notes, less for the ticks",
    sends.every(([s, w]) => (s.startsWith("record") ? w > 0 && w < 0.12 : w >= 0.12 && w <= 0.18)),
    JSON.stringify(Object.fromEntries(sends)),
  )
  const sendGains = r.ctx.made.filter((n): n is Gain => n instanceof Gain && n.outputs.some((o) => o instanceof Gain && o.outputs[0] instanceof Convolver))
  check("each strike sends to it at that level", sendGains.length >= 2 && sendGains.every((gn) => gn.gain.events.some((ev) => near(ev.value, SOUND_DESIGN.sent.wet, 1e-9) || near(ev.value, SOUND_DESIGN.done.wet, 1e-9))))

  const [limiter] = r.compressors
  const highPass = r.filters.find((f) => f.type === "highpass")
  check(
    "a high pass at 60Hz before the limiter, that the dry sound and the room both go through",
    !!highPass && highPass.frequency.value === HIGH_PASS && HIGH_PASS === 60 && highPass.outputs[0] === limiter && reaches(convolver, highPass) && r.strikes.every((s) => reaches(s.tone, highPass)),
  )
  check(
    "one limiter after it: -1 dBFS, ratio 12, fast",
    r.compressors.length === 1 && limiter.threshold.value === LIMITER.threshold && limiter.ratio.value >= 10 && limiter.attack.value <= 0.005 && reaches(convolver, limiter),
  )
  const trim = limiter.outputs[0] as Gain
  check("its makeup gain taken back out, so below the threshold the chain is unity", trim instanceof Gain && near(trim.gain.value * limiterMakeup(), 1, 1e-9) && near(limiterMakeup(), 1.0654, 0.001), String(limiterMakeup()))
  check("well above the loudest sound: 10 dB of room", LIMITER.threshold - PEAK_DBFS >= 10)

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
    /* The room is built by a first sound; what the sound under test makes after it is all its own. */
    const ctx = new StubContext()
    const out = new Node("out")
    scheduleSound(ctx as never, "sent", 0, out as never)
    const room = ctx.made.filter((n) => n instanceof Convolver || n instanceof Compressor || (n instanceof Filter && (n.type === "highpass" || n.outputs[0] instanceof Compressor)))
    const before = ctx.made.length
    const end = scheduleSound(ctx as never, sound, 2, out as never)
    const mine = ctx.made.slice(before)
    const sources = mine.filter((n): n is Source => n instanceof Source)
    check(`${sound}: every source starts when asked or after, and stops by its end`, sources.length > 0 && sources.every((s) => (s.started ?? 0) >= 2) && sources.every((s) => s.stopped !== null && (s.stopped ?? 0) <= end + 1e-9))
    check(`${sound}: says how long it is`, near(end - 2, SOUND_LENGTH[sound], 1e-9))
    check(`${sound}: every node it made reaches the output`, mine.every((n) => reaches(n, out)))
    for (const s of sources) s.onended?.()
    check(`${sound}: its strikes let go of every node they made once played`, mine.length > 0 && mine.every((n) => n.disconnected))
    check(`${sound}: and the room stays for the next one`, room.length >= 3 && room.every((n) => !n.disconnected))
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
