/**
 * ===========================================================================
 *  THE LIBRARY'S PILLS: ONE SCREEN INTO THE NEXT, FRAME BY FRAME
 * ===========================================================================
 * "Switching between Products, Courses, Wishlist, Reviews, Receipts is harsh
 * and glitchy: make it smooth (no flash, no layout jump, keep the pills row
 * still, crossfade content, prefetch, instant on cached)."
 *
 * The library as the account draws it (scripts/render-library-switch.tsx:
 * the account's wrapper and column, the library's stage, its pills and the
 * real screens), a pill pressed at a quarter of the CPU's speed, every frame
 * sampled from the press:
 *
 *   SWAP       how long from the press to the first frame the next screen is
 *              on the glass, and to the frame nothing is moving any more
 *   NO FLASH   in every frame a screen is on the glass: never the page's
 *              own grey alone. "cover" is how much of a screen is there
 *              (1 = all); a frame under 0.5 is a flash
 *   ONE SCREEN round 17 (the owner: "switching in between pill shapes is
 *              not smooth"): never two screens' words at once. No copy of
 *              the old screen is ever laid over the new one, and the new
 *              one lands in place with a short soft fade (from 0.6 or more,
 *              120ms, lib/ui/pill-switch.ts), where round 16 dissolved a
 *              copy of the old screen over it for 180ms
 *   THE PILL   its own fill fades in where it is (opacity only, the space
 *              pills' 140ms), nothing on it scales, and a finger's tap at
 *              the phone size switches on the first try
 *   STILL      the title and the pill row never move and never fade; the
 *              scroll stays where it was; no layout shift
 *   PREFETCH   every other tab is fetched whole while the page is idle
 *   COMMUNITIES  the pill is there (the switch is on in the fixture)
 *
 * Warm (the router holds the page: the screen commits with the address),
 * cold (the route's loading.tsx first, the screen 450ms later) and slow (no
 * answer for 350ms), at 390x844 and 1440x900. A filmstrip of the warm press
 * at each size is written to SHOTS_DIR, one picture per painted frame.
 *
 *   PROBE_CSS=source node scripts/check-library-switch.mjs
 *   SHOTS_DIR=dir    where the filmstrips go (printed at the end)
 *   REPORT_ONLY=1    print the numbers, do not fail (used to measure the old code)
 *   SIZES=390 MODES=warm   one size, one kind of press
 *   LIGHT=1          time the swap only (no style reads in the frames, which
 *                    cost a throttled main thread time of their own)
 *   REDUCED=1        prefers-reduced-motion: the swap with no cross fade
 *   DEBUG_FRAMES=1   every sampled frame and the long frames around the swap
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const faces = interFaces(root)
const fontDir = (faces.match(/url\(file:\/\/([^)]*\/static\/media)\//) ?? [])[1]
const inter = fontDir ? faces.split(`file://${fontDir}/`).join("/font/") : ""
const stubs = join(root, ".library-switch-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-library-switch-")), "shots")
mkdirSync(shots, { recursive: true })
const REPORT_ONLY = !!process.env.REPORT_ONLY
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : REPORT_ONLY ? "--  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${typeof got === "string" ? got : JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

writeFileSync(join(stubs, "navigation.js"), `import { createContext, useContext } from "react"
const PathContext = (window.__PathContext ||= createContext(null))
const router = { push: (h) => window.__navigate && window.__navigate(h), replace: (h) => window.__navigate && window.__navigate(h), prefetch: (h, o) => (window.__prefetch ||= []).push([h, o && o.kind]), back: () => history.back(), refresh: () => {} }
export const usePathname = () => useContext(PathContext) ?? location.pathname
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams(location.search)
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); window.__navigate && window.__navigate(href) } } }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, preload, unoptimized, ...rest }) { return React.createElement("img", { src, alt, ...rest }) }
`)
writeFileSync(join(stubs, "supabase.js"), `const chain = () => new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r({ data: null, error: null }) : chain(), apply: () => chain() })
export function createClient() { return { auth: { getUser: async () => ({ data: { user: null } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: chain, rpc: chain, channel: chain, removeChannel() {} } }
export function isNativePlatform() { return false }
export const capacitorStorage = {}
`)

const { build } = await import("esbuild")
await build({
  entryPoints: [join(root, "scripts/render-library-switch.tsx")],
  bundle: true,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  alias: { "@": ".", "next/navigation": join(stubs, "navigation.js"), "next/link": join(stubs, "link.jsx"), "next/image": join(stubs, "image.jsx") },
  banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  outfile: join(stubs, "app.js"),
  logLevel: "error",
  absWorkingDir: root,
  nodePaths: [join(root, "node_modules")],
  plugins: [{ name: "stubs", setup(b) { b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase.js") })) } }],
})
const js = readFileSync(join(stubs, "app.js"), "utf8")
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${inter}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>`

writeFileSync(join(stubs, "index.html"), html)
const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x")
  if (url.pathname === "/app.js") {
    res.writeHead(200, { "content-type": "text/javascript" })
    return res.end(js)
  }
  if (fontDir && url.pathname.startsWith("/font/")) {
    try {
      res.writeHead(200, { "content-type": "font/woff2" })
      return res.end(readFileSync(join(fontDir, decodeURIComponent(url.pathname.slice(6)))))
    } catch {
      res.writeHead(404)
      return res.end()
    }
  }
  if (url.pathname.startsWith("/api/")) {
    res.writeHead(200, { "content-type": "application/json" })
    return res.end(JSON.stringify({ items: [], next: null }))
  }
  res.writeHead(200, { "content-type": "text/html" })
  res.end(html)
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const browser = await puppeteer.launch({ executablePath: CHROMIUM, headless: true, args: ["--no-sandbox", "--font-render-hinting=none"] })

async function open(vp, init) {
  const page = await browser.newPage()
  page.errors = []
  page.on("pageerror", (e) => page.errors.push(String(e)))
  await page.setViewport(vp)
  if (process.env.REDUCED) await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }])
  if (init) await page.evaluateOnNewDocument(init)
  if (process.env.LIGHT) await page.evaluateOnNewDocument(() => { window.__light = true })
  await page.goto(`${origin}/account/library`, { waitUntil: "load" })
  await page.waitForSelector("[data-library-tabs]")
  return page
}

/* Every frame from the press, read in the frame (rAF), for `ms`. */
async function sampleMove(page, selector, target, ms) {
  await page.evaluate(
    (target, ms) => {
      window.__sample = new Promise((resolve) => {
        const out = []
        let t0 = 0
        const shifts = []
        /* What moved, by where it is: the footer under a screen that landed taller or shorter than its shape is told apart from anything on the screen itself. */
        const po = new PerformanceObserver((l) => {
          for (const e of l.getEntries()) {
            if (e.hadRecentInput) continue
            const nodes = (e.sources || []).map((x) => x.node).filter(Boolean)
            const footer = nodes.length > 0 && nodes.every((n) => n.closest?.("footer, [data-fake-footer]") || (n.nodeType === 1 && n.matches?.("footer")))
            shifts.push({ value: e.value, footer, what: nodes.map((n) => (n.nodeType === 1 ? n.tagName.toLowerCase() + (n.getAttribute("data-fake-footer") !== null ? "[footer]" : "") : "#text")).join(",") })
          }
        })
        po.observe({ type: "layout-shift", buffered: false })
        /* The long frames, split into script and style/layout, so a slow swap can say where the time went. */
        const loafs = []
        let lo = null
        try {
          lo = new PerformanceObserver((l) => {
            for (const e of l.getEntries()) loafs.push({ at: Math.round(e.startTime - t0), ms: Math.round(e.duration), script: Math.round((e.renderStart || e.startTime + e.duration) - e.startTime), style: e.styleAndLayoutStart ? Math.round(e.startTime + e.duration - e.styleAndLayoutStart) : 0, scripts: (e.scripts || []).map((x) => `${x.invoker || x.name}:${Math.round(x.duration)}`).slice(0, 4).join(" ") })
          })
          lo.observe({ type: "long-animation-frame", buffered: false })
        } catch {
          /* not in this browser */
        }
        const eff = (el) => {
          let o = 1
          for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
            const s = getComputedStyle(n)
            if (s.visibility === "hidden" && n === el) return 0
            o *= parseFloat(s.opacity)
          }
          return o
        }
        const ids = new WeakMap()
        let nextId = 0
        const light = !!window.__light
        const step = () => {
          const t = performance.now() - t0
          if (light) {
            const sc = document.querySelector("[data-library-live] [data-library-screen] [data-probe-path]")
            out.push({ t: Math.round(t), path: sc ? sc.getAttribute("data-probe-path") : null, live: 1, copy: 0, cover: 1, each: {}, rowTop: 0, titleTop: 0, rowOp: 1, scrollY: 0, active: null })
            if (t < ms) requestAnimationFrame(step)
            else {
              po.disconnect()
              lo?.disconnect()
              window.__loafs = loafs.filter((x) => x.at >= 0)
              resolve({ anims: [], commitsAt: (window.__commits || []).filter((c) => c.at >= t0).map((c) => Math.round(c.at - t0)), commits: (window.__commits || []).filter((c) => c.at >= t0).map((c) => `${c.loading ? "skeleton" : "screen"}@${Math.round(c.at - t0)}`), f: out, cls: 0, footerCls: 0, shifts: [] })
            }
            return
          }
          const tabs = document.querySelector("[data-library-tabs]")
          const title = document.querySelector("[data-library-title]")
          const live = document.querySelector("[data-library-live]") || document.querySelector("[data-library-screen]")
          const screen = live?.querySelector("[data-library-screen] [data-probe-path]")
          const skeleton = live?.querySelector("[data-library-skeleton]")
          const liveOp = live ? eff(live) : 0
          const inc = document.querySelector("[data-library-incoming]")
          const incOp = inc && getComputedStyle(inc).display !== "none" ? eff(inc) : 0
          const layers = [...document.querySelectorAll("[data-library-leaving]")]
          const copy = layers.reduce((m, l) => Math.max(m, parseFloat(getComputedStyle(l).opacity)), 0)
          const each = {}
          for (const l of layers) {
            if (!ids.has(l)) {
              ids.set(l, nextId++)
              const a = l.getAnimations()[0]
              const kf = a?.effect?.getKeyframes?.() ?? []
              ;(window.__layerAnims ||= []).push({ ms: a ? Number(a.effect.getTiming().duration) : 0, props: [...new Set(kf.flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x))))].join(",") })
            }
            each[ids.get(l)] = Math.round(parseFloat(getComputedStyle(l).opacity) * 1000) / 1000
          }
          const under = Math.max(liveOp, incOp)
          const pill = document.querySelector('[data-library-tab][data-active="true"]')
          const targetPill = document.querySelector(`[data-library-tab-href="${target}"]`)
          const targetFill = targetPill?.querySelector("[data-library-tab-fill]")
          const scales = [...document.querySelectorAll("[data-library-tab], [data-library-tab-fill]")].map((n) => getComputedStyle(n).scale).filter((v) => v !== "none" && v !== "1")
          const liveAnims = live ? live.getAnimations().map((a) => ({ ms: Number(a.effect?.getTiming().duration), from: Number(a.effect?.getKeyframes?.()[0]?.opacity ?? 1) })) : []
          out.push({
            t: Math.round(t),
            rowTop: tabs ? Math.round(tabs.getBoundingClientRect().top * 10) / 10 : null,
            titleTop: title ? Math.round(title.getBoundingClientRect().top * 10) / 10 : null,
            rowOp: tabs ? Math.round(eff(tabs) * 1000) / 1000 : 0,
            live: Math.round(liveOp * 1000) / 1000,
            copy: Math.round(copy * 1000) / 1000,
            each,
            cover: Math.round((copy + (1 - copy) * under) * 1000) / 1000,
            path: screen ? screen.getAttribute("data-probe-path") : skeleton ? "skeleton" : null,
            active: pill ? pill.getAttribute("data-library-tab-href") : null,
            fill: targetFill ? Math.round(parseFloat(getComputedStyle(targetFill).opacity) * 1000) / 1000 : null,
            scaled: scales.length,
            layers: layers.length,
            liveAnims,
            scrollY: Math.round(window.scrollY),
          })
          if (t < ms) requestAnimationFrame(step)
          else {
            po.disconnect()
            lo?.disconnect()
            window.__loafs = loafs.filter((x) => x.at >= 0)
            const anims = window.__layerAnims || []
            window.__layerAnims = []
            const commits = (window.__commits || []).filter((c) => c.at >= t0).map((c) => `${c.loading ? "skeleton" : "screen"}@${Math.round(c.at - t0)}`)
            resolve({ anims, commitsAt: (window.__commits || []).filter((c) => c.at >= t0).map((c) => Math.round(c.at - t0)), commits, f: out, cls: shifts.filter((x) => !x.footer).reduce((a, b) => a + b.value, 0), footerCls: shifts.filter((x) => x.footer).reduce((a, b) => a + b.value, 0), shifts })
          }
        }
        document.addEventListener(
          "click",
          () => {
            t0 = performance.now()
            step()
          },
          { capture: true, once: true },
        )
      })
    },
    target,
    ms,
  )
  /* A finger at the phone size (one tap, decided on the lift), the mouse on a computer. */
  if (page.viewport()?.hasTouch) await page.tap(selector)
  else await page.click(selector)
  return page.evaluate(() => window.__sample)
}

