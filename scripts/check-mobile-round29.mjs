/**
 * ===========================================================================
 *  ROUND 29: THE PHONE, MEASURED
 * ===========================================================================
 * HEADER  A community's header across tab switches (Learn, Calendar, Members,
 *         Leaderboards, Community) on a 390x844 phone at 4x CPU, with a 47px
 *         status bar inset and the native shell's class on <html>: every
 *         frame, the header's box, its background, the canvas and the band
 *         under the clock, read from the DOM; and the pixels of the band and
 *         the header compared, frame by frame, against the frame before the
 *         tap; and every write on <html> or <body> a switch makes. Light and
 *         dark. (scripts/render-mobile-round29.tsx: the real frame, its place
 *         host, the tab bar and the root layout's pieces that answer a move.)
 * LENS    The tab bar's glass held (a picture of it, light and dark), tapped
 *         for 45ms and dragged from Home to Profile: its opacity and scale
 *         every frame, which properties animate on it, how many times the
 *         main thread painted, and how the drop settles once a finger stops.
 * IMAGES  A library row's thumbnail, a community card on Explore and a post's
 *         picture, answered 400ms late (scripts/render-images-round29.tsx):
 *         their boxes before the picture, their attributes, how each comes
 *         up, and how each is drawn again in the same tab (no fade).
 * PERF    Explore, a community feed and the library on a phone at 4x CPU:
 *         layouts, style passes, script and task time, long tasks and the
 *         heap, over the load, 24 scroll steps and (the feed) five tab
 *         switches; the median of PERF_RUNS. TRACE=1 lists the forced
 *         layouts by the function that asked; PROFILE=1 the heaviest
 *         functions; KEEP_BUNDLE=1 keeps the bundles to read lines against.
 *
 * BEFORE: run from a checkout of the base commit with this file's path, the
 * two render-*-round29.tsx harnesses copied into its scripts/.
 *
 *   PROBE_CSS=source node scripts/check-mobile-round29.mjs [header] [lens] [images] [perf]
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import sharp from "sharp"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const only = new Set(process.argv.slice(2).map((s) => s.toLowerCase()))
const want = (s) => only.size === 0 || only.has(s)
const shots = process.env.SHOTS_DIR || join(root, ".round29-shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const INSET_TOP = 47

/* ── The bundles (the stubs of scripts/check-community-shell15.mjs) ── */

async function bundle(entry) {
  const tag = entry.replace(/\W+/g, "_")
  const stubs = join(root, `.round29-probe-${tag}`)
  mkdirSync(stubs, { recursive: true })
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const router = { push: (h) => { log("push", h); window.__navigate && window.__navigate(h) }, replace: (h) => log("replace", h), prefetch: (h, o) => { log("prefetch", h); window.__onPrefetch && window.__onPrefetch(h) }, back: () => history.back(), refresh: () => log("refresh") }
if (!window.__pushPatched) {
  window.__pushPatched = true
  const push = history.pushState.bind(history)
  const replace = history.replaceState.bind(history)
  history.pushState = (s, u, url) => { push(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
  history.replaceState = (s, u, url) => { replace(s, u, url); queueMicrotask(() => window.dispatchEvent(new Event("probe:path"))) }
}
const useLocation = (read) => {
  const [v, setV] = useState(read)
  useEffect(() => {
    const on = () => startTransition(() => setV(read()))
    window.addEventListener("probe:path", on)
    window.addEventListener("popstate", on)
    on()
    return () => { window.removeEventListener("probe:path", on); window.removeEventListener("popstate", on) }
  }, [])
  return v
}
export const usePathname = () => useLocation(() => location.pathname)
export const useSearchParams = () => new URLSearchParams(useLocation(() => location.search))
export const useRouter = () => router
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
export const useSelectedLayoutSegments = () => []
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); window.__navigate && window.__navigate(href) } } }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, loader, quality, placeholder, blurDataURL, unoptimized, ...rest }) { return React.createElement("img", { src, alt, sizes, ...rest, style: { ...(rest.style || {}), ...(fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : {}) } }) }
`,
  )
  writeFileSync(
    join(stubs, "dynamic.jsx"),
    `import React from "react"
export default function dynamic(load) { const Lazy = React.lazy(() => load().then((m) => ({ default: m && m.default ? m.default : m }))); return function Dynamic(props) { return React.createElement(Lazy, props) } }
`,
  )
  writeFileSync(
    join(stubs, "supabase-client.js"),
    `export function createClient() {
  return {
    channel() { const ch = { on() { return ch }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 30); return ch }, track: async () => "ok", presenceState: () => ({}), send: async () => "ok" }; return ch },
    removeChannel() {},
    realtime: { setAuth: async () => {} },
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), getUser: async () => ({ data: { user: { id: "u-me", email: "sam@example.com", user_metadata: {} } }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }), signOut: async () => ({ error: null }) },
    from() { const q = { select: () => q, eq: () => q, in: () => q, order: () => q, limit: () => q, maybeSingle: async () => ({ data: null, error: null }), single: async () => ({ data: null, error: null }), then: (r) => r({ data: [], error: null }) }; return q },
  }
}
export const isNativePlatform = () => false
`,
  )
  const { build } = await import("esbuild")
  const rel = `./.round29-probe-${tag}`
  await build({
    entryPoints: [join(root, entry)],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": `${rel}/navigation.js`, "next/link": `${rel}/link.jsx`, "next/image": `${rel}/image.jsx`, "next/dynamic": `${rel}/dynamic.jsx` },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  /* KEEP_BUNDLE=1: the bundle kept beside the pictures, to read a profile's line numbers against. */
  if (process.env.KEEP_BUNDLE) writeFileSync(join(shots, `${tag}.js`), js)
  rmSync(stubs, { recursive: true, force: true })
  return js
}

const css = await appCss(root)
const fonts = interFaces(root)
const themeCss = readFileSync(join(root, "app/theme-dark.css"), "utf8")
const page = (js) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><title>Probe</title><script>if(window.__probeNative)document.documentElement.classList.add("capacitor");if(window.__probeDark)document.documentElement.setAttribute("data-sl-dark","")</script><style>${fonts}${css}</style><style>${themeCss}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`

