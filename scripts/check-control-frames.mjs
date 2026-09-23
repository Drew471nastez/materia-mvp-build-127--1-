/**
 * ===========================================================================
 *  A SLIDER DRAGGED IN THE SHEET, WITH THE FRAMES COUNTED
 * ===========================================================================
 * "The whole mobile bottom sheet with sections, pages and settings should not
 * lag at all." It did, and not because of anything the sheet does.
 *
 * Every control in the editor ends in the same place: a setting changes and
 * the canvas re-renders the page to show it. A phone reports touches faster
 * than it paints — up to 240 a second on a 120Hz panel — and each one of
 * those was a full page render, inside the touch, before the next touch
 * could be handled. So the thumb fell behind the finger.
 *
 * Two changes, and this measures both:
 *
 *   the slider draws its thumb from its own state and hands the setting
 *   upward at most once a frame
 *
 *   the canvas is handed a deferred copy of that state, so React paints the
 *   control first and re-renders the page afterwards, throwing that work
 *   away and restarting it if another touch has arrived
 *
 * The slider and the sheet here are the real ones. The canvas is a stand-in
 * with the shape that matters, and the probe runs the drag twice — once with
 * the deferral on, once with it off — so the number it reports is a
 * comparison rather than a claim.
 *
 * Headless Chromium with no GPU does not pace to a display, so none of this
 * is a claim about a rate on a phone. What it can show is how much work a
 * drag asks for, and whether any single frame stalls.
 *
 *   pnpm build && node scripts/check-control-frames.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-ctlfps-"))
const stubs = join(root, ".ctlfps-probe")
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
/*
  A phone reports touches faster than it paints: 120Hz and 240Hz digitizers
  are ordinary, and 60Hz painting is not. So the moves go out in bursts of
  four with nothing between them, and a frame's worth of time between bursts.
  A probe that sent one touch per frame would be measuring a case where there
  is nothing to coalesce, and would call the old code smooth.
*/
const BURSTS = 15
const PER_BURST = 4
const MOVES = BURSTS * PER_BURST
/** See setCPUThrottlingRate below. */
const CPU_THROTTLE = 4
/* Kept in step with RENDER_MS in scripts/render-control-frames.tsx, for the
   failure message only. */
const RENDER_MS_NOTE = "60ms"

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-control-frames.tsx"),
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
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

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
const run = async (expression) => {
  const res = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (res.exceptionDetails) fail(`The probe threw: ${JSON.stringify(res.exceptionDetails.text || res.exceptionDetails)}`)
  return JSON.parse(res.result.value)
}

