/**
 * ===========================================================================
 *  HOME, MEASURED: THE PILL, THE PLAYED HOVER, THE PLAN CARD, THE THUMBNAILS
 * ===========================================================================
 * The real DashboardClient (scripts/render-home-cards.tsx) with the real
 * next/image, at 360, 390 and 430 as phones (touch, no hover, 3x) and at
 * 1280, 1440 and 1920 with a mouse:
 *
 *   PILL       on a phone the address pill is above the greeting, 97% of the
 *              width it had on the row beside the live count and the period
 *              (130, 160 and 200px at 360, 390 and 430, measured before the
 *              move); on a phone the View pill, at the column's right edge
 *   CARDS      "N of 7"; with every step done the card is the Challenges,
 *              each with how far it has got
 *   AUTOPLAY   on a phone a card 60% on screen plays its hover after 2s and
 *              again every 5s, letting go 1.4s after each; nothing plays off
 *              screen, under a finger, under an open sheet, in a hidden tab,
 *              with reduced motion, or anywhere a mouse can hover; while it
 *              plays only opacity, translate, rotate and scale move, frames
 *              keep up and no long task runs
 *   PLAN       every check is the same 18px light grey circle; the name
 *              "Your Plan" is at least 7:1 against every pixel of its band
 *   THUMBNAILS each quick action's picture is the optimiser's smallest width
 *              that fills 64px at the screen's density, AVIF, lazy, async,
 *              64x64 held; bytes and decoded memory against what width={128}
 *              asked for (fetched from storelib.com's own optimiser)
 *   SCROLL     a phone scrolling the whole page: frame gaps, long tasks and
 *              layout shift
 *
 *   node scripts/check-home-flow.mjs
 *   SHOTS=/some/dir node scripts/check-home-flow.mjs
 */
import { execFile, execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const run = promisify(execFile)
const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || join(mkdtempSync(join(tmpdir(), "home-flow-")), "shots")
/* QUICK=1 leaves out the timed parts (the played hover, the scroll): the pictures and the geometry only. */
const QUICK = process.env.QUICK === "1"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
mkdirSync(SHOTS, { recursive: true })

/* The phone pill's width before it moved above the greeting, measured with Inter on the committed row. */
const PILL_BEFORE = { 360: 130, 390: 160, 430: 200 }

const dir = join(root, ".home-flow-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "navigation.js"), `export const usePathname = () => "/app"
export const useRouter = () => ({ push() {}, prefetch() { (window.__prefetched ||= []).push(arguments[0]) }, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(dir, "link.jsx"), `import React from "react"
const Link = React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { ref, href: typeof href === "string" ? href : "#", onClick: (e) => { onClick && onClick(e); e.preventDefault() }, ...rest }, children)
})
export default Link
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(dir, "supabase.js"), `const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: [], error: null, count: 0 }) : q, apply: () => q })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: () => q, rpc: () => q, storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
export function isNativePlatform() { return false }
`)
try {
  execFileSync("pnpm", ["exec", "esbuild", join(root, "scripts/render-home-cards.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(dir, "probe.js")}`,
    '--define:process.env.NODE_ENV="production"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_URL="https://probe.invalid"',
    '--define:process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="probe-anon-key"',
    `--alias:next/navigation=${join(dir, "navigation.js")}`, `--alias:next/link=${join(dir, "link.jsx")}`,
    `--alias:@/lib/supabase/client=${join(dir, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { stdio: ["ignore", "ignore", "inherit"] })
} catch { rmSync(dir, { recursive: true, force: true }); fail("the probe did not bundle") }
let fontDir = null
const fonts = interFaces(root).replace(/url\(file:\/\/([^)]*\/static\/media)\/([^)]+)\)/g, (_, d, f) => { fontDir = d; return `url(/__font/${f})` })
const html = `<!doctype html><html class="light app-layout"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${fonts}</style><style>${await appCss(root)}</style><style>html,body{margin:0;height:100%;font-family:Inter,system-ui,sans-serif}#app{height:100%}</style>` +
  `</head><body><div id="app"></div><script>window.process={env:{NODE_ENV:"production"}}</script><script>${readFileSync(join(dir, "probe.js"), "utf8")}</script></body></html>`
rmSync(dir, { recursive: true, force: true })

