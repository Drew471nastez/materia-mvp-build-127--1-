/**
 * ===========================================================================
 *  A VISITOR CLICKING THROUGH A LIVE WEBSITE (round AP)
 * ===========================================================================
 * Opens a live website in headless Chromium and clicks its own links the
 * way a visitor does: rests on a link (so the page's prefetch or prerender
 * can start), clicks, and waits for the next page. Read-only GETs: nothing
 * is posted, nothing is signed in, nothing is added to a cart.
 *
 * Per click it says:
 *   - how long from the click to the new page's load event
 *   - whether the page came as a new document, from a prerender, from a
 *     prefetch, or from the browser's cache (Navigation Timing)
 *   - every further document load of the top frame within SETTLE_MS after
 *     load: a reload or a redirect the visitor did not ask for
 *   - every request still open after STUCK_MS (the tab's spinner)
 *   - pictures whose address changed after load and sections swapped after
 *     load (the flash)
 *
 *   BASE=https://andrewrullz.storelib.com STEPS=8 node scripts/check-live-nav-ap.mjs [--json FILE]
 *
 * MOBILE=1 for a phone. CHROMIUM names the browser binary.
 */
import puppeteer from "puppeteer-core"
import { writeFileSync } from "node:fs"

const BASE = (process.env.BASE || "https://andrewrullz.storelib.com").replace(/\/$/, "")
const STEPS = Number(process.env.STEPS || 8)
const MOBILE = process.env.MOBILE === "1"
const SETTLE_MS = Number(process.env.SETTLE_MS || 6000)
const STUCK_MS = Number(process.env.STUCK_MS || 5000)
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT || 30000)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/* A fixed order of links, so two runs compare: the seed picks which of the page's own links is next. */
let seed = Number(process.env.SEED || 7)
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)

const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", ...proxy] })
const ctx = await browser.createBrowserContext()
const page = await ctx.newPage()
if (MOBILE) await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
else await page.setViewport({ width: 1440, height: 900 })

const t0 = Date.now()
const docs = []
const open = new Map()
const stuck = []
const cdp = await page.createCDPSession()
await cdp.send("Page.enable")
cdp.on("Page.frameNavigated", (e) => { if (!e.frame.parentId) docs.push({ at: Date.now() - t0, url: e.frame.url }) })
/* The tab's spinner: the top frame starting and stopping loading, as the browser itself reports it. */
let mainFrameId = null
const spinner = []
cdp.on("Page.frameStartedLoading", (e) => { if (!mainFrameId || e.frameId === mainFrameId) spinner.push({ at: Date.now(), on: true }) })
cdp.on("Page.frameStoppedLoading", (e) => { if (!mainFrameId || e.frameId === mainFrameId) spinner.push({ at: Date.now(), on: false }) })
/* When, after `since`, the address is `path` and the spinner has stopped since it last started; null on timeout. */
async function landed(path, since, timeout) {
  const end = Date.now() + timeout
  while (Date.now() < end) {
    let here = ""
    try { here = new URL(page.url()).pathname } catch {}
    const after = spinner.filter((s) => s.at >= since)
    const lastStop = [...after].reverse().find((s) => !s.on)
    const lastStart = [...after].reverse().find((s) => s.on)
    if (here === path && lastStop && (!lastStart || lastStop.at >= lastStart.at)) return lastStop.at
    await sleep(25)
  }
  return null
}
/* Requests of the page itself. A navigation answered from a prefetch or a prerender never reports its document request finished in the protocol, so a document is closed when the top frame navigates to it. */
page.on("request", (r) => { if (r.frame() === page.mainFrame() || r.resourceType() === "document") open.set(r, { url: r.url().slice(0, 180), type: r.resourceType(), at: Date.now() }) })
page.on("framenavigated", (f) => { if (f === page.mainFrame()) for (const [r, o] of open) if (o.type === "document" && r.url().split("#")[0] === f.url().split("#")[0]) open.delete(r) })
const close = (r) => {
  const o = open.get(r)
  if (!o) return
  open.delete(r)
  const ms = Date.now() - o.at
  if (ms > STUCK_MS) stuck.push({ ...o, ms, at: o.at - t0 })
}
page.on("requestfinished", close)
page.on("requestfailed", close)

/* Watches the page after its load: a picture whose address changes, a section swapped out. */
await page.evaluateOnNewDocument(() => {
  const w = (window.__probe = { imgSwaps: [], sectionSwaps: 0, reloads: [] })
  try {
    const r = Location.prototype.reload
    Location.prototype.reload = function () { w.reloads.push(new Error().stack?.split("\n").slice(2, 4).join(" | ").slice(0, 200) ?? ""); return r.call(this) }
  } catch {}
  addEventListener("load", () => {
    const mo = new MutationObserver((list) => {
      for (const m of list) {
        if (m.type === "attributes" && m.target instanceof HTMLImageElement && (m.attributeName === "src" || m.attributeName === "srcset")) {
          const now = m.target.getAttribute(m.attributeName) || ""
          /* A lazy picture given its address for the first time is not a flash; one that had an address and got another is. */
          if (m.oldValue && m.oldValue !== now && !/^data:/.test(m.oldValue)) w.imgSwaps.push(`${m.attributeName}: ${m.oldValue.slice(0, 80)} -> ${now.slice(0, 80)}`)
        }
        if (m.type === "childList") for (const n of m.removedNodes) if (n instanceof Element && /^shopify-section-/.test(n.id || "")) w.sectionSwaps++
      }
    })
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["src", "srcset"] })
  }, { once: true })
})

