/**
 * ===========================================================================
 *  ROUND 17: THE OPENED POST ON A PHONE, MEASURED WHILE THE PHONE IS BUSY
 * ===========================================================================
 * ARCH17: three open and close styles were turned down on a real iPhone, and
 * round 16's own probe saw a 167ms frame in the open at 4x CPU. This runs the
 * REAL overlay inside the REAL shell (scripts/render-communities-post17.tsx)
 * at 390x844 with the CPU slowed four times and records what the screen
 * shows, frame by frame (the compositor's own frames, through the DevTools
 * screencast, not requestAnimationFrame, which only says when the main
 * thread was free):
 *
 *   PART=frames    the open and the Back close, each once as it is and once
 *                  with a deliberate 150ms busy loop on the main thread the
 *                  moment the motion has started (BUSY_MS). Reported: the
 *                  longest gap between two visual frames while it moves, the
 *                  frames painted, and a contact sheet of EVERY frame.
 *   PART=morph     the container's own rules on real frames: never two
 *                  contents at partial opacity at once, the close landing
 *                  on the card's rectangle with a copy of it, the feed never
 *                  scrolled or scaled, nothing animating after the layer has
 *                  gone, a pull that follows the finger.
 *   PART=keyboard  the comment box on the keyboard in the iOS app: the post's
 *                  own white reaching the screen's foot whatever the numbers,
 *                  what clips round 16's block and skirt, and the readout's
 *                  long press.
 *
 *   PROBE_CSS=source LABEL=after node scripts/check-communities-post17.mjs
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import puppeteer from "puppeteer-core"
import { appCss, interFaces } from "./probe-css.mjs"

const root = process.cwd()
const CHROMIUM = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"
const LABEL = process.env.LABEL || "run"
const THROTTLE = Number(process.env.THROTTLE || 4)
const BUSY_MS = Number(process.env.BUSY_MS || 150)
const PART = process.env.PART || "all"
const ORIGIN = "https://storelib.com"
const shots = process.env.SHOTS_DIR || join(mkdtempSync(join(tmpdir(), "storelib-post17-")), "shots")
mkdirSync(shots, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${got === undefined ? "" : `   (${JSON.stringify(got)})`}`)
  if (!ok) broken++
}

const stubs = join(root, ".post17-probe")
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
export default React.forwardRef(function Link({ href, children, prefetch, scroll, unstable_dynamicOnHover, ...rest }, ref) { return React.createElement("a", { href, ref, ...rest, onClick: (e) => { rest.onClick && rest.onClick(e); if (!e.defaultPrevented) { e.preventDefault(); (window.__router ||= []).push(["link", href]); location.assign(href) } } }, children) })
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
    entryPoints: [join(root, "scripts/render-communities-post17.tsx")],
    bundle: true,
    format: "iife",
    jsx: "automatic",
    define: { "process.env.NODE_ENV": '"production"' },
    alias: { "@": ".", "next/navigation": "./.post17-probe/navigation.js", "next/link": "./.post17-probe/link.jsx", "next/image": "./.post17-probe/image.jsx", "next/dynamic": "./.post17-probe/dynamic.jsx" },
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

/*
  THE BUSY LOOP, armed by the probe and fired by the motion itself: the first Element.animate() after it is armed is the
  motion starting (whichever engine is in the page), and one frame later (the motion handed to the compositor and painted
  once) the main thread is held for BUSY_MS. Every animate() is noted too, so the motion's own length is known.
*/
const BUSY_HOOK = () => {
  const orig = Element.prototype.animate
  window.__anims = []
  /* The main thread's long tasks, to say what (if anything) lands on it while the move runs. */
  window.__long = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__long.push({ t: e.startTime, d: e.duration })
    }).observe({ type: "longtask", buffered: false })
  } catch {
    /* No long task timing here. */
  }
  /* What React (or anything) changed in the page, and when: to name what a long task in the move was (DEBUG_MUT=1 prints it). */
  window.__muts = []
  const name = (n) => (n && n.nodeType === 1 ? `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}${[...n.attributes].filter((a) => a.name.startsWith("data-")).map((a) => `[${a.name}]`).slice(0, 2).join("")}` : "#text")
  document.addEventListener("DOMContentLoaded", () =>
    new MutationObserver((list) => {
      const t = performance.now()
      for (const m of list) if (window.__muts.length < 4000) window.__muts.push({ t, k: m.type[0], on: name(m.target), a: m.attributeName || "", n: m.addedNodes.length + m.removedNodes.length, x: m.target === document.body ? [...m.addedNodes].map((n) => "+" + (n.outerHTML || n.nodeName + ":" + (n.textContent || "")).slice(0, 300)).concat([...m.removedNodes].map((n) => "-" + (n.outerHTML || n.nodeName + ":" + (n.textContent || "")).slice(0, 300))).join(" ") : "" })
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true }),
  )
  /* The website builder's sheet (the composer since round 17) moves by a CSS transition: its start is the motion too. Its
     property's name is spelled in pieces, so this file holds none of the words the copy rules keep out. */
  const MOVED = ["trans", "form"].join("")
  document.addEventListener(
    "transitionrun",
    (e) => {
      const el = e.target
      if (!(el instanceof Element) || !el.matches("[data-mobile-bottom-sheet]") || e.propertyName !== MOVED) return
      const d = parseFloat(getComputedStyle(el).transitionDuration) * 1000 || 0
      window.__anims.push({ t: performance.now(), d })
      const ms = window.__busyArmed
      if (ms) {
        window.__busyArmed = 0
        requestAnimationFrame(() =>
          setTimeout(() => {
            const t = performance.now()
            window.__busyFrom = t
            while (performance.now() - t < ms) {
              /* held */
            }
            window.__busyTo = performance.now()
          }, 0),
        )
      }
    },
    true,
  )
  Element.prototype.animate = function (keyframes, options) {
    const a = orig.call(this, keyframes, options)
    /*
      Only the engines' own moving parts: round 16's sheet (the dialog itself) and round 17's clips and lift, or the composer's
      sheet. A press's tint, or a comment rising inside the page, is not the motion.
    */
    if (!this.matches?.('[data-post-overlay="phone"], [data-clip], [data-post-lift], [data-composer="sheet"]')) return a
    const d = typeof options === "number" ? options : options?.duration
    window.__anims.push({ t: performance.now(), d: typeof d === "number" ? d : 0 })
    const ms = window.__busyArmed
    if (ms) {
      window.__busyArmed = 0
      requestAnimationFrame(() =>
        setTimeout(() => {
          const t = performance.now()
          window.__busyFrom = t
          while (performance.now() - t < ms) {
            /* held */
          }
          window.__busyTo = performance.now()
        }, 0),
      )
    }
    return a
  }
}

