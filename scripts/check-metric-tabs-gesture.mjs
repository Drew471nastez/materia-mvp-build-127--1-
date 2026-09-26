#!/usr/bin/env node
/**
 * ===========================================================================
 *  THE METRIC TABS ON A PHONE: WHOSE SWIPE IS IT, AND WHAT DOES IT COST
 * ===========================================================================
 * "When I try to scroll horizontally through the tabs (views, orders, CVR)
 * make sure it's smooth clean, 200 fps smooth, not laggish, and make sure it
 * doesn't misunderstand what I want: when I want to scroll up and down,
 * ensure this doesn't happen."
 *
 * The real Home (scripts/home-probe-page.mjs: DashboardClient, forty sales,
 * inside the app's frame, with its pull to refresh) and the real Analytics
 * (scripts/render-analytics-page.tsx) at 360, 390 and 430 wide, touch, a 3x
 * screen. Every swipe is a real touch sequence sent through the browser's
 * input pipeline (CDP Input.dispatchTouchEvent), so the browser's own
 * gesture detection, touch-action and scroll latching decide what moves,
 * exactly as they do under a thumb. Dispatching TouchEvent objects from
 * script, as scripts/check-tab-strip.mjs once did, never scrolls anything.
 *
 * For each swipe, from the page:
 *
 *   row       how far the tabs' row scrolled sideways (scrollLeft)
 *   page      how far the page scrolled (its scroller's scrollTop)
 *   cancelled touchmoves whose default was prevented, of those sent
 *   pull      whether the pull to refresh ring appeared
 *   readout   whether the chart's readout appeared
 *   commits   React commits during the swipe and its fling, and frames drawn
 *   long      tasks over 50ms
 *
 * Swipes start on the row at 0, 20 and 35 degrees off horizontal either way
 * (sideways, the row's), at 65, 70 and 90 (the page's), and on the chart. A
 * tap on a tab and a swipe that ends on another tab close it.
 *
 * And the listeners: every touch listener on the row and on each element
 * above it, read from the browser (DOMDebugger.getEventListeners), because
 * a non passive touchmove anywhere on that path is what makes a swipe wait
 * for the main thread.
 *
 * BASE: the same swipes against the three gesture files as they were at
 * that commit (components/app/use-tab-strip, components/app/chart-scrub,
 * hooks/use-pull-to-refresh), printed beside, not judged. BASE=none skips it.
 *
 *   node scripts/check-metric-tabs-gesture.mjs
 *   BASE=none WIDTHS=390 node scripts/check-metric-tabs-gesture.mjs
 *
 * Headless Chromium, so what this settles is Chromium's arbitration (Android
 * and desktop touch). WKWebView arbitrates in UIKit and is not measured here.
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { build } from "esbuild"
import puppeteer from "puppeteer-core"
import { homeProbePage } from "./home-probe-page.mjs"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const BASE = process.env.BASE ?? "8e8676e6"
const WIDTHS = (process.env.WIDTHS ?? "360,390,430").split(",").map(Number)
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const GESTURE_FILES = {
  "@/components/app/use-tab-strip": "components/app/use-tab-strip.ts",
  "@/components/app/chart-scrub": "components/app/chart-scrub.tsx",
  "@/hooks/use-pull-to-refresh": "hooks/use-pull-to-refresh.ts",
}

/** The three gesture files at BASE, beside their own folders so their imports resolve. */
function baseSwaps(dirs) {
  if (BASE === "none") return null
  const swaps = {}
  for (const [spec, file] of Object.entries(GESTURE_FILES)) {
    let src = execFileSync("git", ["show", `${BASE}:${file}`], { cwd: root, encoding: "utf8" })
    /* The pages now import the strip's style from the hook; the old hook kept it inline, as `pan-x pan-y`. */
    if (file.endsWith("use-tab-strip.ts") && !/TAB_STRIP_STYLE/.test(src)) {
      src += `\nexport const TAB_STRIP_STYLE = { touchAction: "pan-x pan-y" }\nexport const SCROLL_X_ATTR = "data-scroll-x"\n`
    }
    const dir = join(root, file.split("/").slice(0, -1).join("/"), `.gesture-base-${process.pid}`)
    mkdirSync(dir, { recursive: true })
    dirs.push(dir)
    const out = join(dir, file.split("/").pop())
    writeFileSync(out, src)
    swaps[spec] = out
  }
  return swaps
}

