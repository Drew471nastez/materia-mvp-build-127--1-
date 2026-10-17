/**
 * ===========================================================================
 *  WEBSITE SETTINGS › PERFORMANCE, MEASURED
 * ===========================================================================
 * The real Website Settings opened on Performance (scripts/render-performance-tab.tsx,
 * a fake fetch answering with a week built by the real rollup and report
 * code, and the empty states), at 390 and 1280:
 *
 *   • nothing on the page is wider than the screen, the table included;
 *   • the three Core Web Vitals are three columns on a computer, one on a
 *     phone; every control a thumb's height on a phone;
 *   • hovering the chart puts the crosshair on the nearest day and a readout
 *     inside the page; a column header sorts the table;
 *   • 19 page views say "Not enough visits yet" and draw no number;
 *   • each empty state says its own thing;
 *   • the lab test runs and draws its result;
 *   • no layout shift while it loads.
 *
 * And the collector a published page carries (lib/perf/site-vitals-inline.ts):
 * its size gzipped, what it costs a page to run, that it waits for the load
 * event, and the beacon it really sends when the page is left.
 *
 *   PROBE_CSS=source node scripts/check-performance-tab.mjs
 *
 * Screenshots go to SHOTS_DIR (prefix performance-), or a temporary folder.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { gzipSync } from "node:zlib"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const css = (await appCss(root)) + "\n" + interFaces(root)

const out = mkdtempSync(join(tmpdir(), "storelib-performance-tab-"))
const shots = process.env.SHOTS_DIR || join(out, "shots")
mkdirSync(shots, { recursive: true })
const stubs = join(root, ".performance-tab-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/website-builder/editor/install-1"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
writeFileSync(join(stubs, "browser.tsx"), `import { createRoot } from "react-dom/client"
import { boot } from "${join(root, "scripts/render-performance-tab.tsx")}"
window.__errors = []
const origError = console.error
console.error = (...a) => { window.__errors.push(a.map(String).join(" ")); origError(...a) }
window.addEventListener("error", (e) => window.__errors.push(String(e.message)))
boot((el) => createRoot(document.getElementById("app")).render(el))
`)
try {
  execFileSync(
    "npx",
    [
      "esbuild", join(stubs, "browser.tsx"), "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
      `--alias:next/link=${join(stubs, "link.jsx")}`, `--alias:next/navigation=${join(stubs, "navigation.js")}`, `--alias:@=${root}`,
      "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.json=json", "--jsx=automatic",
      '--define:process.env.NODE_ENV="production"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://placeholder.supabase.co"',
      '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="placeholder"',
      "--log-level=error",
    ],
    { cwd: root, stdio: "inherit" },
  )
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const bundle = readFileSync(join(out, "probe.js"))
const html =
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${css}</style><style>body{margin:0;background:#0f0f0f;font-family:Inter,system-ui,sans-serif}</style></head><body>` +
  `<div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="/probe.js"></script></body></html>`

/* The storefront page the collector is measured on: a heading, a picture, some text, the inline script. */
let beacons = []
let beaconJs = ""
const shopPage = () =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<script>window.__t0=performance.now()</script><script data-storelib-vitals="">${beaconJs}</script><script>window.__t1=performance.now()</script>` +
  `<style>body{margin:0;font:16px/1.5 system-ui}img{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#ddd}main{max-width:960px;margin:0 auto;padding:24px}</style></head>` +
  `<body><main><h1>Linen shirt</h1><button id="b">Add to cart</button><img src="/hero.svg" alt=""><p>${"A light shirt for warm days. ".repeat(40)}</p></main></body></html>`

const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(bundle) }
  if (req.url.startsWith("/api/public/sv")) {
    let b = ""
    req.on("data", (c) => (b += c))
    req.on("end", () => { beacons.push(b); res.writeHead(204); res.end() })
    return
  }
  if (req.url.startsWith("/hero.svg")) {
    res.writeHead(200, { "content-type": "image/svg+xml" })
    return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#c9b8a6"/></svg>`)
  }
  if (req.url.startsWith("/shop")) { res.writeHead(200, { "content-type": "text/html" }); return res.end(shopPage()) }
  if (req.url.startsWith("/away")) { res.writeHead(200, { "content-type": "text/html" }); return res.end("<!doctype html><p>away</p>") }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESKTOP = { width: 1280, height: 900, deviceScaleFactor: 1 }
const SIZES = [["390", PHONE], ["1280", DESKTOP]]

