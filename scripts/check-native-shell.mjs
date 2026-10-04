/**
 * ===========================================================================
 *  THE APP'S SHELL, MEASURED: BAND, VEIL, BACK AND PILLS
 * ===========================================================================
 * Round 9, N2. The owner's screenshots 56, 57 and 59: a black strip above
 * Explore's white header in the phone app, and on the library and the
 * account a white strip over a translucent grey header that the page showed
 * through. Then "no grey veil when a finger touches a card", "a double tap
 * on back goes back once" and "a library pill answers the first tap".
 *
 * scripts/render-native-shell.tsx draws the real header, NativeChrome, real
 * cards, the real library stage and pills and the real back chevron, here
 * inside an iPhone shaped window with the safe area REALLY emulated
 * (Emulation.setSafeAreaInsetsOverride: env(safe-area-inset-top) is 59px)
 * and <html class="capacitor"> with a Capacitor bridge stub, so every
 * html.capacitor rule in app/globals.css applies as it does in the app.
 *
 *   BAND     at /explore, /account, /account/library and a creator's page:
 *            the pixel under the clock and the pixel at the top of the
 *            header are the same colour, white; scrolled so a red block
 *            sits under the header, the header still reads white (opaque);
 *            theme-color and the status bar's style follow the band (the
 *            plugin calls are recorded); a dark header gives a dark band
 *            and light status text. Pictures to SHOTS_DIR.
 *   VEIL     a finger resting on a product card, a community card and a
 *            community row, and a finger starting a scroll on one: the
 *            pixels of the card before and while touched (mean and max
 *            channel difference).
 *   BACK     a long list, a detail page with the real BackChevron: two
 *            taps 90ms apart go back once (one popstate, the list's
 *            address), and the list's scroll is where it was.
 *   PILLS    at a quarter of the CPU, a pill tapped at rest, during the
 *            cross fade of the last press, right after it, and at the
 *            pill's very edge: each tap is one move to that pill, on the
 *            first tap, never two.
 *
 *   PROBE_CSS=source node scripts/check-native-shell.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
/* PROBE_STYLESHEET=<file>: measure another globals.css (the base commit's, for a before and after) over these components. */
const css = await appCss(root, process.env.PROBE_STYLESHEET || null)
const fontFiles = new Map()
const faces = interFaces(root).replace(/url\(file:\/\/([^)]+)\)/g, (_, path) => {
  const name = path.split("/").pop()
  fontFiles.set(name, path)
  return `url(https://storelib.com/__font/${name})`
})
const stubs = join(root, ".native-shell-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-native-shell-")), "shots")
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
    entryPoints: [join(root, "scripts/render-native-shell.tsx")],
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

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }

async function open(address, { native = true, light = true, who = "buyer", throttle = 1, navMs = 120 } = {}) {
  const p = await browser.newPage()
  await p.setViewport(PHONE)
  const cdp = await p.createCDPSession()
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: SAT, bottom: SAB } })
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
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
  await p.evaluateOnNewDocument((path, search, who, native, light, navMs) => {
    window.__nav = { path, search: search ? "?" + search : "" }
    window.__who = who
    window.__light = light
    window.__navMs = navMs
    window.__native = native
    /* The native bridge's global, as the shell injects it. Kept when @capacitor/core loads (it rebuilds the global from the page's own on the web, where it would say "not native"). */
    if (native) {
      const own = { isNativePlatform: () => true, getPlatform: () => "ios" }
      const bridge = new Proxy({ ...own, Plugins: {} }, { set: (t, k, v) => { if (!(k in own)) t[k] = v; return true } })
      Object.defineProperty(window, "Capacitor", { configurable: true, get: () => bridge, set: () => {} })
    }
    try {
      localStorage.clear()
      if (who !== "guest") localStorage.setItem("_sl_auth_v1", JSON.stringify({ signedIn: true, userId: "u1", avatarUrl: null, displayName: "Ava Stone", username: "ava", isSeller: false }))
    } catch {}
  }, path, search || "", who, native, light, navMs)
  await p.goto(ORIGIN + address, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(700 * Math.min(throttle, 2))
  return { p, cdp, errors }
}

