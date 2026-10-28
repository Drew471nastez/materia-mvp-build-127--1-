/**
 * ===========================================================================
 *  ANALYTICS ON A PHONE: ONE ROW OF FILTERS, WHOLE KIND CHIPS, THE ARROW, THE FILL
 * ===========================================================================
 * Mounts the real AnalyticsClient (scripts/render-analytics-tabs.tsx, with
 * physical commerce on so the kind chips are all four) at 320, 390, 430 and
 * 1440 and measures:
 *
 *   filters   the period, place, product and Export chips: how many rows
 *             their tops make, whether the page scrolls sideways, the pickers'
 *             row's scroll range and which ends fade, and that a picker's
 *             sheet or popover opens outside the scroller, inside the screen
 *   kinds     All / Digital / Physical / Communities: each chip's box against
 *             the row's visible box and its label against its own box
 *   arrow     the metric row's arrow: each tap's scrollLeft, the state it
 *             shows (next / back), and the trip back to 0
 *   fill      a report bar below the screen: waiting (scaleX 0) before it is
 *             reached, then its scale 120ms and 1000ms after it is
 *
 *   PROBE_CSS=source node scripts/check-analytics-mobile-row.mjs
 *   SHOTS=<dir> ...   keeps a screenshot of the top of the page at each width
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

let server
let browser
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const css = await appCss(root)
  const bundle = join(dir, "mobile-row-probe.js")
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-tabs.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"] })

  for (const width of [320, 390, 430, 1440]) {
    const phone = width < 640
    console.log(`\n${width}px`)
    const p = await browser.newPage()
    await p.setViewport(phone ? { width, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { width, height: 900 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e)))
    await p.goto(`${origin}/?delay=150&physical=1`, { waitUntil: "load" })
    await p.waitForSelector("[role=tablist][aria-label=Metric] [data-tab]", { timeout: 15000 })
    await sleep(1600)

    /* ── the filters ─────────────────────────────────────────────────── */
    const f = await p.evaluate(() => {
      const row = document.querySelector("[data-analytics-controls]")
      const strip = row.querySelector("[data-analytics-pickers]")
      const chips = [...row.querySelectorAll("button[aria-haspopup]")]
      const r = (el) => el.getBoundingClientRect()
      const tops = [...new Set(chips.map((c) => Math.round(r(c).top)))]
      const exp = row.querySelector("[data-analytics-export]")
      const s = getComputedStyle(strip)
      return {
        chips: chips.map((c) => c.textContent.trim() || c.getAttribute("aria-label")),
        rows: tops.length,
        rowHeight: Math.round(r(row).height),
        pageScrollX: document.documentElement.scrollWidth - innerWidth,
        strip: { scrollWidth: strip.scrollWidth, clientWidth: strip.clientWidth, overflowX: s.overflowX, scrollbar: s.scrollbarWidth, fadeStart: strip.hasAttribute("data-fade-start"), fadeEnd: strip.hasAttribute("data-fade-end"), mask: s.webkitMaskImage !== "none" || s.maskImage !== "none" },
        exportRight: Math.round(r(exp).right),
      }
    })
    console.log("  filters:", JSON.stringify(f))
    expect(f.rows === 1, "the period, place, product and Export chips are one row", { rows: f.rows, chips: f.chips })
    expect(f.pageScrollX <= 0, "the page itself never scrolls sideways", f.pageScrollX)
    expect(f.exportRight <= width, "Export is whole on screen", f.exportRight)
    if (phone && f.strip.scrollWidth > f.strip.clientWidth) {
      expect(f.strip.fadeEnd && !f.strip.fadeStart && f.strip.mask, "cut at the right: the right end fades, the left does not", f.strip)
      const after = await p.evaluate(() => { const s = document.querySelector("[data-analytics-pickers]"); s.scrollLeft = s.scrollWidth; return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ scrollLeft: Math.round(s.scrollLeft), fadeStart: s.hasAttribute("data-fade-start"), fadeEnd: s.hasAttribute("data-fade-end") })))) })
      expect(after.fadeStart && !after.fadeEnd, "scrolled to its end: the left end fades, the right does not", after)
      await p.evaluate(() => { document.querySelector("[data-analytics-pickers]").scrollLeft = 0 })
    }
    /* Each picker opens outside the scroller, whole on screen. */
    for (const [name, sel] of [["period", "[data-analytics-pickers] > div:first-child > :first-child button[aria-haspopup], [data-analytics-pickers] > div:first-child > button[aria-haspopup]:first-child"], ["product", "[data-analytics-pickers] > div:last-child button[aria-haspopup]"]]) {
      const ok = await p.evaluate((sel) => { const b = document.querySelector(sel); if (!b) return false; b.click(); return true }, sel)
      if (!ok) { console.log(`  note  no ${name} picker found`); continue }
      await sleep(700)
      const box = await p.evaluate(() => {
        const cand = [...document.querySelectorAll("[role=dialog], [data-radix-popper-content-wrapper], [data-sheet]")].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 40 })
        const el = cand[cand.length - 1]
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { inScroller: !!el.closest("[data-analytics-pickers]"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
      })
      expect(box && !box.inScroller && box.left >= -1 && box.right <= width + 1 && box.h > 80, `the ${name} picker opens outside the scroller, whole on screen`, box)
      await p.keyboard.press("Escape")
      await sleep(600)
    }

    /* ── the kind chips ─────────────────────────────────────────────── */
    const k = await p.evaluate(() => {
      const row = document.querySelector("[data-segmented-pills='chips']")
      if (!row) return null
      const rr = row.getBoundingClientRect()
      const chips = [...row.querySelectorAll("[role=tab]")].map((b) => {
        const r = b.getBoundingClientRect()
        const cs = getComputedStyle(b)
        return { label: b.textContent.trim(), left: +r.left.toFixed(1), right: +r.right.toFixed(1), w: +r.width.toFixed(1), cut: r.left < rr.left - 0.5 || r.right > rr.right + 0.5 || b.scrollWidth > b.clientWidth + 1, on: b.getAttribute("aria-selected") === "true", color: cs.color }
      })
      const pill = row.querySelector("span[aria-hidden]")
      return { rowLeft: +rr.left.toFixed(1), rowRight: +rr.right.toFixed(1), scrollWidth: row.scrollWidth, clientWidth: row.clientWidth, chips, pill: pill && getComputedStyle(pill).backgroundColor, fade: row.hasAttribute("data-fade-end") }
    })
    console.log("  kinds:", JSON.stringify(k))
    expect(k && k.chips.length === 4, "All, Digital, Physical and Communities are drawn", k && k.chips.map((c) => c.label))
    expect(k && k.chips.every((c) => !c.cut) && k.scrollWidth <= k.clientWidth, "no kind chip is cut, and the row needs no scroll", k && { scrollWidth: k.scrollWidth, clientWidth: k.clientWidth, cut: k.chips.filter((c) => c.cut).map((c) => c.label) })
    expect(k && k.pill === "rgb(26, 26, 46)", "the chosen chip is the dark pill", k && k.pill)
    /* A tap moves the pill to the chip tapped. */
    if (k) {
      await p.evaluate(() => [...document.querySelectorAll("[data-segmented-pills='chips'] [role=tab]")].find((b) => b.textContent.trim() === "Communities").click())
      await sleep(500)
      const moved = await p.evaluate(() => { const row = document.querySelector("[data-segmented-pills='chips']"); const pill = row.querySelector("span[aria-hidden]").getBoundingClientRect(); const on = row.querySelector("[aria-selected=true]"); const r = on.getBoundingClientRect(); return { on: on.textContent.trim(), dx: +(pill.left - r.left).toFixed(1), dw: +(pill.width - r.width).toFixed(1) } })
      expect(moved.on === "Communities" && Math.abs(moved.dx) < 1 && Math.abs(moved.dw) < 1, "Communities tapped: the pill is under it", moved)
      await p.evaluate(() => [...document.querySelectorAll("[data-segmented-pills='chips'] [role=tab]")].find((b) => b.textContent.trim() === "All").click())
      await sleep(900)
    }

    /* ── the metric arrow ───────────────────────────────────────────── */
    const strip = "[role=tablist][aria-label=Metric]"
    const state = () => p.evaluate((strip) => { const s = document.querySelector(strip); const a = s.querySelector("[data-strip-arrow]"); const ab = a.getBoundingClientRect(); return { scrollLeft: Math.round(s.scrollLeft), max: s.scrollWidth - s.clientWidth, arrow: a.getAttribute("data-strip-arrow"), shown: ab.width > 0, arrowRight: Math.round(ab.right), stripRight: Math.round(s.getBoundingClientRect().right), firstWhole: [...s.querySelectorAll("[role=tab]")].map((t) => t.getAttribute("data-tab") + "@" + Math.round(t.getBoundingClientRect().left - s.getBoundingClientRect().left)) } }, strip)
    const s0 = await state()
    console.log("  arrow at rest:", JSON.stringify(s0))
    if (phone) {
      expect(s0.shown && s0.arrow === "next" && s0.arrowRight === s0.stripRight, "the arrow points on, held at the row's right edge", { arrow: s0.arrow, arrowRight: s0.arrowRight, stripRight: s0.stripRight })
      const steps = []
      for (let i = 0; i < 6; i++) {
        const before = await state()
        if (before.arrow !== "next") break
        await p.click(`${strip} [data-strip-arrow] button`)
        /* Mid-scroll, then settled: a smooth scroll is between the two. */
        await sleep(90)
        const mid = (await state()).scrollLeft
        await sleep(700)
        const after = await state()
        steps.push({ from: before.scrollLeft, mid, to: after.scrollLeft, arrow: after.arrow, tabs: after.firstWhole.join(" ") })
      }
      console.log("  arrow taps:", JSON.stringify(steps))
      expect(steps.length > 0 && steps.every((s) => s.to > s.from), "each tap scrolls the row on", steps.map((s) => `${s.from}->${s.to}`))
      expect(steps.some((s) => s.mid > s.from && s.mid < s.to), "it scrolls smoothly (caught between start and end)", steps.map((s) => s.mid))
      const end = await state()
      expect(end.arrow === "back" && Math.abs(end.scrollLeft - end.max) <= 1, "at the end it turns round", { arrow: end.arrow, scrollLeft: end.scrollLeft, max: end.max })
      await p.click(`${strip} [data-strip-arrow] button`)
      await sleep(800)
      const back = await state()
      expect(back.scrollLeft === 0 && back.arrow === "next", "and takes the row back to the start", { scrollLeft: back.scrollLeft, arrow: back.arrow })
    } else {
      expect(!s0.shown, "no arrow on a desktop, the four columns fit", s0)
    }

    /* ── the fill ───────────────────────────────────────────────────── */
    const below = await p.evaluate(() => {
      const sc = document.querySelector(".page-scroll")
      const bottom = sc.getBoundingClientRect().bottom
      const bars = [...document.querySelectorAll("[data-bar][data-fill=grey]")]
      const waiting = bars.filter((b) => b.getAttribute("data-fill-in") === "wait")
      const target = waiting.find((b) => !b.hasAttribute("data-fill-axis") && b.getBoundingClientRect().top > bottom + 200)
      if (target) target.setAttribute("data-probe-bar", "")
      return { bars: bars.length, waiting: waiting.length, waitingBelow: waiting.filter((b) => b.getBoundingClientRect().top > bottom).length, onScreenWaiting: waiting.filter((b) => b.getBoundingClientRect().top < bottom * 0.9 && b.getBoundingClientRect().bottom > 0).length, target: !!target, transform: target ? getComputedStyle(target).transform : null, debug: target ? { cls: target.className, card: target.closest("[data-card]")?.getAttribute("data-card"), display: getComputedStyle(target).display, attr: target.getAttribute("data-fill-in"), origin: getComputedStyle(target).transformOrigin, tr: getComputedStyle(target).transition.slice(0,80), anims: target.getAnimations().length, rules: (() => { const out = []; const walk = (rules, media) => { for (const r of rules) { if (r.cssRules && !r.selectorText) { const m = r.media ? r.media.mediaText : (r.conditionText || ""); if (!r.media || matchMedia(r.media.mediaText).matches) walk(r.cssRules, m); continue } try { if (r.selectorText && target.matches(r.selectorText) && /transform|transition/.test(r.style.cssText)) out.push(media + " " + r.selectorText.slice(0, 80) + " {" + r.style.cssText.slice(0, 80)) } catch {} } }; for (const s of document.styleSheets) walk(s.cssRules, ""); return out })(), w: target.getBoundingClientRect().width } : null }
    })
    console.log("  fill before scrolling:", JSON.stringify(below))
    expect(below.target && below.transform === "matrix(0, 0, 0, 1, 0, 0)", "a bar below the screen waits empty (scaleX 0)", below.transform)
    expect(below.onScreenWaiting === 0, "no bar on screen is left empty", below.onScreenWaiting)
    if (below.target) {
      await p.evaluate(() => { const b = document.querySelector("[data-probe-bar]"); const sc = document.querySelector(".page-scroll"); sc.scrollTop += b.getBoundingClientRect().top - sc.getBoundingClientRect().height * 0.5 })
      const read = () => p.evaluate(() => { const b = document.querySelector("[data-probe-bar]"); const m = getComputedStyle(b).transform; const sx = m === "none" ? 1 : +m.slice(7).split(",")[0]; return { scaleX: +sx.toFixed(3), state: b.getAttribute("data-fill-in"), delay: b.style.getPropertyValue("--fill-delay") } })
      await sleep(200)
      const early = await read()
      await sleep(1000)
      const late = await read()
      console.log("  fill after reaching it:", JSON.stringify({ at200ms: early, at1200ms: late }))
      expect(early.scaleX > 0 && early.scaleX < 1, "reached: it is filling (part way at 200ms)", early)
      expect(late.scaleX === 1 && late.state === null, "and full, the wait gone, by 1.2s", late)
    }

    if (process.env.SHOTS) {
      mkdirSync(process.env.SHOTS, { recursive: true })
      await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0 })
      await sleep(400)
      await p.screenshot({ path: join(process.env.SHOTS, `analytics-top-${width}.png`), clip: { x: 0, y: 0, width, height: phone ? 520 : 560 } })
    }
    expect(errors.length === 0, "no errors", errors.slice(0, 3))
    await p.close()
  }

  /* Reduced motion: nothing waits. */
  console.log("\n390px, reduced motion")
  const p = await browser.newPage()
  await p.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  await p.goto(`${origin}/?delay=150&physical=1`, { waitUntil: "load" })
  await p.waitForSelector("[role=tablist][aria-label=Metric] [data-tab]", { timeout: 15000 })
  await sleep(1600)
  const calm = await p.evaluate(() => [...document.querySelectorAll("[data-bar][data-fill=grey]")].filter((b) => b.hasAttribute("data-fill-in")).length)
  expect(calm === 0, "under reduced motion no bar waits", calm)
  await p.close()
} finally {
  await browser?.close()
  server?.close()
}
if (broken) { console.log(`\n${broken} expectation(s) not met`); process.exit(1) }
