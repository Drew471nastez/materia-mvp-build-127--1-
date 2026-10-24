/**
 * ===========================================================================
 *  ANALYTICS ROUND AC2, MEASURED
 * ===========================================================================
 * Mounts the real AnalyticsClient (scripts/render-analytics-page.tsx, its
 * network answered from fixtures by the server's own rules, the sales
 * reports and the export included) at 390 and 1280 wide and measures:
 *
 *   no sideways scroll; no All / Digital / Physical switch anywhere and no
 *   switch inside Top products; the heading alone in its row and Export the
 *   last control of the period's row, on screen at 390; the breakdown's
 *   Digital and Physical columns adding up to the total; the Shipping card
 *   for a store with physical orders and not for a seller of downloads; the
 *   Export dialog (a sheet on a phone) with every report ticked, a range and
 *   two formats, downloading a CSV of the reports chosen and a zip; the Add
 *   report tile (full width, dashed, under the last card) opening the picker;
 *   the funnel's five stages inside its card; the report cards' lines
 *   answering a pointer with the one readout; the metric tabs' line sliding;
 *   and the layout shift while tabs and the range change.
 *
 *   node scripts/check-analytics-ac2.mjs        SHOTS_DIR=<dir> keeps screenshots
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".page-probe-ac2")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || null
if (shots) mkdirSync(shots, { recursive: true })

writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `
const router = { replace: () => {}, push: () => {}, refresh: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

/* The file the page saves: the blob handed to an <a download>, its type, its first bytes and, for text, its words. Every layout shift, input or not. */
const INSTRUMENT = `
window.__saved = []
const make = URL.createObjectURL.bind(URL)
URL.createObjectURL = (b) => { b.arrayBuffer().then((buf) => { const u = new Uint8Array(buf); window.__saved.push({ type: b.type, size: u.length, head: String.fromCharCode(u[0] || 0, u[1] || 0), text: /csv/.test(b.type) ? new TextDecoder().decode(u) : "" }) }); return make(b) }
HTMLAnchorElement.prototype.click = function () { window.__clicked = (window.__clicked || 0) + 1; window.__downloadName = this.download }
try { localStorage.removeItem("storelib.analytics.answers.v2"); localStorage.removeItem("storelib.analytics.commerce.v1"); sessionStorage.clear() } catch {}
try { localStorage.setItem("storelib.analytics.reports.v3:c1", JSON.stringify(["pageviews", "sessions", "clicks", "refunds"])) } catch {}
window.__shifts = []
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__shifts.push({ at: e.startTime, value: e.value, input: e.hadRecentInput, page: (e.sources || []).some((x) => x.node && x.node.nodeType === 1 && !!x.node.closest(".page-scroll") && !x.node.closest("[data-analytics-controls]")), controls: (e.sources || []).some((x) => x.node && x.node.nodeType === 1 && !!x.node.closest("[data-analytics-controls]")), from: (e.sources || []).map((x) => { const n = x.node; if (!n || n.nodeType !== 1) return n ? "#text" : "?"; const at = n.closest("[data-card],[data-analytics-controls],[role=tablist],[data-trend-chart],[data-panel-foot],[data-analytics-head]"); const r = x.currentRect; return (at ? Object.keys(at.dataset).concat(at.getAttribute("role") || []).join(".") + ":" + (at.dataset.card || "") : n.tagName + "." + String(n.getAttribute("class") || "").slice(0, 40)) + " " + Math.round(r.y) + "+" + Math.round(r.height) }) }) }).observe({ type: "layout-shift", buffered: true }) } catch {}
`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const css = await appCss(root)
const bundle = join(dir, "probe.js")
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-page.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
  `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
  `--alias:next/link=${join(dir, "next-link.js")}`,
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
const js = readFileSync(bundle)
const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style><script>${INSTRUMENT}</script></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
const server = createServer((req, res) => {
  if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
  res.writeHead(200, { "content-type": "text/html" }); res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

async function open(seller, vp, extra = "") {
  const p = await browser.newPage()
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  await p.goto(`${origin}/?seller=${seller}${extra}`, { waitUntil: "load" })
  await p.waitForSelector("[data-analytics-cards]", { timeout: 20000 })
  await p.waitForFunction(() => document.querySelector("[data-analytics-cards]")?.getAttribute("aria-busy") === "false", { timeout: 20000 })
  if (seller !== "none") await p.waitForFunction(() => document.querySelector("[data-commerce-reports]")?.getAttribute("aria-busy") === "false", { timeout: 20000 })
  await sleep(900)
  return p
}
async function shoot(p, name) {
  if (!shots) return
  const h = await p.evaluate(() => { const s = document.querySelector(".page-scroll"); return s ? [s.scrollHeight, s.clientHeight] : [0, 0] })
  for (let i = 0, y = 0; y < h[0] && i < 9; i++, y += h[1]) {
    await p.evaluate((top) => { document.querySelector(".page-scroll").scrollTop = top }, y)
    await sleep(150)
    await p.screenshot({ path: join(shots, `${name}-${i}.png`) })
  }
  await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0 })
}
/* Brings an element into the page's own scroller, as a person scrolling would. */
const reveal = (p, sel) => p.evaluate((s) => { const el = document.querySelector(s); el?.scrollIntoView({ block: "center" }); return !!el }, sel)

for (const [name, vp] of [["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desktop, 1280 wide", { width: 1280, height: 900 }]]) {
  console.log(`\n${name}`)
  const wide = vp.width
  const phone = wide < 640

  /* ── A store that sells both ─────────────────────────────────────────── */
  const p = await open("both", vp, "&kind=physical")
  const scroll = await p.evaluate(() => [document.documentElement.scrollWidth, (() => { const s = document.querySelector(".page-scroll"); return s ? s.scrollWidth - s.clientWidth : 0 })()])
  expect(scroll[0] <= wide && scroll[1] <= 0, "no sideways scroll", `${scroll[0]} of ${wide}, page ${scroll[1]}`)

  const top = await p.evaluate(() => {
    const head = document.querySelector("[data-analytics-head]")
    const controls = document.querySelector("[data-analytics-controls]")
    const exp = document.querySelector("[data-analytics-export]")
    const h1 = document.querySelector("h1").getBoundingClientRect()
    const c = controls.getBoundingClientRect()
    const e = exp.getBoundingClientRect()
    const figures = document.querySelector("[role=tablist][aria-label=Metric]").getBoundingClientRect()
    return {
      switch: !!document.querySelector("[data-sales-mode]") || [...document.querySelectorAll("[role=tablist]")].some((t) => /What to count/.test(t.getAttribute("aria-label") || "")),
      productTabs: document.querySelectorAll("section[data-card=products] [role=tablist]").length,
      headChildren: head.children.length,
      exportInControls: controls.contains(exp) && !head.contains(exp),
      exportLast: controls.lastElementChild?.contains(exp),
      controlsHeight: Math.round(c.height),
      exportOnScreen: e.left >= 0 && e.right <= innerWidth - h1.left + 0.5,
      exportRight: Math.round(innerWidth - e.right),
      gutter: Math.round(h1.left),
      rowsAbove: Math.round(figures.top - h1.top),
      address: location.search,
    }
  })
  expect(!top.switch && top.productTabs === 0, "no All / Digital / Physical switch, at the top or inside Top products", top)
  expect(!/kind=/.test(top.address), "an old link's ?kind= is dropped from the address", top.address)
  expect(top.headChildren === 1 && top.exportInControls && top.exportLast, "the heading alone; Export the last control of the period's row")
  expect(top.controlsHeight <= 40 && top.exportOnScreen && top.exportRight === top.gutter, "the period's row is one row, Export on screen inside the gutter", `${top.controlsHeight}px tall, ${top.exportRight}px from the edge, gutter ${top.gutter}`)
  expect(true, "heading to figures", `${top.rowsAbove}px`)

  /* The breakdown's kind columns add up to the total, line by line. */
  const kinds = await p.evaluate(() => {
    const num = (t) => Number((t || "").replace(/[^\d.−-]/g, "").replace("−", "-")) || 0
    const lines = [...document.querySelectorAll("[data-card=sales-breakdown] [data-line]")].map((l) => ({
      line: l.dataset.line,
      d: num(l.querySelector("[data-kind=digital]")?.textContent),
      p: num(l.querySelector("[data-kind=physical]")?.textContent),
      t: num(l.querySelector("[data-kind=total]")?.textContent),
      over: l.scrollWidth > l.clientWidth + 1,
    }))
    return { header: !!document.querySelector("[data-kind-columns]"), lines }
  })
  expect(kinds.header && kinds.lines.length >= 7 && kinds.lines.every((l) => Math.abs(l.d + l.p - l.t) < 0.015), "the breakdown's Digital and Physical columns add up to the total on every line", kinds.lines.map((l) => `${l.line} ${l.d}+${l.p}=${l.t}`).join(", "))
  expect(kinds.lines.every((l) => !l.over), "  and no line is wider than its card")
  const shippingCard = await p.evaluate(() => !!document.querySelector("section[data-card=shipping] [data-card=fulfil]"))
  expect(shippingCard, "a store with physical orders has the Shipping card")
  const split = await p.evaluate(() => document.querySelector("[data-kind-split]")?.textContent ?? "")
  const shares = (split.match(/\d+(?=%)/g) || []).map(Number)
  expect(shares.length === 2 && shares[0] + shares[1] === 100, "Top products' split adds up to 100%", split)

  /* The funnel. */
  await reveal(p, "section[data-card=funnel]")
  await sleep(200)
  const funnel = await p.evaluate(() => {
    const card = document.querySelector("section[data-card=funnel]").getBoundingClientRect()
    const steps = [...document.querySelectorAll("[data-funnel-steps] > li")]
    const outside = [...document.querySelectorAll("section[data-card=funnel] [data-funnel] *")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.left < card.left - 0.5 || b.right > card.right + 0.5 || b.bottom > card.bottom + 0.5) }).length
    const bars = steps.map((s) => s.querySelector("[data-bar]")?.getBoundingClientRect().width ?? 0)
    const names = steps.map((s) => { const n = s.querySelector("span.truncate"); return n ? n.scrollWidth <= n.clientWidth + 1 : false })
    return { steps: steps.length, widths: steps.map((s) => Math.round(s.getBoundingClientRect().width)), bars: bars.map(Math.round), outside, names, converted: document.querySelector("[data-funnel-converted]")?.textContent, h: Math.round(card.height) }
  })
  expect(funnel.steps === 5 && funnel.outside === 0, "the funnel's five stages sit inside their card", funnel)
  expect(funnel.bars.every((w) => w > 0 && w <= 24) && funnel.names.every(Boolean), "  bars at most 24px wide, every stage's name whole", { bars: funnel.bars, names: funnel.names })

  /* Add report. */
  await reveal(p, "[data-add-more]")
  await sleep(200)
  const add = await p.evaluate(() => {
    const t = document.querySelector("[data-add-more]")
    const b = t.getBoundingClientRect()
    const grid = document.querySelector("[data-analytics-cards]").getBoundingClientRect()
    const cards = [...document.querySelectorAll("section[data-card]")]
    const lowest = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom))
    const s = getComputedStyle(t)
    return { w: Math.round(b.width), grid: Math.round(grid.width), h: Math.round(b.height), dashed: s.borderTopStyle, below: b.top >= lowest - 0.5, onScreen: b.left >= 0 && b.right <= innerWidth, text: t.textContent.trim() }
  })
  expect(add.w === add.grid && add.h >= 56 && add.dashed === "dashed" && add.below && add.onScreen && add.text === "Add report", "Add report is a full width dashed tile under the last card", add)
  await p.evaluate(() => document.querySelector("[data-add-more]").click())
  await sleep(500)
  const picker = await p.evaluate(() => !!document.querySelector("[data-add-reports-dialog], [data-add-reports-sheet]"))
  expect(picker, "  and opens the picker")
  await p.keyboard.press("Escape")
  await sleep(500)

  /* The report cards' lines answer a pointer (a mouse; on a phone the finger is the shared layer's, measured by check-chart-scrub). */
  if (!phone) {
    await reveal(p, "section[data-card=pageviews]")
    await sleep(300)
    const box = await p.evaluate(() => { const r = document.querySelector("section[data-card=pageviews] [data-trend-chart]").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })
    await p.mouse.move(box.x + box.w * 0.6, box.y + box.h / 2)
    await sleep(80)
    await p.mouse.move(box.x + box.w * 0.62, box.y + box.h / 2)
    await sleep(300)
    const tip = await p.evaluate(() => { const t = document.querySelector("section[data-card=pageviews] [data-chart-tooltip]"); return t ? { o: getComputedStyle(t).opacity, text: t.textContent } : null })
    expect(!!tip && Number(tip.o) > 0.9 && /\d/.test(tip.text), "a report card's line answers a pointer with the readout", tip)
    const sales = await p.evaluate(() => !!document.querySelector("section[data-card=sales-over-time] [data-chart-touch-shield]"))
    expect(sales, "  and Sales over time draws the same layer")
    await p.mouse.move(2, 2)
  }

  /* The metric tabs: one line that slides, and nothing shifts while tabs and the range change. */
  await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0 })
  await sleep(300)
  const first = await p.evaluate(() => { const l = document.querySelector("[role=tablist][aria-label=Metric] > [data-metric-tab-line]"); const t = document.querySelector('[role=tablist][aria-label=Metric] [data-tab="views"]'); return l ? { shown: getComputedStyle(l).visibility === "visible", w: Math.round(parseFloat(l.style.width)), tab: t.offsetWidth } : null })
  expect(!!first && first.shown && Math.abs(first.w - first.tab) <= 1, "the tab line is under the first tab before any tap", first)
  await p.evaluate(() => { window.__shifts.length = 0 })
  const glide = []
  for (const tab of ["revenue", "orders", "conversion", "views"]) {
    await p.evaluate((t) => document.querySelector(`[role=tablist][aria-label=Metric] [data-tab="${t}"]`).click(), tab)
    await sleep(60)
    glide.push(await p.evaluate(() => { const l = document.querySelector("[role=tablist][aria-label=Metric] > [data-metric-tab-line]"); return l ? { glide: l.hasAttribute("data-glide"), x: l.style.translate } : null }))
    await sleep(700)
  }
  const lines = await p.evaluate(() => document.querySelectorAll("[role=tablist][aria-label=Metric] [data-metric-tab-line]").length)
  expect(lines === 1 && glide.every((g) => g && g.glide) && new Set(glide.map((g) => g.x)).size === 4, "the tabs draw one line, and it slides from tab to tab", glide)
  const tabShift = await p.evaluate(() => window.__shifts.filter((s) => s.page).reduce((a, s) => a + s.value, 0))
  expect(tabShift < 0.01, "four tab changes: layout shift under 0.01", tabShift.toFixed(4))
  await p.evaluate(() => { window.__shifts.length = 0 })
  await p.evaluate(() => document.querySelector("[data-analytics-pickers] button[aria-haspopup=dialog]").click())
  await sleep(500)
  const picked = await p.evaluate(() => { const r = document.querySelector('[data-row="last_30_days"]'); r?.click(); return !!r })
  await sleep(2200)
  /* The page's own shifts: the picker's sheet sliding away on a phone is the sheet, not the page. */
  const rangeShift = await p.evaluate(() => window.__shifts.filter((s) => s.page).reduce((a, s) => a + s.value, 0))
  const rangeFrom = await p.evaluate(() => window.__shifts.filter((s) => s.value > 0.001).map((s) => `${s.value.toFixed(4)} ${s.from.join("|")}`))
  /* The pickers' own row reflows as "Last 7 days" becomes "Last 30 days" (the next picker moves over by the longer word); reported, not counted against the content. */
  const rowShift = await p.evaluate(() => window.__shifts.filter((s) => s.controls).reduce((a, s) => a + s.value, 0))
  expect(picked && rangeShift < 0.01, "a new range (Last 30 days): layout shift of the figures, chart and cards under 0.01", `${picked ? "" : "no preset row; "}${rangeShift.toFixed(4)}; the pickers' row ${rowShift.toFixed(4)}; every shift: ${rangeFrom.join("; ") || "none"}`)

  /* Export. */
  await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0; window.__saved.length = 0; window.__fetches.length = 0 })
  await sleep(200)
  const t0 = Date.now()
  await p.evaluate(() => document.querySelector("[data-analytics-export]").click())
  await p.waitForSelector(phone ? "[data-export-sheet]" : "[data-export-dialog]", { timeout: 3000 })
  const opened = Date.now() - t0
  await sleep(500)
  const dialog = await p.evaluate(() => ({
    reports: [...document.querySelectorAll("[data-export-report]")].map((b) => [b.dataset.exportReport, b.getAttribute("aria-checked")]),
    formats: [...document.querySelectorAll("[data-export-format]")].map((b) => [b.dataset.exportFormat, b.getAttribute("aria-checked")]),
    range: document.querySelector("[data-export-range]")?.textContent ?? "",
    wide: (() => { const b = document.querySelector(location.search && "[data-export-sheet], [data-export-dialog]")?.getBoundingClientRect(); return b ? b.right <= innerWidth + 0.5 && b.left >= -0.5 : false })(),
  }))
  expect(dialog.reports.length >= 9 && dialog.reports.every(([, on]) => on === "true"), `Export opens a ${phone ? "sheet" : "dialog"} with every report ticked`, `${dialog.reports.length} reports, ${opened}ms`)
  expect(dialog.formats.map(([f]) => f).join() === "csv,zip" && dialog.formats[0][1] === "true" && /·/.test(dialog.range) && dialog.wide, "  two formats, CSV chosen, the range named, inside the screen", dialog)
  /* A zip of three reports. */
  await p.evaluate(() => document.querySelector("[data-export-all]").click())
  for (const id of ["summary", "sales", "funnel"]) await p.evaluate((i) => document.querySelector(`[data-export-report="${i}"]`).click(), id)
  await p.evaluate(() => document.querySelector('[data-export-format="zip"]').click())
  await sleep(150)
  await p.evaluate(() => document.querySelector("[data-export-download]").click())
  await sleep(1800)
  const zip = await p.evaluate(() => ({ saved: window.__saved.map((s) => ({ type: s.type, size: s.size, head: s.head })), name: window.__downloadName, asked: window.__fetches.map((f) => f.url).filter((u) => /export/.test(u)), closed: !document.querySelector("[data-export-dialog]") }))
  expect(zip.saved.length === 1 && zip.saved[0].type === "application/zip" && zip.saved[0].head === "PK" && /\.zip$/.test(zip.name || ""), "  a zip of the three chosen, a real zip file", zip)
  expect(zip.asked.length === 1 && /reports=summary%2Csales%2Cfunnel/.test(zip.asked[0]) && /format=zip/.test(zip.asked[0]), "  asked once, for those reports and that format", zip.asked[0]?.slice(-80))
  /* One CSV of two. */
  await p.evaluate(() => { window.__saved.length = 0 })
  await sleep(600)
  await p.evaluate(() => document.querySelector("[data-analytics-export]").click())
  await p.waitForSelector(phone ? "[data-export-sheet]" : "[data-export-dialog]", { timeout: 3000 })
  await sleep(450)
  await p.evaluate(() => document.querySelector("[data-export-all]").click())
  for (const id of ["summary", "sales"]) await p.evaluate((i) => document.querySelector(`[data-export-report="${i}"]`).click(), id)
  await p.evaluate(() => document.querySelector('[data-export-format="csv"]').click())
  await sleep(150)
  await p.evaluate(() => document.querySelector("[data-export-download]").click())
  await sleep(1800)
  const csv = await p.evaluate(() => ({ saved: window.__saved.map((s) => ({ type: s.type, text: s.text })), name: window.__downloadName }))
  const text = csv.saved[0]?.text ?? ""
  const rows = text.split("\r\n")
  expect(csv.saved.length === 1 && /text\/csv/.test(csv.saved[0].type) && /\.csv$/.test(csv.name || "") && rows.includes("Summary") && rows.includes("Total sales breakdown") && !rows.includes("Funnel") && !rows.includes("Traffic sources"), "  one CSV holding only the two chosen", { name: csv.name, sections: rows.filter((l) => /^[A-Z][a-z]+( [a-z]+)*$/.test(l)).slice(0, 8) })
  expect(rows.some((l) => /^Line,This period \(USD\),Digital \(USD\),Physical \(USD\)/.test(l)), "  its breakdown has the Digital and Physical columns")
  await shoot(p, `ac2-both-${wide}`)
  await p.close()

  /* ── A seller of downloads ──────────────────────────────────────────── */
  const d = await open("digital", vp)
  const dd = await d.evaluate(() => ({ shipping: !!document.querySelector("section[data-card=shipping]"), columns: !!document.querySelector("[data-kind-columns]"), split: !!document.querySelector("[data-kind-split]"), rows: [...document.querySelectorAll("[data-card=sales-breakdown] [data-line]")].map((l) => l.dataset.line), scroll: document.documentElement.scrollWidth }))
  expect(!dd.shipping && !dd.columns && !dd.split && !dd.rows.includes("shipping") && dd.scroll <= wide, "digital only: no Shipping card, no kind columns, no split, no shipping line", dd)
  await shoot(d, `ac2-digital-${wide}`)
  await d.close()

  /* ── A seller of physical goods ─────────────────────────────────────── */
  const ph = await open("physical", vp)
  const pp = await ph.evaluate(() => ({ shipping: !!document.querySelector("section[data-card=shipping]"), columns: !!document.querySelector("[data-kind-columns]") }))
  expect(pp.shipping && !pp.columns, "physical only: the Shipping card, no kind columns", pp)
  await ph.close()
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
