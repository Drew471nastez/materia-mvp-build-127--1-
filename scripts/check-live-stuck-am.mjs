/**
 * ===========================================================================
 *  A LIVE PAGE THAT RELOADS ITSELF OR NEVER FINISHES LOADING (round AM)
 * ===========================================================================
 * Opens a live website's page in headless Chromium with read-only GETs and
 * says, per visit: every navigation of the top frame (a reload shows as a
 * second one), when DOMContentLoaded and load fired, and every request
 * still open when load fired or when the wait ran out, with the initiator.
 * Desktop and phone, a first visit and one with the browser's cache warm,
 * and Back to the page from another one (the bfcache path the release
 * watch listens on).
 *
 *   URL=https://andrewrullz.storelib.com/collections/all node scripts/check-live-stuck-am.mjs [--json FILE]
 *
 * WAIT_MS (default 20000) is how long a visit may take before it is called
 * stuck. Nothing is posted, nothing is signed in.
 */
import puppeteer from "puppeteer-core"
import { writeFileSync } from "node:fs"

const URL_ = process.env.URL || "https://andrewrullz.storelib.com/collections/all"
const WAIT_MS = Number(process.env.WAIT_MS || 20000)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  headless: true,
  args: ["--no-sandbox", `--proxy-server=${process.env.HTTPS_PROXY ?? ""}`, "--ignore-certificate-errors"].filter((a) => !a.endsWith("=")),
})
const results = []

async function run(label, { mobile, warm, back }) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  if (mobile) await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
  else await page.setViewport({ width: 1440, height: 900 })
  const t0 = Date.now()
  const navs = []
  const open = new Map()
  const done = []
  /* A new document (a load or a reload) and a change of address inside the same document (history.replaceState) told apart: only the first is a reload. */
  const cdp = await page.createCDPSession()
  await cdp.send("Page.enable")
  cdp.on("Page.frameNavigated", (e) => { if (!e.frame.parentId) navs.push({ at: Date.now() - t0, url: e.frame.url, kind: "document" }) })
  cdp.on("Page.backForwardCacheNotUsed", (e) => consoleLines.push(`bfcache not used: ${(e.notRestoredExplanations ?? []).map((x) => `${x.type}:${x.reason}`).join(", ")}`))
  cdp.on("Page.navigatedWithinDocument", (e) => { if (e.frameId === page.mainFrame()._id) navs.push({ at: Date.now() - t0, url: e.url, kind: "same document" }) })
  await page.evaluateOnNewDocument(() => {
    const note = (what) => { try { const k = "__probe_nav"; const l = JSON.parse(sessionStorage.getItem(k) || "[]"); l.push(`${what} @${Math.round(performance.now())}`); sessionStorage.setItem(k, JSON.stringify(l.slice(-20))) } catch {} }
    const wrap = (obj, name) => { const f = obj[name]; if (typeof f !== "function") return; obj[name] = function (...a) { note(`${name}(${String(a[2] ?? a[0] ?? "").slice(0, 80)}) ${new Error().stack?.split("\n")[2]?.trim().slice(0, 140) ?? ""}`); return f.apply(this, a) } }
    wrap(history, "replaceState")
    wrap(history, "pushState")
    try { const r = Location.prototype.reload; Location.prototype.reload = function () { note(`location.reload ${new Error().stack?.split("\n")[2]?.trim().slice(0, 140) ?? ""}`); return r.call(this) } } catch {}
  })
  page.on("request", (r) => open.set(r, { url: r.url().slice(0, 160), type: r.resourceType(), at: Date.now() - t0, frame: r.frame() === page.mainFrame() ? "top" : "sub" }))
  const close = (r, how) => { const o = open.get(r); if (o) { open.delete(r); done.push({ ...o, how, ms: Date.now() - t0 - o.at }) } }
  page.on("requestfinished", (r) => close(r, "ok"))
  page.on("requestfailed", (r) => close(r, `failed ${r.failure()?.errorText ?? ""}`))
  const consoleLines = []
  page.on("console", (m) => { if (/release|reload|error/i.test(m.text())) consoleLines.push(m.text().slice(0, 200)) })
  page.on("pageerror", (e) => consoleLines.push(`pageerror: ${String(e.message).slice(0, 200)}`))
  if (warm) {
    await page.goto(URL_, { waitUntil: "load", timeout: WAIT_MS }).catch(() => {})
    await sleep(1500)
    navs.length = 0
    done.length = 0
    open.clear()
  }
  let loadAt = null
  let stuck = false
  const t1 = Date.now()
  try {
    await page.goto(URL_, { waitUntil: "load", timeout: WAIT_MS })
    loadAt = Date.now() - t1
  } catch {
    stuck = true
  }
  const atLoad = [...open.values()].map((o) => ({ ...o, openFor: Date.now() - t0 - o.at }))
  /* What a page does after load: the release watch asks after an idle moment; a reload would show as a navigation. */
  await sleep(6000)
  if (back) {
    const other = new URL("/", URL_).toString()
    await page.goto(other, { waitUntil: "load", timeout: WAIT_MS }).catch(() => {})
    await sleep(1000)
    await page.goBack({ waitUntil: "load", timeout: WAIT_MS }).catch(() => {})
    await sleep(6000)
  }
  const state = await page.evaluate(() => ({ ready: document.readyState, nav: (() => { const n = performance.getEntriesByType("navigation")[0]; return n ? { type: n.type, deliveryType: n.deliveryType, dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd) } : null })(), sw: !!navigator.serviceWorker?.controller, releaseKeys: Object.keys(sessionStorage).filter((k) => k.startsWith("sl-release")), calls: JSON.parse(sessionStorage.getItem("__probe_nav") || "[]") })).catch((e) => ({ error: String(e) }))
  const r = { label, loadAt, stuck, navigations: navs, openAtLoad: atLoad.slice(0, 20), stillOpen: [...open.values()].slice(0, 20), slowest: done.sort((a, b) => b.ms - a.ms).slice(0, 6), state, console: consoleLines.slice(0, 10) }
  results.push(r)
  console.log(`\n== ${label}: load ${loadAt ?? "never"}ms${stuck ? " STUCK" : ""}, navigations ${navs.length}`)
  for (const n of navs) console.log(`   nav @${n.at}ms ${n.kind} ${n.url}`)
  for (const o of atLoad) console.log(`   open at load: ${o.type} ${o.frame} ${o.url} (open ${o.openFor}ms)`)
  for (const o of r.stillOpen) console.log(`   still open: ${o.type} ${o.url}`)
  for (const s of r.slowest) console.log(`   slow: ${s.ms}ms ${s.how} ${s.type} ${s.url}`)
  console.log(`   state ${JSON.stringify(state)}`)
  for (const c of r.console) console.log(`   console: ${c}`)
  await ctx.close()
}

try {
  await run("desktop, first visit", { mobile: false, warm: false, back: false })
  await run("desktop, cache warm, then Back", { mobile: false, warm: true, back: true })
  await run("phone, first visit", { mobile: true, warm: false, back: false })
  await run("phone, cache warm, then Back", { mobile: true, warm: true, back: true })
} finally {
  await browser.close()
}
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(results, null, 2))
