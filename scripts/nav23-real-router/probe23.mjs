/*
 * ===========================================================================
 *  ROUND 23: CLOSES, RELOADS AND LANDINGS, COUNTED UNDER THE REAL ROUTER
 * ===========================================================================
 * Against this harness (build.sh, serve.sh): the real /app shell, the real
 * settings sheet over a page (app/(storelib)/app/@sheet), the real website builder
 * editor page, the real product layer.
 *
 *   node probe23.mjs <port> <outdir> flow=<name> [w=1440|390] [cpu=4] [n=3] [film=1]
 *
 * Every flow reports, per run:
 *   closes    times the sheet went from covering the page to not covering it
 *   shows     times it went from not covering to covering (1 = one open)
 *   loads     whole document loads during the flow (0 = no reload)
 *   history   history.length before and after, and where the address ended
 *   mounts    mounts of the page under the sheet during the flow (0 = it stayed)
 *   frames    compositor frames filmed, and the per frame record of the sheet's top
 */
import puppeteer from "puppeteer-core"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [port, out, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const W = Number(opt.w || 1440)
const PHONE = W < 768
const CPU = Number(opt.cpu || 4)
const N = Number(opt.n || 3)
const FLOW = opt.flow || "x"
const base = `http://localhost:${port}`
mkdirSync(out, { recursive: true })

const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=1"], timeout: 180000, protocolTimeout: 900000 })
const p = await b.newPage()
if (PHONE) {
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Version/18.0 Safari/604.1")
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
} else {
  await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
}
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 200)))
p.on("console", (m) => { const t = m.text(); if (/app-stage|app-navigation|settings|reload|document/i.test(t)) errors.push("console: " + t.slice(0, 200)) })
const delays = { shell: 150, home: 200, website: Number(opt.website || 400), products: 300, product: 300, settings: Number(opt.settings || 400) }
await p.setCookie(...Object.entries(delays).map(([k, v]) => ({ name: `d_${k}`, value: String(v), url: base })))

