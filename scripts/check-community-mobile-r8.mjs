/**
 * ===========================================================================
 *  ROUND 8: A COMMUNITY ON A PHONE, WITH THE KEYBOARD, MEASURED
 * ===========================================================================
 * The real shell, feed, opened post, comments, composer and search
 * (scripts/render-community-mobile-r8.tsx, over round 17's harness) at
 * 390x844 with touch, in four environments a keyboard behaves differently in:
 *
 *   safari       iPhone Safari: the visual viewport shrinks (and may pan),
 *                the fixed box does not
 *   app          the iOS app, no keyboard plugin: nothing is reported
 *   app-resize   the iOS app with the Keyboard plugin, and a web view that is
 *                resized for the keyboard (the plugin's own default, or a build
 *                whose config was not synced): the plugin says 380 and the
 *                whole page is 464 tall
 *   android      the web view itself shrinks
 *
 * What it reads:
 *   OPEN/CLOSE   a post opened from the feed and closed with Back: the frames
 *                on the screen while it moves (the longest gap), and the feed
 *                exactly where it was afterwards
 *   COMPOSER     New post from a feed scrolled part way: the page behind keeps
 *                its scroll while the keyboard is up and after, and the sheet's
 *                toolbar sits on the keys
 *   SEARCH       the tab bar's Search with a post open: the search screen is
 *                on top of the post and its field has the caret
 *   COMMENT      the comment box sits right on the keys in every environment,
 *                with nothing but the post's white under it
 *
 * Screenshots go to SHOTS_DIR: the layout as the phone shows it, the part
 * under the keyboard drawn as a grey keyboard.
 *
 *   PROBE_CSS=source SHOTS_DIR=/tmp/r8 node scripts/check-community-mobile-r8.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const ORIGIN = "https://storelib.com"
const PART = process.env.PART || "all"
const LABEL = process.env.LABEL || "r8"
const THROTTLE = Number(process.env.THROTTLE || 4)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-r8-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = join(root, ".r8-probe")
mkdirSync(stubs, { recursive: true })

async function bundle() {
  writeFileSync(
    join(stubs, "navigation.js"),
    `import { startTransition, useEffect, useState } from "react"
const log = (k, a) => (window.__router ||= []).push([k, a])
const move = (kind, h) => { log(kind, h); history[kind === "push" ? "pushState" : "replaceState"](history.state, "", h); window.dispatchEvent(new Event("probe:route")) }
const router = { push: (h) => move("push", h), replace: (h) => move("replace", h), prefetch: (h) => log("prefetch", h), back: () => history.back(), refresh: () => log("refresh") }
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
export const redirect = () => {}
export const notFound = () => {}
`,
  )
  writeFileSync(
    join(stubs, "link.jsx"),
    `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]) } } }, children) })
`,
  )
  writeFileSync(
    join(stubs, "image.jsx"),
    `import React from "react"
export default function Image({ src, alt, fill, sizes, priority, ...rest }) { return React.createElement("img", { src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%" } : undefined }) }
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
    auth: { getSession: async () => ({ data: { session: { user: { id: "u-me" } } } }), signOut: async () => ({ error: null }) },
  }
}
export const isNativePlatform = () => false
`,
  )
  const { build } = await import("esbuild")
  await build({
    entryPoints: [join(root, "scripts/render-community-mobile-r8.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.r8-probe/navigation.js", "next/link": "./.r8-probe/link.jsx", "next/image": "./.r8-probe/image.jsx", "next/dynamic": "./.r8-probe/dynamic.jsx" },
    plugins: [{ name: "supabase-stub", setup(b) { b.onResolve({ filter: /lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.js") })) } }],
    banner: { js: "var process={env:{NODE_ENV:'production',NEXT_PUBLIC_SUPABASE_URL:'https://placeholder.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'placeholder'}};" },
    loader: { ".css": "empty" },
    outfile: join(stubs, "app.js"),
    logLevel: "error",
    absWorkingDir: root,
    nodePaths: [join(root, "node_modules")],
  })
  return readFileSync(join(stubs, "app.js"), "utf8")
}

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const APP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"

/*
  THE KEYBOARD PLUGIN, AS THE iOS APP'S NATIVE SIDE PRESENTS IT TO @capacitor/core: a bridge (so the platform is "ios"), the
  plugin's header (so isPluginAvailable says yes) and the native call the plugin's listeners go through. window.__kbShow(h)
  fires keyboardWillShow and keyboardDidShow with that height, __kbHide() keyboardWillHide; setScroll calls are noted.
*/
const PLUGIN_STUB = () => {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } }
  const listeners = []
  window.__setScroll = []
  window.Capacitor = {
    PluginHeaders: [{ name: "Keyboard", methods: [{ name: "addListener", rtype: "callback" }, { name: "removeListener", rtype: "promise" }, { name: "setScroll", rtype: "promise" }] }],
    nativeCallback(plugin, method, options, cb) {
      if (plugin === "Keyboard" && method === "addListener") listeners.push([options.eventName, cb])
      return String(listeners.length)
    },
    nativePromise: async (plugin, method, options) => {
      if (plugin === "Keyboard" && method === "setScroll") window.__setScroll.push(options.isDisabled)
      return undefined
    },
  }
  const fire = (name, data) => listeners.filter(([n]) => n === name).forEach(([, cb]) => cb(data))
  window.__kbShow = (h) => {
    fire("keyboardWillShow", { keyboardHeight: h })
    fire("keyboardDidShow", { keyboardHeight: h })
  }
  window.__kbHide = () => fire("keyboardWillHide", {})
}

