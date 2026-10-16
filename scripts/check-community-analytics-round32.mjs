/**
 * ===========================================================================
 *  ROUND 32: A COMMUNITY'S ANALYTICS BESIDE /app ANALYTICS, MEASURED
 * ===========================================================================
 * "The analytics is not the same as the analytics charts we have in
 * Storelib; it needs to be accurate, smooth, clean, without the loading
 * stuff, the reloading bar above the charts."
 *
 * Mounts both pages in headless Chromium, each answered from fixtures after
 * a delay the probe sets: /app Analytics (scripts/render-analytics-page.tsx,
 * the real AnalyticsClient) and a community's Analytics
 * (scripts/render-community-analytics-round31.tsx, the real
 * AnalyticsSection in the community shell's frame). At 1440x900 and on a
 * 390x844 phone:
 *
 *   PARITY    the figures' card, a figure tab and the report cards have the
 *             same classes on both pages; the chart is as tall; a tab is as
 *             tall; the report grid has as many columns; hovering the chart
 *             raises the same readout, crosshair and dots, the dashed period
 *             before is drawn, and the axis is written the same way
 *   SWITCH    choosing another period with the answer 700ms away: no
 *             progress line ever shows, nothing blurs, the chart never goes
 *             back to its grey placeholder, no frame has an empty plot, no
 *             skeleton, nothing moves (layout shift), the period chosen is
 *             asked for once
 *             (opening the picker asked for it, with the other usual periods)
 *   MINUTE    the minute's refresh: one request, nothing dims, nothing
 *             blurs, no bar, and an answer with the same numbers redraws
 *             nothing
 *   RETURN    leaving the section and coming back draws the kept answer on
 *             the first frame, sharp, with no request inside FRESH_MS
 *   BACK      choosing the period seen before is drawn at once from what is
 *             kept, asked again behind it only when it is over FRESH_MS old
 *   QUICK     three periods chosen in a row drop the requests nobody waits
 *             for any more, and an answer over WAIT_DIM_MS away dims the
 *             cards a little (opacity only) until it lands
 *   AHEAD     opening the picker asks for its usual periods ahead, so a
 *             choice after that needs no request at all
 *
 *   node scripts/check-community-analytics-round32.mjs
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
const dir = join(root, ".community-analytics-r32-probe")
mkdirSync(dir, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-community-analytics-r32-")), "shots")
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

/*
  WHAT EVERY FRAME SHOWED. A progress line at any opacity, anything blurred
  or dimmed in the section, a chart back on its placeholder, a plot with no
  line, and a line whose points differ from the dates under it.
*/
const INSTRUMENT = `
window.__cls = 0
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: "layout-shift", buffered: true })
window.__frame = () => {
  const bars = [...document.querySelectorAll("[data-loading-line]")].filter((el) => +getComputedStyle(el).opacity > 0.01).length
  const blurred = [...document.querySelectorAll("[data-analytics] *, [data-analytics]")].filter((el) => /blur\\(/.test(getComputedStyle(el).filter)).length
  const dims = [...document.querySelectorAll("[data-analytics-trends], [data-analytics-lists]")].map((el) => +getComputedStyle(el).opacity)
  const charts = [...document.querySelectorAll("[data-trend]")].map((card) => {
    const d = card.querySelector("[data-trend-line]")?.getAttribute("d") || ""
    const pts = (d.match(/[ML]/g) || []).length + (d.match(/C/g) || []).length
    return {
      name: card.getAttribute("data-trend"),
      placeholder: card.querySelector("[data-chart-loading]")?.getAttribute("data-chart-loading") === "true",
      empty: d.length < 4,
      dates: card.querySelectorAll(".recharts-cartesian-axis-tick").length,
    }
  })
  const shimmer = [...document.querySelectorAll("[data-shimmer]")].filter((el) => +getComputedStyle(el).opacity > 0.01).length
  return { bars, blurred, dim: Math.min(1, ...dims), charts, shimmer }
}
window.__record = (on) => {
  if (!on) { window.__rec = false; return window.__frames }
  window.__frames = []
  window.__rec = true
  const step = () => { if (!window.__rec) return; window.__frames.push({ t: performance.now(), ...window.__frame() }); requestAnimationFrame(step) }
  requestAnimationFrame(step)
}
`

