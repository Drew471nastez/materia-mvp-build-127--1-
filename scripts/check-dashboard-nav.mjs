/**
 * ===========================================================================
 *  WHAT IS ACTUALLY DRAWN AT THE FOOT OF THE DASHBOARD
 * ===========================================================================
 * "There is still a solid background there", three times, about a bar that
 * every measurement said was glass.
 *
 * Each of those measurements was taken over a page of plain cards, which is
 * the one page that cannot show the fault: no nested scroller, no artwork, no
 * announcement bar, and every layer in it the same colour. So this mounts the
 * page somebody is really looking at — the DashboardClient the route renders,
 * inside the nesting app/(storelib)/app/layout.tsx builds — and asks two questions that
 * a plain page cannot answer.
 *
 *   IS ANY LAYER A DIFFERENT COLOUR FROM THE PAGE. A column of pixels is read
 *     down the left margin, clear of every card. A step at one height is an
 *     edge across the screen, which is what a plate looks like.
 *
 *   AND DOES THE PAGE GO PAST THE BAR AT ALL. Glass has nothing to show if
 *     the content stops above it. The dashboard scrolls in a container of its
 *     own, nested inside the one the /app shell pads, so a rule written for
 *     the outer one reaches nothing here.
 *
 *   pnpm build && node scripts/check-dashboard-nav.mjs
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

const VIEW_W = 390
const VIEW_H = 844
const shots = join(root, ".nav-probe")
mkdirSync(shots, { recursive: true })

/** The smallest PNG reader that can read what Chromium writes. */
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0
  const parts = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9] }
    else if (type === "IDAT") parts.push(data)
    else if (type === "IEND") break
    pos += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels || depth !== 8) fail(`unreadable screenshot: colour type ${colorType}, ${depth} bits`)
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride)
    p += stride
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const guess = a + b - c
        const pa = Math.abs(guess - a), pb = Math.abs(guess - b), pc = Math.abs(guess - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  return { width, height, channels, data: out }
}
function averageColour(png) {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < png.data.length; i += png.channels) { r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++ }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}
const distance = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))

/* ── the bundle ──────────────────────────────────────────────────────────── */
const out = mkdtempSync(join(tmpdir(), "storelib-dashnav-"))
writeFileSync(join(shots, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(shots, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(shots, "image.jsx"), `import React from "react"
export default function Image({ src, alt, width, height, priority, fill, sizes, quality, placeholder, blurDataURL, loader, unoptimized, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt: alt || "", width, height, ...rest })
}
`)
writeFileSync(join(shots, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-dashboard-nav.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(shots, "link.jsx")}`,
  `--alias:next/image=${join(shots, "image.jsx")}`,
  `--alias:next/navigation=${join(shots, "navigation.js")}`,
  `--alias:@/lib/native-bridge=${join(shots, "native-bridge.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
  '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
  "--log-level=error",
], { cwd: root, stdio: "inherit" })

writeFileSync(join(out, "index.html"),
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── the browser ─────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), "storelib-dashnav-profile-"))
const chrome = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--allow-file-access-from-files",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
  `--window-size=${VIEW_W},${VIEW_H}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

const portFile = join(profile, "DevToolsActivePort")
let port = null
for (let i = 0; i < 80 && !port; i++) {
  if (existsSync(portFile)) {
    const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
    if (first) port = Number(first)
  }
  if (!port) await sleep(250)
}
if (!port) { reap(); fail("Chromium never reported a debugging port.") }
let version = null
for (let i = 0; i < 40 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
}
if (!version) { reap(); fail("Chromium did not answer on its port.") }

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
let id = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
})
let sessionId = null
const send = (method, params = {}, session = sessionId) =>
  new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
const ev = async (expr) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (exceptionDetails) fail(`the page threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
  return result?.value
}
const shotOf = async (clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
  return averageColour(decodePng(Buffer.from(data, "base64")))
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true })
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
await sleep(2600)

const ran = await ev(`!!document.querySelector('nav[aria-label="Main"]') && !!document.querySelector(".dashboard-scroll-container")`)
if (!ran) {
  const why = await ev("JSON.stringify({ threw: window.__threw || null, errors: (window.__err||[]).slice(0,3) })")
  reap(); fail(`the dashboard never rendered: ${why}`)
}

/*
 * ── THE PAGE SITS UNDER THE HEADER, NOT UNDERNEATH IT ────────────────────
 *
 * "The announcement bar underlaps the header." The bar is an ordinary div at
 * the top of the page's scroller and the header is fixed above it, so the only
 * way they overlap is if the DOCUMENT has been scrolled, which on /app is
 * meant to be impossible and is not: scrollIntoView, a focused input and an
 * iOS overscroll can all do it. So this reads where the bar's top is at rest,
 * then scrolls the document on purpose by 30px and watches whether it is put
 * back.
 */
