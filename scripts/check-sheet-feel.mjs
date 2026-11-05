/**
 * ===========================================================================
 *  THE EDITOR'S SHEET UNDER A REAL FINGER, MEASURED FOR FEEL
 * ===========================================================================
 * scripts/check-sheet-frames.mjs says whether the browser keeps up with a
 * drag. It cannot say whether the drag FEELS like a native sheet, which is
 * a handful of separate claims, each of them a number:
 *
 *   TRACKING     while a finger drags the handle, how far the sheet is from
 *                where the finger has put it, read after every frame
 *   HAND-OFF     the speed the sheet leaves at when the finger lifts, as a
 *                multiple of the finger's speed at that moment. 1.0 is a
 *                sheet that carries on; the old snap measured over 2
 *   RUBBER BAND  pulled past its tallest stop, how far the sheet gives, what
 *                shows in the strip it opens underneath itself, and whether
 *                it comes back
 *   SCROLL, THEN SHEET  a finger scrolling the list back to its top and
 *                carrying on: does the sheet take over from there
 *   SCROLL AT HALF  a finger pushing up on the list at the half stop: the
 *                list scrolls and the sheet's translate does not move. The
 *                rule before this one grew the sheet first; the owner asked
 *                for the list to scroll at half
 *   GRAB BAR     the same push on the grab bar at half moves the sheet and
 *                leaves the list alone
 *   TAP          taps on the grab bar: closed to half, half to full, full
 *                to half
 *   FLICK        a short flick up on the tabs at half (about 0.35 px/ms over
 *                a dozen pixels) reaches full; a slow placed push does not
 *   PACING       the frame gaps across all of the above, p95
 *
 * Real touches over CDP (Input.dispatchTouchEvent), so the browser's own
 * gesture handling, passive listeners and touch-action all apply, on the
 * editor's own MobileEditorSheet in a fixture shaped like the Sections sheet
 * (scripts/render-sheet-feel.tsx).
 *
 *   pnpm build && node scripts/check-sheet-feel.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

/* The fixture's scroller has to be the editor's scroller, or every number
   about the list is about some other list. Read the editor's markers. */
