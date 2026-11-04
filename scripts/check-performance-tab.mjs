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
 *   • the lab test: the quick check labelled as one, six facts, no score,
 *     concrete findings, never Google's quota line;
 *   • a new period (30d): the old figures stay dimmed, no placeholder, the
 *     switches, card and chart do not move, layout shift 0 counting every
 *     shift; the arrow keys, Home and End choose; a quick first answer
 *     never shows the placeholder, a slow one shows it after 300 ms;
 *   • at 360, 430 and 768 too: nothing wider than the screen, labels whole;
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
const MORE_SIZES = [
  ["360", { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["430", { width: 430, height: 932, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ["768", { width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
]

async function open(viewport, state = "ready", extra = "") {
  const p = await browser.newPage()
  await p.setViewport(viewport)
  await p.evaluateOnNewDocument(() => {
    window.__shift = 0
    window.__shiftAll = 0
    window.__shifts = []
    try {
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) {
          window.__shiftAll += e.value
          window.__shifts.push({
            v: Math.round(e.value * 10000) / 10000,
            input: e.hadRecentInput,
            at: Math.round(e.startTime),
            what: (e.sources ?? []).map((s) => `${s.node?.nodeName ?? "?"}.${String(s.node?.className ?? "").slice(0, 30)} ${Math.round(s.previousRect.y)}->${Math.round(s.currentRect.y)} h${Math.round(s.previousRect.height)}->${Math.round(s.currentRect.height)}`),
          })
          if (!e.hadRecentInput) window.__shift += e.value
        }
      }).observe({ type: "layout-shift", buffered: true })
    } catch {}
  })
  await p.goto(`${origin}/?state=${state}${extra}`, { waitUntil: "load" })
  await p.waitForSelector("[data-settings-page]")
  if (!extra.includes("first=")) await p.waitForFunction(() => !document.querySelector("[data-perf-loading]"), { timeout: 5000 }).catch(() => {})
  if (!extra.includes("first=")) await sleep(500)
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

/** The switches: each row's button heights and widths, and any label that does not fit its button. */
const switches = (p) => p.evaluate(() => {
  const out = {}
  for (const g of document.querySelectorAll("[data-segmented]")) {
    const bs = [...g.querySelectorAll("[role=radio]")]
    out[g.dataset.segmented] = {
      h: [...new Set(bs.map((b) => Math.round(b.getBoundingClientRect().height)))],
      w: [...new Set(bs.map((b) => Math.round(b.getBoundingClientRect().width)))],
      row: Math.round(g.getBoundingClientRect().width),
      clipped: bs.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()),
    }
  }
  return out
})

const boxOf = (p, sel) => p.evaluate((s) => {
  const e = document.querySelector(s)
  if (!e) return null
  const r = e.getBoundingClientRect()
  return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) }
}, sel)

const report = {}
for (const [label, viewport] of SIZES) {
  console.log(`\nAt ${label} px, a week of visits`)
  const p = await open(viewport)
  const errors = await p.evaluate(() => window.__errors)
  expect(errors.length === 0, "no errors drawing it", errors.slice(0, 2))
  const o = await overflow(p)
  expect(o.scroll === 0 && o.wide.length === 0, "nothing wider than the screen", o)
  const sw = await switches(p)
  const m = await p.evaluate(() => {
    const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } }
    const tiles = [...document.querySelectorAll("[data-vitals] [data-metric]")]
    const table = document.querySelector("[data-breakdown]")
    const card = table?.closest("section")
    const rows = [...(table?.querySelectorAll("tbody tr") ?? [])]
    return {
      title: box(document.querySelector("[data-settings-page] h1")),
      updated: document.querySelector("[data-perf-updated]")?.textContent.trim(),
      overall: document.querySelector("[data-overall]")?.dataset.overall,
      overallText: document.querySelector("[data-overall]")?.textContent.trim(),
      tiles: tiles.map((t) => ({ metric: t.dataset.metric, ...box(t), value: t.querySelector("[data-p75]")?.textContent ?? t.querySelector("[data-not-enough]")?.textContent })),
      columns: new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().left))).size,
      minor: [...document.querySelectorAll("[data-minor] [data-metric]")].map((t) => t.textContent.trim()),
      selectedTab: document.querySelector("[role=tab][aria-selected=true]")?.dataset.tab,
      chart: box(document.querySelector("[data-perf-chart]")),
      summary: box(document.querySelector("[data-perf-summary]")),
      thresholds: [...document.querySelectorAll("[data-threshold]")].map((g) => g.dataset.threshold),
      table: box(table),
      tableCard: box(card),
      rowHeights: [...new Set(rows.map((r) => Math.round(r.getBoundingClientRect().height)))],
      rows: rows.length,
      showAll: document.querySelector("[data-show-all]")?.textContent.trim() ?? null,
      columnsShown: [...(table?.querySelectorAll("thead th") ?? [])].filter((th) => th.getBoundingClientRect().width > 0).map((th) => th.textContent.trim()),
      insights: [...document.querySelectorAll("[data-insight]")].map((e) => e.textContent.trim().slice(0, 140)),
      lab: document.querySelector("[data-lab-result]")?.dataset.labSource ?? null,
      deltas: [...document.querySelectorAll("[data-delta]")].map((e) => `${e.dataset.delta}: ${e.textContent.trim()}`),
      shift: window.__shift,
    }
  })
  m.switches = sw
  report[label] = m
  expect(m.columns === (label === "390" ? 1 : 3), `the three Core Web Vitals in ${label === "390" ? "one column" : "three columns"}`, m.tiles.map((t) => `${t.metric} ${t.value} @${t.x},${t.y} ${t.w}x${t.h}`))
  expect(m.tiles.every((t) => t.value && t.value !== "Not enough visits yet"), "each has its p75", m.tiles.map((t) => t.value))
  expect(!!m.overall && m.overall !== "none", "one overall rating over them", m.overallText)
  expect(m.minor.length >= 2 && m.selectedTab === "lcp", "FCP and TTFB under them, smaller; LCP charted first", { minor: m.minor, selected: m.selectedTab })
  const hs = Object.values(sw).flatMap((s) => s.h)
  expect(label === "390" ? hs.every((h) => h === 38) : hs.every((h) => h === 32), `every switch ${label === "390" ? "38" : "32"} px tall`, Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.h])))
  expect(Object.values(sw).every((s) => s.w.length === 1 || Math.max(...s.w) - Math.min(...s.w) <= 1), "every choice in a row the same width", Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.w])))
  expect(Object.values(sw).every((s) => s.clipped.length === 0), "every switch's label fits its button", Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.clipped])))
  expect(!!m.chart && m.chart.w >= (label === "390" ? 300 : 600) && m.chart.h === 160, "the chart spans its card, 160 px tall", m.chart) /* Changed on purpose (round Z4, the owner: too much height): 200 to 160. */
  expect(m.thresholds.includes("good"), "Google's Good line is drawn", m.thresholds)
  expect(!!m.table && m.table.w <= m.tableCard.w + 1, "the table fits its card", { table: m.table?.w, card: m.tableCard?.w })
  expect(m.rows === 5 && /^Show all \d+$/.test(m.showAll ?? ""), "the five busiest pages first, the rest behind Show all", { rows: m.rows, more: m.showAll })
  expect(m.rowHeights.every((h) => h <= 44), "table rows on one line", m.rowHeights)
  expect(label === "390" ? m.columnsShown.length === 5 : m.columnsShown.length === 7, "columns: five on a phone, seven on a computer", m.columnsShown)
  expect(m.insights.length >= 1 && /LCP on product pages on mobile is/.test(m.insights[0]), "the first insight names the worst metric and page type, from the data", m.insights[0])
  expect(m.insights.some((t) => /hero-summer\.jpg at 2\.1 MB/.test(t)), "  with what the lab test found", m.insights.find((t) => /lab test/.test(t)))
  expect(/^Real visitor data · [\d,]+ page views · Updated/.test(m.updated ?? ""), "labelled as real visitor data, with the page views and when it was read", m.updated)
  expect(m.lab === "pagespeed", "the stored Google test is drawn on mobile", m.lab)
  expect(m.shift < 0.01, "no layout shift while it loads", m.shift)

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
  await sleep(200)
  const tip = await p.evaluate(() => {
    const t = document.querySelector("[data-perf-tooltip]")
    const g = document.querySelector("[data-crosshair]")
    const page = document.querySelector("[data-settings-page]").getBoundingClientRect()
    if (!t || !g) return null
    const r = t.getBoundingClientRect()
    const rows = [...t.querySelectorAll(":scope > div")].map((d) => Math.round(d.getBoundingClientRect().height))
    return { left: Math.round(r.left), right: Math.round(r.right), pageLeft: Math.round(page.left), pageRight: Math.round(page.right), x: Number(g.dataset.x), glide: getComputedStyle(g).transitionDuration, rows, text: t.textContent.trim().slice(0, 90) }
  })
  expect(!!tip && tip.left >= tip.pageLeft && tip.right <= tip.pageRight, "hover: a crosshair and a readout inside the page", tip)
  expect(!!tip && tip.rows.every((h) => h <= 22), "  each line of the readout on one line", tip?.rows)
  expect(!!tip && tip.glide === "0.09s", "  the crosshair glides 90 ms from point to point", tip?.glide)
  /* One step right on the keyboard moves the crosshair by one point. */
  const keyed = await p.evaluate(async () => {
    const c = document.querySelector("[data-perf-chart]")
    c.focus()
    const before = Number(document.querySelector("[data-crosshair]")?.dataset.x ?? NaN)
    c.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    await new Promise((r) => setTimeout(r, 30))
    return { before, after: Number(document.querySelector("[data-crosshair]")?.dataset.x ?? NaN) }
  })
  expect(keyed.after < keyed.before, "  the arrow keys move it", keyed)
  await p.mouse.move(2, 2)

  /* Sort by LCP, slowest first: the header does not change width. */
  const sorted = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll("[data-breakdown] thead button")].find((b) => b.textContent.trim().startsWith("LCP"))
    const w0 = Math.round(btn.getBoundingClientRect().width)
    btn.click()
    await new Promise((r) => setTimeout(r, 50))
    const th = btn.closest("th")
    const vals = [...document.querySelectorAll("[data-breakdown] tbody tr")].map((tr) => tr.children[2].textContent.trim())
    const ms = (v) => (v.endsWith(" s") ? parseFloat(v) * 1000 : v.endsWith(" ms") ? parseFloat(v) : Number.NaN)
    return { sort: th.getAttribute("aria-sort"), first: vals[0], second: vals[1], ok: ms(vals[0]) >= ms(vals[1]), w0, w1: Math.round(btn.getBoundingClientRect().width) }
  })
  expect(sorted.sort === "descending" && sorted.ok && sorted.w0 === sorted.w1, "a header sorts the table (LCP, slowest first), its width unchanged", sorted)

  /* The panel scrolls, not the page: a screenshot per screenful. */
  const tall = await p.evaluate(() => document.querySelector("[data-settings-page]").scrollHeight)
  for (let y = 0, k = 0; y < tall && k < 6; y += viewport.height - 80, k++) {
    await p.evaluate((top) => document.querySelector("[data-settings-page]").scrollTo(0, top), y)
    await sleep(120)
    await p.screenshot({ path: join(shots, `performance-ready-${label}-${k}.png`) })
  }
  await p.evaluate(() => document.querySelector("[data-settings-page]").scrollTo(0, 0))

  /* The lab test on desktop: the stored quick check, then run again. */
  const lab = await p.evaluate(async () => {
    const desk = [...document.querySelectorAll("[data-segmented=lab-device] [role=radio]")].find((b) => /Desktop/.test(b.textContent))
    desk.click()
    await new Promise((r) => setTimeout(r, 60))
    const res = document.querySelector("[data-lab-result]")
    const footer = res?.closest("section")?.lastElementChild?.textContent.trim()
    const findings = [...document.querySelectorAll("[data-finding]")].map((e) => e.textContent.trim())
    const facts = [...document.querySelectorAll("[data-quick-facts] > div")].map((e) => e.textContent.trim())
    const metaBefore = document.querySelector("[data-lab-meta]")?.textContent.trim()
    const run = document.querySelector("[data-lab-run]")
    run.click()
    await new Promise((r) => setTimeout(r, 50))
    const busy = run.textContent.trim()
    await new Promise((r) => setTimeout(r, 900))
    return {
      source: res?.dataset.labSource,
      footer,
      facts,
      findings,
      score: /score/i.test(res?.textContent ?? ""),
      busy,
      after: document.querySelector("[data-lab-result]")?.dataset.labSource,
      metaBefore,
      meta: document.querySelector("[data-lab-meta]")?.textContent.trim(),
      posts: window.__calls.filter((c) => c.startsWith("POST") && c.includes("/performance/lab")).length,
      quota: /too many requests/i.test(document.body.textContent),
    }
  })
  report[`${label}-lab`] = lab
  await p.evaluate(() => document.querySelector("[data-lab-controls]").scrollIntoView({ block: "start" }))
  await sleep(120)
  await p.screenshot({ path: join(shots, `performance-quick-${label}.png`) })
  expect(lab.source === "quick" && lab.footer === "Quick check from Storelib's server. Not a full browser test.", "desktop: the quick check, labelled as one", lab.footer)
  expect(lab.facts.length === 6 && !lab.score, "  six measured facts and no score", lab.facts)
  expect(lab.findings.length >= 3 && lab.findings.some((f) => /hero-summer\.jpg at 1\.2 MB/.test(f)), "  concrete findings", lab.findings)
  expect(/Testing/.test(lab.busy) && lab.after === "quick" && lab.posts === 1 && !lab.quota, "Run test posts once, says it is testing, draws the quick check, never Google's quota line", { busy: lab.busy, posts: lab.posts })
  /* Round 51: the page read again after the test answers with the test from before (another server's kept copy, as this stub does): the new one stays. */
  expect(/Tested/.test(lab.meta ?? "") && lab.meta !== lab.metaBefore, "  the new result stays after the page is read again", { before: lab.metaBefore, after: lab.meta })
  const o2 = await overflow(p)
  expect(o2.scroll === 0 && o2.wide.length === 0, "  nothing wider than the screen with the lab result open", o2.wide)
  await p.close()

  /* ── A new period: nothing empties, nothing moves ───────────────────── */
  {
    const q = await open(viewport, "ready", "&delay=700")
    const before = { summary: await boxOf(q, "[data-perf-summary]"), chart: await boxOf(q, "[data-perf-chart]"), filters: await boxOf(q, "[data-perf-filters]"), range: await boxOf(q, "[data-segmented=range]") }
    await q.evaluate(() => { window.__shiftAll = 0; window.__shifts = [] })
    const samples = await q.evaluate(async () => {
      const b = [...document.querySelectorAll("[data-segmented=range] [role=radio]")].find((x) => x.textContent.trim() === "30d")
      b.click()
      const look = () => {
        const body = document.querySelector("[data-perf-body]")
        return {
          placeholder: !!document.querySelector("[data-perf-loading]"),
          vitals: !!document.querySelector("[data-vitals] [data-p75]"),
          dim: body?.hasAttribute("data-dim") ?? null,
          opacity: body ? Number(getComputedStyle(body).opacity).toFixed(2) : null,
          checked: document.querySelector("[data-segmented=range] [aria-checked=true]")?.textContent.trim(),
          line: Number(getComputedStyle(document.querySelector("[data-loading-line]")).opacity).toFixed(2),
          lcp: document.querySelector("[data-vitals] [data-metric=lcp] [data-p75]")?.textContent,
          overall: document.querySelector("[data-overall]")?.dataset.overall,
        }
      }
      const out = []
      for (const t of [30, 200, 450, 650]) {
        await new Promise((r) => setTimeout(r, t - (out.length ? [30, 200, 450, 650][out.length - 1] : 0)))
        out.push({ t, ...look() })
      }
      await new Promise((r) => setTimeout(r, 600))
      out.push({ t: 1250, ...look() })
      return out
    })
    const after = { summary: await boxOf(q, "[data-perf-summary]"), chart: await boxOf(q, "[data-perf-chart]"), filters: await boxOf(q, "[data-perf-filters]"), range: await boxOf(q, "[data-segmented=range]") }
    const shiftAll = await q.evaluate(() => ({ total: window.__shiftAll, entries: window.__shifts }))
    const waiting = samples.slice(0, 4)
    const last = samples[4]
    report[`${label}-range`] = { before, after, samples, shiftAll }
    expect(waiting.every((s) => !s.placeholder && s.vitals && s.dim) && waiting.slice(1).every((s) => Number(s.opacity) <= 0.52), "30d chosen: the 7 day figures stay, fading to 50% over 200 ms, no placeholder, no empty frame", waiting.map((s) => `${s.t}ms ${s.opacity}`))
    expect(waiting.every((s) => s.checked === "30d"), "  the switch shows 30d at once", waiting.map((s) => s.checked))
    expect(waiting[0].line === "0.00" && waiting[3].line !== "0.00", "  the progress line only after 300 ms", waiting.map((s) => s.line))
    expect(!last.dim && last.opacity === "1.00" && last.vitals && last.lcp !== waiting[0].lcp, "  then the 30 days, sharp, every figure new", { lcp: `${waiting[0].lcp} -> ${last.lcp}`, overall: `${waiting[0].overall} -> ${last.overall}` })
    const same = (a, b) => a && b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
    expect(same(before.summary, after.summary) && same(before.chart, after.chart) && same(before.filters, after.filters) && same(before.range, after.range), "  the switches, the card and the chart did not move or resize", { before, after })
    expect(shiftAll.total === 0, "  layout shift while switching: 0, counting shifts after input too", shiftAll)

    /* The keyboard: one Tab stop, the arrows and End choose. */
    const keys = await q.evaluate(async () => {
      const checked = () => document.querySelector("[data-segmented=range] [aria-checked=true]")
      checked().focus()
      const press = async (key) => {
        document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }))
        await new Promise((r) => setTimeout(r, 30))
        return { checked: checked().textContent.trim(), focused: document.activeElement === checked() }
      }
      const right = await press("ArrowRight")
      const end = await press("End")
      const wrap = await press("ArrowRight")
      const stops = [...document.querySelectorAll("[data-segmented=range] [role=radio]")].map((b) => b.tabIndex)
      return { right, end, wrap, stops }
    })
    expect(keys.right.checked === "90d" && keys.end.checked === "90d" && keys.wrap.checked === "24h" && keys.wrap.focused, "the period switch: arrows and End choose, the focus follows, the ends wrap", keys)
    expect(keys.stops.filter((t) => t === 0).length === 1, "  one Tab stop for the whole row", keys.stops)
    await sleep(900)

    /* The device: computed on the page, so it changes at once and nothing moves. */
    await q.evaluate(() => { window.__shiftAll = 0 })
    const s0 = await boxOf(q, "[data-perf-summary]")
    const dev = await q.evaluate(async () => {
      const b = [...document.querySelectorAll("[data-segmented=device] [role=radio]")].find((x) => x.textContent.trim() === "Mobile")
      b.click()
      await new Promise((r) => setTimeout(r, 80))
      return { legend: !!document.querySelector("[data-legend]"), dim: document.querySelector("[data-perf-body]")?.hasAttribute("data-dim"), shift: window.__shiftAll }
    })
    const s1 = await boxOf(q, "[data-perf-summary]")
    report[`${label}-device`] = { ...dev, before: s0, after: s1 }
    expect(!dev.legend && !dev.dim && s0.y === s1.y, "Mobile chosen: one line, no legend, no wait, the card where it was", { ...dev, y0: s0.y, y1: s1.y })
    await q.close()
  }

  /* ── The first load: a placeholder only when it is slow ─────────────── */
  {
    const fast = await browser.newPage()
    await fast.setViewport(viewport)
    await fast.goto(`${origin}/?state=ready&first=120`, { waitUntil: "load" })
    const seen = await fast.evaluate(async () => {
      let max = 0
      const t0 = performance.now()
      while (performance.now() - t0 < 700) {
        const ph = document.querySelector("[data-perf-loading]")
        if (ph) max = Math.max(max, Number(getComputedStyle(ph).opacity))
        await new Promise((r) => requestAnimationFrame(r))
      }
      return { max, drawn: !!document.querySelector("[data-vitals] [data-p75]") }
    })
    expect(seen.max === 0 && seen.drawn, "an answer in 120 ms: the placeholder is never seen", seen)
    await fast.close()
    const slow = await browser.newPage()
    await slow.setViewport(viewport)
    await slow.goto(`${origin}/?state=ready&first=1500`, { waitUntil: "load" })
    const ph = await slow.evaluate(async () => {
      const at = async (ms) => { await new Promise((r) => setTimeout(r, ms)); const e = document.querySelector("[data-perf-loading]"); return e ? Number(getComputedStyle(e).opacity).toFixed(2) : null }
      const early = await at(150)
      const later = await at(550)
      return { early, later }
    })
    expect(ph.early === "0.00" && ph.later === "1.00", "an answer in 1.5 s: the placeholder fades in after 300 ms", ph)
    await slow.close()
  }

  for (const state of ["thin", "new", "quiet", "unpublished", "unavailable"]) {
    const q = await open(viewport, state)
    const s = await q.evaluate(() => ({
      empty: document.querySelector("[data-perf-empty]")?.dataset.perfEmpty ?? null,
      text: (document.querySelector("[data-perf-empty]") ?? document.querySelector("[data-vitals]"))?.textContent.trim().slice(0, 120),
      notEnough: document.querySelectorAll("[data-not-enough]").length,
      numbers: document.querySelectorAll("[data-p75]").length,
      overall: document.querySelector("[data-overall]")?.dataset.overall ?? null,
      errors: window.__errors.length,
    }))
    const o3 = await overflow(q)
    const want = { thin: null, new: "new", quiet: "no-visits", unpublished: "unpublished", unavailable: "unavailable" }[state]
    if (state === "thin") expect(s.notEnough >= 5 && s.numbers === 0 && s.overall === "none", `19 page views: "Not enough visits yet" on every figure and no overall rating`, s)
    else expect(s.empty === want, `${state}: its own empty state`, s.text)
    expect(o3.scroll === 0 && o3.wide.length === 0 && s.errors === 0, `${state}: nothing wider than the screen, no errors`, o3.wide)
    report[`${label}-${state}`] = s
    await q.screenshot({ path: join(shots, `performance-${state}-${label}.png`) })
    await q.close()
  }
}