/* ── Analytics, served ─────────────────────────────────────────────────── */
async function analyticsPage(swaps = {}) {
  const dir = join(root, `.metric-tabs-${process.pid}-${Object.keys(swaps).length ? "base" : "now"}-probe`)
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
  const map = {
    ...swaps,
    "@/lib/native-bridge": join(dir, "native-bridge.js"),
    "next/navigation": join(dir, "next-navigation.js"),
    "next/link": join(dir, "next-link.js"),
  }
  const bundle = join(dir, "probe.js")
  try {
    await build({
      entryPoints: [join(root, "scripts/render-analytics-page.tsx")],
      bundle: true, format: "iife", platform: "browser", jsx: "automatic", logLevel: "error", outfile: bundle,
      banner: { js: 'var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;' },
      define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{
        name: "metric-tabs-redirects",
        setup(b) {
          for (const [spec, file] of Object.entries(map)) {
            const filter = new RegExp(`^${spec.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}$`)
            b.onResolve({ filter }, () => ({ path: file }))
          }
        },
      }],
      alias: { "@": root },
      loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    })
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
  const js = readFileSync(bundle)
  rmSync(dir, { recursive: true, force: true })
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${await appCss(root)}</style><style>body{margin:0}</style></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  const server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() }
}

/* ── In the page, before anything of the app runs ──────────────────────── */
const INSTRUMENT = () => {
  window.__commits = 0
  /* React reports every commit to a devtools hook when one is present, production builds included. */
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    isDisabled: false, supportsFiber: true, renderers: new Map(),
    inject() { return 1 },
    onCommitFiberRoot(_id, root) {
      window.__commits++
      /* What rendered, by name, for the report: the fibers that did work in this commit. */
      if (!window.__rec) return
      const names = []
      const walk = (f, depth) => {
        for (let n = f; n && names.length < 6; n = n.sibling) {
          const t = n.type
          /* The component whose own state changed is where the commit came from. */
          if ((n.flags & 1) && typeof t === "function" && n.alternate && n.memoizedState !== n.alternate.memoizedState) names.push(t.displayName || t.name || "anonymous")
          if (n.child && depth < 400) walk(n.child, depth + 1)
        }
      }
      try { walk(root.current.child, 0) } catch { /* the shape of a fiber is React's business */ }
      ;(window.__who = window.__who || []).push(names.join(">") || "?")
    },
    onCommitFiberUnmount() {}, onPostCommitFiberRoot() {}, onScheduleFiberRoot() {}, checkDCE() {},
  }
  window.__long = []
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: "longtask" })
  } catch { /* no long task timing */ }
  window.__moves = []
  /* Last in line (the window, bubbling, passive), so it sees what every other listener decided. */
  addEventListener("touchmove", (e) => { window.__moves.push({ c: e.cancelable, p: e.defaultPrevented }) }, { passive: true })
  window.__frames = 0
  window.__peak = { pull: 0, readout: 0 }
  const tick = () => {
    if (window.__rec) {
      window.__frames++
      const ring = document.querySelector("[data-ptr-indicator]")
      if (ring) window.__peak.pull = Math.max(window.__peak.pull, Number(getComputedStyle(ring).opacity) || 0)
      const tip = document.querySelector("[data-chart-tooltip]")
      if (tip) window.__peak.readout = Math.max(window.__peak.readout, Number(getComputedStyle(tip).opacity) || 0)
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

const STRIP = "[role=tablist][aria-label=Metric]"

async function measurePage(browser, name, url, scrollerSel, width) {
  const page = await browser.newPage()
  await page.setViewport({ width, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  await page.evaluateOnNewDocument(INSTRUMENT)
  const errors = []
  page.on("pageerror", (e) => errors.push(String(e.message || e)))
  await page.goto(url)
  await page.waitForSelector(`${STRIP} [data-tab]`, { timeout: 20000 })
  await page.waitForSelector("[data-chart-touch-shield]", { timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  await sleep(1500)
  const cdp = await page.createCDPSession()

  const geo = await page.evaluate((strip, sc) => {
    const s = document.querySelector(strip)
    const scroller = document.querySelector(sc)
    scroller.scrollTop = 0
    const r = s.getBoundingClientRect()
    const shield = [...document.querySelectorAll("[data-chart-touch-shield]")].find((el) => el.getBoundingClientRect().top > r.top)
    const c = shield.getBoundingClientRect()
    return {
      stripY: r.top + r.height / 2, stripTop: r.top, stripH: r.height, yRoom: s.scrollHeight - s.clientHeight, overflowY: getComputedStyle(s).overflowY, exactH: r.height, contentH: Math.max(...[...s.children].map((c) => c.getBoundingClientRect().bottom)) - r.top,
      overflow: s.scrollWidth - s.clientWidth,
      chartY: c.top + c.height / 2, chartX: c.left + c.width / 2,
      room: scroller.scrollHeight - scroller.clientHeight,
      tabs: [...s.querySelectorAll("[data-tab]")].map((b) => { const q = b.getBoundingClientRect(); return { tab: b.dataset.tab, x: q.left + q.width / 2, y: q.top + q.height / 2 } }),
    }
  }, STRIP, scrollerSel)

  /* ── the listeners on the path a touch on the row travels ──────────── */
  const listeners = []
  {
    const { result } = await cdp.send("Runtime.evaluate", { expression: `(() => { const out = []; for (let n = document.querySelector(${JSON.stringify(STRIP)} + " [data-tab]"); n; n = n.parentNode) out.push(n); out.push(window); return out })()` })
    const { result: props } = await cdp.send("Runtime.getProperties", { objectId: result.objectId, ownProperties: true })
    for (const p of props) {
      if (!/^\d+$/.test(p.name) || !p.value?.objectId) continue
      const { listeners: ls } = await cdp.send("DOMDebugger.getEventListeners", { objectId: p.value.objectId, depth: 0 })
      for (const l of ls) if (/^touch|^wheel$|^scroll$/.test(l.type)) listeners.push({ on: p.value.description?.slice(0, 40), type: l.type, passive: l.passive, depth: Number(p.name) })
    }
  }

  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 11, radiusY: 11, force: 1 }] })
  const read = () => page.evaluate((strip, sc) => {
    const s = document.querySelector(strip)
    return {
      left: s.scrollLeft, top: document.querySelector(sc).scrollTop,
      selected: s.querySelector("[aria-selected=true]")?.dataset.tab ?? null,
    }
  }, STRIP, scrollerSel)
  /** Until nothing has moved for 150ms: a fling runs out, a smooth scroll lands. At most 4s. */
  const settle = async () => {
    let last = JSON.stringify(await read())
    for (let i = 0; i < 40; i++) {
      await sleep(150)
      const now = JSON.stringify(await read())
      if (now === last) return
      last = now
    }
  }
  /**
   * Back to a starting point between swipes.
   *
   * THE ROW IS BROUGHT BACK BY A THUMB, NOT BY SCRIPT. Setting scrollLeft
   * from script after a flick along the row left Chromium treating the next
   * touch sequence as one that lands on a running fling (every touchmove
   * uncancellable from the first) and scrolling nothing with it, seconds
   * later. No thumb does that, and it is not what the page does either: the
   * only script scroll of the row is the reveal after a tap, and a tap stops
   * a fling first (measured below, "flick, tap, then up"). So the row goes
   * back the way a person would send it back, with swipes to the right.
   *
   * The page's own scroll is set from script, while nothing is moving.
   */
  const reset = async (top, left = 0) => {
    await settle()
    await sleep(Number(process.env.PAUSE ?? 600))
    for (let k = 0; k < 4 && left !== null; k++) {
      const now = await read()
      if (now.left <= left + 1) break
      await page.evaluate((sc) => { document.querySelector(sc).scrollTop = 0 }, scrollerSel)
      await settle()
      await drag(Math.round(width * 0.3), geo.stripY, 180, 170)
      await settle()
      await sleep(Number(process.env.PAUSE ?? 600))
    }
    await page.evaluate((sc, t) => {
      const s = document.querySelector(sc)
      if (s.scrollTop !== t) s.scrollTop = t
    }, scrollerSel, top)
    await settle()
  }

  /**
   * One swipe. `deg` is the direction the finger moves, from pointing left:
   * 0 is a finger going left (the row scrolls on), 90 a finger going up
   * (the page scrolls on), negative the same angle downwards.
   */
  async function drag(x0, y0, deg, dist = 150, { hold = 0, steps = 14 } = {}) {
    const r = (deg * Math.PI) / 180
    const dx = -Math.cos(r) * dist
    const dy = -Math.sin(r) * dist
    await touch("touchStart", x0, y0)
    if (hold) await sleep(hold)
    const t0 = Date.now()
    /* One move a frame at 60Hz, as a phone delivers them. */
    for (let i = 1; i <= steps; i++) {
      await touch("touchMove", x0 + (dx * i) / steps, y0 + (dy * i) / steps)
      const wait = t0 + i * 16 - Date.now()
      if (wait > 0) await sleep(wait)
    }
    await touch("touchEnd")
  }
  const swipe = async (x0, y0, deg, dist = 150, opts = {}) => {
    const before = await read()
    await page.evaluate(() => { window.__moves = []; window.__commits = 0; window.__who = []; window.__long = []; window.__frames = 0; window.__peak = { pull: 0, readout: 0 }; window.__rec = true })
    await drag(x0, y0, deg, dist, opts)
    /* The fling too: a swipe is not over until what it set moving has stopped. */
    await sleep(200)
    await settle()
    const got = await page.evaluate(() => { window.__rec = false; return { moves: window.__moves, commits: window.__commits, who: window.__who, long: window.__long, frames: window.__frames, peak: window.__peak } })
    const after = await read()
    const readoutEnd = await page.evaluate(() => Number(getComputedStyle(document.querySelector("[data-chart-tooltip]")).opacity) || 0)
    return {
      readoutEnd,
      row: Math.round(after.left - before.left),
      page: Math.round(after.top - before.top),
      cancelled: got.moves.filter((m) => m.p).length,
      moves: got.moves.length,
      blocking: got.moves.filter((m) => m.c).length,
      pull: got.peak.pull > 0.05,
      readout: got.peak.readout > 0.05,
      commits: got.commits,
      who: got.who,
      frames: got.frames,
      long: got.long,
      selectedBefore: before.selected,
      selectedAfter: after.selected,
    }
  }

  const out = { name, width, geo, listeners, swipes: {} }
  /* What a thumb really does: flick along the row, then straight away scroll the page from it. */
  await reset(0, 0)
  out.swipes["row 0° then at once 90°"] = { kind: "sideways", ...(await swipe(Math.round(width * 0.62), geo.stripY, 0)) }
  out.swipes["  (the 90° straight after)"] = { kind: "vertical", ...(await swipe(Math.round(width * 0.62), geo.stripY, 90)) }
  const x = Math.round(width * 0.62)
  /* Sideways, at the top of the page, where Home's pull to refresh is listening. */
  for (const deg of (process.env.SIDE ?? "0,20,-20,35,-35").split(",").map(Number)) {
    await reset(0, 0)
    out.swipes[`row ${deg}°`] = { kind: "sideways", ...(await swipe(x, geo.stripY, deg)) }
  }
  /* Up and down the page from the row. Going up from the top; coming down from part way. */
  for (const deg of (process.env.VERT ?? "90,70,65,110").split(",").map(Number)) {
    await reset(0, null)
    out.swipes[`row ${deg}°`] = { kind: "vertical", ...(await swipe(x, geo.stripY, deg)) }
  }
  const down = Math.max(0, Math.min(140, Math.round(geo.stripTop - 120)))
  if (down > 20) {
    for (const deg of [-90, -70]) {
      await reset(down, null)
      out.swipes[`row ${deg}° from ${down}px down`] = { kind: "vertical", ...(await swipe(x, geo.stripY - down, deg)) }
    }
  }
  /*
    The one script scroll the row has, in the order a thumb makes it: a
    slanted flick along the row, a tap on a tab while it glides (the tap
    stops the glide, and the reveal scrolls the row from script), then
    straight up the page from the row.
  */
  await reset(0, 0)
  await drag(x, geo.stripY, -35)
  await sleep(120)
  {
    const tabs = await page.evaluate((strip) => [...document.querySelectorAll(`${strip} [data-tab]`)].map((b) => { const q = b.getBoundingClientRect(); return { tab: b.dataset.tab, x: q.left + q.width / 2, y: q.top + q.height / 2, sel: b.getAttribute("aria-selected") === "true" } }), STRIP)
    const next = tabs.find((t) => !t.sel && t.x > 20 && t.x < width - 20)
    if (next) {
      await touch("touchStart", next.x, next.y)
      await sleep(60)
      await touch("touchEnd")
    }
  }
  await settle()
  await sleep(300)
  out.swipes["flick, tap, then up 90°"] = { kind: "vertical", ...(await swipe(x, geo.stripY, 90)) }

  /* And from the chart under it. */
  for (const deg of [90, 70]) {
    await reset(0, null)
    out.swipes[`chart ${deg}°`] = { kind: "chart-vertical", ...(await swipe(geo.chartX, geo.chartY, deg)) }
  }
  await reset(0, null)
  out.swipes["chart 0° (a scrub)"] = { kind: "chart-scrub", ...(await swipe(geo.chartX + 60, geo.chartY, 0, 120)) }
  await reset(0, null)
  out.swipes["chart hold, then up"] = { kind: "chart-hold", ...(await swipe(geo.chartX, geo.chartY, 90, 150, { hold: 180 })) }

  /* A tap selects; a swipe that ends on another tab does not. */
  await reset(0, 0)
  {
    /* A tab that is not the chosen one, and is fully on screen. */
    const now = (await read()).selected
    const target = geo.tabs.find((t) => t.tab !== now && t.x > 40 && t.x < width - 40)
    const before = await read()
    await touch("touchStart", target.x, target.y)
    await sleep(60)
    await touch("touchEnd")
    await sleep(500)
    const after = await read()
    out.tap = { tab: target.tab, before: before.selected, after: after.selected }
  }
  await reset(0, 0)
  {
    const from = geo.tabs[0]
    const r = await swipe(from.x + 30, from.y, 0, 110)
    out.swipeOntoTab = r
  }
  out.errors = errors
  await page.close()
  return out
}

function summarise(r) {
  const lines = []
  for (const [k, s] of Object.entries(r.swipes)) {
    lines.push(`    ${k.padEnd(30)} row ${String(s.row).padStart(4)}  page ${String(s.page).padStart(4)}  cancelled ${String(s.cancelled).padStart(2)}/${String(s.moves).padEnd(2)}  ${s.pull ? "PULL " : "     "}${s.readout ? "READOUT " : "        "} commits ${s.commits} in ${s.frames} frames  long ${s.long.length ? s.long.join(",") : "0"}${s.commits ? `  (${[...new Set(s.who)].join("; ")})` : ""}`)
  }
  return lines.join("\n")
}

const dirs = []
const servers = []
let browser
let broken = 0
try {
  const swaps = baseSwaps(dirs)
  const builds = { now: {} }
  if (swaps) builds.base = swaps
  const sites = {}
  for (const [ver, sw] of Object.entries(builds)) {
    const home = await homeProbePage(root, { swaps: sw })
    const analytics = await analyticsPage(sw)
    servers.push(home, analytics)
    sites[ver] = { home: `${home.base}/app?state=selling`, analytics: analytics.base }
  }
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  dirs.length = 0

  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--no-proxy-server"] })

  const expect = (ok, what, got) => {
    console.log(`    ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
    if (!ok) broken++
  }
  const results = []
  for (const width of WIDTHS) {
    for (const [pageName, scroller] of [["home", ".dashboard-scroll-container"], ["analytics", ".page-scroll"]]) {
      for (const ver of Object.keys(sites)) {
        const r = await measurePage(browser, pageName, sites[ver][pageName], scroller, width)
        r.ver = ver
        results.push(r)
        console.log(`\n${pageName}, ${width} wide, ${ver === "now" ? "this checkout" : `at ${BASE}`}   (row overflows by ${r.geo.overflow}px; vertical room ${r.geo.yRoom}, overflow-y ${r.geo.overflowY}, box ${r.geo.exactH}, content ${r.geo.contentH})`)
        console.log(summarise(r))
        console.log(`    tap on ${r.tap.tab}: selected ${r.tap.before} -> ${r.tap.after};  swipe onto another tab: selected ${r.swipeOntoTab.selectedBefore} -> ${r.swipeOntoTab.selectedAfter}`)
        const touchLs = r.listeners.filter((l) => /^touch/.test(l.type))
        console.log(`    touch listeners on the path: ${touchLs.map((l) => `${l.type}${l.passive ? "" : " NON-PASSIVE"} on ${l.on}`).join("; ") || "none"}`)
        if (ver !== "now") continue

        /* ── the gates, on this checkout only ─────────────────────────── */
        expect(r.errors.length === 0, "the page ran without errors", r.errors.slice(0, 2))
        expect(r.geo.overflow > 0, "the row really is wider than the phone, or there is nothing to test", r.geo.overflow)
        const onRow = r.listeners.filter((l) => l.depth === 0 || (l.depth === 1))
        expect(!onRow.some((l) => /^touch/.test(l.type)),
          "no touch listener on the row or its tabs: the browser scrolls it", onRow)
        for (const [k, s] of Object.entries(r.swipes)) {
          if (s.kind !== "chart-scrub") expect(s.selectedAfter === s.selectedBefore, `${k}: selects no tab`, s)
          if (s.kind === "sideways") {
            expect(s.row > 0 && s.page === 0 && !s.pull, `${k}: scrolls the row, not the page, no pull`, s)
            expect(s.cancelled === 0, `${k}: no touchmove cancelled`, `${s.cancelled} of ${s.moves}`)
            expect(s.commits === 0, `${k}: no React commit while the row scrolls`, `${s.commits} in ${s.frames} frames`)
            expect(s.long.length === 0, `${k}: no task over 50ms`, s.long)
          } else if (s.kind === "vertical") {
            expect(s.row === 0, `${k}: the row does not move`, s)
            expect(s.page !== 0 && !s.pull, `${k}: the page scrolls`, s)
            expect(s.cancelled === 0, `${k}: no touchmove cancelled`, `${s.cancelled} of ${s.moves}`)
            expect(!s.readout, `${k}: no readout`, s)
          } else if (s.kind === "chart-vertical") {
            expect(s.page !== 0 && !s.readout && s.row === 0, `${k}: the page scrolls, the chart does not scrub`, s)
            expect(s.cancelled === 0, `${k}: no touchmove cancelled`, `${s.cancelled} of ${s.moves}`)
          } else if (s.kind === "chart-hold") {
            /* A hold is the chart's long press: it opens the readout, as it always has. What matters is that the thumb is not trapped. */
            expect(s.page !== 0 && s.readoutEnd < 0.05 && s.row === 0, `${k}: the page still scrolls, and the readout has let go by the end`, s)
          } else if (s.kind === "chart-scrub") {
            expect(s.readout && s.page === 0 && !s.pull, `${k}: still scrubs, and the page stays put`, s)
          }
        }
        expect(r.tap.after === r.tap.tab, `a tap on ${r.tap.tab} selects it`, r.tap)
        expect(r.swipeOntoTab.selectedAfter === r.swipeOntoTab.selectedBefore && r.swipeOntoTab.row > 0,
          "a swipe that ends on another tab scrolls the row and selects nothing", r.swipeOntoTab)
      }
    }
  }
  if (process.env.OUT) writeFileSync(process.env.OUT, JSON.stringify(results, null, 2))
  console.log(`\n${broken === 0 ? "The row takes sideways swipes, the page takes the rest, and neither costs a render." : `${broken} failed`}`)
} finally {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
  for (const s of servers) s.close()
  await browser?.close()
}
process.exit(broken === 0 ? 0 : 1)
