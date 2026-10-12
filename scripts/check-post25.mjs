/**
 * ===========================================================================
 *  ROUND 25: THE POST AS A BOTTOM SHEET, NEW POST, THE COMMENT BOX, MEASURED
 * ===========================================================================
 * The real community shell, feed, opened post, comments and composer (round
 * 17's harness, scripts/render-community-mobile-r8.tsx) at 390x844 with
 * touch and 4x CPU, the page's main thread made busy on purpose (BUSY_MS of
 * a busy loop the moment each move starts), and the keyboard simulated the
 * way each platform reports it:
 *
 *   safari       iPhone Safari: visualViewport shrinks to 464 (and is panned
 *                down by offsetTop when iOS reveals a field the keys would
 *                cover); the fixed box stays 844
 *   app          the iOS app with no keyboard plugin: nothing is reported
 *   app-plugin   the iOS app with @capacitor/keyboard (resize "none"): the
 *                plugin says 380 before the keys move
 *   app-overpan  the iOS app panned by more than it reports (images/76.jpg:
 *                the page moved up 391px): drawn by moving the whole document
 *                up that far, fixed layers with it, as WKWebView does
 *   android      the web view itself shrinks to 464
 *
 * Each move is recorded as the compositor sent it (Page.startScreencast, every
 * frame) and laid out as a frame sheet: SHOTS_DIR/<label>-<part>-frames.png,
 * every frame of the move in order with its time, to LOOK at. The keyboard is
 * drawn into the page as iOS's (translucent grey keys), so whatever shows
 * through it is in the frames.
 *
 *   PROBE_CSS=source SHOTS_DIR=/tmp/p25 LABEL=after node scripts/check-post25.mjs
 *   PART=open|pull|composer|comment
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
const LABEL = process.env.LABEL || "p25"
const THROTTLE = Number(process.env.THROTTLE || 4)
const BUSY_MS = Number(process.env.BUSY_MS || 150)
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-p25-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const results = {}
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = join(root, ".p25-probe")
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
    alias: { "@": ".", "next/navigation": "./.p25-probe/navigation.js", "next/link": "./.p25-probe/link.jsx", "next/image": "./.p25-probe/image.jsx", "next/dynamic": "./.p25-probe/dynamic.jsx" },
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

/* The Keyboard plugin as the iOS app's native side presents it to @capacitor/core (round R8's stub). */
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