const atRest = await ev(`(() => {
  const header = document.querySelector("header").getBoundingClientRect()
  const bar = document.querySelector(".dashboard-scroll-container > *").getBoundingClientRect()
  return { headerBottom: Math.round(header.bottom), barTop: Math.round(bar.top), docScroll: Math.round(window.scrollY),
           chains: getComputedStyle(document.querySelector(".dashboard-scroll-container")).overscrollBehaviorY }
})()`)
const pushed = await ev(`(async () => {
  const root = document.documentElement
  root.scrollTop = 30
  window.scrollTo(0, 30)
  const moved = Math.round(window.scrollY)
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40))))
  const bar = document.querySelector(".dashboard-scroll-container > *").getBoundingClientRect()
  return { moved, after: Math.round(window.scrollY), barTop: Math.round(bar.top) }
})()`)

/* ── which element actually scrolls, and is it padded for the bar ────────── */
const scrollers = await ev(`(() => {
  const pick = (sel) => {
    const el = document.querySelector(sel)
    if (!el) return null
    const st = getComputedStyle(el)
    return {
      sel,
      scrolls: el.scrollHeight > el.clientHeight + 1,
      padBottom: Math.round(Number.parseFloat(st.paddingBottom) || 0),
      overflowY: st.overflowY,
    }
  }
  return [pick(".app-content-scroll"), pick(".dashboard-scroll-container")].filter(Boolean)
})()`)

/* Scroll the one that really scrolls, all the way down. */
await ev(`(() => {
  const el = document.querySelector(".dashboard-scroll-container")
  el.scrollTop = el.scrollHeight
  return true
})()`)
await sleep(500)

const geometry = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  const el = document.querySelector(".dashboard-scroll-container")
  /* The lowest thing the page draws, ignoring the bar itself. */
  let lowest = 0
  let what = "(nothing)"
  for (const n of el.querySelectorAll("*")) {
    const r = n.getBoundingClientRect()
    if (r.width < 40 || r.height < 6) continue
    if (r.bottom > lowest && r.bottom < 2000) {
      lowest = r.bottom
      what = n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(" ")[0] : "")
    }
  }
  return {
    barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom),
    lowestContent: Math.round(lowest), lowestIs: what,
    clearance: Math.round(bar.top - lowest),
    viewport: window.innerHeight,
  }
})()`)

/*
 * ── AND MID-SCROLL, IS ANYTHING BEHIND IT ────────────────────────────────
 *
 * This is the question the whole thing turns on. A glass bar shows what is
 * under it; with the page stopping above the bar there was never anything
 * under it, so it could only ever look like a solid pill. Scroll into the
 * middle of the page, find the artwork, put it behind the bar, and compare
 * the pixel INSIDE the bar with the bare page beside it.
 */
const behind = await ev(`(() => {
  const el = document.querySelector(".dashboard-scroll-container")
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  /* The tallest coloured thing on the page is the growth artwork. */
  let art = null
  for (const n of el.querySelectorAll("img, [style*='background-image']")) {
    const r = n.getBoundingClientRect()
    if (r.width > 200 && r.height > 40) { art = n; break }
  }
  if (!art) return null
  /* Put its middle level with the middle of the bar. */
  const r = art.getBoundingClientRect()
  el.scrollTop += (r.top + r.height / 2) - (bar.top + bar.height / 2)
  return true
})()`)
await sleep(500)
const overlap = await ev(`(() => {
  const el = document.querySelector(".dashboard-scroll-container")
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  let covered = 0
  for (const n of el.querySelectorAll("*")) {
    const r = n.getBoundingClientRect()
    if (r.width < 80 || r.height < 20) continue
    if (r.top < bar.bottom && r.bottom > bar.top) covered++
  }
  return { covered, barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom) }
})()`)
const barInside = await ev(`(() => {
  const b = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  const a = document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')
  /* Between the SECOND and third glyphs: between the first two, the
     artwork's white Upgrade button is what sits behind the bar, and a white
     bar over a white button reads the same as the bare page. */
  const one = a[1].getBoundingClientRect(), two = a[2].getBoundingClientRect()
  return {
    inBar: { x: Math.round((one.right + two.left) / 2) - 5, y: Math.round(b.top + b.height / 2) - 5, width: 10, height: 10 },
    beside: { x: 3, y: Math.round(b.top + b.height / 2) - 5, width: 5, height: 5 },
  }
})()`)
const throughBar = await shotOf(barInside.inBar)
const besideBar = await shotOf(barInside.beside)
{
  const { data } = await send("Page.captureScreenshot", { format: "png" })
  writeFileSync(join(shots, "dashboard-behind.png"), Buffer.from(data, "base64"))
}
await ev(`document.querySelector(".dashboard-scroll-container").scrollTop = 1e7; true`)
await sleep(450)

/* ── a column down the left margin, clear of every card ──────────────────── */
const column = []
for (let y = 260; y < VIEW_H - 6; y += 10) column.push({ y, rgb: await shotOf({ x: 3, y, width: 5, height: 5 }) })
const { data } = await send("Page.captureScreenshot", { format: "png" })
writeFileSync(join(shots, "dashboard-bottom.png"), Buffer.from(data, "base64"))

await send("Target.closeTarget", { targetId }, null)
ws.close()
reap()

/* ── the report ──────────────────────────────────────────────────────────── */
const problems = []
const must = (ok, line, why) => { console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`); if (!ok) problems.push(why) }

