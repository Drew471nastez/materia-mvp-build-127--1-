/**
 * ===========================================================================
 *  WHAT A BUYER WITH A CART SEES CHANGE AFTER THE PAGE APPEARS (round AQ)
 * ===========================================================================
 * An imported theme's live page is one copy for everybody (lib/storelib-
 * theme/compat/anonymous-cache.ts); a buyer's cart count and other parts of
 * their own are put in afterwards from a private address
 * (lib/storelib-theme/compat/personal-fill.ts). This measures, in headless
 * Chromium, what that looks like on a real page:
 *
 *   - the shared page is fetched once from BASE as a browser opens it (a
 *     read-only GET) and served from a local server, its theme files passed
 *     through to BASE (read-only GETs, kept on disk for the next run);
 *   - the private answer (?sl_personal=) is made here, PERSONAL_MS late,
 *     from the page's own sections with the cart count set to COUNT, which is
 *     what the real answer differs in for a cart with COUNT items;
 *   - the browser carries sl_cart_n=COUNT, and (LOCAL=1) the count the
 *     theme's own script keeps in localStorage after an add to cart; the
 *     cart's own address (/cart.js) answers COUNT items, as it would;
 *   - the theme files come from a second local origin, so the page's own
 *     requests (the private answer) never queue behind them on HTTP/1.1's
 *     six connections, as they do not on the live site's HTTP/2.
 *
 * FILL=repo puts the page's fill script where the repository's current
 * personal-fill.ts puts it (withPersonalFill), so a change can be measured
 * against the live one (FILL=live, the page as served).
 *
 * Reported: when the page first painted, every change of a cart count's text
 * after that (ms after first paint, from what to what), layout shifts with
 * their sources, pictures whose address changed, and when the fill landed.
 * Screenshots at first paint and after the fill under SHOTS.
 *
 *   BASE=https://andrewrullz.storelib.com FILL=live LOCAL=0 node scripts/check-personal-flash-aq.mjs
 */
import puppeteer from "puppeteer-core"
import http from "node:http"
import { createRequire } from "node:module"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { join } from "node:path"

const BASE = (process.env.BASE || "https://andrewrullz.storelib.com").replace(/\/$/, "")
const PAGE = process.env.PAGE_PATH || "/"
const COUNT = Number(process.env.COUNT || 3)
const PERSONAL_MS = Number(process.env.PERSONAL_MS || 700)
const LOCAL = process.env.LOCAL === "1"
const FILL = process.env.FILL || "live"
const CPU = Number(process.env.CPU || 4)
const SHOTS = process.env.SHOTS || null
const CACHE = process.env.ASSET_CACHE || join(process.env.TMPDIR || "/tmp", "personal-flash-assets")
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
const jsonAt = process.argv.indexOf("--json")
const JSON_OUT = jsonAt > 0 ? process.argv[jsonAt + 1] : null
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
mkdirSync(CACHE, { recursive: true })
if (SHOTS) mkdirSync(SHOTS, { recursive: true })

