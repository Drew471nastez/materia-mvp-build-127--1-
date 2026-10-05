/**
 * ===========================================================================
 *  THE EDGE SWIPE BACK, MEASURED
 * ===========================================================================
 * Round 12, G (ask 39): in the iPhone app a touch that starts within 20px
 * of the left edge drags the page with the finger, a dimmed stand in shows
 * behind, a release past 35% (or a flick) slides the page out and goes back
 * once, a short drag springs back. Never in a phone's browser, never with
 * nothing behind, never over a sheet, the lightbox, the composer, a row
 * that scrolls sideways or a gallery that takes sideways moves itself.
 *
 * scripts/render-edge-swipe.tsx draws the real header, tab bar, history
 * tracker and EdgeSwipeBack over an Explore grid and a product shaped page,
 * in an iPhone shaped window (safe area 59/34, touch, html.capacitor and a
 * Capacitor bridge stub saying iOS), at a quarter of the CPU. Real touches
 * go in over CDP (Input.dispatchTouchEvent), one move per frame.
 *
 *   EDGE      a start at 12px begins the drag, a start at 40px does not
 *   FOLLOW    every animation frame of a drag: the page's offset (html's
 *             computed translate) against the finger's distance from where
 *             it landed, the header moving with the page, the tab bar
 *             staying put, the window's scroll events the page heard
 *   COMPLETE  past 35%: one popstate, Explore on screen, the stand in gone;
 *             a filmstrip of the release (screencast frames)
 *   FLICK     a short fast flick goes back once
 *   CANCEL    a short slow drag springs back: no back, the page where it
 *             was (scroll, header, tab bar), a filmstrip
 *   NEVER     the browser, no history, a sheet, the lightbox, the composer,
 *             the sideways row, the gallery
 *   SCROLL    a vertical drag from the edge (and from the middle) scrolls
 *             the page as before, and no listener here can hold a scroll
 *
 *   PROBE_CSS=source node scripts/check-edge-swipe.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const css = await appCss(root)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".edge-swipe-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-edge-swipe-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const only = (part) => !process.env.PROBE_ONLY || process.env.PROBE_ONLY.split(",").includes(part)
const ORIGIN = "https://storelib.com"
const SAT = 59
const SAB = 34
const THROTTLE = Number(process.env.THROTTLE || 4)

const STUBS = {
  "next-navigation.js": `import { useSyncExternalStore } from "react"
const nav = window.__nav
const subs = new Set()
const notify = () => subs.forEach((f) => f())
const subscribe = (f) => { subs.add(f); return () => subs.delete(f) }
const log = (k, a) => (window.__router ||= []).push([k, a, performance.now()])
const commit = (h, how) => setTimeout(() => {
  const [p, q] = h.split("?")
  nav.path = p; nav.search = q ? "?" + q : ""
  if (how === "push") history.pushState({ __NA: true }, "", h)
  else history.replaceState({ __NA: true }, "", h)
  notify()
}, window.__navMs ?? 120)
window.addEventListener("popstate", () => { (window.__pops ||= []).push(location.pathname); nav.path = location.pathname; nav.search = location.search; notify() })
const router = {
  push: (h) => { log("push", h); commit(h, "push") },
  replace: (h) => { log("replace", h); commit(h, "replace") },
  prefetch: (h) => log("prefetch", h),
  back: () => { log("back"); history.back() },
  refresh: () => {},
}
window.__routerApi = router
export const usePathname = () => useSyncExternalStore(subscribe, () => nav.path, () => nav.path)
export const useRouter = () => router
export const useSearchParams = () => { const s = useSyncExternalStore(subscribe, () => nav.search, () => nav.search); return new URLSearchParams(s) }
export const useParams = () => ({})
export const redirect = () => {}
export const notFound = () => {}
`,
  /* A Link navigates through the router, as next/link does, so a tap taken on the lift AND its click would show as two pushes. */
  "next-link.jsx": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href, performance.now()]); window.__routerApi.push(href) } } }, children) })
