/**
 * ===========================================================================
 *  ANALYTICS ROUND AB2, MEASURED
 * ===========================================================================
 * Mounts the real AnalyticsClient (scripts/render-analytics-page.tsx, its
 * network answered from fixtures by the server's own rules, the sales
 * reports and the export included) at 390 and 1280 wide, for a store that
 * sells both kinds, only downloads, only physical goods and nothing yet, and
 * measures:
 *
 *   no sideways scroll; Add report under the last card and nowhere in the
 *   heading row; Export beside the period; the All / Digital / Physical
 *   switch only for a store that sells both, and every card following it
 *   (shipping and fulfillment go under Digital); a seller of downloads with
 *   no shipping line and no fulfillment; a store with nothing to sell with
 *   three traffic tabs and one line instead of sales cards; the added Page
 *   views, Visits and Link clicks cards (a 2px line, thin 4px bars, three
 *   rows, nothing out of the card); the requests a switch makes and the ones
 *   it does not (an answer already known is not asked again); the export's
 *   file and its rows; and the contrast of the new words on white.
 *
 *   node scripts/check-analytics-ab2.mjs        SHOTS_DIR=<dir> keeps screenshots
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
const dir = join(root, ".page-probe-ab2")
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

/* The file the page saves: the blob handed to an <a download>, read back. */
const INSTRUMENT = `
window.__saved = []
const make = URL.createObjectURL.bind(URL)
URL.createObjectURL = (b) => { b.text().then((t) => window.__saved.push({ type: b.type, text: t })); return make(b) }
HTMLAnchorElement.prototype.click = function () { window.__clicked = (window.__clicked || 0) + 1; window.__downloadName = this.download }
/* Each page is another fake store under the same viewer and question: what one kept is not the next one's answer. */
try { localStorage.removeItem("storelib.analytics.answers.v2"); localStorage.removeItem("storelib.analytics.commerce.v1"); sessionStorage.clear() } catch {}
try { localStorage.setItem("storelib.analytics.reports.v3:c1", JSON.stringify(["pageviews", "sessions", "clicks"])) } catch {}
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

const contrastFn = `(a, b) => { const p = (s) => s.match(/[\\d.]+/g).slice(0, 3).map(Number).map((c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }); const L = (s) => { const [r, g, b] = p(s); return 0.2126 * r + 0.7152 * g + 0.0722 * b }; const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05) }`

async function open(seller, vp) {
  const p = await browser.newPage()
  await p.emulateTimezone("Europe/Bucharest")
  await p.setViewport(vp)
  await p.goto(`${origin}/?seller=${seller}`, { waitUntil: "load" })
  await p.waitForSelector("[data-analytics-cards]", { timeout: 20000 })
  await p.evaluate(() => { window.__w = window; window.__fetches.length = 0 })
  await sleep(1500)
  return p
}
/* The page scrolls inside its own box, so a full page shot is taken a screen at a time. */
async function shoot(p, name) {
  if (!shots) return
  const h = await p.evaluate(() => { const s = document.querySelector(".page-scroll"); return s ? [s.scrollHeight, s.clientHeight] : [0, 0] })
  for (let i = 0, y = 0; y < h[0] && i < 8; i++, y += h[1]) {
    await p.evaluate((top) => { document.querySelector(".page-scroll").scrollTop = top }, y)
    await sleep(150)
    await p.screenshot({ path: join(shots, `${name}-${i}.png`) })
  }
  await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0 })
}
const cardsOf = (p) => p.$$eval("section[data-card]", (ss) => ss.map((s) => s.dataset.card))
const rowsOf = (p) => p.$$eval("[data-card=sales-breakdown] .divide-y > div > span:first-child", (xs) => xs.map((x) => x.textContent.trim()))

for (const [name, vp] of [["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["desktop, 1280 wide", { width: 1280, height: 900 }]]) {
  console.log(`\n${name}`)
  const wide = vp.width

  /* ── A store that sells both ─────────────────────────────────────────── */
  const p = await open("both", vp)
  await p.waitForSelector("[data-commerce-reports] [data-card=sales-breakdown] .tabular-nums", { timeout: 15000 })
  /* Both answers in: the cards and the sales reports no longer busy. */
  await p.waitForFunction(() => document.querySelector("[data-analytics-cards]")?.getAttribute("aria-busy") === "false" && document.querySelector("[data-commerce-reports]")?.getAttribute("aria-busy") === "false", { timeout: 15000 })
  await sleep(600)
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth)
  const inner = await p.evaluate(() => { const s = document.querySelector(".page-scroll"); return s ? s.scrollWidth - s.clientWidth : 0 })
  expect(scroll <= wide && inner <= 0, "no sideways scroll", `${scroll} of ${wide}, page ${inner}`)
  const layout = await p.evaluate(() => {
    const row = document.querySelector("[data-analytics-head]")
    const add = document.querySelector("[data-add-more]")
    const cards = [...document.querySelectorAll("section[data-card]")]
    const lowest = Math.max(...cards.map((c) => c.getBoundingClientRect().bottom + (document.querySelector(".page-scroll")?.scrollTop ?? 0)))
    const addTop = add.getBoundingClientRect().top + (document.querySelector(".page-scroll")?.scrollTop ?? 0)
    const exp = document.querySelector("[data-analytics-export]")
    const controls = document.querySelector("[data-analytics-controls]")
    return {
      headingAdd: row.querySelectorAll("[data-add-reports]").length,
      topAdd: document.querySelectorAll("[data-add-reports=add-report]").length,
      addBelowEveryCard: addTop >= lowest - 0.5,
      gap: Math.round(addTop - lowest),
      addCount: document.querySelectorAll("[data-add-reports]").length,
      exportInHead: !!exp && row.contains(exp) && !controls.contains(exp),
      exportRight: exp ? Math.round(exp.getBoundingClientRect().right) : null,
      /* On screen, its right gap the page's own gutter: the same as the heading's left. */
      exportOnScreen: exp ? Math.abs(innerWidth - exp.getBoundingClientRect().right - document.querySelector("h1").getBoundingClientRect().left) <= 1 && exp.getBoundingClientRect().left > document.querySelector("h1").getBoundingClientRect().right : false,
      gutter: Math.round(document.querySelector("h1").getBoundingClientRect().left),
      mode: !!document.querySelector("[data-sales-mode]"),
    }
  })
  expect(layout.headingAdd === 0 && layout.topAdd === 0, "no Add report up top", layout)
  expect(layout.addCount === 1 && layout.addBelowEveryCard, "one Add report, under the last card", `${layout.gap}px under it`)
  expect(layout.exportInHead && layout.exportOnScreen, "Export at the right of the heading, inside the page's gutter", `right edge ${layout.exportRight} of ${wide}, gutter ${layout.gutter}`)
  expect(layout.mode, "the All / Digital / Physical switch is there for a store that sells both")
  const before = await rowsOf(p)
  expect(before.includes("Shipping charges"), "All: the breakdown has shipping", before)
  const fulfilAll = await p.evaluate(() => !!document.querySelector("[data-card=fulfil]"))
  expect(fulfilAll, "All: the fulfillment rate is there")
  const tabValue = () => p.evaluate(() => document.querySelector('[role=tablist][aria-label=Metric] [data-tab="revenue"]')?.textContent ?? "")
  const salesTotal = () => p.evaluate(() => [...document.querySelectorAll("[data-card=sales-breakdown] .divide-y > div")].find((d) => d.firstElementChild?.textContent.trim() === "Total sales")?.lastElementChild?.lastElementChild?.textContent ?? "")
  const money = (t) => (t.match(/\$[\d,]+\.\d{2}/) || [""])[0]
  const revAll = await tabValue()
  const totalAll = await salesTotal()
  expect(!!money(totalAll) && money(totalAll) === money(revAll), "Total sales in the breakdown is the Revenue tab", `${totalAll} | ${money(revAll)}`)

  const clickMode = async (label) => {
    await p.evaluate(() => { window.__fetches.length = 0 })
    await p.evaluate((l) => [...document.querySelectorAll("[data-sales-mode] [role=tab]")].find((b) => b.textContent.trim() === l).click(), label)
    await sleep(900)
    return p.evaluate(() => window.__fetches.map((f) => f.url))
  }
  const asked = await clickMode("Digital")
  const digitalRows = await rowsOf(p)
  const fulfilDigital = await p.evaluate(() => !!document.querySelector("[data-card=fulfil]"))
  expect(!digitalRows.includes("Shipping charges") && !fulfilDigital, "Digital: no shipping line, no fulfillment", digitalRows)
  expect(asked.length === 2 && asked.every((u) => /kind=digital/.test(u)), "Digital: one question to the figures and one to the sales reports, both for Digital", asked.map((u) => u.split("?")[0]))
  const revDigital = await tabValue()
  expect(revDigital !== revAll, "the Revenue tab follows the switch", `${revAll} -> ${revDigital}`)
  const addr = await p.evaluate(() => location.search)
  expect(/kind=digital/.test(addr), "the switch is kept in the address", addr)
  await clickMode("Physical")
  const physRows = await rowsOf(p)
  expect(physRows.includes("Shipping charges"), "Physical: shipping is back", physRows)
  const again = await clickMode("All")
  expect(again.length === 0, "back to All: answered from what is kept, nothing asked again", again)
  const revBack = await tabValue()
  expect(revBack === revAll, "and the figures are All's again", `${revBack}`)

  /* The added cards, redrawn. */
  const trend = await p.evaluate(() => {
    const cards = ["pageviews", "sessions", "clicks"].map((id) => document.querySelector(`section[data-card=${id}]`))
    return cards.map((c) => {
      if (!c) return null
      const r = c.getBoundingClientRect()
      const line = c.querySelector("[data-trend-line] path[stroke='#8b5cf6']")
      const bars = [...c.querySelectorAll("[data-trend-rows] [data-bar]")].map((b) => Math.round(b.getBoundingClientRect().height))
      const out = [...c.querySelectorAll("*")].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 0.5 || b.bottom > r.bottom + 0.5) }).length
      return { line: line ? Number(line.getAttribute("stroke-width")) : null, rows: c.querySelectorAll("[data-trend-rows] li").length, bars, out, columns: c.querySelectorAll("[data-column]").length, h: Math.round(r.height) }
    })
  })
  expect(trend.every((t) => t && t.line === 2 && t.columns === 0), "Page views, Visits and Link clicks: a 2px line, no block of columns", trend)
  expect(trend.every((t) => t.rows >= 1 && t.rows <= 3 && t.bars.every((h) => h === 4)), "  up to three rows each, with 4px bars", trend.map((t) => [t.rows, t.bars]))
  expect(trend.every((t) => t.out === 0), "  nothing drawn outside its card", trend.map((t) => t.out))

  /* Export. */
  await p.evaluate(() => { window.__fetches.length = 0; window.__saved.length = 0 })
  await p.evaluate(() => document.querySelector("[data-analytics-export]").click())
  await sleep(1200)
  const saved = await p.evaluate(() => ({ files: window.__saved, name: window.__downloadName, asked: window.__fetches.map((f) => f.url) }))
  const csv = saved.files[0]?.text ?? ""
  const lines = csv.split("\r\n")
  const sections = ["Summary", "Total sales breakdown", "Total sales over time", "Total sales by channel", "Traffic sources", "Referrers", "Top pages", "Funnel", "Operating systems", "Devices"]
  expect(saved.files.length === 1 && /text\/csv/.test(saved.files[0].type) && /^storelib-analytics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/.test(saved.name), "Export downloads one CSV, named for the period", saved.name)
  expect(saved.asked.length === 1 && /\/api\/analytics\/export\?/.test(saved.asked[0]) && /tz=Europe%2FBucharest/.test(saved.asked[0]), "  asked once, with the page's question and time zone", saved.asked[0]?.slice(0, 90))
  expect(sections.every((s) => lines.includes(s)) && lines.includes("Time zone,Europe/Bucharest") && lines.some((l) => l.startsWith("Currency,")), "  every report is a section, the time zone and the currency stated", `${lines.length} lines`)
  expect(lines.filter((l) => l && !sections.includes(l)).length > 60, "  and they hold rows", lines.filter((l) => l).length)
  const csvTotal = (lines.find((l) => l.startsWith("Total sales,")) || "").split(",")[1]
  expect(!!csvTotal && money(totalAll).replace(/[$,]/g, "") === csvTotal, "  its Total sales is the card's", `${csvTotal} | ${totalAll}`)

  /* Contrast of the new words on white. */
  const contrast = await p.evaluate((fn) => {
    const ratio = eval(fn)
    const of = (sel) => { const el = document.querySelector(sel); if (!el) return null; return ratio(getComputedStyle(el).color, "rgb(255, 255, 255)") }
    return {
      readout: of("[data-trend-readout] span"),
      rowLabel: of("[data-trend-rows] li span"),
      modeTab: of("[data-sales-mode] [role=tab][aria-selected=false] span"),
      exportLabel: of("[data-analytics-export]"),
      fulfilNote: of("[data-card=fulfil] .text-\\[\\#6b7280\\]"),
    }
  }, contrastFn)
  expect(Object.values(contrast).every((c) => c === null || c >= 4.5), "the new words clear 4.5:1 on white", Object.fromEntries(Object.entries(contrast).map(([k, v]) => [k, v && +v.toFixed(2)])))
  await shoot(p, `ab2-both-${wide}`)
  await p.close()

  /* ── A seller of downloads ──────────────────────────────────────────── */
  const d = await open("digital", vp)
  await d.waitForSelector("[data-commerce-reports] [data-card=sales-breakdown] .tabular-nums", { timeout: 15000 })
  await sleep(500)
  const dRows = await rowsOf(d)
  const dCards = await cardsOf(d)
  const dMode = await d.evaluate(() => !!document.querySelector("[data-sales-mode]"))
  expect(!dRows.includes("Shipping charges") && !dCards.includes("fulfil") && !dCards.includes("physical") && !dMode, "digital only: no shipping, no fulfillment, no physical card, no switch", { rows: dRows, cards: dCards })
  await shoot(d, `ab2-digital-${wide}`)
  await d.close()

  /* ── A seller of physical goods ─────────────────────────────────────── */
  const ph = await open("physical", vp)
  await ph.waitForSelector("[data-commerce-reports] [data-card=sales-breakdown] .tabular-nums", { timeout: 15000 })
  await sleep(500)
  const pRows = await rowsOf(ph)
  const pCards = await cardsOf(ph)
  const pMode = await ph.evaluate(() => !!document.querySelector("[data-sales-mode]"))
  expect(pRows.includes("Shipping charges") && pCards.includes("fulfil") && !pMode, "physical only: shipping and fulfillment, no switch", { rows: pRows.length, cards: pCards.includes("fulfil") })
  await ph.close()

  /* ── A store with nothing to sell yet ───────────────────────────────── */
  const none = await open("none", vp)
  await sleep(500)
  const n = await none.evaluate(() => ({
    tabs: [...document.querySelectorAll('[role=tablist][aria-label=Metric] [data-tab]')].map((t) => t.dataset.tab),
    note: document.querySelector("[data-no-sales]")?.textContent ?? null,
    commerce: !!document.querySelector("[data-commerce-reports]"),
    scroll: document.documentElement.scrollWidth,
  }))
  expect(n.tabs.join(",") === "views,pageviews,clicks" && !!n.note && !n.commerce && n.scroll <= wide, "nothing to sell: three traffic tabs, one line, no sales cards", n)
  await shoot(none, `ab2-none-${wide}`)
  await none.close()
}

await browser.close()
server.close()
rmSync(dir, { recursive: true, force: true })
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
