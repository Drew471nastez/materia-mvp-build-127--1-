/**
 * ===========================================================================
 *  SENDING A MESSAGE, THE LIVE LINE AND AI MEMORY, MEASURED FRAME BY FRAME
 * ===========================================================================
 * scripts/render-ask-memory-send.tsx in headless Chromium with the app's
 * stylesheet, sampled on every animation frame:
 *
 *   SEND      a five line message typed, then sent. The box's height per
 *             frame: it must only fall, never by more than half the way in
 *             one frame, and be one line within 260ms. The message's opacity
 *             and rise in the thread, and layout shift entries for the page.
 *   LINE      five labels given within 80ms, then one more 900ms later. The
 *             words on screen over time: the first holds, the burst shows
 *             only its newest, and no label is on screen for less than 600ms
 *             before the next replaces it.
 *   MEMORY    the mark hovered (the read starts), then pressed: the panel's
 *             height on every frame of the opening (one height: the list was
 *             already read, "Loading" never shows), its opacity and scale
 *             from the first frame to rest, where focus went; Escape: how
 *             long it takes to go and that focus is back on the mark. Then
 *             a slow read (800ms): "Loading" only after its delay, and the
 *             panel never shorter than its first frame.
 *   FRAMES    the longest gap between animation frames during each motion.
 *   REDUCED   under prefers-reduced-motion: the box changes height in one
 *             frame, the panel only fades.
 *
 *   node scripts/check-ask-memory-send.mjs     (PROBE_CSS=source without a build)
 *
 * Exits 1 when a number is out of bounds, and says which.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const stubs = join(root, ".ask-memory-send-probe")
mkdirSync(stubs, { recursive: true })
const css = await appCss(root)
const inter = interFaces(root)
const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-ask-memory-send.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": "." },
  loader: { ".css": "empty" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const PRELUDE = `window.__shifts = [];
try { new PerformanceObserver(function (l) { l.getEntries().forEach(function (e) { if (!e.hadRecentInput) window.__shifts.push(e.value) }) }).observe({ type: "layout-shift", buffered: true }) } catch (e) {}
window.__sample = function (fn, ms) { return new Promise(function (done) { var out = []; var t0 = performance.now(); function tick(now) { out.push(Object.assign({ t: Math.round(now - t0) }, fn())); if (now - t0 < ms) requestAnimationFrame(tick); else done(out) } requestAnimationFrame(tick) }) };`
writeFileSync(
  join(stubs, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${inter}</style><style>${css}</style><style>body{margin:0;display:flex;gap:24px;padding:16px;background:#f8f9fa;font-family:Inter,system-ui,sans-serif;align-items:flex-start}</style><script>${PRELUDE}</script></head><body><div id="composer"></div><div id="line"></div><div id="memory"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
)
const url = `file://${join(stubs, "index.html")}`
const gaps = (samples) => samples.slice(1).reduce((m, s, i) => Math.max(m, s.t - samples[i].t), 0)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu"] })
try {
  for (const reduced of [false, true]) {
    const p = await browser.newPage()
    await p.setViewport({ width: 1280, height: 800 })
    if (reduced) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.goto(url, { waitUntil: "load" })
    await p.waitForFunction(() => typeof window.__send === "function" && typeof window.__label === "function")

    /* ── SEND ─────────────────────────────────────────────────────────── */
    console.log(`\nSEND${reduced ? "  (reduced motion)" : ""}`)
    await p.evaluate(() => window.__type("Make the pricing section feel calmer\nthree plans, named\nmonthly and yearly\nthe middle one marked\nand a short FAQ under it"))
    await sleep(400)
    const tall = await p.$eval("[data-probe-field]", (f) => f.offsetHeight)
    const bubbleTop = () => p.$eval('[data-probe-bubble="0"]', (b) => Math.round(b.getBoundingClientRect().top * 10) / 10)
    const topBefore = await bubbleTop()
    await p.evaluate(() => (window.__shifts = []))
    const one = 20
    const frames = await p.evaluate(async () => {
      const f = document.querySelector("[data-probe-field]")
      const sampling = window.__sample(() => {
        const b = document.querySelector('[data-probe-bubble="1"]')
        const cs = b ? getComputedStyle(b) : null
        return { h: f.getBoundingClientRect().height, op: cs ? +cs.opacity : null, ty: cs && cs.transform !== "none" ? new DOMMatrix(cs.transform).m42 : 0 }
      }, 420)
      window.__send()
      return sampling
    })
    const hs = frames.map((s) => s.h)
    let rises = 0
    let biggest = 0
    for (let i = 1; i < hs.length; i++) {
      if (hs[i] > hs[i - 1] + 0.5) rises++
      biggest = Math.max(biggest, hs[i - 1] - hs[i])
    }
    const settledAt = frames.find((s) => Math.abs(s.h - one) < 1)?.t ?? null
    const drop = tall - one
    if (!reduced) {
      expect(tall >= 90, "five lines make the box tall", tall)
      expect(rises === 0, "after Send the box only gets shorter", { rises })
      expect(biggest <= drop * 0.5 + 1, "never more than half the way in one frame", { biggestStepPx: +biggest.toFixed(1), totalPx: drop })
      expect(settledAt !== null && settledAt <= 260, "one line again within 260ms", settledAt)
      const first = frames.find((s) => s.op !== null)
      const rest = frames.find((s) => s.op !== null && s.op >= 0.99 && Math.abs(s.ty) < 0.2)
      expect(!!first && first.op < 0.6 && first.ty > 0, "the message starts faint and a little low", first)
      expect(!!rest && rest.t <= 340, "and is in place, fully drawn, within 340ms", rest?.t)
      expect(gaps(frames) <= 40, "no frame gap over 40ms while it moves", gaps(frames))
    } else {
      const steps = hs.filter((h, i) => i > 0 && Math.abs(h - hs[i - 1]) > 0.5).length
      expect(steps <= 1 && settledAt !== null && settledAt <= 40, "reduced motion: the box is one line at once", { steps, settledAt })
    }
    /*
      What was already in the thread stays put while the box folds and the message rises. The box moving is the point,
      so the page's layout shift score is shown, not judged: a real Send is input, which the score leaves out.
    */
    const topAfter = await bubbleTop()
    expect(Math.abs(topAfter - topBefore) < 0.5, "the message above stays where it was", { before: topBefore, after: topAfter })
    const shifts = await p.evaluate(() => window.__shifts.reduce((a, b) => a + b, 0))
    console.log(`  info  layout shift score from a scripted Send with no input: ${shifts.toFixed(4)}`)

    /* ── LINE ─────────────────────────────────────────────────────────── */
    if (!reduced) {
      console.log("\nLINE")
      const seen = await p.evaluate(async () => {
        const read = () => (document.querySelector('[data-probe-line] [data-line="in"] [data-ask-line-text]')?.firstChild?.textContent ?? "").trim()
        const out = []
        const t0 = performance.now()
        let last = read()
        out.push({ t: 0, text: last })
        const watch = setInterval(() => {
          const now = read()
          if (now !== last) {
            out.push({ t: Math.round(performance.now() - t0), text: now })
            last = now
          }
        }, 8)
        await new Promise((r) => setTimeout(r, 700))
        const burst = ["Reading the Hero section", "Updated Hero", "Adding to Hero", "Checking the page", "Fixing an issue"]
        for (let i = 0; i < burst.length; i++) {
          window.__label(burst[i])
          await new Promise((r) => setTimeout(r, 20))
        }
        await new Promise((r) => setTimeout(r, 900))
        window.__label("Checking mobile layout")
        await new Promise((r) => setTimeout(r, 1400))
        clearInterval(watch)
        return out
      })
      const held = seen.slice(1).map((s, i) => s.t - seen[i].t)
      /* The first of the burst comes at once (the line had held long enough); the three after it are never drawn. */
      expect(seen.length === 4 && seen[1]?.text === "Reading the Hero section", "a burst of five labels: the first at once, then only the newest", seen.map((s) => s.text))
      expect(seen[2]?.text === "Fixing an issue", "and that is the last one given", seen[2]?.text)
      expect(held.slice(1).every((ms) => ms >= 600), "every label stays at least 600ms before the next", held)
    }

    /* ── MEMORY ───────────────────────────────────────────────────────── */
    console.log(`\nMEMORY${reduced ? "  (reduced motion)" : ""}`)
    await p.evaluate(() => (window.__memoryDelay = 60))
    await p.hover("[data-ask-memory]")
    await sleep(200)
    const opening = await p.evaluate(async () => {
      const sampling = window.__sample(() => {
        const panel = document.querySelector("[data-ask-memory-panel]")
        if (!panel) return { h: null }
        const cs = getComputedStyle(panel)
        const m = cs.transform !== "none" ? new DOMMatrix(cs.transform) : null
        const loading = Array.from(panel.querySelectorAll("p")).some((n) => /Loading/.test(n.textContent || "") && +getComputedStyle(n).opacity > 0.05)
        return { h: panel.offsetHeight, op: +cs.opacity, scale: m ? +m.a.toFixed(3) : 1, loading, anim: cs.animationName }
      }, 360)
      document.querySelector("[data-ask-memory]").click()
      return sampling
    })
    const seenOpen = opening.filter((s) => s.h !== null)
    const heights = [...new Set(seenOpen.map((s) => s.h))]
    const firstOpen = seenOpen[0]
    const restOpen = seenOpen.find((s) => s.op >= 0.99 && Math.abs(s.scale - 1) < 0.002)
    expect(heights.length === 1, "opened already filled: one height on every frame", heights)
    expect(seenOpen.every((s) => !s.loading), "never a Loading line swapped for the list")
    if (!reduced) {
      expect(!!firstOpen && firstOpen.op < 0.7 && firstOpen.scale < 1, "grows out of the mark: faint and a little small on its first frame", firstOpen)
      expect(!!restOpen && restOpen.t - firstOpen.t <= 260, "at rest within 260ms", restOpen ? restOpen.t - firstOpen.t : null)
      expect(gaps(opening) <= 40, "no frame gap over 40ms while it opens", gaps(opening))
    } else {
      expect(seenOpen.every((s) => Math.abs(s.scale - 1) < 0.002), "reduced motion: it only fades, no scale", seenOpen.map((s) => s.scale).slice(0, 4))
    }
    await sleep(200)
    const focused = await p.evaluate(() => document.activeElement?.hasAttribute("data-ask-memory-panel") ?? false)
    expect(focused, "focus is in the panel itself, not on an invisible Forget button")
    const closing = await p.evaluate(async () => {
      const sampling = window.__sample(() => ({ there: !!document.querySelector("[data-ask-memory-panel]") }), 400)
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }))
      return sampling
    })
    const goneAt = closing.find((s) => !s.there)?.t ?? null
    expect(goneAt !== null && goneAt <= 220, "Escape: gone within 220ms, quicker than it came", goneAt)
    const back = await p.evaluate(() => document.activeElement?.hasAttribute("data-ask-memory") ?? false)
    expect(back, "and focus is back on the mark")

    if (!reduced) {
      /* A slow read: a fresh page, so nothing is cached, and no hover first. */
      const q = await browser.newPage()
      await q.setViewport({ width: 1280, height: 800 })
      await q.goto(url, { waitUntil: "load" })
      await q.waitForFunction(() => typeof window.__send === "function")
      const slow = await q.evaluate(async () => {
        window.__memoryDelay = 800
        const sampling = window.__sample(() => {
          const panel = document.querySelector("[data-ask-memory-panel]")
          if (!panel) return { h: null }
          const loading = Array.from(panel.querySelectorAll("p")).find((n) => /Loading/.test(n.textContent || ""))
          return { h: panel.offsetHeight, loadingOp: loading ? +getComputedStyle(loading).opacity : null, notes: panel.querySelectorAll("[data-ask-memory-note]").length }
        }, 1300)
        document.querySelector("[data-ask-memory]").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }))
        document.querySelector("[data-ask-memory]").click()
        return sampling
      })
      const s = slow.filter((x) => x.h !== null)
      const early = s.filter((x) => x.t <= 250 && x.loadingOp !== null)
      const minH = Math.min(...s.map((x) => x.h))
      expect(early.every((x) => x.loadingOp < 0.1), "a slow read says Loading only after its delay", early.map((x) => x.loadingOp).slice(-3))
      expect(s.some((x) => x.loadingOp !== null && x.loadingOp > 0.9), "and then says it")
      expect(minH >= s[0].h, "the panel never gets shorter than its first frame", { first: s[0].h, min: minH, last: s[s.length - 1].h })
      expect(s[s.length - 1].notes === 3, "the notes arrive", s[s.length - 1].notes)
      await q.close()
    }
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
