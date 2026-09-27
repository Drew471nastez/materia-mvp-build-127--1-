/**
 * ===========================================================================
 *  THE ANALYTICS PAGE, LOADED AND USED, WITH EVERY FLASH COUNTED
 * ===========================================================================
 * "There is a really weird reload and refresh thing happening. Ensure
 * analytics loads well, smooth and clean: no flashes, no glitches, no loops,
 * nothing interfering with the chart lines when I switch between Views,
 * Revenue, Conversion."
 *
 * Mounts the real AnalyticsClient (scripts/render-analytics-page.tsx, the
 * network answered from fixtures after a short delay) and does what a
 * creator does, recording for each step:
 *
 *   requests      reads of /api/analytics/reports
 *   router        replace / refresh / push asked of Next's router, each of
 *                 which is a server round trip in the real app and remounts
 *                 the page under its loading skeleton
 *   svg mounts    new chart drawings: a remount, not a morph
 *   placeholders  times the chart went back to its grey placeholder
 *   skeletons     skeleton blocks put on screen in the report cards
 *   softened      times the chart, the figures or the cards went soft
 *   layout shift  CLS during the step
 *   line          frames in which the chart's line moved, whether it was on
 *                 screen in every frame, and for a tab tapped mid morph, how
 *                 far the line jumped in the frame after the tap against the
 *                 largest step of an ordinary morph frame
 *
 * Then, at 390 and 1280, the page as the creator reads it: the property
 * filter beside the date range (a sheet on a phone, a popover otherwise, and
 * nothing for a creator with one place), every card in its order with no
 * text or box out of its card and no sideways scroll, the filter read from
 * the address (?property=, and the old ?mode=onepage), each card's empty
 * state, and the Website and OnePage summary lines. SHOTS=<dir> keeps a
 * screenshot of each, named analytics-*.
 *
 *   node scripts/check-analytics-page.mjs
 *   EXPECT=clean node scripts/check-analytics-page.mjs   (fails on any spurious one)
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
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
const dir = join(root, ".page-probe")
mkdirSync(dir, { recursive: true })

writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}
export function isNativeApp() { return false }
export async function triggerHaptic() {}
export function openExternal() {}
export function nativePlatform() { return "web" }
export function shareNative() { return Promise.resolve(false) }
`)
/* Next's router, recording what it is asked; the address is the search params. */
writeFileSync(join(dir, "next-navigation.js"), `
const nav = () => (globalThis.__nav = globalThis.__nav || [])
const router = {
  replace: (u) => { nav().push(["replace", String(u)]) },
  push: (u) => { nav().push(["push", String(u)]) },
  refresh: () => { nav().push(["refresh"]) },
  back: () => {}, forward: () => {}, prefetch: () => {},
}
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"
export default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }
`)

const INSTRUMENT = `
window.__cls = 0
window.__shifted = []
const name = (n) => !n || !n.tagName ? String(n && n.nodeName) : n.tagName.toLowerCase() + (n.getAttribute("data-tab") ? "[data-tab=" + n.getAttribute("data-tab") + "]" : "") + (n.className && typeof n.className === "string" ? "." + n.className.trim().split(/\\s+/).slice(0, 3).join(".") : "") + (n.textContent ? " '" + n.textContent.trim().slice(0, 24) + "'" : "")
new PerformanceObserver((l) => {
  for (const e of l.getEntries()) {
    if (e.hadRecentInput) continue
    window.__cls += e.value
    for (const s of e.sources || []) window.__shifted.push(name(s.node))
  }
}).observe({ type: "layout-shift", buffered: true })
window.__ev = { svgMounts: 0, placeholders: 0, skeletons: 0, softChart: 0, softFigures: 0, softReports: 0 }
const seen = new WeakSet()
const scan = (node) => {
  if (!(node instanceof Element)) return
  const svgs = node.matches(".recharts-surface") ? [node] : node.querySelectorAll(".recharts-surface")
  for (const s of svgs) if (!seen.has(s) && s.closest("[data-chart-loading]")) { seen.add(s); window.__ev.svgMounts++ }
  window.__ev.skeletons += (node.matches(".animate-pulse") ? 1 : 0) + node.querySelectorAll(".animate-pulse").length
  if (node.matches("[data-chart-loading='true']") || node.querySelector("[data-chart-loading='true']")) window.__ev.placeholders++
}
const has = (el, a, b) => el.classList && el.classList.contains(a) && (!b || el.classList.contains(b))
new MutationObserver((list) => {
  for (const m of list) {
    if (m.type === "childList") { m.addedNodes.forEach(scan); continue }
    const el = m.target
    if (m.attributeName === "data-chart-loading" && el.getAttribute("data-chart-loading") === "true") window.__ev.placeholders++
    if (m.attributeName !== "class") continue
    const was = m.oldValue || ""
    if (has(el, "opacity-40", "blur-[1.5px]") && !/opacity-40/.test(was)) window.__ev.softChart++
    if (has(el, "blur-[2px]") && !/blur-\\[2px\\]/.test(was)) window.__ev.softFigures++
    if (has(el, "opacity-60", "blur-[0.5px]") && !/opacity-60/.test(was)) window.__ev.softReports++
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "data-chart-loading"] })

/* The chart's line, every frame: its points, read from the path recharts draws. */
window.__line = () => {
  const p = document.querySelector("[data-chart-loading] [data-trend-line]")
  if (!p) return null
  const d = p.getAttribute("d") || ""
  const pts = []
  const re = /([MLC])([^MLCZ]*)/g
  let m
  while ((m = re.exec(d))) {
    const n = (m[2].match(/-?\\d*\\.?\\d+(?:e-?\\d+)?/g) || []).map(Number)
    if (m[1] === "C") for (let i = 0; i + 5 < n.length; i += 6) pts.push([n[i + 4], n[i + 5]])
    else for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]])
  }
  return pts
}
window.__frames = []
let run = 0
const tick = (mine) => () => {
  if (mine !== run) return
  window.__frames.push({ t: performance.now(), pts: window.__line() })
  requestAnimationFrame(tick(mine))
}
window.__sample = (on) => { run++; if (on) { window.__frames = []; requestAnimationFrame(tick(run)) } else return window.__frames }
`