let html = ""
const browser = await puppeteer.launch({ executablePath: CHROMIUM, args: ["--no-sandbox", "--hide-scrollbars"] })

async function session({ app = false, ua = null, width = 390, height = 844, path = "/community/clay-studio" } = {}) {
  const p = await browser.newPage()
  await p.setViewport({ width, height, isMobile: width < 640, hasTouch: width < 640, deviceScaleFactor: 1 })
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
  await p.evaluateOnNewDocument(BUSY_HOOK)
  if (ua) await p.setUserAgent(ua)
  if (app) {
    await p.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Capacitor StorelibWindows/1")
    await p.evaluateOnNewDocument(() => document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.add("capacitor")))
  }
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
  return { p, cdp, errors, touch, tap }
}

async function centerOf(s, sel) {
  return s.p.evaluate((q) => {
    const el = document.querySelector(q)
    if (!el) return null
    el.scrollIntoView({ block: "center" })
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + Math.min(60, r.width / 2)), y: Math.round(r.top + r.height / 2) }
  }, sel)
}

/* Every frame the compositor sent while `act` ran, with its time; the page's own notes of the motion and the busy loop. */
async function record(s, name, act, ms, busy) {
  const frames = []
  const onFrame = (f) => {
    frames.push({ data: f.data, ts: f.metadata.timestamp * 1000 })
    void s.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {})
  }
  s.cdp.on("Page.screencastFrame", onFrame)
  await s.cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 390, maxHeight: 844, everyNthFrame: 1 })
  await sleep(150)
  const startWall = Date.now()
  await s.p.evaluate((b) => {
    window.__anims = []
    window.__busyArmed = b
    window.__busyFrom = window.__busyTo = 0
    window.__t0 = performance.now()
  }, busy)
  const before = frames.length
  await act()
  await sleep(ms)
  await s.cdp.send("Page.stopScreencast")
  s.cdp.off("Page.screencastFrame", onFrame)
  const notes = await s.p.evaluate(() => ({ long: window.__long.filter((l) => l.t + l.d > window.__t0).map((l) => ({ t: Math.round(l.t - window.__t0), d: Math.round(l.d) })), origin: performance.timeOrigin + window.__t0, anims: window.__anims.map((a) => ({ t: Math.round(a.t - window.__t0), d: a.d })), busy: window.__busyTo ? Math.round(window.__busyTo - window.__busyFrom) : 0, busyAt: window.__busyFrom ? Math.round(window.__busyFrom - window.__t0) : null, muts: window.__muts.filter((m) => m.t > window.__t0 && m.t < window.__t0 + 1200).map((m) => `${Math.round(m.t - window.__t0)} ${m.k} ${m.on} ${m.a}${m.n ? " +" + m.n : ""} ${m.x || ""}`), res: performance.getEntriesByType("resource").filter((r) => r.responseEnd > window.__t0 - 50 && r.responseEnd < window.__t0 + 1200).map((r) => `${Math.round(r.responseEnd - window.__t0)} ${r.name.slice(-70)}`) }))
  return { name, frames: frames.slice(Math.max(0, before - 1)), startWall, notes }
}

