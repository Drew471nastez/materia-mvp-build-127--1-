/**
 * ===========================================================================
 *  ROUND 33: A COMMUNITY'S ANALYTICS, AN OVERVIEW AND ITS SECTIONS, MEASURED
 * ===========================================================================
 * "Remove the Connect Google Analytics next to the time frame." "A clear
 * overview row of the most important figures, then sections, good on
 * phones." Mounts the real AnalyticsSection (scripts/render-community-
 * analytics-round31.tsx, answered from fixtures) in headless Chromium at
 * 1440x900 and on a 390x844 phone and measures:
 *
 *   PERIOD     the row with the period holds the picker and nothing else;
 *              the words "Connect Google Analytics" are nowhere on the page
 *   OVERVIEW   six figures, every one inside the screen at once: their
 *              columns (six at 1440, two on a phone), each figure's width,
 *              the type of its number, none cut off
 *   SECTIONS   the tabs (Growth, Traffic, Engagement, Content, Revenue), how
 *              tall a tab is to a finger; choosing each draws its own chart
 *              (a line, not the placeholder) and its own cards, and nothing
 *              of another section
 *   DOORS      a figure of the overview opens its section on its figure
 *   GA         a connected Google Analytics is one line under Traffic, and
 *              before part 184 (not connected) there is no such line
 *   PAGE       no sideways scroll on either width, in any section
 *   NOT YET    before part 184: no Revenue tab for a community that sells
 *              nothing, no join rate figure, Traffic says how to count it
 *
 *   node scripts/check-community-analytics-round33.mjs
 * Screenshots land in SHOTS_DIR (or a temp dir, printed at the end).
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) {
  console.error(`No browser at ${CHROMIUM}.`)
  process.exit(1)
}
const dir = join(root, ".community-analytics-r33-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-r33-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
writeFileSync(join(dir, "next-navigation.js"), `
const router = { replace() {}, push() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, replace, scroll, ...rest }, ref) { return React.createElement("a", { href: String(href), ref, ...rest }, children) })
`)
writeFileSync(join(dir, "next-image.js"), `import * as React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)

const SECTIONS = ["growth", "traffic", "engagement", "content", "revenue"]
const TREND = { growth: "growth", traffic: "traffic", engagement: "activity", content: "content", revenue: "money" }
const CARDS = { growth: ["joins", "new-returning", "cohorts", "leave-reasons", "invites"], traffic: ["traffic", "countries", "devices"], engagement: ["contributors", "events", "programs"], content: ["posts", "spaces"], revenue: [] }

/* What the page shows now: the controls row, the overview, the tabs, the panel, its charts and cards, and whether the page scrolls sideways. */
const LOOK = () => {
  const vw = innerWidth
  const box = (el) => {
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), right: Math.round(r.right) }
  }
  const controls = document.querySelector("[data-analytics-controls]")
  const kpis = [...document.querySelectorAll("[data-overview] [data-kpi]")].map((el) => {
    const value = el.children[1]?.firstElementChild
    return { key: el.getAttribute("data-kpi"), ...box(el), text: el.textContent.trim().slice(0, 60), font: value ? getComputedStyle(value).fontSize : null, clipped: value ? value.scrollWidth > value.clientWidth + 1 : null }
  })
  const tabs = [...document.querySelectorAll("[data-analytics-sections] [role=tab]")].map((el) => ({ label: el.textContent.trim(), selected: el.getAttribute("aria-selected") === "true", ...box(el) }))
  const panel = document.querySelector("[data-analytics-panel]")
  const trends = [...document.querySelectorAll("[data-trend]")].map((card) => {
    const d = card.querySelector("[data-trend-line]")?.getAttribute("d") || ""
    return { name: card.getAttribute("data-trend"), placeholder: card.querySelector("[data-chart-loading]")?.getAttribute("data-chart-loading") === "true", line: d.length > 10, selected: card.querySelector("[role=tab][aria-selected=true]")?.getAttribute("data-tab") ?? null }
  })
  const cards = [...document.querySelectorAll("[data-analytics-lists] section[data-card]")].map((c) => c.getAttribute("data-card"))
  const ga = [...document.querySelectorAll("[data-ga]")].map((el) => ({ state: el.getAttribute("data-ga"), text: el.textContent.trim().slice(0, 90), ...box(el) }))
  return {
    vw,
    scrollW: document.scrollingElement.scrollWidth,
    controls: controls ? { children: controls.children.length, text: controls.textContent.trim().slice(0, 80), gaLink: !!controls.querySelector("[data-ga-link], a[href*=google-analytics]") } : null,
    connectWords: /Connect Google Analytics/.test(document.body.innerText),
    kpis,
    kpiCols: new Set(kpis.map((k) => k.x)).size,
    tabs,
    navScroll: (() => {
      const nav = document.querySelector("[data-analytics-sections]")
      return nav ? nav.scrollWidth - nav.clientWidth : 0
    })(),
    panel: panel?.getAttribute("data-analytics-panel") ?? null,
    section: document.querySelector("[data-analytics]")?.getAttribute("data-section") ?? null,
    trends,
    cards,
    notice: [...document.querySelectorAll("[data-analytics] [role=status], [data-analytics] p")].some((p) => /SQL part 184/.test(p.textContent)),
    ga,
    live: [...document.querySelectorAll("[data-live-figure]")].map((el) => el.getAttribute("data-live-figure")),
  }
}