/*
  IN THE PAGE BEFORE IT LOADS: the busy loop (window.__busyNext: the next move to start is followed, a frame and a task
  later, that is, the moment it is under way, by BUSY_MS of main thread work), the sheet's moves noted (when each position
  transition ran and ended, on the page clock), the keyboard drawn as iOS's (translucent, so what is behind shows through)
  and the visual viewport faked as a platform reports it.
*/
const PAGE_HOOKS = (busyMs) => {
  window.__moves = []
  window.__busyNext = 0
  window.__busy = (ms) => {
    const end = performance.now() + ms
    while (performance.now() < end) {
      /* busy */
    }
  }
  /* When the finger lifted (for the wait from the press to the move). */
  window.__marks = []
  document.addEventListener("touchend", () => window.__marks.push(["touch end", performance.timeOrigin + performance.now()]), true)
  /* The base commit's post moved by Web Animations (post-stage.ts): its moves are noted and made busy the same way. */
  const realAnimate = Element.prototype.animate
  Element.prototype.animate = function (keyframes, options) {
    const a = realAnimate.call(this, keyframes, options)
    if (this.matches?.("[data-post-lift], [data-clip], [data-post-overlay='phone'], [data-post-fullscreen]")) {
      const d = typeof options === "number" ? options : options?.duration
      const t = performance.timeOrigin + performance.now()
      window.__moves.push({ kind: "run", t })
      window.__moves.push({ kind: "end", t: t + (typeof d === "number" ? d : 0) })
      if (window.__busyNext) {
        window.__busyNext = 0
        requestAnimationFrame(() => setTimeout(() => window.__busy(busyMs), 0))
      }
    }
    return a
  }
  document.addEventListener(
    "transitionrun",
    (e) => {
      if (e.propertyName !== "transform" || !e.target.matches?.("[data-mobile-bottom-sheet]")) return
      window.__moves.push({ kind: "run", t: performance.timeOrigin + performance.now() })
      /* Held once the move has been handed to the compositor (a frame, then a task), as round 17's probe did. */
      if (window.__busyNext) {
        window.__busyNext = 0
        requestAnimationFrame(() => setTimeout(() => window.__busy(busyMs), 0))
      }
    },
    true,
  )
  document.addEventListener(
    "transitionend",
    (e) => {
      if (e.propertyName !== "transform" || !e.target.matches?.("[data-mobile-bottom-sheet]")) return
      window.__moves.push({ kind: "end", t: performance.timeOrigin + performance.now() })
    },
    true,
  )
  /*
    iOS ANSWERS A FINGER'S FOCUS BY SCROLLING THE PAGE TO THE FIELD (iPhone Safari and the app's web view), a field in a
    fixed sheet included; a focus made with preventScroll it leaves alone. Drawn here as iOS's reveal: the document scrolled
    by REVEAL_PX in the focus itself when the focus was not a script's own with preventScroll. window.__reveals counts them.
  */
  window.__reveals = 0
  const realFocus = HTMLElement.prototype.focus
  let calm = false
  HTMLElement.prototype.focus = function (opts) {
    calm = !!opts?.preventScroll
    try {
      return realFocus.call(this, opts)
    } finally {
      calm = false
    }
  }
  document.addEventListener(
    "focusin",
    (e) => {
      if (calm || !/iPhone/.test(navigator.userAgent)) return
      const t = e.target
      if (!(t instanceof HTMLTextAreaElement || t instanceof HTMLInputElement)) return
      if (document.scrollingElement && document.scrollingElement.scrollHeight > innerHeight + 200) {
        window.__reveals++
        ;(window.__revealed ||= []).push(`${t.tagName}${t.getAttribute("aria-label") ? `[${t.getAttribute("aria-label")}]` : ""}@${Math.round(performance.now())}`)
        window.scrollBy(0, 120)
      }
    },
    true,
  )
  /* The keys: drawn over everything, in the screen's own place (`pan` takes back a document moved up, see app-overpan). */
  window.__keys = (h, pan = 0) => {
    let k = document.getElementById("probe-keys")
    if (!h) return k?.remove()
    if (!k) {
      k = document.createElement("div")
      k.id = "probe-keys"
      k.style.cssText = "position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;background:rgba(190,193,200,0.72);border-top:1px solid rgba(0,0,0,0.08);font:600 14px sans-serif;color:#374151;display:flex;align-items:flex-start;justify-content:center;padding-top:14px"
      document.documentElement.appendChild(k)
    }
    k.textContent = `keyboard ${h}px`
    k.style.height = `${h}px`
    k.style.top = `${844 - h + pan}px`
  }
  /* Safari's report: the visible part this tall, panned down this far. */
  window.__vv = (top, height) => {
    const vv = window.visualViewport
    Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top })
    Object.defineProperty(vv, "height", { configurable: true, get: () => height })
    vv.dispatchEvent(new Event("resize"))
    vv.dispatchEvent(new Event("scroll"))
  }
  window.__vvReal = () => {
    const vv = window.visualViewport
    delete vv.offsetTop
    delete vv.height
    vv.dispatchEvent(new Event("resize"))
  }
  /*
    iOS panning the page by `p`: what is on the screen moves up by it, fixed layers included, and what is under the fixed
    box's foot (the document past the screen) comes into sight below it. Drawn by making <html> the fixed layers' box (a
    CSS move does that), 844 tall, and moving it so that box's top is `p` above the screen.
  */
  window.__panNow = 0
  window.__pan = (p) => {
    const h = document.documentElement
    window.__panNow = p
    if (!p) {
      h.style.transform = ""
      h.style.height = ""
      return
    }
    h.style.height = "844px"
    h.style.transform = `translateY(${Math.round(scrollY) - p}px)`
  }
}

let html = ""
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

/* The page being measured: brought back to the front after the reader page is used (a page behind draws no frames and takes no touch). */
let current = null
async function session({ env = "safari", path = "/community/clay-studio" } = {}) {
  const p = await browser.newPage()
  current = p
  p.setDefaultTimeout(180000)
  p.setDefaultNavigationTimeout(180000)
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
  if (env.startsWith("app")) await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
  if (env === "app-plugin") await p.evaluateOnNewDocument(PLUGIN_STUB)
  await p.evaluateOnNewDocument(PAGE_HOOKS, BUSY_MS)
  await p.goto(`${ORIGIN}${path}`, { waitUntil: "load" })
  await p.evaluate(() => document.fonts.ready)
  await sleep(1200)
  const cdp = await p.target().createCDPSession()
  const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 4, radiusY: 4, force: 1 }] })
  /* A page that stops answering is paused and its stack printed (a hang is a bug to find, not a timeout to raise). */
  const watch = async (what, run) => {
    let timer
    const hung = new Promise((r) => (timer = setTimeout(() => r("hung"), 45000)))
    const got = await Promise.race([run(), hung])
    clearTimeout(timer)
    if (got !== "hung") return got
    await cdp.send("Debugger.enable")
    const paused = new Promise((r) => cdp.once("Debugger.paused", r))
    await cdp.send("Debugger.pause")
    const ev = await paused
    console.log(`  HUNG in ${what}:\n${ev.callFrames.slice(0, 25).map((f) => `    ${f.functionName || "(anon)"} @${f.location.lineNumber}:${f.location.columnNumber}`).join("\n")}`)
    throw new Error(`page hung in ${what}`)
  }
  const tap = async (x, y) => {
    await watch("touchStart", () => touch("touchStart", x, y))
    await sleep(40)
    await watch("touchEnd", () => touch("touchEnd", x, y))
  }
  return { p, cdp, errors, touch, tap, env }
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

