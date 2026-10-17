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
 *   SECTIONS   ROUND 35, the owner: "I dont like the analytics tabs Growth
 *              Traffic Engagement Content Revenue. I want one consolidated
 *              dashboard." So: no row of section tabs anywhere on the page,
 *              and all five sections drawn at once, each with its name, its
 *              own chart with a real line, and its own cards
 *   DOORS      a figure of the overview takes the page to its section and
 *              chooses that figure's line; nothing is hidden by the press
 *   GA         a connected Google Analytics is one line at the foot of
 *              Traffic, and before part 184 (not connected) there is no line
 *   PAGE       no sideways scroll on either width
 *   NOT YET    before part 184: no Revenue section for a community that
 *              sells nothing, no join rate figure, Traffic says how to
 *              count it
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
const CARDS = { growth: ["joins", "new-returning", "cohorts", "leave-reasons", "invites"], traffic: ["traffic", "countries", "devices", "link-presses"], engagement: ["contributors", "events", "programs"], content: ["posts", "spaces"], revenue: ["plans", "trials"] }

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
  const sections = [...document.querySelectorAll("[data-analytics-section]")].map((el) => {
    const name = el.querySelector("h3")
    return {
      id: el.getAttribute("data-analytics-section"),
      name: name ? name.textContent.trim() : null,
      ...box(el),
      panel: el.querySelector("[data-analytics-panel]")?.getAttribute("data-analytics-panel") ?? null,
      trends: [...el.querySelectorAll("[data-trend]")].map((c) => c.getAttribute("data-trend")),
      cards: [...el.querySelectorAll("[data-analytics-lists] section[data-card]")].map((c) => c.getAttribute("data-card")),
      ga: [...el.querySelectorAll("[data-ga]")].length,
    }
  })
  const trends = [...document.querySelectorAll("[data-trend]")].map((card) => {
    const d = card.querySelector("[data-trend-line]")?.getAttribute("d") || ""
    return { name: card.getAttribute("data-trend"), placeholder: card.querySelector("[data-chart-loading]")?.getAttribute("data-chart-loading") === "true", line: d.length > 10, selected: card.querySelector("[role=tab][aria-selected=true]")?.getAttribute("data-tab") ?? null }
  })
  const cards = [...document.querySelectorAll("[data-analytics-lists] section[data-card]")].map((c) => c.getAttribute("data-card"))
  const ga = [...document.querySelectorAll("[data-ga]")].map((el) => ({ state: el.getAttribute("data-ga"), text: el.textContent.trim().slice(0, 90), ...box(el) }))
  return {
    vw,
    vh: innerHeight,
    scrollW: document.scrollingElement.scrollWidth,
    controls: controls ? { children: controls.children.length, text: controls.textContent.trim().slice(0, 80), gaLink: !!controls.querySelector("[data-ga-link], a[href*=google-analytics]") } : null,
    connectWords: /Connect Google Analytics/.test(document.body.innerText),
    kpis,
    kpiCols: new Set(kpis.map((k) => k.x)).size,
    sections,
    /* The row of section tabs the owner asked to be rid of: it must not exist at all. */
    sectionTabRow: !!document.querySelector("[data-analytics-sections], [data-section-tab]"),
    /*
      Every tablist left on the page lives inside one card and changes what that card shows: the overview's
      figures, a chart's figures, or a list's own view (How people came, by source or by medium). None of them
      chooses what the page shows, which is what the row of section tabs did.
    */
    strayTablists: [...document.querySelectorAll("[data-analytics] [role=tablist]")].filter((el) => !el.closest("[data-trend], [data-overview], section[data-card]")).length,
    atBottom: Math.ceil(document.scrollingElement.scrollTop + innerHeight) >= document.scrollingElement.scrollHeight - 2,
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

    console.log(`\n${label}: the sections, all of them, on one page`)
    expect(!look.sectionTabRow, "no row of section tabs on the page at all")
    expect(look.strayTablists === 0, "every tablist left is inside one card and changes only that card", look.strayTablists)
    expect(look.sections.map((x) => x.id).join(",") === SECTIONS.join(","), "Growth, Traffic, Engagement, Content, Revenue, in that order", look.sections.map((x) => x.id))
    expect(look.sections.map((x) => x.name).join(",") === "Growth,Traffic,Engagement,Content,Revenue", "each section says its name", look.sections.map((x) => x.name))
    expect(look.sections.every((x) => x.x >= 0 && x.right <= look.vw), "every section inside the screen", look.sections.map((x) => [x.x, x.right]))
    for (const id of SECTIONS) {
      const sec = look.sections.find((x) => x.id === id)
      expect(sec.trends.join() === TREND[id], `${id}: its own chart and no other`, sec.trends)
      expect(sec.panel === id, `${id}: its chart area is its own`, sec.panel)
      expect(CARDS[id].every((c) => sec.cards.includes(c)) && sec.cards.every((c) => CARDS[id].includes(c)), `${id}: its cards, and only its own`, sec.cards)
    }
    const drawn = look.trends.filter((t) => SECTIONS.some((id) => TREND[id] === t.name))
    expect(drawn.length === 5, "five charts drawn at once", drawn.map((t) => t.name))
    expect(drawn.every((t) => t.line && !t.placeholder), "each with a real line, none a placeholder", drawn)
    expect(look.live.join() === "dau,wau,mau,stickiness", "engagement: members here in the last day, week and month, and stickiness", look.live)
    expect(look.scrollW <= look.vw, "the whole page does not scroll sideways", { scrollW: look.scrollW, vw: look.vw })
    const traffic = look.sections.find((x) => x.id === "traffic")
    expect(traffic.ga === 1 && look.ga.length === 1 && look.ga[0].state === "connected" && /G-7XK2Q9PL0D/.test(look.ga[0].text), "the connected Google Analytics, one quiet line inside Traffic", look.ga)
    const trafficCards = await p.evaluate(() => Math.max(...[...document.querySelector('[data-analytics-section="traffic"]').querySelectorAll("[data-analytics-lists] section[data-card]")].map((c) => c.getBoundingClientRect().bottom)))
    expect(look.ga[0] && look.ga[0].y >= Math.round(trafficCards) - 1, "at the foot of Traffic, under its cards", { line: look.ga[0]?.y, cards: Math.round(trafficCards) })
    expect(look.sections.filter((x) => x.ga > 0).length === 1, "and nowhere else", look.sections.filter((x) => x.ga > 0).map((x) => x.id))
    console.log(`  note  sections: ${look.sections.map((x) => `${x.id} ${x.w}x${x.h}`).join(", ")}`)
    await p.screenshot({ path: join(shots, `${label}-page.png`), fullPage: true })

    console.log(`\n${label}: a figure takes the page to its section`)
    for (const [kpi, section, tab] of [["joinRate", "traffic", "joinRate"], ["churn", "growth", "churn"], ["mrr", "revenue", "mrr"], ["active", "engagement", "active"]]) {
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }))
      await sleep(200)
      await p.evaluate((k) => document.querySelector(`[data-kpi="${k}"]`).click(), kpi)
      await sleep(1800)
      const s = await p.evaluate(LOOK)
      const sec = s.sections.find((x) => x.id === section)
      const chart = s.trends.find((t) => t.name === TREND[section])
      /*
        Scrolled to its own top (scroll-mt-4 leaves 16px above it), and the figure it was asked for is the line
        drawn. The last section cannot reach the top of a page that has no more to scroll, so the page being at
        its end counts: the section is on screen either way, which is what the press promised.
      */
      expect((sec.y >= -2 && sec.y <= 40) || (s.atBottom && sec.y < s.vh), `${kpi}: the page is at ${section}`, { y: sec.y, atBottom: s.atBottom })
      expect(chart?.selected === tab, `${kpi}: and ${section} draws ${tab}`, chart?.selected)
      expect(s.sections.length === look.sections.length, `${kpi}: nothing was hidden by the press`, s.sections.length)
    }
    await ctx.close()

    console.log(`\n${label}: before part 184, a community that sells nothing`)
    const ctx2 = await browser.createBrowserContext()
    const q = await ctx2.newPage()
    await q.setViewport(vp)
    await q.goto(`${origin}/community?case=nopart&delay=80`, { waitUntil: "load" })
    await sleep(1400)
    const n = await q.evaluate(LOOK)
    expect(!n.sections.some((x) => x.id === "revenue"), "no Revenue section", n.sections.map((x) => x.id))
    expect(!n.sectionTabRow, "still no row of section tabs")
    expect(!n.kpis.some((k) => k.key === "joinRate" || k.key === "engagement" || k.key === "mrr"), "no figure that was not counted", n.kpis.map((k) => k.key))
    expect(n.kpis.every((k) => k.right <= n.vw) && n.scrollW <= n.vw, "still inside the screen", { scrollW: n.scrollW, vw: n.vw })
    const nt = n.sections.find((x) => x.id === "traffic")
    expect(n.notice && nt.trends.length === 0 && nt.cards.length === 0, "Traffic says how to count visits, with no empty chart or cards", { trends: nt.trends, cards: nt.cards, notice: n.notice })
    expect(nt.ga === 0 && n.ga.length === 0, "and no Google Analytics line when none is connected", n.ga)
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
