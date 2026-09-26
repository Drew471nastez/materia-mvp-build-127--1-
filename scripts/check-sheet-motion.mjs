/**
 * ===========================================================================
 *  THE SHEET, OPENED AND CLOSED TWENTY TIMES, EVERY FRAME READ
 * ===========================================================================
 * "When I open it sometimes it glitches, double glitches." The glitch was one
 * frame long, so nothing but a frame-by-frame reading can hold it fixed: the
 * account sheet was committed at rest, painted once fully open, then moved
 * below the screen by an effect that ran after that paint, and slid up from
 * there. Open, vanish, rise.
 *
 * For every open and every close this records, on every animation frame, where
 * the sheet really is (the computed transform, running animation included)
 * and asserts:
 *
 *   FIRST FRAME OFF SCREEN  the first frame the sheet exists, it is below the
 *                           screen, never at rest
 *   ONE DIRECTION           it only ever rises while opening and only ever
 *                           falls while closing: any step backwards is the
 *                           double glitch
 *   IT FINISHES             open ends at rest, close ends with no sheet
 *   A TAP ON THE SCRIM      closes it with a slide: more than five frames of
 *   LEAVES, IT DOES NOT     it on its way down, every cycle. So does Escape,
 *   VANISH                  a close from the parent, and the parent taking
 *                           the sheet away altogether (a page left, a row
 *                           deleted from its own action sheet)
 *   THE PILL STAYS          while a sheet is open the nav pill is where it
 *                           was, at full opacity, and painted over the page
 *                           (a positioned page, like the dashboard): only the
 *                           sheet's scrim is over it, and the scrim, not the
 *                           pill, gets a tap on it. Through the real rule in
 *                           app/globals.css
 *   NO LONG TASK            no main thread task over 50ms while it moves
 *   A FLICK CLOSES, A SLOW  a fast short drag closes it; a slow one that
 *   DRAG SPRINGS BACK       stays under the threshold returns to rest
 *   THE DRAG FOLLOWS        every frame of a drag the panel is where the
 *                           finger put it, within a pixel
 *
 * The page is taps from a touch screen, so a tap is followed by the mousedown
 * a phone synthesizes, which is what the account sheet's parent listened to.
 *
 *   node scripts/check-sheet-motion.mjs          (CSS from scripts/probe-css.mjs: a build's, or compiled from source)
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const CYCLES = Number(process.env.CYCLES ?? 20)
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const out = mkdtempSync(join(tmpdir(), "storelib-sheet-motion-"))
/* The account sheet's links and its close on a page change, as far as it can see a router. */
writeFileSync(join(out, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, replace() {}, prefetch() { (window.__prefetched = window.__prefetched || []).push([...arguments][0]) }, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(out, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, ...rest }, ref) {
  if (prefetch !== false) (window.__linkPrefetch = window.__linkPrefetch || []).push(href)
  return React.createElement("a", { href, ref, ...rest, onClick: (e) => { e.preventDefault(); rest.onClick && rest.onClick(e) } }, children)
})
`)
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sheet-motion.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--define:process.env.NODE_ENV="production"', "--define:process.env.NEXT_PUBLIC_MAIN_DOMAIN=undefined",
  `--alias:next/navigation=${join(out, "navigation.js")}`, `--alias:next/link=${join(out, "link.jsx")}`, "--loader:.jsx=jsx",
  `--alias:@=${root}`, "--loader:.css=empty"],
  { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, NODE_PATH: join(root, "node_modules") } })
const file = join(out, "index.html")
writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>[data-app-nav-pill]{z-index:55}</style><style>${await appCss(root, process.env.SHEET_CSS || null)}</style><style>body{margin:0;background:#f8f9fa}</style>` +
  `</head><body><div id="app"></div><script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
const page = await browser.newPage()
await page.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
/* SHEET_KB=1: the sheet as one with a field in it (aboveKeyboard). */
await page.goto("file://" + file + (process.env.SHEET_KB ? "?kb" : ""))
await new Promise((r) => setTimeout(r, 800))
await page.evaluate(() => {
  window.__rec = []
  window.__long = []
  window.__pillTaps = 0
  document.getElementById("pill-tab").addEventListener("click", () => { window.__pillTaps++ })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ t: e.startTime, d: e.duration }) }).observe({ type: "longtask" })
  /* The live sheet, or the copy a sheet leaves behind when it is taken away. */
  const panel = () => document.querySelector("[data-sheet-panel]")
  const tick = (t) => {
    const el = panel()
    window.__rec.push(el ? { t, y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight } : { t, y: null, h: 0 })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
const now = () => page.evaluate(() => performance.now())
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const slice = (a, b) => page.evaluate((a, b) => ({ rec: window.__rec.filter((r) => r.t >= a && r.t < b), long: window.__long.filter((l) => l.t >= a && l.t < b) }), a, b)
const tapTrigger = async () => {
  const box = await page.evaluate(() => { const r = document.getElementById("trigger").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await page.touchscreen.tap(box.x, box.y)
}
const pillState = () => page.evaluate(() => {
  const p = document.getElementById("pill")
  const tab = document.getElementById("pill-tab")
  const r = tab.getBoundingClientRect()
  const cx = r.x + r.width / 2, cy = r.y + r.height / 2
  let opacity = 1
  for (let el = tab; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
  /* What a tap at the pill's centre reaches as the page stands. */
  const top = document.elementFromPoint(cx, cy)
  /* And what is painted there once the sheet's layer is set aside: the pill,
     or the page on top of it (which is the pill disappearing). */
  const aside = document.createElement("style")
  aside.textContent = "[data-app-sheet]{visibility:hidden!important} #pill-tab{pointer-events:auto!important}"
  document.head.appendChild(aside)
  const under = document.elementFromPoint(cx, cy)
  aside.remove()
  return {
    rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    opacity,
    visibility: getComputedStyle(tab).visibility,
    z: getComputedStyle(p).zIndex,
    tapReaches: top?.closest("[data-app-sheet]") ? "sheet" : top?.closest("#pill") ? "pill" : top?.closest("#page") ? "page" : top?.tagName ?? null,
    painted: under?.closest("#pill") ? "pill" : under?.closest("#page") ? "page" : under?.tagName ?? null,
  }
})

/* The pill at rest, before any sheet: where it is and that it is on top. */
const pillAtRest = await pillState()

const problems = []
let backwards = 0, flashes = 0, longTasks = 0, maxLong = 0, pillHidden = 0, pillMoved = 0, pillTapped = 0, unfinished = 0, frames = 0
let shortExits = 0, minExitFrames = Infinity
for (let i = 0; i < CYCLES; i++) {
  const t0 = await now()
  await tapTrigger()
  await wait(650)
  const t1 = await now()
  const pill = await pillState()
  /* Visible, in place, painted over the page, and under the sheet, which takes the tap. */
  if (pill.opacity < 0.9 || pill.visibility !== "visible" || pill.painted !== "pill") pillHidden++
  if (pill.tapReaches !== "sheet") pillTapped++
  if (JSON.stringify(pill.rect) !== JSON.stringify(pillAtRest.rect)) pillMoved++
  if (process.env.SHEET_DEBUG) console.log("pill", JSON.stringify(pill))
  /* The scrim tap: the close under test. */
  await page.touchscreen.tap(195, 120)
  await wait(500)
  const t2 = await now()
  const open = await slice(t0, t1), close = await slice(t1, t2)
  const o = open.rec.filter((r) => r.y !== null), c = close.rec.filter((r) => r.y !== null)
  frames += o.length + c.length
  if (!o.length) { problems.push(`cycle ${i}: the sheet never appeared`); continue }
  if (o[0].y < o[0].h * 0.9) flashes++
  for (let k = 1; k < o.length; k++) if (o[k].y > o[k - 1].y + 0.5) backwards++
  for (let k = 1; k < c.length; k++) if (c[k].y < c[k - 1].y - 0.5) backwards++
  /* Frames of the sheet on its way out, between rest and gone. */
  const exit = c.filter((r) => r.y > 0.5 && r.y < r.h - 0.5).length
  minExitFrames = Math.min(minExitFrames, exit)
  if (process.env.SHEET_DEBUG) console.log(i, JSON.stringify({ pill, open: o.map((r) => Math.round(r.y)).join(","), close: close.rec.map((r) => r.y === null ? "x" : Math.round(r.y)).join(",") }))
  if (exit <= 5) shortExits++
  if (Math.abs(o[o.length - 1].y) > 0.5) unfinished++
  if (close.rec.length && close.rec[close.rec.length - 1].y !== null) unfinished++
  for (const l of [...open.long, ...close.long]) { longTasks++; maxLong = Math.max(maxLong, l.d) }
}

/* Every other way a sheet is closed, each read frame by frame the same way. */
async function closeBy(label, how) {
  await page.evaluate(() => window.__sheet.open())
  await wait(650)
  const t1 = await now()
  await how()
  await wait(520)
  const t2 = await now()
  const close = await slice(t1, t2)
  const c = close.rec.filter((r) => r.y !== null)
  let back = 0
  for (let k = 1; k < c.length; k++) if (c[k].y < c[k - 1].y - 0.5) back++
  const exit = c.filter((r) => r.y > 0.5 && r.y < r.h - 0.5).length
  const gone = !close.rec.length || close.rec[close.rec.length - 1].y === null
  const left = await page.evaluate(() => document.querySelectorAll("[data-app-sheet]").length)
  backwards += back
  for (const l of close.long) { longTasks++; maxLong = Math.max(maxLong, l.d) }
  if (exit <= 5) problems.push(`${label}: the sheet left in ${exit} frames, it should slide out`)
  if (!gone || left) problems.push(`${label}: something was left on screen after the close`)
  return exit
}
const escapeFrames = await closeBy("Escape", () => page.keyboard.press("Escape"))
const parentFrames = await closeBy("a close from the parent", () => page.evaluate(() => window.__sheet.close()))
const unmountFrames = await closeBy("the parent taking the sheet away", () => page.evaluate(() => window.__sheet.unmount()))
await page.evaluate(() => window.__sheet.open())
await wait(50)
await page.evaluate(() => window.__sheet.close())
await wait(500)

/* A slow drag springs back; a flick closes. Real touch events from the screen. */
const client = await page.createCDPSession()
let dragLag = 0
async function drag(dy, stepMs, steps = 6, measure = false) {
  await tapTrigger()
  await wait(650)
  const top = await page.evaluate(() => { const h = document.querySelector("[data-sheet-handle]"); return h ? h.getBoundingClientRect().top + 8 : 600 })
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 195, y: top }] })
  for (let s = 1; s <= steps; s++) {
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 195, y: top + (dy * s) / steps }] })
    await wait(stepMs)
    /* From the second step: Chromium holds back touchmoves inside its own
       15px touch slop, so the first 10px move never reaches the page here
       (Safari delivers it; this is the harness, not the sheet). */
    if (measure && s >= 2) {
      /* Two frames is the most a finger can be ahead of what is painted. */
      const y = await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() =>
        r(new DOMMatrixReadOnly(getComputedStyle(document.querySelector("[data-sheet-panel]")).transform).m42)))))
      dragLag = Math.max(dragLag, Math.abs(y - (dy * s) / steps))
      if (process.env.SHEET_DEBUG) console.log("drag", s, y)
    }
  }
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await wait(600)
  return page.evaluate(() => { const el = document.querySelector("[data-sheet-panel]"); return el ? Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42) : "closed" })
}
const slow = await drag(60, 90, 6, true)
if (slow !== 0) problems.push(`a slow 60px drag should spring back to rest, ended at ${slow}`)
if (slow !== "closed") { await page.touchscreen.tap(195, 120); await wait(500) }
const flick = await drag(80, 0, 4)
if (flick !== "closed") problems.push(`a fast 80px flick should close the sheet, it rests at ${flick}`)

/**
 * ===========================================================================
 *  THE FEEL, ON A PHONE'S CPU: THE REAL ACCOUNT SHEET, 4x SLOWER
 * ===========================================================================
 * "The user mobile bottom sheet is not smooth when it closes and when it
 * opens: too direct, glitchy." Over a page the size of the dashboard, with
 * the CPU throttled to a quarter (Chromium's own throttle), the real account
 * sheet (components/app/mobile-account-menu.tsx) opened by a tap on its
 * trigger and closed by a tap on the scrim, FEEL_CYCLES times. For each:
 *
 *   FIRST MOVE    ms from the finger landing to the first frame the sheet is
 *                 on screen and moving (open), or has left rest (close)
 *   BUSY          main thread time in the first 100ms after the tap
 *                 (Performance.getMetrics TaskDuration, before and after)
 *   FRAMES        frames per second while it moves, the longest gap between
 *                 two frames, and how many gaps are over 20ms
 *   DURATION      first move to rest (open) or to gone (close)
 *   RENDERS       how many times the sidebar's parent and the dashboard drew
 *                 on an open and a close (the answer should be none)
 *   PREFETCH      whether the sheet's own links ask the router for their
 *                 pages as they appear, in the frames the sheet is moving
 */
const FEEL_CYCLES = Number(process.env.FEEL_CYCLES ?? 6)
const feel = await browser.newPage()
await feel.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" })
await feel.goto("file://" + file + "?account")
await wait(800)
const fcdp = await feel.createCDPSession()
await fcdp.send("Performance.enable")
await fcdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
await feel.evaluate(() => {
  window.__frames = []
  window.__taps = []
  window.addEventListener("touchstart", (e) => window.__taps.push(e.timeStamp), { capture: true, passive: true })
  const tick = (t) => {
    /* The account sheet is kept once built (BottomSheet keepMounted): at rest
       it has no data-app-sheet and counts as gone, as a removed one did. */
    const el = document.querySelector("[data-app-sheet] [data-sheet-panel]")
    window.__frames.push(el ? { t, y: new DOMMatrixReadOnly(getComputedStyle(el).transform).m42, h: el.offsetHeight } : { t, y: null, h: 0 })
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
})
await wait(400)
const METRICS = ["TaskDuration", "ScriptDuration", "RecalcStyleDuration", "LayoutDuration"]
const busy = async () => { const m = (await fcdp.send("Performance.getMetrics")).metrics; return Object.fromEntries(METRICS.map((k) => [k, m.find((x) => x.name === k).value * 1000])) }
async function measure(kind, act) {
  const r0 = await feel.evaluate(() => ({ ...window.__renders }))
  const b0 = await busy()
  const at0 = Date.now()
  await act()
  const left = 100 - (Date.now() - at0)
  if (left > 0) await wait(left)
  const b1 = await busy()
  await wait(kind === "open" ? 1100 : 900)
  const r1 = await feel.evaluate(() => ({ ...window.__renders }))
  const { frames, tap } = await feel.evaluate(() => ({ frames: window.__frames.slice(-400), tap: window.__taps[window.__taps.length - 1] }))
  const after = frames.filter((f) => f.t >= tap)
  const movingAt = after.findIndex((f) => f.y !== null && (kind === "open" ? f.y < f.h - 0.5 : f.y > 0.5))
  const endAt = kind === "open"
    ? after.findIndex((f, k) => k > movingAt && f.y !== null && Math.abs(f.y) <= 0.05)
    : after.findIndex((f, k) => k > movingAt && f.y === null)
  const moving = movingAt < 0 || endAt < 0 ? [] : after.slice(movingAt, endAt + 1)
  const gaps = moving.slice(1).map((f, k) => f.t - moving[k].t)
  const span = moving.length > 1 ? moving[moving.length - 1].t - moving[0].t : 0
  return {
    firstMoveMs: movingAt < 0 ? null : Math.round(after[movingAt].t - tap),
    busyFirst100Ms: Math.round(b1.TaskDuration - b0.TaskDuration),
    first100: { script: Math.round(b1.ScriptDuration - b0.ScriptDuration), style: Math.round(b1.RecalcStyleDuration - b0.RecalcStyleDuration), layout: Math.round(b1.LayoutDuration - b0.LayoutDuration) },
    fps: span ? Math.round(((moving.length - 1) / span) * 1000) : null,
    maxGapMs: gaps.length ? Math.round(Math.max(...gaps) * 10) / 10 : null,
    gapsOver20: gaps.filter((g) => g > 20.5).length,
    durationMs: Math.round(span),
    /* How much of the whole way the first two moving frames cover: a close
       that covers a quarter of it at once reads as a jump, not a slide. */
    firstTwoFramesPct: moving.length > 2 ? Math.round((kind === "open" ? (moving[1].h - moving[1].y) / moving[1].h : moving[1].y / moving[1].h) * 100) : null,
    renders: { sidebar: r1.sidebar - r0.sidebar, dashboard: r1.dashboard - r0.dashboard },
  }
}
const tapAt = async (sel) => {
  const box = await feel.evaluate((sel) => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, sel)
  await feel.touchscreen.tap(box.x, box.y)
}
const feelRuns = { open: [], close: [] }
for (let i = 0; i < FEEL_CYCLES; i++) {
  feelRuns.open.push(await measure("open", () => tapAt("#account-trigger")))
  feelRuns.close.push(await measure("close", () => feel.touchscreen.tap(195, 120)))
}
const linkPrefetch = await feel.evaluate(() => (window.__linkPrefetch || []).length)
await fcdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
await feel.close()
const summary = (runs) => {
  const med = (k) => { const v = runs.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)] : null }
  const max = (k) => Math.max(...runs.map((r) => r[k] ?? 0))
  return {
    firstMoveMs: { median: med("firstMoveMs"), max: max("firstMoveMs") },
    busyFirst100Ms: { median: med("busyFirst100Ms"), max: max("busyFirst100Ms") },
    first100Median: Object.fromEntries(["script", "style", "layout"].map((k) => [k, runs.map((r) => r.first100[k]).sort((a, b) => a - b)[Math.floor(runs.length / 2)]])),
    fps: { median: med("fps"), min: Math.min(...runs.map((r) => r.fps ?? 0)) },
    maxGapMs: max("maxGapMs"),
    gapsOver20: runs.reduce((n, r) => n + r.gapsOver20, 0),
    durationMs: { median: med("durationMs") },
    firstTwoFramesPct: { median: med("firstTwoFramesPct") },
    renders: runs.reduce((n, r) => ({ sidebar: n.sidebar + r.renders.sidebar, dashboard: n.dashboard + r.renders.dashboard }), { sidebar: 0, dashboard: 0 }),
  }
}
const feelReport = { cpu: "4x slower", cycles: FEEL_CYCLES, open: summary(feelRuns.open), close: summary(feelRuns.close), linksPrefetchingOnOpen: linkPrefetch }
console.log(JSON.stringify({ feel: feelReport }))
if (process.env.SHEET_DEBUG) console.log(JSON.stringify(feelRuns))
for (const kind of ["open", "close"]) {
  const s = feelReport[kind]
  if (s.renders.sidebar || s.renders.dashboard) problems.push(`the ${kind} re-rendered the sidebar ${s.renders.sidebar} and the dashboard ${s.renders.dashboard} times`)
  if (s.gapsOver20) problems.push(`the ${kind} had ${s.gapsOver20} frame gaps over 20ms at 4x (the longest ${s.maxGapMs}ms)`)
  if (s.fps.median != null && s.fps.median < 55) problems.push(`the ${kind} ran at ${s.fps.median} frames a second at 4x`)
}
/* 360ms, the website builder sheet's open; the first and last frames barely move, so a little under is read. */
if (feelReport.open.durationMs.median < 320 || feelReport.open.durationMs.median > 400) problems.push(`an open took ${feelReport.open.durationMs.median}ms, not 340 to 380`)
if (feelReport.close.durationMs.median < 300 || feelReport.close.durationMs.median > 380) problems.push(`a tap outside closed in ${feelReport.close.durationMs.median}ms, not 320 to 360`)
if (feelReport.close.firstTwoFramesPct.median > 10) problems.push(`a tap outside moved the sheet ${feelReport.close.firstTwoFramesPct.median}% of the way in its first two frames: a jump, not a slide`)
if (linkPrefetch) problems.push(`the account sheet's links asked for ${linkPrefetch} prefetches as they appeared`)

