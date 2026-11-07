/**
 * ===========================================================================
 *  ANALYTICS, ROUND 51: EMPTY CARDS, MEASURED
 * ===========================================================================
 * The owner: "Average order value says 'No orders in this period.', Returning
 * customer rate 'No customers in this period.', Total sales over time is a
 * flat line at €0.00 and Total sales by channel a bare sentence in a big empty
 * card. Make the empty state smooth and clean: a quiet placeholder shape of
 * the chart, the zero value and one short line. Same height as the filled
 * card, no layout shift when data arrives. Every analytics card."
 *
 * Mounts the real AnalyticsClient (scripts/render-analytics-page.tsx) with a
 * store that sells digital and physical products, filled and with nothing
 * yet, at 1440x900 and 390x844, and measures every card:
 *
 *   HEIGHT   each card's height empty against filled: no card moves when data
 *            arrives
 *   SHAPE    every empty list card draws its ghost rows ([data-empty-ghost]),
 *            never a sentence alone in a box. Changed on purpose (round AL),
 *            the owner: "it should be like how it was before with the purple
 *            line flat". So every empty chart draws its own purple line flat
 *            at zero, with no grey ghost curve and no grid behind it
 *   ZERO     the figures say their zero ($0.00, 0%), not a sentence in its place
 *   WAIT     every answer 2.5s away: no empty card, chart or figure moves when
 *            its answer lands
 *   SWITCH   All, Digital, Physical, All, every frame: no stale mix of types,
 *            no figure that is neither, no card that leaves and comes back
 *
 *   node scripts/check-analytics-empty-r51.mjs
 *   PAGE_ROOT=<another checkout> node scripts/check-analytics-empty-r51.mjs   (for a before)
 *   SHOTS=<dir>  keeps a full page screenshot of each state
 */
import { execFileSync } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const target = process.env.PAGE_ROOT || root
const report = !!process.env.PAGE_ROOT
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const SHOTS = process.env.SHOTS || null
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const dir = join(root, ".r51-empty-probe")
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, "native-bridge.js"), `export function hapticTap() {}\nexport function isNativeApp() { return false }\nexport async function triggerHaptic() {}\nexport function openExternal() {}\nexport function nativePlatform() { return "web" }\nexport function shareNative() { return Promise.resolve(false) }\n`)
writeFileSync(join(dir, "next-navigation.js"), `const router = { replace() {}, push() {}, refresh() {}, back() {}, forward() {}, prefetch() {} }
export function useRouter() { return router }
export function useSearchParams() { return new URLSearchParams(location.search) }
export function usePathname() { return location.pathname }
export function redirect() {}
export function notFound() {}
`)
writeFileSync(join(dir, "next-link.js"), `import * as React from "react"\nexport default function Link({ href, children, prefetch, replace, scroll, ...rest }) { return React.createElement("a", { href: String(href), ...rest }, children) }\n`)