/* The colour of one CSS pixel of the page as it is on the glass, from a screenshot (so it is what is painted, not what is computed). */
async function pixels(p, points) {
  const buf = await p.screenshot({ encoding: "base64", captureBeyondViewport: false })
  return p.evaluate(async (b64, points, dpr) => {
    const img = new Image()
    img.src = "data:image/png;base64," + b64
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const x = c.getContext("2d")
    x.drawImage(img, 0, 0)
    return points.map(([px, py]) => Array.from(x.getImageData(Math.round(px * dpr), Math.round(py * dpr), 1, 1).data.slice(0, 3)))
  }, buf, points, PHONE.deviceScaleFactor)
}
const hex = (rgb) => "#" + rgb.map((n) => n.toString(16).padStart(2, "0")).join("")
const same = (a, b, tol = 2) => a.every((v, i) => Math.abs(v - b[i]) <= tol)

/* The card's own pixels, every 4th in each direction, as a list of numbers. */
async function cardPixels(p, sel) {
  const box = await p.$eval(sel, (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: Math.min(r.height, 700) } })
  const top = Math.max(0, box.y)
  const height = Math.min(box.h, 844 - top)
  if (height < 4) throw new Error(`${sel} is off the screen: ${JSON.stringify(box)} at scroll ${await p.evaluate(() => scrollY)}`)
  /* A clip is in page coordinates: the window's own top is at scrollY. */
  const sy = await p.evaluate(() => scrollY)
  const buf = await p.screenshot({ encoding: "base64", clip: { x: box.x, y: top + sy, width: box.w, height }, captureBeyondViewport: false })
  const data = await p.evaluate(async (b64) => {
    const img = new Image()
    img.src = "data:image/png;base64," + b64
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const x = c.getContext("2d")
    x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    const out = []
    for (let i = 0; i < d.length; i += 16) out.push(d[i], d[i + 1], d[i + 2])
    return out
  }, buf)
  return { box, data }
}
const diff = (a, b) => {
  let sum = 0
  let max = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    const d = Math.abs(a[i] - b[i])
    sum += d
    if (d > max) max = d
  }
  return { mean: +(sum / n).toFixed(2), max }
}
/* Every element of the card, with what could veil it: its opacity, filter and background. A scroll moves the card, so this is compared rather than pixels. */
const veilStyles = (p, sel) =>
  p.$eval(sel, (card) => [card, ...card.querySelectorAll("*")].map((el) => { const cs = getComputedStyle(el); return `${cs.opacity}|${cs.filter}|${cs.backgroundColor}|${cs.boxShadow}` }))
const changed = (a, b) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0)
/* Force (or with `states` empty, clear) pseudo states on the element at a point and all its ancestors. */
async function forcePress(cdp, x, y, states, nodes = null) {
  await cdp.send("DOM.enable")
  await cdp.send("CSS.enable")
  if (!nodes) {
    const { result } = await cdp.send("Runtime.evaluate", {
      expression: `(() => { document.querySelectorAll("[data-probe-press]").forEach((n) => n.removeAttribute("data-probe-press")); let el = document.elementFromPoint(${x}, ${y}); let n = 0; while (el && el !== document.documentElement) { el.setAttribute("data-probe-press", ""); el = el.parentElement; n++ } return n })()`,
      returnByValue: true,
    })
    const { root } = await cdp.send("DOM.getDocument", { depth: -1 })
    const { nodeIds } = await cdp.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-probe-press]" })
    nodes = nodeIds
    if (!result.value) nodes = []
  }
  for (const nodeId of nodes) {
    try {
      await cdp.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states })
    } catch {}
  }
  return nodes
}
const touch = (cdp, type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 6, radiusY: 6, force: 1, id: 1 }] })