let server
let browser
try {
  const css = await appCss(root)
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-community-analytics-round31.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "community.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:next/image=${join(dir, "next-image.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(join(dir, "community.js"))
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/community.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.split("?")[0] === "/community.js") {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(js)
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const phone = label.startsWith("phone")
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await p.goto(`${origin}/community?case=full&delay=80`, { waitUntil: "load" })
    await sleep(1400)
    const look = await p.evaluate(LOOK)

    console.log(`\n${label}: the period and the overview`)
    expect(errors.length === 0, "the section renders without an error", errors)
    expect(look.controls && look.controls.children === 1 && !look.controls.gaLink, "the period's row holds the picker alone", look.controls)
    expect(!look.connectWords, "no \"Connect Google Analytics\" anywhere on the page")
    expect(look.kpis.length === 6, "six figures in the overview", look.kpis.map((k) => k.key))
    expect(look.kpiCols === (phone ? 2 : 6), `${phone ? "two" : "six"} to a row`, look.kpiCols)
    expect(look.kpis.every((k) => k.x >= 0 && k.right <= look.vw), "every figure inside the screen, none off the side", look.kpis.map((k) => [k.x, k.right]))
    expect(look.kpis.every((k) => k.clipped === false), "no number cut off", look.kpis.filter((k) => k.clipped).map((k) => k.text))
    expect(look.kpis.every((k) => k.font === (phone ? "18px" : "22px")), "each number in the figure tab's type", [...new Set(look.kpis.map((k) => k.font))])
    expect(look.kpis.every((k) => k.h >= 64), "each figure a comfortable target", Math.min(...look.kpis.map((k) => k.h)))
    console.log(`  note  overview: ${look.kpis.map((k) => `${k.key} ${k.w}x${k.h}`).join(", ")}`)
    expect(look.scrollW <= look.vw, "the page does not scroll sideways", { scrollW: look.scrollW, vw: look.vw })
    await p.screenshot({ path: join(shots, `${label}-overview.png`), fullPage: !phone })

    console.log(`\n${label}: the sections`)
    expect(look.tabs.map((t) => t.label).join(",") === "Growth,Traffic,Engagement,Content,Revenue", "Growth, Traffic, Engagement, Content, Revenue", look.tabs.map((t) => t.label))
    expect(look.tabs.every((t) => t.right <= look.vw) || (look.navScroll > 0 && look.scrollW <= look.vw), "the tabs fit, or scroll inside their own row and never the page", { rights: look.tabs.map((t) => t.right), navScroll: look.navScroll })
    expect(look.tabs.every((t) => t.h >= (phone ? 40 : 32)), `each tab ${phone ? 40 : 32}px or taller`, look.tabs.map((t) => t.h))
    expect(look.section === "growth" && look.tabs[0].selected, "Growth first", look.section)
    for (const id of SECTIONS) {
      await p.evaluate((i) => [...document.querySelectorAll("[data-analytics-sections] [role=tab]")][i].click(), SECTIONS.indexOf(id))
      await sleep(500)
      const s = await p.evaluate(LOOK)
      const own = s.trends.filter((t) => t.name === TREND[id])
      expect(s.section === id && s.panel === id, `${id}: chosen`, s.section)
      const tab = s.tabs[SECTIONS.indexOf(id)]
      expect(tab.selected && tab.x >= 0 && tab.right <= s.vw, `${id}: its tab chosen and wholly on screen`, { x: tab.x, right: tab.right })
      expect(own.length === 1 && own[0].line && !own[0].placeholder, `${id}: its chart, with a line`, s.trends)
      expect(s.trends.length === 1, `${id}: and no other section's chart`, s.trends.map((t) => t.name))
      expect(CARDS[id].every((c) => s.cards.includes(c)) && s.cards.every((c) => CARDS[id].includes(c)), `${id}: its cards, and only its own`, s.cards)
      expect(s.scrollW <= s.vw, `${id}: no sideways scroll`, { scrollW: s.scrollW, vw: s.vw })
      if (id === "engagement") expect(s.live.join() === "dau,wau,mau,stickiness", "engagement: members here in the last day, week and month, and stickiness", s.live)
      if (id === "traffic") {
        expect(s.ga.length === 1 && s.ga[0].state === "connected" && /G-7XK2Q9PL0D/.test(s.ga[0].text), "traffic: the connected Google Analytics, one quiet line", s.ga)
        const lists = await p.evaluate(() => Math.max(...[...document.querySelectorAll("[data-analytics-lists] section[data-card]")].map((c) => c.getBoundingClientRect().bottom)))
        expect(s.ga[0] && s.ga[0].y >= Math.round(lists) - 1, "under the cards, not beside the period", { line: s.ga[0]?.y, cards: Math.round(lists) })
      } else {
        expect(s.ga.length === 0, `${id}: no Google Analytics line`, s.ga.length)
      }
      await p.screenshot({ path: join(shots, `${label}-${id}.png`), fullPage: !phone })
    }

    console.log(`\n${label}: a figure opens its section`)
    for (const [kpi, section, tab] of [["joinRate", "traffic", "joinRate"], ["churn", "growth", "churn"], ["mrr", "revenue", "mrr"], ["active", "engagement", "active"]]) {
      await p.evaluate((k) => document.querySelector(`[data-kpi="${k}"]`).click(), kpi)
      await sleep(400)
      const s = await p.evaluate(LOOK)
      expect(s.section === section && s.trends[0]?.selected === tab, `${kpi} opens ${section} on ${tab}`, { section: s.section, tab: s.trends[0]?.selected })
    }
    await ctx.close()

    console.log(`\n${label}: before part 184, a community that sells nothing`)
    const ctx2 = await browser.createBrowserContext()
    const q = await ctx2.newPage()
    await q.setViewport(vp)
    await q.goto(`${origin}/community?case=nopart&delay=80`, { waitUntil: "load" })
    await sleep(1400)
    const n = await q.evaluate(LOOK)
    expect(!n.tabs.some((t) => t.label === "Revenue"), "no Revenue tab", n.tabs.map((t) => t.label))
    expect(!n.kpis.some((k) => k.key === "joinRate" || k.key === "engagement" || k.key === "mrr"), "no figure that was not counted", n.kpis.map((k) => k.key))
    expect(n.kpis.every((k) => k.right <= n.vw) && n.scrollW <= n.vw, "still inside the screen", { scrollW: n.scrollW, vw: n.vw })
    await q.evaluate(() => [...document.querySelectorAll("[data-analytics-sections] [role=tab]")][1].click())
    await sleep(400)
    const t = await q.evaluate(LOOK)
    expect(t.section === "traffic" && t.notice && t.trends.length === 0 && t.cards.length === 0, "Traffic says how to count visits, with no empty chart or cards", { trends: t.trends, cards: t.cards, notice: t.notice })
    expect(t.ga.length === 0, "and no Google Analytics line when none is connected", t.ga)
    await q.screenshot({ path: join(shots, `${label}-nopart-traffic.png`), fullPage: !phone })
    await ctx2.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