let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : report ? "note" : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok && !report) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let server
let browser
try {
  const css = await appCss(root, existsSync(join(target, "app/globals.css")) && target !== root ? join(target, "app/globals.css") : null)
  const fonts = new Map()
  const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
    const name = path.split("/").pop()
    fonts.set(name, path)
    return `url(/__font/${name})`
  })
  const bundle = join(dir, "probe.js")
  /* The page's renderer is this checkout's (it answers /api/analytics/destinations); the app under it is PAGE_ROOT's. */
  execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-analytics-page.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${bundle}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true,versions:{},platform:"browser",cwd:function(){return "/"},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:@/lib/native-bridge=${join(dir, "native-bridge.js")}`,
    `--alias:next/navigation=${join(dir, "next-navigation.js")}`,
    `--alias:next/link=${join(dir, "next-link.js")}`,
    `--alias:@=${target}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
    { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
  const js = readFileSync(bundle)
  const html = `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style><script>
window.__long = [];
try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push({ at: e.startTime, ms: Math.round(e.duration) }) }).observe({ type: "longtask", buffered: true }) } catch {}
window.__images = [];
</script></head><body><div id="app"></div><script src="/probe.js"></script></body></html>`
  server = createServer((req, res) => {
    if (req.url.startsWith("/probe.js")) { res.writeHead(200, { "content-type": "text/javascript" }); return res.end(js) }
    if (req.url.startsWith("/__font/")) {
      const f = fonts.get(req.url.split("/").pop())
      if (f && existsSync(f)) { res.writeHead(200, { "content-type": "font/woff2" }); return res.end(readFileSync(f)) }
    }
    const file = join(target, "public", decodeURIComponent(req.url.split("?")[0]))
    if (/^\/(integrations|flags)\//.test(req.url) && existsSync(file)) {
      /* As a CDN far away answers: the marks were fetched once the dialog had opened. */
      return setTimeout(() => { res.writeHead(200, { "content-type": file.endsWith(".svg") ? "image/svg+xml" : "image/png" }); res.end(readFileSync(file)) }, 300)
    }
    res.writeHead(200, { "content-type": "text/html" }); res.end(html)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  const origin = `http://127.0.0.1:${server.address().port}`
  browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--disable-gpu"], ignoreDefaultArgs: ["--hide-scrollbars"] })

  const open = async (vp, query) => {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("storelib.analytics.reports.v3:c1", JSON.stringify(["pageviews", "sessions", "clicks", "toplinks", "refunds", "downloads"])) } catch {}
    })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)))
    await p.goto(`${origin}/app/analytics${query}`, { waitUntil: "load" })
    await p.waitForFunction(() => document.querySelector("[data-analytics-head]") && !document.querySelector('[aria-busy="true"]'), { timeout: 20000 }).catch(() => {})
    await sleep(1200)
    return { p, ctx, errors }
  }
  const shot = async (p, name, w) => {
    if (!SHOTS) return
    const h = await p.evaluate(() => Math.max(document.documentElement.scrollHeight, ...[...document.querySelectorAll(".page-scroll")].map((s) => s.scrollHeight)))
    await p.setViewport({ ...p.viewport(), height: Math.min(6000, h) })
    await new Promise((r) => setTimeout(r, 400))
    await p.screenshot({ path: join(SHOTS, `r51-${name}-${w}.png`) })
  }
  const cardsOf = (p) =>
    p.evaluate(() =>
      Object.fromEntries(
        [...document.querySelectorAll("section[data-card]")].map((c) => {
          const r = c.getBoundingClientRect()
          const text = c.innerText.replace(/\s+/g, " ").trim()
          return [c.getAttribute("data-card"), { h: Math.round(r.height), ghost: !!c.querySelector("[data-empty-ghost], [data-trend-chart], [data-chart-loading]"), curve: !!c.querySelector("[data-ghost-chart]"), empty: !!c.querySelector("[data-empty], [data-figure-empty]"), sentenceAsValue: !!c.querySelector("[data-figure-empty]"), chart: !!c.querySelector("[data-trend-chart]"), text: text.slice(0, 90) }]
        }),
      ),
    )

  /* The page while every answer takes 2.5s, then once they are in: what moved when the numbers came. */
  const arriving = async (vp, query) => {
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport(vp)
    await p.evaluateOnNewDocument(() => {
      try { localStorage.setItem("storelib.analytics.reports.v3:c1", JSON.stringify(["pageviews", "sessions", "clicks", "toplinks", "refunds", "downloads"])) } catch {}
    })
    await p.goto(`${origin}/app/analytics${query}&delay=2500`, { waitUntil: "load" })
    await sleep(900)
    const waiting = await cardsOf(p)
    await sleep(4500)
    const done = await cardsOf(p)
    await ctx.close()
    return Object.keys(done).filter((k) => waiting[k] && Math.abs(waiting[k].h - done[k].h) > 1).map((k) => ({ k, fixed: FIXED(k, done[k]), text: `${k} ${waiting[k].h}→${done[k].h}` }))
  }
  /* The cards whose shape is the same whatever the numbers: a chart or a figure. A list is as long as what it lists. */
  const FIXED = (k, c) => ["aov", "returning", "sales-over-time"].includes(k) || /^(pageviews|sessions|clicks|refunds)$/.test(k) || c.chart

  /* SWITCH_ONLY=1 measures the switching alone. */
  for (const [w, vp] of process.env.SWITCH_ONLY ? [] : [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    console.log(`\n${w} wide`)
    const full = await open(vp, "?seller=both")
    const filled = await cardsOf(full.p)
    await shot(full.p, "filled", w)
    await full.ctx.close()
    const e = await open(vp, "?seller=both&empty=1")
    await e.p.waitForFunction(() => document.querySelectorAll("[data-empty]").length > 3, { timeout: 15000 }).catch(() => {})
    await sleep(300)
    const empty = await cardsOf(e.p)
    /* Every chart on the page with nothing to draw: its purple line, flat (one y for every point), and the grid lines behind it. */
    const charts = await e.p.evaluate(() => [...document.querySelectorAll("[data-trend-chart], [data-chart-loading]")].map((chart) => {
      const line = chart.querySelector("path[data-trend-line]")
      const d = line?.getAttribute("d") ?? ""
      const ys = [...d.matchAll(/[ML,C]\s*-?[\d.]+,(-?[\d.]+)/g)].map((m) => Number(m[1]))
      const stroke = line ? getComputedStyle(line).stroke : ""
      return {
        purple: /rgb\(139, 92, 246\)|rgb\(124, 58, 237\)/.test(stroke),
        flat: ys.length > 1 && Math.max(...ys) - Math.min(...ys) < 0.5,
        grid: chart.querySelectorAll(".recharts-cartesian-grid line").length,
        curve: !!chart.querySelector("[data-ghost-chart]"),
      }
    }))
    const axis = await e.p.evaluate(() => [...document.querySelectorAll("[data-chart-loading] *")].filter((n) => n.children.length === 0 && /^\d+$/.test(n.textContent.trim()) && Number(getComputedStyle(n.parentElement).opacity) > 0.01 && Number(getComputedStyle(n).opacity) > 0.01 && n.closest("[style*='opacity: 1']")).length)
    await shot(e.p, "empty", w)
    const moved = Object.keys(empty).filter((k) => filled[k] && FIXED(k, empty[k]) && Math.abs(filled[k].h - empty[k].h) > 1).map((k) => `${k} ${filled[k].h}→${empty[k].h}`)
    /* A figure card's shape is its zero ($0.00, 0%): round AL took the grey curve off its right. */
    const bare = Object.entries(empty).filter(([k, c]) => c.empty && !c.ghost && !["aov", "returning"].includes(k) && !/could not be read/.test(c.text)).map(([k, c]) => `${k}: ${c.text}`)
    const sentenceValues = Object.entries(empty).filter(([, c]) => c.sentenceAsValue).map(([k]) => k)
    const shiftEmpty = (await arriving(vp, "?seller=both&empty=1")).map((x) => x.text)
    /* Filled, a list grows to what it lists (four channels where three were waiting): only the charts and figures must not move. */
    const arrivedFull = await arriving(vp, "?seller=both")
    const shiftFull = arrivedFull.filter((x) => x.fixed).map((x) => x.text)
    if (arrivedFull.length > shiftFull.length) console.log("  lists that grew to their rows:", JSON.stringify(arrivedFull.filter((x) => !x.fixed).map((x) => x.text)))
    console.log("  cards:", Object.keys(empty).length, " charts and figures, empty against filled:", JSON.stringify(moved))
    console.log("  moved when the answer came:", JSON.stringify({ empty: shiftEmpty, filled: shiftFull }))
    console.log("  empty without a shape:", JSON.stringify(bare))
    console.log("  a sentence where the figure goes:", JSON.stringify(sentenceValues), " empty charts:", charts.length, " purple:", charts.filter((c) => c.purple).length, " flat:", charts.filter((c) => c.flat).length, " grid lines:", charts.reduce((n, c) => n + c.grid, 0), " grey curves:", charts.filter((c) => c.curve).length + Object.values(empty).filter((c) => c.curve).length, " axis numbers over nothing:", axis)
    expect(moved.length === 0, "a chart or figure card is the same height empty and filled", moved)
    expect(shiftEmpty.length === 0 && shiftFull.length === 0, "no empty card, and no chart or figure, changes height when its answer arrives", { shiftEmpty, shiftFull })
    expect(bare.length === 0, "every empty list or chart card draws a quiet shape of what would be there", bare)
    expect(sentenceValues.length === 0, "every figure says its zero, with a short line under it", sentenceValues)
    expect(charts.length > 0 && charts.every((c) => c.purple && c.flat), "every empty chart draws its purple line flat at zero", charts)
    expect(charts.every((c) => c.grid === 0 && !c.curve) && !Object.values(empty).some((c) => c.curve), "no grid and no grey curve behind an empty chart", charts)
    expect(axis === 0, "no axis numbers over nothing", axis)
    expect(e.errors.length === 0 && full.errors.length === 0, "no page errors", [...e.errors, ...full.errors])
    await e.ctx.close()
  }
  /*
    SWITCHING TYPES, FRAME BY FRAME (the owner: "switching between analytics types must work and feel smooth: no stale
    numbers, no flashes"). A store that sells both kinds, every answer 600ms away: All, Digital, Physical, All. Every
    frame of each switch reads the Revenue tab, the breakdown's Total sales and how many cards there are. Stale is a
    frame where the two disagree once the new answer is in (one card on the new type, the other on the old); a flash is
    a frame with fewer cards than before and after, or a figure that is neither the old nor the new one.
  */
  {
    console.log("\nswitching types, 1440 wide")
    const ctx = await browser.createBrowserContext()
    const p = await ctx.newPage()
    await p.setViewport({ width: 1440, height: 900 })
    const errors = []
    p.on("pageerror", (e) => errors.push(String(e.message || e).slice(0, 200)))
    await p.goto(`${origin}/app/analytics?seller=both&physical=1&delay=600`, { waitUntil: "load" })
    await p.waitForFunction(() => !!document.querySelector("[data-kind-picker]") && !document.querySelector('[aria-busy="true"]'), { timeout: 30000 }).catch(() => {})
    await sleep(2500)
    const read = () =>
      p.evaluate(() => {
        const money = (t) => (t.match(/\$[\d,]+\.\d{2}/) || [""])[0]
        const tab = money(document.querySelector('[role=tablist][aria-label=Metric] [data-tab="revenue"]')?.textContent ?? "")
        const total = money([...document.querySelectorAll("[data-card=sales-breakdown] .divide-y > div")].find((d) => d.firstElementChild?.textContent.trim() === "Total sales")?.lastElementChild?.lastElementChild?.textContent ?? "")
        return { tab, total, cards: document.querySelectorAll("section[data-card]").length, ids: [...document.querySelectorAll("section[data-card]")].map((c) => c.getAttribute("data-card")).join() }
      })
    const frames = async (label) => {
      const before = await read()
      /* The type picker (components/app/kind-picker): its button opens the list, a row chooses. */
      await p.click("[data-kind-picker]")
      await sleep(350)
      await p.evaluate((l) => [...document.querySelectorAll("[data-kind-list] [data-row]")].find((b) => b.textContent.trim().startsWith(l))?.click(), label)
      const seen = await p.evaluate(async () => {
        const money = (t) => (t.match(/\$[\d,]+\.\d{2}/) || [""])[0]
        const out = []
        const t0 = performance.now()
        while (performance.now() - t0 < 2600) {
          await new Promise((r) => requestAnimationFrame(r))
          const tab = money(document.querySelector('[role=tablist][aria-label=Metric] [data-tab="revenue"]')?.textContent ?? "")
          const total = money([...document.querySelectorAll("[data-card=sales-breakdown] .divide-y > div")].find((d) => d.firstElementChild?.textContent.trim() === "Total sales")?.lastElementChild?.lastElementChild?.textContent ?? "")
          out.push({ tab, total, cards: document.querySelectorAll("section[data-card]").length, ids: [...document.querySelectorAll("section[data-card]")].map((c) => c.getAttribute("data-card")).join() })
        }
        return out
      })
      const after = await read()
      const strange = seen.filter((f) => f.tab && f.tab !== before.tab && f.tab !== after.tab).length
      const mixed = seen.filter((f) => f.tab === after.tab && f.total && f.total !== after.total && after.tab !== before.tab).length
      const fewer = seen.filter((f) => f.cards < Math.min(before.cards, after.cards)).length
      const blank = seen.filter((f) => !f.tab || !f.total).length
      const gone = seen.find((f) => f.cards < Math.min(before.cards, after.cards))
      if (gone) console.log(`    before: ${before.ids}\n    a frame: ${gone.ids}\n    after:  ${after.ids}`)
      console.log(`  ${label}: ${before.tab}/${before.total} → ${after.tab}/${after.total}, ${seen.length} frames: strange ${strange}, stale mix ${mixed}, cards gone ${fewer}, blank ${blank}`)
      return { before, after, strange, mixed, fewer, blank }
    }
    const runs = [await frames("Digital"), await frames("Physical"), await frames("All types")]
    expect(runs[0].after.tab !== runs[0].before.tab && runs[1].after.tab !== runs[0].after.tab && runs[2].after.tab === runs[0].before.tab, "each type has its own figures, and All comes back to All's", runs.map((r) => r.after.tab))
    expect(runs.every((r) => r.after.tab === r.after.total), "once in, the Revenue tab and the breakdown's Total sales agree", runs.map((r) => r.after))
    expect(runs.every((r) => r.strange === 0 && r.blank === 0), "no frame shows a figure that is neither the old nor the new one, or none", runs.map((r) => [r.strange, r.blank]))
    expect(runs.every((r) => r.mixed === 0), "no frame shows the new type in one card and the old in another once the new one is in", runs.map((r) => r.mixed))
    expect(runs.every((r) => r.fewer === 0), "no card leaves and comes back during a switch", runs.map((r) => r.fewer))
    expect(errors.length === 0, "no page errors", errors)
    await ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
