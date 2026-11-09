/**
 * ===========================================================================
 *  A STORELIB THEME'S LIVE WEBSITE, PAGE TO PAGE (round AQ)
 * ===========================================================================
 * scripts/check-live-nav-ap.mjs picks links at random and reads Navigation
 * Timing, which suits an imported theme (every page a document). A website
 * built from Storelib's own themes (/w/<name>) moves between its pages
 * inside one document, so this one clicks a fixed list of the site's own
 * links, in order, and says for each:
 *
 *   - ms from the click until the address is the link's and the page's
 *     main content has changed and painted (two frames)
 *   - "soft" when it stayed in the same document, "document" when the
 *     browser loaded a new one (a full reload), and any further document
 *     the browser loaded within SETTLE_MS (a reload nobody asked for)
 *   - whether the next page had been fetched ahead before the click (an
 *     RSC or prefetch request for its address)
 *   - layout shift after the click, pictures whose address changed
 *   - requests still open after STUCK_MS
 *
 * Read-only GETs; nothing is posted or signed in.
 *
 *   BASE=https://asgardshop.storelib.com PATHS=/about,/contact,/,/products/x node scripts/check-site-nav-aq.mjs [--json FILE]
 *
 * MOBILE=1 for a phone. Without PATHS, the first internal links of the front page that are not anchors on it.
 */
import puppeteer from "puppeteer-core"
import { writeFileSync } from "node:fs"

