/**
 * storelib.com's front page hero, measured in headless Chromium at 390 and 1280.
 *
 *   NOTHING SPILLS SIDEWAYS. The document is no wider than the window.
 *
 *   NOTHING SHIFTS. Every layout-shift entry from the server's first paint,
 *   through hydration, the entrance and six seconds of typing and sliding,
 *   summed. Zero. And the heading's height is the same in every sample.
 *
 *   THE HEADING HAS NO EMPTY LINE. Every phrase takes the same number of
 *   lines at 390 (two), in Inter, so the height reserved for the tallest is
 *   the height of each.
 *
 *   THE TYPING NEVER STALLS. With the CPU slowed four times and the slider
 *   gliding on the same main thread, every letter is compared with when the
 *   typing's own timeline (lib/marketing/hero-typing) says it is due after
 *   the one before: none takes more than twice its interval. Frame times
 *   while it types. Scrolled away part way through a phrase, it stops at the
 *   end of a word, and back on screen the next letter comes within one
 *   interval, where it was (the old version waited 2.6s, then 3.6s measured).
 *
 *   THE SLIDER MOVES SMOOTHLY. Frame gaps sampled while it glides on its own.
 *
 *   A DRAG HOLDS THE SLIDE UNDER THE POINTER and lets go onto one slide.
 *
 *   IT STOPS WHEN NOBODY IS LOOKING. Scrolled away, under a resting mouse and
 *   under reduced motion, neither the slider nor the typing changes.
 *
 *   THE BUTTON SAYS WHO IS LOOKING: Start Now, Start Creating, Dashboard, to
 *   /sell, /sell and /app, one width whoever it is.
 *
 *   THE OWNER'S ROUND AB1 ASKS, AS NUMBERS. The search field's background is
 *   solid (alpha 1). The badge is three words at most. At 390 no control is
 *   full width (narrower than the window less 48px). At 390 the slider runs
 *   to both edges of the screen and across the panel's bottom edge, and the
 *   next section's heading starts close under it. The entrance is over in
 *   600ms. Signed in as a seller, the header on storelib.com has Dashboard
 *   and no bell (the bell is still on Explore's header).
 *
 *   THE TEXT IS READABLE. Each line of text against the lightest pixel behind
 *   it (read from a screenshot with the text hidden) is at least 4.5:1.
 *
 *   THE OWNER'S ROUND AC1 ASKS, AS NUMBERS (these replace AB1's where they
 *   disagree). The panel is inset (10px on a phone, 20px on a computer),
 *   rounded and has depth, and starts 8 to 14px under the header in both of
 *   its styles. The backdrop's pictures add 0.5 to 0.7 of the light they did
 *   in AB1 (measured against AB1's veil put back for a moment). Side slides
 *   are dimmer than the centre one, and the slide arriving brightens frame
 *   by frame to full, with no step over 0.06. At 390 the button and the
 *   search are full width, stacked and 52px tall, side by side from 640px,
 *   with a short true line under them. The badge is not "Built for creators"
 *   and is a pill. Every phrase takes two lines at 390 and at 1280, and the
 *   phrases are the owner's. The header's dark style (/admin) is its near
 *   black in the light look and in the dark look (app/theme-dark.css made it
 *   graphite, #2d2d33), on storelib.com, Explore and a product page, with the
 *   phone menu open too. HERO_ONLY=hero or HERO_ONLY=header runs one half.
 *
 *   node scripts/check-home-hero.mjs        (no build needed)
 *   HERO_SHOTS=<dir> keeps a picture of each width.
 *
 *   THE OWNER'S ROUND AD5 ASKS, AS NUMBERS (these replace AC1's where they
 *   disagree). The badge says "All in one platform" with a white drawn mark,
 *   no purple. The backdrop's pictures add at most 0.8 of the light they did
 *   in AC1 (its veil and no vignette put back for a moment), at the panel's
 *   edge and at its top middle. The panel's sides are the header's content
 *   edges (its logo and its last control) within 1px, at 390, 1280 and 1600,
 *   and the text inside is inset from the panel by the header's padding. The
 *   search's focus is a neutral ring, not violet. The three link in bio
 *   pages are three different people, no name twice. The dark header is a
 *   step above the page (a lighter near black than the dark look's page and
 *   the hero's panel), with a hairline at its foot, and casts a shadow once
 *   the page is scrolled.
 *
 *   THE OWNER'S ROUND 12 ASKS, AS NUMBERS (these replace AD5's where they
 *   disagree). The panel's left and right inset equal the gap between the
 *   header and the panel's top, at 390, 1024, 1280, 1440 and 1600, and at
 *   browser zoom 50, 67, 80, 90, 100, 110, 125 and 150% (the window's width
 *   in CSS px divided by the zoom, drawn at that many device pixels per CSS
 *   px); from 50% to 125% each gap is the same size on screen as at 100%.
 *   HERO_SHOTS keeps a picture of every zoom level at 1440 and 1024.
 */
import { execFileSync, spawn } from "node:child_process"
import { createServer } from "node:http"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { extname, join, normalize } from "node:path"
import { inflateSync } from "node:zlib"
import { build } from "esbuild"
import { appCss, interFaces } from "./probe-css.mjs"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

let passed = 0
let failed = 0
const check = (label, ok, detail = "") => {
  if (ok) { passed++; console.log(`  ok    ${label}${detail ? `  (${detail})` : ""}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ""}`) }
}

/* The site's dark look too (app/layout.tsx imports it after globals.css; a source compile of globals.css does not have it). */
const css = (await appCss(root)) + "\n" + readFileSync(join(root, "app/theme-dark.css"), "utf8")
/* HERO_ONLY=hero or HERO_ONLY=header runs one half. */
const ONLY = process.env.HERO_ONLY || ""
const faces = interFaces(root)
if (!faces) console.log("  (no production build to take Inter from: text is measured in the fallback face)")