try {
  /* ── BAND ──────────────────────────────────────────────────────────────── */
  if (only("band")) {
    console.log("\nBAND (iPhone, safe area 59/34, html.capacitor)")
    for (const path of ["/explore", "/account", "/account/library", "/maker", "/member/ava"]) {
      const { p, errors } = await open(path)
      const state = await p.evaluate(() => {
        const root = document.getElementById("platform-header-root")
        const r = root?.getBoundingClientRect()
        const cs = root ? getComputedStyle(root) : null
        return {
          header: !!root,
          headerTop: r ? Math.round(r.top) : null,
          headerBottom: r ? Math.round(r.bottom) : null,
          headerBg: cs?.backgroundColor ?? null,
          blur: cs ? (cs.backdropFilter || cs.webkitBackdropFilter || "none") : null,
          shield: getComputedStyle(document.documentElement, "::before").backgroundColor,
          canvas: getComputedStyle(document.documentElement).backgroundColor,
          band: getComputedStyle(document.documentElement).getPropertyValue("--native-band").trim(),
          theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"),
          bars: window.__bars || [],
          splash: (window.__splash || []).length,
          topBar: (() => { const t = document.querySelector("[data-profile-top-bar]"); return t ? Math.round(t.getBoundingClientRect().top) : null })(),
          topRow: (() => { const t = document.querySelector("[data-profile-top-bar] > div"); return t ? Math.round(t.getBoundingClientRect().top) : null })(),
        }
      })
      const bottom = state.headerBottom ?? SAT + 65
      const first = await p.evaluate(() => { const m = document.querySelector("main"); const r = m?.getBoundingClientRect(); return r ? Math.round(r.top + scrollY) : null })
      const [band, headTop, headMid, hairline] = await pixels(p, [[195, 20], [195, SAT + 3], [12, SAT + 20], [195, bottom - 0.5]])
      const name = path.slice(1).replace(/\//g, "-")
      await p.screenshot({ path: join(shots, `band-${name}-top.png`), clip: { x: 0, y: await p.evaluate(() => scrollY), width: 390, height: 330 }, captureBeyondViewport: false })
      /* The red block just under the header: anything see-through shows it. */
      await p.evaluate((sat) => {
        const red = document.querySelector("[data-probe-red]")
        if (red) window.scrollTo(0, red.getBoundingClientRect().top + window.scrollY - sat - 30)
      }, SAT)
      await sleep(250)
      const [overRed, underClockScrolled] = await pixels(p, [[195, SAT + 20], [195, 20]])
      await p.screenshot({ path: join(shots, `band-${name}-scrolled.png`), clip: { x: 0, y: await p.evaluate(() => scrollY), width: 390, height: 330 }, captureBeyondViewport: false })
      const tag = `${path}:`
      if (path.startsWith("/member/")) {
        /* A person's profile has no Storelib header: its own bar is the top, its row below the clock, its white up under it. */
        const [band2, bar] = await pixels(p, [[195, 20], [300, SAT + 6]])
        expect(!state.header, `${tag} no Storelib header on a profile`, state.header)
        expect(state.topBar === 0 && state.topRow !== null && state.topRow >= SAT, `${tag} the profile bar is the top surface and its row starts below the clock`, [state.topBar, state.topRow])
        expect(same(band2, [255, 255, 255]) && same(band2, bar, 1), `${tag} the strip and the bar are one white`, [hex(band2), hex(bar)])
        expect(state.bars.some((b) => b[1] === "LIGHT") && state.theme === "#ffffff", `${tag} dark status text, white theme-color`, [state.bars, state.theme])
        expect(errors.length === 0, `${tag} no errors`, errors)
        await p.close()
        continue
      }
      expect(state.header, `${tag} the app's header is drawn${path === "/maker" ? " on a creator's page too" : ""}`, state.header)
      expect(same(band, [255, 255, 255]), `${tag} the strip under the clock is white`, hex(band))
      expect(same(band, headTop, 1) && same(band, headMid, 1), `${tag} the strip and the header are one colour`, [hex(band), hex(headTop), hex(headMid)])
      expect(state.blur === "none" && /rgb\(255, 255, 255\)/.test(state.headerBg ?? ""), `${tag} the header is opaque white, no blur`, [state.headerBg, state.blur])
      /* On a creator's page the bar has no foot line of its own in the app: the profile bar under it carries the hairline (platform-header-client, isSellerOrProductPage). */
      if (path !== "/maker") expect(hairline[0] < 252, `${tag} a hairline at the header's foot`, hex(hairline))
      /* The page's first line is under the bar, not under it in z: the bar's room is in the flow (.native-header-spacer). */
      expect(first !== null && first >= bottom - 1, `${tag} the page starts under the bar, not behind it`, [first, bottom])
      expect(same(overRed, [255, 255, 255], 1) && same(underClockScrolled, [255, 255, 255], 1), `${tag} scrolled under the header, nothing shows through it or under the clock`, [hex(overRed), hex(underClockScrolled)])
      expect(state.theme === "#ffffff", `${tag} theme-color is the band`, state.theme)
      expect(state.bars.some((b) => b[0] === "SystemBars" && b[1] === "LIGHT") && !state.bars.some((b) => b[1] === "DARK"), `${tag} the status bar is asked for dark text, never light`, state.bars)
      if (path.startsWith("/account/library")) expect(state.splash === 0, `${tag} the library times the launch screen itself (its own SplashInit), not this`, state.splash)
      else expect(state.splash === 1, `${tag} the launch screen is taken down once`, state.splash)
      if (path === "/maker") expect(state.topBar !== null && state.topBar >= (state.headerBottom ?? 0) - 1, `${tag} the profile bar sits under the header, not under the clock`, [state.topBar, state.headerBottom])
      expect(errors.length === 0, `${tag} no errors`, errors)
      await p.close()
    }

    /* A dark buyer header (the admin's toggle): the band follows it. */
    {
      const { p, errors } = await open("/explore", { light: false })
      const [band, head] = await pixels(p, [[195, 20], [195, SAT + 3]])
      const s = await p.evaluate(() => ({ theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"), bars: window.__bars || [] }))
      await p.screenshot({ path: join(shots, "band-explore-dark-top.png"), clip: { x: 0, y: await p.evaluate(() => scrollY), width: 390, height: 330 }, captureBeyondViewport: false })
      expect(same(band, head, 1) && band[0] < 30, "dark header: the strip is the bar's own dark", [hex(band), hex(head)])
      expect(s.theme === "#0e0e10" && s.bars.some((b) => b[1] === "DARK"), "dark header: theme-color and light status text follow", s)
      expect(errors.length === 0, "dark header: no errors", errors)
      await p.close()
    }

    /* In a phone's browser: no capacitor class, no safe area of its own; the header is still opaque white and theme-color is white. */
    {
      const { p, errors } = await open("/account/library", { native: false })
      const s = await p.evaluate(() => ({ theme: document.querySelector('meta[name="theme-color"]')?.getAttribute("content"), bars: window.__bars || [], splash: (window.__splash || []).length, bg: getComputedStyle(document.getElementById("platform-header-root")).backgroundColor }))
      expect(s.theme === "#ffffff" && /rgb\(255, 255, 255\)/.test(s.bg), "browser: white theme-color, opaque white header", s)
      expect(s.bars.length === 0 && s.splash === 0, "browser: no native calls", s)
      expect(errors.length === 0, "browser: no errors", errors)
      await p.close()
    }
  }

  /* ── VEIL ──────────────────────────────────────────────────────────────── */
  if (only("veil")) {
    console.log("\nVEIL (a finger on a card)")
    for (const native of [true, false]) {
      const { p, cdp, errors } = await open("/explore", { native })
      /* A resting finger that lifts is a tap: the card must not open, or the next card is on another page. */
      await p.evaluate(() => window.addEventListener("click", (e) => { e.preventDefault(); e.stopImmediatePropagation() }, true))
      const media = await p.evaluate(() => ({ hoverNone: matchMedia("(hover: none)").matches, coarse: matchMedia("(pointer: coarse)").matches }))
      console.log(`  ${native ? "app" : "browser"}: hover:none ${media.hoverNone}, pointer:coarse ${media.coarse}`)
      for (const card of ["product-0", "community-0", "community-row"]) {
        const sel = `[data-probe-card="${card}"]`
        await p.$eval(sel, (el) => el.scrollIntoView({ block: "center" }))
        await sleep(900)
        /* The noise floor: the same card twice with no finger, so a picture still decoding is not read as a veil. */
        const still = await cardPixels(p, sel)
        await sleep(260)
        const before = await cardPixels(p, sel)
        const noise = diff(still.data, before.data)
        const cx = before.box.x + before.box.w / 2
        const cy = before.box.y + Math.min(before.box.h, 300) / 3
        /* A finger resting on it. */
        /*
          A finger resting on it. Chromium does not put :active on an element
          for an emulated touch until the tap is decided, and a phone does,
          from the touch: so the press is FORCED on the element under the
          finger and every ancestor (CSS.forcePseudoState), :active and
          :hover both (an Android WebView that answers hover:hover keeps
          :hover on whatever was last touched), and what the CSS then draws
          is what is compared.
        */
        await touch(cdp, "touchStart", cx, cy)
        const forced = await forcePress(cdp, cx, cy, ["active", "hover"])
        await sleep(260)
        const pressed = await p.evaluate(() => document.querySelectorAll(":active").length)
        const held = await cardPixels(p, sel)
        await forcePress(cdp, cx, cy, [], forced)
        await touch(cdp, "touchEnd", cx, cy)
        /* Longer than a double tap, so the next touch is not read as one (a zoom). */
        await sleep(500)
        /* A finger starting a scroll on it: every frame of the first 300ms, nothing on the card changes its look. */
        const rest = await veilStyles(p, sel)
        await touch(cdp, "touchStart", cx, cy)
        let worst = 0
        for (let i = 0; i < 6; i++) {
          await sleep(25)
          if (i === 1) await touch(cdp, "touchMove", cx, cy - 6)
          if (i === 3) await touch(cdp, "touchMove", cx, cy - 18)
          worst = Math.max(worst, changed(rest, await veilStyles(p, sel)))
        }
        await touch(cdp, "touchEnd", cx, cy - 18)
        await sleep(500)
        await p.screenshot({ path: join(shots, `veil-${native ? "app" : "browser"}-${card}.png`), clip: { x: 0, y: Math.max(0, before.box.y - 10) + (await p.evaluate(() => scrollY)), width: 390, height: Math.min(before.box.h + 20, 520, 844 - Math.max(0, before.box.y - 10)) }, captureBeyondViewport: false })
        const dh = diff(before.data, held.data)
        expect(pressed > 0, `${native ? "app" : "browser"} ${card}: the finger is really pressing (elements in :active)`, pressed)
        expect(dh.max <= 3 + noise.max, `${native ? "app" : "browser"} ${card}: a finger resting 260ms changes no pixel of the card`, dh)
        expect(worst === 0, `${native ? "app" : "browser"} ${card}: a scroll starting on it changes no opacity, filter, background or shadow on it`, worst)
      }
      expect(errors.length === 0, `${native ? "app" : "browser"}: no errors`, errors)
      await p.close()
    }
  }

  /* ── BACK ──────────────────────────────────────────────────────────────── */
  if (only("back")) {
    console.log("\nBACK (a double tap on the chevron)")
    const { p, cdp, errors } = await open("/list", { navMs: 40 })
    await p.evaluate(() => window.scrollTo(0, 1500))
    await sleep(200)
    await p.evaluate(() => window.__routerApi.push("/detail"))
    await sleep(300)
    await p.evaluate(() => window.scrollTo(0, 0))
    const lenBefore = await p.evaluate(() => history.length)
    const chevron = await p.$eval("[data-profile-back-button]", (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    const frames = []
    await p.evaluate(() => {
      window.__frames = []
      const t0 = performance.now()
      const tick = () => {
        const page = document.querySelector("[data-probe-page]")?.getAttribute("data-probe-page") ?? "none"
        window.__frames.push([Math.round(performance.now() - t0), page, Math.round(scrollY)])
        if (performance.now() - t0 < 900) requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
    await touch(cdp, "touchStart", chevron.x, chevron.y)
    await touch(cdp, "touchEnd", chevron.x, chevron.y)
    await sleep(90)
    await touch(cdp, "touchStart", chevron.x, chevron.y)
    await touch(cdp, "touchEnd", chevron.x, chevron.y)
    await sleep(1000)
    /* A document of its own here means the second tap opened a link on the list: a page load, the film lost with the old document. */
    const s = await p.evaluate(() => ({ path: location.pathname, pops: window.__pops || [], scroll: Math.round(scrollY), frames: window.__frames || [] }))
    frames.push(...s.frames)
    const blank = s.frames.filter((f) => f[1] === "none").length
    expect(s.pops.length === 1 && s.path === "/list" && s.frames.length > 0, "two taps 90ms apart go back once, and the second does not open what is under it on the list", { pops: s.pops, path: s.path, historyLength: lenBefore, reloaded: s.frames.length === 0 })
    expect(blank === 0, "no frame without a page while going back", { blank, frames: s.frames.length })
    console.log(`  scroll on the list after the back: ${s.scroll} (left at 1500; this stub has no router cache, Next's own restore is not in it)`)
    /* One deliberate back after the hold: it works. */
    await p.evaluate(() => window.__routerApi.push("/detail"))
    await sleep(500)
    const c2 = await p.$eval("[data-profile-back-button]", (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
    await touch(cdp, "touchStart", c2.x, c2.y)
    await touch(cdp, "touchEnd", c2.x, c2.y)
    await sleep(400)
    const s2 = await p.evaluate(() => ({ path: location.pathname, pops: (window.__pops || []).length }))
    expect(s2.path === "/list" && s2.pops === 2, "a single later tap goes back, first time", s2)
    expect(errors.length === 0, "back: no errors", errors)
    await p.close()
  }

  /* ── PILLS ─────────────────────────────────────────────────────────────── */
  if (only("pills")) {
    console.log("\nPILLS (4x CPU, the library's stage and pills)")
    const { p, cdp, errors } = await open("/account/library", { throttle: 4, navMs: 90 })
    /* Where the pill is on the glass; one past the window's edge is first brought in, as a thumb swiping the row would. */
    const pill = (label, edge = false) =>
      p.$eval(`[data-library-tab="${label}"]`, (el, edge) => {
        let r = el.getBoundingClientRect()
        if (r.left < 0 || r.right > innerWidth) {
          const track = el.closest("[data-library-tabs]")
          track.scrollLeft += r.right > innerWidth ? r.right - innerWidth + 24 : r.left - 24
          r = el.getBoundingClientRect()
        }
        return { x: edge ? r.left + 2 : r.left + r.width / 2, y: r.top + r.height / 2 }
      }, edge)
    const tap = async (label, { edge = false, hold = 60 } = {}) => {
      const at = await pill(label, edge)
      const before = await p.evaluate(() => (window.__router || []).filter((r) => r[0] === "push").length)
      await touch(cdp, "touchStart", at.x, at.y)
      await sleep(hold)
      await touch(cdp, "touchEnd", at.x, at.y)
      return before
    }
    const moves = () => p.evaluate(() => (window.__router || []).filter((r) => r[0] === "push").map((r) => r[1]))
    const plan = [
      ["Courses", "at rest", 900, {}],
      ["Wishlist", "during the cross fade of the last press (40ms after it)", 40, {}],
      ["Reviews", "right after the cross fade (250ms after it)", 250, {}],
      ["Receipts", "at the pill's very edge, 2px in", 900, { edge: true }],
      ["Products", "a slow press (250ms down)", 900, { hold: 250 }],
    ]
    let expected = 0
    for (const [label, when, wait, opts] of plan) {
      await sleep(wait)
      const href = await p.$eval(`[data-library-tab="${label}"]`, (el) => el.getAttribute("data-library-tab-href"))
      const before = await tap(label, opts)
      await sleep(500)
      const after = await moves()
      expected++
      const theseMoves = after.slice(before)
      expect(after.length === expected && after[after.length - 1] === href, `${label}, ${when}: the first tap moves, once`, theseMoves)
    }
    /*
      THE CLICK THAT NEVER COMES. What iOS does to a tap that stops the
      row's glide, or that lands while the screen under it changes (WebKit
      cancels the click when content appears during a tap), cannot be made
      to happen in Chromium. Its effect can: the pointer events arrive and
      the click does not. Modelled by dropping every click for one tap.
    */
    await sleep(900)
    await p.evaluate(() => { window.__dropClicks = (e) => { e.preventDefault(); e.stopImmediatePropagation() }; window.addEventListener("click", window.__dropClicks, true) })
    {
      const href = await p.$eval('[data-library-tab="Courses"]', (el) => el.getAttribute("data-library-tab-href"))
      const before = await tap("Courses")
      await sleep(500)
      const after = await moves()
      expected++
      expect(after.length === expected && after[after.length - 1] === href, "Courses, with the browser sending no click for the tap: it still moves, once", after.slice(before))
    }
    await p.evaluate(() => window.removeEventListener("click", window.__dropClicks, true))
    const links = await p.evaluate(() => (window.__router || []).filter((r) => r[0] === "link").length)
    expect(links === 0, "a tap is never also a click (no second move from the Link)", links)
    await p.screenshot({ path: join(shots, "pills-after.png"), clip: { x: 0, y: await p.evaluate(() => scrollY), width: 390, height: 420 }, captureBeyondViewport: false })
    expect(errors.length === 0, "pills: no errors", errors)
    await p.close()
  }
} finally {
  await browser.close()
  rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nPictures in ${shots}`)
if (broken) {
  console.error(`\n${broken} check(s) failed.\n`)
  process.exit(1)
}
console.log("\nAll checks passed.\n")