await browser.close()

console.log(JSON.stringify({
  cycles: CYCLES, frames, flashBeforeSlide: flashes, backwardSteps: backwards, unfinished,
  scrimTapExitFramesMin: minExitFrames, shortExits, escapeFrames, parentCloseFrames: parentFrames, takenAwayFrames: unmountFrames,
  pillAtRest, pillHidden, pillMoved, pillTappedThroughScrim: pillTapped,
  longTasks, maxLongTaskMs: Math.round(maxLong), dragLagPx: Math.round(dragLag * 10) / 10, slowDrag: slow, flick,
}))
if (flashes) problems.push(`${flashes} opens painted the sheet before it slid`)
if (backwards) problems.push(`${backwards} frames moved the sheet backwards`)
if (unfinished) problems.push(`${unfinished} opens or closes did not finish`)
if (shortExits) problems.push(`${shortExits} scrim taps closed the sheet in 5 frames or fewer (the fewest was ${minExitFrames})`)
if (pillHidden) problems.push(`the nav pill was hidden, covered by the page, or over the sheet in ${pillHidden} readings`)
if (pillMoved) problems.push(`the nav pill moved while a sheet was open in ${pillMoved} cycles`)
if (pillTapped) problems.push(`a tap on the pill under an open sheet reached the pill ${pillTapped} times`)
if (dragLag > 1) problems.push(`the sheet was ${dragLag.toFixed(1)}px away from the finger during a drag`)
if (longTasks) problems.push(`${longTasks} long tasks while a sheet moved, the longest ${Math.round(maxLong)}ms`)
if (problems.length) fail(problems.join("\n"))
console.log("ok: every open starts below the screen, every close slides out, both move one way, and the pill stays visible under the sheet")