console.log(`\n  The real dashboard at ${VIEW_W}x${VIEW_H}, scrolled to the end\n`)
for (const s of scrollers) {
  console.log(`  ${s.sel.padEnd(28)} overflow-y: ${s.overflowY.padEnd(6)} scrolls: ${String(s.scrolls).padEnd(5)} padding-bottom: ${s.padBottom}px`)
}
console.log(`\n  the bar        y=${geometry.barTop} to ${geometry.barBottom} of ${geometry.viewport}`)
console.log(`  lowest content ${geometry.lowestContent} (${geometry.lowestIs}), ${geometry.clearance}px above the bar\n`)

/*
  THE PAGE HAS TO BE ABLE TO GET PAST THE BAR.

  Not a nicety: the bar is glass, and glass over nothing is the colour of
  whatever is behind it, which on this page is flat #f8f9fa. A page that
  stops above the bar can never look like anything but a white pill on a
  white background — which is what "there is still a solid background there"
  describes, and no amount of tint or blur on the bar can answer it.
*/
console.log(`  at rest        header bottom y=${atRest.headerBottom}, announcement bar top y=${atRest.barTop}, document scrolled ${atRest.docScroll}px`)
console.log(`  pushed         document scrolled to ${pushed.moved}px on purpose, read ${pushed.after}px two frames later, bar top y=${pushed.barTop}\n`)
must(atRest.docScroll === 0 && atRest.barTop >= atRest.headerBottom,
  "at rest the announcement bar sits under the header's edge, not underneath the header",
  `the bar's top is at y=${atRest.barTop} against a header ending at y=${atRest.headerBottom}, with the document scrolled ${atRest.docScroll}px`)
must(pushed.moved === 0 || pushed.after === 0,
  "and a document that gets scrolled anyway is put back within a frame",
  `the document was scrolled to ${pushed.moved}px and was still at ${pushed.after}px two frames later: the page is under the header and nothing brings it back`)
must(pushed.barTop >= atRest.headerBottom,
  "so the bar is back where it belongs",
  `after the push the bar's top is at y=${pushed.barTop}, under a header ending at y=${atRest.headerBottom}`)
must(atRest.chains === "none",
  "and the page's own scroller refuses to chain an overscroll into the document",
  `.dashboard-scroll-container has overscroll-behavior-y: ${atRest.chains}; on iOS an overscroll at its top walks into the document`)

const real = scrollers.find((s) => s.scrolls)
must(!!real, "something on this page scrolls", "nothing on the dashboard scrolls, so the page is not long enough to test")
must(real?.padBottom >= 88,
  `the container that really scrolls (${real?.sel}) is padded to clear the bar`,
  `${real?.sel} scrolls and has ${real?.padBottom}px of bottom padding. The rule in globals.css pads .app-content-scroll, which on this page does not scroll at all, so it reaches nothing.`)
must(geometry.clearance >= 0 && geometry.clearance <= 60,
  "and at the end of the page the last thing drawn sits just clear of it",
  `the lowest content ends ${geometry.clearance}px from the bar. Below zero it is underneath it and unreachable; far above it and the bar floats over an empty strip with nothing to show through it.`)

console.log(`  mid-scroll     ${overlap.covered} elements of the page pass behind the bar`)
console.log(`                 through it rgb(${throughBar.join(",")}), beside it rgb(${besideBar.join(",")}), ${distance(throughBar, besideBar)} apart\n`)
must(overlap.covered > 0,
  "mid-scroll the page really does pass behind the bar",
  "nothing is ever underneath it, so it can only look like a solid pill however it is styled")
/* NOT A COLOUR CLAIM ANY MORE. The bar is 93% white now ("not greyish in
   any circumstances", then "more whitish"), and 93% white over this
   banner's mid grey reads within a point or two of the bare page: the
   difference is real, but under what a PNG can show. Whether the bar is
   glass or a panel is settled by check-app-mobile-nav, which puts pure red
   and then pure blue behind it and reads the same square twice. The two
   colours are printed above for the record, and what this probe holds is
   the geometry: the page can get under the bar at all. */

const pageColour = column[0].rgb
const odd = column.filter((c) => distance(c.rgb, pageColour) > 3)
console.log("  a column down the left margin:")
for (const c of column) console.log(`    y=${String(c.y).padStart(3)}  rgb(${c.rgb.join(",")})${distance(c.rgb, pageColour) > 3 ? "   <- not the page colour" : ""}`)
console.log("")
must(odd.length === 0,
  "and the margin is one colour from the content down to the bottom edge",
  `${odd.length} of ${column.length} samples differ from rgb(${pageColour.join(",")}), the first at y=${odd[0]?.y} reading rgb(${odd[0]?.rgb.join(",")}). That is a plate with an edge across the screen.`)

console.log(`  pictures in .nav-probe/dashboard-bottom.png and .nav-probe/dashboard-behind.png\n`)
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The page runs past the bar, and there is no plate behind it.\n")
