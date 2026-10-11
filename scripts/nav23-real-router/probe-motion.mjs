/*
 * ===========================================================================
 *  ROUND 23: HOW A PAGE COMES AND GOES IN /app, MEASURED
 * ===========================================================================
 *   node probe-motion.mjs <port> <outdir> [w=390|1440] [cpu=4] [n=3] [film=1]
 *
 * Four moves, each n times: a page by a link (Website to Products, whose list
 * carries the real `.orders-pane app-page-enter`), back by the browser, a
 * product opened from the list (the product layer), and its Cancel. For each:
 *   shownMs   press to the first frame with the new page in it
 *   stillMs   press to the first frame with nothing moving (no animation, no view transition)
 *   moves     the animations that ran, by what they moved: opacity, a slide (translate/transform past 4px), a view transition
 *   slidePx   the furthest anything was moved by a slide
 */
import puppeteer from "puppeteer-core"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const [port, out, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => a.split("=")))
const W = Number(opt.w || 390)
const PHONE = W < 768
const CPU = Number(opt.cpu || 4)
const N = Number(opt.n || 3)
const base = `http://localhost:${port}`
mkdirSync(out, { recursive: true })
const b = await puppeteer.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--no-sandbox", "--force-device-scale-factor=1"], timeout: 180000, protocolTimeout: 900000 })
const p = await b.newPage()
if (PHONE) {
  await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Version/18.0 Safari/604.1")
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
} else await p.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
const errors = []
p.on("pageerror", (e) => errors.push(String(e.message).slice(0, 160)))
await p.setCookie(...Object.entries({ shell: 150, home: 200, website: 300, products: 300, product: 300 }).map(([k, v]) => ({ name: `d_${k}`, value: String(v), url: base })))
await p.evaluateOnNewDocument(() => {
  window.__frames = []
  const t = () => Math.round(performance.now())
  const seen = new Map()
  const frame = () => {
    /* What moves the page: inside the shell's scroller or a layer, or a view transition's pictures. Not the pill's press, the rail, a spinner. */
    const onPage = (a) => {
      const e = a.effect
      if (!e) return false
      if (e.pseudoElement && /view-transition/.test(e.pseudoElement)) return true
      const el = e.target
      return !!el?.closest?.(".app-content-scroll, [data-page-layer], [data-app-slow-page], [data-layer-still], [data-layer-hand]") && !el.closest("[data-app-nav-pill], .activity-spinner")
    }
    const anims = document.getAnimations().filter((a) => a.playState === "running" && onPage(a))
    for (const a of anims) {
      const e = a.effect
      if (!e || seen.has(a)) continue
      const kf = typeof e.getKeyframes === "function" ? e.getKeyframes() : []
      const props = new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))
      let px = 0
      for (const k of kf) for (const v of [k.transform, k.translate].filter(Boolean)) for (const m of String(v).matchAll(/(-?[\d.]+)(px|%)/g)) px = Math.max(px, Math.abs(Number(m[1])) * (m[2] === "%" ? 8.44 : 1))
      const vt = !!(e.pseudoElement && /view-transition/.test(e.pseudoElement))
      const dur = e.getTiming?.().duration
      seen.set(a, { props: [...props].join("+"), px: Math.round(px), vt, dur: typeof dur === "number" ? dur : 0, delay: e.getTiming?.().delay || 0, el: (e.target?.getAttribute?.("data-harness-page") || e.target?.className?.toString?.().slice(0, 30) || e.pseudoElement || "") })
    }
    const page = document.querySelector("[data-page-layer] [data-harness-page]")?.getAttribute("data-harness-page") || [...document.querySelectorAll("[data-harness-page]")].map((n) => n.getAttribute("data-harness-page")).join("|")
    window.__frames.push([t(), page, anims.length, document.documentElement.dataset.layerMotion || ""])
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  window.__anims = () => [...seen.entries()].map(([a, v]) => ({ ...v, start: Math.round(a.startTime ?? 0) }))
  window.__resetAnims = () => seen.clear()
})
await p.setRequestInterception(true)
p.on("request", (r) => (r.url().startsWith(base) || r.url().startsWith("data:") ? r.continue() : r.abort()))
const cdp = await p.target().createCDPSession()
await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU })
const frames = []
cdp.on("Page.screencastFrame", async (f) => { frames.push(f); cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}) })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function waitFor(fn, ms = 20000) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) { try { if (await p.evaluate(fn)) return Date.now() - t0 } catch {} await sleep(40) }
  return -1
}
async function press(sel) {
  await waitFor(new Function(`return !!document.querySelector(${JSON.stringify(sel)})`))
  const r = await p.$eval(sel, (el) => { el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await sleep(150)
  if (PHONE) await p.touchscreen.tap(r.x, r.y)
  else await p.mouse.click(r.x, r.y)
}

async function measure(label, act, want, run) {
  await sleep(1200)
  await p.evaluate(() => window.__resetAnims())
  if (opt.film === "1") { frames.length = 0; await cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, everyNthFrame: 1 }) }
  const t0 = await p.evaluate(() => Math.round(performance.now()))
  await act()
  await waitFor(new Function(`return [...document.querySelectorAll("[data-harness-page]")].some((n) => n.getAttribute("data-harness-page") === ${JSON.stringify(want)})`))
  await sleep(1500)
  if (opt.film === "1") {
    await cdp.send("Page.stopScreencast")
    const dir = join(out, `${label}-${W}-run${run}`); rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
    const f0 = frames[0]?.metadata.timestamp ?? 0
    frames.forEach((f, i) => writeFileSync(join(dir, `f${String(i).padStart(3, "0")}-${Math.round((f.metadata.timestamp - f0) * 1000)}.jpg`), Buffer.from(f.data, "base64")))
  }
  const { fr, an } = await p.evaluate((t0) => ({ fr: window.__frames.filter(([t]) => t >= t0), an: window.__anims() }), t0)
  const shown = fr.find(([, page]) => page.split("|").includes(want))
  const shownMs = shown ? shown[0] - t0 : -1
  let stillMs = -1
  if (shown) {
    /* The frame after the last one anything on the page moved in (or the page's first, when nothing did). */
    let last = -1
    fr.forEach(([, , n, lm], i) => { if (n > 0 || lm) last = i })
    const firstShown = fr.indexOf(shown)
    const at = Math.max(firstShown, last + 1)
    stillMs = fr[at] ? fr[at][0] - t0 : -1
  }
  const pageAnims = an.filter((a) => !/spin|activity|bar|loading/i.test(a.el))
  const kinds = pageAnims.map((a) => (a.vt ? `vt(${a.dur}ms)` : a.px > 4 ? `slide${a.px}px(${a.dur}ms)` : `${a.props}(${a.dur}ms${a.delay ? "+" + a.delay : ""})`))
  const counts = {}
  for (const k of kinds) counts[k] = (counts[k] || 0) + 1
  return { label, run, shownMs, stillMs, slidePx: Math.max(0, ...pageAnims.map((a) => a.px)), moves: Object.entries(counts).map(([k, v]) => `${v}x ${k}`).join(", ") }
}

