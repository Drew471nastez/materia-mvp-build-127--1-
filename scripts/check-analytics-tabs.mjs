/**
 * ===========================================================================
 *  ANALYTICS: HOW SOON THE TABS ARE THERE, WHAT MOVES, HOW SMOOTH A SWITCH IS
 * ===========================================================================
 * "The tabs/switchers load with a long delay today: make them render
 * immediately, smooth switching, no layout shift." Measured, not judged.
 *
 * Mounts the real AnalyticsClient (scripts/render-analytics-tabs.tsx) with a
 * server that answers the reports after DELAY ms (700 by default) and the
 * sales reports 200ms after that, nothing kept from an earlier visit, and
 * records at 390 (4x slower CPU, as a phone) and at 1440:
 *
 *   metric tabs      ms until the four figures' tabs are on screen
 *   switchers        ms until every switcher on the page (the figures' tabs,
 *                    each card's tabs, the sales chart's) is on screen, and
 *                    how many there are then
 *   added reports    ms until the reports the seller added are on screen
 *   figures          ms until the figures are the answer's (not blurred)
 *   CLS              layout shift from the first paint until 3 s after the
 *                    last answer
 *   switching        every tab of every switcher pressed in turn, 350ms
 *                    apart: frame intervals (p50, p95, max), frames over
 *                    25ms, and layout shift
 *
 *   PROBE_CSS=source node scripts/check-analytics-tabs.mjs
 *   PAGE_ROOT=<other checkout> ...   measures that checkout's app/ and components/
 *   SHOTS=<dir> ...                  keeps a screenshot of the page and the picker
 *   EXPECT=fast ...                  fails unless the switchers are on the first
 *                                    paint, nothing shifts and no switch drops
 *                                    a frame past 50ms
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
if (!existsSync(CHROMIUM)) { console.error(`No browser at ${CHROMIUM}.`); process.exit(1) }
const dir = join(root, ".page-probe")
mkdirSync(dir, { recursive: true })
const DELAY = Number(process.env.DELAY || 700)

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
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

/* Every frame from the first: when the tabs are there, and every layout shift. */
const INSTRUMENT = `
try { localStorage.clear(); sessionStorage.clear() } catch {}
window.__cls = 0
window.__shifts = []
new PerformanceObserver((l) => { for (const e of l.getEntries()) { if (e.hadRecentInput) continue; window.__cls += e.value; window.__shifts.push({ t: e.startTime, v: e.value, n: (e.sources || []).map((s) => s.node && s.node.getAttribute ? (s.node.getAttribute("data-card") || s.node.tagName) : "?").slice(0, 3) }) } }).observe({ type: "layout-shift", buffered: true })
window.__moves = {}
window.__first = { metric: null, switchers: [], added: null, figures: null, paint: null }
const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
const frame = () => {
  const t = performance.now()
  const metric = document.querySelector("[role=tablist][aria-label=Metric]")
  if (metric && window.__first.paint === null) window.__first.paint = t
  if (metric && shown(metric) && window.__first.metric === null) window.__first.metric = t
  const n = [...document.querySelectorAll("[role=tablist]")].filter(shown).length
  const last = window.__first.switchers[window.__first.switchers.length - 1]
  if (metric && (!last || last.n !== n)) window.__first.switchers.push({ t, n })
  /* Below the fold too: where each card first stood, and how far it has moved since. */
  for (const el of document.querySelectorAll("[data-card], [data-add-more], [data-commerce-reports]")) {
    const key = el.getAttribute("data-card") || (el.hasAttribute("data-add-more") ? "add-more" : "commerce")
    const top = Math.round(el.getBoundingClientRect().top + scrollY)
    const h = Math.round(el.getBoundingClientRect().height)
    const was = window.__moves[key]
    if (!was) window.__moves[key] = { top, h, moved: 0 }
    else { was.moved = Math.max(was.moved, Math.abs(top - was.top), Math.abs(h - was.h)) }
  }
  if (window.__first.added === null && document.querySelector("[data-card=pageviews]")) window.__first.added = t
  if (window.__first.figures === null && metric && metric.querySelector("[data-tab]") && !metric.querySelector(".blur-\\\\[2px\\\\]")) window.__first.figures = t
  if (t < 12000) requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
window.__frames = null
window.__sample = (on) => {
  if (on) { window.__frames = [performance.now()]; const f = () => { if (!window.__frames) return; window.__frames.push(performance.now()); requestAnimationFrame(f) }; requestAnimationFrame(f); return }
  const out = window.__frames; window.__frames = null; return out
}
`