let html = ""
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function session({ env = "safari", path = "/community/clay-studio" } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 400)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.setUserAgent(env === "android" ? ANDROID : env === "safari" ? SAFARI : APP)
  if (env === "app" || env === "app-resize") await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
  if (env === "app-resize") await p.evaluateOnNewDocument(PLUGIN_STUB)
  await p.evaluateOnNewDocument(ANIM_HOOK)
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
  const tap = async (x, y) => {
    await touch("touchStart", x, y)
    await sleep(40)
    await touch("touchEnd", x, y)
  }
  return { p, cdp, errors, touch, tap, env }
}

/* Safari's keyboard: the visual viewport shrinks to `height` and is panned down by `top`; the fixed box stays 844 tall. */
const fakeViewport = (top, height) => {
  const vv = window.visualViewport
  Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top })
  Object.defineProperty(vv, "height", { configurable: true, get: () => height })
  vv.dispatchEvent(new Event("resize"))
}
const realViewport = () => {
  const vv = window.visualViewport
  delete vv.offsetTop
  delete vv.height
  vv.dispatchEvent(new Event("resize"))
}
/* A web view resized for the keyboard: the whole page is this tall. */
const resizeTo = (s, h) => s.p.setViewport({ width: 390, height: h, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })

/*
  WHAT THE PHONE SHOWS. The layout's visible part ([top, top + visible]) at the top of an 844 tall screen, and under it a grey
  keyboard where the keys would be.
*/
let reader = null
async function phoneShot(s, file, { top = 0, visible = 844, keys = 0 } = {}) {
  reader ??= await browser.newPage()
  await s.p.bringToFront()
  const data = await s.p.screenshot({ encoding: "base64" })
  const png = await reader.evaluate(
    async (d, top, visible, keys) => {
      const img = new Image()
      img.src = `data:image/png;base64,${d}`
      await img.decode()
      const c = document.createElement("canvas")
      c.width = 390
      c.height = 844
      const g = c.getContext("2d")
      g.fillStyle = "#000"
      g.fillRect(0, 0, 390, 844)
      g.drawImage(img, 0, top, 390, visible, 0, 0, 390, visible)
      if (keys) {
        g.fillStyle = "#d1d3d9"
        g.fillRect(0, 844 - keys, 390, keys)
        g.fillStyle = "#6b7280"
        g.font = "600 15px sans-serif"
        g.fillText(`keyboard ${keys}px`, 140, 844 - keys / 2)
      }
      return c.toDataURL("image/png").split(",")[1]
    },
    data,
    top,
    visible,
    keys,
  )
  writeFileSync(join(shots, `${LABEL}-${file}.png`), Buffer.from(png, "base64"))
}