const BASE = (process.env.BASE || "https://asgardshop.storelib.com").replace(/\/$/, "")
const MOBILE = process.env.MOBILE === "1"
const SETTLE_MS = Number(process.env.SETTLE_MS || 3000)
const STUCK_MS = Number(process.env.STUCK_MS || 5000)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`] : []
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", ...proxy] })
const page = await browser.newPage()
if (MOBILE) await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" })
else await page.setViewport({ width: 1440, height: 900 })

const docs = []
const requests = []
const open = new Map()
const stuck = []
page.on("framenavigated", (f) => { if (f === page.mainFrame()) docs.push({ at: Date.now(), url: f.url() }) })
page.on("request", (r) => {
  requests.push({ at: Date.now(), url: r.url(), type: r.resourceType(), rsc: !!r.headers()["rsc"] || /[?&]_rsc=/.test(r.url()), purpose: r.headers()["purpose"] || r.headers()["sec-purpose"] || "" })
  open.set(r, Date.now())
})
const close = (r) => {
  const at = open.get(r)
  if (at === undefined) return
  open.delete(r)
  if (Date.now() - at > STUCK_MS) stuck.push({ url: r.url().slice(0, 160), ms: Date.now() - at })
}
page.on("requestfinished", close)
page.on("requestfailed", close)

await page.evaluateOnNewDocument(() => {
  const w = (window.__nav = { shifts: [], imgSwaps: 0, documentId: Math.random().toString(36).slice(2) })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.shifts.push({ at: performance.now(), value: e.value }) }).observe({ type: "layout-shift", buffered: true })
  new MutationObserver((list) => { for (const m of list) if (m.target instanceof HTMLImageElement && m.oldValue && !/^data:/.test(m.oldValue) && m.oldValue !== m.target.getAttribute(m.attributeName)) w.imgSwaps++ }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["src", "srcset"] })
})

const steps = []
try {
  const g0 = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: "load", timeout: 30000 })
  await sleep(SETTLE_MS)
  steps.push({ to: "/", how: "typed", ms: Date.now() - g0 - SETTLE_MS })
  const paths = process.env.PATHS
    ? process.env.PATHS.split(",")
    : await page.$$eval("a[href]", (as) => [...new Set(as.map((a) => a.href).filter((h) => h.startsWith(location.origin) && !new URL(h).hash && new URL(h).pathname !== "/" && !/\/(cart|account|checkout|search|api)\b/.test(h)).map((h) => new URL(h).pathname))].slice(0, 6))
  for (const path of [...paths, "/"]) {
    const here = await page.evaluate(() => location.pathname)
    if (here === path) continue
    /* The link as the page has it; missing (the menu is closed), the visitor would open the menu: the address is typed instead and said so. */
    const handle = await page.evaluateHandle((p) => [...document.querySelectorAll("a[href]")].find((a) => { try { const u = new URL(a.href); return u.origin === location.origin && u.pathname === p && !u.hash && a.getBoundingClientRect().width > 0 } catch { return false } }) || null, path)
    const el = handle.asElement()
    const fetchedAhead = requests.some((r) => (r.rsc || /prefetch|prerender/.test(r.purpose)) && new URL(r.url).pathname.replace(/\/$/, "") === path.replace(/\/$/, ""))
    const before = await page.evaluate(() => ({ id: window.__nav.documentId, main: (document.querySelector("main") || document.body).innerText.slice(0, 400), shifts: window.__nav.shifts.length }))
    const docsBefore = docs.length
    const c0 = Date.now()
    if (el) {
      await el.scrollIntoView().catch(() => {})
      if (!MOBILE) await el.hover().catch(() => {})
      await sleep(MOBILE ? 150 : 400)
    }
    const t0 = Date.now()
    if (el) await (MOBILE ? el.tap() : el.click()).catch(() => {})
    else await page.goto(`${BASE}${path}`, { waitUntil: "commit" }).catch(() => {})
    let ms = null
    const end = Date.now() + 20000
    while (Date.now() < end) {
      const s = await page.evaluate((p, was) => ({ path: location.pathname, main: (document.querySelector("main") || document.body)?.innerText.slice(0, 400) ?? "", ready: document.readyState }), path, before.main).catch(() => null)
      if (s && s.path.replace(/\/$/, "") === path.replace(/\/$/, "") && s.main !== before.main && s.ready !== "loading") {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {})
        ms = Date.now() - t0
        break
      }
      await sleep(20)
    }
    const docsAtLand = docs.length
    await sleep(SETTLE_MS)
    const after = await page.evaluate(() => ({ id: window.__nav.documentId, shifts: window.__nav.shifts, imgSwaps: window.__nav.imgSwaps })).catch(() => ({ id: null, shifts: [], imgSwaps: 0 }))
    const sameDoc = after.id === before.id
    steps.push({
      to: path,
      how: el ? (MOBILE ? "tap" : "click") : "typed (no visible link)",
      ms,
      kind: sameDoc ? "soft" : "document",
      fetchedAhead,
      documentsAfter: Math.max(0, docs.length - docsAtLand - (sameDoc ? 0 : 0)),
      shiftAfterClick: sameDoc ? +after.shifts.slice(before.shifts).reduce((s, e) => s + e.value, 0).toFixed(4) : +after.shifts.reduce((s, e) => s + e.value, 0).toFixed(4),
      imgSwaps: after.imgSwaps,
      hoverMs: t0 - c0,
    })
  }
} finally {
  for (const [r, at] of open) if (Date.now() - at > STUCK_MS) stuck.push({ url: r.url().slice(0, 160), ms: Date.now() - at, still: true })
  await browser.close()
}
console.log(`${BASE} ${MOBILE ? "phone" : "desktop"}`)
for (const s of steps) console.log(`  ${String(s.ms ?? "never").padStart(6)}ms ${s.to.padEnd(40)} ${s.how}${s.kind ? ` ${s.kind}` : ""}${s.fetchedAhead !== undefined ? ` fetchedAhead=${s.fetchedAhead}` : ""}${s.documentsAfter !== undefined ? ` docsAfter=${s.documentsAfter} shift=${s.shiftAfterClick} imgSwaps=${s.imgSwaps}` : ""}`)
for (const s of stuck) console.log(`  pending ${s.ms}ms ${s.still ? "(still open) " : ""}${s.url}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, mobile: MOBILE, steps, stuck, at: new Date().toISOString() }, null, 2))
