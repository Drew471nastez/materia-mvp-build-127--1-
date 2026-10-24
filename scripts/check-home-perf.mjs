/**
 * ===========================================================================
 *  storelib.com's FRONT PAGE, LOADED FROM A PRODUCTION BUILD, MEASURED
 * ===========================================================================
 * Points headless Chromium at a running `next start` (BASE, default
 * http://127.0.0.1:3000) with the CPU four times slower, at 390 (a phone, 2x)
 * and 1280, three loads each, and reports the median of:
 *
 *   LCP     when the largest paint landed, and what it was
 *   CLS     every layout shift over the first eight seconds, summed
 *   TBT     every long task's time over 50ms, from the first paint to 8s
 *   JS      the scripts the page loaded by 8s: KB over the wire and unpacked
 *   TYPING  the hero heading's letters over the first 8s: the longest gap
 *           between one letter and the next, and how many gaps were more
 *           than twice the usual one (works on the old timer typing, which
 *           marks letters with data-off, and the new frame clock, which sets
 *           their opacity)
 *
 *   BASE=http://127.0.0.1:3000 LABEL=after node scripts/check-home-perf.mjs
 *
 * Numbers only, no pass or fail: it is run against two builds and the two
 * reports are compared (the round's report has both).
 */
import puppeteer from "puppeteer-core"

const BASE = process.env.BASE ?? "http://127.0.0.1:3000"
const LABEL = process.env.LABEL ?? ""
const RUNS = Number(process.env.RUNS ?? 3)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

const OBSERVE = () => {
  const w = window
  w.__lcp = { t: 0, el: "" }
  w.__cls = 0
  w.__long = []
  w.__letters = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lcp = { t: e.startTime, el: e.element ? `${e.element.tagName.toLowerCase()}${e.element.getAttribute("data-hero-line") !== null ? "[data-hero-line]" : ""}${e.element.closest("[data-home-hero] h1") ? " (hero heading)" : e.element.closest("[data-hero-slide]") ? " (hero slide)" : ""} ${e.size}px²` : `(${e.url || "text"})` } }).observe({ type: "largest-contentful-paint", buffered: true })
  w.__shifts = []
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) { w.__cls += e.value; w.__shifts.push(`${e.value.toFixed(4)} at ${Math.round(e.startTime)}ms: ${(e.sources || []).map((s) => s.node ? `${s.node.nodeName.toLowerCase()}.${String(s.node.className || "").slice(0, 50)}` : "?").join(", ")}`) } }).observe({ type: "layout-shift", buffered: true })
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push({ s: e.startTime, d: e.duration }) }).observe({ type: "longtask", buffered: true })
  /* The heading's letters: how many are showing, each time that grows. */
  const count = (line) => {
    const kids = [...line.children]
    if (!kids.length) return 0
    return kids.filter((c) => !c.hasAttribute("data-off") && c.style.opacity !== "0").length
  }
  /* The line being typed is the one marked data-hero-line (one per phrase now; one for all of them before). */
  const watch = () => {
    const box = document.querySelector("[data-hero-typed]")
    if (!box) return void setTimeout(watch, 50)
    const current = () => box.querySelector("[data-hero-line]")
    let last = count(current())
    new MutationObserver(() => {
      const n = count(current())
      if (n === last + 1) w.__letters.push(performance.now())
      else if (n !== last) w.__letters.push(null)
      last = n
    }).observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-off", "style", "data-hero-line"] })
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch)
  else watch()
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
const report = {}
for (const [name, vp] of [["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["1280", { width: 1280, height: 860, deviceScaleFactor: 1 }]]) {
  const runs = []
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    const cdp = await p.createCDPSession()
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await p.setViewport(vp)
    /* REDUCED=1: the same load with reduced motion, so what the hero's motion costs can be told from the rest of the page. */
    if (process.env.REDUCED) await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
    await p.evaluateOnNewDocument(OBSERVE)
    await p.goto(`${BASE}/`, { waitUntil: "load", timeout: 120000 })
    await wait(8000)
    const r = await p.evaluate(() => {
      const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0
      const scripts = performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name))
      const nav = performance.getEntriesByType("navigation")[0]
      const tbt = window.__long.filter((t) => t.s + t.d > fcp && t.s < 8000).reduce((a, t) => a + Math.max(0, t.d - 50), 0)
      const letters = window.__letters
      const gaps = []
      for (let k = 1; k < letters.length; k++) if (letters[k] !== null && letters[k - 1] !== null) gaps.push(letters[k] - letters[k - 1])
      const sorted = [...gaps].sort((a, b) => a - b)
      const usual = sorted[Math.floor(sorted.length / 2)] ?? 0
      return {
        lcp: window.__lcp.t, lcpEl: window.__lcp.el, cls: window.__cls, shifts: window.__shifts, tbt, fcp,
        longest: Math.max(0, ...window.__long.map((t) => t.d)),
        jsWire: scripts.reduce((a, e) => a + (e.transferSize || e.encodedBodySize), 0) / 1024,
        jsBody: scripts.reduce((a, e) => a + e.decodedBodySize, 0) / 1024,
        jsCount: scripts.length,
        html: (nav?.transferSize ?? 0) / 1024,
        letterGaps: gaps.length, usual, worstGap: Math.max(0, ...gaps), stalls: gaps.filter((g) => g > 2 * usual).length,
      }
    })
    runs.push(r)
    await ctx.close()
  }
  const m = (k) => median(runs.map((r) => r[k]))
  report[name] = {
    LCP: `${m("lcp").toFixed(0)}ms (${runs[0].lcpEl})`,
    FCP: `${m("fcp").toFixed(0)}ms`,
    CLS: `${m("cls").toFixed(4)}${runs[0].shifts.length ? ` (first load: ${runs[0].shifts.slice(0, 3).join("; ")})` : ""}`,
    TBT: `${m("tbt").toFixed(0)}ms (longest task ${m("longest").toFixed(0)}ms)`,
    JS: `${m("jsWire").toFixed(0)} KB over the wire, ${m("jsBody").toFixed(0)} KB unpacked, ${m("jsCount")} files`,
    HTML: `${m("html").toFixed(0)} KB`,
    TYPING: `${m("letterGaps")} letter gaps, usual ${m("usual").toFixed(0)}ms, longest ${m("worstGap").toFixed(0)}ms, ${m("stalls")} over twice the usual`,
  }
}
await browser.close()
console.log(`\nstorelib.com front page${LABEL ? `, ${LABEL}` : ""} (${BASE}, CPU 4x slower, median of ${RUNS})`)
for (const [w, r] of Object.entries(report)) {
  console.log(`\n  ${w}px`)
  for (const [k, v] of Object.entries(r)) console.log(`    ${k.padEnd(7)} ${v}`)
}
console.log("")