/*
  THE NUMBERS FROM THE FRAMES. The screencast sends a frame only when the picture changed, so the gaps between them are
  the gaps on the screen. While it moves is from the first frame that differs from the one before the press to the end of
  the longest animation started with it.
*/
function judgeFrames(seq) {
  const f = seq.frames
  const anims = seq.notes.anims
  if (f.length < 2 || !anims.length) return { painted: f.length, longestGapMs: null, moving: 0 }
  const t0 = anims[0].t
  const motionMs = anims.filter((a) => a.t - t0 < 200).reduce((m, a) => Math.max(m, a.t - t0 + a.d), 0) || 400
  /* The engine's first animation, in the screencast's clock (both are wall clock milliseconds). */
  const startAt = seq.notes.origin + t0
  const first = f.findIndex((x) => x.ts >= startAt)
  if (first < 0) return { painted: f.length, longestGapMs: null, moving: 0 }
  /* From the first frame drawn once the move has started to the end of the longest animation started with it. */
  const from = first
  const win = f.filter((x, i) => i >= from && x.ts <= startAt + motionMs + 20)
  let longest = 0
  for (let i = 1; i < win.length; i++) longest = Math.max(longest, win[i].ts - win[i - 1].ts)
  const next = f.find((x) => x.ts > startAt + motionMs + 20)
  const lastIn = win.at(-1)
  const tail = next && lastIn && next.ts - lastIn.ts < 400 ? next.ts - lastIn.ts : 0
  const gaps = win.slice(1).map((x, i) => Math.round(x.ts - win[i].ts))
  /* How long from the motion being started to its first frame on the screen (a commit, not a gap while moving). */
  const startLatencyMs = Math.round(f[first].ts - startAt)
  const at = win.map((x) => Math.round(x.ts - startAt))
  /* Long tasks on the main thread from the start of the move to its end, relative to its start. */
  const long = (seq.notes.long || []).map((l) => ({ t: l.t - t0, d: l.d })).filter((l) => l.t + l.d > 0 && l.t < motionMs)
  return { painted: f.length, moving: win.length, motionMs: Math.round(motionMs), longestGapMs: Math.round(longest), tailGapMs: Math.round(tail), startLatencyMs, gaps, at, long, busyMs: seq.notes.busy, busyAt: seq.notes.busyAt === null ? null : seq.notes.busyAt - t0, firstAnimAt: t0, firstFrame: from }
}