const out = mkdtempSync(join(tmpdir(), "storelib-home-hero-"))
const stubs = join(root, ".home-hero-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default React.forwardRef(function Link({ href, children, prefetch, scroll, replace, ...rest }, ref) { return React.createElement("a", { href: typeof href === "string" ? href : "#", ref, ...rest }, children) })
export const useLinkStatus = () => ({ pending: false })
`)
writeFileSync(join(stubs, "image.jsx"), `import React from "react"
export default function Image({ src, alt, fill, priority, quality, preload, unoptimized, sizes, style, ...rest }) {
  return React.createElement("img", { src: typeof src === "string" ? src : src?.src, alt, ...rest, style: fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style })
}
`)
/* next/dynamic: the loading stand in, as the page draws it before the part arrives. */
writeFileSync(join(stubs, "dynamic.jsx"), `import React from "react"
export default function dynamic(_load, options) { return function Dynamic() { return options && options.loading ? options.loading() : null } }
`)
/* The header's probe (scripts/render-header-states.tsx): who is looking comes from window.__who. */
writeFileSync(join(stubs, "navigation.jsx"), `import { useSyncExternalStore } from "react"
const router = { push() {}, replace() {}, prefetch() {}, back() {}, refresh() {} }
const sub = (f) => { window.__nav.subs.add(f); return () => window.__nav.subs.delete(f) }
export const usePathname = () => useSyncExternalStore(sub, () => window.__nav.path)
export const useRouter = () => router
export const useSearchParams = () => new URLSearchParams("")
export const useParams = () => ({})
export const useSelectedLayoutSegment = () => null
`)
writeFileSync(join(stubs, "supabase-client.jsx"), `const who = () => window.__who
const USER = { id: "u1", email: "ava@example.com", user_metadata: {} }
const rowFor = (table) => {
  if (table === "profiles") return { display_name: "Ava Stone", avatar_url: null, username: "ava", is_creator: who() === "seller" }
  if (table === "creators") return who() === "seller" ? { id: "c1", slug: "ava", onboarding_completed: true } : null
  return null
}
const chain = (table) => new Proxy(function () {}, {
  get: (_, k) => k === "then" ? (r) => r({ data: rowFor(table), error: null }) : chain(table),
  apply: () => chain(table),
})
export function isNativePlatform() { return false }
export const capacitorStorage = {}
export function createClient() {
  return {
    auth: {
      getUser: () => Promise.resolve({ data: { user: who() === "guest" ? null : USER }, error: null }),
      getSession: async () => ({ data: { session: who() === "guest" ? null : { user: USER } }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({}),
    },
    from: (table) => chain(table),
    rpc: () => chain(null),
    channel: () => chain(null),
    removeChannel() {},
  }
}
`)
const bundle = (entry, outfile, extra = {}) => build({
  entryPoints: [join(root, entry)],
  bundle: true, format: "iife", platform: "browser", jsx: "automatic", logLevel: "error", outfile,
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "var process=globalThis.process||{env:{NODE_ENV:'production'},browser:true,versions:{},platform:'browser',cwd:function(){return '/'},nextTick:function(f){setTimeout(f,0)}};globalThis.process=process;" },
  loader: { ".css": "empty", ".svg": "dataurl", ".png": "dataurl" },
  plugins: [{
    name: "stubs",
    setup(b) {
      b.onResolve({ filter: /^next\/(link|image|dynamic)$/ }, (a) => ({ path: join(stubs, `${a.path.slice(5)}.jsx`) }))
      if (extra.header) {
        b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: join(stubs, "navigation.jsx") }))
        b.onResolve({ filter: /^@\/lib\/supabase\/client$/ }, () => ({ path: join(stubs, "supabase-client.jsx") }))
      }
      b.onResolve({ filter: /^@\// }, async (a) => b.resolve("./" + a.path.slice(2), { resolveDir: root, kind: a.kind }))
    },
  }],
  nodePaths: [join(root, "node_modules")],
})
try {
  await bundle("scripts/render-home-hero.tsx", join(out, "probe.js"))
  await bundle("scripts/render-header-states.tsx", join(out, "header.js"), { header: true })
} catch (e) {
  fail(`The probe did not bundle: ${e.message}`)
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const head = `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>${faces}</style><style>${css}</style><style>body{margin:0;background:#fff;font-family:Inter,system-ui,sans-serif}</style>` +
  `<script>window.__err=[];window.__cls=0;window.__shifts=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `new PerformanceObserver(function(l){l.getEntries().forEach(function(e){window.__cls+=e.value;window.__shifts.push({v:e.value,at:Math.round(e.startTime),src:(e.sources||[]).map(function(s){return s.node&&s.node.nodeName+"."+(s.node.className||"")})})})}).observe({type:"layout-shift",buffered:true})</script>` +
  `</head><body><div id="app"></div>`
writeFileSync(join(out, "index.html"), head + `<script src="/probe.js"></script></body></html>`)
writeFileSync(join(out, "header.html"), head + `<script src="/header.js"></script></body></html>`)

/* Served over http, so a picture at /marketing/... is read from public/ as on the site. */
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".webp": "image/webp", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".woff2": "font/woff2" }
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "")
  const file = path === "/" ? join(out, "index.html") : existsSync(join(out, path)) ? join(out, path) : join(root, "public", path)
  if (!file.startsWith(out) && !file.startsWith(join(root, "public"))) { res.writeHead(403); return res.end() }
  if (!existsSync(file)) { res.writeHead(404); return res.end() }
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const origin = `http://127.0.0.1:${server.address().port}`

/* ── The browser ─────────────────────────────────────────────────────── */
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--remote-debugging-port=0", "about:blank"], { stdio: ["ignore", "ignore", "pipe"] })
const endpoint = await new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => reject(new Error("the browser never announced a debugging port")), 20000)
  proc.stderr.on("data", (d) => {
    buf += d.toString()
    const m = buf.match(/ws:\/\/[^\s]+/)
    if (m) { clearTimeout(timer); resolve(m[0]) }
  })
})
const ws = new WebSocket(endpoint)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = () => j(new Error("could not attach to the browser")) })
let id = 0
const pending = new Map()
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
}
const send = (method, params, sessionId) => new Promise((resolve, reject) => {
  const n = ++id
  pending.set(n, { resolve, reject })
  ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
})

async function page({ width, height, phone, hash, reduced = false, path = "/", ready = "window.__ready", throttle = 1, dpr = 1 }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dpr, mobile: phone })
  await call("Emulation.setEmulatedMedia", {
    features: [
      { name: "hover", value: phone ? "none" : "hover" },
      { name: "pointer", value: phone ? "coarse" : "fine" },
      { name: "prefers-reduced-motion", value: reduced ? "reduce" : "no-preference" },
    ],
  })
  if (phone) await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  if (throttle > 1) await call("Emulation.setCPUThrottlingRate", { rate: throttle })
  await call("Page.navigate", { url: `${origin}${path}#${hash}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n${expression.slice(0, 160)}`)
    return r.result.value
  }
  for (let i = 0; i < 100; i++) {
    if (await js(`!!(${ready})`).catch(() => false)) break
    await sleep(100)
  }
  await sleep(300)
  const errs = await js("JSON.stringify(window.__err)")
  if (errs !== "[]") fail(`The page reported errors: ${errs}`)
  async function shot(clip) {
    const { data } = await call("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
    return decodePng(Buffer.from(data, "base64"))
  }
  const mouse = (type, x, y) => call("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, pointerType: "mouse" })
  const hover = (x, y) => call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none", buttons: 0, pointerType: "mouse" })
  const touch = (type, points) => call("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) })
  return { call, js, shot, mouse, hover, touch, close: () => send("Target.closeTarget", { targetId }) }
}

/** An RGBA or RGB PNG as { w, h, px(x, y) }. Handles every filter type. */
function decodePng(png) {
  let off = 8, idat = [], w = 0, h = 0, colorType = 6
  while (off < png.length) {
    const len = png.readUInt32BE(off)
    const type = png.toString("ascii", off + 4, off + 8)
    const body = png.subarray(off + 8, off + 8 + len)
    if (type === "IHDR") { w = body.readUInt32BE(0); h = body.readUInt32BE(4); colorType = body[9] }
    if (type === "IDAT") idat.push(body)
    off += 12 + len
  }
  const bpp = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = w * bpp
  const data = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]
    for (let x = 0; x < stride; x++) {
      const v = raw[y * (stride + 1) + 1 + x]
      const a = x >= bpp ? data[y * stride + x - bpp] : 0
      const b = y > 0 ? data[(y - 1) * stride + x] : 0
      const c = x >= bpp && y > 0 ? data[(y - 1) * stride + x - bpp] : 0
      let p = v
      if (f === 1) p = v + a
      else if (f === 2) p = v + b
      else if (f === 3) p = v + ((a + b) >> 1)
      else if (f === 4) {
        const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c)
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
      }
      data[y * stride + x] = p & 255
    }
  }
  return { w, h, px: (x, y) => { const i = y * stride + x * bpp; return [data[i], data[i + 1], data[i + 2]] } }
}

const DEPTH_PANEL = "rgb(14, 14, 16)"
const lum = ([r, g, b]) => {
  const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const parseColor = (s) => { const m = s.match(/[\d.]+/g).map(Number); return { rgb: m.slice(0, 3), a: m.length > 3 ? m[3] : 1 } }
const over = (fg, bg) => fg.rgb.map((c, i) => c * fg.a + bg[i] * (1 - fg.a))
const quantiles = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * s.length))]
  return { n: s.length, p50: q(0.5), p95: q(0.95), max: s.at(-1) ?? 0 }
}

/* Reads the state of the slider and the heading in one go. A letter counts as shown from half way into its fade. */
const STATE = `(() => {
  const stage = document.querySelector("[data-hero-carousel]")
  const sr = stage.getBoundingClientRect()
  const slides = [...stage.querySelectorAll("[data-hero-slide]")]
  const typed = document.querySelector("[data-hero-typed]")
  const line = typed.querySelector("[data-hero-line]")
  const on = (c) => c.style.opacity === "" || Number(c.style.opacity) >= 0.5
  const shown = line.children.length ? [...line.children].filter(on).map((c) => c.textContent).join("") : line.textContent
  const h1 = document.querySelector("[data-home-hero] h1").getBoundingClientRect()
  const centred = slides.find((s) => s.hasAttribute("data-centre"))
  const cr = centred.getBoundingClientRect()
  return {
    transforms: slides.map((s) => s.style.transform).join("|"),
    centreIndex: Number(centred.dataset.heroSlide),
    centreOffset: (cr.left + cr.width / 2) - (sr.left + sr.width / 2),
    slideX: slides.map((x) => { const r = x.getBoundingClientRect(); return r.left + r.width / 2 }),
    moving: stage.hasAttribute("data-moving"),
    stageMid: { x: sr.left + sr.width / 2, y: sr.top + sr.height / 2 },
    shown, h1Height: h1.height,
    ghosts: [...typed.querySelectorAll("[data-ghost]")].map((g) => g.getBoundingClientRect().height),
    lineHeight: parseFloat(getComputedStyle(document.querySelector("[data-home-hero] h1")).lineHeight),
    cls: window.__cls, shifts: window.__shifts,
    scrollW: document.scrollingElement.scrollWidth, innerW: innerWidth,
  }
})()`

/*
  Every letter's first frame on screen (opacity above 0), by phrase, and
  every frame's length while a letter is fading in. Runs for \`ms\`.
*/
const TYPING = (ms) => `new Promise((done) => {
  const seen = new Map()
  const frames = []
  let last = 0
  const end = performance.now() + ${ms}
  const tick = (now) => {
    /* Each phrase has its own line; the one being typed carries data-hero-line. */
    const line = document.querySelector("[data-hero-line]")
    const kids = [...line.children]
    const text = kids.map((c) => c.textContent).join("")
    let fading = false
    kids.forEach((c, i) => {
      const o = c.style.opacity
      const a = o === "" ? 1 : Number(o)
      if (a > 0 && a < 1) fading = true
      const key = text + "|" + i
      if (a > 0 && !seen.has(key)) seen.set(key, { text, i, t: now })
    })
    if (fading && last) frames.push(now - last)
    last = now
    if (now < end) requestAnimationFrame(tick)
    else done({ letters: [...seen.values()], frames })
  }
  requestAnimationFrame(tick)
})`