/* The optimiser's answers, fetched once from storelib.com and kept for the run. */
const cacheDir = mkdtempSync(join(tmpdir(), "home-flow-images-"))
const optimised = new Map()
async function optimiserBytes(query) {
  if (optimised.has(query)) return optimised.get(query)
  const file = join(cacheDir, `${optimised.size}.bin`)
  const pending = run("curl", ["-sS", "--max-time", "20", "-o", file, "-w", "%{http_code} %{content_type}", "-H", "Accept: image/avif,image/webp,image/*,*/*;q=0.8", `https://storelib.com/_next/image?${query}`])
    .then(({ stdout }) => {
      const [code, type] = stdout.trim().split(" ")
      return code === "200" ? { body: readFileSync(file), type } : null
    })
    .catch(() => null)
  optimised.set(query, pending)
  return pending
}
const served = []
const server = createServer(async (req, res) => {
  if (req.url.startsWith("/__font/") && fontDir) {
    try { res.writeHead(200, { "content-type": "font/woff2" }); res.end(readFileSync(join(fontDir, req.url.slice(8)))) } catch { res.writeHead(404); res.end() }
    return
  }
  if (req.url.startsWith("/_next/image?")) {
    const query = req.url.slice("/_next/image?".length)
    const got = await optimiserBytes(query)
    if (!got) { res.writeHead(502); res.end(); return }
    served.push({ query, bytes: got.body.length, type: got.type })
    res.writeHead(200, { "content-type": got.type, "cache-control": "no-store" })
    res.end(got.body)
    return
  }
  if (req.url.startsWith("/api/") || /\.(png|jpe?g|webp|svg)(\?|$)/.test(req.url)) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const base = `http://127.0.0.1:${server.address().port}`

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const report = {}

async function load(page, query = "") {
  await page.goto(`${base}/app${query}`)
  await page.waitForSelector("#getting-started", { timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  await wait(500)
  const threw = await page.evaluate(() => window.__threw || null)
  expect(!threw, "it renders", threw)
}

/** Everything on the page, in one tall screenshot: the scroller is as tall as the window. */
async function fullShot(page, file, width) {
  const h = await page.evaluate(() => {
    const sc = document.querySelector(".dashboard-scroll-container")
    return Math.ceil(sc.scrollHeight)
  })
  const vp = page.viewport()
  await page.setViewport(vp ? { ...vp, height: Math.min(h, 6000) } : { width, height: Math.min(h, 6000), deviceScaleFactor: 1 })
  await wait(300)
  await page.screenshot({ path: join(SHOTS, file) })
  if (vp) await page.setViewport(vp)
  await wait(200)
}

/** Scroll the dashboard so an element's top sits `at` px below the top of the window. */
async function bringTo(page, selector, at = 120) {
  await page.evaluate((sel, at) => {
    const sc = document.querySelector(".dashboard-scroll-container")
    const el = document.querySelector(sel)
    sc.scrollTop += el.getBoundingClientRect().top - at
  }, selector, at)
  await wait(120)
}

/** The worst contrast of the name "Your Plan" against its band: the name's ink on each pixel under it, the words hidden. */
async function planContrast(page) {
  await bringTo(page, "[aria-labelledby=your-plan-title]", 140)
  const { box, ink } = await page.evaluate(() => {
    const h = document.getElementById("your-plan-title")
    const ink = getComputedStyle(h).color
    h.style.color = "transparent"
    const b = h.getBoundingClientRect()
    return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, ink }
  })
  const png = await page.screenshot({ clip: box, encoding: "base64" })
  const worst = await page.evaluate(async (data, ink) => {
    const img = new Image()
    img.src = `data:image/png;base64,${data}`
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.naturalWidth
    c.height = img.naturalHeight
    const ctx = c.getContext("2d")
    ctx.drawImage(img, 0, 0)
    const d = ctx.getImageData(0, 0, c.width, c.height).data
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
    const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const inkL = lum(...ink.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number))
    let worst = Infinity
    for (let i = 0; i < d.length; i += 4) {
      const L = lum(d[i], d[i + 1], d[i + 2])
      worst = Math.min(worst, (Math.max(L, inkL) + 0.05) / (Math.min(L, inkL) + 0.05))
    }
    return worst
  }, png, ink)
  await page.evaluate(() => { document.getElementById("your-plan-title").style.color = "" })
  return Math.round(worst * 10) / 10
}

/** A timeline of `data-play` on a card, from now, for `ms`. */
function watchPlays(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel)
    window.__mo?.disconnect()
    window.__po?.disconnect()
    window.__plays = []
    window.__t0 = performance.now()
    window.__props = new Set()
    window.__gaps = []
    window.__longs = []
    window.__windows = []
    try {
      window.__po = new PerformanceObserver((list) => { for (const e of list.getEntries()) window.__longs.push([e.startTime, e.duration]) })
      window.__po.observe({ type: "longtask", buffered: false })
    } catch {}
    window.__mo = new MutationObserver(() => {
      const on = el.hasAttribute("data-play")
      window.__plays.push([Math.round(performance.now() - window.__t0), on ? "play" : "settle"])
      if (on) {
        /* What moves in the card while it plays: every running animation's properties. */
        const t = performance.now()
        window.__windows.push([t, t + 2200])
        const sample = () => {
          for (const a of el.getAnimations({ subtree: true })) {
            if (a.transitionProperty) window.__props.add(a.transitionProperty)
            else for (const k of a.effect?.getKeyframes?.() ?? []) for (const p of Object.keys(k)) if (!["offset", "easing", "composite", "computedOffset"].includes(p)) window.__props.add(p)
          }
          if (performance.now() - t < 900) requestAnimationFrame(sample)
        }
        requestAnimationFrame(sample)
        let last = 0
        const gap = (now) => { if (last) window.__gaps.push(now - last); last = now; if (now - t < 2200) requestAnimationFrame(gap) }
        requestAnimationFrame(gap)
      }
    })
    window.__mo.observe(el, { attributes: true, attributeFilter: ["data-play"] })
  }, selector)
}
/* Long tasks are counted inside the plays only: the first load's own work is not the hover's. */
const playLog = (page) => page.evaluate(() => ({
  plays: window.__plays,
  props: [...window.__props],
  gaps: window.__gaps,
  long: window.__longs.filter(([at, d]) => window.__windows.some(([a, b]) => at + d > a && at < b)).length,
}))