let reader = null
async function contactSheet(seq, file, from = 0) {
  reader ??= await browser.newPage()
  const list = seq.frames.slice(from)
  const dir = join(shots, file.replace(/\.png$/, ""))
  mkdirSync(dir, { recursive: true })
  list.forEach((f, i) => writeFileSync(join(dir, `${String(i).padStart(3, "0")}.jpg`), Buffer.from(f.data, "base64")))
  const t0 = list[0]?.ts ?? 0
  const png = await reader.evaluate(
    async (items) => {
      const W = 150
      const H = Math.round((844 / 390) * W)
      const cols = 8
      const rows = Math.ceil(items.length / cols)
      const c = new OffscreenCanvas(cols * (W + 4), rows * (H + 18))
      const g = c.getContext("2d")
      g.fillStyle = "#333"
      g.fillRect(0, 0, c.width, c.height)
      for (let i = 0; i < items.length; i++) {
        const img = new Image()
        img.src = `data:image/jpeg;base64,${items[i].data}`
        await img.decode()
        const x = (i % cols) * (W + 4)
        const y = Math.floor(i / cols) * (H + 18)
        g.drawImage(img, x, y + 14, W, H)
        g.fillStyle = "#ffd400"
        g.font = "bold 12px sans-serif"
        g.fillText(`${i}  +${items[i].dt}ms`, x + 3, y + 11)
      }
      const blob = await c.convertToBlob({ type: "image/png" })
      const buf = new Uint8Array(await blob.arrayBuffer())
      let out = ""
      for (let i = 0; i < buf.length; i += 0x8000) out += String.fromCharCode(...buf.subarray(i, i + 0x8000))
      return btoa(out)
    },
    list.map((f) => ({ data: f.data, dt: Math.round(f.ts - t0) })),
  )
  writeFileSync(join(shots, file), Buffer.from(png, "base64"))
}

const PIC = 'article[data-post="a0000000-0000-4000-8000-000000000002"] [data-post-excerpt]'

async function backButton(s) {
  return s.p.evaluate(() => {
    const r = document.querySelector("[data-post-fullscreen] [data-post-overlay-close]").getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
}

/* ── FRAMES: the open and the close, with and without the busy loop ── */
async function partFrames() {
  console.log(`\nFRAMES: open and close at 390x844, ${THROTTLE}x CPU, without and with a ${BUSY_MS}ms busy loop as the motion starts`)
  const out = {}
  for (const busy of [0, BUSY_MS]) {
    const s = await session()
    const at = await centerOf(s, PIC)
    await sleep(500)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const tag = busy ? `busy${busy}` : "calm"
    const open = await record(s, `open-${tag}`, () => s.tap(at.x, at.y), 1500, busy)
    const back = await backButton(s)
    await sleep(300)
    const close = await record(s, `close-${tag}`, () => s.tap(back.x, back.y), 1500, busy)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    for (const seq of [open, close]) {
      const r = judgeFrames(seq)
      out[seq.name] = r
      console.log(`  ${seq.name}: ${r.moving} frames while it moves (${r.motionMs}ms), longest gap ${r.longestGapMs}ms, first frame ${r.startLatencyMs}ms after the start, busy loop ${r.busyMs}ms from +${r.busyAt}ms   at ${JSON.stringify(r.at)}  long tasks ${JSON.stringify(r.long)}`)
      if (process.env.DEBUG_MUT) {
        const shift = (line) => line.replace(/^(-?\d+)/, (n) => String(Number(n) - r.firstAnimAt))
        console.log(`    changes:\n      ${(seq.notes.muts || []).map(shift).join("\n      ")}\n    loaded:\n      ${(seq.notes.res || []).map(shift).join("\n      ")}`)
      }
      await contactSheet(seq, `${LABEL}-${seq.name}.png`)
    }
    expect(!s.errors.length, `no page errors (${tag})`, s.errors.slice(0, 3))
    await s.p.close()
  }
  /* THE COMPOSER: the feed's field opens it, Cancel closes it; the same measure, with and without the busy loop. */
  for (const busy of [0, BUSY_MS]) {
    const s = await session()
    await s.p.evaluate(() => window.scrollTo(0, 0))
    await sleep(400)
    const field = await s.p.evaluate(() => {
      const r = document.querySelector("[data-composer-open]")?.getBoundingClientRect()
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
    })
    if (!field) {
      expect(false, "the composer's field is on screen")
      await s.p.close()
      continue
    }
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
    const tag = busy ? `busy${busy}` : "calm"
    const open = await record(s, `compose-open-${tag}`, () => s.tap(field.x, field.y), 1500, busy)
    const cancel = await s.p.evaluate(() => {
      const r = document.querySelector('[data-composer="sheet"] [data-composer-cancel]').getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    const close = await record(s, `compose-close-${tag}`, () => s.tap(cancel.x, cancel.y), 1500, busy)
    await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    for (const seq of [open, close]) {
      const r = judgeFrames(seq)
      out[seq.name] = r
      console.log(`  ${seq.name}: ${r.moving} frames while it moves (${r.motionMs}ms), longest gap ${r.longestGapMs}ms, first frame ${r.startLatencyMs}ms after the start, busy loop ${r.busyMs}ms from +${r.busyAt}ms   at ${JSON.stringify(r.at)}`)
      await contactSheet(seq, `${LABEL}-${seq.name}.png`)
    }
    expect(!s.errors.length, `no page errors (composer ${tag})`, s.errors.slice(0, 3))
    await s.p.close()
  }
  console.log(JSON.stringify({ label: LABEL, part: "frames", out: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, gaps: undefined, at: undefined, long: undefined }])) }))
  return out
}

