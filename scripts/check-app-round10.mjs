/**
 * ===========================================================================
 *  ROUND 10: THE APP AND ITS NAVIGATION, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * Real components (scripts/render-app-round10.tsx) in Chromium, the app being
 * the head script's own `capacitor` class plus a Capacitor bridge stub with a
 * Haptics plugin that records, pressed with real touch events.
 *
 *   START     the start gate, a session and a kept home on the phone: it
 *             lands with router.replace in the same document (no second
 *             document: one navigation entry), how long after the gate
 *             mounted, and no spinner is drawn for a quick start
 *   PRODUCT   in the app the product's dark bar is not drawn, the header is;
 *             on the web the bar is; the "< Explore" back is 44px tall, is
 *             pressed on the frame the finger lands, and a double tap goes
 *             once
 *   HEADER    in the app no library and no heart; on the web the library
 *             pages have no heart either, a product page keeps it
 *   NAVIGATOR in the app a library product opens with router.push, not a
 *             document load (one navigation entry, no reload)
 *   RECEIPT   at 390 in the app and in a browser: the Storelib header at the
 *             top, the tab bar at the foot, the back chevron, nothing
 *             sideways
 *   TABS      at 4x CPU: a tab switch lands, each tab keeps its scroll
 *             (library 900 -> profile -> library is 900 again on the first
 *             frame), frames sampled during the switch
 *   PULL      at 4x CPU: the page follows the finger on the rubber band,
 *             the ring shows, one haptic as the line is crossed, the page
 *             rests while the listener's promise runs and comes home with no
 *             translation left on it; frame gaps measured; a pull that
 *             starts scrolled down does nothing; an iPhone browser never
 *             vibrates
 *
 *   PROBE_CSS=source node scripts/check-app-round10.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { build } from "esbuild"
import { appCss } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const stubs = join(root, ".app-round10-probe")
mkdirSync(stubs, { recursive: true })
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-app-r10-")), "shots")
mkdirSync(shots, { recursive: true })
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const css = await appCss(root)

const STUBS = {
  "next/navigation": `import { useSyncExternalStore } from "react"
const log = (k, a, o) => (window.__router ||= []).push([k, a, o && o.kind ? o.kind : o && o.scroll === false ? "noscroll" : undefined, Math.round(performance.now())])
const go = (h) => { window.__nav.path = h.split("?")[0]; window.__nav.subs.forEach((f) => f()) }
const router = {
  push: (h, o) => { log("push", h, o); setTimeout(() => go(h), window.__navMs ?? 120) },
  replace: (h, o) => { log("replace", h, o); setTimeout(() => go(h), window.__navMs ?? 120) },
  prefetch: (h, o) => log("prefetch", h, o),
  back: () => log("back"),
  refresh: () => log("refresh"),
}
window.__go = go
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
const params = new URLSearchParams("")
export const useSearchParams = () => params
export const useParams = () => ({})
export const redirect = () => {}
export const permanentRedirect = () => {}
export const notFound = () => {}`,
  "next/link": `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, onClick, ...rest }, ref) {
  return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, onClick: (e) => { onClick?.(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", typeof href === "string" ? href : "#"]) } }, ...rest }, children)
})
export const useLinkStatus = () => ({ pending: false })`,
  "next/image": `import React from "react"
export default function Image({ src, alt, fill, priority, preload, sizes, unoptimized, className, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : "", alt, className, style, ...rest })
}`,
  consent: `export const hasConsent = () => true
export const readConsent = () => ({ necessary: true, preferences: true, analytics: false, marketing: false })
export const writeConsent = () => {}
export const consentDecided = () => true
export const CONSENT_EVENT = "consent"`,
  "supabase-client": `const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => r({ data: table === "profiles" ? { display_name: "Ava Stone", avatar_url: null, username: "ava" } : null, error: null }) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return !!(window.Capacitor && window.Capacitor.isNativePlatform()) }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: USER }, error: null }),
      getSession: async () => ({ data: { session: { user: USER, access_token: "t", refresh_token: "r" } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    realtime: { setAuth: async () => {} },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: (name) => { const ch = { name, on() { return ch }, subscribe() { return ch } }; return ch },
    removeChannel() {},
  }
}`,
}
for (const [k, v] of Object.entries(STUBS)) writeFileSync(join(stubs, `${k.replace(/\//g, "-")}.jsx`), v)

try {
  await build({
    entryPoints: [join(root, "scripts/render-app-round10.tsx")],
    bundle: true, format: "iife", jsx: "automatic", logLevel: "error", charset: "ascii",
    outfile: join(stubs, "app.js"),
    define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_SUPABASE_URL": '"https://abcdref.supabase.co"' },
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://abcdref.supabase.co'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
    loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /^next\/(navigation|link|image)$/ }, (a) => ({ path: join(stubs, `${a.path.replace(/\//g, "-")}.jsx`) }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
        b.onResolve({ filter: /^@\/lib\/consent\/client$/ }, () => ({ path: join(stubs, "consent.jsx") }))
        b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
      },
    }],
    nodePaths: [join(root, "node_modules")],
  })
} catch (e) {
  rmSync(stubs, { recursive: true, force: true })
  console.error(`The probe did not bundle: ${e.message}`)
  process.exit(1)
}
/* Raw control characters (a regex like /[\x00-\x1f]/ comes out of esbuild as the bytes themselves) are not allowed in an HTML document: the parser turns a NUL into U+FFFD and the regex breaks. Escaped back. */
const js = readFileSync(join(stubs, "app.js"), "utf8").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, (c) => "\\x" + c.charCodeAt(0).toString(16).padStart(2, "0"))
writeFileSync(join(stubs, "index.html"), `<!doctype html><html class="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif;background:#fafafa}</style></head>
<body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`)

