/**
 * ===========================================================================
 *  WHERE THE DASHBOARD'S SCROLL GOES SLOW
 * ===========================================================================
 * Reported as: on a phone, scrolling the dashboard is fine and then at some
 * point it lags. "At some point" is the useful part of that — a page that is
 * slow everywhere is a heavy page, a page that is slow at ONE place has
 * something at that place.
 *
 * So this scrolls the real dashboard at phone size in small steps and, for
 * every step, records the longest frame the page ran while it was there. The
 * output is a profile down the page rather than one number, and the offset
 * of the worst one is the answer to where.
 *
 * WHAT A NUMBER HERE IS AND IS NOT. Headless Chromium with no GPU is not a
 * phone, so the milliseconds are not the ones a phone would see. What
 * carries across is the SHAPE: a spike at one offset against a flat profile
 * either side of it is the same spike on the device, and a flat profile here
 * means whatever the phone is hitting is not in the page's own layout or
 * script.
 *
 *   pnpm build && node scripts/check-dashboard-scroll.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-dash-"))
const stubs = join(root, ".dash-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
/* next/image needs a loader and a real server; a plain img is the same box. */
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest })
}
`)

const VIEW_W = 390
const VIEW_H = 844
/* How far each step moves. Small enough to localise a spike to a screenful. */
const STEP = 200

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-dashboard-scroll.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/image=${join(stubs, "image.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"',
  /* The browser client reads these at module load and throws without them.
     They address nothing: the probe answers no requests and the page under
     test makes none. */
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
  "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `(function(){var ce=console.error;console.error=function(){window.__err.push(Array.prototype.map.call(arguments,String).join(" ").slice(0,300));ce.apply(console,arguments)}})();` +
  `window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="probe.js"></script></body></html>`)

/*
  ARM: start recording every frame, and with each one note where the page is.
  A gesture is then run from node, so what is measured is a scroll the
  browser is really performing — rasterising new content as it goes — rather
  than a jump to an offset followed by a pause, which is exactly the moment
  jank has already finished.
*/
const ARM = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  await wait(900)
  if (!window.__ran || window.__threw) {
    return JSON.stringify({ ran: false, threw: window.__threw || null, errors: (window.__err || []).slice(0, 3) })
  }
  /*
    WHICHEVER ELEMENT ACTUALLY MOVES.

    This read \`document.scrollingElement\` and worked, until the dashboard's
    own \`h-full overflow-y-auto\` container started overflowing in this
    harness too. The document then stopped scrolling, the probe measured
    zero, and it reported the page as unscrollable while the page scrolled
    perfectly well in front of it.

    A probe that names its subject by assumption fails the moment the page is
    laid out differently, so this asks the page: the element that has
    somewhere to scroll is the one to watch, and the document is the
    fallback.
  */
  const scrollerOf = () => {
    const inner = document.querySelector(".dashboard-scroll-container")
    if (inner && inner.scrollHeight > inner.clientHeight + 1) return inner
    return document.scrollingElement || document.documentElement
  }
  const doc = scrollerOf()
  window.__samples = []
  window.__watch = true
  let last = performance.now()
  const tick = (t) => {
    if (!window.__watch) return
    window.__samples.push({ gap: Math.round((t - last) * 10) / 10, y: Math.round(doc.scrollTop) })
    last = t
    requestAnimationFrame(tick)
  }
  requestAnimationFrame((t) => { last = t; tick(t) })
  /*
    A COUNT OF THE MOVES THAT ARRIVED, which is what said the last gesture
    driver was delivering nothing at all rather than the page refusing to
    scroll. Cheap, and it is the first thing worth knowing when a scroll
    probe reports zero.
  */
  window.__cancelled = 0
  window.__moves = 0
  document.addEventListener("touchmove", (e) => { window.__moves++; if (e.defaultPrevented) window.__cancelled++ }, { passive: true })
  return JSON.stringify({ ran: true, height: doc.scrollHeight })
})()`