/* Each letter's gap after the one before, against the gap the timeline gives it. */
function stalls(run, typing) {
  const byPhrase = new Map()
  for (const l of run.letters) {
    if (!byPhrase.has(l.text)) byPhrase.set(l.text, [])
    byPhrase.get(l.text)[l.i] = l.t
  }
  const out = []
  for (const [text, times] of byPhrase) {
    const p = typing.phrases.indexOf(text)
    if (p < 0) continue
    const tl = typing.timelines[p]
    for (let i = 1; i < times.length; i++) {
      if (times[i] === undefined || times[i - 1] === undefined) continue
      /* The first phrase arrives whole with the page: only letters that were typed count. */
      if (times[i] === times[i - 1]) continue
      const expected = tl.reveal[i] - tl.reveal[i - 1]
      out.push({ text, i, gap: times[i] - times[i - 1], expected })
    }
  }
  return out
}

for (const size of [{ width: 390, height: 844, phone: true }, { width: 1280, height: 860, phone: false }]) {
  if (ONLY === "header") break
  console.log(`\n── ${size.width}px ${size.phone ? "(touch)" : "(mouse)"} ──`)
  const p = await page({ ...size, hash: "guest" })
  if (process.env.HERO_SHOTS) {
    mkdirSync(process.env.HERO_SHOTS, { recursive: true })
    await sleep(900)
    const { data } = await p.call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(process.env.HERO_SHOTS, `home-hero-${size.width}.png`), Buffer.from(data, "base64"))
    if (size.phone) {
      await p.js(`window.scrollTo(0, 420)`)
      await sleep(400)
      const { data: below } = await p.call("Page.captureScreenshot", { format: "png" })
      writeFileSync(join(process.env.HERO_SHOTS, `home-hero-${size.width}-scrolled.png`), Buffer.from(below, "base64"))
      await p.js(`window.scrollTo(0, 0)`)
    }
  }

  /* Six seconds of typing and sliding, sampled. */
  const heights = new Set()
  const texts = new Set()
  const transforms = new Set()
  for (let i = 0; i < 30; i++) {
    const s = await p.js(STATE)
    heights.add(s.h1Height.toFixed(2)); texts.add(s.shown); transforms.add(s.transforms)
    await sleep(200)
  }
  const s = await p.js(STATE)
  check("no sideways scroll", s.scrollW <= s.innerW, `${s.scrollW} <= ${s.innerW}`)
  check("CLS over the first paint, hydration, the entrance and 6s of motion is 0", s.cls === 0, `CLS ${s.cls.toFixed(4)}${s.shifts.length ? " " + JSON.stringify(s.shifts.slice(0, 4)) : ""}`)
  check("the heading's height never changed", heights.size === 1, [...heights].join(", ") + "px")
  check("it is the tallest phrase's height, reserved before any is typed", s.ghosts.length === 4 && Math.abs(Math.max(...s.ghosts) - s.h1Height) < 0.5, `phrases ${s.ghosts.map((g) => g.toFixed(1)).join(", ")}px, heading ${s.h1Height.toFixed(1)}px`)
  const lines = s.ghosts.map((g) => Math.round(g / s.lineHeight))
  check("every phrase takes two lines, so no phrase leaves an empty one", lines.every((l) => l === 2), `${lines.join(", ")} lines of ${s.lineHeight.toFixed(1)}px`)
  if (size.phone) {
    const flat = (x) => x.replace(/\s+/g, " ")
    const typing = await p.js("window.__heroTyping")
    check("the owner's phrases (round AC1): the first is \"Build a business around what you create.\", and \"Build your online store.\" is one of them", typing.phrases[0] === "Build a business around what you create." && typing.phrases.some((x) => flat(x) === "Build your online store."), typing.phrases.map(flat).join(" | "))
  }
  check("the heading typed (more than one state seen)", texts.size > 3, `${texts.size} states`)
  check("the slider autoplayed", transforms.size > 1, `${transforms.size} distinct poses`)

  /* The owner's asks, as numbers. */
  const ui = await p.js(`(() => {
    const hero = document.querySelector("[data-home-hero]")
    const panelEl = hero.querySelector("[data-hero-panel]")
    const panel = panelEl.getBoundingClientRect()
    const ps = getComputedStyle(panelEl)
    const input = hero.querySelector("input[name=q]")
    const ctaEl = hero.querySelector("[data-hero-cta]")
    const cta = ctaEl.getBoundingClientRect()
    const form = input.closest("form").getBoundingClientRect()
    const ir = input.getBoundingClientRect()
    const stage = hero.querySelector("[data-hero-carousel]").getBoundingClientRect()
    const centre = hero.querySelector("[data-hero-slide][data-centre]").getBoundingClientRect()
    const badge = hero.querySelector("[data-hero-badge]")
    const bs = getComputedStyle(badge)
    const note = hero.querySelector("[data-hero-note]")
    const nr = note ? note.getBoundingClientRect() : null
    const after = document.querySelector("[data-home-after-hero]")
    const ar = after.getBoundingClientRect()
    const nextTop = ar.top + parseFloat(getComputedStyle(after).paddingTop)
    const heroBottom = Math.max(hero.getBoundingClientRect().bottom, centre.bottom)
    const veil = hero.querySelector("[data-hero-veil]")
    const icon = badge.querySelector("[data-hero-badge-icon] svg")
    const fills = icon ? [...icon.querySelectorAll("rect,path,circle")].map((n) => getComputedStyle(n).fill) : []
    const purple = [badge, ...badge.querySelectorAll("*")].some((n) => { const c = getComputedStyle(n); return [c.backgroundColor, c.color, c.fill].some((v) => /rgba?[(]([0-9]+), ([0-9]+), ([0-9]+)/.test(v) && (() => { const [, r, g, b] = v.match(/rgba?[(]([0-9]+), ([0-9]+), ([0-9]+)/).map(Number); return b > g + 40 && r > g + 20 })()) })
    const copy = hero.querySelector("[data-hero-copy]")
    return {
      bg: getComputedStyle(input).backgroundColor, ctaBg: getComputedStyle(ctaEl).backgroundColor,
      badge: badge.textContent.trim(), badgeH: badge.getBoundingClientRect().height, badgeFont: bs.fontSize, badgeRadius: parseFloat(bs.borderTopLeftRadius), badgeShadow: bs.boxShadow,
      cta: { w: cta.width, h: cta.height, top: cta.top, bottom: cta.bottom, left: cta.left, r: parseFloat(getComputedStyle(ctaEl).borderTopLeftRadius) },
      input: { w: ir.width, h: ir.height, top: ir.top, left: ir.left, r: parseFloat(getComputedStyle(input).borderTopLeftRadius) },
      form: form.width, sameRow: Math.abs(cta.top - form.top) < 2,
      note: note ? { text: note.textContent.trim(), top: nr.top, size: getComputedStyle(note).fontSize } : null,
      panel: { left: panel.left, right: panel.right, bottom: panel.bottom, top: panel.top, radius: parseFloat(ps.borderTopLeftRadius), shadow: ps.boxShadow },
      stage: { left: stage.left, right: stage.right }, centre: { top: centre.top, bottom: centre.bottom },
      gap: nextTop - heroBottom, innerW: innerWidth, innerH: innerHeight,
      veil: veil ? getComputedStyle(veil).backgroundColor : "",
      icon: { drawn: !!icon, fills, purple }, copyPad: copy ? [parseFloat(getComputedStyle(copy).paddingLeft), parseFloat(getComputedStyle(copy).paddingRight)] : null,
      globeTop: after.querySelector(".animate-pulse")?.getBoundingClientRect().top ?? null, h1Bottom: hero.querySelector("h1").getBoundingClientRect().bottom,
    }
  })()`)
  const bg = parseColor(ui.bg)
  check("the search field is solid: no transparency in its background", bg.a === 1 && parseColor(ui.ctaBg).a === 1, `${ui.bg}, button ${ui.ctaBg}`)
  const words = ui.badge.split(/\s+/).filter(Boolean).length
  /* Changed on purpose (round AD5): the owner's words, four of them, and a white mark in place of the purple dot. */
  check("the badge says \"All in one platform\" (round AD5), four words at most", ui.badge === "All in one platform" && words <= 4, `"${ui.badge}", ${words} words, ${ui.badgeH.toFixed(1)}px tall, ${ui.badgeFont}`)
  check("its mark is a white drawing, and nothing in the badge is purple", ui.icon.drawn && ui.icon.fills.length >= 1 && ui.icon.fills.every((f) => f === "rgb(255, 255, 255)") && !ui.icon.purple, `${ui.icon.fills.length} shapes, ${[...new Set(ui.icon.fills)].join(", ")}${ui.icon.purple ? ", purple found" : ""}`)
  check("the badge is a pill with depth: fully round ends and a shadow", ui.badgeRadius >= ui.badgeH / 2 - 0.5 && /rgba\(0, 0, 0, 0\.[1-9]/.test(ui.badgeShadow), `radius ${ui.badgeRadius}px on ${ui.badgeH.toFixed(1)}px, shadow ${ui.badgeShadow.slice(0, 60)}...`)
  check("the panel is rounded and has depth (a shadow under it and a hairline)", ui.panel.radius >= (size.phone ? 24 : 32) && /inset/.test(ui.panel.shadow) && (ui.panel.shadow.match(/rgba/g) || []).length >= 3, `radius ${ui.panel.radius}px`)
  /* Changed on purpose (round 12, the owner: "decrease a little bit the left and right padding ... so it matches the vertical space in between header and hero"): 10px on a phone, max(8px, 0.9vw) from 640px, the gap under the header too. */
  const gapPx = size.width < 640 ? 10 : Math.max(8, size.width * 0.009)
  const inset = [gapPx - 0.5, gapPx + 0.5]
  check(`the panel is inset from the page's sides (${inset[0].toFixed(1)} to ${inset[1].toFixed(1)}px)`, ui.panel.left >= inset[0] && ui.panel.left <= inset[1] && Math.abs(ui.innerW - ui.panel.right - ui.panel.left) < 1, `${ui.panel.left.toFixed(1)}px left, ${(ui.innerW - ui.panel.right).toFixed(1)}px right`)
  const veil = ui.veil ? parseColor(ui.veil) : { a: 0 }
  check("the backdrop's veil is 0.928 (round AD5; it was 0.91)", Math.abs(veil.a - 0.928) < 0.002, `veil ${ui.veil}`)
  check("the text inside the panel is inset from it by the header's padding too", !!ui.copyPad && ui.copyPad.every((x) => Math.abs(x - (size.phone ? 16 : 32)) < 0.5), `${ui.copyPad?.join(" and ")}px`)
  check("a short line under the controls, true of the Free plan", !!ui.note && ui.note.text === "Free to start. No card needed." && ui.note.top > Math.max(ui.cta.bottom, ui.input.top + ui.input.h), ui.note ? `"${ui.note.text}", ${ui.note.size}` : "missing")
  if (size.phone) {
    const column = ui.innerW - 2 * ui.panel.left - 32
    check("at 390 the button and the search are full width and stacked, the button on top", Math.abs(ui.cta.w - ui.input.w) < 1 && ui.cta.w >= column - 1 && ui.input.top >= ui.cta.bottom + 8 && Math.abs(ui.cta.left - ui.input.left) < 1, `button ${ui.cta.w.toFixed(1)}px, search ${ui.input.w.toFixed(1)}px, column ${column.toFixed(1)}px, ${(ui.input.top - ui.cta.bottom).toFixed(1)}px between`)
    check("each 52px tall with the header buttons' 8px corner, as the owner's picture", Math.abs(ui.cta.h - 52) < 1 && Math.abs(ui.input.h - 52) < 1 && ui.cta.r === 8 && ui.input.r === 8, `button ${ui.cta.h.toFixed(1)}px r${ui.cta.r}, search ${ui.input.h.toFixed(1)}px r${ui.input.r}`)
    check("the slider runs to both edges of the screen, past the panel's sides", ui.stage.left <= 0.5 && ui.stage.right >= ui.innerW - 0.5 && ui.panel.left >= 4, `slider ${ui.stage.left.toFixed(1)} to ${ui.stage.right.toFixed(1)}, panel ${ui.panel.left.toFixed(1)} to ${ui.panel.right.toFixed(1)}`)
    check("and across the panel's bottom edge", ui.centre.top < ui.panel.bottom - 30 && ui.centre.bottom > ui.panel.bottom + 30, `centre slide ${ui.centre.top.toFixed(0)} to ${ui.centre.bottom.toFixed(0)}, panel ends at ${ui.panel.bottom.toFixed(0)}`)
    check("the next section starts close under the slides (40 to 72px)", ui.gap >= 40 && ui.gap <= 72, `${ui.gap.toFixed(1)}px from the slides to the next heading`)
    const ahead = Number(/export const GLOBE_AHEAD_PX = (\d+)/.exec(readFileSync(join(root, "components/marketing/globe-widget.tsx"), "utf8"))?.[1])
    const startsAt = ui.globeTop - ui.innerH - ahead
    check("the globe (1.8 MB) starts loading only once the heading has scrolled off", ui.globeTop !== null && startsAt >= ui.h1Bottom, `globe at ${ui.globeTop?.toFixed(0)}px, loads from a scroll of ${startsAt.toFixed(0)}px, heading ends at ${ui.h1Bottom.toFixed(0)}px`)
  } else {
    check("the slides cross the panel's bottom edge, as the owner's picture", ui.centre.top < ui.panel.bottom - 60 && ui.centre.bottom > ui.panel.bottom + 60, `centre slide ${ui.centre.top.toFixed(0)} to ${ui.centre.bottom.toFixed(0)}, panel ends at ${ui.panel.bottom.toFixed(0)}`)
    check("and run to the page's edges, past the panel's sides", ui.stage.left <= 0.5 && ui.stage.right >= ui.innerW - 0.5, `slider ${ui.stage.left.toFixed(1)} to ${ui.stage.right.toFixed(1)}`)
    check("the button and the search sit side by side, one height", ui.sameRow && Math.abs(ui.cta.h - ui.input.h) < 1, `${ui.cta.h.toFixed(1)}px and ${ui.input.h.toFixed(1)}px`)
    check("the next section starts close under the slides (40 to 110px)", ui.gap >= 40 && ui.gap <= 110, `${ui.gap.toFixed(1)}px from the slides to the next heading`)
  }

  /*
    The backdrop's brightness (round AD5: "about 20% lower brightness and more
    vignette"). Mean luma 0 to 255 at two places with no text: a strip at the
    panel's left edge and a band across its top middle. Measured as it is,
    then with round AC1's veil (0.91) put back and the vignette hidden for a
    moment, so both are the same pictures under the same light. What the
    pictures add over the panel's own #0e0e10 (luma 14.1) must be at most 0.8
    of what it was.
  */
  {
    const spots = await p.js(`(() => { const b = document.querySelector("[data-hero-panel]").getBoundingClientRect(); return [
      { name: "the left edge", x: b.left + 14, y: b.top + 24, w: Math.min(48, b.width * 0.08), h: 200 },
      { name: "the top middle", x: b.left + b.width * 0.3, y: b.top + 4, w: b.width * 0.4, h: 18 },
    ] })()`)
    const luma = async (r) => {
      const img = await p.shot({ x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.w), height: Math.round(r.h) })
      let sum = 0, n = 0
      for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) { const [R, G, B] = img.px(x, y); sum += 0.2126 * R + 0.7152 * G + 0.0722 * B; n++ }
      return sum / n
    }
    for (const spot of spots) {
      const now = await luma(spot)
      await p.js(`(() => { document.querySelector("[data-hero-veil]").style.backgroundColor = "rgba(14,14,16,0.91)"; document.querySelector("[data-hero-vignette]").style.visibility = "hidden" })()`)
      await sleep(80)
      const was = await luma(spot)
      await p.js(`(() => { document.querySelector("[data-hero-veil]").style.backgroundColor = ""; document.querySelector("[data-hero-vignette]").style.visibility = "" })()`)
      const add = now - 14.1, addWas = was - 14.1
      check(`the backdrop at ${spot.name} is at least a fifth darker than round AC1's`, addWas > 0 && add / addWas <= 0.8, `mean luma ${now.toFixed(1)} (was ${was.toFixed(1)}): the pictures add ${add.toFixed(1)} where they added ${addWas.toFixed(1)}, ${((1 - add / addWas) * 100).toFixed(0)}% less`)
    }
  }

  /* The search, focused: a neutral ring with depth, never violet (round AD5). */
  {
    const f = await p.js(`(() => { const i = document.querySelector("[data-home-hero] input[name=q]"); i.focus(); const c = getComputedStyle(i); return { border: c.borderTopColor, shadow: c.boxShadow, outline: c.outlineStyle } })()`)
    await sleep(220)
    const f2 = await p.js(`(() => { const i = document.querySelector("[data-home-hero] input[name=q]"); const c = getComputedStyle(i); const r = { border: c.borderTopColor, shadow: c.boxShadow }; i.blur(); return r })()`)
    const [r, g, b] = (f2.border.match(/[\d.]+/g) || []).map(Number)
    const violet = b > g + 40 && r > g + 20
    check("the search's focus: a neutral border and a soft ring, no violet", !violet && /rgba\(255, 255, 255, 0\.\d+\) 0px 0px 0px 4px/.test(f2.shadow) && !/rgba?\(1(24|39), (58|92), (237|246)/.test(f2.shadow), `border ${f2.border}, shadow ${f2.shadow.slice(0, 120)}`)
    void f
  }

  /* Side slides are dimmer, by the same position that moves them. */
  for (let i = 0; i < 60 && (await p.js(STATE)).moving; i++) await sleep(50)
  const dims = await p.js(`(() => [...document.querySelectorAll("[data-hero-slide]")].map((s) => ({ centre: s.hasAttribute("data-centre"), dim: Number(getComputedStyle(s.querySelector("[data-hero-dim]")).opacity), x: s.getBoundingClientRect().left + s.getBoundingClientRect().width / 2, vis: Number(s.style.opacity || 1) })))()`)
  const midX = ui.innerW / 2
  const c = dims.find((d) => d.centre)
  const sides = dims.filter((d) => !d.centre && d.vis > 0.5 && Math.abs(d.x - midX) < ui.innerW)
  check("the centre slide is at full brightness, the slides beside it dimmer", c && c.dim === 0 && sides.length >= 2 && sides.every((d) => d.dim >= 0.35), `centre ${(1 - c.dim).toFixed(2)} bright, sides ${sides.map((d) => (1 - d.dim).toFixed(2)).join(", ")}`)

  /* Frame gaps while it glides on its own, and the slide arriving in the centre brightening frame by frame. */
  const frames = await p.js(`new Promise((done) => {
    const stage = document.querySelector("[data-hero-carousel]")
    const slides = [...stage.querySelectorAll("[data-hero-slide]")]
    const mid = stage.getBoundingClientRect().left + stage.getBoundingClientRect().width / 2
    const gaps = []; const dims = []; let last = 0; let seen = false; let watch = null; let restSeen = false
    const tick = (t) => {
      const moving = stage.hasAttribute("data-moving")
      /* Only a glide seen from its first frame counts: one already under way when this started is let go by. */
      if (!moving) restSeen = true
      if (moving && restSeen) {
        if (last) gaps.push(t - last)
        last = t; seen = true
        /* The slide arriving: the one right of the centre when the glide began. */
        if (!watch) watch = slides.map((s) => ({ s, x: s.getBoundingClientRect().left + s.getBoundingClientRect().width / 2 })).filter((o) => o.x > mid + 20).sort((a, b) => a.x - b.x)[0]?.s
        if (watch) dims.push(Number(watch.querySelector("[data-hero-dim]").style.opacity))
      }
      else if (seen && gaps.length > 10) { if (watch) dims.push(Number(watch.querySelector("[data-hero-dim]").style.opacity)); return done({ gaps, dims }) }
      else last = 0
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    setTimeout(() => done({ gaps, dims }), 9000)
  })`)
  if (frames.gaps.length) {
    const q = quantiles(frames.gaps)
    check("frames during a glide", q.p95 < 34, `${q.n} frames, median ${q.p50.toFixed(1)}ms, p95 ${q.p95.toFixed(1)}ms, longest ${q.max.toFixed(1)}ms`)
    const d = frames.dims
    const steps = d.slice(1).map((v, i) => v - d[i])
    const biggest = Math.max(0, ...steps.map((x) => Math.abs(x)))
    check("the slide arriving brightens smoothly to full: never darker frame to frame, no step over 0.06", d.length > 10 && d[d.length - 1] === 0 && d[0] >= 0.35 && steps.every((x) => x <= 1e-6) && biggest <= 0.06, `dim ${d[0]?.toFixed(2)} to ${d[d.length - 1]?.toFixed(2)} over ${d.length} frames, largest step ${biggest.toFixed(3)}`)
  } else check("frames during a glide", false, "no glide seen in 9s")

  /*
    WHY AN OVERLAY AND NOT filter: brightness(). The same glides, the CPU four
    times slower, timed twice: as built (a dim layer's opacity), then with
    each slide's brightness set by filter from the same value every frame and
    the layer hidden. Reported, and the overlay must be no slower.
  */
  if (!size.phone) {
    const GLIDES = `new Promise((done) => {
      const stage = document.querySelector("[data-hero-carousel]")
      const gaps = []; let last = 0; let restSeen = false; let glides = 0; let was = false
      const tick = (t) => {
        const moving = stage.hasAttribute("data-moving")
        if (was && !moving) glides++
        was = moving
        if (!moving) { restSeen = true; last = 0; if (glides >= 2) return done(gaps) }
        else if (restSeen) { if (last) gaps.push(t - last); last = t }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
      setTimeout(() => done(gaps), 12000)
    })`
    await p.hover(10, 10)
    await p.call("Emulation.setCPUThrottlingRate", { rate: 4 })
    const overlay = quantiles(await p.js(GLIDES))
    await p.js(`(() => { window.__filterMode = true; const loop = () => { if (!window.__filterMode) return; for (const s of document.querySelectorAll("[data-hero-slide]")) { const d = s.querySelector("[data-hero-dim]"); s.style.filter = "brightness(" + (1 - Number(d.style.opacity || 0)).toFixed(3) + ")"; d.style.visibility = "hidden" } requestAnimationFrame(loop) }; loop() })()`)
    const filter = quantiles(await p.js(GLIDES))
    await p.js(`(() => { window.__filterMode = false; for (const s of document.querySelectorAll("[data-hero-slide]")) { s.style.filter = ""; s.querySelector("[data-hero-dim]").style.visibility = "" } })()`)
    await p.call("Emulation.setCPUThrottlingRate", { rate: 1 })
    check("dimming by an overlay's opacity is no slower than filter: brightness() (CPU 4x slower)", overlay.n > 20 && filter.n > 20 && overlay.p95 <= filter.p95 + 2,
      `overlay: median ${overlay.p50.toFixed(1)}ms, p95 ${overlay.p95.toFixed(1)}ms over ${overlay.n} frames; filter: median ${filter.p50.toFixed(1)}ms, p95 ${filter.p95.toFixed(1)}ms over ${filter.n} frames`)
  }

  /* The button and its label. */
  const cta = await p.js(`(() => { const a = document.querySelector("[data-hero-cta]"); return { state: a.dataset.heroCta, href: a.getAttribute("href"), text: [...a.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible").textContent, w: a.getBoundingClientRect().width } })()`)
  check("signed out: Start Now, to /sell", cta.state === "guest" && cta.text === "Start Now" && cta.href === "/sell", JSON.stringify(cta))

  /* Contrast of every line of text against the lightest pixel behind it. */
  await p.js(`window.scrollTo(0, 0)`)
  const targets = await p.js(`(() => {
    const hero = document.querySelector("[data-home-hero]")
    const cv = document.createElement("canvas"); cv.width = cv.height = 1
    const cx = cv.getContext("2d", { willReadFrequently: true })
    const rgba = (c) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return "rgba(" + d[0] + "," + d[1] + "," + d[2] + "," + (d[3] / 255).toFixed(3) + ")" }
    /* The box the letters sit in, not the element's: a label's rounded corners and its dot are not behind any text. */
    const textBox = (node) => { const r = document.createRange(); node.nodeType === 3 ? r.selectNode(node) : r.selectNodeContents(node); const b = r.getBoundingClientRect(); return { x: b.left, y: b.top + b.height * 0.15, w: b.width, h: b.height * 0.7 } }
    const pick = (el, name, box, color) => ({ name, ...box, color: rgba(color || getComputedStyle(el).color) })
    const badge = hero.querySelector("[data-hero-badge]")
    const badgeText = [...badge.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    const sub = hero.querySelectorAll("p")[1]
    const h1 = hero.querySelector("[data-hero-line]")
    const label = [...hero.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible")
    const input = hero.querySelector("input[name=q]")
    const ir = input.getBoundingClientRect()
    return [
      pick(badge, "badge", textBox(badgeText)),
      pick(h1, "heading", textBox(h1)),
      pick(sub, "subheading", textBox(sub)),
      pick(label, "button", textBox(label)),
      pick(input, "search placeholder", { x: ir.left + 16, y: ir.top + 12, w: ir.width - 64, h: ir.height - 24 }, getComputedStyle(input, "::placeholder").color),
      pick(hero.querySelector("[data-hero-note]"), "the line under the controls", textBox(hero.querySelector("[data-hero-note]"))),
    ]
  })()`)
  await p.js(`(() => { const st = document.createElement("style"); st.id = "hide"; st.textContent = "[data-home-hero] *{color:transparent!important;caret-color:transparent!important}[data-home-hero] input::placeholder{color:transparent!important}[data-home-hero] svg{visibility:hidden!important}[data-hero-caret]{display:none!important}"; document.head.appendChild(st) })()`)
  await sleep(100)
  for (const t of targets) {
    const clip = { x: Math.max(0, Math.floor(t.x)), y: Math.max(0, Math.floor(t.y)), width: Math.max(1, Math.floor(t.w)), height: Math.max(1, Math.floor(t.h)) }
    const img = await p.shot(clip)
    let worst = null
    let worstRatio = Infinity
    const fg = parseColor(t.color)
    for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
      const bgp = img.px(x, y)
      const r = ratio(over(fg, bgp), bgp)
      if (r < worstRatio) { worstRatio = r; worst = bgp }
    }
    check(`contrast: ${t.name}`, worstRatio >= 4.5, `${worstRatio.toFixed(2)}:1, text ${t.color} on rgb(${worst?.join(",")})`)
  }
  await p.js(`document.getElementById("hide").remove()`)

  /* A drag: the centre slide follows the pointer, then one slide is centred. */
  if (!size.phone) await p.hover(10, 10)
  for (let i = 0; i < 50 && (await p.js(STATE)).moving; i++) await sleep(50)
  const before = await p.js(STATE)
  const { x: mx, y: my } = before.stageMid
  const dx = size.phone ? -190 : -380
  if (size.phone) {
    await p.touch("touchStart", [[mx, my]])
    for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[mx + (dx * i) / 10, my]]); await sleep(16) }
  } else {
    await p.mouse("mousePressed", mx, my)
    for (let i = 1; i <= 10; i++) { await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx + (dx * i) / 10, y: my, button: "left", buttons: 1, pointerType: "mouse" }); await sleep(16) }
  }
  await sleep(60)
  const mid = await p.js(STATE)
  const followed = mid.slideX[before.centreIndex] - before.slideX[before.centreIndex]
  check("the slide follows the pointer while held", Math.abs(followed - dx) <= Math.abs(dx) * 0.2, `pointer moved ${dx}px, slide moved ${followed.toFixed(1)}px`)
  const held1 = await p.js(STATE); await sleep(800); const held2 = await p.js(STATE)
  check("nothing moves while held", held1.transforms === held2.transforms)
  await sleep(120)
  if (size.phone) await p.touch("touchEnd", [])
  else await p.mouse("mouseReleased", mx + dx, my)
  await sleep(1300)
  const after = await p.js(STATE)
  check("it lets go onto one slide, centred", Math.abs(after.centreOffset) < 1, `centre slide ${after.centreIndex}, ${after.centreOffset.toFixed(2)}px off the middle`)
  check("and moved on from where it was", after.centreIndex !== before.centreIndex, `${before.centreIndex} -> ${after.centreIndex}`)

  if (!size.phone) {
    await p.hover(10, 10)
    const f0 = await p.js(STATE)
    await p.mouse("mousePressed", mx, my)
    for (let i = 1; i <= 4; i++) { await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: mx - 90 * i, y: my, button: "left", buttons: 1, pointerType: "mouse" }); await sleep(8) }
    await p.mouse("mouseReleased", mx - 360, my)
    await sleep(1400)
    const f1 = await p.js(STATE)
    const n = f1.slideX.length
    const moved = (f1.centreIndex - f0.centreIndex + n) % n
    check("a flick carries with momentum", moved >= 1, `${f0.centreIndex} -> ${f1.centreIndex}, centred to ${f1.centreOffset.toFixed(2)}px`)

    await p.hover(mx, my)
    await sleep(1200)
    const h1 = await p.js(STATE); await sleep(4500); const h2 = await p.js(STATE)
    check("a mouse resting on the slider stops it", h1.transforms === h2.transforms)
    await p.hover(10, 10)
  }

  /* Paused once scrolled away. */
  await p.js(`window.scrollTo(0, 2600)`)
  await sleep(1500)
  const o1 = await p.js(STATE); await sleep(4500); const o2 = await p.js(STATE)
  check("scrolled away, the slider stops", o1.transforms === o2.transforms)
  check("scrolled away, the typing stops", o1.shown === o2.shown)
  await p.js(`window.scrollTo(0, 0)`)

  await sleep(1500)
  await p.js(`(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")) })()`)
  await sleep(1500)
  const v1 = await p.js(STATE); await sleep(4500); const v2 = await p.js(STATE)
  check("tab hidden, the slider stops", v1.transforms === v2.transforms)
  check("tab hidden, the typing stops", v1.shown === v2.shown)
  await p.js(`(() => { delete document.visibilityState; document.dispatchEvent(new Event("visibilitychange")) })()`)
  const back1 = await p.js(STATE); await sleep(5000); const back2 = await p.js(STATE)
  check("shown again, it carries on", back1.transforms !== back2.transforms || back1.shown !== back2.shown)
  const fin = await p.js(STATE)
  check("CLS after all of it is still 0", fin.cls === 0, `CLS ${fin.cls.toFixed(4)}${fin.shifts.length ? " " + JSON.stringify(fin.shifts.slice(0, 4)) : ""}`)
  await p.close()

  /* THE TYPING, UNDER LOAD: the CPU four times slower, the slider gliding on the same thread, ten seconds. */
  const t4 = await page({ ...size, hash: "guest", throttle: 4 })
  const typing = await t4.js("window.__heroTyping")
  const run = await t4.js(TYPING(10000))
  const gaps = stalls(run, typing)
  const worst = gaps.reduce((w, g) => (g.gap / g.expected > (w ? w.gap / w.expected : 0) ? g : w), null)
  const late = gaps.filter((g) => g.gap > 2 * g.expected)
  check("4x slower CPU, slider gliding: no letter more than twice its interval after the one before", gaps.length > 20 && late.length === 0,
    `${gaps.length} letters, ${late.length} late; worst ${worst ? `${worst.gap.toFixed(0)}ms where ${worst.expected.toFixed(0)}ms was due ("${worst.text.slice(0, worst.i + 1)}")` : "none"}`)
  const tf = quantiles(run.frames)
  check("frames while letters fade in, at 4x slower CPU", tf.n > 20 && tf.p95 < 40, `${tf.n} frames, median ${tf.p50.toFixed(1)}ms, p95 ${tf.p95.toFixed(1)}ms, longest ${tf.max.toFixed(1)}ms`)
  await t4.close()

  /* Scrolled away part way through a phrase: it stops between words, and comes back where it was, at once. */
  const sa = await page({ ...size, hash: "guest" })
  const unthrottled = await sa.js(TYPING(1)).then(() => sa.js(TYPING(6000)))
  const uf = quantiles(unthrottled.frames)
  check("frames while letters fade in", uf.n > 20 && uf.p95 < 20, `${uf.n} frames, median ${uf.p50.toFixed(1)}ms, p95 ${uf.p95.toFixed(1)}ms, longest ${uf.max.toFixed(1)}ms`)
  /* Typing (the caret at full strength, not fading with the line), a few letters into a word. */
  let midWord = false
  for (let i = 0; i < 150 && !midWord; i++) {
    midWord = await sa.js(`(() => { const l = document.querySelector("[data-hero-line]"); const k = [...l.children].filter((c) => c.style.opacity !== "0").length; return document.querySelector("[data-hero-caret]").style.opacity === "" && k > 6 && k < l.children.length - 8 && !/\\s/.test(l.children[k - 1].textContent) })()`)
    if (!midWord) await sleep(30)
  }
  check("caught the heading part way through a word", midWord)
  await sa.js(`window.scrollTo(0, 2600)`)
  await sleep(1500)
  /* Started letters: the last of a word may still be part way into its fade, which carries on when it is back. */
  const STARTED = `(() => { const kids = [...document.querySelector("[data-hero-line]").children]; return { line: kids.map((c) => c.textContent).join(""), started: kids.filter((c) => c.style.opacity !== "0").map((c) => c.textContent).join(""), styles: kids.map((c) => c.style.opacity).join(",") } })()`
  const away = await sa.js(STARTED)
  const stoppedAt = away.started.length
  check("out of sight mid phrase, it finished the word before stopping", stoppedAt > 0 && (stoppedAt === away.line.length || /\s/.test(away.line[stoppedAt - 1])), `stopped after "${away.started}"`)
  await sleep(1000)
  const still = await sa.js(STARTED)
  check("and stays there while out of sight", still.styles === away.styles)
  const resumed = await sa.js(`new Promise((done) => {
    const l = document.querySelector("[data-hero-line]")
    const count = () => [...l.children].filter((c) => c.style.opacity !== "0").length
    const k0 = count()
    window.scrollTo(0, 0)
    const t0 = performance.now()
    const tick = () => { if (count() !== k0) return done({ ms: performance.now() - t0, k0 }); if (performance.now() - t0 > 4000) return done({ ms: Infinity, k0 }); requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })`)
  const due = Math.max(...typing.timelines.map((tl) => Math.max(...tl.reveal.slice(1).map((r, i) => r - tl.reveal[i]))))
  check("back on screen, the next letter comes within one interval", resumed.ms <= due + 34, `${resumed.ms.toFixed(0)}ms after it came back (the longest interval is ${due.toFixed(0)}ms; the old typing waited 2600ms)`)
  await sa.close()

  /* Who is looking: each label, the link, and the width that never changes. */
  const widths = []
  for (const [hash, label, href] of [["guest", "Start Now", "/sell"], ["buyer", "Start Creating", "/sell"], ["creator", "Dashboard", "/app"], ["creator-late", "Dashboard", "/app"]]) {
    const q = await page({ ...size, hash })
    await sleep(hash.includes("late") ? 700 : 100)
    const c = await q.js(`(() => { const a = document.querySelector("[data-hero-cta]"); return { href: a.getAttribute("href"), text: [...a.querySelectorAll("[data-hero-cta-label]")].find((x) => getComputedStyle(x).visibility === "visible").textContent, w: a.getBoundingClientRect().width, cls: window.__cls } })()`)
    widths.push(c.w)
    check(`${hash}: ${label}, to ${href}`, c.text === label && c.href === href, `${c.text} -> ${c.href}, ${c.w.toFixed(1)}px wide, CLS ${c.cls}`)
    await q.close()
  }
  check("the button is one width whoever is looking", new Set(widths.map((w) => w.toFixed(2))).size === 1, widths.map((w) => w.toFixed(1)).join(", "))

  /* The entrance: every part in place and fully shown within 600ms of the first paint. */
  const e = await page({ ...size, hash: "guest", ready: "true" })
  const entrance = await e.js(`(() => {
    const parts = [...document.querySelectorAll("[data-hero-enter]")]
    const anims = parts.flatMap((p) => p.getAnimations())
    const ends = anims.map((a) => { const t = a.effect.getComputedTiming(); return t.delay + t.duration })
    return { parts: parts.length, anims: anims.length, end: Math.max(0, ...ends), props: [...new Set(anims.flatMap((a) => a.effect.getKeyframes().flatMap((k) => Object.keys(k).filter((x) => !["offset", "easing", "composite", "computedOffset"].includes(x)))))] }
  })()`)
  check("the entrance: each part rises and fades in, all of it within 600ms, transform and opacity only", entrance.parts === 5 && entrance.anims === 5 && entrance.end <= 600 && entrance.props.every((x) => x === "opacity" || x === "transform"),
    `${entrance.parts} parts, last ends at ${entrance.end}ms, animating ${entrance.props.join(", ")}`)
  await e.close()

  /* Reduced motion: the first phrase, still; the slider, still; no entrance. */
  const r = await page({ ...size, hash: "guest", reduced: true })
  const r1 = await r.js(STATE); await sleep(5000); const r2 = await r.js(STATE)
  check("reduced motion: the slider does not autoplay", r1.transforms === r2.transforms)
  check("reduced motion: the heading is the first phrase, whole", r2.shown === typing.phrases[0] && r1.shown === r2.shown, JSON.stringify(r2.shown))
  check("reduced motion: no caret", await r.js(`document.querySelector("[data-hero-line]").children.length === 0 && !document.querySelector("[data-hero-caret]")`))
  check("reduced motion: no entrance", await r.js(`[...document.querySelectorAll("[data-hero-enter]")].every((p) => p.getAnimations().length === 0)`))
  await r.close()

  /* The header above the page, signed in as a seller: Dashboard, and no bell on storelib.com's own pages. */
  const READ_BAR = `(() => {
    const root = document.getElementById("platform-header-root")
    const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest("[aria-hidden=true]") }
    return {
      bell: [...root.querySelectorAll("[aria-label^=Notifications]")].filter(shown).length,
      dashboard: [...root.querySelectorAll("[data-header-dashboard]")].filter(shown).length,
    }
  })()`
  const home = await page({ ...size, path: "/header.html", hash: "path=/&who=seller", ready: "document.getElementById('platform-header-root')" })
  await sleep(900)
  const hb = await home.js(READ_BAR)
  await home.close()
  check("signed in as a seller on storelib.com: no bell in the header", hb.bell === 0 && (size.phone || hb.dashboard === 1), `${hb.bell} bells, ${hb.dashboard} Dashboard`)
  if (!size.phone) {
    const ex = await page({ ...size, path: "/header.html", hash: "path=/explore&who=seller", ready: "document.getElementById('platform-header-root')" })
    await sleep(900)
    const eb = await ex.js(READ_BAR)
    await ex.close()
    check("while Explore's header still has it", eb.bell === 1, `${eb.bell} bell`)
  }
}