const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files"] })
const PHONE = { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
const DESK = { width: 1440, height: 900, deviceScaleFactor: 1 }
const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1"
const APP_UA = IPHONE_SAFARI + " Capacitor"

async function open(vp, hash, { ua, wait = 900, before } = {}) {
  const p = await browser.newPage()
  const errors = []
  p.on("pageerror", (e) => errors.push(e.message))
  if (ua) await p.setUserAgent(ua)
  await p.setViewport(vp)
  if (before) await p.evaluateOnNewDocument(before)
  await p.goto(`file://${join(stubs, "index.html")}#${hash}`)
  await sleep(wait)
  if (errors.length) console.log(`        (page error on ${hash}: ${errors[0].slice(0, 300)})`)
  p.__errors = errors
  return p
}
const throttle = async (p, rate) => { const c = await p.target().createCDPSession(); await c.send("Emulation.setCPUThrottlingRate", { rate }); return c }
const shot = async (p, name) => { const f = join(shots, `${name}.png`); await p.screenshot({ path: f }); return f }
const frameSampler = (p) => p.evaluate(() => {
  window.__gaps = []
  let last = performance.now()
  window.__sampling = true
  const tick = (t) => { window.__gaps.push(t - last); last = t; if (window.__sampling) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})
const stopSampler = (p) => p.evaluate(() => {
  window.__sampling = false
  const g = window.__gaps.slice(1).sort((a, b) => a - b)
  const long = window.__gaps.slice(1).map((v, i) => [i, Math.round(v)]).filter(([, v]) => v > 40)
  return { long, frames: g.length, p50: Math.round(g[Math.floor(g.length / 2)] || 0), p95: Math.round(g[Math.floor(g.length * 0.95)] || 0), max: Math.round(g[g.length - 1] || 0) }
})

try {
  /* ── START ─────────────────────────────────────────────────────────── */
  console.log("\nSTART: the gate lands in the same document")
  {
    const p = await open(PHONE, "scene=start&app=1", {
      ua: APP_UA,
      wait: 50,
      before: () => {
        localStorage.setItem("sb-abcdref-auth-token", JSON.stringify({ access_token: "a", refresh_token: "r", expires_at: Math.floor(Date.now() / 1000) + 3600 }))
        localStorage.setItem("sb-native-home", "/library")
        localStorage.setItem("storelib:last-place", JSON.stringify({ path: "/explore", at: Date.now() }))
        window.__replaced = []
        const real = Location.prototype.replace
        try { Object.defineProperty(window, "__locReplace", { value: real }) } catch {}
      },
    })
    await sleep(400)
    const r = await p.evaluate(() => ({
      router: (window.__router || []).filter((x) => x[0] === "replace"),
      path: window.__nav.path,
      navEntries: performance.getEntriesByType("navigation").length,
      href: location.href,
      spinnerOpacity: getComputedStyle(document.querySelector(".ns-spinner") || document.body).opacity,
      mountedAt: Math.round(window.__startAt),
    }))
    expect(r.router.length === 1 && /^\/(account\/library|explore)/.test(r.router[0][1]), "a signed in start calls router.replace once, to the home", r.router)
    expect(r.navEntries === 1 && r.href.startsWith("file://"), "one document: no second load", { navEntries: r.navEntries })
    if (r.router[0]) console.log(`        landed ${r.router[0][3] - r.mountedAt}ms after the gate mounted (render to replace)`)
    expect(r.spinnerOpacity === "0" || r.path !== "/native-start", "no spinner drawn for a quick start", r.spinnerOpacity)
    await p.close()
  }

  /* ── PRODUCT ───────────────────────────────────────────────────────── */
  console.log("\nPRODUCT: one header and one back in the app; the creator's bar on the web")
  for (const inApp of [true, false]) {
    const p = await open(PHONE, `scene=product&path=/trp8/black-gold${inApp ? "&app=1" : ""}`, { ua: inApp ? APP_UA : IPHONE_SAFARI, wait: 1200 })
    const g = await p.evaluate(() => {
      const bar = document.querySelector("[data-dark-bar]")
      const crumb = document.querySelector("[data-discover-breadcrumb]")
      const b = crumb.getBoundingClientRect()
      const header = document.getElementById("platform-header-root") || document.querySelector("header")
      return {
        barShown: !!bar && bar.getBoundingClientRect().height > 0,
        crumbShown: getComputedStyle(crumb).display !== "none",
        crumb: { h: Math.round(b.height), w: Math.round(b.width), left: Math.round(b.left) },
        header: header ? Math.round(header.getBoundingClientRect().height) : 0,
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    await shot(p, `product-${inApp ? "app" : "web"}-390`)
    if (inApp) {
      expect(!g.barShown, "in the app the product's dark bar is not drawn", g)
      expect(g.crumbShown && g.crumb.h >= 44, "the back above the media is shown and 44px tall", g.crumb)
      expect(g.header > 0, "the Storelib header is there", g.header)
      /* The press: the attribute on the frame the finger lands, and a double tap goes once. */
      await p.evaluate(() => { window.__backs = 0; const real = history.back.bind(history); history.back = () => { window.__backs++; real() } })
      const at = await p.evaluate(() => { const r = document.querySelector("[data-discover-breadcrumb]").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
      const cdp = await p.target().createCDPSession()
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: at.x, y: at.y }] })
      const pressed = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r({ attr: document.querySelector("[data-discover-breadcrumb]").hasAttribute("data-pressed"), bg: getComputedStyle(document.querySelector("[data-discover-breadcrumb]")).backgroundColor }))))
      await shot(p, "product-app-back-pressed")
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
      await sleep(60)
      await p.touchscreen.tap(at.x, at.y)
      await sleep(1300)
      const acts = await p.evaluate(() => ({ backs: window.__backs, pushes: (window.__router || []).filter((x) => x[0] === "push").map((x) => x[1]) }))
      expect(pressed.attr && pressed.bg !== "rgba(0, 0, 0, 0)", "pressed on the first frame of the touch (no :active wait)", pressed)
      expect(acts.backs + acts.pushes.length === 1, "a double tap goes back once", acts)
    } else {
      expect(g.barShown, "on the web the creator's bar stays", g)
      expect(!g.crumbShown, "and the app's back is not drawn on the web", g)
    }
    expect(g.overflow <= 0, "nothing sideways", g.overflow)
    await p.close()
  }

  /* ── HEADER ────────────────────────────────────────────────────────── */
  console.log("\nHEADER: no library and no heart in the app; no heart over the library")
  const icons = (p) => p.evaluate(() => {
    const seen = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getBoundingClientRect().width > 0).length
    return { wishlist: seen("[data-header-wishlist]"), library: seen("[data-header-library]") }
  })
  {
    const p = await open(PHONE, "scene=header&path=/trp8/black-gold&app=1", { ua: APP_UA, wait: 1400 })
    const i = await icons(p)
    expect(i.wishlist === 0 && i.library === 0, "app, a product page at 390: neither icon", i)
    await shot(p, "header-app-product-390")
    await p.close()
  }
  {
    const p = await open({ width: 820, height: 1180, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, "scene=header&path=/trp8/black-gold&app=1", { ua: APP_UA, wait: 1400 })
    const i = await icons(p)
    expect(i.wishlist === 0 && i.library === 0, "app, an iPad width: neither icon", i)
    await p.close()
  }
  {
    const p = await open(PHONE, "scene=header&path=/trp8/black-gold", { ua: IPHONE_SAFARI, wait: 1400 })
    const i = await icons(p)
    expect(i.wishlist === 1, "Safari, a product page: the heart stays on the web", i)
    await shot(p, "header-web-product-390")
    await p.close()
  }
  for (const vp of [PHONE, DESK]) {
    const p = await open(vp, "scene=header&path=/account/library/products", { wait: 1400 })
    const i = await icons(p)
    expect(i.wishlist === 0, `web, the library at ${vp.width}: no heart`, i)
    await shot(p, `header-web-library-${vp.width}`)
    await p.close()
  }

  /* ── NAVIGATOR ─────────────────────────────────────────────────────── */
  console.log("\nNAVIGATOR: a library product opens on the client in the app")
  {
    const p = await open(PHONE, "scene=header&path=/explore&app=1", { ua: APP_UA, wait: 1600 })
    const before = await p.evaluate(() => performance.getEntriesByType("navigation").length)
    await p.evaluate(() => document.querySelector("[data-place-navigator] button")?.click())
    await sleep(700)
    const row = await p.evaluate(() => {
      const a = [...document.querySelectorAll("[data-navigator-row]")].find((e) => (e.getAttribute("href") || "").includes("/account/library/products/") && e.getBoundingClientRect().width > 0)
      if (!a) return null
      const r = a.getBoundingClientRect()
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, href: a.getAttribute("href") }
    })
    if (row) await p.touchscreen.tap(row.x, row.y)
    await sleep(500)
    const after = await p.evaluate(() => ({ entries: performance.getEntriesByType("navigation").length, href: location.href, router: (window.__router || []).filter((x) => x[0] !== "prefetch").map((x) => x.slice(0, 2)), prefetched: (window.__router || []).filter((x) => x[0] === "prefetch").map((x) => x[1] + ":" + (x[2] || "auto")), refresh: (window.__router || []).some((x) => x[0] === "refresh") }))
    expect(!!row, "the navigator lists the product", row)
    expect(after.router.some((x) => x[0] === "push" && x[1] === row?.href), "router.push to the library product", after.router)
    expect(after.entries === before && after.href.startsWith("file://") && !after.refresh, "no document load and no refresh", after)
    expect(after.prefetched.some((x) => x.startsWith(row?.href || "?")), "its page was read ahead while the panel opened", after.prefetched)
    await p.close()
  }

  /* ── RECEIPT ───────────────────────────────────────────────────────── */
  console.log("\nRECEIPT: Storelib around it at 390, in the app and in a browser")
  for (const inApp of [true, false]) {
    const p = await open(PHONE, `scene=receipt&path=/receipt/rcpt_0123456789abcdefghijklmnopqrstuv${inApp ? "&app=1" : ""}`, { ua: inApp ? APP_UA : IPHONE_SAFARI, wait: 1600 })
    const g = await p.evaluate(() => {
      const header = document.getElementById("platform-header-root")
      const bar = document.querySelector("[data-buyer-tab-bar]")
      const back = document.querySelector("[data-receipt-back]")
      const b = back?.getBoundingClientRect()
      return {
        header: header ? Math.round(header.getBoundingClientRect().height) : 0,
        headerTop: header ? Math.round(header.getBoundingClientRect().top) : null,
        bar: bar ? Math.round(bar.getBoundingClientRect().height) : 0,
        barBottom: bar ? Math.round(bar.getBoundingClientRect().bottom) : null,
        back: b ? { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top) } : null,
        lit: bar ? [...bar.querySelectorAll("[data-buyer-tab]")].map((t) => t.getAttribute("aria-current")) : [],
        overflow: document.documentElement.scrollWidth - window.innerWidth,
      }
    })
    await shot(p, `receipt-${inApp ? "app" : "safari"}-390`)
    expect(g.header > 40 && g.headerTop === 0, `${inApp ? "app" : "Safari"}: the Storelib header at the top`, g)
    expect(g.bar > 40 && g.barBottom === 844, `${inApp ? "app" : "Safari"}: the tab bar at the foot`, g)
    expect(g.back && g.back.w >= 40 && g.back.h >= 40 && g.back.top > g.header, `${inApp ? "app" : "Safari"}: a back chevron under the header`, g.back)
    expect(g.overflow <= 0, "nothing sideways", g.overflow)
    await p.close()
  }

  /* ── TABS ──────────────────────────────────────────────────────────── */
  console.log("\nTABS at 4x CPU: switching keeps each tab's place")
  {
    const p = await open(PHONE, "scene=tabs&path=/account/library&who=buyer", { wait: 2200 })
    const idle = await p.evaluate(() => (window.__router || []).filter((x) => x[0] === "prefetch").map((x) => `${x[1]}:${x[2] || "auto"}`))
    expect(idle.length >= 2, "the other tabs were read ahead on idle (policy decides how whole)", idle)
    await throttle(p, 4)
    await p.evaluate(() => window.scrollTo(0, 900))
    await sleep(200)
    const tab = (key) => p.evaluate((key) => { const t = [...document.querySelectorAll("[data-buyer-tab]")].find((e) => e.getAttribute("data-buyer-tab") === key); const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }, key)
    await frameSampler(p)
    let at = await tab("profile")
    await p.touchscreen.tap(at.x, at.y)
    await p.waitForFunction(() => window.__nav.path === "/account", { timeout: 5000 })
    const onProfile = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(Math.round(window.scrollY)))))
    const switchFrames = await stopSampler(p)
    await p.evaluate(() => window.scrollTo(0, 300))
    await sleep(200)
    at = await tab("library")
    await p.touchscreen.tap(at.x, at.y)
    await p.waitForFunction(() => window.__nav.path === "/account/library", { timeout: 5000 })
    const backOnLibrary = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(Math.round(window.scrollY)))))
    at = await tab("profile")
    await p.touchscreen.tap(at.x, at.y)
    await p.waitForFunction(() => window.__nav.path === "/account", { timeout: 5000 })
    const backOnProfile = await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(Math.round(window.scrollY)))))
    const pushes = await p.evaluate(() => (window.__router || []).filter((x) => x[0] === "push").map((x) => `${x[1]}:${x[2] || ""}`))
    expect(onProfile === 0, "a tab never seen opens at its top", onProfile)
    expect(Math.abs(backOnLibrary - 900) <= 2, "Library is back at 900 on its first frame", backOnLibrary)
    expect(Math.abs(backOnProfile - 300) <= 2, "Profile is back at 300", backOnProfile)
    expect(pushes.every((x) => x.endsWith(":noscroll")), "the push never scrolls the page itself", pushes)
    console.log(`        frames during a switch at 4x CPU: ${JSON.stringify(switchFrames)}`)
    await p.close()
  }

  /* ── PULL ──────────────────────────────────────────────────────────── */
  console.log("\nPULL at 4x CPU: rubber band, ring, one tick, waits, home with nothing left on it")
  {
    const p = await open(PHONE, "scene=ptr&app=1&work=700", { ua: APP_UA, wait: 1200 })
    const cdp = await throttle(p, 4)
    const content = () => p.evaluate(() => {
      const c = document.querySelector("[data-pull-content]")
      const ring = document.querySelector("[data-ptr-indicator]")
      return { t: c.style.transform, y: Math.round(c.getBoundingClientRect().top), ring: Number(getComputedStyle(ring).opacity) }
    })
    const start = await content()
    const x = 200
    let y = 240
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
    await frameSampler(p)
    /* The page's offset is read by the page itself on each frame (the style string, no layout), so measuring costs the drag nothing. */
    await p.evaluate(() => {
      const c = document.querySelector("[data-pull-content]")
      window.__offsets = []
      const read = () => { const m = /translate3d\(0px, ([\d.]+)px/.exec(c.style.transform); window.__offsets.push(m ? Number(m[1]) : 0); if (window.__sampling) requestAnimationFrame(read) }
      requestAnimationFrame(read)
    })
    const fingerAt = []
    for (let i = 1; i <= 26; i++) {
      y += 7
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] })
      if (i % 5 === 0) fingerAt.push(y - 240)
      await sleep(16)
    }
    await sleep(80)
    const dragFrames = await stopSampler(p)
    const offsets = await p.evaluate(() => window.__offsets)
    /* Five points along the drag, from the page's own record. */
    const trace = fingerAt.map((finger, i) => ({ finger, y: start.y + Math.round(offsets[Math.min(offsets.length - 1, Math.round(((i + 1) / fingerAt.length) * (offsets.length - 1)))]) }))
    const atMost = await content()
    const ticks = await p.evaluate(() => window.__haptics.filter((h) => h[0] === "impact").length)
    await shot(p, "pull-armed-390")
    await frameSampler(p)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(350)
    const holding = await content()
    await sleep(1700)
    const home = await content()
    const frames = await stopSampler(p)
    const pulls = await p.evaluate(() => window.__pulls || 0)
    const moved = trace.map((s) => s.y - start.y)
    expect(moved.every((m, i) => i === 0 || m >= moved[i - 1]) && moved[moved.length - 1] > 40, "the page follows the finger down", trace.map((s) => ({ finger: s.finger, page: s.y - start.y })))
    const slope1 = moved[1] - moved[0]
    const slope2 = moved[moved.length - 1] - moved[moved.length - 2]
    expect(slope2 < slope1, "on a rubber band: each step gives less than the one before", { first: slope1, last: slope2 })
    expect(atMost.y - start.y < 182 - 6 && atMost.ring > 0.9, "less than the finger moved, and the ring is drawn", { finger: 182, page: atMost.y - start.y, ring: atMost.ring })
    expect(ticks === 1, "one light tick through the Haptics plugin as the line is crossed", ticks)
    expect(pulls === 1 && holding.y - start.y > 10 && holding.ring > 0.9, "the event went out once, and the page rests with the ring while the listener works", { pulls, holding })
    expect(home.t === "" && home.y === start.y, "home again with no translation left on it", home)
    console.log(`        frames while the finger pulls, at 4x CPU: ${JSON.stringify(dragFrames)}`)
    console.log(`        frames from the release to home (the pin, the wait, the spring), at 4x CPU: ${JSON.stringify(frames)}`)

    /* A sideways swipe along the chips, drifting down a little, is the row's: the page does not come down. */
    await sleep(300)
    const chips = await p.evaluate(() => { const r = document.querySelector("[data-chips]").getBoundingClientRect(); return { x: r.left + r.width - 40, y: r.top + r.height / 2 } })
    let cx = chips.x
    let cy = chips.y
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: cx, y: cy }] })
    const sideways = []
    for (let i = 0; i < 12; i++) {
      cx -= 14
      cy += 2
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: cx, y: cy }] })
      if (i % 4 === 3) sideways.push((await content()).t)
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(500)
    const rowMoved = await p.evaluate(() => document.querySelector("[data-chips]").scrollLeft)
    expect(sideways.every((t) => t === "") && rowMoved > 40, "a sideways swipe with a little downward drift stays the row's", { sideways, rowMoved })

    /* Scrolled down, a downward drag is a scroll, never a pull. */
    await p.evaluate(() => window.scrollTo(0, 600))
    await sleep(150)
    const before = await p.evaluate(() => window.__pulls || 0)
    y = 240
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] })
    for (let i = 0; i < 20; i++) { y += 8; await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] }) }
    const mid = await content()
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(900)
    const after = await p.evaluate(() => window.__pulls || 0)
    expect(mid.t === "" && after === before, "scrolled down, a drag down is the page's scroll, not a pull", { t: mid.t, pulls: after - before })
    await p.close()
  }
  {
    /* An iPhone's browser: the pull still works, and nothing asks it to vibrate. */
    const p = await open(PHONE, "scene=ptr&work=200", {
      ua: IPHONE_SAFARI, wait: 1000,
      before: () => { window.__vibrated = 0; navigator.vibrate = () => { window.__vibrated++; return true } },
    })
    const cdp = await p.target().createCDPSession()
    let y = 240
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 200, y }] })
    for (let i = 0; i < 28; i++) { y += 7; await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: 200, y }] }) }
    await sleep(60)
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
    await sleep(1200)
    const r = await p.evaluate(() => ({ vibrated: window.__vibrated, pulls: window.__pulls || 0 }))
    expect(r.pulls === 1 && r.vibrated === 0, "iPhone Safari: refreshed, never vibrated", r)
    await p.close()
  }
} finally {
  await browser.close()
  if (!process.env.KEEP) rmSync(stubs, { recursive: true, force: true })
}

console.log(`\nShots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed\n` : "\nall checks passed\n")
process.exit(broken ? 1 : 0)