let server
let browser
let broken = 0
try {
  /* With PAGE_ROOT, that checkout's stylesheet too, so its motion is its own. */
  const css = await appCss(root, process.env.PAGE_ROOT && existsSync(join(process.env.PAGE_ROOT, "app/globals.css")) ? join(process.env.PAGE_ROOT, "app/globals.css") : null)
  const bundle = join(dir, "probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-page.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    /* PAGE_ROOT: another checkout of app/ and components/, to measure a version against this one. */
    `--alias:@=${process.env.PAGE_ROOT || root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0}</style><script>${INSTRUMENT}</script></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const clean = process.env.EXPECT === "clean"
  const expect = (ok, what, got) => {
    console.log(`  ${ok ? "ok  " : (clean ? "FAIL" : "note")}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
    if (!ok && clean) broken++
  }

  const state = (p) => p.evaluate(() => ({ ...window.__ev, requests: window.__fetches.length, router: (window.__nav || []).length, cls: +window.__cls.toFixed(4), shifted: window.__shifted.length }))
  /** What moved, when something did: the nodes the layout shifts name. */
  const why = (p, before) => p.evaluate((n) => [...new Set(window.__shifted.slice(n))].slice(0, 6), before.shifted)
  const delta = (a, b) => Object.fromEntries(Object.keys(b).map((k) => [k, +(b[k] - a[k]).toFixed(4)]))
  const clickTab = (p, tab) => p.evaluate((t) => document.querySelector(`[role=tablist][aria-label=Metric] [data-tab="${t}"]`).click(), tab)

  /** How a stretch of frames moved the line. */
  function lineOf(frames, splitAt = null) {
    const moves = []
    let missing = 0
    for (let i = 1; i < frames.length; i++) {
      const a = frames[i - 1].pts, b = frames[i].pts
      if (!b || b.length === 0) { missing++; continue }
      if (!a || a.length !== b.length) { moves.push({ t: frames[i].t, step: null }); continue }
      let step = 0
      for (let k = 0; k < a.length; k++) step = Math.max(step, Math.abs(a[k][1] - b[k][1]), Math.abs(a[k][0] - b[k][0]))
      moves.push({ t: frames[i].t, step })
    }
    const moving = moves.filter((m) => m.step === null || m.step > 0.05).length
    const out = { frames: frames.length, moving, missing }
    if (splitAt !== null) {
      const after = moves.find((m) => m.t > splitAt)
      const before = moves.filter((m) => m.t <= splitAt && m.step !== null)
      out.jumpAtRetap = after ? after.step : null
      out.largestOrdinaryStep = before.length ? +Math.max(...before.map((m) => m.step)).toFixed(1) : null
      if (out.jumpAtRetap !== null) out.jumpAtRetap = +out.jumpAtRetap.toFixed(1)
    }
    return out
  }

  for (const [name, vp] of [["desktop, 1280 wide", { width: 1280, height: 900 }], ["phone, 390 wide", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    console.log(`\n${name}`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(origin, { waitUntil: "load" })
    await p.waitForSelector("[data-chart-loading='false'] .recharts-surface", { timeout: 15000 })
    await sleep(1200)

    /* 1. The first load. */
    const load = await state(p)
    console.log("  load:", JSON.stringify(load))
    expect(load.requests === 1, "one read of the reports on load", load.requests)
    expect(load.svgMounts === 1, "the chart is drawn once, not drawn and drawn again", load.svgMounts)
    expect(load.placeholders <= 1, "the placeholder shows at most once, before the first answer", load.placeholders)
    expect(load.cls < 0.001, "nothing shifts while the page loads", load.cls)
    expect(load.router === 0, "loading asks nothing of the router", load.router)
    const wide = await p.evaluate(() => document.documentElement.scrollWidth)
    expect(wide <= vp.width, "no sideways scroll", wide)
    /* The four figures: one row everywhere; on a phone it scrolls sideways, like the home page's. */
    const strip = await p.evaluate(() => {
      const row = document.querySelector("[role=tablist][aria-label=Metric]")
      const tops = [...row.querySelectorAll("[data-tab]")].map((b) => Math.round(b.getBoundingClientRect().top))
      return { tops: [...new Set(tops)].length, scrolls: row.scrollWidth > row.clientWidth + 1, overflowX: getComputedStyle(row).overflowX }
    })
    expect(strip.tops === 1, "the four figures are one row", JSON.stringify(strip))
    if (vp.isMobile) expect(strip.scrolls && strip.overflowX === "auto", "which scrolls sideways on a phone", JSON.stringify(strip))

    /* 2. Each tab, one after another: a morph of the line and nothing else. */
    for (const tab of ["revenue", "orders", "conversion", "views"]) {
      const before = await state(p)
      await p.evaluate(() => window.__sample(true))
      await clickTab(p, tab)
      await sleep(900)
      const frames = await p.evaluate(() => window.__sample(false))
      const d = delta(before, await state(p))
      const line = lineOf(frames)
      console.log(`  tab ${tab}:`, JSON.stringify({ ...d, line }))
      expect(d.requests === 0 && d.router === 0, `${tab}: asks the server nothing`, d.requests)
      expect(d.svgMounts === 0 && d.placeholders === 0 && d.skeletons === 0, `${tab}: no remount, no placeholder, no skeleton`, [d.svgMounts, d.placeholders, d.skeletons])
      expect(d.softChart === 0 && d.softFigures === 0 && d.softReports === 0, `${tab}: nothing goes soft`, [d.softChart, d.softFigures, d.softReports])
      expect(line.missing === 0 && line.moving >= 20, `${tab}: the line is on screen every frame and moves over at least 20 of them`, line)
      expect(d.cls < 0.001, `${tab}: no layout shift`, d.cls)
    }

    /* 3. A tab tapped while the last one is still moving. */
    {
      await clickTab(p, "views")
      await sleep(900)
      await p.evaluate(() => window.__sample(true))
      await clickTab(p, "revenue")
      await sleep(200)
      const at = await p.evaluate(() => performance.now())
      await clickTab(p, "orders")
      await sleep(900)
      const frames = await p.evaluate(() => window.__sample(false))
      const line = lineOf(frames, at)
      console.log("  tab tapped mid morph:", JSON.stringify(line))
      expect(line.missing === 0, "a second tap mid morph never takes the line off screen", line.missing)
      expect(line.jumpAtRetap !== null && line.largestOrdinaryStep !== null && line.jumpAtRetap <= line.largestOrdinaryStep * 1.25 + 1,
        "a second tap mid morph carries on from where the line is, instead of jumping", { jump: line.jumpAtRetap, ordinary: line.largestOrdinaryStep })
      await clickTab(p, "views")
      await sleep(900)
    }

    /* 4. The minute: the same question asked again, in the background. */
    {
      const before = await state(p)
      await p.evaluate(() => window.__tick && window.__tick())
      await sleep(900)
      const d = delta(before, await state(p))
      console.log("  minute refresh:", JSON.stringify(d))
      expect(d.requests === 1, "the minute asks once", d.requests)
      expect(d.softChart === 0 && d.softFigures === 0 && d.softReports === 0, "and nothing on screen goes soft for it", [d.softChart, d.softFigures, d.softReports])
      expect(d.svgMounts === 0 && d.placeholders === 0 && d.skeletons === 0 && d.cls < 0.001, "no remount, no placeholder, no skeleton, no shift", [d.svgMounts, d.placeholders, d.skeletons, d.cls])
    }

    /* 5. Another period, from the picker. */
    {
      const before = await state(p)
      await p.evaluate(() => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => /Last 7 days/.test(b.textContent)).click())
      await sleep(450)
      await p.evaluate(() => document.querySelector('[data-row="last_30_days"]').click())
      await sleep(1400)
      const d = delta(before, await state(p))
      console.log("  period:", JSON.stringify(d), d.cls > 0 ? JSON.stringify(await why(p, before)) : "")
      expect(d.requests === 1 && d.router === 0, "a new period is one read, and no navigation", [d.requests, d.router])
      expect(d.svgMounts === 0 && d.placeholders === 0, "the chart morphs to it: no remount, no placeholder", [d.svgMounts, d.placeholders])
      expect(d.skeletons === 0, "the cards keep their figures, softened, instead of skeletons", d.skeletons)
      /* A new period brings new numbers, and a number that is wider or narrower moves the text beside it. Nothing else may move. */
      expect(d.cls < 0.005, "nothing moves but text the new numbers change the width of", d.cls)
    }

    /*
      6. THE PROPERTY FILTER, beside the date range: the OnePage and back to
      All pages. The choice is written to the address (?property=) without a
      navigation, the chart morphs, and All's answer from seconds ago is kept.
    */
    for (const [row, param] of [["onepage", "onepage"], ["all", null]]) {
      const before = await state(p)
      await p.evaluate(() => document.querySelector("button[data-property-picker]").click())
      await sleep(500)
      await p.evaluate((r) => document.querySelector(`[data-property-list] [data-row="${r}"]`).click(), row)
      await sleep(1400)
      const d = delta(before, await state(p))
      const after = await p.evaluate(() => ({ param: new URL(location.href).searchParams.get("property"), label: document.querySelector("button[data-property-picker]").textContent.trim(), asked: (window.__fetches.at(-1) || {}).url || "", open: !!document.querySelector("[data-property-list]") }))
      console.log(`  property ${row}:`, JSON.stringify({ ...d, ...after, asked: undefined }), d.cls > 0 ? JSON.stringify(await why(p, before)) : "")
      expect(after.param === param && !after.open, `${row}: the address says ?property=${param ?? "(none)"} and the list is closed`, after)
      expect(after.label === (row === "all" ? "All pages" : "OnePage"), `${row}: the button names it`, after.label)
      expect(d.router === 0, `${row}: no navigation, which would reload the page under its skeleton`, d.router)
      /* Back to All within seconds: its answer is kept and fresh (lib/analytics/report-cache), so nothing is asked. */
      const reads = row === "all" ? 0 : 1
      expect(d.requests === reads && (reads === 0 || /[?&]property=onepage/.test(after.asked)), `${row}: ${reads ? "one read, for the OnePage" : "no read: the answer from seconds ago is kept"}`, d.requests)
      expect(d.svgMounts === 0 && d.placeholders === 0, `${row}: the chart morphs, it is not redrawn from nothing`, [d.svgMounts, d.placeholders])
      expect(d.skeletons === 0, `${row}: no skeleton flashes in the cards on a quick answer`, d.skeletons)
      expect(d.cls < 0.005, `${row}: nothing moves but text the new numbers change the width of`, d.cls)
      if (row === "onepage") {
        const title = await p.evaluate(() => document.querySelector('[data-card="pages"] h3')?.textContent)
        expect(title === "Top links", "the OnePage's second card is its most clicked links", title)
      }
    }

    /*
      10. A SLOW ANSWER SAYS SO. "It takes too much to load the data in
      analytics, without showing some feedback to the user." A new period
      whose answer takes 4.2s: nothing extra for the first 300ms, then the
      slim progress line along the top of the figures' card, running; the
      figures stay on screen, blurred; at 2.5s a quiet line over the chart,
      Counting visits for this range, that moves nothing; when the answer
      lands the note goes and the line runs to the end and fades. Every
      frame is read. A quick answer, and the minute's refresh, show neither.
    */
    {
      const sampleWait = async (pick, ms, delay) => {
        await p.evaluate((d, ms) => { window.__delay = d; window.__waitMs = ms }, delay, ms)
        await p.evaluate(() => {
          window.__waitFrames = []
          const t0 = performance.now()
          window.__waitT0 = t0
          const tick = () => {
            const line = document.querySelector("[data-loading-line]")
            const note = document.querySelector("[data-counting-note]")
            const cs = line ? getComputedStyle(line) : null
            window.__waitFrames.push({
              t: Math.round(performance.now() - t0),
              line: cs ? +Number(cs.opacity).toFixed(2) : null,
              scale: cs && cs.transform !== "none" ? +new DOMMatrixReadOnly(cs.transform).a.toFixed(3) : 0,
              note: note ? +Number(getComputedStyle(note).opacity).toFixed(2) : null,
              noteText: note ? note.textContent.trim() : null,
              soft: document.querySelectorAll("[role=tablist][aria-label=Metric] .blur-\\[2px\\]").length,
            })
            if (performance.now() - t0 < window.__waitMs) requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        })
        await pick()
        await sleep(ms + 200)
        await p.evaluate(() => { window.__delay = 120 })
        return p.evaluate(() => window.__waitFrames)
      }
      const choose = (from, to) => async () => {
        await p.evaluate((re) => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => new RegExp(re).test(b.textContent)).click(), from)
        await sleep(450)
        await p.evaluate((row) => document.querySelector(`[data-row="${row}"]`).click(), to)
      }
      const before = await state(p)
      /* The picker's own sheet or popover takes 450ms to open; the wait is timed from the pick. */
      const frames = await sampleWait(choose("Last 30 days", "last_12_months"), 5600, 4200)
      const pickedAt = frames.find((f) => f.soft > 0)?.t ?? 0
      const at = (ms) => frames.filter((f) => f.t >= pickedAt + ms)[0] || {}
      const lineOnAt = frames.find((f) => f.t >= pickedAt && f.line > 0.5)?.t
      const noteOnAt = frames.find((f) => f.t >= pickedAt && f.note > 0.5)?.t
      const landed = frames.find((f) => f.t > pickedAt + 300 && f.soft === 0)?.t
      const after = landed ? frames.filter((f) => f.t > landed) : []
      const lineGoneAt = after.find((f) => f.line === 0)?.t
      const running = frames.filter((f) => f.t > (lineOnAt ?? Infinity) && f.t < (landed ?? 0)).map((f) => f.scale)
      const d = delta(before, await state(p))
      /* What moved while it waited, if anything did: never the line or the note, which lie over the page. */
      const moved = await why(p, before)
      const slow = {
        lineOnAfter: lineOnAt !== undefined ? lineOnAt - pickedAt : null, noteOnAfter: noteOnAt !== undefined ? noteOnAt - pickedAt : null, landedAfter: landed !== undefined ? landed - pickedAt : null,
        lineGoneAfterLanding: lineGoneAt !== undefined && landed !== undefined ? lineGoneAt - landed : null, noteAfterLanding: after.filter((f) => f.note !== null).length,
        scale: running.length ? [running[0], running[Math.floor(running.length / 2)], running[running.length - 1]] : [], text: frames.find((f) => f.noteText)?.noteText, blurredWhileWaiting: at(1000).soft, cls: d.cls, moved,
      }
      console.log("  a slow answer:", JSON.stringify(slow))
      expect(slow.lineOnAfter !== null && slow.lineOnAfter >= 280 && slow.lineOnAfter <= 480, "nothing for the first 300ms, then the slim line along the top of the figures", slow.lineOnAfter)
      expect(running.length > 20 && running.every((x, i) => i === 0 || x >= running[i - 1] - 0.001) && running[running.length - 1] <= 0.9 && running[running.length - 1] > 0.6, "it runs forward and never past 90% while it waits", slow.scale)
      expect(slow.blurredWhileWaiting === 4, "the figures stay on screen, blurred, while it waits", slow.blurredWhileWaiting)
      expect(slow.noteOnAfter !== null && slow.noteOnAfter >= 2450 && slow.noteOnAfter <= 2900 && slow.text === "Counting visits for this range", "after 2.5s a quiet line over the chart: Counting visits for this range", [slow.noteOnAfter, slow.text])
      expect(slow.landedAfter !== null && slow.noteAfterLanding === 0, "gone the moment the figures land", slow.noteAfterLanding)
      expect(slow.lineGoneAfterLanding !== null && slow.lineGoneAfterLanding >= 150 && slow.lineGoneAfterLanding <= 700, "and the line runs to the end and fades", slow.lineGoneAfterLanding)
      expect(!moved.some((m) => /counting|loading-line|Counting visits/i.test(m)), "neither the line nor the note moves anything: both lie over the page", moved)
      const layers = await p.evaluate(() => [document.querySelector("[data-loading-line]"), document.querySelector("[data-counting-note]")].filter(Boolean).map((el) => getComputedStyle(el).position))
      expect(layers.length >= 1 && layers.every((x) => x === "absolute"), "they are drawn out of the page's flow", layers)
      if (process.env.SHOTS) {
        /* The same wait again, stopped at three seconds, for the eye. */
        await p.evaluate(() => { window.__delay = 4200 })
        await choose("Last 12 months", "month_to_date")()
        await sleep(3200)
        mkdirSync(process.env.SHOTS, { recursive: true })
        await p.screenshot({ path: join(process.env.SHOTS, `analytics-counting-${vp.hasTouch ? "phone" : "desktop"}.png`) })
        await sleep(1600)
        await p.evaluate(() => { window.__delay = 120 })
      }
      /* A quick answer: neither. */
      const quick = await sampleWait(choose(process.env.SHOTS ? "Month to date" : "Last 12 months", "last_30_days"), 1200, 120)
      expect(quick.every((f) => !f.line) && quick.every((f) => !f.note), "a quick answer draws neither the line nor the note", { line: Math.max(...quick.map((f) => f.line || 0)), note: quick.some((f) => f.note) })
      /* The minute: neither. */
      const minute = await sampleWait(() => p.evaluate(() => window.__tick && window.__tick()), 1200, 900)
      expect(minute.every((f) => !f.line) && minute.every((f) => !f.note), "the minute's refresh draws neither", { line: Math.max(...minute.map((f) => f.line || 0)), note: minute.some((f) => f.note) })
    }

    /*
      8. FIGURES FIRST. "It takes too long, and it gives users the idea that
      it's not loading." The server sends the figures as soon as it has
      counted them and the lists after (app/api/analytics/reports stream=1).
      A new period with the lists a second behind: the four figures and the
      chart are the new ones and sharp within a moment, the list cards keep
      the last ones softened rather than dropping to shapes, and then fill in.
    */
    {
      await p.evaluate(() => { window.__listsDelay = 1200 })
      const before = await state(p)
      await p.evaluate(() => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => /Last 30 days/.test(b.textContent)).click())
      await sleep(450)
      await p.evaluate(() => document.querySelector('[data-row="last_90_days"]').click())
      await sleep(700)
      const mid = await p.evaluate(() => ({
        figuresSoft: document.querySelectorAll("[role=tablist][aria-label=Metric] .blur-\\[2px\\]").length,
        chartSoft: !!document.querySelector(".opacity-40.blur-\\[1\\.5px\\]"),
        listsSoft: document.querySelector("[data-analytics-cards]").classList.contains("opacity-60") ? document.querySelectorAll("section[data-card]").length : 0,
        cards: document.querySelectorAll("section[data-card]").length,
        shapes: document.querySelectorAll("section [data-shimmer]").length,
        views: document.querySelector('[data-tab="views"]').textContent,
      }))
      await sleep(1500)
      const end = await p.evaluate(() => ({
        listsSoft: document.querySelector("[data-analytics-cards]").classList.contains("opacity-60") ? 1 : 0,
        shapes: document.querySelectorAll("section [data-shimmer]").length,
      }))
      const d = delta(before, await state(p))
      console.log("  figures first:", JSON.stringify({ mid, end, ...d }))
      expect(mid.figuresSoft === 0 && !mid.chartSoft, "the new figures and the chart are on screen, sharp, before the lists", mid)
      expect(mid.listsSoft === mid.cards && mid.cards === 7 && mid.shapes === 0, "every card below the chart keeps the last numbers, softened, not shapes", [mid.listsSoft, mid.cards, mid.shapes])
      expect(end.listsSoft === 0 && end.shapes === 0, "and fill in when the rest lands", end)
      expect(d.requests === 1 && d.svgMounts === 0 && d.placeholders === 0, "one read, the chart morphing, no placeholder", [d.requests, d.svgMounts, d.placeholders])
      expect(d.cls < 0.005, "nothing moves but text the new numbers change the width of", d.cls)
      await p.evaluate(() => { window.__listsDelay = 0 })
    }

    /*
      9. COMING BACK. Leaving Analytics and opening it again: the last numbers
      are on the first frame (lib/analytics/report-cache), and an answer only
      seconds old is not asked for again.
    */
    {
      const before = await state(p)
      /* The first frame the page is on screen at all, read before it is painted. */
      const first = await p.evaluate(() => new Promise((resolve) => {
        window.__remount()
        const look = () => {
          if (!document.querySelector('[data-tab="views"]')) return requestAnimationFrame(look)
          resolve({
            placeholder: !!document.querySelector("[data-chart-loading='true']"),
            figuresSoft: document.querySelectorAll("[role=tablist][aria-label=Metric] .blur-\\[2px\\]").length,
            shapes: document.querySelectorAll("section [data-shimmer]").length,
            views: document.querySelector('[data-tab="views"]').textContent,
          })
        }
        requestAnimationFrame(look)
      }))
      await sleep(900)
      const d = delta(before, await state(p))
      console.log("  coming back:", JSON.stringify({ first, requests: d.requests }))
      expect(!first.placeholder && first.figuresSoft === 0 && first.shapes === 0, "the last figures, chart and lists are on the first frame, sharp", first)
      expect(d.requests === 0, "and an answer seconds old is not asked for again", d.requests)
      /* The period the steps after this one start from. */
      await p.evaluate(() => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => /Last 90 days/.test(b.textContent)).click())
      await sleep(450)
      await p.evaluate(() => document.querySelector('[data-row="last_30_days"]').click())
      await sleep(1400)
    }

    /*
      7. THE HOVER CARDS, with a mouse: a report card's dotted title and the
      change beside a figure. Every frame is read: when the card appears,
      how its opacity climbs, whether it survives the pointer crossing the
      gap into it, and how it leaves.
    */
    if (!vp.hasTouch) {
      await p.evaluate(() => {
        let run = 0
        window.__cardSample = (on) => {
          run++
          const mine = run
          if (!on) return window.__cardFrames
          window.__cardFrames = []
          const t0 = performance.now()
          const tick = () => {
            if (mine !== run) return
            const c = document.querySelector(".help-card")
            const anim = c && c.getAnimations ? c.getAnimations()[0] : null
            window.__cardFrames.push({ t: Math.round(performance.now() - t0), state: c ? c.getAttribute("data-state") : null, opacity: c ? +Number(getComputedStyle(c).opacity).toFixed(2) : 0, ms: anim ? Math.round(anim.effect.getTiming().duration) : null })
            requestAnimationFrame(tick)
          }
          requestAnimationFrame(tick)
        }
      })
      const summary = (frames) => {
        const shown = frames.filter((f) => f.state)
        const first = shown[0]
        const full = frames.find((f) => f.opacity >= 0.99)
        return {
          appearsAt: first ? first.t : null,
          risesOver: first && full ? full.t - first.t : null,
          risingFrames: frames.filter((f) => f.state === "open" && f.opacity > 0 && f.opacity < 0.99).length,
          ms: (shown.find((f) => f.ms !== null) || {}).ms ?? null,
        }
      }
      for (const [what, find] of [
        ["a report card's title", () => [...document.querySelectorAll("section h3")].find((h) => h.textContent === "Top products")],
        ["the change beside a figure", () => document.querySelector("[role=tablist][aria-label=Metric] [data-hover-note]")],
      ]) {
        const box = await p.evaluate((src) => {
          const el = new Function(`return (${src})()`)()
          if (!el) return null
          el.scrollIntoView({ block: "center" })
          const r = el.getBoundingClientRect()
          return { x: r.left + Math.min(20, r.width / 2), y: r.top + r.height / 2, bottom: r.bottom }
        }, find.toString())
        if (!box) { expect(false, `${what}: found on the page`, null); continue }
        await p.mouse.move(box.x, box.y - 60)
        await sleep(300)
        await p.evaluate(() => window.__cardSample(true))
        await p.mouse.move(box.x, box.y)
        await sleep(450)
        const opening = summary(await p.evaluate(() => window.__cardSample(false)))
        /* Across the gap and into the card, slowly, the way a hand does it. */
        const card = await p.evaluate(() => { const c = document.querySelector(".help-card"); if (!c) return null; const r = c.getBoundingClientRect(); return { x: r.left + 20, y: r.top + r.height / 2, top: r.top } })
        await p.evaluate(() => window.__cardSample(true))
        if (card) {
          for (let k = 1; k <= 6; k++) {
            await p.mouse.move(box.x + ((card.x - box.x) * k) / 6, box.bottom + ((card.y - box.bottom) * k) / 6)
            await sleep(30)
          }
        }
        await sleep(250)
        const crossing = await p.evaluate(() => window.__cardSample(false))
        /* And away. */
        await p.evaluate(() => window.__cardSample(true))
        await p.mouse.move(8, 8)
        await sleep(450)
        const closing = await p.evaluate(() => window.__cardSample(false))
        const leaving = closing.filter((f) => f.state === "closed")
        const gone = closing.findIndex((f) => !f.state)
        console.log(`  ${what}:`, JSON.stringify({ opening, crossingClosed: crossing.some((f) => f.state !== "open"), leavingFrames: leaving.length, leavingOpacity: leaving.map((f) => f.opacity), goneAfterMs: gone >= 0 ? closing[gone].t : null }))
        expect(opening.appearsAt !== null && opening.appearsAt >= 90 && opening.appearsAt <= 260, `${what}: opens on a resting pointer, after a short rest`, opening.appearsAt)
        expect(opening.ms === 160 && opening.risingFrames >= 6, `${what}: fades in over 160ms, through at least six frames`, opening)
        expect(!crossing.some((f) => f.state !== "open"), `${what}: crossing from the label into the card never closes it`, crossing.map((f) => f.state).join(","))
        expect(leaving.length >= 5 && (leaving.find((f) => f.ms !== null) || {}).ms === 120 && leaving[0].opacity > leaving[leaving.length - 1].opacity, `${what}: leaves with a 120ms fade, not a blink`, leaving.map((f) => f.opacity))
        expect(gone >= 0 && closing[gone].t <= 420, `${what}: and is gone soon after`, gone >= 0 ? closing[gone].t : null)
      }
    }

    /*
      8. THE TWO PICKERS. The period: the rows it offers and nothing that
      opens a list of its own. The product: the same button and the same
      rows, a popover on a computer and the shared sheet on a phone, and a
      search only for a creator with more than eight products.
    */
    {
      const shots = process.env.SHOTS
      const openPicker = (label) => p.evaluate((re) => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => new RegExp(re).test(b.textContent))?.click(), label)
      /* The date range's phone sheet is kept built between opens (BottomSheet keepMounted): its rows at rest are not on screen. */
      const rows = () => p.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((r) => r.offsetParent !== null && !r.closest("[data-app-sheet-rest]")).map((r) => r.getAttribute("data-row")))
      await p.evaluate(() => window.scrollTo(0, 0))
      await openPicker("Last 30 days")
      await sleep(500)
      const periodRows = await rows()
      if (shots) { mkdirSync(shots, { recursive: true }); await p.screenshot({ path: join(shots, `analytics-period-${vp.hasTouch ? "phone" : "desktop"}.png`) }) }
      expect(periodRows.join() === "today,yesterday,last_7_days,last_30_days,last_90_days,last_12_months,month_to_date,all_time,custom",
        "the period picker lists the eight periods and Custom range, and nothing else", periodRows)
      await p.keyboard.press("Escape")
      await sleep(500)

      const trigger = await p.evaluate(() => {
        const b = [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((x) => /All products/.test(x.textContent))
        const d = [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((x) => /Last 30 days/.test(x.textContent))
        if (!b || !d) return null
        const icon = b.querySelector("svg:first-child") && b.firstElementChild.tagName.toLowerCase() === "svg"
        const cs = getComputedStyle(b), ds = getComputedStyle(d)
        return { height: b.offsetHeight, dateHeight: d.offsetHeight, radius: cs.borderRadius, dateRadius: ds.borderRadius, font: cs.fontSize, dateFont: ds.fontSize, leadingIcon: !!icon }
      })
      expect(trigger && trigger.height === trigger.dateHeight && trigger.radius === trigger.dateRadius && trigger.font === trigger.dateFont && !trigger.leadingIcon,
        "the product button is the date button: same height, corners and type, no icon in front", trigger)
      await openPicker("All products")
      await sleep(500)
      const productRows = await rows()
      const where = await p.evaluate(() => ({
        sheet: !!document.querySelector('[data-app-sheet="open"] [data-product-picker], [data-app-sheet="open"][data-product-picker]'),
        popover: !!document.querySelector('[data-slot="popover-content"][data-product-picker]'),
        search: !!document.querySelector("[data-product-search]"),
        checked: [...document.querySelectorAll("[data-row][data-checked]")].filter((r) => !r.closest("[data-app-sheet-rest]")).map((r) => r.getAttribute("data-row")),
      }))
      if (shots) await p.screenshot({ path: join(shots, `analytics-product-${vp.hasTouch ? "phone" : "desktop"}.png`) })
      expect(productRows.join() === "all,p1,p2,p3,p4", "the product list is All products and each product", productRows)
      expect(where.checked.join() === "all", "with a check on the one showing", where.checked)
      expect(vp.hasTouch ? where.sheet && !where.popover : where.popover && !where.sheet, vp.hasTouch ? "in the shared sheet on a phone" : "in the date picker's popover on a computer", where)
      expect(!where.search, "no search field for four products", where.search)
      if (vp.hasTouch) {
        /* The nav pill goes under an open sheet (app/globals.css, data-app-sheet / aria-modal). */
        const pill = await p.evaluate(() => {
          const s = document.createElement("div")
          s.setAttribute("data-app-nav-pill", "")
          /* The pill sets its layer in a stylesheet, as the real one does in a class: inline would outrank the rule under test. */
          const rule = document.createElement("style")
          rule.textContent = ".probe-pill { position: fixed; bottom: 16px; left: 16px; width: 100px; height: 40px; z-index: 55 }"
          document.head.append(rule)
          s.className = "probe-pill"
          document.body.append(s)
          const z = getComputedStyle(s).zIndex
          s.remove()
          return z
        })
        /* It steps under the lowest overlay layer (40), not to 0, where the page's own boxes painted over it (app/globals.css). */
        expect(pill === "39", "and an open sheet puts the nav pill under it, still over the page", pill)
      }
      const before = await state(p)
      await p.evaluate(() => document.querySelector('[data-row="p2"]').click())
      await sleep(1200)
      const d = delta(before, await state(p))
      const label = await p.evaluate(() => [...document.querySelectorAll("button[aria-haspopup=dialog]")].map((b) => b.textContent.trim()).join(" | "))
      console.log("  product chosen:", JSON.stringify(d), label)
      expect(/Brush set for Procreate/.test(label), "a row applies and closes, and the button says the product", label)
      expect(d.requests === 1 && d.router === 0 && d.svgMounts === 0 && d.placeholders === 0 && d.skeletons === 0, "one read, no remount, no placeholder, no skeleton", d)
      const still = await p.evaluate(() => !!document.querySelector("[data-product-picker]") && !!document.querySelector('[data-app-sheet="open"], [data-slot="popover-content"][data-state="open"]'))
      expect(!still, "and the picker is closed", still)
    }

    expect(errors.length === 0, "no errors in the page", errors.slice(0, 3))

    if (process.env.SHOTS) {
      mkdirSync(process.env.SHOTS, { recursive: true })
      await p.screenshot({ path: join(process.env.SHOTS, `analytics-${name.split(",")[0]}.png`) })
    }
    await p.close()
  }

  /* 9. A creator with fourteen products gets a search, and it narrows the list. */
  for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    const p = await browser.newPage()
    await p.setViewport(vp)
    await p.goto(`${origin}/?products=many`, { waitUntil: "load" })
    await p.waitForSelector("[data-chart-loading='false'] .recharts-surface", { timeout: 15000 })
    await sleep(600)
    await p.evaluate(() => [...document.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => /All products/.test(b.textContent)).click())
    await sleep(500)
    const first = await p.evaluate(() => ({ search: !!document.querySelector("[data-product-search]"), focused: document.activeElement?.hasAttribute("data-product-search") ?? false, rows: document.querySelectorAll("[data-product-picker] [data-row]").length }))
    await p.focus("[data-product-search]")
    await p.keyboard.type("course")
    await sleep(200)
    const narrowed = await p.evaluate(() => [...document.querySelectorAll("[data-product-picker] [data-row]")].map((r) => r.textContent.trim()))
    if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `analytics-product-search-${name}.png`) })
    console.log(`\n${name}, fourteen products:`, JSON.stringify({ ...first, narrowed }))
    expect(first.search && first.rows === 15, `${name}: a search field above All products and the fourteen`, first)
    expect(vp.hasTouch ? !first.focused : first.focused, vp.hasTouch ? `${name}: the search is not focused, so the keyboard does not cover the list` : `${name}: the search has focus, so typing narrows at once`, first.focused)
    expect(narrowed.length > 0 && narrowed.every((t) => /course/i.test(t)), `${name}: typing narrows the list to the products that match`, narrowed)
    await p.close()
  }

  /*
    10. THE PAGE AS THE CREATOR READS IT, at 390 and 1280: the controls row,
    the property filter, every card in order and inside its own box, the
    filter from the address, the empty states and the summary lines.
  */
  const shots = process.env.SHOTS
  if (shots) mkdirSync(shots, { recursive: true })
  const CARDS = ["traffic", "pages", "products", "funnel", "subscribers", "countries", "devices"]
  /* The page scrolls inside its own box, not the window: the whole of it is a window as tall as that box's content. */
  const tall = async (p, vp, file) => {
    const h = await p.evaluate(() => Math.max(document.querySelector(".page-scroll")?.scrollHeight ?? 0, innerHeight))
    await p.setViewport({ ...vp, height: Math.min(h, 6000) })
    await sleep(400)
    await p.screenshot({ path: join(shots, file) })
    await p.setViewport(vp)
    await sleep(200)
  }
  /** Everything in a card that pokes out of it, and anything wider than the page. */
  const overflow = (p) => p.evaluate(() => {
    const out = []
    for (const card of document.querySelectorAll("section[data-card]")) {
      const c = card.getBoundingClientRect()
      for (const el of card.querySelectorAll("*")) {
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        if (getComputedStyle(el).position === "fixed") continue
        if (r.left < c.left - 1 || r.right > c.right + 1) out.push(`${card.getAttribute("data-card")}: ${el.tagName.toLowerCase()} '${(el.textContent || "").trim().slice(0, 30)}' ${Math.round(r.left)}..${Math.round(r.right)} of ${Math.round(c.left)}..${Math.round(c.right)}`)
      }
    }
    return { outside: out.slice(0, 5), pageWidth: document.documentElement.scrollWidth, viewport: innerWidth }
  })
  for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
    console.log(`\n${name}, the page as the creator reads it`)
    const p = await browser.newPage()
    await p.setViewport(vp)
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(origin, { waitUntil: "load" })
    await p.waitForSelector("[data-chart-loading='false'] .recharts-surface", { timeout: 15000 })
    await p.waitForFunction(() => !document.querySelector("section [data-shimmer]"), { timeout: 15000 })
    await sleep(700)

    /* The controls: the property filter is the date range's button, beside it. */
    const controls = await p.evaluate(() => {
      const row = document.querySelector("[data-analytics-controls]")
      const date = [...row.querySelectorAll("button[aria-haspopup=dialog]")].find((b) => /Last 7 days/.test(b.textContent))
      const prop = row.querySelector("button[data-property-picker]")
      if (!date || !prop) return null
      const a = date.getBoundingClientRect(), b = prop.getBoundingClientRect()
      const ds = getComputedStyle(date), ps = getComputedStyle(prop)
      return {
        label: prop.textContent.trim(), sameRow: Math.abs(a.top - b.top) < 2, gap: Math.round(b.left - a.right),
        same: a.height === b.height && ds.borderRadius === ps.borderRadius && ds.fontSize === ps.fontSize && ds.backgroundColor === ps.backgroundColor && ds.borderTopColor === ps.borderTopColor,
        leadingIcon: prop.firstElementChild?.tagName.toLowerCase() === "svg", inside: b.right <= innerWidth,
      }
    })
    console.log("  controls:", JSON.stringify(controls))
    expect(controls && controls.label === "All pages" && controls.same && !controls.leadingIcon, "the property filter is the date range's button: same height, corners, type and colours, no icon in front", controls)
    expect(controls && controls.sameRow && controls.gap >= 4 && controls.gap <= 12 && controls.inside, "beside the date range, on its row, inside the screen", controls)

    await p.evaluate(() => document.querySelector("button[data-property-picker]").click())
    await sleep(500)
    const list = await p.evaluate(() => ({
      rows: [...document.querySelectorAll("[data-property-list] [data-row]")].map((r) => `${r.getAttribute("data-row").replace(/:.*/, "")}=${r.textContent.trim()}`),
      sheet: !!document.querySelector('[data-app-sheet="open"] [data-property-list]'),
      popover: !!document.querySelector('[data-slot="popover-content"][data-property-list]'),
      checked: [...document.querySelectorAll("[data-property-list] [data-row][data-checked]")].map((r) => r.getAttribute("data-row")),
    }))
    if (shots) await p.screenshot({ path: join(shots, `analytics-property-${name}.png`) })
    console.log("  the filter's list:", JSON.stringify(list))
    expect(list.rows.join("|") === "all=All pages|creator_page=Creator page|onepage=OnePage|website=StudioWebsite|website=Print shopWebsite", "All pages, the creator page, the OnePage, and each website by its name", list.rows)
    expect(list.checked.join() === "all", "with a check on the one showing", list.checked)
    expect(vp.hasTouch ? list.sheet && !list.popover : list.popover && !list.sheet, vp.hasTouch ? "in the shared bottom sheet on a phone" : "in the date picker's popover on a computer", list)
    await p.keyboard.press("Escape")
    await sleep(500)

    /* The cards, in their order, each with something in it, nothing out of its box. */
    const cards = await p.evaluate(() => [...document.querySelectorAll("section[data-card]")].map((c) => ({ card: c.getAttribute("data-card"), title: c.querySelector("h3")?.textContent, rows: c.querySelectorAll("li, [data-funnel] > *, [data-figure]").length, top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height) })))
    console.log("  cards:", JSON.stringify(cards.map((c) => `${c.card}:${c.rows}`)))
    expect(cards.map((c) => c.card).join() === CARDS.join(), "the cards: sources, top pages, top products, funnel, subscribers, countries, devices", cards.map((c) => c.card))
    expect(cards.every((c) => c.rows > 0), "every card has its rows", cards.filter((c) => c.rows === 0).map((c) => c.card))
    const o = await overflow(p)
    expect(o.outside.length === 0, "nothing sticks out of its card", o.outside)
    expect(o.pageWidth <= o.viewport, "no sideways scroll", o.pageWidth)
    const pages = await p.evaluate(() => [...document.querySelectorAll('[data-card="pages"] li')].slice(0, 3).map((li) => li.textContent.replace(/\s+/g, " ").trim()))
    expect(pages.length === 3 && pages.every((t) => /\/|OnePage/.test(t)) && pages.some((t) => /Creator page|Studio|Print shop|OnePage/.test(t)), "top pages name the path and, under All, the place it is on", pages)
    const funnel = await p.evaluate(() => document.querySelector('[data-card="funnel"]').textContent.replace(/\s+/g, " "))
    expect(/Visitors/.test(funnel) && /Viewed a product/.test(funnel) && /Started checkout/.test(funnel) && /Ordered/.test(funnel), "the funnel's four steps", funnel.slice(0, 160))
    if (shots) {
      await p.screenshot({ path: join(shots, `analytics-${name}-top.png`) })
      await tall(p, vp, `analytics-${name}-full.png`)
    }

    /* The filter from the address: a link from the Website screen, and the old OnePage view's. */
    for (const [q, label, card] of [[`?property=website:00000000-0000-4000-8000-0000000000b1`, "Studio", "Top pages"], ["?mode=onepage", "OnePage", "Top links"]]) {
      const before = await p.evaluate(() => window.__fetches.length)
      await p.goto(`${origin}/${q}`, { waitUntil: "load" })
      await p.waitForSelector("[data-chart-loading='false'] .recharts-surface", { timeout: 15000 })
      await p.waitForFunction(() => !document.querySelector("section [data-shimmer]"), { timeout: 15000 })
      await sleep(500)
      const got = await p.evaluate(() => ({ label: document.querySelector("button[data-property-picker]")?.textContent.trim(), asked: window.__fetches.map((f) => new URL(f.url, location.href).searchParams.get("property")), address: location.search, pages: document.querySelector('[data-card="pages"] h3')?.textContent }))
      console.log(`  ${q}:`, JSON.stringify(got), before)
      expect(got.label === label && got.pages === card, `${q}: the filter reads ${label} and the second card is ${card}`, got)
      expect(got.asked.every((x) => x === (label === "OnePage" ? "onepage" : "website:00000000-0000-4000-8000-0000000000b1")), `${q}: every read is for that place only`, got.asked)
      if (q.includes("mode")) expect(got.address === "?property=onepage", "the old ?mode=onepage is rewritten to ?property=onepage", got.address)
      if (shots && q.includes("mode")) await tall(p, vp, `analytics-onepage-${name}.png`)
    }

    /* A creator with only a creator page: nothing to choose, so no filter. */
    await p.goto(`${origin}/?places=one`, { waitUntil: "load" })
    await p.waitForSelector("[data-chart-loading='false'] .recharts-surface", { timeout: 15000 })
    await sleep(500)
    const one = await p.evaluate(() => ({ filter: !!document.querySelector("button[data-property-picker]"), date: [...document.querySelectorAll("[data-analytics-controls] button[aria-haspopup=dialog]")].length }))
    expect(!one.filter && one.date >= 2, "a creator with one place gets no property filter", one)

    /* A creator with nothing yet: each card says what to do, and no number is made up. */
    await p.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    await p.goto(`${origin}/?empty=1`, { waitUntil: "load" })
    await p.waitForSelector("[data-chart-loading='false']", { timeout: 15000 })
    await p.waitForFunction(() => !document.querySelector("section [data-shimmer]"), { timeout: 15000 })
    await sleep(600)
    const empties = await p.evaluate(() => [...document.querySelectorAll("section[data-card]")].map((c) => [c.getAttribute("data-card"), c.querySelector("[data-empty]")?.textContent.trim() ?? null]))
    const conversion = await p.evaluate(() => document.querySelector('[data-tab="conversion"]')?.textContent.replace(/\s+/g, " ").trim())
    console.log("  nothing yet:", JSON.stringify(empties), conversion)
    expect(empties.length === 7 && empties.every(([, t]) => !!t && !/\d/.test(t)), "every card's empty state is one line with no invented number", empties)
    expect(/–/.test(conversion || "") && !/0(\.0+)?%/.test(conversion || ""), "conversion with no visitors is a dash, not 0%", conversion)
    if (shots) await tall(p, vp, `analytics-empty-${name}.png`)
    const oe = await overflow(p)
    expect(oe.outside.length === 0 && oe.pageWidth <= oe.viewport, "and nothing sticks out, even empty", oe)

    /* The summary lines on the Website screen and in the OnePage editor. */
    await p.goto(`${origin}/?view=summary`, { waitUntil: "load" })
    await p.waitForFunction(() => document.querySelectorAll("[data-analytics-summary-link]").length === 2, { timeout: 15000 })
    await sleep(400)
    const lines = await p.evaluate(() => [...document.querySelectorAll("[data-analytics-summary]")].map((el) => ({ place: el.getAttribute("data-analytics-summary"), text: el.textContent.replace(/\s+/g, " ").trim(), href: el.querySelector("a")?.getAttribute("href"), right: Math.round(el.getBoundingClientRect().right) })))
    console.log("  summaries:", JSON.stringify(lines))
    expect(/^Last 30 days ?\d[\d,]* visitors? · \d[\d,]* orders?$/.test(lines[0]?.text) && lines[0].href === "/app/analytics?range=last_30_days&property=website%3A00000000-0000-4000-8000-0000000000b1",
      "the Website screen: Last 30 days, its visitors and orders, opening Analytics filtered to it", lines[0])
    expect(/^Last 30 days: \d[\d,]* visitors? · \d[\d,]* orders?$/.test(lines[1]?.text) && lines[1].href === "/app/analytics?range=last_30_days&property=onepage", "the OnePage editor: the same line, opening Analytics on the OnePage", lines[1])
    const asked = await p.evaluate(() => window.__fetches.filter((f) => /api\/analytics\/summary/.test(f.url)).length)
    expect(asked === 2, "one small read each", asked)
    if (shots) await p.screenshot({ path: join(shots, `analytics-summary-${name}.png`) })
    await p.goto(`${origin}/?view=summary&empty=1`, { waitUntil: "load" })
    await p.evaluate(() => sessionStorage.clear())
    await p.goto(`${origin}/?view=summary&empty=1`, { waitUntil: "load" })
    await p.waitForFunction(() => [...document.querySelectorAll("[data-analytics-summary]")].every((el) => /No visits yet/.test(el.textContent)), { timeout: 15000 }).catch(() => {})
    const none = await p.evaluate(() => [...document.querySelectorAll("[data-analytics-summary]")].map((el) => el.textContent.replace(/\s+/g, " ").trim()))
    expect(none.length === 2 && /No visits yet$/.test(none[0]) && none[1] === "No visits yet", "before anybody came: No visits yet", none)

    expect(errors.length === 0, "no errors in the page", errors.slice(0, 3))
    await p.close()
  }
} finally {
  await browser?.close()
  server?.close()
  if (!process.env.KEEP) rmSync(dir, { recursive: true, force: true })
}
if (broken) {
  console.log(`\n${broken} failed`)
  process.exit(1)
}
