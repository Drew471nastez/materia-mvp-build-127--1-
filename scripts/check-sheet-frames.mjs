/**
 * ===========================================================================
 *  THE EDITOR'S SHEET, DRAGGED, WITH THE FRAMES COUNTED
 * ===========================================================================
 * scripts/check-sheet.mjs drags a sheet and checks its arithmetic, and says
 * so in its own header: "frames are shimmed... what is measured is the
 * sheet's arithmetic, not its frame pacing." So nothing had ever looked at
 * the pacing, which is the whole of "it lags".
 *
 * This drives a real page over CDP with real touch events and records, for
 * every frame of the drag, how long since the one before it. What comes out
 * is three numbers that mean something:
 *
 *   how many frames the drag produced, against how many it had time for
 *   the worst gap between two of them
 *   how many transform writes landed, against how many touchmoves went in
 *
 * The last one is the interesting one. The sheet coalesces its writes into
 * one per frame on purpose, so more moves than writes is correct and is not
 * a dropped frame; FEWER writes than frames would be the sheet failing to
 * keep up with the finger.
 *
 * The content is a settings panel's worth of rows, because a sheet dragged
 * with six rows in it proves nothing about the one in the product.
 *
 *   pnpm build && node scripts/check-sheet-frames.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-sheetfps-"))
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
/* A drag of the length a thumb really makes, at the rate a screen really
   reports: 60 moves is one second of touches. */
const MOVES = 60
const DRAG_PX = 260

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-sheet-frames.tsx"),
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

