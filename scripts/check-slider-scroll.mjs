/**
 * ===========================================================================
 *  A SWIPE UP THE BUILDER'S PANEL SCROLLS IT, AND MOVES NO SLIDER
 * ===========================================================================
 * The owner: "in the sidebar, when I scroll with my finger up and down
 * through the sections, it confuses the touch scroll and accidentally
 * touches the sliders ... it drags the sliders."
 *
 * Twenty real slider rows (scripts/render-slider-scroll.tsx) in a panel the
 * size of the phone sidebar, at 390x844 with touch, driven with real touch
 * input through the browser's own pipeline (CDP Input.dispatchTouchEvent),
 * so the browser decides what is a scroll exactly as a phone does:
 *
 *   VERTICAL   a swipe that starts on each of the twenty sliders, on the
 *              track and on the thumb, with a few pixels of sideways wobble:
 *              no value changes, the panel scrolls
 *   FLING      a fast swipe and a tap on a track straight after: no change
 *   SIDEWAYS   a drag along the thumb, and one 20 degrees off level: the
 *              value follows, the panel does not scroll
 *   TAP        a tap on a still panel's track still moves the thumb there
 *   MOUSE      a mouse drag is as it was
 *
 *   node scripts/check-slider-scroll.mjs
 */
import { build } from "esbuild"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const css = await appCss(root)
const faces = interFaces(root)
const dir = join(root, ".slider-scroll-probe")
mkdirSync(dir, { recursive: true })
try {
  await build({
    entryPoints: [join(root, "scripts/render-slider-scroll.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(dir, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{ name: "alias", setup(b) { b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind })) } }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(dir, { recursive: true, force: true })
  fail(`The probe did not bundle: ${e.message}`)
}
writeFileSync(join(dir, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#f8f9fa}</style></head>
<body><div id="app"></div><script>${readFileSync(join(dir, "app.js"), "utf8").replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const p = await browser.newPage()
const errors = []
p.on("pageerror", (e) => errors.push(e.message))
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await p.goto(`file://${join(dir, "index.html")}`)
await p.evaluate(() => document.fonts.ready)
await sleep(500)
const cdp = await p.target().createCDPSession()
if (process.env.DEBUG_EVENTS) await p.evaluate(() => {
  window.__ev = []
  new MutationObserver((m) => window.__ev.push(`VALUE@${Math.round(performance.now())}:${m[0].target.getAttribute("aria-valuenow")}:${new Error().stack.split("\n").slice(1, 4).join("|")}`)).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["aria-valuenow"] })
  for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture", "scroll"]) document.addEventListener(t, (e) => window.__ev.push(`${t}${e.pointerType ? ":" + e.pointerType : ""}@${Math.round(performance.now())}`), { capture: true, passive: true })
})

/** A finger: down at the first point, through the rest one frame apart, up at the last. */
async function finger(points, { stepMs = 16, holdMs = 0 } = {}) {
  const [x0, y0] = points[0]
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y: y0, id: 1 }] })
  if (holdMs) await sleep(holdMs)
  for (const [x, y] of points.slice(1)) {
    await sleep(stepMs)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y, id: 1 }] })
  }
  await sleep(stepMs)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
const line = (x0, y0, x1, y1, n = 14) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n])

const state = () => p.evaluate(() => ({
  scroll: Math.round(document.querySelector("[data-probe-scroller]").scrollTop),
  changes: Object.values(window.__values).reduce((n, a) => n + a.length, 0),
  values: [...document.querySelectorAll("[data-slot='slider-thumb']")].map((t) => +t.getAttribute("aria-valuenow")),
}))
/** Where row i's slider is on screen: its track and its thumb. */
const where = (i) => p.evaluate((i) => {
  const row = document.querySelector(`[data-probe-row="${i}"]`)
  const s = row.querySelector("[data-slot='slider']").getBoundingClientRect()
  const t = row.querySelector("[data-slot='slider-thumb']").getBoundingClientRect()
  const panel = document.querySelector("[data-probe-scroller]").getBoundingClientRect()
  return { track: { x: s.left, y: s.top + s.height / 2, w: s.width }, thumb: { x: t.left + t.width / 2, y: t.top + t.height / 2 }, visible: s.top > panel.top + 10 && s.bottom < panel.bottom - 10 }
}, i)
const bring = (i, block = "center") => p.evaluate((i, block) => document.querySelector(`[data-probe-row="${i}"]`).scrollIntoView({ block }), i, block)