/*
 * The frames the compositor drew, as pictures, from the press: the trace's
 * own screenshots (what DevTools' filmstrip shows), one per frame that
 * reached the screen, so a compositor fade that runs through a long main
 * thread frame is still pictured.
 */
async function filmstrip(page, cdp, vp, run, name) {
  await page.tracing.start({ screenshots: true, categories: ["disabled-by-default-devtools.screenshot", "devtools.timeline"] })
  const t0 = await page.evaluate(() => performance.timeOrigin + performance.now())
  const result = await run()
  const buf = await page.tracing.stop()
  const trace = JSON.parse(Buffer.from(buf).toString("utf8"))
  const shots_ = trace.traceEvents.filter((e) => e.name === "Screenshot" && e.args?.snapshot)
  /* Trace time is microseconds on the browser's monotonic clock; the press is the first click the page saw. */
  const click = trace.traceEvents.find((e) => e.name === "EventDispatch" && e.args?.data?.type === "click")
  const base = click ? click.ts : shots_[0]?.ts ?? 0
  const before = shots_.filter((e) => e.ts < base).at(-1)
  const after = shots_.filter((e) => e.ts >= base && e.ts <= base + 1_000_000)
  const all = [...(before ? [before] : []), ...after]
  const used = all.length <= 28 ? all : Array.from({ length: 28 }, (_, i) => all[Math.round((i * (all.length - 1)) / 27)])
  const w = vp.width > 600 ? 360 : 195
  const pics = await Promise.all(used.map((f) => sharp(Buffer.from(f.args.snapshot, "base64")).resize({ width: w }).png().toBuffer()))
  void t0
  if (!pics.length) return result
  const meta = await sharp(pics[0]).metadata()
  const cols = Math.min(vp.width > 600 ? 4 : 7, pics.length)
  const rowsN = Math.ceil(pics.length / cols)
  const gap = 6
  const labelH = 18
  const composites = []
  pics.forEach((p, i) => {
    const x = (i % cols) * (w + gap)
    const y = Math.floor(i / cols) * (meta.height + labelH + gap)
    const ms = Math.round((used[i].ts - base) / 1000)
    composites.push({ input: p, left: x, top: y + labelH })
    composites.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${labelH}"><text x="2" y="13" font-family="Arial" font-size="12" fill="#111">#${i} ${ms < 0 ? "before press" : `+${ms}ms`}</text></svg>`), left: x, top: y })
  })
  await sharp({ create: { width: cols * (w + gap), height: rowsN * (meta.height + labelH + gap), channels: 3, background: "#ffffff" } })
    .composite(composites)
    .png()
    .toFile(join(shots, `${name}.png`))
  console.log(`    filmstrip: ${join(shots, `${name}.png`)} (${after.length} frames on screen in the second after the press, ${used.length} pictured)`)
  return result
}