/* The gap between the header's foot and the panel's top, and the panel's insets from the window's sides (round 12). */
const GAPS = `(() => {
  const h = document.getElementById("platform-header-root").getBoundingClientRect()
  const p = document.querySelector("[data-hero-panel]").getBoundingClientRect()
  return { top: p.top - h.bottom, left: p.left, right: document.documentElement.clientWidth - p.right }
})()`

/* ── THE HEADER'S DARK STYLE (round AC1) ───────────────────────────────── */
if (ONLY !== "hero") {
  console.log("\n── The header in its dark style (/admin), in both of the site's looks ──")
  const DARK_BG = /BUYER_HEADER_DARK_BG = "(#[0-9a-f]{6})"/.exec(readFileSync(join(root, "lib/platform/header-chrome.ts"), "utf8"))[1]
  const want = [1, 3, 5].map((i) => parseInt(DARK_BG.slice(i, i + 2), 16))
  const close = (a, b, tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol)
  /* The colour most of the bar is, from a screenshot: the surface, whatever is drawn on it. */
  const modeOf = (img, x0, y0, x1, y1) => {
    const n = new Map()
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) { const k = img.px(x, y).join(","); n.set(k, (n.get(k) ?? 0) + 1) }
    return [...n.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number)
  }
  for (const size of [{ width: 390, height: 844, phone: true }, { width: 1280, height: 860, phone: false }]) {
    for (const look of ["light", "dark"]) {
      for (const [name, path] of [["storelib.com", "/"], ["Explore", "/explore"], ["a product page", "/ava/film-presets"]]) {
        const q = await page({ ...size, path: "/header.html", hash: `path=${path}&who=seller&tone=dark&look=${look}`, ready: "document.getElementById('platform-header-root')" })
        await sleep(800)
        const r = await q.js(`(() => { const root = document.getElementById("platform-header-root"); const b = root.getBoundingClientRect(); return { tone: root.dataset.headerTone, h: b.height, root: getComputedStyle(root).backgroundColor, header: getComputedStyle(root.querySelector("header")).backgroundColor, sl: document.documentElement.hasAttribute("data-sl-dark") } })()`)
        const img = await q.shot({ x: 0, y: 0, width: size.width, height: Math.max(8, Math.floor(r.h) - 2) })
        const bar = modeOf(img, 0, 0, img.w, img.h)
        if (process.env.HERO_SHOTS) {
          const { data } = await q.call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: size.width, height: Math.min(size.height, 260), scale: 1 } })
          writeFileSync(join(process.env.HERO_SHOTS, `header-dark-${look}-look-${path.replace(/\W+/g, "_")}-${size.width}.png`), Buffer.from(data, "base64"))
        }
        check(`${size.width}px, ${look} look, ${name}: the dark bar is ${DARK_BG}, not grey`, r.tone === "dark" && r.sl === (look === "dark") && close(bar, want), `bar rgb(${bar.join(",")}), root ${r.root}, header ${r.header}`)
        if (size.phone && path === "/") {
          /* Its menu: open it, and the bar above the sheet stays the same near black. */
          const opened = await q.js(`(() => { const b = document.querySelector("#platform-header-root button[aria-label='Open menu']"); if (!b) return false; b.click(); return true })()`)
          await sleep(700)
          /* The sheet's scrim lies over the bar, so the bar's own colour is read, not its pixels. */
          const m = await q.js(`(() => ({ open: !!document.querySelector("button[aria-label='Close menu']"), bg: getComputedStyle(document.getElementById("platform-header-root")).backgroundColor }))()`)
          const mbar = parseColor(m.bg).rgb
          if (process.env.HERO_SHOTS) {
            const { data } = await q.call("Page.captureScreenshot", { format: "png" })
            writeFileSync(join(process.env.HERO_SHOTS, `header-dark-${look}-look-menu-${size.width}.png`), Buffer.from(data, "base64"))
          }
          check(`${size.width}px, ${look} look: with its menu open the bar is still ${DARK_BG}`, opened && m.open && close(mbar, want), `menu ${m.open ? "open" : "not open"}, bar ${m.bg}`)
        }
        await q.close()
      }
    }
    /* The hero under the header (round AC1: "decrease a little bit more the vertical space between the header and the hero"). It was 28px on a phone and 32px on a computer (a 20px curved edge, then 8 or 12). */
    for (const tone of ["light", "dark"]) {
      const q = await page({ ...size, path: "/header.html", hash: `path=/&who=guest&tone=${tone}`, ready: "document.querySelector('[data-hero-panel]')" })
      await sleep(600)
      const g = await q.js(`(() => { const h = document.getElementById("platform-header-root").getBoundingClientRect(); const p = document.querySelector("[data-hero-panel]").getBoundingClientRect(); return { gap: p.top - h.bottom, edge: !!document.querySelector("[data-header-concave]") } })()`)
      if (process.env.HERO_SHOTS) {
        const { data } = await q.call("Page.captureScreenshot", { format: "png" })
        writeFileSync(join(process.env.HERO_SHOTS, `header-${tone}-home-${size.width}.png`), Buffer.from(data, "base64"))
      }
      check(`${size.width}px, ${tone} header: the hero starts 8 to 14px under it`, g.gap >= 8 && g.gap <= 14 && !g.edge, `${g.gap.toFixed(1)}px${g.edge ? ", with the curved edge" : ""}`)
      /* Changed on purpose (round 12, the owner): the panel's sides are no longer the header's content edges but the same gap as the one under the header. */
      const e = await q.js(GAPS)
      check(`${size.width}px, ${tone} header: the panel's left and right inset equal the gap under the header (round 12)`, Math.abs(e.left - e.top) <= 1 && Math.abs(e.right - e.top) <= 1, `top ${e.top.toFixed(1)}, left ${e.left.toFixed(1)}, right ${e.right.toFixed(1)}px`)
      await q.close()
    }
  }
}