await p.evaluateOnNewDocument(() => {
  window.__rec = []
  const t = () => Math.round(performance.now())
  const sheetState = () => {
    const root = document.querySelector("[data-settings-sheet-root]")
    const panel = document.querySelector("[data-settings-sheet]")
    if (!root || !panel) return "none"
    const cs = getComputedStyle(root)
    if (cs.visibility === "hidden" || cs.display === "none") return "hidden"
    const r = panel.getBoundingClientRect()
    if (Number(getComputedStyle(panel).opacity) < 0.05) return "clear"
    return Math.round(r.top)
  }
  const sample = () => {
    const s = sheetState()
    const last = window.__rec[window.__rec.length - 1]
    const path = location.pathname + location.search
    if (!last || last[1] !== s || last[2] !== path) window.__rec.push([t(), s, path])
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
  window.__pops = 0
  addEventListener("click", (e) => { if (e.target?.closest?.("[data-settings-sheet-close]")) window.__rec.push([t(), "x-click", location.pathname]) }, true)
  addEventListener("keydown", (e) => { if (e.key === "Escape") window.__rec.push([t(), "esc" + (e.defaultPrevented ? "-prevented" : ""), location.pathname]) }, true)
  new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.querySelector?.("[data-settings-sheet]") && n.parentNode === document.body) window.__rec.push([t(), "ghost+", location.pathname]) }).observe(document, { childList: true, subtree: true })
  addEventListener("popstate", () => { window.__pops++; window.__rec.push([t(), "popstate", location.pathname + location.search]) }, true)
  for (const k of ["back", "go", "pushState", "replaceState"]) {
    const orig = History.prototype[k]
    History.prototype[k] = function (...a) { window.__rec.push([t(), "h." + k + (k.endsWith("State") ? ":" + (a[0] && a[0].__NA ? "NA" : JSON.stringify(a[0])?.slice(0, 40)) : ""), location.pathname + location.search]); return orig.apply(this, a) }
  }
})
await p.setRequestInterception(true)
p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
const frames = []
cdp.on("Page.screencastFrame", async (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function filmStart() {
  frames.length = 0
  if (opt.film === "1") await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 })
}
async function filmStop(label) {
  if (opt.film !== "1") return 0
  await cdp.send("Page.stopScreencast")
  const dir = join(out, label); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  const f0 = frames[0]?.metadata.timestamp ?? 0
  frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}-${Math.round((f.metadata.timestamp - f0) * 1000)}.jpg`), Buffer.from(f.data, "base64")))
  return frames.length
}

async function press(sel) {
  const r = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  if (PHONE) await p.touchscreen.tap(r.x, r.y)
  else await p.mouse.click(r.x, r.y)
}
const docLoads = () => p.evaluate(() => Number(sessionStorage.getItem("docLoads") || 0)).catch(() => -1)
const state = () => p.evaluate(() => ({ path: location.pathname + location.search, len: history.length, mounts: { ...(window.__mounts || {}) }, pops: window.__pops, rec: window.__rec.slice() }))
async function waitFor(fn, ms = 15000, ...args) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    try { if (await p.evaluate(fn, ...args)) return Date.now() - t0 } catch {}
    await sleep(50)
  }
  return -1
}
const sheetUp = () => { const el = document.querySelector("[data-settings-sheet]"); const root = document.querySelector("[data-settings-sheet-root]"); return !!el && !!root && getComputedStyle(root).visibility !== "hidden" && el.getAnimations().every((a) => a.playState !== "running") && !!document.querySelector("[data-settings-sheet] h1, [data-settings-sheet] [role=tab], [data-settings-sheet] nav") }

/* Covering = the panel drawn within the screen. Closes are covering -> not; shows are not -> covering. */
function count(rec, fromT) {
  const H = PHONE ? 844 : 900
  let closes = 0, shows = 0, prev = null
  const timeline = []
  for (const [t, s, path] of rec) {
    if (typeof s === "string" && (s.startsWith("h.") || /^(popstate|x-click|esc|ghost)/.test(s))) { if (t >= fromT) timeline.push(`${t - fromT}:${s}@${path.replace("/app", "")}`); continue }
    if (t < fromT) { prev = typeof s === "number" && s < H - 40; continue }
    const cover = typeof s === "number" && s < H - 40
    if (prev !== null && cover !== prev) { if (cover) shows++; else closes++ }
    prev = cover
    timeline.push(`${t - fromT}:${s}@${path.replace("/app", "")}`)
  }
  return { closes, shows, timeline: timeline.slice(0, 60).join(" ") }
}

async function openSheetFrom(page, how) {
  if (how === "direct") {
    await p.goto(base + "/app/settings", { waitUntil: "load" })
  } else {
    await p.goto(base + page, { waitUntil: "load" })
    await waitFor(() => !!document.querySelector("[data-harness-page]"))
    await sleep(1200)
    await press(`[data-harness-page] [data-go="${how === "tab" ? "settings-checkout" : "settings"}"]`)
  }
  if (opt.early) { await sleep(Number(opt.early)); return -1 }
  const ms = await waitFor(sheetUp)
  await sleep(500)
  return ms
}

async function closeBy(kind) {
  if (kind === "x") await press("[data-settings-sheet-close]")
  else if (kind === "xback") { await press("[data-settings-sheet-close]"); await sleep(60); await p.evaluate(() => history.back()) }
  else if (kind === "xx") { await press("[data-settings-sheet-close]"); await sleep(40); await p.keyboard.press("Escape"); await sleep(40); await p.mouse.click(700, 40).catch(() => {}) }
  else if (kind === "escape") await p.keyboard.press("Escape")
  else if (kind === "backdrop") await p.mouse.click(700, 40)
  else if (kind === "back") await p.evaluate(() => history.back())
  else if (kind === "drag") {
    const r = await p.$eval("[data-settings-sheet-handle]", (el) => { const r = el.getBoundingClientRect(); return { x: r.x + 100, y: r.y + r.height / 2 } })
    await p.mouse.move(r.x, r.y); await p.mouse.down()
    for (let i = 1; i <= 12; i++) { await p.mouse.move(r.x, r.y + i * 40); await sleep(16) }
    await p.mouse.up()
  } else if (kind === "pagebar") {
    /* Below 1024px Settings is a page: its way out is the app's own Back (the header) or the browser's. */
    await p.evaluate(() => history.back())
  } else if (kind === "discard" || kind === "keep") {
    /* Something typed and not saved: the close asks, then Discard (or Keep editing, then Discard on a second X). */
    await p.$eval("[data-settings-sheet] input[type=text], [data-settings-sheet] input:not([type])", (el) => el.focus())
    await p.keyboard.type(" x", { delay: 30 })
    await sleep(900)
    dirtyLen = await p.evaluate(() => history.length)
    await press("[data-settings-sheet-close]")
    await waitFor(() => !!document.querySelector("[data-leave-save]"), 5000)
    await sleep(300)
    await p.evaluate((k) => { const b = [...document.querySelectorAll("[data-settings-leave-guard] button")].find((b) => /discard|leave without/i.test(b.textContent || "")) ; b?.click() }, kind)
  }
}

let dirtyLen = 0
const results = []
for (let run = 0; run < N; run++) {
  const [open, close] = FLOW.split("-")
  const from = opt.from || "/app/website-builder"
  await p.goto(base + "/app", { waitUntil: "load" })
  await p.evaluate(() => sessionStorage.setItem("docLoads", "0"))
  const openMs = await openSheetFrom(from, open)
  if (opt.tabswitch === "1") {
    const rows = await p.$$("[data-settings-sheet] nav button, [data-settings-sheet] [role=tab]")
    if (rows[3]) { await rows[3].click(); await sleep(600) }
  }
  if (opt.idle) await sleep(Number(opt.idle))
  if (opt.hide === "1") {
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true }); document.dispatchEvent(new Event("visibilitychange")) })
    await sleep(500)
    await p.evaluate(() => { Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true }); document.dispatchEvent(new Event("visibilitychange")); window.dispatchEvent(new Event("focus")) })
  }
  const before = await state()
  const loads0 = await docLoads()
  const t0 = await p.evaluate(() => Math.round(performance.now()))
  await filmStart()
  await closeBy(close)
  await sleep(Number(opt.after || 3500))
  const nFrames = await filmStop(`${FLOW}-${W}-run${run}`)
  const after = await state()
  const loads1 = await docLoads()
  const c = count(after.rec, t0)
  const mountsUnder = Object.entries(after.mounts).filter(([k]) => k.startsWith("page:")).map(([k, v]) => `${k.slice(5)}+${v - (before.mounts[k] || 0)}`).join(",")
  results.push({ run, openMs, closes: c.closes, shows: c.shows, reloads: loads1 - loads0, hist: `${before.len}->${dirtyLen ? dirtyLen + "->" : ""}${after.len}`, pops: after.pops - before.pops, end: after.path, mounts: mountsUnder, frames: nFrames, timeline: c.timeline })
}
console.log(JSON.stringify({ flow: FLOW, w: W, cpu: CPU, opts: opt, results, errors: errors.slice(0, 12) }, null, 1))
await b.close()