const rises = (xs) => xs.filter((v, i) => i > 0 && v > xs[i - 1] + 0.002).length
const MOVES = [
  ["/account/library", "/account/library/reviews"],
  ["/account/library/reviews", "/account/library/courses"],
  ["/account/library/courses", "/account/library/communities"],
  ["/account/library/communities", "/account/library/wishlist"],
]
const summaryAll = []

const SIZES = (process.env.SIZES || "390,1440").split(",")
const MODES = (process.env.MODES || "warm,cold,slow").split(",")
for (const [label, vp] of [["390", PHONE], ["1440", DESK]].filter(([l]) => SIZES.includes(l))) {
  for (const mode of MODES) {
    const page = await open(vp, mode === "cold" ? () => { window.__cold = true } : mode === "slow" ? () => { window.__delay = 350 } : undefined)
    await sleep(2600)
    if (mode === "warm") {
      const prefetched = await page.evaluate(() => [...new Set((window.__prefetch || []).filter(([, k]) => k === "full").map(([h]) => h))])
      console.log(`\nat ${label}: idle prefetch ${JSON.stringify(prefetched)}`)
      expect(["/account/library/courses", "/account/library/communities", "/account/library/wishlist", "/account/library/reviews", "/account/library/receipts"].every((h) => prefetched.includes(h)), "every other tab is fetched whole while the page is idle", prefetched)
      const pills = await page.$$eval("[data-library-tab]", (els) => els.map((e) => e.getAttribute("data-library-tab")))
      expect(pills.join() === "Products,Courses,Communities,Wishlist,Reviews,Receipts", "the pills: Products, Courses, Communities, Wishlist, Reviews, Receipts", pills)
    }
    console.log(`\ntab switches at ${label}, ${mode}${mode === "cold" ? " (route skeleton, then the screen 450ms later)" : mode === "slow" ? " (no answer for 350ms)" : ""}, CPU 4x`)
    await page.evaluate(() => window.scrollTo(0, 40))
    await sleep(100)
    const cdp = await page.createCDPSession()
    for (const [from, to] of MOVES) {
      const has = await page.$(`[data-library-tab-href="${to}"]`)
      if (!has) {
        console.log(`    ${to}: no pill`)
        continue
      }
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
      const run = () => sampleMove(page, `[data-library-tab-href="${to}"]`, to, mode === "warm" ? 1400 : 1800)
      const { f, cls, footerCls, shifts, commits, commitsAt, anims } = mode === "warm" && from === "/account/library" ? await filmstrip(page, cdp, vp, run, `switch-${label}`) : await run()
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
      await sleep(300)
      const swapAt = f.find((x) => x.path === to && x.live > 0.01)
      const settledAt = f.find((x, i) => i > 0 && x.path === to && x.copy === 0 && x.live >= 0.999 && f.slice(i).every((y) => y.copy === 0 && y.live >= 0.999))
      const minCover = Math.min(...f.slice(1).map((x) => x.cover))
      const flashes = f.slice(1).filter((x) => x.cover < 0.5).length
      const rowTops = [...new Set(f.map((x) => x.rowTop))]
      const titleTops = [...new Set(f.map((x) => x.titleTop))]
      const rowOps = Math.min(...f.map((x) => x.rowOp))
      /* Each copy on its own: the old screen's, then (cold) the route skeleton's. */
      const layerIds = [...new Set(f.flatMap((x) => Object.keys(x.each)))]
      const layerRises = layerIds.map((id) => rises(f.map((x) => x.each[id]).filter((v) => v !== undefined))).reduce((a, b) => a + b, 0)
      const between = f.filter((x) => (x.copy > 0.05 && x.copy < 0.95) || (x.live > 0.05 && x.live < 0.95)).length
      const pillFrame = f.findIndex((x) => x.active === to)
      const line = { from, to, swapMs: swapAt?.t ?? null, settledMs: settledAt?.t ?? null, minCover, flashes, rowMoves: rowTops.length - 1, titleMoves: titleTops.length - 1, rowMinOpacity: rowOps, cls: Math.round(cls * 10000) / 10000, footerCls: Math.round(footerCls * 10000) / 10000, crossfadeFrames: between, pillFrame, layers: layerIds.length }
      summaryAll.push({ label, mode, ...line })
      console.log(`    ${from.split("/").pop()} -> ${to.split("/").pop()}: pill lit at frame ${pillFrame}; next screen on the glass at ${line.swapMs}ms, settled at ${line.settledMs}ms; min cover ${minCover}; ${flashes} flash frames; crossfade over ${between} frames (${layerIds.length} copies); row moved ${line.rowMoves}x, faded to ${rowOps}; CLS ${line.cls} (+ footer ${line.footerCls})`)
      console.log(`      React committed: ${commits.join(", ")}`)
      if (process.env.DEBUG_FRAMES) console.log("      long frames", JSON.stringify(await page.evaluate(() => window.__loafs)))
      if (process.env.DEBUG_FRAMES || cls >= 0.001) console.log("      shifts", JSON.stringify(shifts))
      if (process.env.DEBUG_FRAMES) console.log(f.map((x) => JSON.stringify({ t: x.t, path: x.path, live: x.live, copy: x.copy, cover: x.cover, active: x.active })).join("\n"))
      expect(pillFrame >= 0 && pillFrame <= 2, "the pressed pill lights in the press's own frames", pillFrame)
      expect(flashes === 0, "no flash: a screen is on the glass in every frame", { minCover, at: f.filter((x) => x.cover < 0.5).map((x) => `${x.t}:${x.cover}`).slice(0, 6) })
      expect(rowTops.length === 1 && titleTops.length === 1 && rowOps >= 0.999, "the title and the pill row never move and never fade", { rowTops, titleTops, rowOps })
      /* Round 17: never two screens at once. No copy of any screen over the live one, in any frame, and React's live slot holds one screen. */
      const copies = Math.max(...f.map((x) => x.layers ?? 0))
      expect(copies === 0 && anims.length === 0, "never two screens at once: no copy of the old screen is laid over the new one", { copies, anims })
      /* The landing: short and soft, from most of the way there. Read from the animation itself, since a compositor fade runs through frames rAF cannot sample. */
      const lands = f.flatMap((x) => x.liveAnims || [])
      const minLive = Math.min(...f.slice(1).filter((x) => x.path === to || x.path === "skeleton").map((x) => x.live))
      expect(lands.length > 0 && lands.every((a) => a.ms <= 160 && a.from >= 0.59) && minLive >= 0.59, "the new screen lands in place with a short soft fade (from 0.6 or more, 160ms at most)", { lands: [...new Set(lands.map((a) => `${a.from}/${a.ms}ms`))], minLive })
      const fills = f.map((x) => x.fill).filter((v) => v !== null)
      expect(fills.length > 1 && rises(fills) >= 1 && fills.every((v, i) => i === 0 || v >= fills[i - 1] - 0.002) && fills.at(-1) >= 0.999, "the pressed pill's own fill fades in where it is, only up", { first: fills.slice(0, 6) })
      expect(f.every((x) => !x.scaled), "nothing on a pill scales", f.filter((x) => x.scaled).length)
      expect(cls < 0.001, "no layout shift on the screen (the footer under a late screen of another height aside)", cls)
      expect(new Set(f.map((x) => x.scrollY)).size === 1, "the scroll stays where it was", [...new Set(f.map((x) => x.scrollY))])
      expect(!!settledAt, "it settles: the new screen whole and nothing left over it", f.at(-1))
      /* From React's commit, because the press to the commit is this harness rendering the whole next screen at a quarter speed, the same in the old code and the new. */
      const lastCommit = commitsAt.at(-1)
      if (mode === "warm") expect(swapAt && lastCommit !== undefined && swapAt.t - lastCommit <= 160, "warm: the next screen is on the glass in the frame after React commits it", { commit: lastCommit, glass: swapAt?.t })
    }
    expect(page.errors.length === 0, "no page errors", page.errors)
    await page.close()
  }
}

writeFileSync(join(shots, "summary.json"), JSON.stringify(summaryAll, null, 2))
await browser.close()
server.close()
console.log(`\nShots and summary.json: ${shots}`)
if (broken && !REPORT_ONLY) {
  console.error(`\n${broken} check(s) failed`)
  process.exit(1)
}
console.log(broken ? `\n${broken} check(s) not met (REPORT_ONLY)` : "\nAll library switch checks passed")