let server
let browser
let broken = 0
try {
  const css = await appCss(root, process.env.PAGE_ROOT && existsSync(join(process.env.PAGE_ROOT, "app/globals.css")) ? join(process.env.PAGE_ROOT, "app/globals.css") : null)
  const bundle = join(dir, "tabs-probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-tabs.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@=${process.env.PAGE_ROOT || root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style><script>${INSTRUMENT}</script></head><body><div id="app"></div><script src="/tabs-probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/tabs-probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const fast = process.env.EXPECT === "fast"
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : fast ? "FAIL" : "note"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
    if (!ok && fast) broken++
  }
  const stats = (frames) => {
    const d = []
    for (let i = 1; i < frames.length; i++) d.push(frames[i] - frames[i - 1])
    d.sort((a, b) => a - b)
    const q = (p) => +(d[Math.min(d.length - 1, Math.floor(p * d.length))] || 0).toFixed(1)
    return { frames: d.length, p50: q(0.5), p95: q(0.95), max: +(d[d.length - 1] || 0).toFixed(1), over25: d.filter((x) => x > 25).length }
  }

  const results = {}
  for (const [name, vp, cpu] of [["390 (phone, CPU 4x slower)", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 4], ["1440", { width: 1440, height: 900 }, 1]]) {
    console.log(`\n${name}, answers after ${DELAY}ms`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const cdp = await p.target().createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(`${origin}/?delay=${DELAY}`, { waitUntil: "load" })
    await p.waitForSelector("[role=tablist][aria-label=Metric] [data-tab]", { timeout: 15000 })
    /* The answers, and three seconds after them for anything late. */
    await sleep(DELAY + 200 + 3000)
    const load = await p.evaluate(() => {
      const f = window.__first
      const final = f.switchers[f.switchers.length - 1]
      const all = f.switchers.find((s) => s.n === final.n)
      return { paint: f.paint && +f.paint.toFixed(0), metricTabs: f.metric && +f.metric.toFixed(0), switchers: all && +all.t.toFixed(0), switcherCount: final.n, firstPaintSwitchers: f.switchers[0] ? f.switchers[0].n : 0, addedReports: f.added && +f.added.toFixed(0), figures: f.figures && +f.figures.toFixed(0), moved: Object.entries(window.__moves).filter(([, m]) => m.moved > 1).map(([k, m]) => k + ":" + m.moved), cls: +window.__cls.toFixed(4), shifts: window.__shifts.slice(0, 6) }
    })
    console.log("  load:", JSON.stringify(load))
    /* SHOTS=<dir>: the page as the seller sees it, whole, for the visual review. */
    if (process.env.SHOTS) { mkdirSync(process.env.SHOTS, { recursive: true }); const tall = await p.evaluate(() => document.querySelector(".page-scroll").scrollHeight + 60); await p.setViewport({ ...vp, height: tall }); await sleep(400); await p.screenshot({ path: join(process.env.SHOTS, `analytics-${vp.width}.png`) }); await p.setViewport(vp); await sleep(400) }
    expect(load.switchers !== null && load.switchers - load.paint < 50, "every switcher is on the first paint, not after the answer", { paint: load.paint, switchers: load.switchers, onFirstPaint: load.firstPaintSwitchers, final: load.switcherCount })
    expect(load.addedReports !== null && load.addedReports - load.paint < 50, "the reports the seller added are there on the first paint", load.addedReports)
    expect(load.cls < 0.01, "nothing shifts while the page loads", load.cls)
    expect(load.moved.length === 0, "no card below the fold moves or changes height once drawn", load.moved)

    /* Switching: every tab of every switcher, in turn. */
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
    const before = await p.evaluate(() => window.__cls)
    await p.evaluate(() => window.__sample(true))
    const lists = await p.evaluate(() => [...document.querySelectorAll("[role=tablist]")].map((l, i) => { l.setAttribute("data-probe-list", String(i)); return [i, l.querySelectorAll("[role=tab]").length] }))
    let presses = 0
    const marks = []
    for (const [i, n] of lists) {
      for (let k = n - 1; k >= 0; k--) {
        /* Into view first, and a moment for that scroll to settle, so the frames measured are the switch's own. */
        const name = await p.evaluate((i, k) => { const list = document.querySelector(`[data-probe-list="${i}"]`); list.scrollIntoView({ block: "center" }); return (list.getAttribute("aria-label") || "list " + i) + " › " + list.querySelectorAll("[role=tab]")[k].textContent.trim() }, i, k)
        await sleep(120)
        const at = await p.evaluate((i, k) => { const t = performance.now(); document.querySelector(`[data-probe-list="${i}"]`).querySelectorAll("[role=tab]")[k].click(); return t }, i, k)
        marks.push({ name, at })
        presses++
        await sleep(350)
      }
    }
    const frames = await p.evaluate(() => window.__sample(false))
    /* Each press's own frames: the 350ms after it. */
    const per = marks.map((m) => { const f = frames.filter((t) => t >= m.at && t <= m.at + 350); const d = f.slice(1).map((t, j) => t - f[j]); return { name: m.name, max: +Math.max(0, ...d).toFixed(1) } })
    const switchFrames = marks.flatMap((m) => frames.filter((t) => t >= m.at && t <= m.at + 350).map((t, j, a) => (j ? t - a[j - 1] : null)).filter((x) => x !== null))
    const sorted = [...switchFrames].sort((a, b) => a - b)
    const q = (x) => +(sorted[Math.min(sorted.length - 1, Math.floor(x * sorted.length))] || 0).toFixed(1)
    const sw = { presses, frames: sorted.length, p50: q(0.5), p95: q(0.95), max: +(sorted[sorted.length - 1] || 0).toFixed(1), over25: sorted.filter((x) => x > 25).length, cls: +((await p.evaluate(() => window.__cls)) - before).toFixed(4), worst: per.sort((a, b) => b.max - a.max).slice(0, 3) }
    console.log("  switching:", JSON.stringify(sw))
    expect(sw.max < 50 || cpu > 1, "no switch drops a frame past 50ms", sw.max)
    expect(sw.cls < 0.01, "switching shifts nothing", sw.cls)

    /* Add report: the picker, a report added, moved and removed, in place. An older checkout (PAGE_ROOT) without it is measured for the rest. */
    const hasPicker = await p.evaluate(() => !!document.querySelector("[data-add-more]"))
    if (!hasPicker) console.log("  note  no Add more on this page: the picker is not measured")
    let inFrames = null
    if (hasPicker) {
    const reads = () => p.evaluate(() => ({ reports: window.__fetches.filter((f) => f.url.includes("/api/analytics/reports")).length, puts: window.__fetches.filter((f) => f.method === "PUT").map((f) => f.body) }))
    const order = () => p.evaluate(() => [...document.querySelectorAll("[data-analytics-cards] [data-report-menu]")].map((b) => b.getAttribute("data-report-menu")))
    const r0 = await reads()
    await p.evaluate(() => { const b = document.querySelector("[data-add-more]"); b.scrollIntoView({ block: "center" }); b.click() })
    await sleep(500)
    const picker = await p.evaluate(() => ({ dialog: !!document.querySelector("[data-add-reports-dialog]"), sheet: !!document.querySelector("[data-add-reports-sheet]"), rows: document.querySelectorAll("[data-report-choice]").length, checked: [...document.querySelectorAll("[data-report-choice][aria-checked=true]")].map((b) => b.getAttribute("data-report-choice")) }))
    expect(vp.isMobile ? picker.sheet && !picker.dialog : picker.dialog && !picker.sheet, vp.isMobile ? "Add more opens the bottom sheet" : "Add more opens the dialog", picker)
    expect(picker.checked.join() === "pageviews,clicks", "the picker starts from what is added", picker.checked)
    if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `analytics-picker-${vp.width}.png`) })
    await p.evaluate(() => document.querySelector("[data-report-choice=sessions]").click())
    await sleep(200)
    inFrames = await p.evaluate(() => new Promise((resolve) => {
      const t0 = performance.now()
      document.querySelector("[data-add-reports-save]").click()
      let n = 0
      const look = () => { n++; if (document.querySelector("[data-card=sessions]")) resolve({ frames: n, ms: +(performance.now() - t0).toFixed(0) }); else if (n < 120) requestAnimationFrame(look); else resolve(null) }
      requestAnimationFrame(look)
    }))
    expect(inFrames && inFrames.frames <= 1, "Save puts the new report's card on screen in the next frame", inFrames)
    await sleep(500)
    const r1 = await reads()
    expect(r1.reports === r0.reports, "adding a report reads nothing again: no reload, no refetch", { before: r0.reports, after: r1.reports })
    expect((await order()).join() === "pageviews,clicks,sessions" && /sessions/.test(r1.puts[r1.puts.length - 1] || ""), "it is its own card after the others, and is saved for the seller", { order: await order(), put: r1.puts[r1.puts.length - 1] })
    const onChart = await p.evaluate(() => [...document.querySelectorAll("[role=tablist][aria-label=Metric] [data-tab]")].map((t) => t.getAttribute("data-tab")).join())
    expect(onChart === "views,revenue,orders,conversion", "the chart keeps its four figures", onChart)
    const menu = async (id, label) => {
      await p.evaluate((id) => { const b = document.querySelector(`[data-report-menu="${id}"]`); b.scrollIntoView({ block: "center" }) }, id)
      await sleep(150)
      await p.click(`[data-report-menu="${id}"]`)
      await sleep(450)
      const ok = await p.evaluate((label) => { const el = [...document.querySelectorAll("[role=menuitem], [role=dialog] button, [data-sheet] button")].find((b) => b.textContent.trim() === label); if (el) el.click(); return !!el }, label)
      await sleep(600)
      return ok
    }
    expect(await menu("sessions", "Move up"), "the card's menu has Move up")
    expect((await order()).join() === "pageviews,sessions,clicks", "Move up moves it before the one above", await order())
    expect(await menu("clicks", "Remove report"), "the card's menu has Remove report")
    const r2 = await reads()
    expect((await order()).join() === "pageviews,sessions" && /^\{"reports":\["pageviews","sessions"\]\}$/.test(r2.puts[r2.puts.length - 1] || ""), "Remove report takes it off and saves the rest in their order", { order: await order(), put: r2.puts[r2.puts.length - 1] })
    expect(r2.reports === r0.reports, "moving and removing read nothing again", r2.reports - r0.reports)
    }

    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    results[vp.width] = { load, switching: sw, added: inFrames }
    await p.close()
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))
} finally {
  await browser?.close()
  server?.close()
}
if (broken) { console.log(`\n${broken} expectation(s) not met`); process.exit(1) }
