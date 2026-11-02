/**
 * ===========================================================================
 *  ANALYTICS, ROUND 49, MEASURED
 * ===========================================================================
 * The owner, with two screenshots of /app Analytics: the opened chart "too
 * big ... the scrollbar is clunky", the axis numbers "take too much space",
 * Send analytics "options and icons appear slowly", Export "on the same line
 * as the Analytics heading, icon only", and empty cards that "show –".
 *
 * Mounts the real AnalyticsClient (scripts/render-analytics-page.tsx, the
 * network answered from fixtures) at 1440x900 and 390x844 and measures:
 *
 *   HEAD     Send to and Export on the heading's line, at its right, icons
 *            with no visible words, each with an aria-label, and not in the
 *            filter row
 *   AXIS     the plot's left edge against the card's content edge: how many
 *            pixels the numbers' column takes from the line
 *   MODAL    Total sales over time opened: its width and height, its scroll
 *            bar's width, the open animation's length and what it animates,
 *            and every long task (over 50ms) from the press to the end of it
 *   SEND     Send analytics opened while the server takes 1.5s: how long
 *            until the six tools are on screen with their marks, whether the
 *            marks are fetched images, and whether a row moved when the
 *            answer came
 *   EMPTY    ?empty=1 with every report added: no card's figure or body is a
 *            bare "–", and each empty list is one line and ghost rows
 *
 *   node scripts/check-analytics-r49.mjs
 *   PAGE_ROOT=<another checkout> node scripts/check-analytics-r49.mjs   (measure it, for a before)
 *   SHOTS=<dir>  keeps a screenshot of each state
 *
 * Runs without a build: the stylesheet comes from scripts/probe-css.mjs.
 * Exit 1 when a check fails (except under PAGE_ROOT, which only reports).
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
const dir = join(root, ".r49-probe")
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
  const shot = async (p, name, w) => SHOTS && p.screenshot({ path: join(SHOTS, `r49-${name}-${w}.png`) })

  for (const [w, vp] of [["1440", { width: 1440, height: 900 }], ["390", { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
    const phone = vp.width < 640
    console.log(`\n${w} wide`)
    const { p, ctx, errors } = await open(vp, "?seller=digital")

    /* HEAD */
    const head = await p.evaluate(() => {
      const h1 = document.querySelector("[data-analytics-head] h1")?.getBoundingClientRect()
      const at = (sel) => {
        const el = document.querySelector(sel)
        if (!el) return null
        const r = el.getBoundingClientRect()
        return { cy: Math.round(r.top + r.height / 2), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim(), label: el.getAttribute("aria-label"), inHead: !!el.closest("[data-analytics-head]"), inRow: !!el.closest("[data-analytics-controls]") }
      }
      return { h1: h1 ? Math.round(h1.top + h1.height / 2) : null, send: at("[data-analytics-send]"), exp: at("[data-analytics-export]"), width: innerWidth, scroll: document.documentElement.scrollWidth }
    })
    console.log("  head:", JSON.stringify(head))
    const iconOnly = (b) => !!b && b.text === "" && !!b.label && b.w <= 40
    expect(!!head.exp && head.exp.inHead && !head.exp.inRow && Math.abs(head.exp.cy - head.h1) <= 2, "Export is on the heading's line, not in the filter row", head.exp)
    expect(!!head.send && head.send.inHead && !head.send.inRow && Math.abs(head.send.cy - head.h1) <= 2, "Send to is on the heading's line beside it", head.send)
    expect(iconOnly(head.exp) && iconOnly(head.send), "both are icons with a name for a screen reader and no words on screen", [head.exp?.text, head.send?.text])
    expect(!!head.exp && head.width - head.exp.right <= (phone ? 20 : 160), "at the right of the line", head.width - (head.exp?.right ?? 0))
    expect(head.scroll <= vp.width, "no sideways scroll", head.scroll)

    /* AXIS: the main chart's plot against its card's content, and the numbers' column. */
    const axis = await p.evaluate(() => {
      const chart = document.querySelector("[data-chart-loading='false']")
      const box = chart?.getBoundingClientRect()
      const grid = chart?.querySelector(".recharts-cartesian-grid-horizontal line")?.getBoundingClientRect()
      const labels = [...(chart?.querySelectorAll("[data-chart-axis] .chart-axis-label") ?? [])].map((s) => s.getBoundingClientRect())
      return box && grid ? { chartLeft: Math.round(box.left), plotLeft: Math.round(grid.left), plotWidth: Math.round(grid.width), chartWidth: Math.round(box.width), labelsRight: labels.length ? Math.round(Math.max(...labels.map((l) => l.right))) : null } : null
    })
    const gutter = axis ? axis.plotLeft - axis.chartLeft : null
    console.log("  axis:", JSON.stringify({ ...axis, gutter }))
    expect(gutter !== null && gutter <= 2, "the numbers take no column: the plot starts at the chart's left edge", gutter)
    await shot(p, "page", w)

    /* MODAL */
    await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0 })
    const opener = await p.$('[data-card="sales-over-time"] [data-view-report]')
    await p.evaluate((b) => b.scrollIntoView({ block: "center" }), opener)
    await sleep(400)
    const t0 = await p.evaluate(() => performance.now())
    const cdp = process.env.PROFILE ? await p.createCDPSession() : null
    if (cdp) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.setSamplingInterval", { interval: 200 }); await cdp.send("Profiler.start") }
    const tracing = process.env.TRACE && !phone ? join(dir, "trace.json") : null
    if (tracing) await p.tracing.start({ path: tracing, categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack"] })
    await opener.click()
    await sleep(600)
    if (tracing) {
      await p.tracing.stop()
      /* What the main thread spent the opening on, by kind: script, style, layout, paint. */
      const events = JSON.parse(readFileSync(tracing, "utf8")).traceEvents ?? JSON.parse(readFileSync(tracing, "utf8"))
      const sum = {}
      for (const ev of events) if (ev.ph === "X" && ev.dur && ["UpdateLayoutTree", "Layout", "FunctionCall", "EventDispatch", "Paint", "PrePaint", "Layerize", "RecalculateStyles", "TimerFire", "FireAnimationFrame", "ParseHTML", "HitTest", "IntersectionObserverController::computeIntersections"].includes(ev.name)) sum[ev.name] = Math.round((sum[ev.name] || 0) + ev.dur / 1000)
      const big = events.filter((ev) => ev.ph === "X" && ev.dur > 20000 && ["UpdateLayoutTree", "Layout"].includes(ev.name)).map((ev) => [ev.name, Math.round(ev.dur / 1000), ev.args?.elementCount ?? "", (ev.args?.beginData?.stackTrace ?? []).slice(0, 4).map((f) => `${f.functionName}:${f.lineNumber}`).join(" < ")])
      console.log("  trace (ms by kind):", JSON.stringify(sum), "big:", JSON.stringify(big.slice(0, 10)))
    }
    if (cdp) {
      const { profile } = await cdp.send("Profiler.stop")
      const self = new Map()
      const dt = profile.timeDeltas
      const byId = new Map(profile.nodes.map((n) => [n.id, n]))
      profile.samples.forEach((id, i) => { const n = byId.get(id); const k = `${n.callFrame.functionName || "(anon)"} ${n.callFrame.url.split("/").pop()}:${n.callFrame.lineNumber}`; self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000) })
      console.log("  profile (self ms):", JSON.stringify([...self].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => [k, Math.round(v)])))
    }
    const modal = await p.evaluate((t0) => {
      const panel = document.querySelector("[data-detail-panel]") || document.querySelector("[data-detail-sheet]")?.closest("[role=dialog]")
      const r = panel?.getBoundingClientRect()
      const scroller = document.querySelector("[data-detail-scroll]")
      const anim = panel?.getAnimations?.().map((a) => ({ ms: a.effect?.getTiming().duration, props: [...new Set((a.effect?.getKeyframes() ?? []).flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))] })) ?? []
      const css = panel ? getComputedStyle(panel) : null
      return {
        w: r ? Math.round(r.width) : null,
        h: r ? Math.round(r.height) : null,
        bar: scroller ? { px: scroller.offsetWidth - scroller.clientWidth, css: getComputedStyle(scroller).scrollbarWidth } : null,
        animation: css ? { name: css.animationName, ms: parseFloat(css.animationDuration) * 1000 } : null,
        anim,
        long: window.__long.filter((l) => l.at >= t0),
      }
    }, t0)
    console.log("  modal:", JSON.stringify(modal))
    if (!phone) {
      expect(modal.w !== null && modal.w <= 760, "the opened chart is at most 760px wide", modal.w)
      expect(modal.h !== null && modal.h <= 660, "and at most 660px tall", modal.h)
      expect(!!modal.bar && modal.bar.px === 0 && modal.bar.css === "none", "its body scrolls with no bar drawn (scrollbar-width none)", modal.bar)
      expect(!!modal.animation && modal.animation.ms >= 180 && modal.animation.ms <= 220, "it opens in 180 to 220ms", modal.animation)
    }
    expect(modal.long.every((l) => l.ms <= 50), "no long task over 50ms from the press to the end of the opening", modal.long)
    await shot(p, "modal", w)
    await p.keyboard.press("Escape")
    await sleep(500)

    /* SEND */
    await p.evaluate(() => { document.querySelector(".page-scroll").scrollTop = 0; window.__delay = 1500 })
    const send = await p.evaluate(async () => {
      const t = performance.now()
      document.querySelector("[data-analytics-send]").click()
      const seen = { dialog: null, rows: null, marks: null, statuses: null }
      /* Layout, not paint: the dialog is still scaling in when the rows first show, so where each row is in its list (offsetTop) is what a shift would change. */
      const boxes = () => [...document.querySelectorAll("[data-destination-row]")].map((li) => [li.offsetTop, li.querySelector(":scope > button")?.offsetHeight ?? 0])
      let first = null
      await new Promise((done) => {
        const tick = () => {
          const now = performance.now() - t
          const rows = document.querySelectorAll("[data-destination-row]").length
          const marks = [...document.querySelectorAll("[data-destination-row] svg[data-mark], [data-destination-row] img")].filter((m) => (m.tagName === "IMG" ? m.complete && m.naturalWidth > 0 : true)).length
          const statuses = document.querySelector("[data-analytics-destinations]") && !document.querySelector("[data-status-pending]") && document.querySelector('[data-destination-row="meta"]')?.textContent.includes("Not connected")
          if (seen.dialog === null && document.querySelector("[data-send-dialog], [data-send-sheet]")) seen.dialog = Math.round(now)
          if (rows === 6 && seen.rows === null) { seen.rows = Math.round(now); first = boxes() }
          if (marks >= 3 && seen.marks === null) seen.marks = Math.round(now)
          if (statuses && seen.statuses === null) seen.statuses = Math.round(now)
          if ((seen.rows !== null && seen.marks !== null && seen.statuses !== null) || now > 5000) return done()
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      const after = boxes()
      const images = document.querySelectorAll("[data-destination-row] img").length
      const moved = first ? first.filter((b, i) => !after[i] || Math.abs(b[0] - after[i][0]) > 1 || Math.abs(b[1] - after[i][1]) > 1).length : null
      return { ...seen, images, moved }
    })
    console.log("  send:", JSON.stringify(send))
    /* The first frame the dialog is in: its cost is the dialog's own (Radix and the page's styles, see the report), not the list's. */
    expect(send.rows !== null && send.rows === send.dialog && send.rows < 1500, "the six tools are in the dialog's first frame, long before the server's 1.5s answer", [send.dialog, send.rows])
    expect(send.marks !== null && send.marks === send.dialog, "with their marks", [send.dialog, send.marks])
    expect(send.images === 0, "the marks are drawn inline, nothing fetched", send.images)
    expect(send.moved === 0, "no row moved when where each stands arrived", send.moved)
    await shot(p, "send", w)
    await p.keyboard.press("Escape")
    await sleep(300)
    expect(errors.length === 0, "no page errors", errors)
    await ctx.close()

    /* EMPTY */
    const e = await open(vp, "?empty=1")
    await e.p.waitForFunction(() => document.querySelectorAll("[data-empty]").length > 3, { timeout: 15000 }).catch(() => {})
    await sleep(300)
    const empty = await e.p.evaluate(() => {
      const cards = [...document.querySelectorAll("section[data-card]")]
      const dashes = cards.filter((c) => [...c.querySelectorAll("span, p, div")].some((n) => n.children.length === 0 && n.textContent.trim() === "–")).map((c) => c.getAttribute("data-card"))
      const empties = [...document.querySelectorAll("[data-empty]")]
      return { cards: cards.length, dashes, empties: empties.length, ghosts: document.querySelectorAll("[data-empty-ghost]").length, centred: empties.filter((x) => getComputedStyle(x).textAlign === "center").length }
    })
    console.log("  empty:", JSON.stringify(empty))
    expect(empty.dashes.length === 0, "no empty card shows a bare dash", empty.dashes)
    expect(empty.empties > 0 && empty.ghosts > 0 && empty.centred === 0, "each empty list is a line where the card starts and ghost rows", empty)
    await shot(e.p, "empty", w)
    expect(e.errors.length === 0, "no page errors", e.errors)
    await e.ctx.close()
  }
} finally {
  await browser?.close()
  server?.close()
  rmSync(dir, { recursive: true, force: true })
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
process.exit(broken ? 1 : 0)