let server
let browser
try {
  const css = await appCss(root)
  const bundle = (entry, out) =>
    execFileSync("npx", ["--no-install", "esbuild", join(root, entry),
      "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, out)}`,
      '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production",NEXT_PUBLIC_SUPABASE_URL:"https://placeholder.supabase.co",NEXT_PUBLIC_SUPABASE_ANON_KEY:"placeholder"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
      '--define:process.env.NODE_ENV="production"',
      `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
      `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
      `--alias:next/link=${join(dir, "next-link.js")}`,
      `--alias:next/image=${join(dir, "next-image.js")}`,
      `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
      { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  bundle("scripts/render-analytics-page.tsx", "main.js")
  bundle("scripts/render-community-analytics-round31.tsx", "community.js")
  const files = { "/main.js": readFileSync(join(dir, "main.js")), "/community.js": readFileSync(join(dir, "community.js")) }
  const html = (src) => `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>${INSTRUMENT}</script></head><body><div id="app"></div><script src="${src}"></script></body></html>`
  server = createServer((req, res) => {
    const path = req.url.split("?")[0]
    if (files[path]) {
      res.writeHead(200, { "content-type": "text/javascript" })
      return res.end(files[path])
    }
    res.writeHead(200, { "content-type": "text/html" })
    res.end(html(path.startsWith("/community") ? "/community.js" : "/main.js"))
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  /* The parts both pages share, as each draws them; the readout raised by a real pointer (a finger on a phone) at 60% of the plot. */
  const parity = async (p, cardSel) => {
    const spot = await p.evaluate((cardSel) => {
      const chart = document.querySelector(cardSel)?.querySelector("[data-chart-loading]")
      chart.scrollIntoView({ block: "center" })
      const r = chart.getBoundingClientRect()
      return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.5 }
    }, cardSel)
    if (process.env.PROBE_DEBUG) console.log("  debug", spot, await p.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.outerHTML.slice(0, 160), spot))
    await sleep(200)
    /* A pointer at both widths: a synthetic touch stalls headless Chromium's input queue on a phone viewport. */
    await p.mouse.move(spot.x - 20, spot.y)
    await p.mouse.move(spot.x, spot.y, { steps: 4 })
    await sleep(300)
    const out = await p.evaluate((cardSel) => {
      const card = document.querySelector(cardSel)
      const tab = card?.querySelector("[role=tab][data-tab]")
      const chart = card?.querySelector("[data-chart-loading]")
      const report = document.querySelector("section[data-card]")
      const body = report?.querySelector(":scope > div:last-child > div")
      const grid = report?.parentElement
      const tops = grid ? [...grid.children].filter((c) => c.matches("section[data-card]")).map((c) => Math.round(c.getBoundingClientRect().top)) : []
      const axis = chart?.querySelector(".recharts-cartesian-axis-tick-value")
      const tip = chart.querySelector("[data-chart-tooltip]")
      const cross = chart.querySelector("[data-chart-crosshair]")
      const visible = (el) => !!el && +getComputedStyle(el).opacity > 0.5 && getComputedStyle(el).visibility !== "hidden"
      const look = (el) => {
        const s = getComputedStyle(el)
        return [s.backgroundColor, s.borderTop, s.borderRadius, s.padding, s.fontSize, s.boxShadow].join(" | ")
      }
      return {
        card: card?.className.split(/\s+/).filter((c) => /^(bg-|rounded|border|shadow|overflow)/.test(c)).sort().join(" "),
        /* Without the breakpoint a strip turns into columns at: four figures at md, five at lg. */
        tab: tab?.className.split(/\s+/).filter((c) => !/^(md|lg):min-w-0$/.test(c)).join(" "),
        tabH: Math.round(tab?.getBoundingClientRect().height ?? 0),
        chartH: Math.round(chart.getBoundingClientRect().height),
        compared: (chart.querySelector("[data-trend-compared]")?.getAttribute("d") || "").length > 10,
        axisFont: axis ? getComputedStyle(axis).fontSize + " " + axis.getAttribute("fill") : null,
        report: report?.className,
        reportBodyH: Math.round(body?.getBoundingClientRect().height ?? 0),
        reportCols: tops.filter((t) => t === tops[0]).length,
        tip: tip ? look(tip) : null,
        tipShown: visible(tip) && /\d/.test(tip.textContent || ""),
        tipText: tip?.textContent?.trim().slice(0, 80) ?? null,
        crosshair: visible(cross),
        dots: [...chart.querySelectorAll("[data-chart-active-dot]")].filter(visible).length,
      }
    }, cardSel)
    await p.mouse.move(2, 2)
    await p.evaluate(() => document.querySelector(".page-scroll, [data-analytics]")?.scrollIntoView?.({ block: "start" }))
    await p.evaluate(() => window.scrollTo(0, 0))
    return out
  }

  for (const [label, vp] of [
    ["desktop-1440", { width: 1440, height: 900 }],
    ["phone-390", { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }],
  ]) {
    const phone = label.startsWith("phone")
    console.log(`\n${label}: parity with /app Analytics`)
    /* A browser of its own for each width: nothing kept from the other. */
    const ctx = await browser.createBrowserContext()
    const main = await ctx.newPage()
    await main.setViewport(vp)
    await main.goto(`${origin}/?range=last_30_days`, { waitUntil: "load" })
    await sleep(1500)
    const com = await ctx.newPage()
    await com.setViewport(vp)
    const errors = []
    com.on("pageerror", (e) => errors.push(String(e).slice(0, 200)))
    await com.goto(`${origin}/community?case=full&delay=120`, { waitUntil: "load" })
    await sleep(1500)
    expect(errors.length === 0, "the community section renders without an error", errors)
    const a = await parity(main, "[aria-busy]:has([role=tablist][aria-label=Metric])")
    const b = await parity(com, '[data-trend="growth"]')
    expect(a.card === b.card, "the figures' card: the same card", { main: a.card, community: b.card })
    expect(a.tab === b.tab, "a figure tab: the same classes", a.tab === b.tab ? "same" : { main: a.tab, community: b.tab })
    expect(a.tabH === b.tabH, "and as tall", { main: a.tabH, community: b.tabH })
    expect(a.chartH === b.chartH && b.chartH === 200, "the chart: as tall", { main: a.chartH, community: b.chartH })
    expect(a.axisFont === b.axisFont, "the dates written the same way", { main: a.axisFont, community: b.axisFont })
    expect(a.compared && b.compared, "the dashed period before on both", { main: a.compared, community: b.compared })
    expect(!!a.tip && a.tip === b.tip, "the chart's readout is the same element, styled the same", a.tip === b.tip ? a.tip : { main: a.tip, community: b.tip })
    expect(b.tipShown, "the pointer on the community chart raises it, with numbers", b.tipText)
    console.log(`  note  /app Analytics' own readout under the probe's pointer: ${a.tipShown ? "shown" : "not shown (its page, not this section)"}`)
    expect(a.crosshair === b.crosshair && b.crosshair, "with the crosshair", { main: a.crosshair, community: b.crosshair })
    expect(a.dots === b.dots && b.dots >= 2, "and a dot on each line", { main: a.dots, community: b.dots })
    console.log(`  note  readouts: main "${a.tipText}" / community "${b.tipText}"`)
    expect(a.report === b.report, "a report card: the same card", a.report === b.report ? "same" : { main: a.report, community: b.report })
    expect(a.reportBodyH === b.reportBodyH, "its body as tall", { main: a.reportBodyH, community: b.reportBodyH })
    expect(a.reportCols === b.reportCols, "the report grid has as many columns", { main: a.reportCols, community: b.reportCols })
    await main.screenshot({ path: join(shots, `${label}-main.png`), fullPage: !phone })
    await com.screenshot({ path: join(shots, `${label}-community.png`), fullPage: !phone })
    await main.close()

    /* ── Behaviour: the community section ── */
    const frames = async (fn, ms) => {
      await com.evaluate(() => window.__record(true))
      const cls0 = await com.evaluate(() => window.__cls)
      const asks0 = await com.evaluate(() => window.__fetches.length)
      await fn()
      await sleep(ms)
      const fr = await com.evaluate(() => window.__record(false))
      const cls = (await com.evaluate(() => window.__cls)) - cls0
      const fetches = await com.evaluate((n) => window.__fetches.slice(n), asks0)
      const bad = (f) => f.charts.some((c) => c.placeholder || c.empty)
      return {
        frames: fr.length,
        bars: Math.max(0, ...fr.map((f) => f.bars)),
        blurred: Math.max(0, ...fr.map((f) => f.blurred)),
        minDim: Math.min(1, ...fr.map((f) => f.dim)),
        placeholderOrEmpty: fr.filter(bad).length,
        shimmer: Math.max(0, ...fr.map((f) => f.shimmer)),
        cls: +cls.toFixed(4),
        requests: fetches.length,
        aborted: fetches.filter((x) => x.aborted).length,
        last: fr[fr.length - 1],
      }
    }
    const pick = async (row) => {
      await com.click("[data-analytics-controls] button")
      await sleep(phone ? 700 : 350)
      await com.click(`[data-row="${row}"]`)
    }

    console.log(`\n${label}: switching the period, the answer 700ms away`)
    await com.evaluate(() => { window.__delay = 700 })
    const datesBefore = (await com.evaluate(() => window.__frame())).charts[0].dates
    const n0 = await com.evaluate(() => window.__fetches.length)
    const sw = await frames(() => pick("last_7_days"), 1800)
    /* Opening the picker asks for its usual periods ahead; the one chosen is asked once, by whichever got there first. */
    /* Changed on purpose (round 33): a period that runs to now holds a part of today, so its days are counted up (ceil); rounded, the last 7 days read as 6 every morning. */
    const asked = await com.evaluate((n) => window.__fetches.slice(n).map((f) => Math.ceil((Date.parse(new URLSearchParams(f.url).get("end")) - Date.parse(new URLSearchParams(f.url).get("start"))) / 86_400_000)), n0)
    expect(asked.filter((d) => d === 7).length === 1, "the period chosen is asked for once", asked)
    expect(asked.length >= 3, "and opening the picker asked for its usual periods ahead", asked)
    expect(sw.bars === 0, "no progress line in any frame", sw.bars)
    expect(sw.blurred === 0, "nothing blurred in any frame", sw.blurred)
    expect(sw.placeholderOrEmpty === 0, "no frame with a chart back on its placeholder or an empty plot", { frames: sw.frames, bad: sw.placeholderOrEmpty })
    expect(sw.shimmer === 0, "no skeleton in any frame", sw.shimmer)
    expect(sw.cls === 0, "nothing moves", sw.cls)
    expect(sw.minDim === 1, "the period chosen was asked for when the picker opened: nothing dims", sw.minDim)
    expect(sw.last.dim === 1 && sw.last.charts[0].dates !== datesBefore, "and they are clear with the new period's dates once it lands", { dim: sw.last.dim, dates: [datesBefore, sw.last.charts[0].dates] })
    console.log(`  note  requests in the switch, by days: ${JSON.stringify(asked)}, frames sampled ${sw.frames}`)
    await com.screenshot({ path: join(shots, `${label}-community-7d.png`) })

    console.log(`\n${label}: the minute's refresh`)
    await com.evaluate(() => { window.__delay = 300 })
    const mi = await frames(() => com.evaluate(() => window.__tick()), 900)
    expect(mi.requests === 1, "one request", mi.requests)
    expect(mi.bars === 0 && mi.blurred === 0 && mi.minDim === 1, "no bar, no blur, nothing dims", { bars: mi.bars, blurred: mi.blurred, dim: mi.minDim })
    expect(mi.placeholderOrEmpty === 0 && mi.cls === 0, "and nothing moves", { bad: mi.placeholderOrEmpty, cls: mi.cls })

    console.log(`\n${label}: coming back to the section`)
    const re = await frames(() => com.evaluate(() => window.__remount()), 600)
    const first = re.frames ? (await com.evaluate(() => window.__frames ?? []), re) : re
    expect(re.placeholderOrEmpty === 0, "the kept answer is on the first frame: no placeholder, no empty plot", { frames: re.frames, bad: re.placeholderOrEmpty })
    expect(re.requests === 0, "and nothing is asked inside FRESH_MS", re.requests)
    expect(re.bars === 0 && re.blurred === 0 && re.shimmer === 0, "no bar, no blur, no skeleton", { bars: re.bars, blurred: re.blurred, shimmer: first.shimmer })

    console.log(`\n${label}: back to the period seen before`)
    const back = await frames(() => pick("last_30_days"), 700)
    expect(back.requests <= 1, "drawn from what is kept, asked again only once it is over FRESH_MS old", back.requests)
    expect(back.minDim === 1 && back.placeholderOrEmpty === 0 && back.cls === 0, "at once: nothing dims, no empty frame, nothing moves", { dim: back.minDim, bad: back.placeholderOrEmpty, cls: back.cls })

    console.log(`\n${label}: three periods in a row`)
    await com.evaluate(() => { window.__delay = 2500 })
    const quick = await frames(async () => {
      await pick("today")
      await sleep(150)
      await pick("yesterday")
      await sleep(150)
      await pick("month_to_date")
    }, 3200)
    expect(quick.aborted >= 2, "the requests nobody waits for are dropped", { requests: quick.requests, aborted: quick.aborted })
    expect(quick.minDim >= 0.55 && quick.minDim < 1 && quick.last.dim === 1, "a wait over 450ms dims the cards a little, and they clear when it lands", { min: quick.minDim, end: quick.last.dim })
    expect(quick.bars === 0 && quick.blurred === 0 && quick.placeholderOrEmpty === 0, "still no bar, no blur, no empty frame", { bars: quick.bars, blurred: quick.blurred, bad: quick.placeholderOrEmpty })

    console.log(`\n${label}: a period asked ahead`)
    await com.evaluate(() => { window.__delay = 700 })
    const after = await frames(() => pick("last_90_days"), 900)
    expect(after.minDim === 1 && after.placeholderOrEmpty === 0, "is drawn at once: nothing dims, no empty frame", { requests: after.requests, dim: after.minDim, bad: after.placeholderOrEmpty })
    await com.screenshot({ path: join(shots, `${label}-community-90d.png`), fullPage: !phone })
    await ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(`\nscreenshots: ${shots}`)
console.log(broken ? `\n${broken} FAILED` : "\nall measured")
process.exit(broken ? 1 : 0)