async function open(viewport, state = "ready") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.evaluateOnNewDocument(() => {
    window.__shift = 0
    try {
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__shift += e.value }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  })
  await p.goto(`${origin}/?state=${state}`, { waitUntil: "load" })
  await p.waitForSelector("[data-settings-page]")
  await p.waitForFunction(() => !document.querySelector("[data-perf-loading]"), { timeout: 5000 }).catch(() => {})
  await sleep(500)
  return p
}

/** Everything on the page wider than the screen, and the widest thing's right edge. */
const overflow = (p) => p.evaluate(() => {
  const vw = document.documentElement.clientWidth
  const main = document.querySelector("[data-settings-page]")
  const wide = [...main.querySelectorAll("*")].filter((e) => {
    const r = e.getBoundingClientRect()
    return r.width > 0 && r.right > vw + 0.5 && getComputedStyle(e).position !== "fixed"
  })
  return { vw, scroll: main.scrollWidth - main.clientWidth, wide: wide.slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 40)} ${Math.round(e.getBoundingClientRect().right)}`) }
})

const report = {}
for (const [label, viewport] of SIZES) {
  console.log(`\nAt ${label} px, a week of visits`)
  const p = await open(viewport)
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors drawing it", errors.slice(0, 2))
  const o = await overflow(p)
  expect(o.scroll === 0 && o.wide.length === 0, "nothing wider than the screen", o)
  const m = await p.evaluate(() => {
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
    const tiles = [...document.querySelectorAll("[data-vitals] [data-metric]")]
    const filters = [...document.querySelectorAll("[data-perf-filters] button")]
    const table = document.querySelector("[data-breakdown]")
    const card = table?.closest("section")
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])]
    return {
      title: box(document.querySelector("[data-settings-page] h1")),
      updated: document.querySelector("[data-perf-updated]")?.textContent.trim(),
      tiles: tiles.map((t) => ({ metric: t.dataset.metric, ...box(t), value: t.querySelector("[data-p75]")?.textContent ?? t.querySelector("[data-not-enough]")?.textContent })),
      columns: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size,
      filterHeights: [...new Set(filters.map((b) => Math.round(b.getBoundingClientRect().height)))],
      filterRows: new Set(filters.map((b) => Math.round(b.getBoundingClientRect().top))).size,
      chart: box(document.querySelector("[data-perf-chart]")),
      thresholds: [...document.querySelectorAll("[data-threshold]")].map((g) => g.dataset.threshold),
      table: box(table),
      tableCard: box(card),
      rowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      rows: rows.length,
      columnsShown: [...(table?.querySelectorAll("thead th") ?? [])].filter((th) => th.getBoundingClientRect().width > 0).map((th) => th.textContent.trim()),
      insights: [...document.querySelectorAll("[data-insight]")].map((e) => e.textContent.trim().slice(0, 140)),
      lab: !!document.querySelector("[data-lab-result]"),
      deltas: [...document.querySelectorAll("[data-delta]")].map((e) => `${e.dataset.delta}: ${e.textContent.trim()}`),
      clipped: [...document.querySelectorAll("[role=radiogroup] button")].filter((b) => b.scrollWidth > b.clientWidth + 1 || b.getBoundingClientRect().right > b.parentElement.getBoundingClientRect().right + 0.5).map((b) => b.textContent.trim()),
      tipLines: null,
      shift: window.__shift,
    }
  })
  report[label] = m
  expect(m.columns === (label === "390" ? 1 : 3), `the three Core Web Vitals in ${label === "390" ? "one column" : "three columns"}`, m.tiles.map((t) => `${t.metric} ${t.value} @${t.x},${t.y} ${t.w}w`))
  expect(m.tiles.every((t) => t.value && t.value !== "Not enough visits yet"), "each has its p75", m.tiles.map((t) => t.value))
  expect(label === "390" ? m.filterHeights.every((h) => h >= 38) : m.filterHeights.every((h) => h >= 30), "filter buttons a thumb's height on a phone", m.filterHeights)
  expect(!!m.chart && m.chart.w >= (label === "390" ? 300 : 600), "the chart spans its card", m.chart)
  expect(m.thresholds.includes("good"), "Google's Good line is drawn", m.thresholds)
  expect(!!m.table && m.table.w <= m.tableCard.w + 1, "the table fits its card", { table: m.table?.w, card: m.tableCard?.w })
  expect(m.rowHeights.every((h) => h <= 44), "table rows on one line", m.rowHeights)
  expect(label === "390" ? m.columnsShown.length === 5 : m.columnsShown.length === 7, "columns: five on a phone, seven on a computer", m.columnsShown)
  expect(m.insights.length >= 1 && /LCP on product pages on mobile is/.test(m.insights[0]), "the first insight names the worst metric and page type, from the data", m.insights[0])
  expect(m.insights.some((t) => /hero-summer\.jpg at 2\.1 MB/.test(t)), "  with what the lab test found", m.insights.find((t) => /lab test/.test(t)))
  expect(/^Real visitor data · Updated/.test(m.updated ?? ""), "labelled as real visitor data with when it was read", m.updated)
  expect(m.lab, "the stored lab test is drawn", m.lab)
  expect(m.shift < 0.01, "no layout shift while it loads", m.shift)
  expect(m.clipped.length === 0, "every switch's label fits its button", m.clipped)

  /* The crosshair: the pointer over the middle of the chart. */
  const hover = await p.evaluate(async () => {
    const c = document.querySelector("[data-perf-chart]")
    c.scrollIntoView({ block: "center" })
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    const r = c.getBoundingClientRect()
    return { x: r.left + r.width * 0.55, y: r.top + r.height * 0.5 }
  })
  await p.mouse.move(hover.x, hover.y)
  if (label === "390") await p.touchscreen.tap(hover.x, hover.y)
  await sleep(150)
  const tip = await p.evaluate(() => {
    const t = document.querySelector("[data-perf-tooltip]")
    const line = document.querySelector("[data-crosshair] line")
    const page = document.querySelector("[data-settings-page]").getBoundingClientRect()
    if (!t || !line) return null
    const r = t.getBoundingClientRect()
    const rows = [...t.querySelectorAll(":scope > div")].map((d) => Math.round(d.getBoundingClientRect().height))
    return { left: Math.round(r.left), right: Math.round(r.right), pageLeft: Math.round(page.left), pageRight: Math.round(page.right), x: Number(line.getAttribute("x1")), rows, text: t.textContent.trim().slice(0, 90) }
  })
  expect(!!tip && tip.left >= tip.pageLeft && tip.right <= tip.pageRight, "hover: a crosshair and a readout inside the page", tip)
  expect(!!tip && tip.rows.every((h) => h <= 22), "  each line of the readout on one line", tip?.rows)

  /* Sort by LCP, slowest first. */
  const sorted = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll("[data-breakdown] thead button")].find((b) => b.textContent.trim().startsWith("LCP"))
    btn.click()
    await new Promise((r) => setTimeout(r, 50))
    const th = btn.closest("th")
    const vals = [...document.querySelectorAll("[data-breakdown] tbody tr")].map((tr) => tr.children[2].textContent.trim())
    const ms = (v) => (v.endsWith(" s") ? parseFloat(v) * 1000 : v.endsWith(" ms") ? parseFloat(v) : Number.NaN)
    return { sort: th.getAttribute("aria-sort"), first: vals[0], second: vals[1], ok: ms(vals[0]) >= ms(vals[1]) }
  })
  expect(sorted.sort === "descending" && sorted.ok, "a header sorts the table (LCP, slowest first)", sorted)

  /* The panel scrolls, not the page: a screenshot per screenful. */
  const tall = await p.evaluate(() => document.querySelector("[data-settings-page]").scrollHeight)
  for (let y = 0, k = 0; y < tall && k < 6; y += viewport.height - 80, k++) {
    await p.evaluate((top) => document.querySelector("[data-settings-page]").scrollTo(0, top), y)
    await sleep(120)
    await p.screenshot({ path: join(shots, `performance-ready-${label}-${k}.png`) })
  }
  await p.evaluate(() => document.querySelector("[data-settings-page]").scrollTo(0, 0))

  /* The lab test, run again. */
  const ran = await p.evaluate(async () => {
    const run = [...document.querySelectorAll("[data-lab-controls] button")].find((b) => /Run test/.test(b.textContent))
    run.click()
    await new Promise((r) => setTimeout(r, 50))
    const busy = run.textContent.trim()
    await new Promise((r) => setTimeout(r, 900))
    return { busy, after: !!document.querySelector("[data-lab-result]"), posts: window.__calls.filter((c) => c.startsWith("POST") && c.includes("/performance/lab")).length }
  })
  expect(/Testing/.test(ran.busy) && ran.after && ran.posts === 1, "Run test posts once, says it is testing, and draws the result", ran)
  await p.close()

  for (const state of ["thin", "new", "quiet", "unpublished", "unavailable"]) {
    const q = await open(viewport, state)
    const s = await q.evaluate(() => ({
      empty: document.querySelector("[data-perf-empty]")?.dataset.perfEmpty ?? null,
      text: (document.querySelector("[data-perf-empty]") ?? document.querySelector("[data-vitals]"))?.textContent.trim().slice(0, 120),
      notEnough: document.querySelectorAll("[data-not-enough]").length,
      numbers: document.querySelectorAll("[data-p75]").length,
      errors: window.__errors.length,
    }))
    const o2 = await overflow(q)
    const want = { thin: null, new: "new", quiet: "no-visits", unpublished: "unpublished", unavailable: "unavailable" }[state]
    if (state === "thin") expect(s.notEnough >= 5 && s.numbers === 0, `19 page views: "Not enough visits yet" on every figure, no number`, s)
    else expect(s.empty === want, `${state}: its own empty state`, s.text)
    expect(o2.scroll === 0 && o2.wide.length === 0 && s.errors === 0, `${state}: nothing wider than the screen, no errors`, o2.wide)
    report[`${label}-${state}`] = s
    await q.screenshot({ path: join(shots, `performance-${state}-${label}.png`) })
    await q.close()
  }
}

/* ── The collector on a storefront page ─────────────────────────────────── */
console.log("\nThe collector a published page carries")
{
  const p0 = await browser.newPage()
  await p0.goto(`${origin}/?state=ready`, { waitUntil: "load" })
  beaconJs = await p0.evaluate(() => window.__beacon)
  await p0.close()
  const gz = gzipSync(beaconJs, { level: 9 }).length
  expect(gz < 2048, `under 2 KB gzipped`, `${gz} bytes gzipped, ${beaconJs.length} raw`)
  report.beacon = { gzip: gz, raw: beaconJs.length }

  for (const [label, viewport] of SIZES) {
    beacons = []
    const p = await browser.newPage()
    await p.setViewport(viewport)
    /* Headless Chrome reports navigator.webdriver; the collector refuses that, as it should for a bot, so it is cleared for this one measurement. */
    await p.evaluateOnNewDocument(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false })
      window.__longTasks = []
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__longTasks.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: true }) } catch {}
    })
    await p.goto(`${origin}/shop/products/linen-shirt?utm_source=mail`, { waitUntil: "load" })
    await sleep(1500)
    await p.click("#b")
    await sleep(300)
    const cost = await p.evaluate(() => ({ exec: Math.round((window.__t1 - window.__t0) * 100) / 100, longTasks: window.__longTasks, started: !!window.__slSV }))
    await p.goto(`${origin}/away`, { waitUntil: "load" })
    await sleep(400)
    const body = beacons[0] ? JSON.parse(beacons[0]) : null
    report[`collector-${label}`] = { ...cost, body, sent: beacons.length }
    /* On a shared machine timings wander; the bound is generous and the number is reported as measured. */
    expect(cost.exec < 5, `${label}: the inline script runs in under 5 ms before the page goes on`, `${cost.exec} ms`)
    console.log(`        long tasks on the whole page (the page's own work included): ${JSON.stringify(cost.longTasks)}`)
    expect(beacons.length === 1, `${label}: one beacon when the page is left`, beacons.length)
    expect(!!body && body.v === 1 && body.k === "l" && body.p === "/shop/products/linen-shirt", `${label}: the path without its query, as a page load`, body && { p: body.p, k: body.k })
    expect(!!body && body.lcp > 0 && body.fcp > 0 && typeof body.ttfb === "number" && typeof body.cls === "number" && typeof body.inp === "number" && body.w === viewport.width, `${label}: LCP, FCP, TTFB, CLS, the tap's INP and the width`, body)
    expect(!!body && Object.keys(body).every((k) => ["v", "p", "k", "w", "c", "lcp", "inp", "cls", "fcp", "ttfb"].includes(k)), `${label}: nothing else in the body`, body && Object.keys(body))
    await p.close()
  }

  /* A frame (the editor's canvas) and a scripted browser send nothing. */
  beacons = []
  const f = await browser.newPage()
  await f.setContent(`<iframe src="${origin}/shop/x"></iframe>`)
  await sleep(800)
  await f.goto(`${origin}/away`)
  await sleep(300)
  const s = await browser.newPage()
  await s.goto(`${origin}/shop/y`, { waitUntil: "load" })
  await sleep(500)
  await s.goto(`${origin}/away`)
  await sleep(300)
  expect(beacons.length === 0, "inside a frame, and in a browser that says it is driven by a script, nothing is sent", beacons.length)
  await f.close()
  await s.close()
}

await browser.close()
server.close()
writeFileSync(join(out, "report.json"), JSON.stringify(report, null, 2))
console.log(`\nShots: ${shots}\nNumbers: ${join(out, "report.json")}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nAll checks passed")
process.exit(broken ? 1 : 0)
