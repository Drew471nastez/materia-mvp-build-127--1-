/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS, SCHEDULED AGAINST A STUB AUDIOCONTEXT
 * ===========================================================================
 * lib/website-builder/ask-sounds.ts builds each sound from a few Web Audio
 * nodes. Here a stub context records every node, connection, ramp, start and
 * stop, and the envelopes are played back at 1ms steps to read how loud and
 * how long each sound is. The real graph is rendered and measured in a
 * browser by scripts/check-ask-ai.mjs (SOUNDS).
 *
 *   SHAPE      the ticks rise and fall, the whoosh sweeps filtered noise up,
 *              the chime is two notes with a soft attack
 *   LENGTH     ticks ~0.1s, whoosh 200 to 250ms, chime about 400ms
 *   LEVEL      nothing louder than -20 dBFS; no exponential ramp to zero
 *   TIDY       every source is started and stopped, every node reaches the
 *              output, and the nodes let go once played
 *   WHEN       never before a person has touched the page; one context,
 *              made and woken inside the first gesture; a suspended one is
 *              resumed first; off stays off; nothing ever throws
 *
 * Run with:  npm run test:push
 */
import {
  ASK_SOUNDS,
  CHIME,
  PEAK_GAIN,
  SOUND_LENGTH,
  SOUNDS_KEY,
  WHOOSH_LEVEL,
  armAskSounds,
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
class Oscillator extends Source { type = "sine"; frequency = new Param(); constructor() { super("oscillator") } }
class Filter extends Node { type = "lowpass"; frequency = new Param(); Q = new Param(); constructor() { super("filter") } }
class Buffer { data: Float32Array; constructor(length: number) { this.data = new Float32Array(length) } getChannelData(_channel = 0) { return this.data } }
class BufferSource extends Source { buffer: Buffer | null = null; constructor() { super("buffer-source") } }

class StubContext {
  currentTime = 0
  sampleRate = 48000
  state = "running"
  destination = new Node("destination")
  made: Node[] = []
  resumes = 0
  failing = false
  private keep<T extends Node>(node: T): T { if (this.failing) throw new Error("no"); this.made.push(node); return node }
  createGain() { return this.keep(new Gain()) }
  createOscillator() { return this.keep(new Oscillator()) }
  createBiquadFilter() { return this.keep(new Filter()) }
  createBuffer(_channels: number, length: number) { return new Buffer(length) }
  createBufferSource() { return this.keep(new BufferSource()) }
  resume() { this.resumes++; this.state = "running"; return Promise.resolve() }
}

const reaches = (node: Node, target: Node, seen = new Set<Node>()): boolean => {
  if (node === target) return true
  if (seen.has(node)) return false
  seen.add(node)
  return node.outputs.some((next) => reaches(next, target, seen))
}

/** A source's loudness at t: the product of every gain between it and the output. */
function levelAt(source: Node, t: number): number {
  let level = 1
  let node: Node | undefined = source
  const seen = new Set<Node>()
  while (node && !seen.has(node)) {
    seen.add(node)
    if (node instanceof Gain) level *= node.gain.at(t)
    node = node.outputs[0]
  }
  return level
}

function play(sound: AskSound, at = 1) {
  const ctx = new StubContext()
  const out = new Node("out")
  const end = scheduleSound(ctx as never, sound, at, out as never)
  const sources = ctx.made.filter((n): n is Source => n instanceof Source)
  /* Every source's loudness, summed, at 1ms steps over the whole sound: the most it can reach. */
  const levels: { t: number; sum: number }[] = []
  for (let t = at; t <= end + 0.05; t += 0.001) {
    levels.push({ t: t - at, sum: sources.reduce((s, src) => s + ((src.started ?? 0) <= t && t <= (src.stopped ?? 0) ? levelAt(src, t) : 0), 0) })
  }
  const loudest = levels.reduce((a, b) => (b.sum > a.sum ? b : a), { t: 0, sum: 0 })
  /* How long it is heard: until it has fallen 40 dB below its own peak for good. */
  const heard = levels.filter((l) => l.sum > loudest.sum * 0.01).pop()?.t ?? 0
  return { ctx, out, end, sources, peak: loudest.sum, loudAt: loudest.t, lastSound: heard }
}

const dbfs = (gain: number) => 20 * Math.log10(gain)

// ---------------------------------------------------------------------------
section("Each sound, its shape")
// ---------------------------------------------------------------------------
{
  const start = play("record-start")
  const [tickUp] = start.sources as Oscillator[]
  check("record start is one soft tick: a triangle wave", start.sources.length === 1 && tickUp.type === "triangle")
  check("that rises", tickUp.frequency.at(1.08) > tickUp.frequency.at(1) * 1.3, `${tickUp.frequency.at(1)} -> ${tickUp.frequency.at(1.08)}`)
  const stop = play("record-stop")
  const [tickDown] = stop.sources as Oscillator[]
  check("record stop is the same tick falling", tickDown.type === "triangle" && tickDown.frequency.at(1.08) < tickDown.frequency.at(1) / 1.3, `${tickDown.frequency.at(1)} -> ${tickDown.frequency.at(1.08)}`)
  check("both reach their loudest within 6ms: a tick, not a swell", start.loudAt <= 0.006 && stop.loudAt <= 0.006, `${start.loudAt} ${stop.loudAt}`)

  const sent = play("sent")
  const noise = sent.sources[0] as BufferSource
  const band = sent.ctx.made.find((n): n is Filter => n instanceof Filter)
  check("sent is filtered noise: a noise buffer through a band pass", sent.sources.length === 1 && noise instanceof BufferSource && !!noise.buffer && band?.type === "bandpass")
  check("the band sweeps up, which is what makes it a whoosh", !!band && band.frequency.at(1.2) > band.frequency.at(1) * 4, `${band?.frequency.at(1)} -> ${band?.frequency.at(1.2)}`)
  check("and swells in before it fades, over tens of milliseconds", sent.loudAt >= 0.05 && sent.loudAt <= 0.12, `${sent.loudAt}`)
  const samples = noise.buffer!.getChannelData(0)
  const again = (play("sent").sources[0] as BufferSource).buffer!.getChannelData(0)
  check("the noise is the same every time, and full range", samples.length > 0 && samples.every((v, i) => v === again[i]) && Math.max(...samples.slice(0, 4000)) > 0.9 && Math.min(...samples.slice(0, 4000)) < -0.9)

  const done = play("done")
  const oscillators = done.sources as Oscillator[]
  const bodies = oscillators.filter((o, i) => i % 2 === 0)
  check("done is two notes, each a sine with a quiet octave above it", oscillators.length === 4 && oscillators.every((o) => o.type === "sine"))
  check(
    "a fifth apart, the second a beat after the first",
    Math.abs(bodies[1].frequency.at(1.2) / bodies[0].frequency.at(1) - 1.5) < 0.01 && Math.abs((bodies[1].started ?? 0) - (bodies[0].started ?? 0) - CHIME[1].offset) < 1e-9,
  )
  const attack = (source: Oscillator) => {
    const g = source.outputs[0] as Gain
    const up = g.gain.events.find((e) => e.kind === "linear")
    return up ? up.time - (source.started ?? 0) : 0
  }
  check("with a soft attack, 10ms or more, so neither note clicks", bodies.every((b) => attack(b) >= 0.01), bodies.map(attack).join(" "))
}

// ---------------------------------------------------------------------------
section("How long, and how loud")
// ---------------------------------------------------------------------------
{
  const lengths: Record<string, number> = {}
  const peaks: Record<string, number> = {}
  for (const sound of ASK_SOUNDS) {
    const r = play(sound)
    lengths[sound] = +r.lastSound.toFixed(3)
    peaks[sound] = +dbfs(r.peak).toFixed(1)
  }
  check("the ticks are short, about a tenth of a second", lengths["record-start"] >= 0.08 && lengths["record-start"] <= 0.13 && lengths["record-stop"] >= 0.08 && lengths["record-stop"] <= 0.13, JSON.stringify(lengths))
  check("the whoosh lasts 200 to 250ms", lengths.sent >= 0.2 && lengths.sent <= 0.25, JSON.stringify(lengths))
  check("the chime about 400ms", lengths.done >= 0.36 && lengths.done <= 0.46, JSON.stringify(lengths))
  /*
    The tones are oscillators at full scale, so their loudest moment is the
    product of their gains, read exactly here. The whoosh is noise through a
    band pass, whose level depends on the filter: here its envelope is held
    to the calibrated WHOOSH_LEVEL, and the probe renders the real graph in
    a browser and measures its peak (scripts/check-ask-ai.mjs, SOUNDS).
  */
  const tones = (["record-start", "record-stop", "done"] as const).map((s) => peaks[s])
  check(
    "no tone is louder than -20 dBFS, and each is within 2 dB of it",
    tones.every((p) => p <= dbfs(PEAK_GAIN) + 0.01 && p >= dbfs(PEAK_GAIN) - 2),
    JSON.stringify(peaks),
  )
  const sent = play("sent")
  const envelopeOfSent = Math.max(...(sent.ctx.made.find((n): n is Gain => n instanceof Gain)?.gain.events.map((e) => e.value) ?? [0]))
  check("the whoosh's envelope peaks at its calibrated level", Math.abs(envelopeOfSent - WHOOSH_LEVEL) < 1e-9, String(envelopeOfSent))
  check("each says how long it is", ASK_SOUNDS.every((s) => Math.abs(play(s).end - 1 - SOUND_LENGTH[s]) < 1e-9))
}

// ---------------------------------------------------------------------------
section("Tidy")
// ---------------------------------------------------------------------------
{
  for (const sound of ASK_SOUNDS) {
    const r = play(sound, 2)
    check(`${sound}: every source starts when asked and stops by its end`, r.sources.every((s) => s.started === 2 || (s.started ?? 0) > 2) && r.sources.every((s) => s.stopped !== null && (s.stopped ?? 0) <= r.end + 0.02))
    check(`${sound}: every node it made reaches the output`, r.ctx.made.every((n) => reaches(n, r.out)))
    for (const s of r.sources) s.onended?.()
    check(`${sound}: and lets go of its nodes once played`, r.ctx.made.every((n) => n.disconnected))
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
  check("and lets go of the listeners once it is running", (listeners.get("pointerdown") ?? []).length === 0 && (listeners.get("keydown") ?? []).length === 0)
  const ctx = lastContext as unknown as StubContext
  const before = ctx.made.length
  playAskSound("sent")
  check("then a sound plays on that same context", made === 1 && ctx.made.length > before)

  setSoundsOn(false)
  check("off is remembered", stored.get(SOUNDS_KEY) === "off" && soundsOn() === false)
  const quiet = ctx.made.length
  playAskSound("done")
  check("and off is silent", ctx.made.length === quiet)
  setSoundsOn(true)
  check("on again", soundsOn() === true && stored.get(SOUNDS_KEY) === "on")
  check("on by default", soundsOn({ getItem: () => null, setItem: () => {} }) === true)
  check("and on when storage refuses to be read", soundsOn({ getItem: () => { throw new Error("blocked") }, setItem: () => {} }) === true)

  ctx.state = "suspended"
  const resumesBefore = ctx.resumes
  const count = ctx.made.length
  playAskSound("done")
  await flush()
  check("a context the system suspended is resumed first, then the sound plays", ctx.resumes > resumesBefore && ctx.made.length > count)

  ctx.failing = true
  let threw = false
  try { playAskSound("record-start") } catch { threw = true }
  check("a context that refuses to make a node is silence, not an exception", !threw)
  ctx.failing = false

  resetAskSoundsForTest()
  makeSuspended = true
  ;(globalThis as unknown as { window: unknown }).window = { ...w, AudioContext: undefined }
  let threw2 = false
  try { armAskSounds(); gesture("keydown"); playAskSound("done") } catch { threw2 = true }
  check("a browser without Web Audio is silent and never throws", !threw2)
  delete (globalThis as unknown as { window?: unknown }).window
  resetAskSoundsForTest()
  let threw3 = false
  try { playAskSound("sent"); armAskSounds() } catch { threw3 = true }
  check("and on the server there is no window: nothing happens", !threw3)
}

void whenItPlays().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
})
