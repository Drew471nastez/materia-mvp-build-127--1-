/**
 * ===========================================================================
 *  THE GLOBE, FRAME BY FRAME, THE SAME EVERY TIME
 * ===========================================================================
 * A performance change to the globe has to leave it looking exactly as it did.
 * That is only checkable if two runs draw the same frame, so this probe takes
 * the clock and the dice away from it: `performance.now`, `Date.now`,
 * `requestAnimationFrame`, `requestIdleCallback` and `Math.random` are all
 * replaced before the page loads, and the frames are pumped by hand at a
 * steady 60Hz from a fixed seed. The same code then draws the same pixels,
 * arcs and landing rings included, and two runs can be compared exactly.
 *
 * It shoots the globe alone, at the size the banner draws it on a 390 phone
 * and at 1440, with both renderers (WebGL and the 2D fallback), at three
 * moments: one second in, three seconds in, and seven.
 *
 *   node scripts/check-home-globe-shots.mjs                     shots into a temp dir
 *   SHOTS=/tmp/before node scripts/check-home-globe-shots.mjs    keep them
 *   SHOTS=/tmp/after BASE_SHOTS=/tmp/before node scripts/check-home-globe-shots.mjs
 *
 * With BASE_SHOTS it decodes both sets in a page of its own and counts the
 * pixels that differ, per shot: nothing else is a proof that it looks the same.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || join(mkdtempSync(join(tmpdir(), "globe-shots-")), "shots")
const BASE_SHOTS = process.env.BASE_SHOTS || null
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
mkdirSync(SHOTS, { recursive: true })
const root = process.cwd()

/* ─── The page: the globe alone, at a given size ──────────────────────── */
const dir = join(root, `.globe-shots-${process.pid}-probe`)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "entry.tsx"), `import { createRoot } from "react-dom/client"
import { createElement } from "react"
import { BannerGlobe } from "${join(root, "components/app/home/globe.tsx")}"
const size = Number(new URLSearchParams(location.search).get("size") || 200)
const box = document.getElementById("box")
box.style.width = size + "px"
box.style.height = size + "px"
createRoot(box).render(createElement(BannerGlobe, { className: "globe" }))
window.__ran = true
`)
execFileSync("pnpm", ["exec", "esbuild", join(dir, "entry.tsx"), "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic",
  "--log-level=error", `--outfile=${join(dir, "app.js")}`, '--define:process.env.NODE_ENV="production"', `--alias:@=${root}`],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const bundle = readFileSync(join(dir, "app.js"), "utf8")
rmSync(dir, { recursive: true, force: true })
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;height:100%;background:#eceef2}#stage{display:flex;align-items:center;justify-content:center;height:100%}
#box{position:relative}.globe{position:absolute;inset:0;width:100%;height:100%}
</style></head><body><div id="stage"><div id="box"></div></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${bundle}</script></body></html>`
const server = createServer((_, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html) })
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

/**
 * THE CLOCK, THE DICE AND THE FRAMES, all this probe's. A page cannot be
 * compared with another run of itself while it reads the real clock.
 */
const FROZEN = () => {
  let clock = 1000
  const rafs = new Map()
  const idles = new Map()
  const timers = []
  let next = 1
  window.performance.now = () => clock
  window.Date.now = () => 1700000000000 + clock
  window.requestAnimationFrame = (cb) => { const id = next++; rafs.set(id, cb); return id }
  window.cancelAnimationFrame = (id) => rafs.delete(id)
  window.requestIdleCallback = (cb) => { const id = next++; idles.set(id, cb); return id }
  window.cancelIdleCallback = (id) => idles.delete(id)
  /* A seeded generator, so the sales that fly and where they land are the same every run. */
  let seed = 0x2f6e2b1
  window.Math.random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
  /*
    An event's own clock, so a drag can be played at fixed times: the globe
    reads `e.timeStamp` for the speed a throw keeps (components/app/home/globe.tsx),
    and the real one is different every run.
  */
  Object.defineProperty(Event.prototype, "timeStamp", { get: () => clock, configurable: true })
  window.__pump = (frames) => {
    for (let f = 0; f < frames; f++) {
      clock += 1000 / 60
      const due = [...rafs.entries()]
      rafs.clear()
      for (const [, cb] of due) cb(clock)
      const idle = [...idles.entries()]
      idles.clear()
      for (const [, cb] of idle) cb({ didTimeout: false, timeRemaining: () => 8 })
    }
    return clock
  }
  /*
    A FINGER ON THE BALL, THE SAME EVERY TIME: down, across and up on the
    grip itself, one frame between each move, so the turn it is thrown at and
    the way it settles afterwards can be compared pixel for pixel.
  */
  window.__drag = (steps) => {
    const el = document.querySelector("[data-home-globe-grip]")
    const b = el.getBoundingClientRect()
    const x0 = b.x + b.width * 0.3
    const y0 = b.y + b.height / 2
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: x, clientY: y, bubbles: true, cancelable: true, buttons: 1 }))
    fire("pointerdown", x0, y0)
    for (let i = 1; i <= steps; i++) {
      window.__pump(1)
      fire("pointermove", x0 + i * 5, y0 + Math.sin(i / 4) * 3)
    }
    window.__pump(1)
    fire("pointerup", x0 + steps * 5, y0 + Math.sin(steps / 4) * 3)
  }
  void timers
}

const CASES = [
  { view: "390", width: 390, height: 844, dpr: 3, mobile: true, size: 168 },
  { view: "1440", width: 1440, height: 900, dpr: 2, mobile: false, size: 292 },
]
const AT = [60, 180, 420]
/* After the throw: while it is still going, halfway through the settle, and at rest again. */
const AFTER = [6, 45, 120]
const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--no-proxy-server", "--disable-accelerated-2d-canvas"],
})
const shots = []
try {
  for (const c of CASES) for (const renderer of ["gl", "2d"]) {
    const tab = await browser.newPage()
    await tab.setViewport({ width: c.width, height: c.height, deviceScaleFactor: c.dpr, isMobile: c.mobile, hasTouch: c.mobile })
    await tab.evaluateOnNewDocument(FROZEN)
    await tab.evaluateOnNewDocument(renderer === "2d"
      ? () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { return /webgl/.test(t) ? null : g.call(this, t, a) } }
      : () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, a) { return g.call(this, t, t === "webgl" && a ? { ...a, failIfMajorPerformanceCaveat: false } : a) } })
    await tab.goto(`${base}/?size=${c.size}`)
    await tab.waitForFunction(() => window.__ran, { timeout: 20000 })
    /*
      The globe waits a frame and then a timer before it builds anything
      (components/app/home/globe.tsx), and the frame is this probe's to give.
      The timer is the browser's, so it is waited for in real time.
    */
    await tab.evaluate(() => window.__pump(1))
    await new Promise((r) => setTimeout(r, 400))
    await tab.waitForSelector("[data-home-globe]", { timeout: 20000 })
    let done = 0
    for (const at of AT) {
      await tab.evaluate((n) => window.__pump(n), at - done)
      done = at
      /* The compositor has its own clock: one real frame to put the drawing on the screen. */
      await new Promise((r) => setTimeout(r, 160))
      const box = await tab.$("#box")
      const name = `globe-${c.view}-${renderer}-frame${at}.png`
      await box.screenshot({ path: join(SHOTS, name) })
      shots.push({ name, view: c.view, renderer, at })
    }
    /* Then a throw, and the frames it settles over. */
    await tab.evaluate(() => window.__drag(14))
    let since = 0
    for (const at of AFTER) {
      await tab.evaluate((n) => window.__pump(n), at - since)
      since = at
      await new Promise((r) => setTimeout(r, 160))
      const box2 = await tab.$("#box")
      const name = `globe-${c.view}-${renderer}-thrown${at}.png`
      await box2.screenshot({ path: join(SHOTS, name) })
      shots.push({ name, view: c.view, renderer, at })
    }
    const kind = await tab.evaluate(() => document.querySelector("[data-home-globe-box]")?.dataset.renderer ?? "none")
    if (kind !== (renderer === "gl" ? "webgl" : "2d")) fail(`${c.view} ${renderer}: drawn by the ${kind} renderer instead`)
    await tab.close()
  }
} finally {
  await browser.close()
  server.close()
}
console.log(`\n${shots.length} shots in ${SHOTS}`)
for (const s of shots) console.log(`  ${s.name}`)

if (!BASE_SHOTS) {
  console.log("\nNo BASE_SHOTS to compare with; keep this directory and pass it as BASE_SHOTS after the change.\n")
  process.exit(0)
}

/* ─── The diff, decoded in a page of its own ──────────────────────────── */
const diffBrowser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--no-proxy-server"] })
const tab = await diffBrowser.newPage()
await tab.goto("about:blank")
let bad = 0
console.log("")
for (const s of shots) {
  const before = join(BASE_SHOTS, s.name)
  if (!existsSync(before)) { console.log(`  FAIL  ${s.name}: nothing to compare with in ${BASE_SHOTS}`); bad++; continue }
  const a = readFileSync(before).toString("base64")
  const b = readFileSync(join(SHOTS, s.name)).toString("base64")
  const r = await tab.evaluate(async (one, two) => {
    const read = async (data) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = img.width
      c.height = img.height
      const g = c.getContext("2d", { willReadFrequently: true })
      g.drawImage(img, 0, 0)
      return { w: img.width, h: img.height, d: g.getImageData(0, 0, c.width, c.height).data }
    }
    const x = await read(one)
    const y = await read(two)
    if (x.w !== y.w || x.h !== y.h) return { size: `${x.w}x${x.h} vs ${y.w}x${y.h}` }
    let differing = 0
    let worst = 0
    for (let i = 0; i < x.d.length; i += 4) {
      const delta = Math.max(Math.abs(x.d[i] - y.d[i]), Math.abs(x.d[i + 1] - y.d[i + 1]), Math.abs(x.d[i + 2] - y.d[i + 2]), Math.abs(x.d[i + 3] - y.d[i + 3]))
      if (delta > 0) differing++
      if (delta > worst) worst = delta
    }
    return { px: x.d.length / 4, differing, worst, w: x.w, h: x.h }
  }, a, b)
  if (r.size) { console.log(`  FAIL  ${s.name}: a different size, ${r.size}`); bad++; continue }
  const ok = r.differing === 0
  if (!ok) bad++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${s.name} ${r.w}x${r.h}: ${r.differing} of ${r.px} pixels differ${r.differing ? `, the worst by ${r.worst} of 255` : ""}`)
}
await diffBrowser.close()
console.log(bad ? `\n${bad} shots differ\n` : `\nevery shot is pixel for pixel what it was\n`)
process.exit(bad ? 1 : 0)