export const useLinkStatus = () => ({ pending: false })
`,
  "next-image.jsx": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, quality, className, style, ...rest }) {
  const url = typeof src === "string" ? src : ""
  return React.createElement("img", { src: url, alt, className, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style, ...rest })
}
`,
  /* The native calls, recorded: what the status bar and the splash were asked. */
  /* The real core for every other plugin; its SystemBars recorded. */
  "capacitor-core.js": `export * from "@capacitor/core-real"
export const SystemBars = { setStyle: async (o) => { (window.__bars ||= []).push(["SystemBars", o.style]) } }
`,
  "capacitor-status-bar.js": `export const Style = { Light: "LIGHT", Dark: "DARK", Default: "DEFAULT" }
export const StatusBar = { setStyle: async (o) => { (window.__bars ||= []).push(["StatusBar", o.style]) }, setBackgroundColor: async (o) => { (window.__bars ||= []).push(["StatusBarBg", o.color]) } }
`,
  "capacitor-splash.js": `export const SplashScreen = { hide: async () => { (window.__splash ||= []).push(performance.now()) } }
`,
  "supabase-client.jsx": `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
function chain(table) {
  const b = {
    select() { return b }, eq() { return b }, limit() { return b }, order() { return b }, single() { return b }, maybeSingle() { return b },
    or() { return b }, in() { return b }, gte() { return b }, lte() { return b }, neq() { return b }, range() { return b }, is() { return b },
    then(res) { setTimeout(() => res({ data: table === "profiles" ? { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: false } : null, error: null }), 10) },
  }
  return b
}
export function isNativePlatform() { return !!window.__native }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: () => ({ on() { return this }, subscribe() { return this } }),
    removeChannel() {},
  }
}
`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, k), v)