const PIC = 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]'
async function centerOf(s, sel, scroll = true) {
  return s.p.evaluate(
    (q, scroll) => {
      const el = document.querySelector(q)
      if (!el) return null
      if (scroll) el.scrollIntoView({ block: "center" })
      const r = el.getBoundingClientRect()
      return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2) }
    },
    sel,
    scroll,
  )
}
async function openPost(s) {
  const at = await centerOf(s, PIC)
  await sleep(300)
  await s.tap(at.x, at.y)
  await sleep(1600)
}
const BOX = () => {
  const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
  const box = page.querySelector("[data-comment-box=comment]").getBoundingClientRect()
  const pr = page.getBoundingClientRect()
  return { source: page.dataset.box, typing: page.hasAttribute("data-typing"), foot: page.style.getPropertyValue("--post-foot"), pageTop: Math.round(pr.top), pageBottom: Math.round(pr.bottom), boxBottom: Math.round(box.bottom), scrollY: Math.round(scrollY) }
}

/* The post's own moves (round 17's engine animates its clips and lift): when each started and how long it runs. */
const ANIM_HOOK = () => {
  const orig = Element.prototype.animate
  window.__anims = []
  Element.prototype.animate = function (keyframes, options) {
    const a = orig.call(this, keyframes, options)
    if (this.matches?.('[data-post-overlay="phone"], [data-clip], [data-post-lift]')) {
      const d = typeof options === "number" ? options : options?.duration
      window.__anims.push({ t: performance.timeOrigin + performance.now(), d: typeof d === "number" ? d : 0 })
    }
    return a
  }
}

/*
  Every frame the compositor sent while `act` ran (only their times: a gap is a gap on the screen). The longest gap is read
  from the post's first move to the end of its longest one; the wait from the press to that first move (the post being
  drawn) is reported apart.
*/
async function frames(s, act, ms) {
  await s.p.evaluate(() => (window.__anims = []))
  const ts = []
  const onFrame = (f) => {
    ts.push(f.metadata.timestamp * 1000)
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 30, maxWidth: 195, maxHeight: 422, everyNthFrame: 1 })
  await sleep(200)
  const from = ts.length
  const t0 = Date.now()
  await act()
  await sleep(ms)
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  const anims = await s.p.evaluate(() => window.__anims)
  const start = anims.length ? anims[0].t : t0
  const end = anims.length ? Math.max(...anims.filter((a) => a.t - start < 200).map((a) => a.t + a.d)) : t0 + ms
  const all = ts.slice(Math.max(0, from - 1))
  const firstIn = all.findIndex((t) => t >= start)
  /* From the first frame drawn once the move has started (the frame before it may be long before: nothing changed then). */
  const win = all.filter((t, i) => firstIn >= 0 && i >= firstIn && t <= end + 20)
  let longest = 0
  for (let i = 1; i < win.length; i++) longest = Math.max(longest, win[i] - win[i - 1])
  const at = win.map((t) => Math.round(t - start))
  return { frames: win.length, longestGapMs: Math.round(longest), moveMs: Math.round(end - start), pressToMoveMs: Math.round(start - t0), firstFrameMs: firstIn >= 0 ? Math.round(all[firstIn] - start) : null, at: process.env.DEBUG_FRAMES ? at : undefined }
}