/* The other widths: no overflow, every label whole, the switches the same height. */
for (const [label, viewport] of MORE_SIZES) {
  console.log(`\nAt ${label} px`)
  const p = await open(viewport)
  const o = await overflow(p)
  const sw = await switches(p)
  const cols = await p.evaluate(() => new Set([...document.querySelectorAll("[data-vitals] [data-metric]")].map((t) => Math.round(t.getBoundingClientRect().left))).size)
  const chart = await boxOf(p, "[data-perf-chart]")
  report[label] = { overflow: o, switches: sw, columns: cols, chart }
  expect(o.scroll === 0 && o.wide.length === 0, "nothing wider than the screen", o)
  expect(Object.values(sw).every((s) => s.clipped.length === 0), "every switch's label fits", Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, v.clipped])))
  const hs = [...new Set(Object.values(sw).flatMap((s) => s.h))]
  expect(hs.length === 1, "the switches one height", hs)
  console.log(`        vitals in ${cols} column(s), chart ${chart?.w} x ${chart?.h}, switches ${JSON.stringify(Object.fromEntries(Object.entries(sw).map(([k, v]) => [k, `${v.row}w ${v.h}h`])))}`)
  await p.screenshot({ path: join(shots, `performance-ready-${label}.png`) })
  await p.close()
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