/* ── RECORDING ── every frame the compositor sends while `act` runs, kept as pictures with their times. */
async function record(s, act, ms) {
  await s.p.evaluate(() => (window.__moves = []))
  const frames = []
  const onFrame = (f) => {
    frames.push({ t: f.metadata.timestamp * 1000, data: f.data })
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  await sleep(250)
  const from = frames.length
  const t0 = Date.now()
  await act()
  await sleep(ms)
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  const moves = await s.p.evaluate(() => window.__moves)
  /* In the compositor's order (frames can arrive out of it). */
  return { frames: frames.slice(Math.max(0, from - 1)).sort((a, b) => a.t - b.t), t0, moves }
}

/* The longest gap between frames from the first move's start to the last move's end (a gap is a frame held on the screen). */
function gaps(rec) {
  const runs = rec.moves.filter((m) => m.kind === "run")
  const ends = rec.moves.filter((m) => m.kind === "end")
  if (!runs.length) return { moves: 0, longestGapMs: null, frames: 0 }
  const start = runs[0].t
  const end = ends.length ? Math.max(...ends.map((m) => m.t)) : start + 400
  const ts = rec.frames.map((f) => f.t)
  const inside = ts.filter((t) => t >= start - 1 && t <= end + 20)
  const before = ts.filter((t) => t < start).at(-1)
  const win = before !== undefined ? [before, ...inside] : inside
  let longest = 0
  for (let i = 1; i < win.length; i++) longest = Math.max(longest, win[i] - win[i - 1])
  return { moves: runs.length, frames: inside.length, longestGapMs: Math.round(longest), moveMs: Math.round(end - start), pressToMoveMs: Math.round(start - rec.t0) }
}

/* The longest gap between two frames the display compositor drew, from the first move's start to the last one's end. */
function drawGaps(path, origin, moves) {
  const runs = moves.filter((m) => m.kind === "run")
  const ends = moves.filter((m) => m.kind === "end")
  if (!runs.length) return null
  const ev = JSON.parse(readFileSync(path, "utf8")).traceEvents
  const mark = ev.find((e) => e.name === "TimeStamp" && JSON.stringify(e.args).includes("p25-sync"))
  if (!mark) return null
  /* Trace time (us) for a page time (performance.now, ms). */
  const at = (pageMs) => mark.ts + (pageMs - origin.sync) * 1000
  const start = at(runs[0].t - origin.timeOrigin)
  const end = at((ends.length ? Math.max(...ends.map((m) => m.t)) : runs[0].t + 400) - origin.timeOrigin)
  const draws = [...new Set(ev.filter((e) => e.name === "Graphics.Pipeline.DrawAndSwap" && e.ph === "b").map((e) => e.ts))].sort((a, b) => a - b)
  const inside = draws.filter((t) => t >= start && t <= end)
  const before = draws.filter((t) => t < start).at(-1)
  const after = draws.find((t) => t > end)
  const win = [before, ...inside, after].filter((t) => t !== undefined)
  let longest = 0
  for (let i = 1; i < win.length; i++) longest = Math.max(longest, win[i] - win[i - 1])
  return { frames: inside.length, longestGapMs: Math.round(longest / 1000), moveMs: Math.round((end - start) / 1000) }
}

/* A frame sheet: every frame of `rec` in order, small, with its time from `zero`, in rows of `cols`. */
let reader = null
async function frameSheet(rec, file, { zero = rec.t0, cols = 8, scale = 0.42, max = 48, from = -Infinity, to = Infinity } = {}) {
  reader ??= await browser.newPage()
  const picked = rec.frames.filter((f) => f.t >= from && f.t <= to).slice(0, max)
  if (!picked.length) return
  const png = await reader.evaluate(
    async (frames, zero, cols, scale) => {
      const w = Math.round(390 * scale)
      const h = Math.round(844 * scale)
      const rows = Math.ceil(frames.length / cols)
      const c = document.createElement("canvas")
      c.width = cols * (w + 6) + 6
      c.height = rows * (h + 22) + 6
      const g = c.getContext("2d")
      g.fillStyle = "#30343b"
      g.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < frames.length; i++) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${frames[i].data}`
        await img.decode()
        const x = 6 + (i % cols) * (w + 6)
        const y = 6 + Math.floor(i / cols) * (h + 22)
        g.drawImage(img, x, y + 16, w, h)
        g.fillStyle = "#fff"
        g.font = "600 12px sans-serif"
        g.fillText(`#${i}  ${Math.round(frames[i].t - zero)}ms`, x + 2, y + 12)
      }
      return c.toDataURL("image/png").split(",")[1]
    },
    picked,
    zero,
    cols,
    scale,
  )
  writeFileSync(join(shots, `${LABEL}-${file}.png`), Buffer.from(png, "base64"))
  await current?.bringToFront()
}

