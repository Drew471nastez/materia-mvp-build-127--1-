/*
 * ===========================================================================
 *  ROUND 23: LEAVING THE WEBSITE BUILDER EDITOR, COUNTED
 * ===========================================================================
 * The real editor page (app/website-builder/editor/[installId]) in this
 * harness, opened from the Website page by its link, then left:
 *
 *   node probe-editor.mjs <port> <outdir> how=bar|back|link [website=<server ms>] [w=1440|390] [cpu=4] [n=3] [film=1]
 *
 *   bar    the editor's own Back in its top bar (requestExit)
 *   back   the browser's Back (history.back)
 *   link   the bar's Back, then on to Products by a link and the browser's Back to Website: no load anywhere on the way
 *
 * Per run: whole document loads during the leave (a reload is 1), ms from the
 * press to the Website page on screen, ms the "Going back" glass was up, and
 * the addresses the history went through.
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
const HOW = opt.how || "bar"
const base = `http://localhost:${port}`
mkdirSync(out, { recursive: true })
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=1"], timeout: 180000, protocolTimeout: 900000 })
const p = await b.newPage()
if (PHONE) {
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Version/18.0 Safari/604.1")
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
} else await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)))
p.on("console", (m) => { const t = m.text(); if (/document|reload|stalled|has not arrived/i.test(t)) errors.push("console: " + t.slice(0, 200)) })
await p.setCookie(...Object.entries({ shell: 150, home: 200, website: Number(opt.website || 400), products: 300 }).map(([k, v]) => ({ name: `d_${k}`, value: String(v), url: base })))
await p.evaluateOnNewDocument(() => {
  window.__rec = []
  const t = () => Math.round(performance.now())
  let glass = false, page = null
  const sample = () => {
    const g = !!document.querySelector(".wb-leaving") && Number(getComputedStyle(document.querySelector(".wb-leaving")).opacity) > 0.05
    const pg = document.querySelector("[data-harness-page]")?.getAttribute("data-harness-page") || (document.querySelector(".wb-editor-topbar") ? "Editor" : null)
    if (g !== glass) { glass = g; window.__rec.push([t(), g ? "glass+" : "glass-"]) }
    if (pg !== page) { page = pg; window.__rec.push([t(), "page:" + pg]) }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
  addEventListener("popstate", () => window.__rec.push([t(), "popstate " + location.pathname]), true)
  addEventListener("pagehide", () => { try { sessionStorage.setItem("lastHide", String(Date.now())) } catch {} })
  for (const k of ["pushState", "replaceState", "back", "go"]) {
    const orig = History.prototype[k]
    History.prototype[k] = function (...a) { window.__rec.push([t(), "h." + k + (k.endsWith("State") ? (a[0] && a[0].__NA ? ":NA " : ":" + JSON.stringify(a[0])?.slice(0, 30) + " ") + String(a[2] ?? "").replace(location.origin, "").slice(0, 50) : "")]); return orig.apply(this, a) }
  }
  for (const k of ["assign", "replace", "reload"]) {
    try { const orig = Location.prototype[k]; Location.prototype[k] = function (...a) { try { sessionStorage.setItem("hardNav", k + " " + String(a[0] ?? "") + " @" + t()) } catch {} return orig.apply(this, a) } } catch {}
  }
})
await p.setRequestInterception(true)
p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
const frames = []
cdp.on("Page.screencastFrame", async (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* An evaluate across a whole page load (the thing being looked for) is asked again on the new page. */
async function ev(fn, ...args) {
  for (let i = 0; i < 40; i++) {
    try { return await p.evaluate(fn, ...args) } catch (e) { if (!/context was destroyed|Cannot find context|detached/i.test(String(e))) throw e; await sleep(250) }
  }
  throw new Error("page never settled")
}
async function waitFor(fn, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { if (await p.evaluate(fn)) return Date.now() - t0 } catch {} await sleep(40) }
  return -1
}
async function press(sel) {
  await waitFor(new Function(`return !!document.querySelector(${JSON.stringify(sel)})`))
  const r = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  if (PHONE) await p.touchscreen.tap(r.x, r.y)
  else await p.mouse.click(r.x, r.y)
}
const results = []
for (let run = 0; run < N; run++) {
  await p.goto(base + "/app/website-builder", { waitUntil: "load" })
  await ev(() => { sessionStorage.setItem("docLoads", "0"); sessionStorage.removeItem("hardNav") })
  await waitFor(() => !!document.querySelector('[data-harness-page="Website"]'))
  await sleep(1500)
  await press('[data-harness-page] [data-go="editor"]')
  const inMs = await waitFor(() => !!document.querySelector(".wb-editor-topbar button[aria-label=Back]"))
  await sleep(Number(opt.stay || 2500))
  const loads0 = await ev(() => Number(sessionStorage.getItem("docLoads")))
  const len0 = await ev(() => history.length)
  if (opt.film === "1") { frames.length = 0; await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 }) }
  const t0 = await ev(() => Math.round(performance.now()))
  if (HOW === "bar" || HOW === "link") await press(".wb-editor-topbar button[aria-label=Back]")
  else await ev(() => history.back())
  /* Until the Website page is on the screen, a whole load included. */
  const t1 = Date.now()
  const landedMs = await waitFor(() => !!document.querySelector('[data-harness-page="Website"]') && !document.querySelector(".wb-editor-topbar"), 20000)
  await sleep(1500)
  let extra = null
  if (HOW === "link") {
    /* And then on from Website by a link and Back again: a page that came back by the router must not reload either. */
    await press('[data-harness-page] [data-go="products"]')
    await waitFor(() => !!document.querySelector('[data-harness-page="Products"]'))
    await sleep(800)
    await ev(() => history.back())
    await waitFor(() => !!document.querySelector('[data-harness-page="Website"]'))
    await sleep(2500)
    extra = await ev(() => location.pathname)
  }
  if (opt.film === "1") {
    await cdp.send("Page.stopScreencast")
    const dir = join(out, `editor-${HOW}-${W}-run${run}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
    const f0 = frames[0]?.metadata.timestamp ?? 0
    frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}-${Math.round((f.metadata.timestamp - f0) * 1000)}.jpg`), Buffer.from(f.data, "base64")))
  }
  const after = await ev(() => ({ loads: Number(sessionStorage.getItem("docLoads")), hard: sessionStorage.getItem("hardNav"), len: history.length, path: location.pathname, rec: window.__rec.map(([t, s]) => [t, s]) }))
  const rec = after.rec.filter(([t]) => t >= t0).map(([t, s]) => `${t - t0}:${s}`)
  results.push({ run, editorOpenMs: inMs, reloads: after.loads - loads0, hardNav: after.hard, landedMs: landedMs < 0 ? -1 : landedMs, hist: `${len0}->${after.len}`, end: after.path, extra, rec: after.loads - loads0 ? "(reloaded; the record before it is lost)" : rec.slice(0, 30).join(" ") })
}
console.log(JSON.stringify({ how: HOW, w: W, cpu: CPU, opt, results, errors: errors.filter((e) => !/JSON/.test(e)).slice(0, 10) }, null, 1))
await b.close()