/* The repository's fill script, from the TypeScript source (it imports nothing). */
async function repoFill() {
  const { transformSync } = createRequire(join(process.cwd(), "package.json"))("esbuild")
  const ts = readFileSync(join(process.cwd(), "lib/storelib-theme/compat/personal-fill.ts"), "utf8")
  const js = transformSync(ts, { loader: "ts", format: "esm" }).code
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`)
}

const page0 = await fetch(`${BASE}${PAGE}`, { headers: { accept: "text/html", "sec-fetch-dest": "document", "sec-fetch-mode": "navigate", "user-agent": UA } })
let html = await page0.text()
const TAG = /<script data-storelib-personal>\(function\(P\)\{[\s\S]*?\}\)\((\{[^<]*?\})\)<\/script>/
const tagMatch = html.match(TAG)
if (!tagMatch) {
  console.log("the page carries no fill script: nothing personal on it")
  process.exit(0)
}
const parts = JSON.parse(tagMatch[1])
if (FILL === "repo") {
  const mod = await repoFill()
  html = html.replace(TAG, "")
  html = mod.withPersonalFill(html, { sections: parts.s, layout: !!parts.l })
}

/* The sections as the shared page drew them, and as a cart of COUNT draws them: the count's text and attributes. */
function sectionOf(doc, id) {
  const at = doc.indexOf(`id="shopify-section-${id}"`)
  if (at < 0) return null
  const start = doc.lastIndexOf("<", at)
  const tag = doc.slice(start + 1).match(/^([a-z0-9-]+)/i)?.[1]
  if (!tag) return null
  let depth = 0
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi")
  re.lastIndex = start
  let m
  while ((m = re.exec(doc))) {
    depth += m[1] ? -1 : 1
    if (depth === 0) return doc.slice(start, re.lastIndex)
  }
  return null
}
const withCart = (s) =>
  s
    .replace(/(class="[^"]*\bcart-count\b[^"]*"[^>]*>)\s*\(0\)/g, `$1 (${COUNT})`)
    .replace(/(class="[^"]*\bcart-count\b[^"]*"[^>]*>)\s*0\s*</g, `$1${COUNT}<`)
    .replace(/(class="[^"]*\bcart-count\b[^"]*"[^>]*>\s*<span\b[^>]*>)\s*0\s*</g, `$1${COUNT}<`)
    .replace(/(data-cart-count=")0"/g, `$1${COUNT}"`)
const sections = {}
let differs = 0
for (const id of parts.s) {
  const a = sectionOf(html, id)
  const b = a && withCart(a)
  sections[id] = a && b && a !== b ? [a, b] : null
  if (sections[id]) differs++
}
/* The layout as drawn alone: the page with each of its sections taken out (where the real one has its sections' slot), and with the cart. */
let layoutA = html.replace(/<script data-storelib-personal>[\s\S]*?<\/script>/, "")
for (const m of [...html.matchAll(/id="shopify-section-([^"]+)"/g)]) {
  const sec = sectionOf(layoutA, m[1])
  if (sec) layoutA = layoutA.replace(sec, "")
}
const layoutB = withCart(layoutA)
const layout = parts.l && layoutA !== layoutB ? [layoutA, layoutB] : null
const answer = JSON.stringify({ count: COUNT, signedIn: false, sections, layout, end: "" })

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x")
  if (u.searchParams.has("sl_personal")) {
    setTimeout(() => {
      res.writeHead(200, { "content-type": "application/json", "cache-control": "private, no-store" })
      res.end(answer)
    }, PERSONAL_MS)
    return
  }
  if (/^\/cart\.js(on)?$/.test(u.pathname)) {
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" })
    res.end(JSON.stringify({ item_count: COUNT, items: [], total_price: 0, currency: "BRL" }))
    return
  }
  if (u.pathname === PAGE && !u.search) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-cache" })
    res.end(html)
    return
  }
  /* Everything else from the live site, read-only, kept on disk. */
  if (req.method !== "GET") return res.writeHead(405).end()
  const key = join(CACHE, createHash("sha1").update(u.pathname + u.search).digest("hex"))
  try {
    if (!existsSync(key)) {
      const r = await fetch(`${BASE}${u.pathname}${u.search}`, { headers: { accept: req.headers.accept || "*/*", "user-agent": UA }, redirect: "manual" })
      const buf = Buffer.from(await r.arrayBuffer())
      writeFileSync(key, JSON.stringify({ status: r.status, type: r.headers.get("content-type") || "", location: r.headers.get("location") || "", body: buf.toString("base64") }))
    }
    const kept = JSON.parse(readFileSync(key, "utf8"))
    res.writeHead(kept.status, { "content-type": kept.type, ...(kept.location ? { location: kept.location } : {}), "cache-control": "no-store" })
    res.end(Buffer.from(kept.body, "base64"))
  } catch {
    res.writeHead(502).end()
  }
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const ORIGIN = `http://127.0.0.1:${server.address().port}`
/* The theme files from an origin of their own (the same handler: they pass through to BASE). */
const files = http.createServer((req, res) => server.emit("request", req, res))
await new Promise((r) => files.listen(0, "127.0.0.1", r))
html = html.replace(/(["'(])\/api\/site-theme\/assets\//g, `$1http://127.0.0.1:${files.address().port}/api/site-theme/assets/`)

const proxy = process.env.HTTPS_PROXY ? [`--proxy-server=${process.env.HTTPS_PROXY}`, "--proxy-bypass-list=127.0.0.1"] : []
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", ...proxy] })
const out = { base: BASE, page: PAGE, fill: FILL, local: LOCAL, count: COUNT, personalMs: PERSONAL_MS, cpu: CPU, sectionsThatDiffer: differs }
try {
  const page = await browser.newPage()
  await page.emulate({ viewport: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, userAgent: UA })
  const cdp = await page.createCDPSession()
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
  await page.setCookie({ name: "sl_cart_n", value: String(COUNT), url: ORIGIN })
  await page.evaluateOnNewDocument((local, count) => {
    try {
      if (local) localStorage.setItem("materia__cart-count", String(count))
      else localStorage.removeItem("materia__cart-count")
    } catch {}
    const w = (window.__flash = { fcp: null, changes: [], shifts: [], imgSwaps: [], filledAt: null, counts: [] })
    const t = () => Math.round(performance.now())
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === "first-contentful-paint") w.fcp = Math.round(e.startTime) }).observe({ type: "paint", buffered: true })
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) w.shifts.push({ at: Math.round(e.startTime), value: +e.value.toFixed(4), sources: (e.sources || []).map((s) => (s.node && s.node.nodeType === 1 ? `${s.node.nodeName.toLowerCase()}#${s.node.id || ""}.${String(s.node.className || "").slice(0, 40)}` : "?")).slice(0, 3) })
    }).observe({ type: "layout-shift", buffered: true })
    document.addEventListener("storelib:personal", () => (w.filledAt = t()))
    /* What a cart count reads on each frame, from the first frame it is on screen. */
    const seen = new Map()
    const frame = () => {
      document.querySelectorAll(".cart-count, [data-cart-count], [data-storelib-cart-count]").forEach((n, i) => {
        const r = n.getBoundingClientRect()
        /* On screen: a size, inside the window, not hidden (a closed drawer off to the side is not seen). */
        const shown = r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth && getComputedStyle(n).visibility !== "hidden"
        const text = n.textContent.trim()
        const key = i
        const was = seen.get(key)
        const now = `${shown ? "shown" : "hidden"}:${text}`
        if (was === undefined) w.counts.push({ at: t(), i, cls: String(n.className).slice(0, 50), first: now })
        else if (was !== now) w.changes.push({ at: t(), i, cls: String(n.className).slice(0, 50), from: was, to: now })
        seen.set(key, now)
      })
      if (t() < 15000) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    new MutationObserver((list) => {
      for (const m of list) if (m.target instanceof HTMLImageElement && m.oldValue && m.oldValue !== m.target.getAttribute(m.attributeName) && !/^data:/.test(m.oldValue)) w.imgSwaps.push({ at: t(), attr: m.attributeName })
    }).observe(document, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["src", "srcset"] })
  }, LOCAL, COUNT)
  const t0 = Date.now()
  await page.goto(`${ORIGIN}${PAGE}`, { waitUntil: "domcontentloaded", timeout: 60000 })
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${FILL}-local${LOCAL ? 1 : 0}-dcl.png`) })
  await page.waitForFunction(() => window.__flash.filledAt !== null, { timeout: 30000 }).catch(() => {})
  await new Promise((r) => setTimeout(r, 1500))
  if (SHOTS) await page.screenshot({ path: join(SHOTS, `${FILL}-local${LOCAL ? 1 : 0}-filled.png`) })
  const f = await page.evaluate(() => {
    const n = performance.getEntriesByType("navigation")[0]
    return { ...window.__flash, dcl: Math.round(n.domContentLoadedEventEnd), interactive: Math.round(n.domInteractive), load: Math.round(n.loadEventEnd) }
  })
  Object.assign(out, f, { wallMs: Date.now() - t0 })
  /* A change of a count that is on screen, after the first paint: what the buyer sees flash. */
  out.visibleFlashes = f.changes.filter((c) => f.fcp !== null && c.at > f.fcp && (c.from.startsWith("shown") || c.to.startsWith("shown")))
  out.cls = +f.shifts.reduce((s, e) => s + e.value, 0).toFixed(4)
} finally {
  await browser.close()
  server.close()
  files.close()
}
console.log(`${BASE}${PAGE} fill=${FILL} localStorage=${LOCAL ? "count" : "empty"} cpu=${CPU}x answer=${PERSONAL_MS}ms sections differing=${out.sectionsThatDiffer} layout differing=${!!layout}`)
console.log(`  first paint ${out.fcp}ms, parsed ${out.interactive}ms, DOMContentLoaded ${out.dcl}ms, load ${out.load}ms, filled ${out.filledAt}ms`)
console.log(`  counts at first sight: ${(out.counts || []).map((c) => `${c.cls.split(" ")[0]}=${c.first}@${c.at}`).join(", ")}`)
console.log(`  count changes on screen after first paint: ${out.visibleFlashes.length}${out.visibleFlashes.length ? ` (${out.visibleFlashes.map((c) => `${c.from} -> ${c.to} at ${c.at}ms, ${c.at - out.fcp}ms after first paint`).join("; ")})` : ""}`)
console.log(`  layout shift total ${out.cls} (${out.shifts.length} entries${out.shifts.length ? `: ${out.shifts.slice(0, 4).map((s) => `${s.value}@${s.at} ${s.sources.join("|")}`).join("; ")}` : ""}), picture swaps ${out.imgSwaps.length}`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(out, null, 2))