async function shot(s, file) {
  await s.p.bringToFront()
  await s.p.screenshot({ path: join(shots, `${LABEL}-${file}.png`) })
}

const sheetFacts = () => {
  const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((x) => x.querySelector("[data-post-fullscreen]"))
  const old = document.querySelector("[data-post-fullscreen]")
  const el = sheet ?? old
  if (!el) return { layer: false }
  const r = el.getBoundingClientRect()
  return { layer: getComputedStyle(el).visibility !== "hidden", top: Math.round(r.top), bottom: Math.round(r.bottom), path: location.pathname, scrollY: Math.round(scrollY), tabsCovered: document.documentElement.hasAttribute("data-tabs-covered") }
}

/* ── OPEN AND CLOSE ── a post from the feed, then its close button; busy as each move starts. */
async function partOpen() {
  console.log(`\nOPEN/CLOSE: a post from the feed, then its close (390x844, ${THROTTLE}x CPU, ${BUSY_MS}ms busy as each move starts)`)
  const s = await session({ env: "safari" })
  const at = await centerOf(s, PIC)
  await sleep(300)
  const before = await s.p.evaluate((q) => ({ scrollY: Math.round(scrollY), card: Math.round(document.querySelector(q).closest("article").getBoundingClientRect().top) }), PIC)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  /* REPEAT opens and closes (this machine's other work shows up as gaps too: the median is the figure). */
  const REPEAT = Number(process.env.REPEAT || 1)
  const runs = []
  let open
  let close
  let opened
  for (let i = 0; i < REPEAT; i++) {
    await s.p.evaluate(() => (window.__busyNext = 1))
    /*
      THE COMPOSITOR'S OWN FRAMES (TRACE=1). On a machine this loaded the screencast drops frames of its own (its copies and
      acks queue behind everything else), so the frames the display compositor actually drew are read from a trace:
      Graphics.Pipeline.DrawAndSwap, between the move's start and its end.
    */
    const tracePath = join(shots, `${LABEL}-trace-${i}.json`)
    if (process.env.TRACE) {
      await s.p.tracing.start({ path: tracePath, categories: ["blink.animations", "devtools.timeline", "cc", "viz", "benchmark"] })
      await s.p.evaluate(() => {
        window.__sync = performance.now()
        console.timeStamp("p25-sync")
      })
    }
    const o = await record(s, () => s.tap(at.x, at.y), 1400)
    const facts = await s.p.evaluate(sheetFacts)
    if (i === 0) await shot(s, "open-rest")
    const back = await centerOf(s, "[data-post-overlay-close]", false)
    await s.p.evaluate(() => (window.__busyNext = 1))
    const c = await record(s, () => s.tap(back.x, back.y), 1200)
    let drawn = null
    if (process.env.TRACE) {
      await s.p.tracing.stop()
      const origin = await s.p.evaluate(() => ({ sync: window.__sync, timeOrigin: performance.timeOrigin }))
      drawn = { open: drawGaps(tracePath, origin, o.moves), close: drawGaps(tracePath, origin, c.moves) }
    }
    await sleep(500)
    const marks = await s.p.evaluate(() => window.__marks.splice(0))
    const tEnd = marks.find((m) => m[0] === "touch end")?.[1]
    const tRun = o.moves.find((m) => m.kind === "run")?.t
    runs.push({ drawn, open: gaps(o).longestGapMs, close: gaps(c).longestGapMs, touchToMoveMs: tEnd && tRun ? Math.round(tRun - tEnd) : null })
    if (i === 0) {
      open = o
      close = c
      opened = facts
    }
  }
  const median = (xs) => {
    const v = xs.filter((x) => x !== null).sort((a, b) => a - b)
    return v.length ? v[Math.floor(v.length / 2)] : null
  }
  results.openRuns = runs
  console.log(`  ${REPEAT} runs, longest gap (open/close): ${runs.map((r) => `${r.open}/${r.close}`).join("  ")}; median ${median(runs.map((r) => r.open))}/${median(runs.map((r) => r.close))}`)
  console.log(`  from the finger's lift to the move starting: ${runs.map((r) => r.touchToMoveMs).join(", ")} ms`)
  if (process.env.TRACE) {
    const o = runs.map((r) => r.drawn?.open?.longestGapMs ?? null)
    const c = runs.map((r) => r.drawn?.close?.longestGapMs ?? null)
    console.log(`  the compositor's own frames, longest gap while it moves (open/close): ${runs.map((r, i) => `${o[i]}/${c[i]}`).join("  ")}; median ${median(o)}/${median(c)}`)
    results.openDrawn = runs.map((r) => r.drawn)
  }
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await sleep(600)
  const after = await s.p.evaluate((q) => ({ scrollY: Math.round(scrollY), card: Math.round(document.querySelector(q).closest("article").getBoundingClientRect().top), post: !!document.querySelector("[data-post-fullscreen]") && getComputedStyle(document.querySelector("[data-post-fullscreen]")).visibility !== "hidden" }), PIC)
  await frameSheet(open, "open-frames")
  await frameSheet(close, "close-frames")
  const g1 = gaps(open)
  const g2 = gaps(close)
  results.open = { open: g1, close: g2 }
  console.log(`  open ${JSON.stringify(g1)}\n  close ${JSON.stringify(g2)}\n  opened ${JSON.stringify(opened)}`)
  expect(opened.layer && /\/post\//.test(opened.path), "a tap on the card opens the post, at its own address", opened)
  expect(g1.longestGapMs !== null && g1.longestGapMs <= 50 && g2.longestGapMs !== null && g2.longestGapMs <= 50, `no frame held over 50ms while it rises or closes, with ${BUSY_MS}ms of main thread work as each move starts`, { g1, g2 })
  expect(!after.post && after.scrollY === before.scrollY && Math.abs(after.card - before.card) <= 1, "closed: the feed exactly where it was, the card in its place", { before, after })
  expect(!s.errors.length, "no page errors (open/close)", s.errors.slice(0, 3))
  await s.p.close()
}

/* ── PULL ── the sheet follows a finger down from the post's header and closes on release. */
async function partPull() {
  console.log(`\nPULL: a finger pulls the post down from its top and lets go (${THROTTLE}x CPU)`)
  const s = await session({ env: "safari" })
  const at = await centerOf(s, PIC)
  await sleep(300)
  await s.tap(at.x, at.y)
  await sleep(1500)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const top = await centerOf(s, "[data-post-fullscreen-top]", false)
  const follow = []
  const pull = await record(
    s,
    async () => {
      await s.touch("touchStart", 120, top.y)
      /* Past the middle of the sheet (a slow pull short of it springs back, as the builder's sheet does). */
      for (let i = 1; i <= 28; i++) {
        await s.touch("touchMove", 120, top.y + i * 16)
        await sleep(16)
        if (i % 6 === 0) follow.push({ finger: i * 16, sheetTop: (await s.p.evaluate(sheetFacts)).top })
      }
      await s.touch("touchEnd", 120, top.y + 28 * 16)
    },
    1000,
  )
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  await sleep(600)
  const after = await s.p.evaluate(() => ({ post: !!document.querySelector("[data-post-fullscreen]"), path: location.pathname }))
  await frameSheet(pull, "pull-frames")
  const opened = follow[0]?.sheetTop - follow[0]?.finger
  console.log(`  follow ${JSON.stringify(follow)}  after ${JSON.stringify(after)}  ${JSON.stringify(gaps(pull))}`)
  expect(follow.length >= 3 && follow.every((f) => Math.abs(f.sheetTop - f.finger - opened) <= 18), "the sheet follows the finger, pixel for pixel (within a frame's move)", follow)
  expect(!after.post && !/\/post\//.test(after.path), "let go past the line: it closes, and the address steps back", after)
  expect(!s.errors.length, "no page errors (pull)", s.errors.slice(0, 3))
  await s.p.close()
}

/*
  ── NEW POST ── the owner's case: the composer open, the keyboard up for the title, down again (the field let go), then a tap
  on "Write something..." again. iOS's way, simulated: the keys rise over 250ms; if the field the finger landed in would be
  under them, iOS pans the page up by as much; the visible part is reported once the keys are up. Every frame, the sheet's
  top and the toolbar's foot on the SCREEN are read (a pan moves both); a bump is a frame where the sheet's top moves.
*/
async function partComposer() {
  console.log(`\nNEW POST: the keyboard up, down, and a tap on "Write something..." again (Safari's report, iOS's pan, ${THROTTLE}x CPU)`)
  const s = await session({ env: "safari" })
  await s.p.evaluate(() => window.scrollTo(0, 400))
  await sleep(300)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  await s.p.evaluate(() => (window.__busyNext = 1))
  const rise = await record(s, () => s.p.evaluate(() => window.__compose?.()), 1600)
  const g = gaps(rise)
  await frameSheet(rise, "composer-open-frames")
  /* The title has the caret (the sheet put it there on landing): Safari reports its keyboard. */
  const keys = 380
  const iosKeyboard = async (field) => {
    /* The finger's field: is it under where the keys will be? Then iOS pans by as much (plus its margin). */
    const r = await s.p.evaluate((sel) => {
      const el = document.querySelector(sel)
      const b = el.getBoundingClientRect()
      const caret = Math.min(b.bottom, b.top + 30)
      return { caret: Math.round(caret) }
    }, field)
    const pan = Math.max(0, r.caret + 12 - (844 - keys))
    await s.p.evaluate((h) => window.__keys(h), keys)
    await sleep(250)
    /* The pan is reported (offsetTop), not drawn: the page's own numbers stay in the layout's frame, as on iOS. */
    await s.p.evaluate((pan, vh) => {
      window.__panNow = pan
      window.__keys(380, pan)
      window.__vv(pan, vh)
    }, pan, 844 - keys)
    return pan
  }
  const focused1 = await s.p.evaluate(() => document.activeElement?.matches?.("[data-composer-title]") ?? false)
  const pan1 = await iosKeyboard("[data-composer=sheet] [data-composer-title]")
  await sleep(700)
  /* Down: Done on the keys (the field lets go), the keys fall, then Safari reports. */
  await s.p.evaluate(() => document.activeElement?.blur())
  await s.p.evaluate(() => window.__keys(0))
  await sleep(250)
  await s.p.evaluate(() => {
    window.__panNow = 0
    window.__vvReal()
  })
  await sleep(700)
  /* And again: a tap on "Write something...", sampled every frame from the touch. */
  const field = await centerOf(s, "[data-composer=sheet] textarea", false)
  await s.p.evaluate(() => {
    window.__track = []
    const tick = () => {
      const sheet = document.querySelector("[data-mobile-bottom-sheet]:has([data-composer=sheet])")
      const bar = document.querySelector("[data-composer-toolbar]")
      if (sheet && bar) {
        const pan = window.__panNow
        /* On the SCREEN: the layout's numbers less the pan iOS reported. */
        window.__track.push({ t: Math.round(performance.now()), top: Math.round(sheet.getBoundingClientRect().top - pan), bar: Math.round(bar.getBoundingClientRect().bottom - pan), pan: Math.round(pan), y: Math.round(scrollY) })
      }
      if (window.__track.length < 120) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const again = await record(
    s,
    async () => {
      if (process.env.TAPMODE === "js") await s.p.evaluate(() => document.querySelector("[data-composer=sheet] textarea")?.focus())
      else await s.tap(field.x, field.y)
      await iosKeyboard("[data-composer=sheet] textarea")
    },
    900,
  )
  const track = await s.p.evaluate(() => window.__track)
  /* iOS's reveals that came with the tap (the first keyboard's are not this check's). */
  const revealed = await s.p.evaluate(() => window.__revealed || [])
  const reveals = revealed.filter((r) => Number(r.split("@")[1]) >= (track[0]?.t ?? 0)).length
  const ys = track.map((x) => x.y)
  /* On iOS the sheet is drawn with the page's scroll while the keys are up: a scroll and its putting back is the sheet going up and down. */
  const scrollBump = Math.max(...ys) - Math.min(...ys)
  await frameSheet(again, "composer-again-frames")
  await shot(s, "composer-again-rest")
  const tops = track.map((x) => x.top)
  const moved = Math.max(...tops) - Math.min(...tops)
  const last = track.at(-1)
  results.composer = { open: g, pan1, focused1, sheetTopMoves: moved, last, reveals, scrollBump }
  console.log(`  open ${JSON.stringify(g)}  first pan ${pan1}  title focused on landing ${focused1}`)
  console.log(`  again: sheet top on the screen ranged ${Math.min(...tops)}..${Math.max(...tops)}; last ${JSON.stringify(last)}`)
  console.log(`  iOS scrolled the page to the field ${reveals} time(s); the page's scroll ranged over ${scrollBump}px while it came up`)
  console.log(`  track [top, toolbar foot, pan, scrollY] ${JSON.stringify(track.filter((_, i) => i % 3 === 0).map((x) => [x.top, x.bar, x.pan, x.y]))}`)
  expect(focused1, "the title has the caret once the sheet has landed")
  expect(moved <= 2 && reveals === 0 && scrollBump === 0, "a second tap into the field: the sheet does not move at all (no bump: iOS has no scroll to make, nothing is put back)", { moved, reveals, scrollBump })
  expect(last && last.pan === 0 && Math.abs(last.bar - (844 - keys)) <= 2, "iOS had nothing to pan for, and the toolbar sits on the keys", last)
  /* Cancel: down on the sheet's own close, landing reported. */
  await s.p.evaluate(() => document.activeElement?.blur())
  await s.p.evaluate(() => {
    window.__keys(0)
    window.__panNow = 0
    window.__vvReal()
  })
  await sleep(400)
  await s.p.evaluate(() => (window.__busyNext = 1))
  const shut = await record(s, () => s.p.evaluate(() => document.querySelector("[data-composer-cancel]")?.click()), 1200)
  await frameSheet(shut, "composer-close-frames")
  const gc = gaps(shut)
  results.composer.close = gc
  console.log(`  close ${JSON.stringify(gc)}`)
  expect(g.longestGapMs !== null && g.longestGapMs <= 50 && gc.longestGapMs !== null && gc.longestGapMs <= 50, `the sheet rises and closes with no frame held over 50ms, ${BUSY_MS}ms busy as each starts`, { g, gc })
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  expect(!s.errors.length, "no page errors (composer)", s.errors.slice(0, 3))
  await s.p.close()
}

/*
  ── THE COMMENT BOX ── per platform: a tap on "Write a comment...", the keyboard as it reports it, every frame recorded with
  the keys drawn translucent. Then what is between the box and the keys, and under the keys, read from the screen's pixels:
  nothing of the feed (its pictures) may show there.
*/
async function partComment() {
  console.log(`\nCOMMENT: the box on the keys, per platform (keyboard 380, ${THROTTLE}x CPU)`)
  const cases = [
    { name: "safari", env: "safari", show: (s) => s.p.evaluate(() => window.__vv(0, 464)), pan: 0 },
    { name: "safari-pan", env: "safari", show: (s) => s.p.evaluate(() => { window.__panNow = 120; window.__keys(380, 120); window.__vv(120, 464) }), pan: 120, reported: true },
    { name: "app", env: "app", show: async () => {}, pan: 0 },
    { name: "app-plugin", env: "app-plugin", show: (s) => s.p.evaluate(() => window.__kbShow(380)), early: true, pan: 0 },
    /* 76.jpg's page, moved 391px by a web view that reports nothing: what would come into sight under the fixed box is checked by what paints it (below). */
    { name: "app-overpan", env: "app", show: async () => {}, pan: 0, overpan: 391 },
    { name: "android", env: "android", show: (s) => s.p.setViewport({ width: 390, height: 464, isMobile: true, hasTouch: true, deviceScaleFactor: 1 }), pan: 0, resized: true },
  ]
  results.comment = {}
  const only = process.env.CASES ? process.env.CASES.split(",") : null
  for (const c of cases) {
    if (only && !only.includes(c.name)) continue
    const s = await session({ env: c.env })
    const at = await centerOf(s, PIC)
    await sleep(300)
    await s.tap(at.x, at.y)
    await sleep(1600)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    /* The comments' end in sight (the box sticks to the foot of the post's scroll inside them), then the box's place. */
    await s.p.evaluate(() => {
      const sc = document.querySelector("[data-post-fullscreen] [data-post-overlay-scroll]")
      if (sc) sc.scrollTop = sc.scrollHeight
    })
    await sleep(300)
    const box = await centerOf(s, "[data-post-fullscreen] [data-comments-composer] textarea", false)
    const rec = await record(
      s,
      async () => {
        if (c.early) await c.show(s)
        await s.tap(box.x, box.y)
        if (!c.resized) await s.p.evaluate((pan) => window.__keys(380, pan), c.pan === 391 ? 0 : 0)
        await sleep(250)
        if (!c.early) await c.show(s)
      },
      900,
    )
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    await sleep(300)
    const facts = await s.p.evaluate((pan) => {
      const b = document.querySelector("[data-post-fullscreen] [data-comment-box=comment]")?.getBoundingClientRect()
      const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((x) => x.querySelector("[data-post-fullscreen]"))
      const sr = sheet?.getBoundingClientRect()
      /* On the screen: a reported pan is taken off the layout's numbers; a drawn one (app-overpan) is in them already. */
      const off = window.__panNow && !document.documentElement.style.transform ? window.__panNow : 0
      return { focused: document.activeElement?.tagName, pan, boxLayoutBottom: b ? Math.round(b.bottom) : null, boxBottom: b ? Math.round(b.bottom - off) : null, sheetBottom: sr ? Math.round(sr.bottom - off) : null, typing: document.documentElement.hasAttribute("data-post-typing"), shellHidden: /inset\(/.test(getComputedStyle(document.querySelector("[data-community-shell]")).clipPath) }
    }, c.pan)
    await shot(s, `comment-${c.name}`)
    await frameSheet(rec, `comment-${c.name}-frames`, { cols: 6, max: 30 })
    /*
      THE FEED SHOWING: the feed's pictures are the only saturated colour on these screens (the harness draws them in red,
      green and stripes). Read the screen from the box's foot down: under the translucent keys, a picture would show as a
      saturated pixel; the post sheet itself is white and grey.
    */
    const png = await s.p.screenshot({ encoding: "base64" })
    const seen = await (reader ??= await browser.newPage()).evaluate(
      async (d, fromY) => {
        const img = new Image()
        img.src = `data:image/png;base64,${d}`
        await img.decode()
        const c = document.createElement("canvas")
        c.width = img.width
        c.height = img.height
        const g = c.getContext("2d")
        g.drawImage(img, 0, 0)
        const y0 = Math.max(0, Math.min(img.height - 1, fromY))
        const data = g.getImageData(0, y0, img.width, img.height - y0).data
        let colour = 0
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const gg = data[i + 1]
          const b = data[i + 2]
          if (Math.max(r, gg, b) - Math.min(r, gg, b) > 40) colour++
        }
        return colour
      },
      png,
      (facts.boxLayoutBottom ?? 600) + 2,
    )
    await s.p.bringToFront()
    /*
      UNDER THE FIXED BOX (app-overpan). Nothing a screen in this harness can draw is below the fixed box's foot, so what
      would paint there is read: the sheet's own skirt (a solid copy of it one sheet tall, below its foot), the page's ground,
      and the community not painted at all.
    */
    if (c.overpan) {
      const under = await s.p.evaluate(() => {
        const sheet = [...document.querySelectorAll("[data-mobile-bottom-sheet]")].find((x) => x.querySelector("[data-post-fullscreen]"))
        const cs = sheet ? getComputedStyle(sheet) : null
        const h = sheet ? Math.round(sheet.getBoundingClientRect().height) : 0
        return {
          skirt: !!cs && new RegExp(`rgb\\(255, 255, 255\\) 0px ${h}px 0px 0px`).test(cs.boxShadow),
          sheetHeight: h,
          htmlGround: getComputedStyle(document.documentElement).backgroundColor,
          bodyGround: getComputedStyle(document.body).backgroundColor,
          shell: getComputedStyle(document.querySelector("[data-community-shell]")).clipPath,
        }
      })
      results.comment[`${c.name}-under`] = under
      console.log(`  ${c.name}: under the fixed box ${JSON.stringify(under)}`)
      expect(under.skirt && under.sheetHeight >= c.overpan && /255, 255, 255/.test(under.htmlGround) && /255, 255, 255/.test(under.bodyGround) && /inset\(/.test(under.shell), `${c.name}: a page moved ${c.overpan}px further than reported shows only white under the box: the sheet's skirt (${under.sheetHeight}px), a white ground, the community unpainted`, under)
    }
    const verdict = gaps(rec)
    results.comment[c.name] = { ...facts, colourPixelsBelowBox: seen }
    const keysTop = c.resized ? 464 : 464
    console.log(`  ${c.name}: ${JSON.stringify(facts)}  coloured pixels below the box ${seen}  ${JSON.stringify(verdict)}`)
    expect(facts.typing && facts.shellHidden, `${c.name}: typed in, nothing of the community is painted under the post`, facts)
    expect(seen === 0, `${c.name}: between the box and the keys, and under the keys, no pixel of the feed`, { seen })
    expect(facts.boxBottom !== null && Math.abs(facts.boxBottom - keysTop) <= 12, `${c.name}: the box sits on the keys (its foot within 12px of ${keysTop} on the screen)`, facts)
    expect(!s.errors.length, `no page errors (comment ${c.name})`, s.errors.slice(0, 3))
    await s.p.close()
  }
}

/* ── A COMPUTER ── 1440x900, a mouse: the post opens as the centred panel it was, never the phone's sheet. */
async function partDesktop() {
  console.log("\nCOMPUTER: 1440x900, the post's panel")
  const p = await browser.newPage()
  current = p
  p.setDefaultTimeout(180000)
  await p.setViewport({ width: 1440, height: 900 })
  const errors = []
  p.on("pageerror", (e) => errors.push(String(e.stack || e).slice(0, 300)))
  await p.setRequestInterception(true)
  p.on("request", (r) => {
    const url = r.url()
    if (url.startsWith(`${ORIGIN}/api/`)) return void r.respond({ status: 200, contentType: "application/json", body: "{}" })
    if (url.startsWith(`${ORIGIN}/`)) return void r.respond({ status: 200, contentType: "text/html", body: html })
    if (url.startsWith("data:")) return void r.continue()
    return void r.respond({ status: 204, body: "" })
  })
  await p.evaluateOnNewDocument(PAGE_HOOKS, BUSY_MS)
  await p.goto(`${ORIGIN}/community/clay-studio`, { waitUntil: "load" })
  await sleep(1500)
  const at = await p.evaluate((q) => {
    const el = document.querySelector(q)
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: r.left + 60, y: r.top + r.height / 2 }
  }, PIC)
  await p.mouse.click(at.x, at.y)
  await sleep(1200)
  const facts = await p.evaluate(() => {
    const panel = document.querySelector('[data-post-overlay="panel"]')
    const r = panel?.getBoundingClientRect()
    return { panel: !!panel, sheet: !!document.querySelector("[data-post-fullscreen]"), left: r ? Math.round(r.left) : null, right: r ? Math.round(document.querySelector("[data-post-overlay-root]").getBoundingClientRect().right - r.right) : null, width: r ? Math.round(r.width) : null }
  })
  await p.screenshot({ path: join(shots, `${LABEL}-desktop-post.png`) })
  console.log(`  ${JSON.stringify(facts)}`)
  expect(facts.panel && !facts.sheet && Math.abs(facts.left - facts.right) <= 2, "a computer opens the centred panel, not the phone's sheet", facts)
  expect(!errors.length, "no page errors (computer)", errors.slice(0, 3))
  await p.close()
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()
  if (process.env.KEEP_BUNDLE) writeFileSync(join(stubs, "page.html"), html)
  if (PART === "all" || PART === "open") await partOpen()
  if (PART === "all" || PART === "pull") await partPull()
  if (PART === "all" || PART === "composer") await partComposer()
  if (PART === "all" || PART === "comment") await partComment()
  if (PART === "all" || PART === "desktop") await partDesktop()
} finally {
  if (!process.env.KEEP_BUNDLE) rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
writeFileSync(join(shots, `${LABEL}-results.json`), JSON.stringify(results, null, 2))
console.log(`\n  frames and screenshots in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