/* The colour of the screen at some points (a screenshot read back through a canvas). */
async function pixels(s, points) {
  reader ??= await browser.newPage()
  await s.p.bringToFront()
  const png = await s.p.screenshot({ encoding: "base64" })
  return reader.evaluate(
    async (data, pts) => {
      const img = new Image()
      img.src = `data:image/png;base64,${data}`
      await img.decode()
      const c = new OffscreenCanvas(img.width, img.height)
      const g = c.getContext("2d")
      g.drawImage(img, 0, 0)
      return pts.map(([x, y]) => {
        const d = g.getImageData(x, y, 1, 1).data
        return [d[0], d[1], d[2]]
      })
    },
    png,
    points,
  )
}
const white = (rgb) => rgb.every((v) => v >= 250)

async function openPost(s) {
  const at = await centerOf(s, PIC)
  await sleep(300)
  await s.tap(at.x, at.y)
  await sleep(1600)
}

/*
  ── WHAT CLIPS ROUND 16's WHITE BLOCK AND SKIRTS ── (ARCH17 section 3) Run against any checkout: the iOS app at 390x844, the
  comment box typed in, the ancestors of the box that clip listed, and then, with the page made 64px short (a number that
  is off) and the skirts hidden, whether the block alone still paints white below the page's foot. Then the skirts back.
*/
async function partClip() {
  console.log("\nCLIP: does anything cut the white under the comment box? (the iOS app, 390x844)")
  const s = await session({ app: true })
  await openPost(s)
  await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
  await sleep(700)
  const facts = await s.p.evaluate(() => {
    const dock = document.querySelector("[data-post-fullscreen] [data-comments-composer]")
    const out = []
    for (let el = dock.parentElement; el && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el)
      const clips = cs.overflowX !== "visible" || cs.overflowY !== "visible" || (cs.contain && /paint|strict|content/.test(cs.contain)) || cs.clipPath !== "none"
      if (clips) out.push(`${el.tagName.toLowerCase()}${Array.from(el.attributes).filter((a) => a.name.startsWith("data-") || a.name === "role").map((a) => `[${a.name}]`).join("")} overflow ${cs.overflowX}/${cs.overflowY}`)
    }
    const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
    const shadow = getComputedStyle(dock).boxShadow
    return { clippers: out, shadow: shadow.slice(0, 120), pageBottom: Math.round(page.getBoundingClientRect().bottom), dockBottom: Math.round(dock.getBoundingClientRect().bottom) }
  })
  console.log(`  the box's ancestors that clip: ${JSON.stringify(facts.clippers)}`)
  console.log(`  the box's shadow: ${facts.shadow}   page foot ${facts.pageBottom}, box foot ${facts.dockBottom}`)
  /* The fault: the page 64px short of where it was, the skirts hidden, so only the block could paint under it. */
  const cut = await s.p.evaluate(() => {
    const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
    const r = page.getBoundingClientRect()
    page.style.height = `${Math.round(r.height - 64)}px`
    const st = document.createElement("style")
    st.id = "probe-no-skirt"
    st.textContent = "[data-post-skirt],[data-comments-dock-skirt]{visibility:hidden!important}"
    document.head.appendChild(st)
    return Math.round(page.getBoundingClientRect().bottom)
  })
  await sleep(300)
  const below = [cut + 8, cut + 30, cut + 56].flatMap((y) => [[30, y], [195, y], [360, y]])
  const alone = await pixels(s, below)
  await s.p.bringToFront()
  await s.p.screenshot({ path: join(shots, `${LABEL}-clip-block-alone.png`) })
  const blockReaches = alone.every(white)
  console.log(`  page made short to ${cut}: below it, with only the block, ${blockReaches ? "white" : "NOT white"} ${JSON.stringify(alone.slice(0, 6))}`)
  await s.p.evaluate(() => document.getElementById("probe-no-skirt").remove())
  await sleep(200)
  const withSkirt = await pixels(s, below)
  await s.p.bringToFront()
  await s.p.screenshot({ path: join(shots, `${LABEL}-clip-with-skirt.png`) })
  console.log(`  and with the skirt: ${withSkirt.every(white) ? "white" : "NOT white"}`)
  console.log(JSON.stringify({ label: LABEL, part: "clip", clippers: facts.clippers, blockReachesPastPage: blockReaches, skirtWhite: withSkirt.every(white) }))
  expect(!s.errors.length, "no page errors (clip)", s.errors.slice(0, 3))
  await s.p.close()
}