/* ── OPEN AND CLOSE ── a post from the feed and Back, at 4x CPU: the frames, and the feed where it was. */
async function partOpenClose() {
  console.log(`\nOPEN/CLOSE: a post from the feed and Back (390x844, ${THROTTLE}x CPU)`)
  const s = await session({ env: "safari" })
  const at = await centerOf(s, PIC)
  await sleep(300)
  const before = await s.p.evaluate((q) => ({ scrollY: Math.round(scrollY), card: Math.round(document.querySelector(q).closest("article").getBoundingClientRect().top) }), PIC)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const open = await frames(s, () => s.tap(at.x, at.y), 900)
  await sleep(800)
  const opened = await s.p.evaluate(() => ({ layer: !!document.querySelector("[data-post-fullscreen]") && getComputedStyle(document.querySelector("[data-post-fullscreen]")).visibility !== "hidden", path: location.pathname, scrollY: Math.round(scrollY) }))
  await phoneShot(s, "post-open")
  const back = await centerOf(s, "[data-post-overlay-close]", false)
  const close = await frames(s, () => s.tap(back.x, back.y), 900)
  await sleep(800)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const after = await s.p.evaluate((q) => ({ scrollY: Math.round(scrollY), card: Math.round(document.querySelector(q).closest("article").getBoundingClientRect().top), layer: !!document.querySelector("[data-post-fullscreen]") && getComputedStyle(document.querySelector("[data-post-fullscreen]")).visibility !== "hidden", path: location.pathname }), PIC)
  await phoneShot(s, "post-closed")
  console.log(`  open: ${JSON.stringify(open)}; close: ${JSON.stringify(close)}`)
  expect(opened.layer && /\/post\//.test(opened.path), "a tap on the card opens the post at its own address", opened)
  expect(open.longestGapMs <= 50 && close.longestGapMs <= 50, `no frame on the screen held over 50ms while it opens or closes at ${THROTTLE}x CPU`, { open, close })
  expect(!after.layer && after.scrollY === before.scrollY && Math.abs(after.card - before.card) <= 1, "Back: the post is gone and the feed is exactly where it was, the card in its place", { before, after })
  /* Again with the comment box typed in and iOS panning the page under it (the window scrolled 200px and the visible part panned): Back still lands on the feed as it was. */
  await s.tap(at.x, at.y)
  await sleep(1600)
  await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
  await s.p.evaluate(fakeViewport, 120, 464)
  await s.p.evaluate(() => window.scrollBy(0, 200))
  await sleep(500)
  const back2 = await centerOf(s, "[data-post-overlay-close]", false)
  await s.tap(back2.x, back2.y)
  await s.p.evaluate(realViewport)
  await sleep(1200)
  const after2 = await s.p.evaluate((q) => ({ scrollY: Math.round(scrollY), card: Math.round(document.querySelector(q).closest("article").getBoundingClientRect().top), focused: document.activeElement?.tagName }), PIC)
  expect(after2.scrollY === before.scrollY && Math.abs(after2.card - before.card) <= 1 && after2.focused !== "TEXTAREA", "Back after typing a comment (iOS panned the page): the keyboard goes, the feed is where it was", { before, after2 })
  expect(!s.errors.length, "no page errors (open/close)", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── THE COMPOSER ── New post over a feed scrolled part way: the page behind holds, the toolbar sits on the keys. */
async function partComposer() {
  console.log("\nCOMPOSER: New post over a scrolled feed, the keyboard up and down")
  for (const run of ["safari", "safari-pan", "app-resize", "android"]) {
    /* safari-pan: iOS also panned the page 120px to the field (the visible part starts 120px down the fixed box). */
    const env = run === "safari-pan" ? "safari" : run
    const pan = run === "safari-pan" ? 120 : 0
    const s = await session({ env })
    await s.p.evaluate(() => window.scrollTo(0, 640))
    await sleep(400)
    const y0 = await s.p.evaluate(() => Math.round(scrollY))
    await s.p.evaluate(() => window.__compose?.())
    await sleep(1400)
    const field = await s.p.evaluate(() => {
      const t = document.querySelector("[data-composer=sheet] textarea, [data-composer=sheet] [data-composer-title]")
      return { focused: !!document.activeElement?.closest?.("[data-composer=sheet]"), tag: document.activeElement?.tagName, has: !!t }
    })
    /* The sheet put the caret in its field once it arrived. Let it go, so the tap below is a focus with its keyboard at once. */
    await s.p.evaluate(() => document.activeElement?.blur())
    await sleep(500)
    const sheetTop0 = await s.p.evaluate(() => Math.round(document.querySelector("[data-mobile-bottom-sheet]").getBoundingClientRect().top))
    /* The keyboard comes up with the focus, as this environment brings it. */
    await s.p.evaluate(() => document.querySelector("[data-composer=sheet] [data-composer-title], [data-composer=sheet] textarea")?.focus())
    if (env === "safari") await s.p.evaluate(fakeViewport, pan, 464)
    if (env === "app-resize") {
      await s.p.evaluate(() => window.__kbShow(380))
      await resizeTo(s, 464)
    }
    if (env === "android") await resizeTo(s, 464)
    await sleep(900)
    const up = await s.p.evaluate(() => {
      const bar = document.querySelector("[data-composer-toolbar]").getBoundingClientRect()
      const sheet = document.querySelector("[data-mobile-bottom-sheet]").getBoundingClientRect()
      const shell = document.querySelector("[data-community-shell]")
      return { scrollY: Math.round(scrollY), bar: Math.round(bar.bottom), sheetTop: Math.round(sheet.top), shellMax: getComputedStyle(shell).maxHeight, kbOpen: document.documentElement.classList.contains("keyboard-open"), focused: !!document.activeElement?.closest?.("[data-composer=sheet]") }
    })
    /* Where the keys start, in the page's own coordinates (a pan moves the screen down the fixed box). */
    const keysTop = 464 + pan
    await phoneShot(s, `composer-${run}`, { top: pan, visible: 464, keys: 380 })
    /* And down again. */
    await s.p.evaluate(() => document.activeElement?.blur())
    if (env === "safari") await s.p.evaluate(realViewport)
    if (env === "app-resize") await s.p.evaluate(() => window.__kbHide())
    if (env !== "safari") await resizeTo(s, 844)
    await sleep(900)
    const down = await s.p.evaluate(() => ({ scrollY: Math.round(scrollY), bar: Math.round(document.querySelector("[data-composer-toolbar]").getBoundingClientRect().bottom) }))
    await s.p.evaluate(() => document.querySelector("[data-composer-cancel]")?.click())
    await sleep(1200)
    const shut = await s.p.evaluate(() => ({ scrollY: Math.round(scrollY), sheet: !!document.querySelector("[data-composer=sheet]") }))
    console.log(`  ${run}: ${JSON.stringify({ y0, field, sheetTop0, up, down, shut })}`)
    expect(up.focused && Math.abs(up.bar - keysTop) <= 2, `${run}: the toolbar sits on the keys (${keysTop} in the page), the field keeps the caret`, up)
    expect(up.sheetTop >= pan, `${run}: the sheet's top is on the screen (not under a pan)`, { pan, sheetTop: up.sheetTop })
    expect(up.scrollY === y0, `${run}: the feed behind keeps its scroll while the keyboard is up`, { y0, up: up.scrollY })
    expect(down.scrollY === y0 && shut.scrollY === y0 && !shut.sheet, `${run}: and after it goes down and the sheet closes, the feed is where it was`, { y0, down, shut })
    expect(!s.errors.length, `no page errors (composer ${run})`, s.errors.slice(0, 3))
    await s.p.close()
  }
}

/* ── SEARCH OVER AN OPENED POST ── the tab bar's Search: on top of the post, with the caret. */
async function partSearch() {
  console.log("\nSEARCH: the tab bar's Search with a post open")
  const s = await session({ env: "safari" })
  await openPost(s)
  const opened = await s.p.evaluate(() => window.__openSearch?.())
  await sleep(500)
  const facts = await s.p.evaluate(() => {
    const screen = document.querySelector("[data-community-search-screen]")
    const hit = (x, y) => {
      const el = document.elementFromPoint(x, y)
      return el?.closest("[data-community-search-screen]") ? "search" : el?.closest("[data-post-fullscreen]") ? "post" : el?.closest("[data-buyer-tab-bar]") ? "tabs" : el?.tagName || "none"
    }
    return {
      screen: !!screen,
      z: screen ? getComputedStyle(screen).zIndex : null,
      top: hit(195, 40),
      middle: hit(195, 400),
      foot: hit(195, 820),
      caret: !!document.activeElement?.matches?.("[data-community-search-input]"),
      tabsOver: document.documentElement.hasAttribute("data-tabs-over"),
    }
  })
  await phoneShot(s, "search-over-post")
  expect(opened && facts.screen && facts.top === "search" && facts.middle === "search" && facts.foot === "search", "the search screen covers the post, top to foot (nothing of the post or the tab bar over it)", facts)
  expect(facts.caret, "its field has the caret", facts)
  /* A post picked from it opens over the place, in place of the one that was open. */
  await s.p.evaluate(() => document.querySelector("[data-community-search-input]")?.focus())
  await s.p.keyboard.type("foot")
  await sleep(900)
  const result = await s.p.evaluate(() => {
    const a = [...document.querySelectorAll("[data-community-search-screen] a, [data-community-search-screen] [role=option]")].find((x) => /foot too heavy/i.test(x.textContent || ""))
    if (!a) return null
    const r = a.getBoundingClientRect()
    return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
  })
  if (result) {
    await s.tap(result.x, result.y)
    await sleep(1800)
  }
  const picked = await s.p.evaluate(() => ({
    screen: !!document.querySelector("[data-community-search-screen]"),
    path: location.pathname,
    /* The post on top: the last layer that is drawn (the one it was opened over may be kept under it, or on its way out). */
    title: [...document.querySelectorAll("[data-post-fullscreen]")].filter((l) => getComputedStyle(l).visibility !== "hidden").at(-1)?.textContent?.includes("Is this foot too heavy?") ?? false,
    layers: [...document.querySelectorAll("[data-post-fullscreen]")].map((l) => getComputedStyle(l).visibility),
  }))
  await phoneShot(s, "search-picked-post")
  expect(!!result && !picked.screen && /\/post\//.test(picked.path) && picked.title, "a post picked there opens over the community, the search gone", { result, picked })
  if (picked.title) {
    expect(!s.errors.length, "no page errors (search)", s.errors.slice(0, 3))
    await s.p.close()
    return
  }
  /* Cancel: back to the post as it was. */
  await s.p.evaluate(() => document.querySelector("[data-community-search-close]")?.click())
  await sleep(600)
  const after = await s.p.evaluate(() => ({ screen: !!document.querySelector("[data-community-search-screen]"), post: !!document.querySelector("[data-post-fullscreen]"), tabsOver: document.documentElement.hasAttribute("data-tabs-over") }))
  expect(!after.screen && after.post && after.tabsOver, "Cancel: the post is there as it was, the tab bar over it again", after)
  expect(!s.errors.length, "no page errors (search)", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── THE COMMENT BOX ON THE KEYS ── per environment. */
async function partComment() {
  console.log("\nCOMMENT: Write a comment, the box on the keys (390x844, keyboard 380)")
  const cases = [
    { env: "safari", name: "safari", show: (s) => s.p.evaluate(fakeViewport, 0, 464), shot: { top: 0, visible: 464, keys: 380 }, screenBottom: (b) => b.boxBottom },
    { env: "safari", name: "safari-pan", show: (s) => s.p.evaluate(fakeViewport, 120, 464), shot: { top: 120, visible: 464, keys: 380 }, screenBottom: (b) => b.boxBottom - 120 },
    { env: "app", name: "app", show: async () => {}, shot: { top: 0, visible: 464, keys: 380 }, screenBottom: (b) => b.boxBottom },
    {
      env: "app-resize",
      name: "app-resize",
      show: async (s) => {
        await s.p.evaluate(() => window.__kbShow(380))
        await resizeTo(s, 464)
      },
      shot: { top: 0, visible: 464, keys: 380 },
      screenBottom: (b) => b.boxBottom,
    },
    { env: "android", name: "android", show: (s) => resizeTo(s, 464), shot: { top: 0, visible: 464, keys: 380 }, screenBottom: (b) => b.boxBottom },
  ]
  for (const c of cases) {
    const s = await session({ env: c.env })
    await openPost(s)
    /* A second keyboard in the same visit, for the app with the plugin: the first one taught it the web view resizes. */
    const rounds = c.env === "app-resize" ? 2 : 1
    let b = null
    for (let i = 0; i < rounds; i++) {
      /* What the last round asked of the web view's scroll is what is checked below. */
      await s.p.evaluate(() => (window.__setScroll = []))
      await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
      await c.show(s)
      await sleep(700)
      b = await s.p.evaluate(BOX)
      if (i < rounds - 1) {
        await s.p.evaluate(() => document.activeElement?.blur())
        await s.p.evaluate(() => window.__kbHide?.())
        await resizeTo(s, 844)
        await sleep(600)
      }
    }
    const onScreen = c.screenBottom(b)
    await phoneShot(s, `comment-${c.name}`, c.shot)
    console.log(`  ${c.name}: ${JSON.stringify(b)}  box foot on the screen ${onScreen}`)
    expect(b.typing && onScreen <= 464 && onScreen >= 444, `${c.name}: the comment box sits right on the keys (its foot 444 to 464 on the screen), no empty band`, { onScreen, ...b })
    if (c.env === "app-resize") {
      const held = await s.p.evaluate(() => window.__setScroll)
      expect(!held.includes(true), "app-resize: on the next keyboard, the web view's scroll is not held when the web view makes room itself", held)
    }
    expect(!s.errors.length, `no page errors (comment ${c.name})`, s.errors.slice(0, 3))
    await s.p.close()
  }
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()
  if (PART === "all" || PART === "open") await partOpenClose()
  if (PART === "all" || PART === "composer") await partComposer()
  if (PART === "all" || PART === "search") await partSearch()
  if (PART === "all" || PART === "comment") await partComment()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
console.log(`\n  screenshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
