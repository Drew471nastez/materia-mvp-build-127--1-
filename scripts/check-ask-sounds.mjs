/**
 * ===========================================================================
 *  ASK STORELIB'S SOUNDS, RENDERED AND MEASURED
 * ===========================================================================
 * lib/website-builder/ask-sounds.ts, bundled as it is and played into an
 * OfflineAudioContext in headless Chromium: the real graph, room, high pass
 * and limiter included, 48kHz stereo. Each sound is scheduled 0.3s in, after
 * the limiter has settled, and measured from the samples:
 *
 *   peak        the loudest sample, dBFS (target -16)
 *   rms         over the sound, from its first sample to its fall to -60 dB
 *   centroid    the spectral centroid, energy weighted over the same span:
 *               where the brightness sits
 *   low         the share of energy from 100 to 250Hz: the thump under it
 *   mud         the share under 50Hz, which the high pass keeps out
 *   attack      from the first sample to the first strike's peak (the
 *               loudest moment in the first 25ms)
 *   heard       until it has fallen 40 dB under its peak
 *   tail60      until it has fallen 60 dB under its peak, the room included
 *   wet         the room against the dry sound (a second render with no send:
 *               below the limiter the graph is linear, so the difference is
 *               the room)
 *
 * And it says whether they meet the design: short, soft at the start, one
 * family of levels, a little low end and no mud, a small room mixed low,
 * error the darkest. Run:
 *
 *   node scripts/check-ask-sounds.mjs
 *
 * CALIBRATE=1 also prints, per sound, the gain that would put its peak at
 * exactly PEAK_DBFS.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-ask-sounds-"))
const { build } = await import("esbuild")
await build({
  /* SOUNDS_ENTRY measures another version of the file (an older one, to compare), with the same probe. */
  entryPoints: [process.env.SOUNDS_ENTRY || join(root, "lib/website-builder/ask-sounds.ts")],
  bundle: true,
  format: "iife",
  globalName: "AskSounds",
  outfile: join(out, "sounds.js"),
  logLevel: "error",
  absWorkingDir: root,
})
const js = readFileSync(join(out, "sounds.js"), "utf8")
rmSync(out, { recursive: true, force: true })

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
let measured
try {
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><meta charset="utf-8"><script>${js.replace(/<\/script/gi, "<\\/script")}</script>`)
  measured = await page.evaluate(async () => {
    const { ASK_SOUNDS, PEAK_DBFS, SOUND_DESIGN, SOUND_LENGTH, scheduleSound } = window.AskSounds
    const RATE = 48000
    const AT = 0.3
    const render = async (name, dry) => {
      const ctx = new OfflineAudioContext(2, RATE * 2.5, RATE)
      const wet = SOUND_DESIGN[name].wet
      if (dry) SOUND_DESIGN[name].wet = 0
      scheduleSound(ctx, name, AT, ctx.destination)
      SOUND_DESIGN[name].wet = wet
      const b = await ctx.startRendering()
      return [b.getChannelData(0), b.getChannelData(1)]
    }
    /* A radix 2 FFT, in place, for the centroid and the bands. */
    const fft = (re, im) => {
      const n = re.length
      for (let i = 1, j = 0; i < n; i++) {
        let bit = n >> 1
        for (; j & bit; bit >>= 1) j ^= bit
        j ^= bit
        if (i < j) {
          ;[re[i], re[j]] = [re[j], re[i]]
          ;[im[i], im[j]] = [im[j], im[i]]
        }
      }
      for (let len = 2; len <= n; len <<= 1) {
        const ang = (-2 * Math.PI) / len
        for (let i = 0; i < n; i += len) {
          for (let k = 0; k < len / 2; k++) {
            const wr = Math.cos(ang * k)
            const wi = Math.sin(ang * k)
            const ur = re[i + k]
            const ui = im[i + k]
            const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi
            const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr
            re[i + k] = ur + vr
            im[i + k] = ui + vi
            re[i + k + len / 2] = ur - vr
            im[i + k + len / 2] = ui - vi
          }
        }
      }
    }
    const db = (x) => +(20 * Math.log10(Math.max(x, 1e-12))).toFixed(1)
    const result = {}
    for (const name of ASK_SOUNDS) {
      const [l, r] = await render(name, false)
      const [dl, dr] = await render(name, true)
      const n = l.length
      const mono = new Float32Array(n)
      let peak = 0
      let peakAt = 0
      let wetEnergy = 0
      let dryEnergy = 0
      for (let i = 0; i < n; i++) {
        mono[i] = (l[i] + r[i]) / 2
        const a = Math.max(Math.abs(l[i]), Math.abs(r[i]))
        if (a > peak) { peak = a; peakAt = i }
        wetEnergy += (l[i] - dl[i]) ** 2 + (r[i] - dr[i]) ** 2
        dryEnergy += dl[i] ** 2 + dr[i] ** 2
      }
      /* The level over time, in 2ms windows, so the falls are read from an envelope and not from single samples between zero crossings. */
      const W = 96
      const env = []
      for (let i = 0; i < n; i += W) {
        let m = 0
        for (let j = i; j < Math.min(n, i + W); j++) m = Math.max(m, Math.abs(l[j]), Math.abs(r[j]))
        env.push(m)
      }
      const firstWin = env.findIndex((v) => v > peak * 1e-3)
      const lastAbove = (ratio) => { let k = -1; env.forEach((v, i) => { if (v > peak * ratio) k = i }); return k }
      const onset = firstWin * W
      let firstPeak = 0
      let firstPeakAt = onset
      for (let i = onset; i < Math.min(n, onset + RATE * 0.025); i++) {
        const a = Math.max(Math.abs(l[i]), Math.abs(r[i]))
        if (a > firstPeak) { firstPeak = a; firstPeakAt = i }
      }
      const heardEnd = (lastAbove(0.01) + 1) * W
      const tailEnd = (lastAbove(0.001) + 1) * W
      let sq = 0
      for (let i = onset; i < tailEnd; i++) sq += mono[i] * mono[i]
      const rms = Math.sqrt(sq / Math.max(1, tailEnd - onset))
      /* Spectrum: Hann frames of 2048, hop 512, summed by energy over the sound. */
      const N = 2048
      const power = new Float64Array(N / 2)
      for (let s = onset; s + N <= tailEnd + N; s += 512) {
        const re = new Float64Array(N)
        const im = new Float64Array(N)
        for (let i = 0; i < N; i++) re[i] = (mono[s + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
        fft(re, im)
        for (let k = 0; k < N / 2; k++) power[k] += re[k] * re[k] + im[k] * im[k]
      }
      let total = 0, weighted = 0, low = 0, mud = 0
      for (let k = 1; k < N / 2; k++) {
        const f = (k * RATE) / N
        total += power[k]
        weighted += f * power[k]
        if (f >= 100 && f <= 250) low += power[k]
        if (f < 50) mud += power[k]
      }
      const design = SOUND_DESIGN[name]
      result[name] = {
        lengthMs: Math.round(SOUND_LENGTH[name] * 1000),
        peakDbfs: db(peak),
        rmsDbfs: db(rms),
        centroidHz: Math.round(weighted / total),
        lowShare: +(low / total).toFixed(3),
        mudShare: +(mud / total).toFixed(4),
        attackMs: +(((firstPeakAt - onset) / RATE) * 1000).toFixed(1),
        peakAtMs: Math.round(((peakAt - onset) / RATE) * 1000),
        heardMs: Math.round(((heardEnd - onset) / RATE) * 1000),
        tail60Ms: Math.round(((tailEnd - onset) / RATE) * 1000),
        wetDb: +(10 * Math.log10(wetEnergy / dryEnergy)).toFixed(1),
        gainFor: +(design.gain * Math.pow(10, (PEAK_DBFS - 20 * Math.log10(peak)) / 20)).toFixed(4),
      }
    }
    return result
  })
} finally {
  await browser.close()
}

console.log("\nmeasured (48kHz stereo, offline, room and limiter included)")
console.log("  sound          length  peak    rms     centroid  low    mud     attack  heard   tail60  wet")
for (const [name, m] of Object.entries(measured)) {
  const cells = [
    name.padEnd(14),
    `${m.lengthMs}ms`.padEnd(7),
    `${m.peakDbfs}`.padEnd(7),
    `${m.rmsDbfs}`.padEnd(7),
    `${m.centroidHz}Hz`.padEnd(9),
    `${Math.round(m.lowShare * 100)}%`.padEnd(6),
    `${(m.mudShare * 100).toFixed(2)}%`.padEnd(7),
    `${m.attackMs}ms`.padEnd(7),
    `${m.heardMs}ms`.padEnd(7),
    `${m.tail60Ms}ms`.padEnd(7),
    `${m.wetDb}dB`,
  ]
  console.log(`  ${cells.join(" ")}`)
}
if (process.env.CALIBRATE) {
  console.log("\ngain for exactly the target peak")
  for (const [name, m] of Object.entries(measured)) console.log(`  ${name.padEnd(14)} ${m.gainFor}`)
}

console.log("\nthe design")
const all = Object.entries(measured)
const m = measured
expect(all.every(([, s]) => s.peakDbfs >= -17 && s.peakDbfs <= -15), "every sound peaks at -16 dBFS, within a decibel", Object.fromEntries(all.map(([k, s]) => [k, s.peakDbfs])))
expect(
  m.sent.lengthMs >= 120 && m.sent.lengthMs <= 180 && m.upload.lengthMs >= 120 && m.upload.lengthMs <= 180 && m.question.lengthMs >= 220 && m.question.lengthMs <= 280 && m.done.lengthMs >= 320 && m.done.lengthMs <= 380 && m.error.lengthMs >= 220 && m.error.lengthMs <= 280 && m["record-start"].lengthMs <= 100 && m["record-stop"].lengthMs <= 100,
  "short: send and upload 120 to 180ms, question and error about 250ms, done about 350ms, the ticks under 100ms",
  Object.fromEntries(all.map(([k, s]) => [k, s.lengthMs])),
)
expect(all.every(([, s]) => s.heardMs <= s.lengthMs + 120), "heard (to -40 dB) for barely longer than the notes: the room adds a breath, not a hall", Object.fromEntries(all.map(([k, s]) => [k, s.heardMs])))
expect(all.every(([, s]) => s.tail60Ms <= s.lengthMs + 450), "gone to -60 dB within 0.45s of the last note", Object.fromEntries(all.map(([k, s]) => [k, s.tail60Ms])))
expect(all.every(([, s]) => s.wetDb <= -10 && s.wetDb >= -24), "the room is there and mixed low: 10 to 24 dB under the dry sound", Object.fromEntries(all.map(([k, s]) => [k, s.wetDb])))
expect(all.every(([, s]) => s.attackMs >= 2 && s.attackMs <= 12), "a soft but quick start: the first strike peaks 2 to 12ms after its first sample, never an instant click", Object.fromEntries(all.map(([k, s]) => [k, s.attackMs])))
expect(["sent", "question", "done", "error"].every((k) => m[k].lowShare >= 0.04), "a little low end under the notes: 4 percent or more of the energy from 100 to 250Hz", Object.fromEntries(all.map(([k, s]) => [k, s.lowShare])))
expect(all.every(([, s]) => s.mudShare < 0.01), "and no mud: under 1 percent below 50Hz", Object.fromEntries(all.map(([k, s]) => [k, s.mudShare])))
expect(all.every(([, s]) => s.centroidHz >= 250 && s.centroidHz <= 3000), "never shrill: the centroid between 250Hz and 3kHz", Object.fromEntries(all.map(([k, s]) => [k, s.centroidHz])))
expect(all.every(([k, s]) => k === "error" || s.centroidHz > m.error.centroidHz), "error is the darkest", Object.fromEntries(all.map(([k, s]) => [k, s.centroidHz])))
const rmsSpread = Math.max(...all.map(([, s]) => s.rmsDbfs)) - Math.min(...all.map(([, s]) => s.rmsDbfs))
expect(rmsSpread <= 8, "one family: their RMS levels within 8 dB of each other", { spread: +rmsSpread.toFixed(1) })

if (broken) {
  console.error(`\n${broken} check(s) failed\n`)
  process.exit(1)
}
console.log("\nall checks passed\n")