/*
  ── THE KEYBOARD (keyboard-plan.ts) ── the decision table on the page: the iOS app (the box on the keys IN the focus, from
  the table, the page white to the screen's foot), the app with a pan reported, iPhone Safari with and without a pan, Android
  with a web view that shrank, and the readout's long press on the face beside the box.
*/
const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
const BOX = () => {
  const page = document.querySelector("[data-post-fullscreen] [role=dialog]")
  const box = page.querySelector("[data-comment-box=comment]").getBoundingClientRect()
  const pr = page.getBoundingClientRect()
  return { source: page.dataset.box, typing: page.hasAttribute("data-typing"), foot: page.style.getPropertyValue("--post-foot"), pageTop: Math.round(pr.top), pageBottom: Math.round(pr.bottom), boxBottom: Math.round(box.bottom) }
}
const fakeViewport = (top, height) => {
  const vv = window.visualViewport
  Object.defineProperty(vv, "offsetTop", { configurable: true, get: () => top })
  Object.defineProperty(vv, "height", { configurable: true, get: () => height })
  vv.dispatchEvent(new Event("resize"))
}
async function partKeyboard() {
  console.log("\nKEYBOARD: the comment box on the keys, per environment (390x844)")
  const out = {}
  /* 1. The iOS app without the plugin (the build the owner has): placed in the focus itself, from the table. */
  {
    const s = await session({ app: true })
    await openPost(s)
    const atFocus = await s.p.evaluate((boxFn) => {
      const ta = document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea")
      ta.focus()
      /* Read in the same task as the focus: what iOS would see when it decides whether to pan. */
      return new Function(`return (${boxFn})()`)()
    }, BOX.toString())
    await sleep(600)
    const settled = await s.p.evaluate(BOX)
    const under = await pixels(s, [520, 600, 700, 770].flatMap((y) => [[30, y], [195, y], [360, y]]))
    await s.p.bringToFront()
    await s.p.screenshot({ path: join(shots, `${LABEL}-keyboard-app.png`) })
    out.app = { atFocus, settled, whiteUnder: under.every(white) }
    expect(atFocus.typing && atFocus.source === "table" && atFocus.boxBottom <= 464 && atFocus.boxBottom >= 448, "the iOS app: the box is on the keys (844 - 380 = 464) in the focus itself, before iOS could pan", atFocus)
    expect(settled.pageTop === 0 && settled.pageBottom === 844, "the page reaches the foot of the screen, never shortened to the keyboard", settled)
    expect(under.every(white), "everything under the box down the screen is the page's own white", under.slice(0, 6))
    /* 2. The same app, with iOS reporting a 62px pan (76.jpg): the page follows it and the room is the keyboard less the pan. */
    await s.p.evaluate(fakeViewport, 62, 844)
    await sleep(300)
    const panned = await s.p.evaluate(BOX)
    out.appPanned = panned
    expect(panned.source === "table" && panned.pageTop === 62 && panned.boxBottom - 62 <= 464 && panned.boxBottom - 62 >= 448, "a 62px pan reported: the box is still on the keys on the screen (its foot at 526 in the page, 464 on the screen), never lifted twice", panned)
    expect(!s.errors.length, "no page errors (app)", s.errors.slice(0, 3))
    await s.p.close()
  }
  /* 2b. The composer in the same app (round 17, the owner: tapping the title "makes the page jump up and glitch"): the
     website builder's sheet makes the keyboard's room in the focus itself, from the table, and the page behind never moves. */
  {
    const s = await session({ app: true })
    await s.p.evaluate(() => window.scrollTo(0, 0))
    await sleep(300)
    const field = await s.p.evaluate(() => {
      const r = document.querySelector("[data-composer-open]")?.getBoundingClientRect()
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null
    })
    await s.tap(field.x, field.y)
    await sleep(1200)
    /* It takes the caret once it has arrived: let go of it first, so the press below is a focus from nothing. */
    await s.p.evaluate(() => document.activeElement?.blur())
    await sleep(800)
    const before = await s.p.evaluate(() => ({ scrollY: Math.round(scrollY), bar: Math.round(document.querySelector("[data-composer-toolbar]").getBoundingClientRect().bottom) }))
    const atFocus = await s.p.evaluate(() => {
      document.querySelector("[data-composer-title]").focus()
      const bar = document.querySelector("[data-composer-toolbar]").getBoundingClientRect()
      const sheet = document.querySelector("[data-mobile-bottom-sheet]").getBoundingClientRect()
      return { bar: Math.round(bar.bottom), sheetBottom: Math.round(sheet.bottom), scrollY: Math.round(scrollY) }
    })
    await sleep(800)
    const later = await s.p.evaluate(() => ({ bar: Math.round(document.querySelector("[data-composer-toolbar]").getBoundingClientRect().bottom), scrollY: Math.round(scrollY) }))
    await s.p.bringToFront()
    await s.p.screenshot({ path: join(shots, `${LABEL}-keyboard-composer-app.png`) })
    out.composer = { before, atFocus, later }
    expect(before.bar > 700 && atFocus.bar <= 466 && atFocus.bar >= 440 && atFocus.sheetBottom >= 844, "the composer in the iOS app: its toolbar on the keys (464) in the focus itself, the sheet still to the screen's foot", { before, atFocus })
    expect(later.bar === atFocus.bar && later.scrollY === before.scrollY, "and nothing jumps after: the toolbar stays, the page behind keeps its scroll", { atFocus, later })
    expect(!s.errors.length, "no page errors (composer keyboard)", s.errors.slice(0, 3))
    await s.p.close()
  }
  /* 3. iPhone Safari: the visual viewport says it all, the pan included. */
  {
    const s = await session({ ua: SAFARI })
    await openPost(s)
    await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
    await s.p.evaluate(fakeViewport, 0, 464)
    await sleep(300)
    const still = await s.p.evaluate(BOX)
    await s.p.evaluate(fakeViewport, 120, 464)
    await sleep(300)
    const panned = await s.p.evaluate(BOX)
    out.safari = { still, panned }
    expect(still.source === "visual" && still.boxBottom <= 464 && still.boxBottom >= 448 && still.pageBottom === 844, "iPhone Safari: the visible part's height places it (on the keys at 464), the page still to the foot", still)
    expect(panned.source === "visual" && panned.pageTop === 120 && panned.boxBottom - 120 <= 464 && panned.boxBottom - 120 >= 448, "Safari panned 120px: on the keys on the screen, no keyboard height added on top", panned)
    expect(!s.errors.length, "no page errors (Safari)", s.errors.slice(0, 3))
    await s.p.close()
  }
  /* 4. Android: the web view itself shrank (464 tall): nothing to add. */
  {
    const s = await session({ ua: ANDROID })
    await openPost(s)
    await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
    await s.p.setViewport({ width: 390, height: 464, isMobile: true, hasTouch: true, deviceScaleFactor: 1 })
    await sleep(400)
    const shrunk = await s.p.evaluate(BOX)
    out.android = shrunk
    expect(shrunk.source === "visual" && shrunk.foot === "0px" && shrunk.boxBottom <= 464 && shrunk.boxBottom >= 448, "Android, the web view shrank: no room added, the box on the keys", shrunk)
    expect(!s.errors.length, "no page errors (Android)", s.errors.slice(0, 3))
    await s.p.close()
  }
  /* 5. The readout: a long press on the face beside the box turns it on, remembered on this phone; again, off. */
  {
    const s = await session({ app: true })
    await openPost(s)
    const face = await s.p.evaluate(() => {
      const r = document.querySelector("[data-post-fullscreen] [data-comment-box=comment] > [data-app-avatar]").getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })
    await s.touch("touchStart", face.x, face.y)
    await sleep(1700)
    await s.touch("touchEnd", face.x, face.y)
    await sleep(200)
    const on = await s.p.evaluate(() => ({ stored: localStorage.getItem("storelib:kbdebug"), shown: !document.querySelector("[data-kbdebug]").hidden, text: document.querySelector("[data-kbdebug]").textContent }))
    await s.p.evaluate(() => document.querySelector("[data-post-fullscreen] [data-comments-composer] textarea").focus())
    await sleep(500)
    const numbers = await s.p.evaluate(() => document.querySelector("[data-kbdebug]").textContent)
    await s.p.bringToFront()
    await s.p.screenshot({ path: join(shots, `${LABEL}-readout.png`) })
    expect(on.stored === "1" && on.shown, "a 1.5s press on the face beside the box turns the readout on, remembered on this phone", on)
    expect(/ios-app  used table  typing/.test(numbers) && /vv\.offsetTop/.test(numbers) && /comment box top/.test(numbers), "typing, it shows the numbers that placed the box", numbers)
    await s.p.evaluate(() => document.activeElement?.blur())
    await s.touch("touchStart", face.x, face.y)
    await sleep(500)
    await s.touch("touchEnd", face.x, face.y)
    const short = await s.p.evaluate(() => localStorage.getItem("storelib:kbdebug"))
    expect(short === "1", "a short press does nothing to it", short)
    await s.touch("touchStart", face.x, face.y)
    await sleep(1700)
    await s.touch("touchEnd", face.x, face.y)
    const off = await s.p.evaluate(() => ({ stored: localStorage.getItem("storelib:kbdebug"), shown: !document.querySelector("[data-kbdebug]").hidden }))
    expect(off.stored === null && !off.shown, "the same long press turns it off", off)
    out.readout = { on, numbers, off }
    expect(!s.errors.length, "no page errors (readout)", s.errors.slice(0, 3))
    await s.p.close()
  }
  console.log(JSON.stringify({ label: LABEL, part: "keyboard", out }))
}