/*
  ARM. Start a frame recorder, and watch the sheet's own transform so the
  probe can tell "the finger moved and the sheet did not" from "the finger
  moved and the browser did not paint".
*/
const ARM = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await wait(700)
  const sheet = document.querySelector("[data-mobile-bottom-sheet]")
  if (!sheet) return JSON.stringify({ foundSheet: false })

  window.__frames = []
  window.__writes = []
  window.__watch = true
  let last = performance.now()
  let lastTransform = ""
  const tick = (t) => {
    if (!window.__watch) return
    window.__frames.push(Math.round((t - last) * 100) / 100)
    last = t
    const now = sheet.style.transform
    if (now !== lastTransform) { lastTransform = now; window.__writes.push(now) }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame((t) => { last = t; tick(t) })

  const box = sheet.getBoundingClientRect()
  return JSON.stringify({
    foundSheet: true,
    sheetTop: Math.round(box.top),
    /* On the handle, which is what a thumb grabs. */
    grabAt: { x: Math.round(box.left + box.width / 2), y: Math.round(box.top + 14) },
  })
})()`

const READ = `(async () => {
  await new Promise((r) => setTimeout(r, 500))
  window.__watch = false
  const f = window.__frames.slice(1)
  const sorted = [...f].sort((a, b) => a - b)
  const at = (p) => sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0
  return JSON.stringify({
    frames: f.length,
    worstGap: sorted.length ? sorted[sorted.length - 1] : 0,
    p95: at(0.95),
    median: at(0.5),
    /* A frame longer than this is one a finger can feel as a stutter: two
       frames' worth of time at 60Hz, plus a little for the scheduler. */
    janky: f.filter((d) => d > 34).length,
    writes: window.__writes.length,
  })
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
await call("Emulation.setDeviceMetricsOverride", {
  width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true,
  screenOrientation: { angle: 0, type: "portraitPrimary" },
})
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
await call("Page.navigate", { url: "file://" + file })
await sleep(1600)

const armed = await call("Runtime.evaluate", { expression: ARM, awaitPromise: true, returnByValue: true })
if (armed.exceptionDetails) fail(`Arming threw: ${JSON.stringify(armed.exceptionDetails.text || armed.exceptionDetails)}`)
const a = JSON.parse(armed.result.value)
if (!a.foundSheet) fail("The sheet never mounted, so there was nothing to drag.")

/* A real finger: down, sixty moves down the screen, up. */
const touch = (type, y) => call("Input.dispatchTouchEvent", {
  type,
  touchPoints: type === "touchEnd" ? [] : [{ x: a.grabAt.x, y }],
})
await touch("touchStart", a.grabAt.y)
const startedAt = Date.now()
for (let i = 1; i <= MOVES; i++) {
  await touch("touchMove", a.grabAt.y + Math.round((DRAG_PX * i) / MOVES))
  await sleep(16)
}
const dragMs = Date.now() - startedAt
await touch("touchEnd", a.grabAt.y + DRAG_PX)

const read = await call("Runtime.evaluate", { expression: READ, awaitPromise: true, returnByValue: true })
if (read.exceptionDetails) fail(`Reading threw: ${JSON.stringify(read.exceptionDetails.text || read.exceptionDetails)}`)
const r = JSON.parse(read.result.value)

/*
  AND THE OPEN, WHICH IS NOT A DRAG. Closing and reopening runs the sheet's
  own transition with the whole settings panel mounted inside it, which is
  the other half of "it needs to feel smooth": a drag can keep up perfectly
  and an open can still hitch on the first frame, where the browser has a
  layer to build and a panel's worth of DOM to lay out.
*/
const OPEN = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const setOpen = window.__setOpen
  setOpen(false)
  await wait(700)

  window.__frames2 = []
  window.__watch2 = true
  let last = performance.now()
  const tick = (t) => {
    if (!window.__watch2) return
    window.__frames2.push(Math.round((t - last) * 100) / 100)
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame((t) => { last = t; tick(t) })

  setOpen(true)
  await wait(900)
  window.__watch2 = false
  const f = window.__frames2.slice(1)
  const sorted = [...f].sort((a, b) => a - b)
  return JSON.stringify({
    frames: f.length,
    worstGap: sorted.length ? sorted[sorted.length - 1] : 0,
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    janky: f.filter((d) => d > 34).length,
  })
})()`
const opened = await call("Runtime.evaluate", { expression: OPEN, awaitPromise: true, returnByValue: true })
if (opened.exceptionDetails) fail(`The open threw: ${JSON.stringify(opened.exceptionDetails.text || opened.exceptionDetails)}`)
const o = JSON.parse(opened.result.value)

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

console.log(`\nDragging the editor's sheet ${DRAG_PX}px with ${MOVES} touches over ${dragMs}ms\n`)
console.log(`  ${r.frames} frames, median ${r.median}ms, p95 ${r.p95}ms, worst ${r.worstGap}ms, ${r.janky} over 34ms`)
console.log(`  ${r.writes} transform writes\n`)

/* Headless Chromium with no GPU does not pace to a display, so this is not
   a claim about 60Hz on a phone. What it can show is a drag that keeps up
   with the finger and never stalls. */
expect(r.frames > MOVES * 0.5, "the page ran frames throughout the drag", `${r.frames} frames for ${MOVES} touches`)
expect(r.writes >= 2, "the sheet moved with the finger", `${r.writes} transform writes`)
expect(r.writes <= r.frames + 2, "and never more than once a frame, which is the coalescing doing its job",
  `${r.writes} writes across ${r.frames} frames`)
expect(r.janky === 0, "no frame took longer than two frames' worth of time", `${r.janky} did`)
expect(r.p95 <= 34, "and the slow end of them is still inside a frame budget", `p95 ${r.p95}ms`)

console.log("\nAnd opening it again, with the panel mounted inside\n")
console.log(`  ${o.frames} frames, median ${o.median}ms, worst ${o.worstGap}ms, ${o.janky} over 34ms`)
expect(o.frames > 20, "the open ran frames", `${o.frames}`)
expect(o.janky === 0, "and none of them took longer than two frames' worth of time", `${o.janky} did`)

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The drag keeps up with the finger, and the open never stalls.\n")