const PLACES = [{ kind: "community", id: "c0000000-0000-4000-8000-000000000001", slug: "clay-studio", title: "Clay Studio", imageUrl: null }]

async function open(browser, html, url, { dark = false, latency = 600, native = true, cpu = 4 } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 600)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(`${ORIGIN}/api/`)) {
      const short = u.replace(ORIGIN, "")
      let body = {}
      if (short.endsWith("/presence")) body = { ok: true, ready: true }
      else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: PLACES }
      else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
      else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
      else if (short.includes("/search?index")) body = { index: { at: Date.now(), spaces: [], posts: [], members: [] } }
      else if (short.includes("/members?")) body = { members: [], nextCursor: null }
      else if (short.startsWith("/api/version")) body = { deploymentId: "" }
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }
    if (u.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  const cdp = await p.target().createCDPSession()
  /* The phone app's status bar: a real inset under the clock (Chromium 13x+ emulates env(safe-area-inset-*)). */
  let insets = false
  if (native) {
    try {
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: INSET_TOP, bottom: 34, left: 0, right: 0 } })
      insets = true
    } catch {
      /* An older Chromium: the band is zero high, as in a browser. */
    }
  }
  await p.evaluateOnNewDocument(
    (ms, dark, native) => {
      window.__placeLatency = ms
      window.__feedLatency = 250
      window.__probeNative = native
      window.__probeDark = dark
    },
    latency,
    dark,
    native,
  )
  await p.goto(`${ORIGIN}${url}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(900)
  if (cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu })
  return { p, cdp, errors, insets }
}

async function tapAt(cdp, x, y) {
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] })
  await sleep(40)
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
}
async function centreOf(p, sel) {
  return p.evaluate((sel) => {
    const el = Array.from(document.querySelectorAll(sel)).find((e) => e.getClientRects().length && e.getBoundingClientRect().width > 0)
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) }
  }, sel)
}

/* ── HEADER ── */

/* Every frame: the header's box and colour, the canvas, the band under the clock, the tab row's box. */
const HEADER_RECORDER = `(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [Math.round(b.left * 100) / 100, Math.round(b.top * 100) / 100, Math.round(b.width * 100) / 100, Math.round(b.height * 100) / 100].join(",") }
  window.__hdr = { on: false, frames: [], swaps: 0, writes: [] }
  let header = document.querySelector("[data-community-top]")
  /* Every write on <html> and <body> while a switch is recorded: one there restyles the whole page. */
  const mo = new MutationObserver((list) => {
    if (!window.__hdr.on) return
    for (const m of list) {
      const now = m.target.getAttribute(m.attributeName)
      if (now === m.oldValue) continue
      window.__hdr.writes.push(m.target.tagName + " " + m.attributeName + ": " + String(m.oldValue).slice(0, 80) + " -> " + String(now).slice(0, 80))
    }
  })
  mo.observe(document.documentElement, { attributes: true, attributeOldValue: true })
  mo.observe(document.body, { attributes: true, attributeOldValue: true })
  const frame = () => {
    if (window.__hdr.on) {
      const h = document.querySelector("[data-community-top]")
      if (h !== header) { window.__hdr.swaps++; header = h }
      const html = document.documentElement
      const hs = h ? getComputedStyle(h) : null
      window.__hdr.frames.push({
        t: performance.now(),
        box: r(h),
        bg: hs ? hs.backgroundColor : null,
        op: hs ? hs.opacity : null,
        tf: hs ? hs.transform + "|" + hs.translate : null,
        row: r(document.querySelector("[data-community-top-row]")),
        tabs: r(document.querySelector("[data-community-tabs]")),
        canvas: getComputedStyle(html).backgroundColor,
        band: getComputedStyle(html, "::before").backgroundColor + "|" + getComputedStyle(html, "::before").display,
        theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
        scrollY: Math.round(window.scrollY),
      })
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()`

/* Mean and worst pixel difference of the top strip (band and header) of each PNG against the first. */
async function stripDiffs(dir, files, height) {
  const read = async (f) => sharp(join(dir, f)).extract({ left: 0, top: 0, width: 390, height }).removeAlpha().raw().toBuffer()
  const base = await read(files[0])
  const out = []
  for (const f of files.slice(1)) {
    const b = await read(f)
    let changed = 0
    let worst = 0
    for (let i = 0; i < b.length; i += 3) {
      const d = Math.max(Math.abs(b[i] - base[i]), Math.abs(b[i + 1] - base[i + 1]), Math.abs(b[i + 2] - base[i + 2]))
      if (d > 24) changed++
      if (d > worst) worst = d
    }
    out.push({ f, changed, worst })
  }
  return out
}

async function headerRun(browser, html, { dark, cold, scrolled = false }) {
  const tag = `${dark ? "dark" : "light"}-${cold ? "cold" : "warm"}${scrolled ? "-down" : ""}`
  const run = await open(browser, html, `/community/clay-studio${cold ? "?idle=0" : ""}`, { dark })
  const { p, cdp } = run
  if (!cold) await sleep(3500)
  await p.evaluate(HEADER_RECORDER)
  const steps = ["Learn", "Calendar", "Members", "Leaderboards", "Community"]
  const results = []
  for (const label of steps) {
    const dir = join(shots, `header-${tag}-${label.toLowerCase()}`)
    mkdirSync(dir, { recursive: true })
    const sel = `[data-community-tabs] a[data-community-nav="${label}"]`
    /* The tab into the row's view first (the row scrolls sideways); and the page down its list when asked, so the switch also scrolls. */
    await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "nearest", inline: "nearest" }), sel)
    if (scrolled) await p.evaluate(() => window.scrollTo(0, Math.max(0, Math.min(700, document.documentElement.scrollHeight - innerHeight))))
    await sleep(300)
    const at = await centreOf(p, sel)
    if (!at) {
      console.log(`  (no ${label} tab)`)
      continue
    }
    let n = 0
    const files = []
    const onFrame = async (f) => {
      const name = `${String(n++).padStart(3, "0")}.png`
      files.push(name)
      writeFileSync(join(dir, name), Buffer.from(f.data, "base64"))
      await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
    }
    cdp.on("Page.screencastFrame", onFrame)
    await cdp.send("Page.startScreencast", { format: "png", maxWidth: 780, maxHeight: 1688, everyNthFrame: 1 })
    await sleep(250)
    await p.evaluate(() => {
      window.__hdr.frames = []
      window.__hdr.writes = []
      window.__hdr.swaps = 0
      window.__hdr.on = true
    })
    await cdp.send("Performance.enable").catch(() => {})
    const m0 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
    await tapAt(cdp, at.x, at.y)
    await sleep(cold ? 1800 : 1100)
    await p.evaluate(() => (window.__hdr.on = false))
    const m1 = Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
    const cost = { layouts: m1.LayoutCount - m0.LayoutCount, recalcs: m1.RecalcStyleCount - m0.RecalcStyleCount, layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000), styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000), scriptMs: Math.round((m1.ScriptDuration - m0.ScriptDuration) * 1000) }
    await cdp.send("Page.stopScreencast").catch(() => {})
    cdp.off("Page.screencastFrame", onFrame)
    await sleep(100)
    const rec = await p.evaluate(() => window.__hdr)
    const first = rec.frames[0]
    const keys = ["box", "bg", "op", "tf", "row", "canvas", "band", "theme"]
    const changed = {}
    for (const k of keys) {
      const seen = new Set(rec.frames.map((f) => f[k]))
      if (seen.size > 1) changed[k] = Array.from(seen).slice(0, 4)
    }
    const hdrH = first && first.box ? Math.ceil(Number(first.box.split(",")[3])) : 230
    /* The band and the header's own row: the tabs row under it changes on purpose (the line under the chosen tab), so the strip stops above it. */
    const rowBottom = first && first.tabs ? Math.floor(Number(first.tabs.split(",")[1])) - 1 : hdrH
    const diffs = files.length > 1 ? await stripDiffs(dir, files, rowBottom) : []
    const flashes = diffs.filter((d) => d.changed > 40)
    const out = { label, frames: rec.frames.length, swaps: rec.swaps, changed, pngs: files.length, stripPx: rowBottom, flashFrames: flashes.length, worst: Math.max(0, ...diffs.map((d) => d.changed)), writes: rec.writes, cost, ground: first ? [first.bg, first.canvas, first.theme] : null }
    console.log(`  ${tag.padEnd(15)} ${label.padEnd(13)} frames ${String(out.frames).padStart(3)}  swaps ${out.swaps}  changed ${JSON.stringify(changed)}  strip frames ${files.length}, off ${flashes.length} (worst ${out.worst}px)  html/body writes ${rec.writes.length}  ${JSON.stringify(cost)}`)
    if (process.env.VERBOSE) for (const w of rec.writes) console.log(`        ${w}`)
    results.push(out)
    await sleep(500)
  }
  if (run.errors.length) console.log("  page errors:", run.errors.slice(0, 3))
  await p.close()
  return results
}

/* ── LENS ── */

/* Every frame: the lens's opacity, scale, the x scale of its drop (transform), and which properties are animating on it. */
const LENS_RECORDER = `(() => {
  window.__lens = { on: false, frames: [], props: new Set() }
  const frame = () => {
    if (window.__lens.on) {
      const el = document.querySelector("[data-buyer-tabs-lens]")
      if (el) {
        const cs = getComputedStyle(el)
        const m = /matrix\\(([-\\d.e]+)/.exec(cs.transform)
        for (const a of el.getAnimations()) window.__lens.props.add(a.transitionProperty || (a.effect && a.effect.getKeyframes && Object.keys(a.effect.getKeyframes()[0] || {}).filter((k) => !["offset", "easing", "composite", "computedOffset"].includes(k)).join("+")) || "?")
        window.__lens.frames.push({ t: performance.now(), o: Number(cs.opacity), s: Number(cs.scale === "none" ? 1 : cs.scale.split(" ")[0]), sx: m ? Number(m[1]) : 1, x: Number(String(cs.translate).split("px")[0]) || 0 })
      }
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()`

async function lensRun(browser, html, { dark }) {
  const tag = dark ? "dark" : "light"
  const run = await open(browser, html, "/community/clay-studio", { dark, cpu: 1 })
  const { p, cdp } = run
  await sleep(800)
  await p.evaluate(LENS_RECORDER)
  const home = await centreOf(p, '[data-buyer-tab="home"]')
  const prof = await centreOf(p, '[data-buyer-tab="profile"]')
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 10, radiusY: 10, force: 1 }] })
  const out = { tag }
  /* Held: a picture of the glass under a finger, at three times life size. */
  await touch("touchStart", home.x, home.y)
  await sleep(600)
  const bar = await p.evaluate(() => { const b = document.querySelector("[data-buyer-tab-bar]").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height } })
  await p.screenshot({ path: join(shots, `lens-${tag}-held.png`), clip: { x: 0, y: bar.y - 6, width: 200, height: 70 } })
  out.held = await p.evaluate(() => { const el = document.querySelector("[data-buyer-tabs-lens]"); const cs = getComputedStyle(el); return { bg: cs.backgroundColor, image: cs.backgroundImage.slice(0, 120), shadow: cs.boxShadow.slice(0, 160), backdrop: cs.backdropFilter || cs.webkitBackdropFilter, opacity: cs.opacity } })
  await touch("touchEnd")
  await sleep(700)
  /* What the main thread painted while the glass moved: a compositor only motion paints nothing per frame. */
  const paints = async () => {
    const events = JSON.parse(Buffer.from(await p.tracing.stop()).toString("utf8")).traceEvents
    const list = events.filter((e) => e.name === "Paint")
    return { n: list.length, ms: Math.round(list.reduce((a, e) => a + (e.dur || 0), 0) / 100) / 10 }
  }
  /* A quick tap: 45ms. */
  await p.evaluate(() => { window.__lens.frames = []; window.__lens.props = new Set(); window.__lens.on = true })
  await p.tracing.start({ categories: ["devtools.timeline"] })
  await touch("touchStart", home.x, home.y)
  await sleep(45)
  await touch("touchEnd")
  await sleep(800)
  const tapPaints = await paints()
  const tap = await p.evaluate(() => { window.__lens.on = false; return { frames: window.__lens.frames, props: Array.from(window.__lens.props) } })
  const t0 = tap.frames[0]?.t ?? 0
  out.tap = {
    peakOpacity: Math.max(...tap.frames.map((f) => f.o)),
    peakScale: Math.max(...tap.frames.map((f) => f.s)),
    minShownScale: Math.min(...tap.frames.filter((f) => f.o > 0.05).map((f) => f.s)),
    end: tap.frames.at(-1),
    visibleMs: Math.round((tap.frames.filter((f) => f.o > 0.05).at(-1)?.t ?? t0) - (tap.frames.find((f) => f.o > 0.05)?.t ?? t0)),
    /* Largest jump of opacity between two frames: a switch reads as one big step, a fade as many small ones. */
    maxStep: Math.max(0, ...tap.frames.slice(1).map((f, i) => Math.abs(f.o - tap.frames[i].o))),
    props: tap.props,
    paints: tapPaints,
  }
  /* A drag from Home to Profile and back, released over Home: the drop's stretch after the stop, frame by frame. */
  await p.evaluate(() => { window.__lens.frames = []; window.__lens.props = new Set(); window.__lens.on = true })
  await p.tracing.start({ categories: ["devtools.timeline"] })
  await touch("touchStart", home.x, home.y)
  for (let i = 1; i <= 14; i++) { await touch("touchMove", home.x + ((prof.x - home.x) * i) / 14, home.y); await sleep(16) }
  const stopAt = await p.evaluate(() => performance.now())
  await sleep(500)
  for (let i = 1; i <= 8; i++) { await touch("touchMove", prof.x + ((home.x - prof.x) * i) / 8, home.y); await sleep(16) }
  await touch("touchEnd")
  await sleep(900)
  const dragPaints = await paints()
  const drag = await p.evaluate(() => { window.__lens.on = false; return { frames: window.__lens.frames, props: Array.from(window.__lens.props) } })
  /* The swings of the drop either side of round once the finger stopped over Profile, in px on the lens's width. */
  const after = drag.frames.filter((f) => f.t >= stopAt && f.t < stopAt + 500)
  const swings = []
  let dir = 0
  for (let i = 1; i < after.length; i++) {
    const d = after[i].sx - after[i - 1].sx
    const nd = Math.sign(d)
    if (nd && dir && nd !== dir) swings.push(Math.round((after[i - 1].sx - 1) * 70 * 100) / 100)
    if (nd) dir = nd
  }
  out.drag = { swings: swings.filter((s) => Math.abs(s) >= 0.3), allSwings: swings, props: drag.props, paints: dragPaints, peakStretch: Math.round((Math.max(...drag.frames.map((f) => f.sx)) - 1) * 1000) / 1000, endOpacity: drag.frames.at(-1)?.o, endScale: drag.frames.at(-1)?.s }
  console.log(`  ${tag.padEnd(5)} held ${JSON.stringify(out.held)}`)
  console.log(`  ${tag.padEnd(5)} tap  ${JSON.stringify(out.tap)}`)
  console.log(`  ${tag.padEnd(5)} drag ${JSON.stringify(out.drag)}`)
  if (run.errors.length) console.log("  page errors:", run.errors.slice(0, 3))
  await p.close()
  return out
}

/* ── IMAGES ── */

const IMG_RECORDER = `(() => {
  window.__img = { frames: [], on: true }
  const frame = () => {
    if (window.__img.on) {
      const f = { t: performance.now() }
      for (const w of document.querySelectorAll("[data-probe-img]")) {
        const img = w.querySelector("img")
        f[w.getAttribute("data-probe-img")] = img ? Math.round(Number(getComputedStyle(img).opacity) * 100) / 100 : null
      }
      window.__img.frames.push(f)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
})()`

async function imagesRun(browser, html, { dark }) {
  const tag = dark ? "dark" : "light"
  const jpeg = await sharp({ create: { width: 800, height: 450, channels: 3, background: { r: 196, g: 176, b: 150 } } }).jpeg({ quality: 80 }).toBuffer()
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 300)))
  await p.setRequestInterception(true)
  const asked = []
  p.on("request", (r) => {
    const u = r.url()
    if (u.includes("/_next/image") || u.includes("/probe-img/")) {
      asked.push(u.replace(ORIGIN, "").slice(0, 120))
      /* A phone's network: the picture comes 400ms after it is asked for, and may be kept. */
      return void setTimeout(() => r.respond({ status: 200, contentType: "image/jpeg", headers: { "Cache-Control": "public, max-age=600" }, body: jpeg }).catch(() => {}), 400)
    }
    if (u.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.evaluateOnNewDocument((dark) => {
    window.__probeDark = dark
  }, dark)
  await p.evaluateOnNewDocument(IMG_RECORDER)
  await p.goto(`${ORIGIN}/explore`, { waitUntil: "domcontentloaded" })
  await sleep(150)
  /* Before any picture has come: the boxes are there, at their size, in a quiet colour. */
  const boxes = await p.evaluate(() =>
    Array.from(document.querySelectorAll("[data-probe-img]")).map((w) => {
      const img = w.querySelector("img")
      const box = (img?.parentElement ?? w).getBoundingClientRect()
      let el = img?.parentElement ?? w
      let bg = "rgba(0, 0, 0, 0)"
      for (let i = 0; el && i < 4; i++, el = el.parentElement) {
        const c = getComputedStyle(el).backgroundColor
        if (c !== "rgba(0, 0, 0, 0)") { bg = c; break }
      }
      return { name: w.getAttribute("data-probe-img"), w: Math.round(box.width), h: Math.round(box.height), bg, opacity: img ? getComputedStyle(img).opacity : null, loading: img?.getAttribute("loading"), decoding: img?.getAttribute("decoding"), fetchpriority: img?.getAttribute("fetchpriority"), sizes: img?.getAttribute("sizes"), srcset: !!img?.getAttribute("srcset") }
    }),
  )
  await sleep(1200)
  const first = await p.evaluate(() => window.__img.frames.splice(0))
  /* Back to the same screens in the same tab: every picture is in hand. */
  await p.evaluate(() => window.__remount())
  await sleep(600)
  const again = await p.evaluate(() => window.__img.frames.splice(0))
  await p.screenshot({ path: join(shots, `images-${tag}-waiting.png`) }).catch(() => {})
  await p.close()
  const names = boxes.map((b) => b.name)
  const fadeOf = (frames, name) => {
    const seen = frames.map((f) => f[name]).filter((v) => v !== null && v !== undefined)
    const firstShown = seen.findIndex((v) => v > 0)
    const whole = seen.findIndex((v) => v >= 0.99)
    return { firstOpacity: seen[0], framesToWhole: firstShown < 0 || whole < 0 ? null : whole - firstShown, partial: seen.filter((v) => v > 0.02 && v < 0.98).length }
  }
  const out = { tag, boxes, first: Object.fromEntries(names.map((n) => [n, fadeOf(first, n)])), again: Object.fromEntries(names.map((n) => [n, fadeOf(again, n)])), asked: asked.length, errors }
  console.log(`  ${tag} boxes  ${JSON.stringify(boxes)}`)
  console.log(`  ${tag} first  ${JSON.stringify(out.first)}`)
  console.log(`  ${tag} again  ${JSON.stringify(out.again)}`)
  if (errors.length) console.log("  page errors:", errors.slice(0, 2))
  return out
}

/* ── PERF ── */

const metricsOf = async (cdp) => Object.fromEntries((await cdp.send("Performance.getMetrics")).metrics.map((m) => [m.name, m.value]))
const delta = (a, b) => ({
  layouts: b.LayoutCount - a.LayoutCount,
  recalcs: b.RecalcStyleCount - a.RecalcStyleCount,
  layoutMs: Math.round((b.LayoutDuration - a.LayoutDuration) * 1000),
  styleMs: Math.round((b.RecalcStyleDuration - a.RecalcStyleDuration) * 1000),
  scriptMs: Math.round((b.ScriptDuration - a.ScriptDuration) * 1000),
  taskMs: Math.round((b.TaskDuration - a.TaskDuration) * 1000),
  heapMB: Math.round((b.JSHeapUsedSize / 1048576) * 10) / 10,
})
const LONG_TASKS = `(() => {
  window.__long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: true }) } catch {}
  /* Every scroll and touch listener added, and whether it said passive. */
  window.__listeners = []
  const add = EventTarget.prototype.addEventListener
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (/^(touchstart|touchmove|wheel)$/.test(type)) window.__listeners.push(type + ":" + (typeof opts === "object" && opts && opts.passive ? "passive" : "active") + ":" + (this === window ? "window" : this === document ? "document" : (this.tagName || "?") + (this.attributes ? Array.from(this.attributes).filter((a) => a.name.startsWith("data-") || a.name === "class").map((a) => a.name === "class" ? "." + a.value.split(" ").slice(0, 2).join(".") : "[" + a.name + "]").join("").slice(0, 80) : "")) + ":" + (new Error().stack || "").split(String.fromCharCode(10)).slice(2, 4).map((s) => s.trim().slice(0, 90)).join(" < "))
    return add.call(this, type, fn, opts)
  }
})()`

async function perfRun(browser, html, { name, url, init = null, steps }) {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(`${ORIGIN}/api/`)) {
      const short = u.replace(ORIGIN, "")
      let body = {}
      if (short.endsWith("/presence")) body = { ok: true, ready: true }
      else if (short.startsWith("/api/me/places")) body = { signedIn: true, communitiesOn: true, isCreator: false, hasSellerAccess: true, recent: PLACES }
      else if (short.startsWith("/api/notifications")) body = { unread: 0, items: [], nextCursor: null, available: true }
      else if (short.includes("/dms")) body = { ready: true, unread: 2, conversations: [] }
      else if (short.includes("/search?index")) body = { index: { at: Date.now(), spaces: [], posts: [], members: [] } }
      return void r.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) })
    }
    if (u.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (u.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  const cdp = await p.target().createCDPSession()
  await cdp.send("Performance.enable")
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
  await p.evaluateOnNewDocument(LONG_TASKS)
  if (init) await p.evaluateOnNewDocument(init)
  /* PROFILE=1: a CPU profile of each phase, its heaviest functions by their own time (the bundle is not minified). */
  const profiling = !!process.env.PROFILE
  const top = async (label) => {
    if (!profiling) return
    const { profile } = await cdp.send("Profiler.stop")
    const self = new Map()
    const dt = profile.timeDeltas
    const byId = new Map(profile.nodes.map((n) => [n.id, n]))
    profile.samples.forEach((id, i) => {
      const n = byId.get(id)
      const f = n.callFrame
      const key = `${f.functionName || "(anon)"} :${f.lineNumber + 1}`
      self.set(key, (self.get(key) || 0) + (dt[i] || 0) / 1000)
    })
    const rows = [...self.entries()].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 14)
    console.log(`  ${name} ${label}, self time: ${rows.map(([k, v]) => `${k} ${Math.round(v)}ms`).join(", ")}`)
    await cdp.send("Profiler.start")
  }
  if (profiling) {
    await cdp.send("Profiler.enable")
    await cdp.send("Profiler.setSamplingInterval", { interval: 200 })
    await cdp.send("Profiler.start")
  }
  /*
    TRACE=1: the forced layouts and style recalcs of each phase (a Layout or UpdateLayoutTree with a script stack is one script
    asked for in the middle of its work), grouped by the function that asked, and the frames that laid out more than once.
  */
  const tracing = !!process.env.TRACE
  const traceOn = async () => tracing && p.tracing.start({ categories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.stack", "disabled-by-default-devtools.timeline.frame"] })
  const traceOff = async (label) => {
    if (!tracing) return
    const buf = await p.tracing.stop()
    const events = JSON.parse(Buffer.from(buf).toString("utf8")).traceEvents
    const forced = new Map()
    let n = 0
    for (const e of events) {
      if (e.name !== "Layout" && e.name !== "UpdateLayoutTree") continue
      const stack = e.args?.beginData?.stackTrace || e.args?.data?.stackTrace
      if (!stack || !stack.length) continue
      n++
      const f = stack[0]
      const key = `${e.name === "Layout" ? "layout" : "style"} ${f.functionName || "(anon)"}:${f.lineNumber + 1}`
      const ms = (e.dur || 0) / 1000
      const was = forced.get(key) || { n: 0, ms: 0 }
      forced.set(key, { n: was.n + 1, ms: was.ms + ms })
    }
    const rows = [...forced.entries()].sort((a, b) => b[1].ms - a[1].ms).slice(0, 10)
    console.log(`  ${name} ${label}: ${n} forced; ${rows.map(([k, v]) => `${k} x${v.n} ${Math.round(v.ms)}ms`).join(", ")}`)
  }
  await traceOn()
  const m0 = await metricsOf(cdp)
  await p.goto(`${ORIGIN}${url}`, { waitUntil: "load" })
  await sleep(3000)
  const m1 = await metricsOf(cdp)
  await traceOff("load")
  await top("load")
  const longLoad = await p.evaluate(() => window.__long.splice(0))
  /* Scrolled down by a finger's worth at a time, as a reader would. */
  await traceOn()
  for (let i = 0; i < 24; i++) {
    await p.evaluate(() => window.scrollBy(0, 120))
    await sleep(60)
  }
  await sleep(600)
  const m2 = await metricsOf(cdp)
  await traceOff("scroll")
  await top("scroll")
  const longScroll = await p.evaluate(() => window.__long.splice(0))
  let m3 = m2
  let longSteps = []
  if (steps) {
    await traceOn()
    await steps(p, cdp)
    m3 = await metricsOf(cdp)
    await traceOff("steps")
    await top("steps")
    longSteps = await p.evaluate(() => window.__long.splice(0))
  }
  const listeners = await p.evaluate(() => window.__listeners)
  const out = {
    name,
    load: { ...delta(m0, m1), long: longLoad.length, longMs: longLoad.reduce((a, b) => a + b, 0) },
    scroll: { ...delta(m1, m2), long: longScroll.length, longMs: longScroll.reduce((a, b) => a + b, 0) },
    steps: steps ? { ...delta(m2, m3), long: longSteps.length, longMs: longSteps.reduce((a, b) => a + b, 0) } : null,
    activeListeners: listeners.filter((l) => l.includes(":active:")),
    errors,
  }
  console.log(`  ${name.padEnd(8)} load   ${JSON.stringify(out.load)}`)
  console.log(`  ${name.padEnd(8)} scroll ${JSON.stringify(out.scroll)}`)
  if (out.steps) console.log(`  ${name.padEnd(8)} steps  ${JSON.stringify(out.steps)}`)
  console.log(`  ${name.padEnd(8)} scroll/touch listeners not passive: ${JSON.stringify(out.activeListeners)}`)
  if (errors.length) console.log("  page errors:", errors.slice(0, 2))
  await p.close()
  return out
}

let browser
const report = {}
try {
  browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox"], protocolTimeout: 240_000 })
  const html = want("header") || want("lens") ? page(await bundle("scripts/render-mobile-round29.tsx")) : null
  if (want("lens")) {
    console.log("\nLENS: the tab bar's glass, held, tapped and dragged, light and dark")
    const all = [await lensRun(browser, html, { dark: false }), await lensRun(browser, html, { dark: true })]
    report.lens = all
    const COMPOSITOR = new Set(["opacity", "scale", "translate", "transform"])
    for (const r of all) {
      expect(!r.held.backdrop || r.held.backdrop === "none", `${r.tag}: no backdrop blur over an opaque bar`, r.held.backdrop)
      /* Changed on purpose (round 31, catching up with round 30): a tap shows the glass at its own strength, half in the light
         and none in the dark (LENS_TAP_STRENGTH, --sl-tab-lens-tap), and a 45ms tap still reaches all of that strength. */
      const tapStrength = r.tag === "dark" ? 0 : 0.5
      expect(Math.abs(r.tap.peakOpacity - tapStrength) <= 0.01, `${r.tag}: a 45ms tap still shows the glass at the whole of a tap's strength (${tapStrength})`, r.tap.peakOpacity)
      expect(r.tap.end && r.tap.end.o === 0, `${r.tag}: and it is gone again after`, r.tap.end)
      expect(r.tap.maxStep <= 0.35, `${r.tag}: it comes and goes over several frames, never switched in one`, r.tap.maxStep)
      expect(r.tap.peakScale <= 1.02 && r.tap.minShownScale >= 0.88, `${r.tag}: it swells from 0.9 and runs a hair past whole at most`, [r.tap.minShownScale, r.tap.peakScale])
      expect([...r.tap.props, ...r.drag.props].every((x) => x.split("+").every((k) => COMPOSITOR.has(k))), `${r.tag}: only compositor properties animate on it`, [...new Set([...r.tap.props, ...r.drag.props])])
      expect(r.tap.paints.n === 0 && r.drag.paints.n === 0, `${r.tag}: nothing is painted on the main thread while it comes, slides and goes`, [r.tap.paints, r.drag.paints])
      expect(r.drag.swings.length <= 2,`${r.tag}: stopped under a finger, the drop settles in one wobble (swings of 0.3px or more)`, r.drag.allSwings)
    }
  }
  if (want("header")) {
    console.log("\nHEADER: a community's header across tab switches, every frame")
    const all = []
    /* RUNS=lw,dc,ld...: light or dark; warm, cold, or scrolled down the feed first. All six by default. */
    const runs = (process.env.RUNS || "lw,lc,dw,dc,ld,dd").split(",")
    for (const r of runs) all.push(...(await headerRun(browser, html, { dark: r[0] === "d", cold: r[1] === "c", scrolled: r[1] === "d" })))
    report.header = all
    expect(all.length === runs.length * 5, "every tab was pressed, light and dark, warm, cold and scrolled", all.length)
    expect(all.every((r) => r.swaps === 0), "the header is the same element on every switch", all.map((r) => r.swaps))
    expect(all.every((r) => !r.changed.box && !r.changed.row), "its box and its row's box never change, frame to frame", all.filter((r) => r.changed.box || r.changed.row).map((r) => [r.label, r.changed.box, r.changed.row]))
    expect(all.every((r) => !r.changed.bg && !r.changed.op && !r.changed.tf), "its background, opacity and transform never change", all.filter((r) => r.changed.bg || r.changed.op || r.changed.tf).map((r) => [r.label, r.changed]))
    expect(all.every((r) => !r.changed.canvas && !r.changed.band && !r.changed.theme), "the canvas, the band under the clock and theme-color never change", all.filter((r) => r.changed.canvas || r.changed.band || r.changed.theme).map((r) => [r.label, r.changed]))
    expect(all.every((r) => r.flashFrames === 0), "the band and the header's row are the same pixels on every frame", all.map((r) => [r.label, r.flashFrames, r.worst]))
    const hex = (c) => {
      const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/.exec(c || "")
      return m ? "#" + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("") : String(c).toLowerCase()
    }
    expect(all.every((r) => r.ground && r.ground[0] === r.ground[1] && hex(r.ground[0]) === String(r.ground[2]).toLowerCase()), "the canvas and theme-color are the header's own colour, light and dark", Array.from(new Set(all.map((r) => JSON.stringify(r.ground)))))
    expect(all.every((r) => r.writes.length === 0), "a switch writes nothing on <html> or <body> (a write there restyles the whole page)", all.map((r) => r.writes.length))
  }
  if (want("images")) {
    console.log("\nIMAGES: a library row, a community card on Explore and a post's picture, each answered 400ms late; then drawn again")
    const imgs = page(await bundle("scripts/render-images-round29.tsx"))
    const all = [await imagesRun(browser, imgs, { dark: false }), await imagesRun(browser, imgs, { dark: true })]
    report.images = all
    for (const r of all) {
      expect(r.boxes.every((b) => b.w > 0 && b.h > 0), `${r.tag}: every picture's box is there at its size before the picture`, r.boxes.map((b) => [b.name, b.w, b.h]))
      expect(r.boxes.every((b) => b.bg !== "rgba(0, 0, 0, 0)"), `${r.tag}: on a quiet colour of its own`, r.boxes.map((b) => [b.name, b.bg]))
      expect(r.boxes.every((b) => b.decoding === "async" && b.srcset), `${r.tag}: decoded off the main thread, from a srcset`, r.boxes.map((b) => [b.name, b.decoding, b.srcset]))
      expect(r.boxes.filter((b) => b.name === "library-2" || b.name === "library-3").every((b) => b.loading === "lazy") && ["library-1", "explore", "post"].every((n) => r.boxes.find((b) => b.name === n)?.loading === "eager"), `${r.tag}: the first ones eager, the rest lazy`, r.boxes.map((b) => [b.name, b.loading]))
      expect(["explore", "post"].every((n) => r.boxes.find((b) => b.name === n)?.fetchpriority === "high"), `${r.tag}: the first large ones asked for first`, r.boxes.map((b) => [b.name, b.fetchpriority]))
      expect(Object.values(r.first).every((f) => f.firstOpacity === 0 && f.framesToWhole !== null && f.framesToWhole >= 3 && f.framesToWhole <= 20), `${r.tag}: arriving late, each comes up over a short fade, never popped in one frame`, r.first)
      expect(Object.values(r.again).every((f) => f.firstOpacity === 1 && f.partial === 0), `${r.tag}: drawn again in the same tab, each is there on its first frame with no fade`, r.again)
    }
  }
  if (want("perf")) {
    console.log("\nPERF: a 390px phone at 4x CPU: 3s from load, 24 scroll steps, and on the community five tab switches")
    const explore = page(await bundle("scripts/render-explore-page.tsx"))
    const library = page(await bundle("scripts/render-buyer-library.tsx"))
    const feed = html ?? page(await bundle("scripts/render-mobile-round29.tsx"))
    const tabs = async (p, cdp) => {
      await p.evaluate(() => window.scrollTo(0, 0))
      for (const label of ["Learn", "Calendar", "Members", "Leaderboards", "Community"]) {
        const sel = `[data-community-tabs] a[data-community-nav="${label}"]`
        await p.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "nearest", inline: "nearest" }), sel)
        const at = await centreOf(p, sel)
        if (at) await tapAt(cdp, at.x, at.y)
        await sleep(900)
      }
    }
    /* PERF_RUNS (3 by default) of each, and the median of every number: one run at 4x CPU moves by a fifth either way. */
    const RUNS = Number(process.env.PERF_RUNS || 3)
    const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
    const medianOf = (runs, phase) => (runs[0][phase] ? Object.fromEntries(Object.keys(runs[0][phase]).map((k) => [k, median(runs.map((r) => r[phase][k]))])) : null)
    const surfaces = [
      ["explore", explore, { url: "/explore#page" }],
      ["feed", feed, { url: "/community/clay-studio", steps: tabs }],
      ["library", library, { url: "/account/library", init: `window.__mode = "many"` }],
    ]
    report.perf = []
    for (const [name, page, opts] of surfaces) {
      const runs = []
      for (let i = 0; i < RUNS; i++) runs.push(await perfRun(browser, page, { name, ...opts }))
      const m = { name, load: medianOf(runs, "load"), scroll: medianOf(runs, "scroll"), steps: medianOf(runs, "steps") }
      console.log(`  MEDIAN ${name.padEnd(8)} load ${JSON.stringify(m.load)}\n  MEDIAN ${name.padEnd(8)} scroll ${JSON.stringify(m.scroll)}${m.steps ? `\n  MEDIAN ${name.padEnd(8)} steps ${JSON.stringify(m.steps)}` : ""}`)
      report.perf.push(m)
    }
  }
  writeFileSync(join(shots, "report.json"), JSON.stringify(report, null, 2))
} finally {
  await browser?.close()
}
console.log(broken ? `\n${broken} failed` : "\nall ok")
if (broken) process.exit(1)