async function timing() {
  return page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0]
    const p = window.__probe || {}
    return {
      url: location.pathname + location.search,
      type: n?.type ?? null,
      deliveryType: n?.deliveryType ?? null,
      activationStart: n ? Math.round(n.activationStart || 0) : null,
      ttfb: n ? Math.round(n.responseStart - (n.activationStart || 0)) : null,
      load: n ? Math.round(n.loadEventEnd) : null,
      serverTiming: n?.serverTiming?.map((s) => `${s.name}${s.duration ? `=${Math.round(s.duration)}` : ""}${s.description ? `:${s.description}` : ""}`).join(" ") ?? "",
      imgSwaps: (p.imgSwaps || []).slice(0, 5),
      imgSwapCount: (p.imgSwaps || []).length,
      sectionSwaps: p.sectionSwaps || 0,
      reloads: p.reloads || [],
    }
  })
}

async function pickLink(seen) {
  const links = await page.$$eval("a[href]", (as) =>
    as
      .map((a) => {
        const r = a.getBoundingClientRect()
        return { href: a.href, visible: r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== "hidden" }
      })
      .filter((l) => l.visible && l.href.startsWith(location.origin) && /\/(products|collections|pages|blogs)\/|\/$/.test(new URL(l.href).pathname) && !/\/(cart|account|checkout|search)/.test(l.href) && !new URL(l.href).hash),
  )
  const fresh = links.filter((l) => !seen.has(new URL(l.href).pathname))
  const pool = fresh.length ? fresh : links
  return pool.length ? pool[Math.floor(rand() * pool.length)].href : null
}

const steps = []
const seen = new Set()
let skipped = 0
try {
  const g0 = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: NAV_TIMEOUT })
  mainFrameId = page.mainFrame()._id
  await sleep(SETTLE_MS)
  const first = await timing()
  steps.push({ step: 0, how: "typed", ms: Date.now() - g0 - SETTLE_MS, docsAfterLoad: 0, ...first })
  seen.add(new URL(page.url()).pathname)
  for (let i = 1; i <= STEPS; i++) {
    const href = await pickLink(seen)
    if (!href) break
    seen.add(new URL(href).pathname)
    const path = new URL(href).pathname
    const handle = await page.evaluateHandle((h) => [...document.querySelectorAll("a[href]")].find((a) => a.href === h && a.getBoundingClientRect().width > 0), href)
    const el = handle.asElement()
    if (!el) continue
    await el.scrollIntoView().catch(() => {})
    await sleep(100)
    /* Only a link a visitor can actually reach: one in a closed drawer or under a popup is skipped, not counted as a page that never came. */
    const reachable = await el.evaluate((a) => {
      const r = a.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === a || a.contains(hit) || hit.contains(a))
    }).catch(() => false)
    if (!reachable) {
      i--
      if (++skipped > 40) break
      continue
    }
    /* Rests on the link as a visitor does before clicking: what hover prefetch and prerender start from. */
    if (!MOBILE) await el.hover().catch(() => {})
    await sleep(MOBILE ? 150 : 400)
    const docsBefore = docs.length
    const c0 = Date.now()
    await (MOBILE ? el.tap() : el.click()).catch(() => {})
    const stoppedAt = await landed(path, c0, NAV_TIMEOUT)
    const ok = stoppedAt !== null
    const ms = ok ? stoppedAt - c0 : Date.now() - c0
    const docsAtLoad = docs.length
    await sleep(SETTLE_MS)
    const t = await timing().catch((e) => ({ error: String(e) }))
    const later = docs.slice(docsAtLoad).map((d) => d.url)
    steps.push({ step: i, how: MOBILE ? "tap" : "click", to: path, ms, ok, docsAtClick: docsAtLoad - docsBefore, docsAfterLoad: later.length, later, ...t })
  }
} finally {
  for (const o of open.values()) if (Date.now() - o.at > STUCK_MS) stuck.push({ ...o, ms: Date.now() - o.at, at: o.at - t0, still: true })
  await browser.close()
}

console.log(`${BASE} ${MOBILE ? "phone" : "desktop"}`)
for (const s of steps) {
  console.log(
    `${String(s.step).padStart(2)} ${String(s.ms).padStart(6)}ms ${s.ok === false ? "TIMEOUT " : ""}${(s.to ?? s.url ?? "").padEnd(42)} type=${s.type} via=${s.deliveryType || (s.activationStart ? "prerender" : "network")} ttfb=${s.ttfb} load=${s.load} reloadsAfter=${s.docsAfterLoad} imgSwaps=${s.imgSwapCount} sectionSwaps=${s.sectionSwaps} ${s.reloads?.length ? `RELOAD-CALL ${s.reloads.join(";")}` : ""} [${s.serverTiming}]`,
  )
}
for (const s of stuck) console.log(`pending ${s.ms}ms ${s.still ? "(still open) " : ""}${s.type} ${s.url}`)
const ms = steps.filter((s) => s.step > 0 && s.ok !== false).map((s) => s.ms).sort((a, b) => a - b)
const q = (p) => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))]
console.log(`clicks ${ms.length}: median ${q(0.5)}ms, p90 ${q(0.9)}ms, max ${ms[ms.length - 1]}ms; documents loaded after a page had loaded: ${steps.reduce((n, s) => n + (s.docsAfterLoad || 0), 0)}; requests open > ${STUCK_MS}ms: ${stuck.length}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, mobile: MOBILE, steps, stuck, at: new Date().toISOString() }, null, 2))
