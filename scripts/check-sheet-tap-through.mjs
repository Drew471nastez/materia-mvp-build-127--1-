/**
 * ===========================================================================
 *  A TAP ON THE SECTIONS SHEET NEVER REACHES THE CANVAS
 * ===========================================================================
 * Reported: in the builder's phone sheet (Sections / Pages / Theme), a tap
 * sometimes "clicks through" and selects something on the page under it.
 *
 * A browser does not send a tap's click to the element the finger pressed:
 * it makes the click a moment after the finger lifts and sends it to
 * whatever is under the finger THEN. Anything that moves the sheet in that
 * moment (a tap that caught it mid-slide and let it carry on, a release that
 * snapped it, a tab switch that laid it out again) hands the click to the
 * canvas. This mounts the real MobileEditorSheet as the editor builds its
 * Sections sheet (scripts/render-sheet-tap.tsx) over a full-screen button
 * that counts what reaches it, at 390x844 with a touch screen, and taps:
 *
 *   PLAIN        a row: the row gets its click, the canvas nothing
 *   SHEET MOVES  a row, with the page moving the sheet out from under the
 *                finger as it lifts: the canvas still gets nothing, no
 *                mousedown, no mouseup, no click
 *   CONTROL      a tap that starts on the canvas is the canvas's: it gets
 *                its click, even at the very spot a sheet tap was a moment
 *                before, and anywhere else
 *
 *   PROBE_CSS=source node scripts/check-sheet-tap-through.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { appCss } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = await appCss(root)

const W = 390
const H = 844
const out = mkdtempSync(join(tmpdir(), "storelib-taptrough-"))
execFileSync("npx", [
  "--no-install", "esbuild", join(root, "scripts/render-sheet-tap.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:@=${root}`,
  "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>window.process = { env: { NODE_ENV: "production" } }; window.__err = []; window.addEventListener("error", function (e) { window.__err.push(String(e.message)) });</script>` +
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
await call("Page.enable", {})
await call("Runtime.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: true, screenOrientation: { angle: 0, type: "portraitPrimary" } })
await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 })
const js = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) fail(`The page threw: ${r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails)}\n${expression.slice(0, 160)}`)
  return r.result.value
}
const load = async () => {
  await call("Page.navigate", { url: "about:blank" })
  await sleep(200)
  await call("Page.navigate", { url: "file://" + file })
  await sleep(1200)
  if (!(await js(`!!document.querySelector("[data-mobile-bottom-sheet]")`))) fail("The sheet never mounted.")
}
const tap = async (x, y, after = 450) => {
  await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await sleep(40)
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  await sleep(after)
}
const centre = (sel) => js(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)] })()`)
const counts = async () => JSON.parse(await js(`JSON.stringify({ canvas: window.__probe.canvas.splice(0), sheet: window.__probe.sheet.splice(0) })`))

const r = {}
await load()
{
  const [x, y] = await centre("#row-1")
  await tap(x, y)
  r.plain = await counts()
}
{
  const [x, y] = await centre("#row-2")
  await js(`window.__probe.moveOnLift = true`)
  await tap(x, y)
  await js(`window.__probe.moveOnLift = false`)
  r.moved = { ...(await counts()), sheetTop: await js(`document.querySelector("[data-mobile-bottom-sheet]").getBoundingClientRect().top`), at: [x, y] }
}
/*
  WEBKIT'S ORDER. Chromium sends a tap's click to what the finger pressed,
  so above it cannot show the bug at all. Safari and the iOS app hit-test
  the click where the finger was, after it lifted. The same tap, with the
  click made the way WebKit makes it: a mouse press and release at the
  finger's point once the sheet has gone. First without a touch on the
  sheet before it, which reaches the canvas (so the measurement can see a
  click land there), then after one, which must not.
*/
await load()
{
  /* Hit-tested at the finger's point now, and sent there: what WebKit does. */
  const click = async (x, y) => {
    await js(`(() => {
      const el = document.elementFromPoint(${x}, ${y})
      for (const type of ["mousedown", "mouseup", "click"]) {
        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, clientX: ${x}, clientY: ${y}, view: window }))
      }
    })()`)
    await sleep(80)
  }
  /* At the peek, where there is no backdrop between the sheet and the canvas:
     with the sheet up, a stray click lands on the backdrop, which closes it. */
  const peek = async () => {
    await js(`window.__probe.setOpen(false)`)
    await sleep(500)
    return centre("#tab-Theme")
  }
  const [x, y] = await peek()
  await js(`(() => { const s = document.querySelector("[data-mobile-bottom-sheet]"); s.style.transition = "none"; s.style.transform = "translateY(2000px)" })()`)
  await click(x, y)
  r.webkitControl = await counts()
  await load()
  await peek()
  await js(`window.__probe.moveOnLift = true; window.__probe.eatNativeClick = true`)
  await call("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
  await sleep(40)
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  /* Chromium's own click for the tap is cancelled; WebKit's comes now, where the finger was. */
  await sleep(40)
  await counts()
  await click(x, y)
  r.webkit = await counts()
}

await load()
{
  const [x, y] = await centre("#tab-Pages")
  await tap(x, y, 60)
  r.tabTap = await counts()
  /* The sheet put down to its peek at once, and the very spot the tab was
     tapped again while the first tap's watch is still on: a new tap, and the
     canvas's, because the canvas is what is there now. */
  await js(`window.__probe.setOpen(false)`)
  await sleep(420)
  const over = await js(`(document.elementFromPoint(${x}, ${y}) || {}).id || ""`)
  await tap(x, y)
  r.sameSpot = { ...(await counts()), stillOver: over }
  /* And the canvas anywhere else, a moment later. */
  await tap(W / 2, 200)
  r.canvasAfter = await counts()
}
r.errors = JSON.parse(await js("JSON.stringify(window.__err)"))

await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()

console.log(`\nThe Sections sheet over a canvas that counts what reaches it, ${W}x${H}, touch\n`)
console.log(`  plain tap on a row          sheet ${JSON.stringify(r.plain.sheet)}, canvas ${JSON.stringify(r.plain.canvas)}`)
console.log(`  row, sheet moved on lift    sheet top ${Math.round(r.moved.sheetTop)} after (finger at ${r.moved.at}); sheet ${JSON.stringify(r.moved.sheet)}, canvas ${JSON.stringify(r.moved.canvas)}`)
console.log(`  WebKit's click, no touch    canvas ${JSON.stringify(r.webkitControl.canvas)}  (the measurement can see a click land)`)
console.log(`  WebKit's click after a tap  on the peeking sheet's tab, sheet moved on lift: canvas ${JSON.stringify(r.webkit.canvas)}`)
console.log(`  tab tap                     sheet ${JSON.stringify(r.tabTap.sheet)}, canvas ${JSON.stringify(r.tabTap.canvas)}`)
console.log(`  same spot, sheet put down   over #${r.sameSpot.stillOver} under 700ms later: canvas ${JSON.stringify(r.sameSpot.canvas)}`)
console.log(`  canvas elsewhere            canvas ${JSON.stringify(r.canvasAfter.canvas)}`)
if (r.errors.length) console.log(`  page errors: ${r.errors.join(" | ")}`)
console.log("")

let bad = 0
const expect = (ok, what) => { console.log(`${ok ? "  ok" : "FAIL"}  ${what}`); if (!ok) bad++ }
expect(r.plain.sheet.includes("click:row-1") && r.plain.canvas.length === 0, "a plain tap on a row clicks the row and nothing reaches the canvas")
expect(r.moved.sheetTop > H, "the page did move the sheet out from under the finger before the click")
expect(r.moved.canvas.length === 0, "and still nothing of that tap reached the canvas: no mousedown, no mouseup, no click")
expect(r.webkitControl.canvas.includes("click:canvas"), "a click made the way WebKit makes it, with no touch on the sheet before it, lands on the canvas: the measurement can see one")
expect(r.webkit.canvas.length === 0, "the same click after a tap that started on the sheet does not: the sheet's tap never reaches the canvas")
expect(r.tabTap.sheet.includes("click:tab-Pages") && r.tabTap.canvas.length === 0, "a tap on a tab clicks the tab and nothing reaches the canvas")
expect(r.sameSpot.stillOver === "canvas" && r.sameSpot.canvas.includes("click:canvas"), "a new tap on the canvas at the very spot a sheet tap just was, straight after, is the canvas's")
expect(r.canvasAfter.canvas.includes("click:canvas"), "and so is a tap on the canvas anywhere else")
expect(r.errors.length === 0, "no page errors")
console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("A tap that starts on the sheet ends on the sheet, and the canvas keeps its own taps.\n")