const results = []
for (let run = 0; run < N; run++) {
  await p.goto(base + "/app/website-builder", { waitUntil: "load" })
  await waitFor(() => !!document.querySelector('[data-harness-page="Website"]'))
  results.push(await measure("link", () => press('[data-harness-page="Website"] [data-go="products"]'), "Products", run))
  results.push(await measure("back", () => p.evaluate(() => history.back()), "Website", run))
  results.push(await measure("forward", () => p.evaluate(() => history.forward()), "Products", run))
  results.push(await measure("layer-in", () => press('[data-go="open-product"]'), "Product", run))
  results.push(await measure("layer-out", () => press('[data-go="cancel-product"]'), "Products", run))
}
const by = {}
for (const r of results) (by[r.label] ||= []).push(r)
const med = (a) => { const s = a.filter((x) => x >= 0).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : -1 }
const summary = Object.fromEntries(Object.entries(by).map(([k, rs]) => [k, { shownMs: med(rs.map((r) => r.shownMs)), stillMs: med(rs.map((r) => r.stillMs)), slidePx: Math.max(...rs.map((r) => r.slidePx)), moves: rs[rs.length - 1].moves }]))
console.log(JSON.stringify({ w: W, cpu: CPU, summary, results, errors: errors.filter((e) => !/JSON/.test(e)).slice(0, 6) }, null, 1))
await b.close()