let html
try {
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-edge-swipe.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "next-navigation.js") }))
        b.onResolve({ filter: /^next\/link$/ }, () => ({ path: join(stubs, "next-link.jsx") }))
        b.onResolve({ filter: /^next\/image$/ }, () => ({ path: join(stubs, "next-image.jsx") }))
        b.onResolve({ filter: /^@capacitor\/core$/ }, () => ({ path: join(stubs, "capacitor-core.js") }))
        b.onResolve({ filter: /^@capacitor\/core-real$/ }, () => ({ path: join(root, "node_modules/@capacitor/core/dist/index.js") }))
        b.onResolve({ filter: /^@capacitor\/status-bar$/ }, () => ({ path: join(stubs, "capacitor-status-bar.js") }))
        b.onResolve({ filter: /^@capacitor\/splash-screen$/ }, () => ({ path: join(stubs, "capacitor-splash.js") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
  const js = readFileSync(join(stubs, "app.js"), "utf8")
  /* The root layout's viewport, with its theme-color, and <html> marked before the body as the layout's head script does. */
  html = (native) => `<!doctype html><html class="light${native ? " capacitor" : ""}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#ffffff"><style>${faces}</style><style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body class="bg-background"><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"], protocolTimeout: 180000 })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const W = PHONE.width

/* What the page heard, every frame: the finger, the page's offset, where the header and the tab bar are, the gesture's phase. */
const INSTRUMENT = () => {
  const w = window
  w.__finger = { x: 0, start: 0, down: false }
  w.__heardScroll = 0
  w.__frames = []
  w.__long = []
  window.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t) { w.__finger.start = t.clientX; w.__finger.x = t.clientX; w.__finger.down = true } }, { passive: true, capture: true })
  window.addEventListener("touchmove", (e) => { const t = e.touches[0]; if (t) w.__finger.x = t.clientX; w.__moveT0 = performance.now() }, { passive: true, capture: true })
  /* What the swipe's own touchmove cost: it runs between this window listener and the document's capture listener below. */
  w.__moveCost = []
  document.addEventListener("touchmove", () => { w.__moveCost.push([+(performance.now() - w.__moveT0).toFixed(2), document.documentElement.getAttribute("data-edge-swipe")]) }, { passive: true, capture: true })
  window.addEventListener("touchend", () => { w.__finger.down = false }, { passive: true, capture: true })
  /* After the swipe's own mute (capture, on window), so this counts only what the page's listeners would hear. */
  window.addEventListener("scroll", () => { w.__heardScroll++ })
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__long.push(Math.round(e.duration)) }).observe({ type: "longtask", buffered: false }) } catch {}
  let on = false
  const tick = () => {
    if (!on) return
    const html = document.documentElement
    const tr = getComputedStyle(html).translate
    const page = tr && tr !== "none" ? parseFloat(tr) : 0
    const head = document.getElementById("platform-header-root")?.getBoundingClientRect()
    const tab = document.querySelector("[data-buyer-tab-bar]")?.getBoundingClientRect()
    const back = document.querySelector("[data-edge-swipe-backdrop]")
    w.__frames.push({
      t: performance.now(),
      finger: w.__finger.down ? w.__finger.x - w.__finger.start : null,
      page,
      phase: html.getAttribute("data-edge-swipe"),
      headLeft: head ? head.left : null,
      headTop: head ? head.top : null,
      tabLeft: tab ? tab.left : null,
      tabTop: tab ? tab.top : null,
      backdrop: back ? getComputedStyle(back).display !== "none" : false,
    })
    requestAnimationFrame(tick)
  }
  w.__sample = (v) => { on = v; if (v) { w.__frames = []; requestAnimationFrame(tick) } }
}

async function open(address, { native = true, throttle = THROTTLE, navMs = 120 } = {}) {
  const p = await browser.newPage()
  await p.setViewport(PHONE)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: SAT, bottom: SAB } })
  if (native) await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor")
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 240)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const u = r.url()
    if (u.startsWith(ORIGIN) && r.resourceType() === "document") return r.respond({ status: 200, contentType: "text/html", body: html(native) })
    if (u.startsWith(ORIGIN + "/__font/")) {
      const file = fontFiles.get(u.split("/").pop())
      if (file && existsSync(file)) return r.respond({ status: 200, contentType: "font/woff2", headers: { "access-control-allow-origin": "*" }, body: readFileSync(file) })
    }
    if (u.startsWith(ORIGIN + "/")) {
      const file = join(root, "public", decodeURIComponent(new URL(u).pathname))
      if (existsSync(file) && statSync(file).isFile()) return r.respond({ status: 200, contentType: file.endsWith(".svg") ? "image/svg+xml" : file.endsWith(".png") ? "image/png" : "application/octet-stream", body: readFileSync(file) })
    }
    if (u.startsWith("data:")) return r.continue()
    return r.respond({ status: 404, body: "" })
  })
  const [path, search] = address.split("?")
  await p.evaluateOnNewDocument((path, search, native, navMs) => {
    window.__nav = { path, search: search ? "?" + search : "" }
    window.__who = "buyer"
    window.__light = true
    window.__navMs = navMs
    window.__native = native
    if (native) {
      const own = { isNativePlatform: () => true, getPlatform: () => "ios" }
      const bridge = new Proxy({ ...own, Plugins: {} }, { set: (t, k, v) => { if (!(k in own)) t[k] = v; return true } })
      Object.defineProperty(window, "Capacitor", { configurable: true, get: () => bridge, set: () => {} })
    }
    try {
      localStorage.clear()
      localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "", native, navMs)
  await p.evaluateOnNewDocument(INSTRUMENT)
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(600)
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
  return { p, cdp, errors }
}

/* Each touch carries the time the finger was there (as a phone's input does), so the release speed is the finger's, not the probe's delivery. */
let clock = 0
const touch = (cdp, type, x, y, at = null) => {
  clock = at ?? Math.max(clock + 0.016, Date.now() / 1000)
  return cdp.send("Input.dispatchTouchEvent", { type, timestamp: clock, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1, id: 1 }] })
}

/** A finger: down at (x0, y0), `steps` moves of (dx, dy) each `gap` ms apart, then up unless told to hold. */
async function swipe(cdp, { x0, y0, dx = 0, dy = 0, steps = 12, gap = 16, end = true, shotsAt = null, p = null, name = "" }) {
  const t0 = Math.max(clock + 1, Date.now() / 1000)
  await touch(cdp, "touchStart", x0, y0, t0)
  await sleep(gap)
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", x0 + dx * i, y0 + dy * i, t0 + (gap * i) / 1000)
    await sleep(gap)
    if (shotsAt && shotsAt.includes(i) && p) {
      await sleep(40)
      await p.screenshot({ path: join(shots, `${name}-drag-${i}.png`), captureBeyondViewport: false })
    }
  }
  if (end) await touch(cdp, "touchEnd", x0 + dx * steps, y0 + dy * steps, t0 + (gap * (steps + 1)) / 1000)
}

/** The product page, reached from Explore by a client move, scrolled to `y`: a page of ours behind it. */
async function productWithHistory(opts = {}, y = 400) {
  const o = await open("/explore", opts)
  await o.p.evaluate(() => window.scrollTo(0, 900))
  await sleep(150)
  await o.p.evaluate(() => window.__routerApi.push("/maker/preset-pack"))
  await o.p.waitForFunction(() => !!document.querySelector('[data-probe-page="product"]'), { timeout: 8000 })
  await sleep(500)
  await o.p.evaluate((y) => window.scrollTo(0, y), y)
  await sleep(400)
  return o
}

/** Screencast frames while `fn` runs and for `ms` after. */
async function film(cdp, fn, ms) {
  const frames = []
  const onFrame = async (f) => {
    frames.push({ data: f.data, t: f.metadata.timestamp })
    try { await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }) } catch {}
  }
  cdp.on("Page.screencastFrame", onFrame)
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, everyNthFrame: 1, maxWidth: 390, maxHeight: 844 })
  await fn()
  await sleep(ms)
  await cdp.send("Page.stopScreencast")
  cdp.off("Page.screencastFrame", onFrame)
  return frames
}

/** Up to `n` frames side by side, each labelled with its time from the first, into one picture. */
async function filmstrip(frames, file, n = 8) {
  if (!frames.length) return 0
  const pick = []
  const step = Math.max(1, (frames.length - 1) / (n - 1))
  for (let i = 0; i < n && Math.round(i * step) < frames.length; i++) pick.push(frames[Math.round(i * step)])
  const t0 = frames[0].t
  const pg = await browser.newPage()
  await pg.setViewport({ width: pick.length * 200, height: 460 })
  const b64 = await pg.evaluate(async (pick, t0) => {
    const c = document.createElement("canvas")
    c.width = pick.length * 200
    c.height = 460
    const x = c.getContext("2d")
    x.fillStyle = "#fff"
    x.fillRect(0, 0, c.width, c.height)
    for (let i = 0; i < pick.length; i++) {
      const img = new Image()
      img.src = "data:image/jpeg;base64," + pick[i].data
      await img.decode()
      x.drawImage(img, i * 200 + 4, 4, 192, 192 * (img.height / img.width))
      x.fillStyle = "#000"
      x.font = "13px sans-serif"
      x.fillText(`+${Math.round((pick[i].t - t0) * 1000)}ms`, i * 200 + 8, 452)
    }
    return c.toDataURL("image/png").split(",")[1]
  }, pick, t0)
  writeFileSync(file, Buffer.from(b64, "base64"))
  await pg.close()
  return pick.length
}

const state = (p) => p.evaluate(() => {
  const head = document.getElementById("platform-header-root")?.getBoundingClientRect()
  const tab = document.querySelector("[data-buyer-tab-bar]")?.getBoundingClientRect()
  const back = document.querySelector("[data-edge-swipe-backdrop]")
  return {
    path: location.pathname,
    page: document.querySelector("[data-probe-page]")?.getAttribute("data-probe-page") ?? null,
    pops: (window.__pops || []).length,
    pushes: (window.__router || []).filter((r) => r[0] === "push" || r[0] === "replace").length,
    phase: document.documentElement.getAttribute("data-edge-swipe"),
    translate: getComputedStyle(document.documentElement).translate,
    htmlStyle: document.documentElement.getAttribute("style") || "",
    bodyStyle: document.body.getAttribute("style") || "",
    scrollY: Math.round(window.scrollY),
    headTop: head ? Math.round(head.top) : null,
    headLeft: head ? Math.round(head.left) : null,
    tabLeft: tab ? Math.round(tab.left) : null,
    tabTop: tab ? Math.round(tab.top) : null,
    backdrop: back ? getComputedStyle(back).display !== "none" : false,
    heardScroll: window.__heardScroll,
  }
})
/* Whether the swipe ever took the page: any frame with a phase, or a moved page. */
const tookIt = (frames) => frames.some((f) => f.phase || Math.abs(f.page) > 0.5)

try {
  /* ── EDGE + FOLLOW + COMPLETE ──────────────────────────────────────────── */
  if (only("complete")) {
    console.log(`\nEDGE, FOLLOW, COMPLETE (iPhone app, CPU / ${THROTTLE})`)
    const { p, cdp, errors } = await productWithHistory()
    const before = await state(p)
    expect(before.page === "product" && before.scrollY === 400, "on the product page, scrolled, with Explore behind", before)
    if (process.env.PROBE_WHY) console.log(JSON.stringify(await p.evaluate(() => window.__edgeWhy(12, 500))))

    /* A start at 40px is not the edge. */
    await p.evaluate(() => window.__sample(true))
    await swipe(cdp, { x0: 40, y0: 500, dx: 18, steps: 12 })
    await sleep(500)
    let frames = await p.evaluate(() => { window.__sample(false); return window.__frames })
    let s = await state(p)
    expect(!tookIt(frames) && s.pops === 0 && s.path === "/maker/preset-pack", "a start at 40px: the page never moves, no back", { took: tookIt(frames), pops: s.pops })

    /* A start at 12px: the page follows every frame. */
    await p.evaluate(() => { window.__heardScroll = 0; window.__long = []; window.__sample(true) })
    await swipe(cdp, { x0: 12, y0: 500, dx: 18, steps: 13, end: false, shotsAt: [2, 6, 12], p, name: "complete" })
    frames = await p.evaluate(() => window.__frames)
    const drag = frames.filter((f) => f.phase === "drag" && f.finger !== null)
    const off = drag.map((f) => Math.abs(f.page - Math.max(0, f.finger)))
    const worst = off.length ? Math.max(...off) : null
    const headOff = drag.map((f) => Math.abs((f.headLeft ?? f.page) - f.page))
    const tabOff = drag.map((f) => Math.abs(f.tabLeft ?? 0))
    const headTops = drag.map((f) => Math.abs((f.headTop ?? 0) - 0))
    const pre = frames.filter((f) => !f.phase && f.finger !== null && f.finger > 0).length
    expect(drag.length >= 8, "a start at 12px begins the drag", { dragFrames: drag.length, framesBeforeClaim: pre })
    expect(worst !== null && worst <= 1, "every frame of the drag: the page's offset is the finger's distance (within 1px)", { frames: drag.length, worstPx: worst })
    expect(Math.max(...headOff, 0) <= 1 && Math.max(...headTops, 0) <= 1, "the fixed header moves with the page and stays at the top", { worstLeft: Math.max(...headOff, 0), worstTop: Math.max(...headTops, 0) })
    expect(Math.max(...tabOff, 0) <= 1, "the tab bar stays put, as on iOS", Math.max(...tabOff, 0))
    const heard = await p.evaluate(() => window.__heardScroll)
    expect(heard === 0, "the page heard no scroll from the hand over", heard)
    const lastFinger = drag.length ? drag[drag.length - 1].finger : 0
    /* The cost of the swipe's own handler per move, at a quarter of the CPU: the move that takes the page (the hand over of the scroll) and every one after. */
    const cost = await p.evaluate(() => window.__moveCost)
    const claim = cost.find((c) => c[1] === "drag")
    const after = cost.filter((c) => c[1] === "drag").slice(1).map((c) => c[0])
    console.log(`        handler cost at CPU/${THROTTLE}: the move that takes the page ${claim ? claim[0] : "?"}ms, every move after it at most ${after.length ? Math.max(...after) : "?"}ms (median ${after.length ? after.sort((a, b) => a - b)[after.length >> 1] : "?"}ms)`)
    expect(after.length > 0 && Math.max(...after) < 4, "a move during the drag costs the main thread under 4ms (at a quarter of the CPU)", Math.max(...after))

    /* Let go at about 60%: the page slides out, the back goes once, Explore comes. */
    const frames2 = await film(cdp, () => touch(cdp, "touchEnd", 12 + 18 * 13, 500), 1600)
    const strip = await filmstrip(frames2, join(shots, "complete-release-film.png"), 8)
    frames = await p.evaluate(() => { window.__sample(false); return window.__frames })
    s = await state(p)
    const settleFrames = frames.filter((f) => f.phase === "settle")
    const monotonic = settleFrames.every((f, i) => i === 0 || f.page >= settleFrames[i - 1].page - 0.5)
    expect(s.pops === 1 && s.path === "/explore" && s.page === "explore" && s.pushes === 1, "released at 60%: exactly one back, Explore on screen (the one push is the way there)", { pops: s.pops, path: s.path, pushes: s.pushes })
    expect(monotonic && settleFrames.length >= 3, "the page slides out in one direction, over several frames", { frames: settleFrames.length, from: lastFinger, to: settleFrames.at(-1)?.page })
    expect(!s.phase && !s.backdrop && s.translate === "none" && !/overflow|height/.test(s.htmlStyle + s.bodyStyle), "after: no gesture state left, the stand in gone, html and body as they were", { phase: s.phase, backdrop: s.backdrop, html: s.htmlStyle, body: s.bodyStyle })
    expect(s.headTop === 0 && s.headLeft === 0 && s.tabLeft === 0, "the header and the tab bar where they belong on the page behind", s)
    console.log(`        filmstrip: ${strip} frames of ${frames2.length} -> complete-release-film.png`)
    await sleep(800)
    s = await state(p)
    expect(s.pops === 1, "and no second back afterwards", s.pops)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── TAB BAR ───────────────────────────────────────────────────────────── */
  if (only("tabbar")) {
    console.log("\nTAB BAR (a library page, the tab bar up)")
    const { p, cdp, errors } = await open("/explore")
    await p.evaluate(() => window.__routerApi.push("/account/library"))
    await p.waitForFunction(() => !!document.querySelector('[data-probe-page="library"]'), { timeout: 8000 })
    await sleep(500)
    await p.evaluate(() => window.scrollTo(0, 300))
    await sleep(400)
    const before = await state(p)
    await p.evaluate(() => window.__sample(true))
    await swipe(cdp, { x0: 8, y0: 420, dx: 16, steps: 12, end: false })
    await sleep(60)
    await p.screenshot({ path: join(shots, "tabbar-drag.png"), captureBeyondViewport: false })
    const frames = (await p.evaluate(() => window.__frames)).filter((f) => f.phase === "drag" && f.finger !== null)
    const worst = Math.max(...frames.map((f) => Math.abs(f.page - Math.max(0, f.finger))))
    const tabMoved = Math.max(...frames.map((f) => Math.max(Math.abs(f.tabLeft ?? 99), Math.abs((f.tabTop ?? 0) - (before.tabTop ?? 0)))))
    const headMoved = Math.max(...frames.map((f) => Math.abs((f.headLeft ?? 99) - f.page) + Math.abs(f.headTop ?? 99)))
    expect(before.tabTop !== null && frames.length >= 6 && worst <= 1, "the page follows the finger every frame", { frames: frames.length, worstPx: worst, tabTop: before.tabTop })
    expect(tabMoved <= 1, "the tab bar stays exactly where it was", tabMoved)
    expect(headMoved <= 1, "the header goes with the page", headMoved)
    await touch(cdp, "touchEnd", 8 + 16 * 12, 420)
    await sleep(1600)
    const s = await state(p)
    await p.evaluate(() => window.__sample(false))
    expect(s.pops === 1 && s.page === "explore" && s.tabLeft === 0 && s.tabTop === before.tabTop, "released at half: back once to Explore, the tab bar never moved", { pops: s.pops, page: s.page, tab: [s.tabLeft, s.tabTop] })
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── FLICK ─────────────────────────────────────────────────────────────── */
  if (only("flick")) {
    console.log("\nFLICK")
    const { p, cdp, errors } = await productWithHistory()
    await p.evaluate(() => window.__sample(true))
    await swipe(cdp, { x0: 10, y0: 500, dx: 24, steps: 4, gap: 8 })
    await sleep(1600)
    const fr = await p.evaluate(() => { window.__sample(false); return window.__frames })
    if (process.env.PROBE_WHY) console.log(JSON.stringify(fr.filter((f) => f.phase).map((f) => [Math.round(f.t), f.phase, Math.round(f.page), f.finger])))
    const s = await state(p)
    expect(s.pops === 1 && s.page === "explore" && !s.phase && !s.backdrop, "a short fast flick (96px, a quarter of the width) goes back once", s)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── CANCEL ────────────────────────────────────────────────────────────── */
  if (only("cancel")) {
    console.log("\nCANCEL")
    const { p, cdp, errors } = await productWithHistory()
    const before = await state(p)
    await p.evaluate(() => { window.__heardScroll = 0; window.__sample(true) })
    await swipe(cdp, { x0: 12, y0: 500, dx: 9, steps: 10, gap: 30, end: false })
    await sleep(140)
    await p.screenshot({ path: join(shots, "cancel-held.png"), captureBeyondViewport: false })
    const frames2 = await film(cdp, () => touch(cdp, "touchEnd", 12 + 90, 500), 900)
    await filmstrip(frames2, join(shots, "cancel-film.png"), 8)
    const frames = await p.evaluate(() => { window.__sample(false); return window.__frames })
    const s = await state(p)
    const settle = frames.filter((f) => f.phase === "settle")
    const back = settle.every((f, i) => i === 0 || f.page <= settle[i - 1].page + 0.5)
    expect(s.pops === 0 && s.page === "product", "a short slow drag (90px, 23%) does not go back", { pops: s.pops, page: s.page })
    expect(back && settle.length >= 3 && settle.every((f) => f.page >= -0.5), "it springs back over several frames, never past the edge", { frames: settle.length, min: Math.min(...settle.map((f) => f.page)) })
    expect(!s.phase && !s.backdrop && s.translate === "none" && !/overflow|height/.test(s.htmlStyle + s.bodyStyle), "after: nothing left behind", { html: s.htmlStyle, body: s.bodyStyle })
    expect(s.scrollY === before.scrollY && s.headTop === before.headTop && s.headLeft === 0 && s.tabTop === before.tabTop && s.tabLeft === before.tabLeft, "the page is where it was: scroll, header, tab bar", { before: [before.scrollY, before.headTop, before.tabTop], after: [s.scrollY, s.headTop, s.tabTop] })
    expect(s.heardScroll === 0, "and the page heard no scroll", s.heardScroll)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }

  /* ── NEVER ─────────────────────────────────────────────────────────────── */
  if (only("never")) {
    console.log("\nNEVER")
    const tryIt = async (p, cdp, x0, y0) => {
      await p.evaluate(() => window.__sample(true))
      await swipe(cdp, { x0, y0, dx: 20, steps: 12 })
      await sleep(1200)
      const frames = await p.evaluate(() => { window.__sample(false); return window.__frames })
      return { took: tookIt(frames), ...(await state(p)) }
    }
    {
      const { p, cdp, errors } = await productWithHistory({ native: false })
      const r = await tryIt(p, cdp, 10, 500)
      expect(!r.took && r.pops === 0, "in a phone's browser: nothing (the browser has its own)", { took: r.took, pops: r.pops })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
    {
      const { p, cdp, errors } = await open("/maker/preset-pack")
      await p.evaluate(() => window.scrollTo(0, 400))
      await sleep(200)
      const r = await tryIt(p, cdp, 10, 500)
      expect(!r.took && r.pops === 0 && r.pushes === 0, "with no history behind: nothing", { took: r.took, pops: r.pops, pushes: r.pushes })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
    for (const what of ["sheet", "lightbox", "composer"]) {
      const { p, cdp, errors } = await productWithHistory({}, 0)
      await p.click(`[data-probe-open="${what}"]`)
      await sleep(700)
      const up = await p.evaluate(() => ({ sheet: document.documentElement.getAttribute("data-app-sheet-up"), lightbox: !!document.querySelector("[data-lightbox]"), composer: document.querySelector("[data-composer]")?.getAttribute("data-composer") }))
      if (what === "sheet") await p.screenshot({ path: join(shots, "never-sheet.png"), captureBeyondViewport: false })
      const r = await tryIt(p, cdp, 10, 600)
      expect(!r.took && r.pops === 0, `with the ${what} up: nothing`, { up, took: r.took, pops: r.pops })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
    {
      const { p, cdp, errors } = await productWithHistory({}, 0)
      const y = await p.evaluate(() => { const el = document.querySelector("[data-probe-hscroll]"); el.scrollIntoView({ block: "center" }); const r = el.getBoundingClientRect(); return Math.round(r.top + r.height / 2) })
      await sleep(300)
      const r = await tryIt(p, cdp, 10, y)
      expect(!r.took && r.pops === 0, "a finger at the edge inside a row that scrolls sideways: nothing", { took: r.took, pops: r.pops })
      await p.evaluate(() => window.scrollTo(0, 0))
      await sleep(300)
      const r2 = await tryIt(p, cdp, 10, 300)
      expect(!r2.took && r2.pops === 0, "on a gallery that takes sideways moves itself (touch-action: pan-y): nothing", { took: r2.took, pops: r2.pops })
      expect(errors.length === 0, "no errors", errors)
      await p.close()
    }
  }

  /* ── SCROLL ────────────────────────────────────────────────────────────── */
  if (only("scroll")) {
    console.log("\nSCROLL")
    const { p, cdp, errors } = await productWithHistory()
    for (const x0 of [12, 200]) {
      const y0 = (await state(p)).scrollY
      await p.evaluate(() => window.__sample(true))
      await swipe(cdp, { x0, y0: 640, dx: 0.4, dy: -25, steps: 12 })
      await sleep(700)
      const frames = await p.evaluate(() => { window.__sample(false); return window.__frames })
      const s = await state(p)
      expect(!tookIt(frames) && s.scrollY > y0 + 150 && s.pops === 0, `a vertical drag starting at x=${x0} scrolls the page, the swipe stays out of it`, { from: y0, to: s.scrollY, took: tookIt(frames) })
    }
    /* No listener of the swipe's can hold a scroll: every touch listener on window and document is passive. */
    const listeners = []
    for (const target of ["window", "document"]) {
      const { result } = await cdp.send("Runtime.evaluate", { expression: target })
      const { listeners: ls } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId })
      for (const l of ls) if (l.type === "touchstart" || l.type === "touchmove") listeners.push(`${target}:${l.type}:${l.passive ? "passive" : "BLOCKING"}`)
    }
    /* Only a touchstart or touchmove listener can make a scroll wait for the main thread. */
    expect(listeners.length > 0 && listeners.every((l) => l.endsWith("passive")), "every touchstart and touchmove listener on window and document is passive (nothing can hold a scroll)", listeners)
    expect(errors.length === 0, "no errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nshots: ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