const READ = `(async () => {
  await new Promise((r) => setTimeout(r, 200))
  window.__watch = false
  const doc = (() => {
    const inner = document.querySelector(".dashboard-scroll-container")
    if (inner && inner.scrollHeight > inner.clientHeight + 1) return inner
    return document.scrollingElement || document.documentElement
  })()
  /* The first frame's gap is the time since arming, not a scroll. */
  const s = window.__samples.slice(1)
  /* Charged to the screenful it happened in, so the answer is a place. */
  const buckets = new Map()
  for (const f of s) {
    const bucket = Math.floor(f.y / ${STEP}) * ${STEP}
    const held = buckets.get(bucket)
    if (!held || f.gap > held.worst) buckets.set(bucket, { worst: f.gap, frames: (held?.frames ?? 0) + 1 })
    else held.frames++
  }
  return JSON.stringify({
    reached: Math.round(doc.scrollTop),
    height: doc.scrollHeight,
    frames: s.length,
    steps: [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ y, worst: v.worst, frames: v.frames })),
    errors: (window.__err || []).slice(0, 3),
    moves: window.__moves, cancelled: window.__cancelled,
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
/* A phone's processor, not a server's: a spike that only shows under load is
   still a spike a phone would show. */
await call("Emulation.setCPUThrottlingRate", { rate: 4 })
await call("Page.navigate", { url: "file://" + file })
await sleep(2500)

const armed = await call("Runtime.evaluate", { expression: ARM, awaitPromise: true, returnByValue: true, timeout: 60000 })
if (armed.exceptionDetails) fail(`Arming threw: ${JSON.stringify(armed.exceptionDetails.text || armed.exceptionDetails)}`)
const a = JSON.parse(armed.result.value)
if (!a.ran) {
  console.log(JSON.stringify({ threw: a.threw, errors: a.errors }, null, 2))
  fail("The dashboard never mounted, so there was nothing to scroll.")
}

/*
  A REAL SCROLL, not an assignment: the touches are dispatched one at a time
  so the compositor rasterises as it goes, which is the moment being
  complained about. Setting scrollTop and waiting measures a page that has
  already settled.

  THIS USED TO BE `Input.synthesizeScrollGesture`, ONE CALL. It reported
  success and delivered nothing — zero touchmove events reached the document
  and the page did not move a pixel — so the probe failed the page for being
  unscrollable while the page scrolled perfectly well in front of it. Whatever
  that command needs in order to work here, it does not have it; every other
  probe in this directory drives touches directly, and those all work.
*/
const STEPS = 60
const startY = VIEW_H - 120
const reach = Math.min(a.height - VIEW_H, VIEW_H - 200)
await call("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: [{ x: Math.round(VIEW_W / 2), y: startY, radiusX: 12, radiusY: 12, force: 1 }],
})
/*
  MANY SHORT GESTURES, NOT ONE LONG ONE. A finger can only travel the height
  of the screen before it has to be lifted, so a page three screens tall is
  three flicks — and each one is a fresh chance for a frame to go long, which
  is what this is looking for.
*/
let travelled = 0
while (travelled < a.height - VIEW_H) {
  for (let i = 1; i <= STEPS; i++) {
    await call("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: Math.round(VIEW_W / 2), y: Math.round(startY - (reach * i) / STEPS), radiusX: 12, radiusY: 12, force: 1 }],
    })
  }
  await call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
  travelled += reach
  if (travelled >= a.height - VIEW_H) break
  await sleep(60)
  await call("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: Math.round(VIEW_W / 2), y: startY, radiusX: 12, radiusY: 12, force: 1 }],
  })
}
await sleep(300)

const read = await call("Runtime.evaluate", { expression: READ, awaitPromise: true, returnByValue: true, timeout: 60000 })
if (read.exceptionDetails) fail(`Reading threw: ${JSON.stringify(read.exceptionDetails.text || read.exceptionDetails)}`)
await send("Target.closeTarget", { targetId }, null)
ws.close()
proc.kill()
const r = JSON.parse(read.result.value)

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

console.log(`\nScrolling the dashboard at ${VIEW_W}x${VIEW_H}, CPU throttled 4x, ${r.height}px of page`)
console.log(`  a real touch gesture, ${r.frames} frames, ${r.moves} moves delivered, reached ${r.reached}px\n`)
const worstStep = r.steps.reduce((a, s) => (s.worst > a.worst ? s : a), r.steps[0])
const median = [...r.steps].sort((a, b) => a.worst - b.worst)[Math.floor(r.steps.length / 2)].worst
for (const s of r.steps) {
  const bar = "█".repeat(Math.min(40, Math.round(s.worst / 4)))
  console.log(`  ${String(s.y).padStart(5)}px  ${String(s.worst).padStart(6)}ms  ${bar}`)
}
console.log("")

if (r.errors?.length) console.log(`  note  the page reported: ${JSON.stringify(r.errors)}\n`)

expect(r.steps.length >= 4, "the scroll covered the page", `${r.steps.length} screenfuls`)
expect(r.frames > 20, "and the page ran frames while it happened", `${r.frames} frames`)
expect(r.reached > r.height - VIEW_H - 200, "it got to the bottom", `${r.reached} of ${r.height - VIEW_H}`)
/*
  THE SHAPE, WHICH IS THE CLAIM. A spike is a step far worse than the rest of
  the page; the absolute number here belongs to a throttled headless browser
  and not to a phone.
*/
expect(worstStep.worst <= median * 3 + 16,
  "no screenful costs far more than the rest of the page",
  `worst ${worstStep.worst}ms at ${worstStep.y}px, median ${median}ms`)

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("The page scrolls evenly from top to bottom.\n")