/* ------------------------------------------------------------------ */
console.log("\n1. A vertical swipe that starts on each of the twenty sliders")
{
  const before = await state()
  let scrolled = 0
  const per = []
  for (let i = 0; i < 20; i++) {
    /* Up the panel for the first ten, back down for the rest, so there is always room to scroll. */
    const up = i < 10
    await bring(i, up ? "end" : "start")
    await sleep(450)
    const at = await where(i)
    /* On the thumb every third time, on the track otherwise; a little sideways wobble, as a thumb has. */
    const x = i % 3 === 0 ? at.thumb.x : at.track.x + at.track.w * (0.15 + 0.07 * (i % 10))
    const y = at.track.y
    const s0 = await state()
    await finger(line(x, y, x + (i % 2 ? 6 : -6), y + (up ? -230 : 230)))
    await sleep(350)
    const s1 = await state()
    if (Math.abs(s1.scroll - s0.scroll) > 60) scrolled++
    per.push({ i, scroll: s1.scroll - s0.scroll, changes: s1.changes - s0.changes })
    if (process.env.DEBUG_EVENTS && i === 0) console.log((await p.evaluate(() => window.__ev.splice(0))).join(" "))
  }
  const after = await state()
  expect(after.changes === before.changes && after.values.every((v) => v === 40), "twenty swipes started on a slider changed no value", { changes: after.changes - before.changes, values: [...new Set(after.values)] })
  expect(scrolled === 20, "and every one of them scrolled the panel", { scrolled, per: per.filter((x) => Math.abs(x.scroll) <= 60 || x.changes) })
}

console.log("\n2. A fling, and a finger that lands on a track to stop it")
{
  await bring(10)
  await sleep(450)
  const at = await where(10)
  const s0 = await state()
  await finger(line(at.track.x + 40, at.track.y + 120, at.track.x + 44, at.track.y - 160, 6), { stepMs: 8 })
  await sleep(30)
  const at2 = await where(11)
  await finger([[at2.track.x + at2.track.w * 0.9, at2.track.y]])
  await sleep(400)
  const s1 = await state()
  expect(s1.changes === s0.changes, "the tap that stops the scroll moves no thumb", { changes: s1.changes - s0.changes, scroll: s1.scroll - s0.scroll })
}

console.log("\n3. Sideways drags still move the value")
{
  await bring(5)
  await sleep(500)
  let at = await where(5)
  let s0 = await state()
  await finger(line(at.thumb.x, at.thumb.y, at.thumb.x + 110, at.thumb.y + 3))
  await sleep(300)
  let s1 = await state()
  expect(s1.values[5] > 40 && s1.values.every((v, i) => i === 5 || v === s0.values[i]), "a drag along the thumb raises its value, and only its value", { value: s1.values[5] })
  expect(Math.abs(s1.scroll - s0.scroll) <= 2, "and the panel stays where it is", { scroll: s1.scroll - s0.scroll })
  at = await where(6)
  s0 = await state()
  /* 20 degrees off level: tan(20) * 100 = 36px down for 100 across. */
  await finger(line(at.thumb.x, at.thumb.y, at.thumb.x - 100, at.thumb.y + 36))
  await sleep(300)
  s1 = await state()
  expect(s1.values[6] < 40, "one 20 degrees off level still drags (left, lower)", { value: s1.values[6], scroll: s1.scroll - s0.scroll })
}

console.log("\n4. A tap on a still panel's track")
{
  await bring(8)
  await sleep(700)
  const at = await where(8)
  await finger([[at.track.x + at.track.w * 0.9, at.track.y]])
  await sleep(300)
  const s1 = await state()
  expect(s1.values[8] >= 80, "the thumb goes where the track was tapped", { value: s1.values[8] })
}

console.log("\n5. A mouse")
{
  await bring(12)
  await sleep(500)
  const at = await where(12)
  await p.mouse.move(at.thumb.x, at.thumb.y)
  await p.mouse.down()
  await p.mouse.move(at.thumb.x + 80, at.thumb.y + 30, { steps: 8 })
  await p.mouse.up()
  await sleep(300)
  const s1 = await state()
  expect(s1.values[12] > 40, "a mouse drags from its press, as before", { value: s1.values[12] })
}

expect(errors.length === 0, "nothing threw", errors.slice(0, 2))
await browser.close()
rmSync(dir, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