const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
const sheetBlock = editor.slice(editor.indexOf("Segmented tabs"), editor.indexOf("</MobileEditorSheet>", editor.indexOf("Segmented tabs")))
const editorScroller = (sheetBlock.match(/<div (data-[^>]*?)className="flex-1 min-h-0 overflow-y-auto/) || [])[1] || ""
const editorMarkers = (editorScroller.match(/data-[a-z-]+/g) || []).sort().join(" ")
const fixture = readFileSync(join(root, "scripts/render-sheet-feel.tsx"), "utf8")
const fixtureScroller = (fixture.match(/<div id="list" (data-[^>]*?)className=/) || [])[1] || ""
const fixtureMarkers = (fixtureScroller.match(/data-[a-z-]+/g) || []).sort().join(" ")

const out = mkdtempSync(join(tmpdir(), "storelib-sheetfeel-"))
const stubs = join(root, ".sheetfps-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

const VIEW_W = 390
const VIEW_H = 844

execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-sheet-feel.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#0b6e4f}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/*
  INSTRUMENT. Every frame: the sheet's top and the frame gap. Every touch:
  where and when, by the event's own clock. Reading the sheet INSIDE a rAF
  callback would run before the sheet's own rAF write for that frame and
  report a frame of lag that is the probe's, so it is read in a task queued
  from the callback, after the frame's callbacks have all run.
*/
const INSTRUMENT = `(() => {
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  const list = document.getElementById("list")
  if (!sheet || !list) return JSON.stringify({ ok: false })
  window.__fingers = []
  const note = (e) => {
    const t = e.touches[0] || e.changedTouches[0]
    /* \`t\` is when the finger was there; \`at\` is when the page heard of it,
       which is what the sheet can possibly have drawn by a given frame. */
    window.__fingers.push({ type: e.type, t: e.timeStamp, at: performance.now(), y: t ? t.clientY : null, prevented: e.defaultPrevented, cancelable: e.cancelable })
  }
  /* Bubble phase, after the sheet's own listener has had its say. */
  window.addEventListener("touchstart", note, { passive: true })
  window.addEventListener("touchmove", note, { passive: true })
  window.addEventListener("touchend", note, { passive: true })
  window.__log = []
  window.__frames = []
  let last = 0
  const tick = (t) => {
    if (last) window.__frames.push(t - last)
    last = t
    setTimeout(() => window.__log.push({ t: performance.now(), frameT: t, top: sheet.getBoundingClientRect().top, scroll: list.scrollTop }), 0)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
  window.__top = () => sheet.getBoundingClientRect().top
  /* The sheet's own translate, which is what a drag writes. */
  window.__ty = () => new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42
  window.__settle = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => {
    const seen = window.__fingers.filter((f) => f.y !== null)
    r(JSON.stringify({ top: sheet.getBoundingClientRect().top, scroll: list.scrollTop, height: sheet.getBoundingClientRect().height, finger: seen.length ? seen[seen.length - 1].y : null }))
  }, 0))))
  window.__bg = getComputedStyle(sheet).backgroundColor
  return JSON.stringify({ ok: true, bg: window.__bg })
})()`

const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (m, p) => send(m, p, sessionId)
await call("Page.enable", {})
await call("Runtime.enable", {})
/* Enabled up front: turning the counters on mid-run stalls a frame, which
   would land in the pacing numbers. */
await call("Performance.enable", {})
await call("Emulation.setDeviceMetricsOverride", {
  width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true,
  screenOrientation: { angle: 0, type: "portraitPrimary" },
})
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
await call("Page.navigate", { url: "file://" + file })
await sleep(1600)

const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.text || r.exceptionDetails)}\n${expression.slice(0, 200)}`)
  return r.result.value
}
const inst = JSON.parse(await js(INSTRUMENT))
if (!inst.ok) fail("The sheet never mounted: " + (await js("JSON.stringify(window.__err)")))
const settled = async () => JSON.parse(await js("window.__settle()"))
/* `timestamp` (seconds since the epoch) stamps the event itself, so a finger
   can move at a known speed however long each dispatch takes to arrive. */
const touch = (type, x, y, timestamp) =>
  call("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }], ...(timestamp ? { timestamp } : {}) })
/** A steady finger: `steps` moves of `dy` each, `every` ms apart. */
async function stroke(x, y, dy, steps, every, { release = true, readEach = false, beforeRelease = null } = {}) {
  await touch("touchStart", x, y)
  const each = []
  let at = y
  for (let i = 1; i <= steps; i++) {
    at = y + dy * i
    await touch("touchMove", x, at)
    if (readEach) each.push(await settled())
    else await sleep(every)
  }
  if (beforeRelease) await beforeRelease()
  if (release) await touch("touchEnd", x, at)
  return { each, at }
}
const reset = async () => {
  await js("window.__setOpen(false)")
  await sleep(700)
  await js("window.__setOpen(true)")
  await sleep(900)
  await js("document.getElementById('list').scrollTop = 0")
  await sleep(100)
}
/** One pixel of the screen, as [r, g, b]. */
async function pixel(x, y) {
  const { data } = await call("Page.captureScreenshot", { format: "png", clip: { x, y, width: 1, height: 1, scale: 1 } })
  const png = Buffer.from(data, "base64")
  let off = 8, idat = [], colorType = 6
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.toString("ascii", off + 4, off + 8)
    const body = png.subarray(off + 8, off + 8 + len)
    if (type === "IHDR") colorType = body[9]
    if (type === "IDAT") idat.push(body)
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  /* One pixel on one row: every PNG filter leaves the first pixel as it is. */
  return [raw[1], raw[2], raw[3], colorType]
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

const HANDLE_X = Math.round(VIEW_W / 2)
const r = {}

// ── rest ────────────────────────────────────────────────────────────────
const rest = await settled()
r.halfTop = Math.round(rest.top)
r.sheetHeight = Math.round(rest.height)
r.fullTop = VIEW_H - r.sheetHeight

// ── TRACKING: the handle, dragged down 120px, read after each move ─────
/* Against the finger as the PAGE saw it. Chromium holds back a touchmove
   that has not left its slop region, so the first 8px move never reaches
   any script; comparing with where the probe put the finger would charge
   the sheet for the browser's filter. */
{
  const y0 = r.halfTop + 12
  const { each, at } = await stroke(HANDLE_X, y0, 8, 15, 0, { release: false, readEach: true })
  const errs = each.map((s) => Math.abs((s.top - rest.top) - ((s.finger ?? y0) - y0)))
  r.trackSettledMax = Math.max(...errs)
  await sleep(250)
  await touch("touchEnd", HANDLE_X, at)
  await sleep(800)
}

// ── TRACKING while moving, frame by frame, and the HAND-OFF at release ──
await reset()
{
  const start = await settled()
  const y0 = Math.round(start.top) + 12
  const mark = await js("window.__log.length")
  const fmark = await js("window.__fingers.length")
  /* Each CDP touch takes a frame or two to be acknowledged, so the steps
     are sized for a finger near 1 px/ms at that rate rather than slept. */
  /*
    AND WHAT THE RELEASE COSTS THE MAIN THREAD before the snap can start:
    layouts from the finger lifting to the first frame after it. The room
    under the list is a layout of the list, and the old release wrote it in
    the same handler that started the snap. Counted by the browser.
  */
  const metric = async (name) => (await call("Performance.getMetrics", {})).metrics.find((m) => m.name === name)?.value ?? 0
  let layoutsBefore = 0
  await stroke(HANDLE_X, y0, -36, 7, 0, { beforeRelease: async () => { layoutsBefore = await metric("LayoutCount") } })
  await js("new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)))")
  r.releaseLayouts = (await metric("LayoutCount")) - layoutsBefore
  await sleep(700)
  const log = JSON.parse(await js(`JSON.stringify(window.__log.slice(${mark}))`))
  const fingers = JSON.parse(await js(`JSON.stringify(window.__fingers.slice(${fmark}))`))
  const moves = fingers.filter((f) => f.type === "touchmove")
  const end = fingers.find((f) => f.type === "touchend")
  /* Continuous tracking: at each frame while the finger was down, the sheet
     against the latest finger position the page had seen by then. */
  const during = log.filter((s) => s.t > moves[0].t && s.t < end.t)
  const trackErr = during.map((s) => {
    const f = [...moves].reverse().find((m) => m.at <= s.t) || moves[0]
    return Math.abs((s.top - start.top) - (f.y - y0))
  }).sort((a, b) => a - b)
  r.trackFrameP95 = trackErr.length ? trackErr[Math.floor(trackErr.length * 0.95)] : null
  r.trackFrameMax = trackErr.length ? trackErr[trackErr.length - 1] : null
  /* Finger speed over its last 100ms, by the events' own clock, which is
     the window the sheet itself reads it over. */
  const lastT = moves[moves.length - 1].t
  const tail = moves.filter((m) => m.t >= lastT - 100)
  r.fingerV = (tail[tail.length - 1].y - tail[0].y) / (tail[tail.length - 1].t - tail[0].t)
  /* Sheet speed in the first frames after release: from the first frame
     that has moved off the release position, over the next two. */
  const after = log.filter((s) => s.frameT >= end.t)
  const i0 = Math.max(0, after.findIndex((s, i) => i > 0 && Math.abs(s.top - after[0].top) > 0.01) - 1)
  const a = after[i0], b = after[i0 + 1], c = after[i0 + 2]
  r.sheetV1 = b ? (b.top - a.top) / (b.frameT - a.frameT) : null
  r.sheetV2 = c ? (c.top - a.top) / (c.frameT - a.frameT) : null
  r.handoffRatio = r.sheetV1 / r.fingerV
  r.handoffRatio2 = r.sheetV2 / r.fingerV
  r.landedFull = Math.round(after[after.length - 1].top) === r.fullTop
}

// ── RUBBER BAND at the top ──────────────────────────────────────────────
{
  const start = await settled()
  const y0 = Math.round(start.top) + 12
  const { at } = await stroke(HANDLE_X, y0, -10, 15, 16, { release: false })
  const held = await settled()
  r.bandPull = y0 - at
  r.bandLift = Math.round((start.top - held.top) * 10) / 10
  const px = await pixel(HANDLE_X, VIEW_H - 3)
  /* The sheet's own colour, read off the screen from a blank strip inside
     it, rather than parsed from a computed colour in whatever space the
     stylesheet wrote it in. */
  const inside = await pixel(4, Math.round(held.top) + 120)
  r.bandBottomPixel = px.slice(0, 3)
  r.bandSheetPixel = inside.slice(0, 3)
  r.bandBottomIsSheet = dist(px, inside) < 24
  await touch("touchEnd", HANDLE_X, at)
  await sleep(700)
  r.bandBack = Math.round((await settled()).top) === Math.round(start.top)
}

// ── SCROLL, THEN SHEET ──────────────────────────────────────────────────
await reset()
{
  await js("document.getElementById('list').scrollTop = 80")
  await sleep(120)
  const start = await settled()
  const y0 = Math.round(start.top) + 160
  await stroke(HANDLE_X, y0, 12, 20, 16, { release: false })
  const held = await settled()
  r.handScrollStart = 80
  r.handScrollEnd = Math.round(held.scroll)
  r.handSheetMoved = Math.round(held.top - start.top)
  await touch("touchEnd", HANDLE_X, y0 + 240)
  await sleep(800)
}

// ── SCROLL AT HALF: a push up inside the list scrolls the list ──────────
await reset()
{
  const start = await settled()
  const ty0 = await js("window.__ty()")
  const y0 = Math.round(start.top) + 160
  await touch("touchStart", HANDLE_X, y0)
  let at = y0
  for (let i = 1; i <= 15; i++) { at = y0 - 12 * i; await touch("touchMove", HANDLE_X, at); await sleep(16) }
  const mid = await settled()
  r.halfTy = Math.round(ty0)
  r.halfSheetMoved = Math.round((await js("window.__ty()")) - ty0)
  r.halfListScrolled = Math.round(mid.scroll)
  r.halfFingerTravel = y0 - at
  await touch("touchEnd", HANDLE_X, at)
  await sleep(900)
  const after = await settled()
  r.halfStillHalf = Math.round(after.top) === r.halfTop
  /* And back down: the list scrolls back to its top, then the sheet takes
     the rest of the same finger (the hand-off), still at half. */
}

// ── GRAB BAR at half: the same push moves the sheet, not the list ───────
await reset()
{
  const start = await settled()
  const ty0 = await js("window.__ty()")
  const y0 = Math.round(start.top) + 12
  await touch("touchStart", HANDLE_X, y0)
  let at = y0
  for (let i = 1; i <= 8; i++) { at = y0 - 10 * i; await touch("touchMove", HANDLE_X, at); await sleep(16) }
  const mid = await settled()
  r.barSheetMoved = Math.round(ty0 - (await js("window.__ty()")))
  r.barFinger = y0 - (mid.finger ?? at)
  r.barListScrolled = Math.round(mid.scroll)
  /* Held still before the lift, so it is a placement and settles at the nearest stop. */
  await sleep(300)
  await touch("touchEnd", HANDLE_X, at)
  await sleep(800)
}

// ── TAP on the grab bar: closed -> half -> full -> half ─────────────────
{
  await js("window.__setOpen(false)")
  await sleep(900)
  const tap = async () => {
    const top = (await settled()).top
    const y = Math.round(top) + 10
    await touch("touchStart", HANDLE_X, y)
    await sleep(40)
    await touch("touchEnd", HANDLE_X, y)
    await sleep(800)
    return Math.round((await settled()).top)
  }
  r.closedTop = Math.round((await settled()).top)
  r.tap1 = await tap()
  r.tap2 = await tap()
  r.tap3 = await tap()
}

// ── FLICK thresholds, on the tabs (nothing there scrolls) ───────────────
/* A finger with a known clock: each event is stamped `every` ms after the
   last, so its speed is `step / every` px/ms whatever the dispatch costs.
   Chromium withholds moves inside its 15px touch slop, so the first one or
   two never reach a script, which is what a real phone's browser does too. */
async function flickOnTabs(step, moves, every, holdBeforeLift = 0) {
  await reset()
  const start = await settled()
  const tabs = JSON.parse(await js("JSON.stringify(document.getElementById('tabs').getBoundingClientRect())"))
  const y0 = Math.round(tabs.top + tabs.height / 2)
  const fmark = await js("window.__fingers.length")
  const t0 = Date.now() / 1000
  await touch("touchStart", HANDLE_X, y0, t0)
  let at = y0
  for (let i = 1; i <= moves; i++) { at = y0 - step * i; await touch("touchMove", HANDLE_X, at, t0 + (i * every) / 1000) }
  const liftAt = t0 + (moves * every + 8 + holdBeforeLift) / 1000
  while (Date.now() / 1000 < liftAt) await sleep(5)
  await touch("touchEnd", HANDLE_X, at, liftAt)
  await sleep(900)
  const all = JSON.parse(await js(`JSON.stringify(window.__fingers.slice(${fmark}))`))
  /* The touchstart counts as a sample: the browser may deliver only one move. */
  const fingers = all.filter((f) => f.type !== "touchend")
  const last = fingers[fingers.length - 1], first = fingers.find((f) => f.t >= last.t - 100) || fingers[0]
  return {
    travel: y0 - at,
    speed: last && first && last.t > first.t ? (first.y - last.y) / (last.t - first.t) : null,
    from: Math.round(start.top),
    to: Math.round((await settled()).top),
  }
}
/* 18px in 48ms, 0.375 px/ms: a short nudge of a thumb. */
r.flickShort = await flickOnTabs(6, 3, 16)
/* 36px at 0.1 px/ms and then held a quarter second: placing, not throwing. */
r.flickPlaced = await flickOnTabs(3, 12, 30, 250)
/* Just under the speed threshold: 18px at 0.2 px/ms, lifted straight off. */
r.flickSlow = await flickOnTabs(4, 5, 20)

const frames = JSON.parse(await js("JSON.stringify(window.__frames)")).sort((a, b) => a - b)
r.frames = frames.length
r.frameP95 = Math.round(frames[Math.floor(frames.length * 0.95)] * 10) / 10
r.frameWorst = Math.round(frames[frames.length - 1] * 10) / 10
const fingers = JSON.parse(await js("JSON.stringify(window.__fingers)"))
r.preventedUncancelable = fingers.filter((f) => f.prevented && !f.cancelable).length
r.errors = JSON.parse(await js("JSON.stringify(window.__err)"))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

const n = (v, d = 2) => (v === null || v === undefined || Number.isNaN(v) ? String(v) : Number(v).toFixed(d))
console.log(`\nThe Sections sheet at ${VIEW_W}x${VIEW_H}: ${r.sheetHeight}px tall, half at ${r.halfTop}, full at ${r.fullTop}\n`)
console.log(`  fixture scroller  ${fixtureMarkers || "(none)"}   editor's  ${editorMarkers || "(none)"}`)
console.log(`  tracking          settled after each move: worst ${n(r.trackSettledMax, 1)}px`)
console.log(`                    frame by frame, moving: p95 ${n(r.trackFrameP95, 1)}px, worst ${n(r.trackFrameMax, 1)}px`)
console.log(`  hand-off          finger ${n(r.fingerV)} px/ms at release; sheet ${n(r.sheetV1)} px/ms first frame, ${n(r.sheetV2)} over two`)
console.log(`                    ratio ${n(r.handoffRatio)} first frame, ${n(r.handoffRatio2)} over two; landed at full: ${r.landedFull}`)
console.log(`                    ${r.releaseLayouts} layout${r.releaseLayouts === 1 ? "" : "s"} between the lift and the first frame of the snap`)
console.log(`  rubber band       pulled ${r.bandPull}px past full: sheet gave ${r.bandLift}px; back at full after release: ${r.bandBack}`)
console.log(`                    bottom pixel rgb(${r.bandBottomPixel.join(",")}), sheet rgb(${r.bandSheetPixel.join(",")}): ${r.bandBottomIsSheet ? "the sheet" : "NOT THE SHEET"}`)
console.log(`  scroll, then sheet  list ${r.handScrollStart}px down, finger 240px down: list ended at ${r.handScrollEnd}, sheet moved ${r.handSheetMoved}px`)
console.log(`  scroll at half    finger ${r.halfFingerTravel}px up on the list at half (translate ${r.halfTy}px): translate moved ${r.halfSheetMoved}px, list scrolled ${r.halfListScrolled}px; still at half after the lift: ${r.halfStillHalf}`)
console.log(`  grab bar at half  finger ${r.barFinger}px up on the bar: translate moved ${r.barSheetMoved}px, list scrolled ${r.barListScrolled}px`)
console.log(`  tap on the bar    closed ${r.closedTop} -> ${r.tap1} -> ${r.tap2} -> ${r.tap3}   (half ${r.halfTop}, full ${r.fullTop})`)
console.log(`  flick on tabs     short: ${r.flickShort.travel}px at ${n(r.flickShort.speed)} px/ms, ${r.flickShort.from} -> ${r.flickShort.to}`)
console.log(`                    placed: ${r.flickPlaced.travel}px at ${n(r.flickPlaced.speed)} px/ms then held 250ms, ${r.flickPlaced.from} -> ${r.flickPlaced.to}`)
console.log(`                    slow: ${r.flickSlow.travel}px at ${n(r.flickSlow.speed)} px/ms, lifted at once, ${r.flickSlow.from} -> ${r.flickSlow.to}`)
console.log(`  pacing            ${r.frames} frames, p95 ${r.frameP95}ms, worst ${r.frameWorst}ms`)
console.log(`  preventDefault on an uncancellable move: ${r.preventedUncancelable}`)
if (r.errors.length) console.log(`  page errors: ${r.errors.join(" | ")}`)
console.log("")

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
expect(fixtureMarkers === editorMarkers, "the fixture's scroller carries the editor's markers")
expect(r.trackSettledMax <= 1, "the sheet is where the finger put it after every move")
expect(r.trackFrameP95 !== null && r.trackFrameP95 <= 20, "and never more than a frame of finger behind while it moves")
expect(r.handoffRatio >= 0.6 && r.handoffRatio <= 1.5, "the sheet leaves the finger at the finger's speed (0.6 to 1.5 times)")
expect(r.landedFull, "and lands on the stop it was thrown at")
expect(r.releaseLayouts === 0, "and the release lays nothing out before the snap has started")
expect(r.bandLift > 5 && r.bandLift < r.bandPull * 0.6, "past the tallest stop it gives, and less than the finger")
expect(r.bandBottomIsSheet, "what shows under it while it is lifted is the sheet")
expect(r.bandBack, "and it comes back when let go")
expect(r.handScrollEnd === 0 && r.handSheetMoved > 60, "a scroll that runs out of list hands the rest of the finger to the sheet")
expect(Math.abs(r.halfSheetMoved) <= 1 && r.halfListScrolled > 100, "at half, a push up inside the list scrolls the list and leaves the sheet's translate alone")
expect(r.halfStillHalf, "and the sheet is still at half after the lift")
expect(Math.abs(r.barSheetMoved - r.barFinger) <= 2 && r.barListScrolled === 0, "at half, the same push on the grab bar moves the sheet with the finger and scrolls nothing")
expect(Math.abs(r.tap1 - r.halfTop) <= 1 && Math.abs(r.tap2 - r.fullTop) <= 1 && Math.abs(r.tap3 - r.halfTop) <= 1, "taps on the grab bar step closed to half, half to full, full to half")
expect(Math.abs(r.flickShort.to - r.fullTop) <= 1 && r.flickShort.travel <= 20, "a short flick up from half, under 20px of finger, reaches full")
expect(Math.abs(r.flickPlaced.to - r.halfTop) <= 1, "a slow push that is held before the lift stays at half")
expect(Math.abs(r.flickSlow.to - r.halfTop) <= 1, "and a push under 0.25 px/ms is not a flick")
expect(r.frameP95 <= 34, "frame pacing p95 inside two frames")
expect(r.preventedUncancelable === 0, "never cancels a move the browser said it could not")
expect(r.errors.length === 0, "no page errors")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The sheet tracks the finger, carries its speed, gives at the top, lets its list scroll at half, and steps on a tap.\n")
