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

    /* 6. Store to One page and back. */
    for (const mode of [/one ?page/i, /store/i]) {
      const before = await state(p)
      await p.evaluate((src) => {
        const re = new RegExp(src, "i")
        const buttons = [...document.querySelectorAll("button")].filter((b) => re.test(b.textContent.trim()) && b.offsetParent !== null)
        buttons[0].click()
      }, mode.source)
      await sleep(1400)
      const d = delta(before, await state(p))
      console.log(`  mode ${mode.source}:`, JSON.stringify(d), d.cls > 0 ? JSON.stringify(await why(p, before)) : "")
      expect(d.router === 0, `${mode.source}: no navigation, which would reload the page under its skeleton`, d.router)
      expect(d.requests === 1, `${mode.source}: one read`, d.requests)
      expect(d.svgMounts === 0 && d.placeholders === 0, `${mode.source}: the chart morphs, it is not redrawn from nothing`, [d.svgMounts, d.placeholders])
      expect(d.skeletons === 0, `${mode.source}: no skeleton flashes in the cards on a quick answer`, d.skeletons)
      expect(d.cls < 0.005, `${mode.source}: nothing moves but text the new numbers change the width of`, d.cls)
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
        ["a report card's title", () => [...document.querySelectorAll("section h3")].find((h) => h.textContent === "Sessions over time")],
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
      const rows = () => p.evaluate(() => [...document.querySelectorAll("[data-row]")].filter((r) => r.offsetParent !== null).map((r) => r.getAttribute("data-row")))
      await p.evaluate(() => window.scrollTo(0, 0))
      await openPicker("Last 30 days")
      await sleep(500)
      const periodRows = await rows()
      if (shots) { mkdirSync(shots, { recursive: true }); await p.screenshot({ path: join(shots, `period-${vp.hasTouch ? "phone" : "desktop"}.png`) }) }
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
        checked: [...document.querySelectorAll("[data-row][data-checked]")].map((r) => r.getAttribute("data-row")),
      }))
      if (shots) await p.screenshot({ path: join(shots, `product-${vp.hasTouch ? "phone" : "desktop"}.png`) })
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
        expect(pill === "0", "and an open sheet puts the nav pill under it", pill)
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
    if (process.env.SHOTS) await p.screenshot({ path: join(process.env.SHOTS, `product-search-${name}.png`) })
    console.log(`\n${name}, fourteen products:`, JSON.stringify({ ...first, narrowed }))
    expect(first.search && first.rows === 15, `${name}: a search field above All products and the fourteen`, first)
    expect(vp.hasTouch ? !first.focused : first.focused, vp.hasTouch ? `${name}: the search is not focused, so the keyboard does not cover the list` : `${name}: the search has focus, so typing narrows at once`, first.focused)
    expect(narrowed.length > 0 && narrowed.every((t) => /course/i.test(t)), `${name}: typing narrows the list to the products that match`, narrowed)
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