try {
  /* ── Phones: touch, no hover, 3x ───────────────────────────────────────── */
  {
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], headless: true })
    for (const width of [360, 390, 430]) {
      console.log(`\nphone ${width}`)
      const page = await browser.newPage()
      const errors = []
      page.on("pageerror", (e) => errors.push(String(e)))
      await page.setViewport({ width, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
      served.length = 0
      await load(page)
      const hover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
      expect(!hover, "a touch screen, no hover")

      /* The pill, above the greeting. */
      const head = await page.evaluate(() => {
        const pill = [...document.querySelectorAll("[data-share-pill]")].find((p) => p.getClientRects().length)
        const h1 = document.querySelector("h1")
        const live = [...document.querySelectorAll("[aria-busy]")].find((x) => /live/.test(x.textContent) && x.getClientRects().length)
        const b = pill.getBoundingClientRect()
        const path = pill.querySelector("svg path")
        return {
          pill: { x: Math.round(b.x), y: Math.round(b.y), w: +b.width.toFixed(1), bottom: Math.round(b.bottom), right: Math.round(b.right) },
          column: Math.round(h1.parentElement.parentElement.getBoundingClientRect().right),
          h1Top: Math.round(h1.getBoundingClientRect().top),
          liveTop: live ? Math.round(live.getBoundingClientRect().top) : null,
          fill: path?.getAttribute("fill"),
          filter: path?.getAttribute("filter"),
          cut: !!pill.querySelector("[data-cut]"),
          view: pill.textContent.trim(),
        }
      })
      expect(head.pill.bottom < head.h1Top, "the pill is above the greeting", head)
      expect(Math.abs(head.pill.right - head.column) <= 1, "at the right edge of the column", { pill: head.pill.right, column: head.column })
      expect(head.liveTop != null && head.liveTop > head.h1Top, "the live count and the period are on the row under it", head.liveTop)
      /* On a phone it is the light grey View pill (an eye and a word), well inside the room it has. */
      expect(head.view === "View" && head.pill.w <= PILL_BEFORE[width] * 0.97, "the View pill, within the room it has", { view: head.view, w: head.pill.w })
      report[`pill-${width}`] = head.pill
      await page.screenshot({ path: join(SHOTS, `phone-${width}-header.png`), clip: { x: 0, y: 0, width, height: 330 } })

      /* The plan card. */
      const plan = await page.evaluate(() => {
        const checks = [...document.querySelectorAll("[data-plan-check]")].map((c) => {
          const b = c.getBoundingClientRect()
          return { w: b.width, h: b.height, bg: getComputedStyle(c).backgroundColor, ink: getComputedStyle(c.querySelector("svg")).color }
        })
        return checks
      })
      expect(plan.length >= 5 && plan.every((c) => c.w === 18 && c.h === 18 && c.bg === "rgb(241, 242, 244)" && c.ink === "rgb(107, 114, 128)"), "every plan check is the same 18px light grey circle with a grey check", plan[0])
      const contrast = await planContrast(page)
      expect(contrast >= 4.5, "the white name on the plan's violet sky, at its worst pixel, is 4.5:1 or better", `${contrast}:1`)
      report[`contrast-${width}`] = contrast
      await page.screenshot({ path: join(SHOTS, `phone-${width}-plan-band.png`), clip: await page.evaluate(() => { const b = document.querySelector(".home-plan-head").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height } }) })

      /* The played hover, on Getting started. */
      if (width === 390 && !QUICK) {
        await bringTo(page, "#getting-started", 90)
        await watchPlays(page, "#getting-started")
        await wait(15000)
        const log = await playLog(page)
        const plays = log.plays.filter(([, k]) => k === "play").map(([t]) => t)
        const settles = log.plays.filter(([, k]) => k === "settle").map(([t]) => t)
        expect(plays.length === 3 && Math.abs(plays[0] - 2000) < 200 && Math.abs(plays[1] - plays[0] - 6000) < 200 && Math.abs(plays[2] - plays[1] - 6000) < 200, "on screen it plays after 2s, then every 6s", log.plays)
        expect(settles.length >= 2 && Math.abs(settles[0] - plays[0] - 2200) < 200, "and lets go 2.2s after each", settles)
        expect(log.props.length > 0 && log.props.every((p) => ["opacity", "translate", "rotate", "scale"].includes(p)), "only opacity, translate, rotate and scale move", log.props)
        const sorted = [...log.gaps].sort((a, b) => a - b)
        const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0
        expect(p95 < 20 && log.long === 0, "frames keep up while it plays, no long task", { p95: +p95.toFixed(1), long: log.long, frames: sorted.length })
        report.autoplay = { plays, settles, props: log.props, p95: +p95.toFixed(1), long: log.long }
        await page.screenshot({ path: join(SHOTS, `phone-${width}-getting-started-rest.png`), clip: await page.evaluate(() => { const b = document.getElementById("getting-started").getBoundingClientRect(); return { x: b.x - 8, y: Math.max(0, b.y - 8), width: b.width + 16, height: Math.min(b.height + 24, 780) } }) })

        /* Off screen: nothing. */
        await page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })
        await wait(150)
        await watchPlays(page, "#getting-started")
        await wait(7500)
        const off = await playLog(page)
        expect(off.plays.length === 0, "off screen it never plays", off.plays)

        /* Under a finger: nothing, then it starts over when the finger lifts. */
        await bringTo(page, "#getting-started", 90)
        await watchPlays(page, "#getting-started")
        const at = await page.evaluate(() => { const b = document.getElementById("getting-started").getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + 30 } })
        await page.touchscreen.touchStart(at.x, at.y)
        await wait(7000)
        const held = await playLog(page)
        await page.touchscreen.touchEnd()
        await wait(2600)
        const after = await playLog(page)
        expect(held.plays.length === 0, "a finger on the card holds it still", held.plays)
        expect(after.plays.some(([t, k]) => k === "play" && t > 7000 && t < 9400), "and it plays 2s after the finger lifts", after.plays)

        /* A hidden tab: nothing. */
        await watchPlays(page, "#getting-started")
        await page.evaluate(() => {
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
          document.dispatchEvent(new Event("visibilitychange"))
        })
        await wait(7500)
        const hidden = await playLog(page)
        expect(hidden.plays.every(([, k]) => k === "settle"), "a hidden tab never plays", hidden.plays)
        await page.evaluate(() => {
          delete document.visibilityState
          document.dispatchEvent(new Event("visibilitychange"))
        })

        /* A sheet over the page (the shared sheet marks <html>): nothing moves under it. */
        await page.evaluate(() => document.documentElement.setAttribute("data-app-sheet-up", "open"))
        await bringTo(page, "#getting-started", 90)
        await watchPlays(page, "#getting-started")
        await wait(7500)
        const covered = await playLog(page)
        expect(!covered.plays.some(([, k]) => k === "play"), "under an open sheet it never plays", covered.plays)
        await page.evaluate(() => document.documentElement.removeAttribute("data-app-sheet-up"))

        /* The guide and the plan play too. */
        for (const [sel, name] of [[".home-guide", "the guide"], ["[aria-labelledby=your-plan-title]", "the plan"]]) {
          /* From the top first, where no card is on screen, so each one starts its two seconds here. */
          await page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })
          await wait(200)
          await bringTo(page, sel, 110)
          await watchPlays(page, sel)
          await wait(2500)
          const l = await playLog(page)
          expect(l.plays.some(([, k]) => k === "play"), `${name} plays its hover too`, l.plays)
          if (sel === ".home-guide") {
            await wait(200)
            await page.evaluate((s) => document.querySelector(s).setAttribute("data-play", ""), sel)
            await wait(900)
            await page.screenshot({ path: join(SHOTS, `phone-${width}-guide-playing.png`), clip: await page.evaluate((s) => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.x - 8, y: Math.max(0, b.y - 8), width: b.width + 16, height: b.height + 24 } }, sel) })
          }
        }

        /* Reduced motion: nothing. */
        await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
        await bringTo(page, "#getting-started", 90)
        await wait(100)
        await watchPlays(page, "#getting-started")
        await wait(3000)
        const calm = await playLog(page)
        expect(calm.plays.every(([, k]) => k === "settle"), "with reduced motion it never plays", calm.plays)
        await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "no-preference" }])

        /* Scrolling the whole page: frame gaps, long tasks, layout shift. */
        await page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })
        await wait(300)
        const scroll = await page.evaluate(() => new Promise((resolve) => {
          const sc = document.querySelector(".dashboard-scroll-container")
          const max = sc.scrollHeight - sc.clientHeight
          const gaps = []
          let long = 0
          let shift = 0
          try { new PerformanceObserver((l) => { long += l.getEntries().length }).observe({ type: "longtask" }) } catch {}
          try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) shift += e.value }).observe({ type: "layout-shift" }) } catch {}
          const t0 = performance.now()
          let last = 0
          const step = (now) => {
            if (last) gaps.push(now - last)
            last = now
            const k = Math.min(1, (now - t0) / 2400)
            sc.scrollTop = max * k
            if (k < 1) requestAnimationFrame(step)
            else setTimeout(() => {
              const s = [...gaps].sort((a, b) => a - b)
              resolve({ frames: gaps.length, p50: +s[Math.floor(s.length / 2)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1), long, cls: +shift.toFixed(4) })
            }, 300)
          }
          requestAnimationFrame(step)
        }))
        expect(scroll.p95 < 20 && scroll.long === 0 && scroll.cls < 0.01, "the page scrolls end to end with frames kept, no long task and no layout shift", scroll)
        report.scroll = scroll
      }

      /* The thumbnails: what each screen fetched and decoded. */
      await page.evaluate(() => { const sc = document.querySelector(".dashboard-scroll-container"); sc.scrollTop = sc.scrollHeight })
      await page.waitForFunction(() => [...document.querySelectorAll("[data-quick-thumb]")].every((i) => i.complete && i.currentSrc), { timeout: 20000 }).catch(() => {})
      await wait(300)
      const thumbs = await page.evaluate(() => [...document.querySelectorAll("[data-quick-thumb]")].map((img) => ({
        w: Number(new URL(img.currentSrc, location.href).searchParams.get("w")),
        natural: [img.naturalWidth, img.naturalHeight],
        box: [img.getBoundingClientRect().width, img.getBoundingClientRect().height],
        attrs: { width: img.getAttribute("width"), height: img.getAttribute("height"), sizes: img.getAttribute("sizes"), loading: img.getAttribute("loading"), decoding: img.getAttribute("decoding"), fetchpriority: img.getAttribute("fetchpriority") },
        complete: img.complete,
      })))
      const bytes = served.filter((s) => /platform%2520images/.test(s.query)).reduce((n, s) => n + s.bytes, 0)
      const types = [...new Set(served.map((s) => s.type))]
      expect(thumbs.length === 4 && thumbs.every((t) => t.complete && t.w === 256), "at 3x each picture is the 256px copy, the smallest that fills 192 device pixels", thumbs.map((t) => t.w))
      expect(thumbs.every((t) => t.attrs.width === "64" && t.attrs.height === "64" && t.attrs.sizes === "64px" && t.attrs.loading === "lazy" && t.attrs.decoding === "async"), "64x64 held, sizes 64px, lazy, decoded off the main thread", thumbs[0]?.attrs)
      expect(types.every((t) => t === "image/avif"), "served as AVIF", types)
      report[`thumbs-${width}`] = { widths: thumbs.map((t) => t.w), bytes, decoded: thumbs.reduce((n, t) => n + t.w * t.w * 4, 0) }

      /* Everything, for the eye. */
      await page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })
      await fullShot(page, `phone-${width}-home.png`, width)
      expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
      await page.close()

      /* The challenges, once every step is done. */
      if (width === 390) {
        const p2 = await browser.newPage()
        await p2.setViewport({ width, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
        await load(p2, "?all=1")
        const ch = await p2.evaluate(() => {
          const gs = document.getElementById("getting-started")
          return {
            title: gs.querySelector("h2").textContent.trim(),
            count: gs.querySelector("[data-progress-count]").textContent.trim(),
            rows: [...gs.querySelectorAll("li")].map((li) => li.textContent.replace(/\s+/g, " ").trim()),
          }
        })
        expect(ch.title === "Challenges" && /^\d of 8$/.test(ch.count) && ch.rows.length === 8, "with every step done the card is the Challenges", ch)
        expect(ch.rows.some((r) => /Make 10 sales\s*6\/10/.test(r)) && ch.rows.some((r) => /Reach 50 subscribers\s*12\/50/.test(r)) && ch.rows.some((r) => /\$174\/\$1,000/.test(r)), "each with how far it has got", ch.rows)
        await bringTo(p2, "#getting-started", 80)
        await p2.screenshot({ path: join(SHOTS, `phone-${width}-challenges.png`), clip: await p2.evaluate(() => { const b = document.getElementById("getting-started").getBoundingClientRect(); return { x: b.x - 8, y: Math.max(0, b.y - 8), width: b.width + 16, height: Math.min(b.height + 24, 760) } }) })
        await p2.close()
      }
    }
    await browser.close()
  }

  /* ── Computers: a mouse ─────────────────────────────────────────────────── */
  const MOUSE = "--blink-settings=availableHoverTypes=2,primaryHoverType=2,availablePointerTypes=4,primaryPointerType=4"
  for (const width of [1280, 1440, 1920]) {
    console.log(`\ndesktop ${width}`)
    const browser = await puppeteer.launch({ executablePath: CHROMIUM, defaultViewport: null, args: ["--no-sandbox", MOUSE, `--window-size=${width},1000`], headless: true })
    const [page] = await browser.pages()
    const errors = []
    page.on("pageerror", (e) => errors.push(String(e)))
    served.length = 0
    await load(page)
    const hover = await page.evaluate(() => matchMedia("(hover: hover) and (pointer: fine)").matches)
    expect(hover, "a mouse")
    const head = await page.evaluate(() => {
      const pill = [...document.querySelectorAll("[data-share-pill]")].find((p) => p.getClientRects().length)
      const b = pill.getBoundingClientRect()
      const h1 = document.querySelector("h1").getBoundingClientRect()
      return { right: Math.round(b.right), top: Math.round(b.top), h1Top: Math.round(h1.top), h1Bottom: Math.round(h1.bottom), fill: pill.querySelector("svg path")?.getAttribute("fill"), phonePill: !!document.querySelector("[data-home-phone-pill]")?.getClientRects().length }
    })
    expect(!head.phonePill && head.top < head.h1Bottom, "the pill stays on the greeting's row, on the right", head)
    expect(head.fill === "#8b56fa", "the same violet S", head.fill)
    await page.screenshot({ path: join(SHOTS, `desktop-${width}-header.png`), clip: { x: 0, y: 0, width, height: 260 } })

    /* A mouse never sees the played hover. */
    await bringTo(page, "#getting-started", 120)
    if (!QUICK) {
      await watchPlays(page, "#getting-started")
      await wait(7200)
      const log = await playLog(page)
      expect(log.plays.length === 0, "with a mouse nothing plays by itself", log.plays)
    }
    /* The hover itself moves only opacity and the transform properties. */
    const box = await page.evaluate(() => { const b = document.getElementById("getting-started").getBoundingClientRect(); return { x: b.x + 40, y: b.y + 20 } })
    await page.evaluate(() => { window.__hp = new Set(); const card = document.getElementById("getting-started"); const t = performance.now(); const f = () => { for (const a of card.getAnimations({ subtree: true })) if (a.transitionProperty) window.__hp.add(a.transitionProperty); if (performance.now() - t < 800) requestAnimationFrame(f) }; requestAnimationFrame(f) })
    await page.mouse.move(box.x, box.y)
    await wait(900)
    const hp = await page.evaluate(() => [...window.__hp])
    expect(hp.length > 0 && hp.every((p) => ["opacity", "translate", "rotate", "scale"].includes(p)), "hovering a card moves only opacity, translate and rotate", hp)
    await page.screenshot({ path: join(SHOTS, `desktop-${width}-cards-hover.png`), clip: await page.evaluate(() => { const g = document.getElementById("getting-started").parentElement.getBoundingClientRect(); return { x: g.x - 12, y: Math.max(0, g.y - 12), width: g.width + 24, height: g.height + 40 } }) })
    await page.mouse.move(5, 5)

    const contrast = await planContrast(page)
    expect(contrast >= 4.5, "the white name on the plan's violet sky is 4.5:1 or better", `${contrast}:1`)
    report[`contrast-${width}`] = contrast

    await page.evaluate(() => { const sc = document.querySelector(".dashboard-scroll-container"); sc.scrollTop = sc.scrollHeight })
    await page.waitForFunction(() => [...document.querySelectorAll("[data-quick-thumb]")].every((i) => i.complete && i.currentSrc), { timeout: 20000 }).catch(() => {})
    await wait(300)
    const thumbs = await page.evaluate(() => [...document.querySelectorAll("[data-quick-thumb]")].map((img) => ({ w: Number(new URL(img.currentSrc, location.href).searchParams.get("w")), natural: [img.naturalWidth, img.naturalHeight], complete: img.complete })))
    const bytes = served.filter((s) => /platform%2520images/.test(s.query)).reduce((n, s) => n + s.bytes, 0)
    expect(thumbs.length === 4 && thumbs.every((t) => t.complete && t.w === 64), "at 1x each picture is the 64px copy", thumbs.map((t) => t.w))
    report[`thumbs-${width}`] = { widths: thumbs.map((t) => t.w), bytes, decoded: thumbs.reduce((n, t) => n + t.w * t.w * 4, 0) }
    await page.evaluate(() => { document.querySelector(".dashboard-scroll-container").scrollTop = 0 })
    await fullShot(page, `desktop-${width}-home.png`, width)
    expect(errors.length === 0, "no errors", errors.slice(0, 2).join(" | "))
    await browser.close()
  }

  /* ── The thumbnails before and after, from the optimiser itself ────────── */
  console.log("\nthumbnails, before (width={128}) and after (sizes=64px)")
  const names = ["iiii", "ooaw", "naaly", "domani"]
  const url = (n) => encodeURIComponent(`https://skgtqglupjcnfhfscink.supabase.co/storage/v1/object/public/platform%20images/${n}.png`)
  const size = async (w) => (await Promise.all(names.map((n) => optimiserBytes(`url=${url(n)}&w=${w}&q=75`)))).reduce((s, r) => s + (r?.body.length ?? 0), 0)
  const rows = []
  for (const [dpr, before, after] of [[1, 128, 64], [2, 256, 128], [3, 256, 256]]) {
    const [b, a] = [await size(before), await size(after)]
    rows.push({ dpr, before: { w: before, bytes: b, decoded: 4 * before * before * 4 }, after: { w: after, bytes: a, decoded: 4 * after * after * 4 } })
  }
  for (const r of rows) console.log(`  ${r.dpr}x   before w=${r.before.w} ${r.before.bytes} B, ${Math.round(r.before.decoded / 1024)} KB decoded   after w=${r.after.w} ${r.after.bytes} B, ${Math.round(r.after.decoded / 1024)} KB decoded`)
  report.thumbnails = rows
} finally {
  server.close()
  rmSync(cacheDir, { recursive: true, force: true })
}
console.log(`\n${JSON.stringify(report)}`)
console.log(`\nshots: ${SHOTS}`)
console.log(broken ? `\n${broken} failed\n` : "\nall good\n")
process.exit(broken ? 1 : 0)