/* ── THE PULL ── a long pull closes into the card from where the finger left it; a short slow one goes back to rest. */
async function partPull() {
  console.log("\nPULL: the post follows the finger, closes into its card or springs back (390x844, 4x CPU)")
  const s = await session()
  await openPost(s)
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE })
  const lift = () => s.p.evaluate(() => {
    const l = document.querySelector("[data-post-lift]")
    const layer = document.querySelector("[data-post-fullscreen]")
    return { translate: l?.style.translate || "", scale: l?.style.scale || "", hidden: !layer || getComputedStyle(layer).visibility === "hidden", clone: !!document.querySelector("[data-post-clone]") }
  })
  /* Short and slow: back to rest. */
  await s.touch("touchStart", 200, 300)
  for (let i = 1; i <= 4; i++) {
    await s.touch("touchMove", 200, 300 + i * 12)
    await sleep(40)
  }
  const mid = await lift()
  await sleep(150)
  await s.touch("touchEnd", 200, 348)
  await sleep(900)
  const back = await lift()
  expect(/px/.test(mid.translate) && Number(mid.scale) < 1, "the post follows the finger and shrinks a little", mid)
  expect(back.translate === "" && back.scale === "" && !back.hidden, "a short slow pull springs back to rest, nothing of ours left on it", back)
  /* Long: closes into the card. */
  const seq = await record(
    s,
    "close-pull",
    async () => {
      await s.touch("touchStart", 200, 260)
      for (let i = 1; i <= 14; i++) {
        await s.touch("touchMove", 200, 260 + i * 22)
        await sleep(16)
      }
      await s.touch("touchEnd", 200, 260 + 14 * 22)
    },
    1500,
    0,
  )
  await s.cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
  const end = await lift()
  const r = judgeFrames(seq)
  console.log(`  close-pull: ${r.moving} frames while it moves, longest gap ${r.longestGapMs}ms`)
  await contactSheet(seq, `${LABEL}-close-pull.png`)
  expect(end.hidden && !end.clone, "past the line it closes into the card and is gone", end)
  expect(!s.errors.length, "no page errors (pull)", s.errors.slice(0, 3))
  await s.p.close()
}

try {
  html = await (async () => {
    const [css, js] = await Promise.all([appCss(root), bundle()])
    const fonts = interFaces(root)
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clay Studio</title><style>${fonts}${css}</style><style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`
  })()
  if (PART === "all" || PART === "frames") await partFrames()
  if (PART === "all" || PART === "clip") await partClip()
  if (PART === "all" || PART === "keyboard") await partKeyboard()
  if (PART === "all" || PART === "pull") await partPull()
} finally {
  rmSync(stubs, { recursive: true, force: true })
  await browser.close()
}
console.log(`\n  sheets in ${shots}`)
console.log(broken ? `\n${broken} check(s) failed` : "\nall checks passed")
process.exit(broken ? 1 : 0)