if (ONLY !== "hero") {
  /*
    ONE GAP ALL ROUND, AT EVERY WIDTH AND ZOOM (round 12, the owner: "as I zoom out in the browser, it should not change
    the padding of the left, right or top", and the sides match the gap under the header). Browser zoom z on a window W
    screen pixels wide is a page W / z CSS px wide drawn at z device pixels per CSS px, so each zoom level is that page
    at that scale; the gaps are read in screen pixels (CSS px times z). At every width and zoom the three are equal
    (within a screen pixel and a half: rounding), and from 50% to 125% each is the size it is at 100% (within 1.5).
  */
  console.log("\n── The panel's gaps, by width and browser zoom ──")
  const ZOOMS = [0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5]
  for (const W of [1600, 1440, 1280, 1024]) {
    const seen = []
    for (const z of ZOOMS) {
      const q = await page({ width: Math.round(W / z), height: Math.round(900 / z), phone: false, dpr: z, path: "/header.html", hash: `path=/&who=guest&tone=light`, ready: "document.querySelector('[data-hero-panel]')" })
      await sleep(500)
      const e = await q.js(GAPS)
      const px = { top: e.top * z, left: e.left * z, right: e.right * z }
      seen.push({ z, ...px })
      if (process.env.HERO_SHOTS && (W === 1440 || W === 1024)) {
        const { data } = await q.call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: Math.round(W / z), height: Math.round(900 / z), scale: 1 } })
        writeFileSync(join(process.env.HERO_SHOTS, `zoom-${W}-${Math.round(z * 100)}.png`), Buffer.from(data, "base64"))
      }
      check(`${W}px window at ${Math.round(z * 100)}%: left and right equal the gap under the header`, Math.abs(px.left - px.top) <= 1.5 && Math.abs(px.right - px.top) <= 1.5, `top ${px.top.toFixed(1)}, left ${px.left.toFixed(1)}, right ${px.right.toFixed(1)} screen px`)
      await q.close()
    }
    const at100 = seen.find((r) => r.z === 1)
    const steady = seen.filter((r) => r.z <= 1.25)
    check(`${W}px window: from 50% to 125% zoom the gaps stay the size they are at 100%`, steady.every((r) => Math.abs(r.top - at100.top) <= 1.5 && Math.abs(r.left - at100.left) <= 1.5), seen.map((r) => `${Math.round(r.z * 100)}%: ${r.top.toFixed(1)}/${r.left.toFixed(1)}`).join(", "))
  }
  for (const tone of ["light", "dark"]) {
    const q = await page({ width: 390, height: 844, phone: true, path: "/header.html", hash: `path=/&who=guest&tone=${tone}`, ready: "document.querySelector('[data-hero-panel]')" })
    await sleep(600)
    const e = await q.js(GAPS)
    check(`390px, ${tone} header: left and right equal the gap under the header`, Math.abs(e.left - e.top) <= 1 && Math.abs(e.right - e.top) <= 1, `top ${e.top.toFixed(1)}, left ${e.left.toFixed(1)}, right ${e.right.toFixed(1)}px`)
    await q.close()
  }

  /* THE DARK HEADER'S DEPTH (round AD5: "pitch black with no depth"). */
  console.log("\n── The dark header's depth ──")
  const lumOf = (c) => { const [r, g, b] = parseColor(c).rgb; return 0.2126 * r + 0.7152 * g + 0.0722 * b }
  for (const size of [{ width: 390, height: 844, phone: true }, { width: 1280, height: 860, phone: false }]) {
    for (const look of ["light", "dark"]) {
      for (const [name, path] of [["Explore", "/explore"], ["a product page", "/ava/film-presets"], ["the library", "/account/library/courses"], ["a creator page", "/ava"]]) {
        const q = await page({ ...size, path: "/header.html", hash: `path=${path}&who=seller&tone=dark&look=${look}`, ready: "document.getElementById('platform-header-root')" })
        await sleep(700)
        const top = await q.js(`(() => { const root = document.getElementById("platform-header-root"); const hd = root.querySelector("header"); const c = getComputedStyle(hd); return { bar: getComputedStyle(root).backgroundColor, page: getComputedStyle(document.querySelector("main")).backgroundColor, border: c.borderBottomWidth + " " + c.borderBottomColor, shadow: getComputedStyle(root).boxShadow, scrolled: root.hasAttribute("data-scrolled") } })()`)
        await q.js("window.scrollTo(0, 240)")
        await sleep(400)
        const down = await q.js(`(() => { const root = document.getElementById("platform-header-root"); return { shadow: getComputedStyle(root).boxShadow, scrolled: root.hasAttribute("data-scrolled") } })()`)
        if (process.env.HERO_SHOTS) {
          const { data } = await q.call("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 240, width: size.width, height: 200, scale: 1 } })
          writeFileSync(join(process.env.HERO_SHOTS, `header-depth-${look}-${path.replace(/\W+/g, "_")}-${size.width}.png`), Buffer.from(data, "base64"))
        }
        const alpha = parseColor(top.border.split(" ").slice(1).join(" ")).a
        const step = lumOf(top.bar) - lumOf(DEPTH_PANEL)
        check(`${size.width}px, ${look} look, ${name}: the bar is a step above the hero's black and has a hairline`, step >= 4 && parseFloat(top.border) >= 1 && alpha >= 0.06, `bar ${top.bar} (luma +${step.toFixed(1)} over the panel), page ${top.page}, line ${top.border}`)
        if (look === "dark") check(`${size.width}px, dark look, ${name}: the bar is lighter than the page under it`, lumOf(top.bar) > lumOf(top.page), `bar ${top.bar}, page ${top.page}`)
        check(`${size.width}px, ${look} look, ${name}: scrolled, it casts a soft shadow it did not have at the top`, !top.scrolled && down.scrolled && down.shadow !== top.shadow && /10px 28px -10px/.test(down.shadow), `top: ${top.shadow.slice(0, 70)}; scrolled: ${down.shadow.slice(0, 110)}`)
        await q.close()
      }
    }
  }
}