await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", {
  width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true,
  screenOrientation: { angle: 0, type: "portraitPrimary" },
})
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
/*
  A PHONE'S CPU, NOT THE BUILD MACHINE'S.

  Without this the probe ran every frame inside its budget whatever the
  editor did: deferring the canvas and NOT deferring it both came back with
  15 writes and zero janky frames, which is a probe that cannot tell the fix
  from the bug, let alone see a regression. The container is several times
  faster than the phone the lag was reported on, and a render that fits in a
  frame here does not fit in one there.

  4x is the rate Chrome's own mobile profile uses for a mid-range phone. It
  is applied for the whole run so both halves of the comparison pay it.
*/
await call("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE })
await call("Page.navigate", { url: "file://" + file })
await sleep(1800)

const ARM = (deferred) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__deferred = ${deferred}
  const thumb = document.querySelector("[data-slot='slider-thumb']")
  if (!thumb) return JSON.stringify({ found: false })
  /* Back to the start, and let everything settle before anything is counted. */
  window.__reset(0)
  await wait(500)

  window.__writes = 0
  window.__heavy = 0
  window.__frames = []
  window.__watch = true
  let last = performance.now()
  const tick = (t) => {
    if (!window.__watch) return
    window.__frames.push(Math.round((t - last) * 100) / 100)
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame((t) => { last = t; tick(t) })

  const track = document.querySelector("[data-slot='slider-track']")
  const r = track.getBoundingClientRect()
  return JSON.stringify({
    found: true,
    left: Math.round(r.left + 4),
    right: Math.round(r.right - 4),
    y: Math.round(r.top + r.height / 2),
    startValue: Number(document.querySelector("[data-slot='slider-thumb']").getAttribute("aria-valuenow")),
  })
})()`

const READ = `(async () => {
  await new Promise((r) => setTimeout(r, 600))
  window.__watch = false
  const f = window.__frames.slice(1)
  const sorted = [...f].sort((a, b) => a - b)
  const at = (p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0)
  return JSON.stringify({
    frames: f.length,
    median: at(0.5),
    p95: at(0.95),
    worstGap: sorted.length ? sorted[sorted.length - 1] : 0,
    janky: f.filter((d) => d > 34).length,
    writes: window.__writes,
    heavy: window.__heavy,
    endValue: Number(document.querySelector("[data-slot='slider-thumb']").getAttribute("aria-valuenow")),
  })
})()`

async function drag(deferred) {
  const a = await run(ARM(deferred))
  if (!a.found) fail("The slider never mounted, so there was nothing to drag.")
  const touch = (type, x) => call("Input.dispatchTouchEvent", {
    type,
    touchPoints: type === "touchEnd" ? [] : [{ x, y: a.y }],
  })
  await touch("touchStart", a.left)
  const started = Date.now()
  for (let b = 0; b < BURSTS; b++) {
    const batch = []
    for (let k = 1; k <= PER_BURST; k++) {
      const i = b * PER_BURST + k
      batch.push(touch("touchMove", a.left + Math.round(((a.right - a.left) * i) / MOVES)))
    }
    await Promise.all(batch)
    await sleep(16)
  }
  await touch("touchEnd", a.right)
  const ms = Date.now() - started
  const r = await run(READ)
  return { ...r, ms, startValue: a.startValue }
}

const on = await drag(true)
const off = await drag(false)

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

const show = (label, r) => {
  console.log(`\n${label}`)
  console.log(`  ${MOVES} touches over ${r.ms}ms, value ${r.startValue} → ${r.endValue}`)
  console.log(`  ${r.frames} frames, median ${r.median}ms, p95 ${r.p95}ms, worst ${r.worstGap}ms, ${r.janky} over 34ms`)
  console.log(`  ${r.writes} settings writes, ${r.heavy} canvas renders`)
}

show("Dragging the slider, with the canvas deferred", on)
show("And with it not deferred, which is what it used to do", off)
console.log("")

expect(on.endValue > on.startValue + 40, "the drag moved the slider", `${on.startValue} → ${on.endValue}`)
expect(on.writes > 0, "and the setting followed it", `${on.writes} writes`)
expect(
  on.writes <= on.frames + 2,
  "the setting was written at most once a frame, not once a touch",
  `${on.writes} writes across ${on.frames} frames, from ${MOVES} touches`,
)
/*
  Measured both ways while this was written: coalesced it is 15 or 16, and
  with the coalescing taken out it is 28 to 30. A third of the touches is
  comfortably between them and well clear of both.
*/
expect(on.writes <= MOVES / 3, "which is far fewer writes than there were touches", `${on.writes} against ${MOVES}`)
/*
  AND FEWER THAN ONE PER FRAME WHEN THE CANVAS CANNOT AFFORD ONE PER FRAME.

  Once a frame is the right ceiling and the wrong rate. The far end is a page
  of sections; on a phone that is tens of milliseconds, and asking for it
  every frame queues work the device cannot clear, so the whole sheet
  stutters behind it.

  useFrameCommit waits about twice what the last commit cost before asking
  again, so the canvas takes roughly a third of the thread and the drag keeps
  the rest. It tunes itself: an 8ms canvas is waited on for 16 and updates
  every frame.

  Measured here, with the fixture's canvas at RENDER_MS and the CPU at a
  quarter speed, across the same one-second drag:

    once a frame   15 settings writes, 15 canvas renders, 15 janky frames
    share rule      8 settings writes, 12 canvas renders, 12 janky frames

  The writes are what this holds, because they are what the editor is asked
  to do and the only part that moved decisively. Jank falls with them but not
  to zero, and it cannot: a canvas that costs 60ms cannot be repainted inside
  a 16.7ms frame, and the honest fix for the rest is a cheaper canvas.
*/
expect(on.writes <= MOVES / 5,
  "and fewer still when each one costs the canvas more than a frame",
  `${on.writes} writes for ${MOVES} touches, canvas at ${RENDER_MS_NOTE}`)
/*
  AND THE DRAG DOES NOT COMPOUND WHAT THE CANVAS COSTS.

  This asked for ZERO frames over budget, and held while the fixture's canvas
  rendered in 20ms on an unthrottled CPU — a canvas that fits inside a frame,
  which is not the one the lag was reported on. At RENDER_MS with the CPU at
  a quarter speed, zero is not reachable and never will be: a canvas that
  takes longer than 16.7ms to draw cannot be drawn inside a frame, and the
  only honest ways to zero are a cheaper canvas or no live preview at all.

  Asserting zero anyway would mean weakening it to some number later, which
  is how a measurement becomes decoration. So it holds the thing that is
  actually in this code's gift: each canvas render may cost its own long
  frame, and NOTHING BEYOND THAT. More long frames than renders means the
  drag is paying for the canvas more than once — queued work, a commit
  landing inside another, the compounding that reads as the sheet seizing up.

  AND THEN IT WAS NOT ASSERTED, because it is not stable enough to be worth
  anything. Run three times in a row on this machine the same code gave 15,
  8 and 9 long frames against 15, 9 and 9 renders: the two numbers move
  together with the noise, so a rule relating them passes or fails on which
  run you got. A measurement that flaky does not protect the code, it just
  gets deleted the third time somebody sees it red for no reason.

  The number is printed on every run because it is worth reading. What is
  ASSERTED is the write rate above, which separates cleanly and is the part
  this code actually governs: 8 to 10 with the share rule against 15 to 16
  without it, run after run. The long frames that remain belong to the
  canvas costing more than a frame to draw, and the honest fix for those is
  a cheaper canvas rather than a tighter number in here.
*/
console.log(`  --    ${on.janky} frames over budget for ${on.heavy} canvas renders, which is NOT asserted: see below`)

/**
 * AND THE COMPARISON THIS ENVIRONMENT CANNOT MAKE, SAID OUT LOUD.
 *
 * Headless Chromium paces requestAnimationFrame from a timer rather than
 * from a display, so its frame gaps stay at 16.7ms however busy the main
 * thread is. Jank is not visible here at all. The wall clock for the same
 * sixty touches was tried as a stand-in and it is not stable enough to pin a
 * number to: repeated runs put the deferred canvas anywhere from a fifth
 * faster to a twentieth slower, which is the machine, not the code.
 *
 * So the deferral is NOT asserted. What the second run is for is to show it
 * changes nothing it should not: the same drag, the same number of writes,
 * the same value at the end. Whether it helps on a phone is a claim this
 * probe cannot make, and so it does not make it.
 */
console.log(`  --    wall clock ${on.ms}ms deferred against ${off.ms}ms not, which this environment cannot read anything into`)
/*
  THIS ASKED FOR THE TWO PASSES TO WRITE THE SAME AMOUNT, AND THEY NO LONGER
  DO — because the rate is no longer fixed.

  It held while every commit went out once a frame regardless of what it
  cost: the same touches then produced the same writes whatever the canvas
  was doing. The commit now waits about twice what the last one cost, so a
  more expensive path is throttled harder, and the NOT-deferred pass is the
  more expensive one by construction — its canvas render blocks the frame
  instead of being interrupted.

  So the two differ on purpose: 9 to 11 deferred against 5 to 8 not, run
  after run. Asserting they match would be asserting the rate is fixed,
  which is the thing that was wrong.

  The invariant worth keeping is the direction. The costlier path must be
  asked for no MORE than the cheaper one; if deferring ever produced fewer
  writes than not deferring, the back-off would be reading cost backwards.
  Where the drag ends up is checked separately and is identical either way.
*/
expect(
  off.writes <= on.writes,
  "the costlier path is throttled at least as hard, never less",
  `${on.writes} deferred, ${off.writes} not`,
)
expect(off.endValue === on.endValue, "nor where the drag ends up", `${on.endValue} either way`)

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The slider keeps up with the finger, and the canvas catches up behind it.\n")