/* THE LINK IN BIO SLIDE IS THREE PEOPLE (round AD5): the source it is drawn from names three, each once, in three themes. */
{
  console.log("\n── The link in bio pages behind the slide ──")
  const src = readFileSync(join(root, "scripts/render-hero-shots.tsx"), "utf8")
  const bios = [...src.matchAll(/^\s{2}(\w+): \{\n\s+name: "([^"]+)", slug: "([^"]+)", bio: "([^"]+)", avatar: "([^"]+)", theme: "([^"]+)"/gm)].map((m) => ({ key: m[1], name: m[2], slug: m[3], avatar: m[5], theme: m[6] }))
  const shots = readFileSync(join(root, "scripts/hero-shots.mjs"), "utf8")
  const who = (shots.match(/const BIO_PEOPLE = \[([^\]]+)\]/) || [])[1]?.match(/"(\w+)"/g)?.map((x) => x.slice(1, -1)) ?? []
  const unique = (xs) => new Set(xs).size === xs.length
  check("three people, three names, three pictures, three themes: no name repeated", bios.length === 3 && unique(bios.map((b) => b.name)) && unique(bios.map((b) => b.slug)) && unique(bios.map((b) => b.avatar)) && unique(bios.map((b) => b.theme)) && who.length === 3 && who.every((k) => bios.some((b) => b.key === k)), bios.map((b) => `${b.name} (${b.theme})`).join(", "))
}

ws.close()
proc.kill()
server.close()
rmSync(out, { recursive: true, force: true })
console.log(`\n${passed} passed, ${failed} failed\n`)
process.exit(failed ? 1 : 0)
