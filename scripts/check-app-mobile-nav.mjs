/**
 * ===========================================================================
 *  THE PHONE'S NAVIGATION, MEASURED AND PHOTOGRAPHED
 * ===========================================================================
 * The hamburger left the top left corner and the menu became a pill at the
 * bottom with a page behind it. Every claim in that sentence is geometry or
 * motion, so none of it is settled by reading the source:
 *
 *   IS IT REACHABLE. The reason it moved is that the old control sat in the
 *     corner of a 390x844 screen furthest from a thumb. The new one has to be
 *     near the bottom, centred, and clear of the home indicator, and every
 *     target in it has to be at least 44px.
 *
 *   IS IT GLASS. "Very frosty, glass like" is a backdrop-filter that is
 *     actually applied and actually masked — a blur that ends on a hard line
 *     is the thing that reads as a panel bolted to the bottom of the screen.
 *
 *   IS IT LIGHT. Explicitly not the dark menu in the reference. So the menu
 *     page is measured against the page it covers, not described.
 *
 *   DOES IT MOVE ON THE COMPOSITOR. "Open smooth, close smooth, extremely
 *     200fps" is transform and opacity and nothing else. A transition that
 *     lists `height`, `top` or `width` relayouts every frame.
 *
 *   AND IS ANYTHING LEFT UNDERNEATH IT. A fixed pill takes no space in the
 *     flow, so the last row of every list would sit under it without a rule
 *     that says otherwise.
 *
 * It also writes a picture of both states, because the last line of CLAUDE.md
 * is to look at the result.
 *
 *   pnpm build && node scripts/check-app-mobile-nav.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import { appCss } from "./probe-css.mjs"

/**
 * ===========================================================================
 *  READING THE ACTUAL PIXELS
 * ===========================================================================
 * "The background is still solid there."
 *
 * Every check here so far has been about what the bar DECLARES — an alpha, a
 * backdrop-filter, a mask. None of them can answer whether the thing you end
 * up looking at lets anything through, because a 28% white over a white page
 * and a 100% white over a white page are the same pixel.
 *
 * So the question becomes an experiment: put a strong colour behind the bar,
 * photograph it, change the colour, photograph it again. If the pixel inside
 * the bar moved, the page is coming through it. If it did not, it is a panel,
 * whatever its stylesheet says.
 *
 * Chromium hands back a PNG, and node has zlib but no PNG reader, so this is
 * the smallest one that can read what Chromium writes: 8 bits a channel, no
 * interlacing, the five standard filters.
 */
function decodePng(buf) {
  let pos = 8, width = 0, height = 0, depth = 0, colorType = 0
  const parts = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString("ascii", pos + 4, pos + 8)
    const data = buf.subarray(pos + 8, pos + 8 + len)
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; colorType = data[9] }
    else if (type === "IDAT") parts.push(data)
    else if (type === "IEND") break
    pos += 12 + len
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!channels || depth !== 8) fail(`unreadable screenshot: colour type ${colorType}, ${depth} bits`)
  const raw = inflateSync(Buffer.concat(parts))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let p = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[p++]
    const line = raw.subarray(p, p + stride)
    p += stride
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.subarray(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev[x]
      const c = x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const guess = a + b - c
        const pa = Math.abs(guess - a), pb = Math.abs(guess - b), pc = Math.abs(guess - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
  }
  return { width, height, channels, data: out }
}

/** The average colour of a photograph, which is all this needs. */
function averageColour(png) {
  let r = 0, g = 0, b = 0, n = 0
  for (let i = 0; i < png.data.length; i += png.channels) {
    r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n++
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}
const distance = (a, b) => Math.round(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]))
/** How far apart the lightest and darkest pixels are: a blur pulls them together. */
function contrastOf(png) {
  let lo = 255, hi = 0
  for (let i = 0; i < png.data.length; i += png.channels) {
    const l = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
    if (l < lo) lo = l
    if (l > hi) hi = l
  }
  return Math.round(hi - lo)
}

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
/* A build's stylesheet when there is one, else the same globals.css compiled from source. */
const css = await appCss(root)

const VIEW_W = 390
const VIEW_H = 844
const shots = join(root, ".nav-probe")
mkdirSync(shots, { recursive: true })

/* The stubs live INSIDE the repo: esbuild resolves "react" from the nearest
   node_modules, and a file in /tmp has none above it. */
const out = mkdtempSync(join(tmpdir(), "storelib-navpill-"))
/*
 * usePathname USED TO BE A CONSTANT HERE, and that is why this probe called
 * the bar clean while the report kept coming back. In the shell, pressing an
 * icon calls router.push and the pathname CHANGES a moment later, which
 * re-renders the pill with a new `current` and retires the remembered pick.
 * None of that happened here: the harness recorded the href and left the
 * pathname where it was, so the second half of every press went untested.
 *
 * So it subscribes, the way the real hook does, and the fixture moves it
 * after a delay the probe sets — which is the only thing a router does that
 * this component can see.
 */
writeFileSync(join(shots, "navigation.js"), `import { useSyncExternalStore } from "react"
const subs = new Set()
if (!globalThis.__path) globalThis.__path = "/app"
globalThis.__goto = (p) => { globalThis.__path = p; for (const f of [...subs]) f() }
const read = () => globalThis.__path || "/app"
export const usePathname = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, read, read)
export const __unusedPathname = () => globalThis.__path || "/app"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(shots, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
`)
/* The bar ticks once per slot crossed and once on commit; recorded rather
   than swallowed, because "it should be haptic when I click on some icon" is
   a claim about calls that are made. */
writeFileSync(join(shots, "native-bridge.js"), `export function hapticTap(strength) { (globalThis.__haptics = globalThis.__haptics || []).push(strength || "light") }
export function isNativeApp() { return false }
export function openExternal() {}
export async function triggerHaptic() {}
export function nativePlatform() { return "web" }
export async function nativeLogOut() {}
`)

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-app-mobile-nav.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(shots, "link.jsx")}`,
  `--alias:next/navigation=${join(shots, "navigation.js")}`,
  `--alias:@/lib/native-bridge=${join(shots, "native-bridge.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

writeFileSync(join(out, "index.html"),
  `<!doctype html><html class="light app-layout"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style>` +
  `<style>body{margin:0;font-family:Inter,system-ui,sans-serif}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});` +
  `window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── the browser ─────────────────────────────────────────────────────────── */
const profile = mkdtempSync(join(tmpdir(), "storelib-navpill-profile-"))
const chrome = spawn(CHROMIUM, [
  "--headless=new", "--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--allow-file-access-from-files",
  `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*",
  `--window-size=${VIEW_W},${VIEW_H}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
const reap = () => { try { chrome.kill("SIGKILL") } catch {} }
for (const sig of ["exit", "SIGINT", "SIGTERM"]) process.on(sig, reap)

const portFile = join(profile, "DevToolsActivePort")
let port = null
for (let i = 0; i < 80 && !port; i++) {
  if (existsSync(portFile)) {
    const first = readFileSync(portFile, "utf8").split("\n")[0].trim()
    if (first) port = Number(first)
  }
  if (!port) await sleep(250)
}
if (!port) { reap(); fail("Chromium never reported a debugging port.") }
let version = null
for (let i = 0; i < 40 && !version; i++) {
  try { version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() } catch { await sleep(250) }
}
if (!version) { reap(); fail("Chromium did not answer on its port.") }

const ws = new WebSocket(version.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.addEventListener("open", r, { once: true }); ws.addEventListener("error", j, { once: true }) })
let id = 0
const pending = new Map()
ws.addEventListener("message", (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg.result ?? {}); pending.delete(msg.id) }
})
let sessionId = null
const send = (method, params = {}, session = sessionId) =>
  new Promise((resolve) => { const n = ++id; pending.set(n, resolve); ws.send(JSON.stringify({ id: n, method, params, ...(session ? { sessionId: session } : {}) })) })
const ev = async (expr) => {
  const { result, exceptionDetails } = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })
  if (exceptionDetails) fail(`the page threw: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`)
  return result?.value
}
const shoot = async (name) => {
  const { data } = await send("Page.captureScreenshot", { format: "png" })
  if (data) writeFileSync(join(shots, name), Buffer.from(data, "base64"))
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" }, null)
sessionId = (await send("Target.attachToTarget", { targetId, flatten: true }, null)).sessionId
await send("Page.enable")
await send("Runtime.enable")
await send("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 2, mobile: true })
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
await send("Page.navigate", { url: `file://${join(out, "index.html")}` })
await sleep(1600)

const ran = await ev("!!window.__ran")
if (!ran) { const t = await ev("window.__threw || (window.__err||[])[0] || null"); reap(); fail(`the harness never rendered: ${t}`) }
/* `render()` can return without throwing while the tree inside it did, so
   what matters is whether the bar is actually on the page. */
const painted = await ev(`!!document.querySelector('nav[aria-label="Main"]')`)
if (!painted) {
  const why = await ev("JSON.stringify({ threw: window.__threw || null, errors: (window.__err||[]).slice(0,3), html: document.getElementById('app').innerHTML.slice(0,200) })")
  reap(); fail(`the bar never rendered: ${why}`)
}

/* ── what is on screen with the menu shut ────────────────────────────────── */
const READ_PILL = `(() => {
  const pill = document.querySelector('nav[aria-label="Main"]')
  const band = document.querySelector('[data-app-nav-pill] > [aria-hidden="true"]')
  const b = pill.getBoundingClientRect()
  const ps = getComputedStyle(pill)
  const controls = [...pill.querySelectorAll("a[aria-label]"), document.querySelector('[data-app-nav-pill] button[aria-label="Menu"], [data-app-nav-pill] button[aria-label="Close menu"]')]
  const targets = controls.map((c) => {
    const r = c.getBoundingClientRect()
    return { label: c.getAttribute("aria-label"), w: Math.round(r.width), h: Math.round(r.height) }
  })
  /* What a finger at the middle of each target would actually hit. The bar
     answers presses itself, so a link inside it is expected to be covered by
     the bar rather than by anything else. */
  const hits = controls.map((c) => {
    const r = c.getBoundingClientRect()
    const el = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
    return { label: c.getAttribute("aria-label"), reaches: !!(el && (c.contains(el) || c.parentElement?.contains(el))) }
  })
  const scroller = document.querySelector(".app-content-scroll")
  return {
    pill: { x: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height),
            bottomGap: Math.round(window.innerHeight - b.bottom),
            /* The bar and the menu button are two objects; together they are
               what sits in the middle of the screen. */
            centred: (() => {
              const btn = document.querySelector('[data-app-nav-pill] button[aria-label="Menu"]').getBoundingClientRect()
              const left = Math.min(b.left, btn.left)
              const right = Math.max(b.right, btn.right)
              return Math.abs((left + right) / 2 - window.innerWidth / 2) <= 1
            })(),
            gapToButton: (() => {
              const btn = document.querySelector('[data-app-nav-pill] button[aria-label="Menu"]').getBoundingClientRect()
              return Math.round(btn.left - b.right)
            })(),
            radius: ps.borderRadius, bg: ps.backgroundColor, shadow: ps.boxShadow.slice(0, 120) },
    docWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    selector: (() => {
      const dot = pill.querySelector('span[aria-hidden="true"]')
      const d = dot.getBoundingClientRect()
      const st = getComputedStyle(dot)
      return { w: Math.round(d.width), h: Math.round(d.height), radius: st.borderRadius, bg: st.backgroundColor,
               moves: st.transitionProperty }
    })(),
    glass: { backdrop: ps.backdropFilter || ps.webkitBackdropFilter },
    /* Nothing under the bar may carry a backdrop-filter AND a mask: WKWebView
       drops the mask and paints the filtered region as a flat fill. */
    maskedBlurs: [...document.querySelectorAll("[data-app-nav-pill], [data-app-nav-pill] *")].filter((n) => {
      const st = getComputedStyle(n)
      const blur = st.backdropFilter || st.webkitBackdropFilter || "none"
      const mask = st.maskImage || st.webkitMaskImage || "none"
      return blur !== "none" && mask !== "none"
    }).length,
    /* The fade is full width by design. What it may not be is a plate: no
       layer in it may carry a mask, and none may have an opaque fill. */
    fade: (() => {
      const fade = document.querySelector("[data-app-nav-fade]")
      if (!fade) return null
      const layers = [...fade.querySelectorAll("*")]
      const masked = layers.filter((n) => { const st = getComputedStyle(n); return (st.maskImage || st.webkitMaskImage || "none") !== "none" }).length
      const opaque = layers.filter((n) => {
        const bg = getComputedStyle(n).backgroundColor
        const m = bg.match(/rgba?\\(([^)]+)\\)/)
        if (!m) return false
        const parts = m[1].split(",").map((v) => Number.parseFloat(v))
        return parts.length < 4 || parts[3] >= 0.999
      }).length
      const steps = layers.filter((n) => /blur\\(/.test(getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter || "")).length
      /*
        A stadium has a straight top and bottom; an ellipse has no straight
        edge anywhere. Every BLUR layer of the halo has to be the second —
        those are the rings, and a straight one would draw a line across the
        screen where its blur stops.

        The tint is not one of them and is not counted. It used to be an
        ellipse too, which is why this could once look at everything inside
        the halo; it is a full-width vertical ramp now, and it has no edge to
        round because it reaches zero opacity at the top and runs off the
        screen at the sides and the bottom. Counting it here reported a
        straight edge that nobody can see.
      */
      const straight = [...fade.querySelectorAll("[data-app-nav-fade-step]")]
        .filter((n) => getComputedStyle(n).borderRadius !== "50%").length
      /* The blur each layer carries, outermost first. */
      const radii = layers
        .map((n) => /blur\\(([\\d.]+)px\\)/.exec(getComputedStyle(n).backdropFilter || getComputedStyle(n).webkitBackdropFilter || ""))
        .filter(Boolean).map((m) => Number.parseFloat(m[1]))
      const r = fade.getBoundingClientRect()
      return { h: Math.round(r.height), w: Math.round(r.width), belowScreen: Math.round(r.bottom - window.innerHeight),
               layers: layers.length, masked, opaque, steps, straight, radii }
    })(),
    targets, hits,
    scrollPadBottom: scroller ? getComputedStyle(scroller).paddingBottom : null,
    /* Is the last card clear of the pill when the list is scrolled to its end? */
    lastCardClear: (() => {
      const s = document.querySelector(".app-content-scroll")
      s.scrollTop = s.scrollHeight
      const cards = document.querySelectorAll("[data-card]")
      const last = cards[cards.length - 1].getBoundingClientRect()
      const p = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
      return Math.round(p.top - last.bottom)
    })(),
    headerHasHamburger: !!document.querySelector("header [aria-label='Open menu'], header [aria-label='Close menu']"),
    settingsWhenShut: (() => {
      const b = document.querySelector('[data-app-nav-pill] button[aria-label="Settings"]')
      if (!b) return null
      const st = getComputedStyle(b)
      return { opacity: Number(st.opacity), hittable: st.pointerEvents !== "none", tab: b.tabIndex }
    })(),
  }
})()`
const shut = await ev(READ_PILL)
await ev('document.querySelector(".app-content-scroll").scrollTop = 0')
await sleep(120)
await shoot("closed.png")

/**
 * ===========================================================================
 *  WHERE AN ICON'S INK ACTUALLY IS
 * ===========================================================================
 * "Still a bump in the icons."
 *
 * Every measurement so far has been of a BOX — the link's rect, the glyph
 * span's rect, the circle's translate — and boxes do not move here. But each
 * icon is two glyphs stacked in one box and cross-faded: a line one while the
 * tab is off, a filled one while it is on. Nothing makes those two put their
 * ink in the same place. A stroke sits astride its path, so it reaches half a
 * stroke further out than the fill of the same path does; and where the two
 * are separate drawings they can differ by more than that.
 *
 * So this reads the photograph instead. Ink is any pixel dark enough not to
 * be the bar, and what comes back is the box that ink occupies and where its
 * weight sits. If an icon's ink box moves when the tab turns on, the icon
 * moves when you press it, whatever its layout box says.
 */
function inkBox(png, threshold = 190) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  let sx = 0, sy = 0, w = 0
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (y * png.width + x) * png.channels
      const l = 0.2126 * png.data[i] + 0.7152 * png.data[i + 1] + 0.0722 * png.data[i + 2]
      if (l >= threshold) continue
      const weight = threshold - l
      if (x < x0) x0 = x
      if (y < y0) y0 = y
      if (x > x1) x1 = x
      if (y > y1) y1 = y
      sx += x * weight; sy += y * weight; w += weight
    }
  }
  if (!w) return null
  return {
    left: x0, top: y0, right: x1, bottom: y1,
    width: x1 - x0 + 1, height: y1 - y0 + 1,
    cx: Math.round((sx / w) * 100) / 100, cy: Math.round((sy / w) * 100) / 100,
  }
}
const inkOf = async (clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
  return inkBox(decodePng(Buffer.from(data, "base64")))
}

const shotOf = async (clip) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
  return averageColour(decodePng(Buffer.from(data, "base64")))
}

/*
 * ── A COLUMN OF PIXELS, TOP TO BOTTOM ────────────────────────────────────
 *
 * The two-colour test above says the bar is transparent, and it was still
 * reported as solid. A single square cannot find a PLATE: a region that is
 * a different colour from the page with an edge across the screen. So this
 * reads a strip down the left margin, clear of the bar and of every card,
 * and prints what colour the screen is at each height.
 *
 * If the numbers are the same all the way down there is no plate, whatever
 * anything looks like. If they step at one y, that y is the edge.
 */
await ev(`document.querySelector(".app-content-scroll").scrollTop = 1e6; true`)
await sleep(400)
const column = []
for (let y = 300; y < VIEW_H - 6; y += 12) {
  column.push({ y, rgb: await shotOf({ x: 4, y, width: 6, height: 6 }) })
}
await ev(`document.querySelector(".app-content-scroll").scrollTop = 0; true`)
await sleep(300)
const pageColour = column[0].rgb
const plateSteps = column.filter((c) => distance(c.rgb, pageColour) > 2)

/*
 * ── DOES THE FADE BLUR, AND DOES IT BLUR MORE TOWARD THE BOTTOM ──────────
 *
 * Fine stripes go behind the whole foot of the screen: 2px black, 2px white.
 * Photographed sharp they are full contrast; photographed through a blur the
 * two pull toward one grey. The contrast of the stripes is therefore a
 * measure of how much blur is over them, and it is read in three places:
 * well above the fade, at the top of the fade, and at the bottom, beside the
 * bar. A fade that blurs reads lower at the bottom than above; one that
 * fades reads lower at the bottom than at the top.
 */
await ev(`(() => {
  const el = document.createElement("div")
  el.id = "__stripes"
  el.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:400px;z-index:1;background:repeating-linear-gradient(to bottom,#000 0 2px,#fff 2px 4px)"
  document.body.appendChild(el)
  return true
})()`)
await sleep(300)
/*
  The halo is centred on the screen and reaches 22px above the bar, so it is
  read on the bar's own vertical: well above the halo, just inside its top
  edge, and in the 8px gap between the bar and the menu button, where most of
  its layers overlap and nothing else is drawn.
*/
const fadeBox = await ev(`(() => {
  const f = document.querySelector("[data-app-nav-fade]").getBoundingClientRect()
  const b = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  const m = document.querySelector('[data-app-nav-pill] button[aria-label="Menu"]').getBoundingClientRect()
  return { top: Math.round(f.top), x: Math.round(b.left + b.width / 2), gapX: Math.round((b.right + m.left) / 2),
           barMid: Math.round(b.top + b.height / 2),
           underTop: Math.round(b.bottom), underH: Math.max(4, Math.round(window.innerHeight - b.bottom)) }
})()`)
/* Every one of these has to sit INSIDE the viewport. A clip that runs off
   the bottom comes back padded, and padding against a white page reads as
   maximum contrast: a sample three pixels from the bottom edge reported the
   strip under the pill as untouched when it is not. */
const contrastBox = async (x, y, width, height) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x, y, width, height, scale: 1 }, captureBeyondViewport: false })
  return contrastOf(decodePng(Buffer.from(data, "base64")))
}
const contrastAt = (x, y) => contrastBox(x - 3, y - 8, 6, 16)
const blur = {
  above: await contrastAt(fadeBox.x, fadeBox.top - 50),
  top: await contrastAt(fadeBox.x, fadeBox.top + 6),
  bottom: await contrastAt(fadeBox.gapX, fadeBox.barMid),
  /* And the screen's left edge, which the halo now has to REACH: "spread
     full width in the left and right". Softened there, and less than at the
     bar, because that is where the ellipse is thinning out. */
  margin: await contrastAt(6, fadeBox.barMid),
  /* And the strip between the bottom of the pill and the bottom of the
     screen, which is where the home indicator sits and where the halo used
     to stop short. In a browser that strip is only the pill's 6px lift; on a
     phone the safe-area inset makes it about 40, and it is the same ellipse
     covering both. */
  under: await contrastBox(fadeBox.x - 8, fadeBox.underTop, 16, fadeBox.underH),
}
await ev(`document.getElementById("__stripes").remove(); true`)
await sleep(200)

/* ── is it glass, or is it a white panel? ────────────────────────────────── */
/*
 * A block of colour is slid under the bar and then changed. Two photographs
 * of the same 20x20 square between two of the bar's glyphs: if the page is
 * coming through, the square is a different colour in each.
 */
const swatchBox = await ev(`(() => {
  const el = document.createElement("div")
  el.id = "__swatch"
  /* Under the bar, which is z-55, and over the page. */
  el.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:130px;z-index:1;background:#c62828"
  document.body.appendChild(el)
  const a = document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')
  const one = a[0].getBoundingClientRect(), two = a[1].getBoundingClientRect()
  /* The gap BETWEEN two glyphs, so no ink is in the sample. */
  const x = Math.round((one.right + two.left) / 2)
  const y = Math.round(one.top + one.height / 2)
  return { x: x - 5, y: y - 5, width: 10, height: 10 }
})()`)
await sleep(260)
const onRed = await shotOf(swatchBox)
await ev(`document.getElementById("__swatch").style.background = "#1565c0"; true`)
await sleep(260)
const onBlue = await shotOf(swatchBox)
/* And beside the bar, where the page has nothing over it at all. */
const asideBox = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  return { x: 6, y: Math.round(bar.top + bar.height / 2) - 5, width: 10, height: 10 }
})()`)
const asideOnBlue = await shotOf(asideBox)
await ev(`document.getElementById("__swatch").style.background = "#c62828"; true`)
await sleep(260)
const asideOnRed = await shotOf(asideBox)
await ev(`document.getElementById("__swatch").remove(); true`)
await sleep(260)
/*
 * ── AND THE FADE IS NOT A PLATE ──────────────────────────────────────────
 * Over a strong colour the fade proves it is transparent. Over the page's
 * own near-white it has to prove something else: that it does not LIGHTEN
 * what is behind it. A blur that brightens a flat colour draws a paler
 * rectangle across the foot of the screen, with a visible top edge, which is
 * the plate that gets reported as "the background is still solid".
 *
 * Both samples are taken beside the bar, on plain page, one inside the fade
 * and one well above its top edge.
 */
const plainBox = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  return {
    inside: { x: 6, y: Math.round(bar.top + bar.height / 2) - 5, width: 10, height: 10 },
    above: { x: 6, y: Math.round(bar.top) - 150, width: 10, height: 10 },
  }
})()`)
const insideFade = await shotOf(plainBox.inside)
const aboveFade = await shotOf(plainBox.above)
const seeThrough = {
  onRed, onBlue, moved: distance(onRed, onBlue), aside: distance(asideOnRed, asideOnBlue),
  insideFade, aboveFade, plate: distance(insideFade, aboveFade),
}

/* ── a finger slid along it ──────────────────────────────────────────────── */
/*
 * "The new iOS feeling, like I can drag left and right", and "it should be
 * haptic when I click on some icon to navigate to it".
 *
 * Both are things that happen DURING a gesture, so both are driven: press on
 * the first slot, slide to the fourth, watch where the circle is at each step,
 * and read off what was navigated to and how many times it ticked.
 */
const SLOT_W = await ev(`(() => {
  const a = document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')
  return Math.round(a[1].getBoundingClientRect().left - a[0].getBoundingClientRect().left)
})()`)
const slots = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]')
  return [...bar.querySelectorAll("a[aria-label]")].map((a) => {
    const r = a.getBoundingClientRect()
    return { label: a.getAttribute("aria-label"), x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })
})()`)
await ev("globalThis.__haptics = []; window.__went = null; window.__dotAt = []; true")
const dot = `(() => { const d = document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]').getBoundingClientRect(); return Math.round((d.left + d.right) / 2) })()`
/*
 * ── WATCHING IT EVERY FRAME, FROM INSIDE THE PAGE ────────────────────────
 *
 * Asking the browser where the circle is over CDP costs a round trip, so a
 * trail sampled that way is a dozen coarse, unevenly spaced readings — and a
 * press that lasts as long as ten of those round trips is not a tap. A real
 * one is over in about four frames, which is the whole point: what CSS is
 * handed on the lift is whatever distance the frame loop had not covered yet,
 * and a slow press leaves it nothing to get wrong.
 *
 * So the recording happens in the page, on its own frames, and is read out
 * once at the end. `translate` rather than a rect, because that is the
 * property the loop and the transition both write, and computed style reports
 * it mid-transition.
 */
await ev(`window.__rec = () => {
  const d = document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]')
  window.__trail = []
  window.__scale = []
  window.__alpha = []
  window.__glass = []
  const tick = () => {
    const cs = getComputedStyle(d)
    const m = /^(-?[\\d.]+)px/.exec(cs.translate || "")
    if (m) window.__trail.push(Math.round(Number.parseFloat(m[1]) * 100) / 100)
    /* Its SIZE, which nothing here has ever looked at. The circle grows
       under a finger, and a press is a finger. */
    /* The alpha of the glass painted in it, which is a different thing from
       how opaque the element is — see the note by ARRIVING_FILL. */
    const bg = /([\\d.]+)\\s*\\)$/.exec((cs.backgroundColor || "").replace(/\\s/g, ""))
    window.__glass.push(bg ? Math.round(Number.parseFloat(bg[1]) * 1000) / 1000 : 1)
    const sc = cs.scale && cs.scale !== "none" ? Number.parseFloat(cs.scale) : 1
    window.__scale.push(Math.round((Number.isFinite(sc) ? sc : 1) * 1000) / 1000)
    /* And how visible it is, which is what says whether a change of position
       could have been seen happening. */
    window.__alpha.push(Math.round(Number.parseFloat(cs.opacity || "1") * 1000) / 1000)
    window.__recFrame = requestAnimationFrame(tick)
  }
  window.__recFrame = requestAnimationFrame(tick)
}
window.__stop = () => { cancelAnimationFrame(window.__recFrame); return window.__trail }
true`)
/*
 * How far past its destination the circle went, measured in the direction it
 * was travelling. THE OLD VERSION OF THIS ONLY LOOKED THE OTHER WAY — back
 * towards the fingertip — so a bounce past the slot scored zero and the
 * probe called the bar clean while it was still bumping.
 */
const pastTarget = (trail, from, to) => {
  if (!trail.length) return 0
  const furthest = to >= from ? Math.max(...trail) : Math.min(...trail)
  return Math.round(Math.abs(Math.max(0, (to >= from ? furthest - to : to - furthest))) * 100) / 100
}
const turns = (trail) => trail.filter((v, i) => {
  if (i < 2) return false
  const a = v - trail[i - 1]
  const b = trail[i - 1] - trail[i - 2]
  return a * b < 0 && Math.abs(a) > 0.2 && Math.abs(b) > 0.2
}).length
await ev("window.__rec()")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[0].x, y: slots[0].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(80)
const dragTrail = [await ev(dot)]
for (let i = 1; i <= 12; i++) {
  const x = Math.round(slots[0].x + ((slots[3].x - slots[0].x) * i) / 12)
  await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: slots[0].y, radiusX: 12, radiusY: 12, force: 1 }] })
  await sleep(24)
  dragTrail.push(await ev(dot))
}
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(700)
const dragFrames = await ev("window.__stop()")
const dragScaleFrames = await ev("window.__scale.slice()")
const dragScale = {
  grew: Math.round((Math.max(...dragScaleFrames) - Math.min(...dragScaleFrames)) * 1000) / 1000,
  biggest: Math.max(...dragScaleFrames),
}
const drag = {
  trail: dragTrail,
  frames: dragFrames,
  /* A released drag is the gesture the bounce was asked for, so it has to
     still be there: this is what stops "a tap does not bounce" from being
     satisfied by taking the bounce out altogether. */
  past: pastTarget(dragFrames, dragFrames[0], dragFrames[dragFrames.length - 1]),
  travelled: dragTrail[dragTrail.length - 1] - dragTrail[0],
  distinct: new Set(dragTrail).size,
  monotonic: dragTrail.every((v, i) => i === 0 || v >= dragTrail[i - 1] - 1),
  went: await ev("window.__went"),
  haptics: await ev("(globalThis.__haptics || []).slice()"),
  target: slots[3],
}
/*
 * ── AND A TAP IS NOT A ONE-PIXEL DRAG ─────────────────────────────────────
 *
 * "When I click on an icon to navigate they have a glitch, moving,
 * misaligned, bump like."
 *
 * The press used to aim the circle at the point the FINGER landed on rather
 * than at the slot, so a tap set it travelling towards a spot a dozen or
 * twenty pixels off-centre, got part of the way in the time a tap lasts, and
 * was then written to the slot's centre on the lift. Out and back, by a
 * distance that depends on where in the slot you hit.
 *
 * THE TEST ABOVE COULD NOT SEE IT, because it taps slots[2].x — the exact
 * centre of the slot, where the fingertip and the destination are the same
 * point and there is nothing to travel to. A finger does not do that. This
 * one lands near the slot's inner edge, which is what makes the two
 * destinations differ, and watches every frame in between.
 *
 * Monotonic is the whole assertion: a circle going to one place passes each
 * point once. One that sets off for the fingertip and is then corrected to
 * the slot reverses, and a reversal is the bump.
 */
await ev("window.__went = null; true")
const OFF_CENTRE = Math.round(SLOT_W / 2) - 6
const tapAt = slots[1].x - OFF_CENTRE
/*
 * A TAP LASTS ABOUT FOUR FRAMES. Holding for a fifth of a second lets the
 * frame loop arrive on its own and leaves CSS nothing to fumble, which is
 * how the last version of this passed a bar that still bumped.
 */
const DOT_PX = await ev(`Math.round(document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]').getBoundingClientRect().height)`)
await ev("window.__rec()")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: tapAt, y: slots[1].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(60)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(800)
const tapFrames = await ev("window.__stop()")
const tapScale = await ev("window.__scale.slice()")
const tapAlpha = await ev("window.__alpha.slice()")
const tapGlass = await ev("window.__glass.slice()")
const tap = {
  frames: tapFrames,
  from: tapFrames[0],
  landed: tapFrames[tapFrames.length - 1],
  finger: tapAt,
  /* Past the slot in the direction it was going: the bounce. */
  past: pastTarget(tapFrames, tapFrames[0], tapFrames[tapFrames.length - 1]),
  /* And back the other way, towards the fingertip: the old aim. */
  backwards: (() => {
    const from = tapFrames[0]
    const to = tapFrames[tapFrames.length - 1]
    return Math.round(Math.max(0, to >= from ? from - Math.min(...tapFrames) : Math.max(...tapFrames) - from) * 100) / 100
  })(),
  turns: turns(tapFrames),
  /*
    THE LENS IS HANDED OVER, NOT THROWN, AND THIS IS THE PROPERTY THAT SAYS SO.
    It dips almost out of sight, is put down on the new slot while it is
    faint, and comes back up — so on every frame where its position changes,
    it has to be down at the floor. A position change at full opacity is a
    jump somebody can see, which is the abruptness being fixed; a slide would
    be a whole run of them.
  */
  seenMoving: (() => {
    let worst = 0
    for (let i = 1; i < tapFrames.length; i++) {
      if (Math.abs(tapFrames[i] - tapFrames[i - 1]) > 0.5) worst = Math.max(worst, tapAlpha[i] ?? 1, tapAlpha[i - 1] ?? 1)
    }
    return Math.round(worst * 100) / 100
  })(),
  dimmestTo: Math.round(Math.min(...tapAlpha) * 100) / 100,
  /*
    THE GLASS ARRIVES, AND THE ELEMENT NEVER FADES. Two different numbers on
    purpose. `dimmestTo` is the element's opacity, which must not move at all;
    these are the alpha of the colour painted inside it, which is what takes
    its time. A lens that simply appeared at full strength is what read as too
    direct, and a lens that dipped out and came back is the flicker that read
    as cheap. This is neither: one colour, one direction, one curve — the
    ink's.
  */
  emptiedTo: Math.round(Math.min(...tapGlass) * 100) / 100,
  filledTo: Math.round(tapGlass[tapGlass.length - 1] * 100) / 100,
  /* How many distinct values it passes through on the way in. A colour that
     ramps has many; one that is switched on has two. */
  glassSteps: new Set(tapGlass.filter((v) => v > 0.02 && v < 0.8)).size,
  /*
    HOW FAR THE MOVE IS FROM THE MOMENT THERE IS NO COLOUR IN IT, in frames.

    Asking what the glass read ON the frame the position changed was the
    obvious thing and it is not measurable here: the window with no colour in
    it is one frame wide, and a sampler running one reading per frame lands
    either side of it as often as on it. So this asks the question the window
    can actually answer — was the move at the empty moment — and the depth of
    the empty is held separately by emptiedTo.
  */
  movedFromEmpty: (() => {
    let moveAt = -1
    for (let i = 1; i < tapFrames.length; i++) {
      if (Math.abs(tapFrames[i] - tapFrames[i - 1]) > 0.5) { moveAt = i; break }
    }
    let emptyAt = 0
    for (let i = 1; i < tapGlass.length; i++) if (tapGlass[i] < tapGlass[emptyAt]) emptyAt = i
    return moveAt < 0 ? 99 : Math.abs(moveAt - emptyAt)
  })(),
  /*
    HOW LONG AFTER THE TOUCH THE LENS IS ON THE ICON YOU PRESSED. "It is too
    delayed" was the dip taking 120ms to go down before the lens could be
    moved at all.

    MEASURING WHEN ANYTHING FIRST CHANGES WOULD NOT HAVE CAUGHT THAT, and that
    was the first version of this: the dip's opacity starts easing on the frame
    the finger lands however long the dip is, so it read ~17ms both before and
    after. What was being waited on is the ARRIVAL, so that is what is timed.
    Frames are ~16.7ms apart.
  */
  arrivedMs: (() => {
    const x0 = tapFrames[0]
    for (let i = 1; i < tapFrames.length; i++) if (Math.abs(tapFrames[i] - x0) > 0.5) return Math.round(i * 16.7)
    return Math.round(tapFrames.length * 16.7)
  })(),
  backTo: Math.round(tapAlpha[tapAlpha.length - 1] * 100) / 100,
  /*
    HOW MANY PLACES IT WAS SEEN IN ON THE WAY. A press puts the circle on the
    icon that was pressed, on the frame it was pressed: two values in the
    whole recording, the slot it left and the slot it went to, and nothing in
    between for the eye to follow across the bar. Let a press animate and this
    reads 14, with the overshoot visible in the middle of them.
  */
  waypoints: (() => {
    const from = tapFrames[0]
    const to = tapFrames[tapFrames.length - 1]
    const lo = Math.min(from, to), hi = Math.max(from, to)
    return new Set(tapFrames.filter((v) => v > lo + 0.5 && v < hi - 0.5)).size
  })(),
  /*
    AND HOW BIG IT GOT. The circle carries `scale: dragging ? 1.06 : 1`, and
    `dragging` is true from POINTER-DOWN — so a plain tap grows it six per
    cent and shrinks it back, 400ms of movement with no finger travelling
    anywhere. Every measurement in this file until now read `translate` and
    called that clean.
  */
  grew: Math.round((Math.max(...tapScale) - Math.min(...tapScale)) * 1000) / 1000,
  biggest: Math.max(...tapScale),
  /* In pixels across, which is what an eye actually sees. */
  grewPx: Math.round((Math.max(...tapScale) - Math.min(...tapScale)) * DOT_PX * 100) / 100,
}
/* Where the circle sits at rest on each slot, read rather than derived, so
   "it landed on the slot" is measured against the bar's own arithmetic. */
const restOn = await ev(`(() => {
  const d = document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]')
  const m = /^(-?[\\d.]+)px/.exec(getComputedStyle(d).translate || "")
  return m ? Math.round(Number.parseFloat(m[1]) * 100) / 100 : null
})()`)
tap.restOff = Math.round(Math.abs(tap.landed - restOn) * 100) / 100

/*
 * ── AND NOW THE HALF THIS PROBE NEVER TESTED: THE ROUTE ARRIVING ─────────
 *
 * "It bumps, moves a little, for no reason." Pressing an icon is two events,
 * not one. The press moves the circle, and then a moment later the page
 * changes underneath it — `current` moves to the slot the pick had been
 * standing in for, and the remembered pick is retired. Both are re-renders
 * of the pill, and either could move the circle a second time.
 *
 * Until now the harness recorded the href and left the pathname alone, so
 * every check here stopped at the lift. This one lets the route land 260ms
 * later, the way a warm route does, and keeps watching for a second and a
 * half: the question is whether anything moves AFTER the tap is over.
 */
await ev('window.__routeDelay = 260; window.__went = null; true')
await ev("window.__rec()")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[2].x - 17, y: slots[2].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(60)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(1500)
const routeFrames = await ev("window.__stop()")
const FRAME_MS = 16.7
/* When it last moved by more than a fifth of a pixel, in ms from the press. */
let lastMove = 0
for (let i = 1; i < routeFrames.length; i++) if (Math.abs(routeFrames[i] - routeFrames[i - 1]) > 0.2) lastMove = i
const routeTap = {
  frames: routeFrames,
  from: routeFrames[0],
  landed: routeFrames[routeFrames.length - 1],
  past: pastTarget(routeFrames, routeFrames[0], routeFrames[routeFrames.length - 1]),
  turns: turns(routeFrames),
  quietAfter: Math.round(lastMove * FRAME_MS),
  arrived: await ev("globalThis.__path"),
}
await ev('window.__routeDelay = 0; globalThis.__goto("/app"); true')
await sleep(400)

/*
 * ── AND WITH THE ROUTE COSTING WHAT A ROUTE COSTS ────────────────────────
 *
 * Pressing an icon sets a whole new page rendering on the same thread the bar
 * animates on. So the two compete, every single press, and whichever way it
 * goes is decided by how heavy the page you pressed happens to be — which is
 * what "sometimes" and "for no reason" in the report sound like from inside.
 *
 * THIS CHECK USED TO ASSERT THAT THE CIRCLE KEPT MOVING through that, because
 * back then a press sent it sliding across the bar and a starved frame loop
 * was the thing to catch. There is no slide now: the lens is handed over,
 * holding still by design for the length of the dip. So the old assertion
 * fired on correct behaviour, and asserting continuous motion would now be
 * asserting the very thing that was removed.
 *
 * What is still worth knowing is what it was always really about: that a busy
 * thread cannot stop the hand-over finishing. It has to arrive on the slot
 * and it has to come back up to full, whatever else the phone is doing.
 */
await ev('window.__routeDelay = 260; window.__navCost = 260; window.__went = null; true')
await ev("window.__rec()")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[3].x - 17, y: slots[3].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(60)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(1800)
const busyFrames = await ev("window.__stop()")
const steps = busyFrames.slice(1).map((v, i) => Math.round(Math.abs(v - busyFrames[i]) * 100) / 100)
/* The first frame it is within a pixel of where it ends up, and whether it
   moved again after that. */
const done = busyFrames[busyFrames.length - 1]
let arrivedAt = busyFrames.findIndex((v) => Math.abs(v - done) <= 1)
if (arrivedAt < 0) arrivedAt = busyFrames.length
const busy = {
  frames: busyFrames,
  steps,
  landed: done,
  /* When it got there, in ms from the press. Frames are ~16.7ms apart. */
  arrivedMs: Math.round(arrivedAt * 16.7),
  /* The biggest jump it made after the first time it got near the slot. */
  lateJump: Math.max(0, ...steps.slice(arrivedAt)),
  turns: turns(busyFrames),
}
await ev('window.__routeDelay = 0; window.__navCost = 0; globalThis.__goto("/app"); true')
await sleep(400)

/*
 * ── AND THE GLYPH IS NEVER CAUGHT HALFWAY ────────────────────────────────
 *
 * "When I unclick the other icon it moves the icon a little bit."
 *
 * Nothing about the layout moves when a tab changes: the button, the glyph
 * box and both glyphs all measure zero across a whole press, every frame. The
 * movement was inside the drawing. The outline and the solid are two
 * different drawings, so fading one through the other makes every frame of
 * the fade a shape that is neither — on Products, 40x40 going in, 40x39
 * halfway, 39x38 coming out.
 *
 * A state with no duration cannot be seen moving, so the glyph swaps in one
 * frame. This watches both glyphs of all four icons through a real press and
 * a real route change: every reading has to be all the way on or all the way
 * off. A fraction anywhere is a frame of a shape that is neither.
 */
/*
 * HOW FAR THROUGH THE CROSS-FADE, AND WHETHER THE PAIR EVER GOES LIGHT.
 *
 * This reader has been rewritten twice, once per redesign of the fill, and
 * each time it took the number the design happened to have. It read the two
 * glyphs' OPACITIES when one was shown and the other hidden; then it read
 * the CLIPS, because the band made all three fully opaque and reading
 * opacity would have seen three glyphs at 1 and called it a blend.
 *
 * It is a cross-fade again, so it reads opacity again — but the old question
 * ("is either glyph part-painted?") is the wrong one now, because in a
 * cross-fade both always are. The question that matters is whether the PAIR
 * holds up while the two trade:
 *
 *   `sum` is outline + ink. Two complements sum to 1 at every moment. Below
 *   1 is the pair going light, which is the dip thrown out twice and
 *   reported as cheap; above 1 is both drawings at once, the dark blob.
 *
 *   `ink` is how far through the fade the solid is, 0 to 1, which is what
 *   says the fill sweeps rather than jumping.
 */
const OPACITIES = `(() => {
  const links = [...document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')]
  const alpha = (el) => el ? +Number(getComputedStyle(el).opacity).toFixed(2) : null
  const read = (l) => {
    const ink = alpha(l.querySelector('[data-part="ink"]'))
    const out = alpha(l.querySelector('[data-part="outline"]'))
    if (ink == null || out == null) return { ink: null, sum: null }
    return { ink, sum: Math.round((ink + out) * 100) / 100 }
  }
  return {
    box: links.map((l) => +Number(getComputedStyle(l.querySelector("span")).opacity).toFixed(2)),
    svgAlpha: links.flatMap((l) => [...l.querySelectorAll("svg")].map((sv) => +Number(getComputedStyle(sv).opacity).toFixed(2))),
    ink: links.map((l) => read(l).ink),
    sum: links.map((l) => read(l).sum),
  }
})()`
await ev('window.__routeDelay = 260; window.__went = null; true')
const opTrail = [await ev(OPACITIES)]
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[2].x - 14, y: slots[2].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(50)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
for (let i = 0; i < 40; i++) { opTrail.push(await ev(OPACITIES)); await sleep(12) }
/* How far the pair ever strays from summing to 1: the pair going light, or
   both drawings painted at once. */
const worstSum = Math.round(Math.max(0, ...opTrail.flatMap((f) => f.sum).filter((v) => v != null).map((v) => Math.abs(v - 1))) * 100) / 100
/* The widest the two clips ever disagree, as a fraction of the box. Anything
   above zero is a band showing both drawings at once, or neither. */
/* Readings caught mid-fade, which is what says it sweeps rather than jumps. */
const fadeSteps = new Set(opTrail.flatMap((f) => f.ink).filter((v) => v != null && v > 0.02 && v < 0.98)).size
/* How many distinct positions the edge is caught in while it sweeps. An edge
   that sweeps has many; a glyph that switches has two. */

/*
  AND THE SWAP HAPPENS WHERE IT IS FAINT. The two drawings are not the same
  shape, so the frame the glyph changes on is a frame the shape changes on.
  Dimming the box around it through the change is what keeps that from being
  something to look at, and this is where that is held to: on every frame a
  glyph changes, how visible was the box it sits in.
*/
const swapSeenAt = Math.round(Math.min(...opTrail.flatMap((f) => f.box)) * 100) / 100
const boxDippedTo = Math.round(Math.min(...opTrail.flatMap((f) => f.box)) * 100) / 100
/* And when the glyph actually changed, from the same recording. Readings are
   ~12ms apart here, and the trail starts on the frame of the touch. */
const swapAtMs = (() => {
  for (let f = 1; f < opTrail.length; f++) {
    for (let i = 0; i < opTrail[f].ink.length; i++) {
      if (opTrail[f].ink[i] != null && Math.abs(opTrail[f].ink[i] - opTrail[0].ink[i]) > 0.02) return Math.round(f * 12)
    }
  }
  return Math.round(opTrail.length * 12)
})()
const boxBackTo = Math.round(Math.min(...opTrail[opTrail.length - 1].box) * 100) / 100
await ev('window.__routeDelay = 0; globalThis.__goto("/app"); true')
await sleep(400)

/*
 * ── AND NOW THE ICONS THEMSELVES, PHOTOGRAPHED ON AND OFF ────────────────
 *
 * Each of the four is shot twice: once with its own tab on, once with the
 * tab next to it on. Same box, same screen position, the only difference is
 * which of the two stacked glyphs is showing. Whatever the ink does between
 * those two photographs is what the eye sees when you press the icon.
 */
await ev('window.__routeDelay = 0; true')
const iconBoxes = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]')
  return [...bar.querySelectorAll("a[aria-label]")].map((a) => {
    const g = a.querySelector("span").getBoundingClientRect()
    return { label: a.getAttribute("aria-label"), x: g.left, y: g.top, width: g.width, height: g.height }
  })
})()`)
const ROUTES = ["/app", "/app/orders", "/app/products", "/app/analytics"]
const inkWhen = []
for (let on = 0; on < 4; on++) {
  await ev(`globalThis.__goto(${JSON.stringify(ROUTES[on])}); true`)
  await sleep(500)
  const row = []
  for (const box of iconBoxes) row.push(await inkOf({ x: box.x - 2, y: box.y - 2, width: box.width + 4, height: box.height + 4 }))
  inkWhen.push(row)
}
/*
 * ── DOES THE BAR ANSWER A FINGER AT ALL ──────────────────────────────────
 *
 * Every moving thing was taken out of a press one at a time, and the last of
 * them left a control that does nothing when you touch it. So the lens
 * brightens under a finger — no size, no position, nothing that can be a
 * pixel out — and this is where that is checked.
 *
 * The important half is the SHAPE of it. The old lift eased in over 200ms and
 * a tap lasts sixty, so it was cut off at a different point every time, which
 * is why a press looked like a different amount of something on every press.
 * Full on the frame the finger lands, eased only on the way off, is the same
 * press whether it is held for a frame or a second — so what is asserted is
 * that there is NO transition going on and there IS one coming off, not just
 * that the colour differs.
 */
const LENS = `(() => {
  const d = document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]')
  const cs = getComputedStyle(d)
  const r = d.getBoundingClientRect()
  /* The shorthand drops a zero duration entirely, so it cannot answer "is
     this instant" — the per-property lists can. */
  const props = cs.transitionProperty.split(",").map((v) => v.trim())
  const durs = cs.transitionDuration.split(",").map((v) => v.trim())
  const at = props.indexOf("background-color")
  return { fill: cs.backgroundColor, ease: cs.transition,
           fillFor: at < 0 ? null : durs[at % durs.length],
           w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 }
})()`
/*
  PRESSED ON THE SLOT IT IS ALREADY ON, and that matters. Pressing a
  different one starts the lens arriving — its glass emptied and filling over
  the ink's curve — and reading the brightening through that measures the
  arrival instead, which is how this check came to report "nothing happening"
  and "it eases in" on a bar doing both correctly. The brightening is what a
  press does when there is nothing else to do, so it is measured there.
*/
await ev('globalThis.__goto("/app"); true')
await sleep(500)
const atRest = await ev(LENS)
await ev("globalThis.__haptics = []; true")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[0].x, y: slots[0].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(20)
const held = await ev(LENS)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
const tapTicks = await ev("(globalThis.__haptics || []).slice()")
await sleep(500)
const letGo = await ev(LENS)
await ev('globalThis.__goto("/app"); true')
await sleep(400)
const lit = (c) => { const m = /([\d.]+)\s*\)$/.exec(String(c).replace(/\s/g, "")); return m ? Number(m[1]) : 1 }
const lens = {
  rest: atRest.fill, held: held.fill, back: letGo.fill, heldEase: held.ease, backEase: letGo.ease,
  brighter: Math.round((lit(held.fill) - lit(atRest.fill)) * 100) / 100,
  heldFor: held.fillFor, backFor: letGo.fillFor,
  /* Going on, background-color carries a zero duration; coming off, a real one. */
  instantOn: held.fillFor === "0s",
  easedOff: Number.parseFloat(letGo.fillFor || "0") >= 0.2,
  grew: Math.round((held.w - atRest.w) * 100) / 100,
  ticks: tapTicks,
}

await ev('globalThis.__goto("/app"); true')
await sleep(400)
/* For each icon: its ink with its own tab on, against its ink with the
   neighbouring tab on. In screen pixels — the shots are taken at 2x, so a
   whole device pixel is half of one of these. */
const icons = iconBoxes.map((box, i) => {
  const on = inkWhen[i][i]
  const off = inkWhen[(i + 1) % 4][i]
  if (!on || !off) return { label: box.label, missing: true }
  return {
    label: box.label,
    movedX: Math.round(Math.abs(on.cx - off.cx) * 100) / 100,
    movedY: Math.round(Math.abs(on.cy - off.cy) * 100) / 100,
    grewW: on.width - off.width,
    grewH: on.height - off.height,
    edges: Math.max(Math.abs(on.left - off.left), Math.abs(on.right - off.right),
                    Math.abs(on.top - off.top), Math.abs(on.bottom - off.bottom)),
  }
})
console.log("\n  the icons, on against off (2x pixels, so one device pixel is two)")
for (const ic of icons) {
  console.log(`  ${ic.label.padEnd(10)} ink box ${ic.grewW >= 0 ? "+" : ""}${ic.grewW} x ${ic.grewH >= 0 ? "+" : ""}${ic.grewH}, worst edge ${ic.edges}, centre of weight moved ${ic.movedX}x ${ic.movedY}y`)
}
console.log("")

await ev("window.__went = null; true")

/* Put it back on Home so the screenshot below is the resting state. */
await ev("window.__went = null; true")

/*
 * ── AND IT DOES NOT SPRING BACK AFTERWARDS ────────────────────────────────
 *
 * The glitch. Lift the finger and the drag's own answer is thrown away, so
 * until the route resolves the circle is drawn on whatever slot the CURRENT
 * path says — which is the one you just left. It springs back to it, waits,
 * and then travels to the slot you picked a second time. How far back and
 * for how long depend on how quickly the route lands, which is why it reads
 * as random.
 *
 * This harness's path never changes at all, so it is the worst case: with
 * the pick forgotten the circle goes back to the first slot and stays there.
 * Sampled every frame for half a second after the lift.
 */
await ev("window.__went = null; true")
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: slots[2].x, y: slots[2].y, radiusX: 12, radiusY: 12, force: 1 }] })
await sleep(60)
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
/*
  WHERE IT IS, AND WHETHER IT CAN BE SEEN THERE. The lens is handed between
  slots by dipping out of sight, moving, and coming back, so for the length
  of the dip it is legitimately still standing on the slot it is leaving.
  Reading position alone cannot tell that apart from the spring-back this
  check exists to catch, and it used to score the hand-over as a 53px return.
  So each reading carries how visible it was, and the faint ones are not
  somewhere the circle was ever seen.
*/
const after = []
for (let i = 0; i < 16; i++) {
  await sleep(32)
  after.push(await ev(`(() => {
    const d = document.querySelector('nav[aria-label="Main"] span[aria-hidden="true"]')
    const r = d.getBoundingClientRect()
    return { x: Math.round((r.left + r.right) / 2), a: Math.round(Number.parseFloat(getComputedStyle(d).opacity || "1") * 100) / 100 }
  })()`))
}
const seenAt = after.filter((f) => f.a > 0.3).map((f) => f.x)
const settled = {
  samples: after.map((f) => `${f.x}@${f.a}`),
  target: slots[2].x,
  /* How far BACK it went, counting only where it could be seen. With the pick
     forgotten this is a whole slot or more; the few pixels left are the tail
     of the settle still arriving. */
  wentBack: seenAt.length ? Math.round(slots[2].x - Math.min(...seenAt)) : 0,
  /* And where it ends up once the spring has finished. */
  rest: Math.round(Math.max(...after.slice(6).map((f) => Math.abs(f.x - slots[2].x)))),
  went: await ev("window.__went"),
}
await ev("window.__went = null; true")

/*
 * ── THE GLASS UNDER A FINGER, EVERY FRAME, IN THE NATIVE SHELL ───────────
 *
 * "When I release a button and move to the next one, exactly at that moment
 * the button icon glitches and moves a little bit", and the bubble "should
 * feel more like glass, smoother, cleaner, and accurate when I land on
 * something". Three numbers answer that, read in the page on every frame of
 * a slide from Home to Products that holds still and then lets go:
 *
 *   TRACKING    how far the lens's centre is from the finger once the pick
 *               up is over: one to one is under a pixel
 *   LANDING     how far the lens's centre is from the slot's centre once the
 *               spring has finished: under half a pixel
 *   THE ICONS   how far any glyph's centre moved, and how far its link's
 *               opacity fell, across every frame of the press, the slide and
 *               the release, with `html.capacitor` on <html> as the native
 *               apps have it, so its `a:active` dimming is in play: nothing,
 *               not even half a pixel. The icon touched gives a little and
 *               springs back about its own centre (to about 0.9, through
 *               about 1.03, to exactly 1); no other icon changes size.
 *
 * And the stretch: never more than about 1.15 wide, lift included, and a
 * drop's settle when the finger stops: a slight squash, then round
 * (DROP_TRACE=1 prints the drop's own width, frame by frame).
 */
await ev('globalThis.__goto("/app"); window.__routeDelay = 0; true')
await sleep(1700)
await ev('document.documentElement.classList.add("capacitor"); window.__routeDelay = 220; window.__went = null; true')
await sleep(120)
const glassSlots = await ev(`(() => {
  const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  const links = [...document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')].map((a) => { const r = a.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  return { links, lo: bar.left + ${4} + (bar.height - ${8}) / 2, hi: bar.right - ${4} - (bar.height - ${8}) / 2 }
})()`)
await ev(`(() => {
  window.__finger = null
  window.__glassFrames = []
  window.addEventListener("pointermove", (e) => { window.__finger = e.clientX }, true)
  window.addEventListener("pointerdown", (e) => { window.__finger = e.clientX }, true)
  const nav = document.querySelector('nav[aria-label="Main"]')
  const lens = nav.querySelector('span[aria-hidden="true"]')
  const links = [...nav.querySelectorAll("a[aria-label]")]
  const glyphs = links.flatMap((a) => [...a.querySelectorAll("svg")])
  const tick = () => {
    const r = lens.getBoundingClientRect()
    window.__glassFrames.push({
      t: performance.now(),
      finger: window.__finger,
      cx: r.left + r.width / 2,
      w: r.width,
      h: r.height,
      /* The drop's own shape: the transform's horizontal scale, without the lift (a separate property). */
      sx: (() => { const t = getComputedStyle(lens).transform; return t.startsWith("matrix(") ? Number.parseFloat(t.slice(7)) : 1 })(),
      glyphs: glyphs.map((g) => { const b = g.getBoundingClientRect(); return [b.left, b.top, b.width, b.height] }),
      linkOpacity: links.map((a) => Number(getComputedStyle(a).opacity)),
    })
    window.__glassRaf = requestAnimationFrame(tick)
  }
  window.__glassRaf = requestAnimationFrame(tick)
  return true
})()`)
const touch = (type, x, y) => send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, radiusX: 12, radiusY: 12, force: 1 }] })
const gy = glassSlots.links[0].y
const gFrom = glassSlots.links[0].x
const gTo = glassSlots.links[2].x
const tDown = await ev("performance.now()")
await touch("touchStart", gFrom, gy)
await sleep(40)
for (let i = 1; i <= 20; i++) {
  await touch("touchMove", Math.round(gFrom + ((gTo - gFrom) * i) / 20), gy)
  await sleep(16)
  if (i === 12 && process.env.PILL_SHOTS) {
    const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 20, y: VIEW_H - 110, width: 350, height: 110, scale: 2 } })
    writeFileSync(join(process.env.PILL_SHOTS, "pill-drag.png"), Buffer.from(data, "base64"))
  }
}
/* Still, under the finger, before letting go. */
await sleep(160)
const tUp = await ev("performance.now()")
await touch("touchEnd", gTo, gy)
await sleep(900)
if (process.env.PILL_SHOTS) {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 20, y: VIEW_H - 110, width: 350, height: 110, scale: 2 } })
  writeFileSync(join(process.env.PILL_SHOTS, "pill-landed.png"), Buffer.from(data, "base64"))
}
const glassFrames = await ev("cancelAnimationFrame(window.__glassRaf); window.__glassFrames")
const landedOn = await ev(`(() => {
  const nav = document.querySelector('nav[aria-label="Main"]')
  const lens = nav.querySelector('span[aria-hidden="true"]').getBoundingClientRect()
  const slot = nav.querySelectorAll("a[aria-label]")[2].getBoundingClientRect()
  return { dx: Math.round(Math.abs(lens.left + lens.width / 2 - (slot.left + slot.width / 2)) * 1000) / 1000, dy: Math.round(Math.abs(lens.top + lens.height / 2 - (slot.top + slot.height / 2)) * 1000) / 1000 }
})()`)
/*
  A synthetic touch here does not always leave `:active` on the link it
  landed on, so the dimming is also read with the state forced, on a pill
  icon and, as the control that proves the native rule is in play, on an
  ordinary link beside it.
*/
await send("DOM.enable")
await send("CSS.enable")
const { root: docRoot } = await send("DOM.getDocument", { depth: -1 })
await ev(`(() => { const a = document.createElement("a"); a.id = "__ctl"; a.href = "#"; a.textContent = "control"; a.style.cssText = "position:fixed;top:120px;left:10px"; document.body.appendChild(a); return true })()`)
const pillLinkIds = (await send("DOM.querySelectorAll", { nodeId: docRoot.nodeId, selector: 'nav[aria-label="Main"] a[aria-label]' })).nodeIds
const ctlId = (await send("DOM.querySelector", { nodeId: docRoot.nodeId, selector: "#__ctl" })).nodeId
await send("CSS.forcePseudoState", { nodeId: pillLinkIds[1], forcedPseudoClasses: ["active"] })
await send("CSS.forcePseudoState", { nodeId: ctlId, forcedPseudoClasses: ["active"] })
await sleep(300)
const forcedActive = await ev(`({ pill: Number(getComputedStyle(document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')[1]).opacity), control: Number(getComputedStyle(document.getElementById("__ctl")).opacity) })`)
await send("CSS.forcePseudoState", { nodeId: pillLinkIds[1], forcedPseudoClasses: [] })
await send("CSS.forcePseudoState", { nodeId: ctlId, forcedPseudoClasses: [] })
await ev('document.getElementById("__ctl").remove(); true')
await ev('document.documentElement.classList.remove("capacitor"); true')
const clampFinger = (x) => Math.max(glassSlots.lo, Math.min(glassSlots.hi, x))
/* Once the pick up is over: from 150ms after the drag began to the lift. */
const dragBegan = glassFrames.find((f) => f.finger != null && Math.abs(f.finger - gFrom) > 8)?.t ?? tDown
const tracked = glassFrames.filter((f) => f.t >= dragBegan + 150 && f.t <= tUp && f.finger != null)
const errs = tracked.map((f) => Math.abs(f.cx - clampFinger(f.finger)))
const sortedErrs = [...errs].sort((a, b) => a - b)
const firstGlyphs = glassFrames[0].glyphs
/* A glyph's CENTRE, which is what moving is: the icon touched gives a
   little under the finger (A TAP HAS A LITTLE GIVE), a scale about its own
   centre, so its box changes size and its centre does not. The two glyphs
   of the icon touched are the first two; every other glyph keeps its box
   exactly. */
let glyphMoved = 0
let othersResized = 0
let pulseMin = 1
let pulseMax = 1
for (const f of glassFrames) f.glyphs.forEach((g, i) => {
  const g0 = firstGlyphs[i]
  glyphMoved = Math.max(glyphMoved, Math.abs(g[0] + g[2] / 2 - (g0[0] + g0[2] / 2)), Math.abs(g[1] + g[3] / 2 - (g0[1] + g0[3] / 2)))
  if (i < 2) { pulseMin = Math.min(pulseMin, g[2] / g0[2]); pulseMax = Math.max(pulseMax, g[2] / g0[2]) }
  else othersResized = Math.max(othersResized, Math.abs(g[2] - g0[2]), Math.abs(g[3] - g0[3]))
})
const lastGlyphs = glassFrames[glassFrames.length - 1].glyphs
const pulseEnd = lastGlyphs[0][2] / firstGlyphs[0][2]
const afterUp = glassFrames.filter((f) => f.t > tUp)
const target = glassSlots.links[2].x
const glass = {
  frames: glassFrames.length,
  trackedFrames: tracked.length,
  trackingMedianPx: Math.round((sortedErrs[Math.floor(sortedErrs.length / 2)] ?? 99) * 100) / 100,
  trackingWorstPx: Math.round(Math.max(0, ...errs) * 100) / 100,
  widestStretch: Math.round((Math.max(...glassFrames.map((f) => f.w)) / DOT_PX) * 1000) / 1000,
  /* The finger slows to a stop, holds, and lets go: the drop runs on past
     round into a slight squash (narrower than round, read from its own
     transform, the lift left out) and settles round (A DROP OF WATER). */
  squash: (() => {
    const lastMove = glassFrames.reduce((at, f, i) => (i > 0 && f.finger !== glassFrames[i - 1].finger ? f.t : at), tDown)
    const after = glassFrames.filter((f) => f.t > lastMove)
    return { narrowest: Math.round(Math.min(...after.map((f) => f.sx)) * 1000) / 1000, last: Math.round(after[after.length - 1].sx * 1000) / 1000, widest: Math.round(Math.max(...glassFrames.map((f) => f.sx)) * 1000) / 1000 }
  })(),
  landedOffPx: landedOn,
  pastSlotPx: Math.round(Math.max(0, ...afterUp.map((f) => f.cx - target)) * 100) / 100,
  settledMs: (() => { const last = [...afterUp].reverse().find((f) => Math.abs(f.cx - target) > 0.5); return last ? Math.round(last.t - tUp) : 0 })(),
  trace: process.env.DROP_TRACE ? glassFrames.map((f) => `${Math.round(f.t - tUp)}:${Math.round(f.sx * 1000) / 1000}`).join(" ") : null,
  glyphMovedPx: Math.round(glyphMoved * 1000) / 1000,
  othersResizedPx: Math.round(othersResized * 1000) / 1000,
  pulse: { min: Math.round(pulseMin * 1000) / 1000, max: Math.round(pulseMax * 1000) / 1000, end: Math.round(pulseEnd * 1000) / 1000 },
  linkOpacityMin: Math.min(...glassFrames.flatMap((f) => f.linkOpacity)),
  forcedActive,
  went: await ev("window.__went"),
}
await ev('window.__routeDelay = 0; globalThis.__goto("/app"); true')
await sleep(1700)

/*
 * AND LET GO WHILE IT IS STILL MOVING. A flick from Home towards the end of
 * the bar, released 18px past the centre of Products and still moving fast.
 *
 * IT LANDS ON PRODUCTS, the slot the finger is over, not the one its speed
 * was carrying it towards. The release used to be projected 90ms ahead at
 * the speed it had, which on a scroller is right and on a row of four
 * targets meant a quick flick opened the tab PAST the one you stopped on:
 * this same gesture went to Analytics. "When I drop it, it lands on that
 * thing I want to click." The spring still carries the glass across on its
 * own curve, so the release has no seam; only the choice of slot changed.
 */
await ev('window.__routeDelay = 220; window.__went = null; window.__glassFrames = []; true')
await ev(`(() => {
  const nav = document.querySelector('nav[aria-label="Main"]')
  const lens = nav.querySelector('span[aria-hidden="true"]')
  const tick = () => { const r = lens.getBoundingClientRect(); window.__glassFrames.push({ t: performance.now(), cx: r.left + r.width / 2, w: r.width }); window.__glassRaf = requestAnimationFrame(tick) }
  window.__glassRaf = requestAnimationFrame(tick)
  return true
})()`)
const fFrom = glassSlots.links[0].x
const fTo = glassSlots.links[2].x + 18
await touch("touchStart", fFrom, gy)
await sleep(30)
for (let i = 1; i <= 5; i++) {
  await touch("touchMove", Math.round(fFrom + ((fTo - fFrom) * i) / 5), gy)
  await sleep(8)
}
const fUp = await ev("performance.now()")
await touch("touchEnd", fTo, gy)
await sleep(900)
const flickFrames = await ev("cancelAnimationFrame(window.__glassRaf); window.__glassFrames")
const flickLanded = await ev(`(() => {
  const nav = document.querySelector('nav[aria-label="Main"]')
  const lens = nav.querySelector('span[aria-hidden="true"]').getBoundingClientRect()
  const slots = [...nav.querySelectorAll("a[aria-label]")].map((a) => { const r = a.getBoundingClientRect(); return r.left + r.width / 2 })
  const cx = lens.left + lens.width / 2
  const nearest = slots.reduce((b, s, i) => (Math.abs(s - cx) < Math.abs(slots[b] - cx) ? i : b), 0)
  return { slot: nearest, dx: Math.round(Math.abs(cx - slots[nearest]) * 1000) / 1000 }
})()`)
const flickAfter = flickFrames.filter((f) => f.t > fUp)
const flickTarget = glassSlots.links[flickLanded.slot].x
const flick = {
  went: await ev("window.__went"),
  landedSlot: flickLanded.slot,
  landedOffPx: flickLanded.dx,
  widest: Math.round((Math.max(...flickFrames.map((f) => f.w)) / DOT_PX) * 1000) / 1000,
  pastSlotPx: Math.round(Math.max(0, ...flickAfter.map((f) => f.cx - flickTarget)) * 100) / 100,
  settledMs: (() => { const last = [...flickAfter].reverse().find((f) => Math.abs(f.cx - flickTarget) > 0.5); return last ? Math.round(last.t - fUp) : 0 })(),
  /* A spring started at the finger's speed has no seam at the release: the
     biggest step between two frames after the lift, against the biggest
     before it. */
  stepAfter: Math.round(Math.max(0, ...flickAfter.slice(1).map((f, i) => Math.abs(f.cx - flickAfter[i].cx))) * 100) / 100,
}
await ev('window.__routeDelay = 0; globalThis.__goto("/app"); true')
await sleep(500)

/* ── open it, the way the pill does ──────────────────────────────────────── */
const menuBtn = await ev(`(() => {
  /* Its own button beside the bar now, not a slot inside it. */
  const b = document.querySelector('[data-app-nav-pill] button[aria-label="Menu"]')
  const r = b.getBoundingClientRect()
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
})()`)
await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: menuBtn.x, y: menuBtn.y, radiusX: 12, radiusY: 12, force: 1 }] })
await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] })
await sleep(600)

const READ_MENU = `(() => {
  const page = document.getElementById("app-mobile-menu")
  const s = getComputedStyle(page)
  const r = page.getBoundingClientRect()
  const rows = [...page.querySelectorAll("a,button")].map((n) => {
    const b = n.getBoundingClientRect()
    return { text: (n.textContent || "").trim().slice(0, 22), h: Math.round(b.height) }
  }).filter((x) => x.h > 0)
  const glyph = document.querySelector('[data-app-nav-pill] button[aria-label="Close menu"]')
  return {
    open: page.getAttribute("data-mobile-menu"),
    bg: s.backgroundColor,
    transition: s.transitionProperty,
    transform: s.transform,
    opacity: s.opacity,
    top: Math.round(r.top),
    covers: Math.round(r.height),
    /* A menu that is over the page must not let the page scroll behind it. */
    pageLocked: getComputedStyle(document.querySelector(".app-content-scroll")).overflowY,
    rows,
    minRowHeight: Math.min(...rows.map((x) => x.h)),
    settingsOpen: (() => {
      const b = document.querySelector('[data-app-nav-pill] button[aria-label="Settings"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      const bar = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
      return { visible: Number(getComputedStyle(b).opacity) > 0.9, leftOfTheBar: r.right <= bar.left + 1,
               round: Math.round(r.width) === Math.round(r.height), gap: Math.round(bar.left - r.right),
               hittable: getComputedStyle(b).pointerEvents !== "none" }
    })(),
    /* Everything on screen, and where the middle of it is. */
    groupCentred: (() => {
      const all = [...document.querySelectorAll('[data-app-nav-pill] nav, [data-app-nav-pill] button')]
        .filter((n) => Number(getComputedStyle(n).opacity) > 0.9)
        .map((n) => n.getBoundingClientRect())
      const left = Math.min(...all.map((r) => r.left))
      const right = Math.max(...all.map((r) => r.right))
      return Math.abs((left + right) / 2 - window.innerWidth / 2) <= 2
    })(),
    rowsAreStillThere: rows.length >= 6,
    hasQuickSale: rows.some((x) => /quick sale/i.test(x.text)),
    closeIsInThePill: !!glyph,
    /* The pill has to be ON TOP of the page it opened. */
    pillOverMenu: (() => {
      const p = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
      const el = document.elementFromPoint(Math.round((p.left + p.right) / 2), Math.round((p.top + p.bottom) / 2))
      return !!(el && document.querySelector('nav[aria-label="Main"]').contains(el))
    })(),
    barItems: [...document.querySelectorAll('[data-app-nav-pill] a[aria-label], [data-app-nav-pill] button[aria-label]')].map((n) => n.getAttribute("aria-label")),
  }
})()`
const open = await ev(READ_MENU)
await shoot("open.png")

/*
 * ===========================================================================
 *  IS EACH GLYPH IN THE MIDDLE OF ITS OWN CIRCLE
 * ===========================================================================
 * "In the pill shape circle of the navigation bar, make sure the settings
 * button icon sits there correctly centred in the white circle."
 *
 * Every check above reads a BOX, and the boxes were already centred: the
 * glyph span measured zero off the middle of its button on every phone. What
 * was off was the drawing INSIDE it. Solar's IconBase writes its `size` prop
 * into the inline style as width and height, after the style it is handed, so
 * a 22px glyph was drawn in a 21px box and `inset: 0` hung the extra pixel
 * off the right and the bottom. Measured at 390: the gear, Orders, Products
 * and Analytics all a whole pixel down and to the right of their circle's
 * middle; the menu glyph, which is three divs and never went through
 * IconBase, on it. Beside an X that was centred, the gear was the one that
 * got reported.
 *
 * So this reads the PHOTOGRAPH: the box the ink occupies, against the middle
 * of the round white button it sits in. The square it reads is inside the
 * circle, because the corners of the button's own box fall outside the round
 * shape, where the drop shadow is, and a shadow is dark enough to count as
 * ink.
 *
 * Half a pixel is the floor, not slack: a 21px glyph cannot be centred in a
 * 60px circle on a whole-pixel grid, and the engine paints a box that starts
 * on a half pixel at the next whole one. Every glyph of that size is off by
 * the same half pixel in the same direction, which is why none of them reads
 * as the odd one out. On a 360px phone, where the glyph is 20px in a 56px
 * circle, they are all exactly on it.
 */
const CIRCLES = `(() => {
  const r = (el, label) => { if (!el) return null; const b = el.getBoundingClientRect(); return { label, x: b.left, y: b.top, w: b.width, h: b.height, cx: b.left + b.width / 2, cy: b.top + b.height / 2 } }
  return [
    r(document.querySelector('[data-app-nav-pill] button[aria-label="Settings"]'), "Settings"),
    r(document.querySelector('[data-app-nav-pill] button[aria-label="Close menu"]'), "Close menu"),
    ...[...document.querySelectorAll('nav[aria-label="Main"] a[aria-label]')].map((a) => r(a, a.getAttribute("aria-label"))),
  ].filter(Boolean)
})()`
const centred = []
for (const c of await ev(CIRCLES)) {
  const side = Math.round(Math.min(c.w, c.h) * 0.62)
  const clip = { x: Math.round(c.cx - side / 2), y: Math.round(c.cy - side / 2), width: side, height: side }
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
  const png = decodePng(Buffer.from(data, "base64"))
  const ink = inkBox(png, 190)
  const k = png.width / clip.width
  centred.push({
    label: c.label,
    dx: ink ? Math.round((clip.x + (ink.left + ink.right + 1) / 2 / k - c.cx) * 100) / 100 : null,
    dy: ink ? Math.round((clip.y + (ink.top + ink.bottom + 1) / 2 / k - c.cy) * 100) / 100 : null,
  })
}
console.log("  centring    how far each glyph's ink sits from the middle of its own circle, in CSS pixels")
for (const c of centred) console.log(`              ${c.label.padEnd(12)} ${c.dx === null ? "no ink" : `${c.dx >= 0 ? "+" : ""}${c.dx} x ${c.dy >= 0 ? "+" : ""}${c.dy} y`}`)
console.log("")

/* ── a group, opened and closed, one frame at a time ─────────────────────── */
const GROUP = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const btn = [...document.querySelectorAll('#app-mobile-menu [aria-expanded]')][0]
  const sub = btn.closest("div").parentElement.querySelector("[data-nav-submenu]")
  const track = () => {
    const frames = []
    let last = performance.now()
    let on = true
    const tick = (t) => { if (!on) return; frames.push(Math.round((t - last) * 10) / 10); last = t; requestAnimationFrame(tick) }
    requestAnimationFrame((t) => { last = t; tick(t) })
    return { frames, stop: () => { on = false } }
  }
  const heights = []
  const run = async () => {
    const w = track()
    btn.click()
    for (let i = 0; i < 18; i++) { await wait(16); heights.push(Math.round(sub.getBoundingClientRect().height)) }
    await wait(200)
    w.stop()
    return w.frames.slice(1)
  }
  const opening = await run()
  const openHeight = Math.round(sub.getBoundingClientRect().height)
  const openState = sub.getAttribute("data-nav-submenu")
  const closing = await run()
  await wait(320)
  const shutHeight = Math.round(sub.getBoundingClientRect().height)
  const transition = getComputedStyle(sub).transitionProperty
  /* Distinct intermediate heights: an animation, rather than a jump. */
  const steps = new Set(heights.filter((h) => h > 0 && h < openHeight)).size
  return {
    openHeight, shutHeight, openState, transition, steps,
    /* The element has to SURVIVE the transition. If the menu is rebuilt on
       every render the node measured at the end is not the node that started. */
    sameNode: sub === (btn.closest("div").parentElement.querySelector("[data-nav-submenu]")),
    worstFrame: Math.max(...opening.concat(closing)),
    frames: opening.length + closing.length,
  }
})()`
const group = await ev(GROUP)

/* ── and a page that raises its own bottom bar takes the strip ───────────── */
const SHARE = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const pill = document.querySelector("[data-app-nav-pill]")
  const before = Math.round(pill.getBoundingClientRect().top)
  const bar = document.createElement("div")
  bar.setAttribute("data-app-bottom-bar", "visible")
  bar.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:72px;background:#fff"
  document.body.appendChild(bar)
  await wait(420)
  const during = Math.round(pill.getBoundingClientRect().top)
  const reachable = (() => {
    const r = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
    const el = document.elementFromPoint(Math.round((r.left + r.right) / 2), Math.round((r.top + r.bottom) / 2))
    return !!(el && document.querySelector('nav[aria-label="Main"]').contains(el))
  })()
  bar.setAttribute("data-app-bottom-bar", "hidden")
  await wait(420)
  const after = Math.round(pill.getBoundingClientRect().top)
  bar.remove()
  return { before, during, after, reachable, moves: /transform/.test(getComputedStyle(pill).transitionProperty) }
})()`
const share = await ev(SHARE)

/* ── and a sheet goes over it, and the pill stays ────────────────────────── */
/*
 * "When a bottom sheet opens, the pill shaped navigation bar should NOT
 * disappear. The sheet should simply appear over it." Set up the way the
 * shell really is, because the harness is not: in /app the pill comes BEFORE
 * <main> in the document and the page under it is positioned (the dashboard's
 * scroller, the orders stage). That order is what let the page paint over a
 * pill that had been dropped to layer 0.
 */
const SHEET = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  /* The menu page is not a sheet: shut it, so only the sheet is over the pill. */
  window.__menu.close()
  await wait(450)
  const pill = document.querySelector("[data-app-nav-pill]")
  const nav = pill.querySelector("nav")
  const main = document.querySelector("main")
  const home = pill.parentNode, after = pill.nextSibling
  main.parentNode.insertBefore(pill, main)
  const scroller = document.querySelector(".app-content-scroll")
  scroller.style.position = "relative"
  const centre = () => { const r = nav.getBoundingClientRect(); return { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2), top: Math.round(r.top) } }
  const before = centre()
  const sheet = document.createElement("div")
  sheet.setAttribute("data-app-sheet", "open")
  sheet.style.cssText = "position:fixed;inset:0;z-index:200"
  sheet.innerHTML = '<div style="position:absolute;inset:0;background:rgba(0,0,0,0.4)"></div>'
  document.body.appendChild(sheet)
  await wait(320)
  const during = centre()
  let opacity = 1
  for (let el = nav; el; el = el.parentElement) opacity *= Number(getComputedStyle(el).opacity)
  const hit = document.elementFromPoint(during.x, during.y)
  const tapIsTheScrims = !!hit && sheet.contains(hit)
  /* What is painted there under the sheet: the pill, or the page over it. */
  sheet.style.visibility = "hidden"
  const look = document.createElement("style")
  look.textContent = ':is(#__none, [data-app-nav-pill] nav), :is(#__none, [data-app-nav-pill] nav) * { pointer-events: auto !important }'
  document.head.appendChild(look)
  const under = document.elementFromPoint(during.x, during.y)
  const painted = !!under && pill.contains(under)
  look.remove()
  sheet.remove()
  scroller.style.position = ""
  home.insertBefore(pill, after)
  await wait(50)
  return { before, during, opacity, tapIsTheScrims, painted, under: under ? under.tagName + "." + String(under.className).slice(0, 80) : null, z: getComputedStyle(pill).zIndex, visibility: getComputedStyle(nav).visibility }
})()`
const sheetOver = await ev(SHEET)

/* ── and it is not on every route ────────────────────────────────────────── */
/*
 * OnePage is an editor with its own controls along the foot of the screen,
 * so the pill has no business floating over them: "it should not show at all
 * in the OnePage". Driven rather than read, because "does not render" is a
 * claim about what is in the document.
 */
const routes = await ev(`(async () => {
  const seen = (path) => new Promise((done) => {
    window.__setPath(path)
    requestAnimationFrame(() => requestAnimationFrame(() => done({
      pill: !!document.querySelector("[data-app-nav-pill]"),
      halo: !!document.querySelector("[data-app-nav-fade]"),
    })))
  })
  const onepage = await seen("/app/onepage")
  const deeper = await seen("/app/onepage/anything")
  const back = await seen("/app")
  return { onepage, deeper, back }
})()`)

await send("Target.closeTarget", { targetId }, null)
ws.close()
reap()

/* ── the report ──────────────────────────────────────────────────────────── */
const problems = []
const say = (ok, line) => console.log(`  ${ok ? "ok  " : "FAIL"}  ${line}`)
const must = (ok, line, why) => { say(ok, line); if (!ok) problems.push(why) }

console.log(`\n  The phone's navigation at ${VIEW_W}x${VIEW_H}\n`)
console.log(`  the pill    ${shut.pill.w}x${shut.pill.h} at x=${shut.pill.x}, ${shut.pill.bottomGap}px above the bottom, radius ${shut.pill.radius}`)
console.log(`              ${shut.pill.bg}`)
console.log(`  the halo    ${shut.fade?.w}x${shut.fade?.h}, ${shut.fade?.steps} elliptical blur layers and a tint, ${shut.fade?.straight} straight edges, ${shut.fade?.masked} masks, ${shut.fade?.opaque} opaque fills`)
console.log(`  targets     ${shut.targets.map((t) => `${t.label} ${t.w}x${t.h}`).join(", ")}`)
console.log(`  clearance   list padded ${shut.scrollPadBottom} at the bottom; scrolled to the end the last card stops ${shut.lastCardClear}px above the pill`)
console.log(`  the menu    ${open.covers}px tall from y=${open.top}, ${open.bg}, moves ${open.transition}`)
console.log(`  a group     ${group.shutHeight}px to ${group.openHeight}px over ${group.steps} distinct heights, worst frame ${group.worstFrame}ms of ${group.frames}\n`)

must(!shut.headerHasHamburger, "the hamburger is out of the header", "the header still carries a hamburger")
must(!!shut.settingsWhenShut && shut.settingsWhenShut.opacity === 0 && !shut.settingsWhenShut.hittable && shut.settingsWhenShut.tab === -1,
  "with the menu shut, settings is neither visible, pressable nor a tab stop",
  `settings while shut: ${JSON.stringify(shut.settingsWhenShut)}`)
must(shut.pill.centred, "the bar and the menu button, together, are centred",
  `they are off centre (bar at x=${shut.pill.x}, width ${shut.pill.w})`)
must(shut.pill.gapToButton >= 4 && shut.pill.gapToButton <= 16,
  "and the menu is a separate object beside the bar, not a fifth slot in it",
  `there are ${shut.pill.gapToButton}px between them`)
/* 6px now, "a little bit more down"; below 4 it is on the home indicator. */
must(shut.pill.bottomGap >= 4 && shut.pill.bottomGap <= 40, "and sits just above the bottom edge, where a thumb is",
  `the pill is ${shut.pill.bottomGap}px from the bottom`)
must(shut.pill.radius.startsWith("999") || Number.parseFloat(shut.pill.radius) >= shut.pill.h / 2,
  "it is a pill, not a rounded rectangle", `its radius is ${shut.pill.radius} on a ${shut.pill.h}px box`)
must(shut.targets.length === 5, "the bar carries Home, Orders, Products, Analytics, and the menu beside them",
  `it carries ${shut.targets.map((t) => t.label).join(", ")}`)
must(shut.targets.map((t) => t.label).join(",") === "Home,Orders,Products,Analytics,Menu",
  "in that order", `the order is ${shut.targets.map((t) => t.label).join(", ")}`)
must(shut.targets.every((t) => t.h >= 40 && t.w >= 40), "every target in it is at least 40px",
  `targets: ${shut.targets.map((t) => `${t.label} ${t.w}x${t.h}`).join(", ")}`)
must(shut.hits.every((h) => h.reaches), "and a press in the middle of each one reaches it",
  `these do not: ${shut.hits.filter((h) => !h.reaches).map((h) => h.label).join(", ")}`)

/*
  WKWebView does not composite a mask over a backdrop-filter on one element:
  it drops the mask and paints the filtered region as a flat light fill. A
  full width strip doing that is a pale rectangle across the foot of the
  screen with a hard top edge, which is what "the background is still solid"
  was describing and what Chromium never rendered. So the pair is held apart,
  structurally, since this browser cannot reproduce the fault.
*/
must(shut.maskedBlurs === 0,
  "nothing behind the bar masks a backdrop-filter, which WKWebView paints as a flat fill",
  `${shut.maskedBlurs} element(s) carry both. On an iPhone that is a pale plate across the bottom of the screen.`)
must(!!shut.fade && shut.fade.steps >= 12, "a halo of concentric blurs sits around the bar",
  `the fade has ${shut.fade?.steps ?? 0} blur steps`)
must(shut.fade?.straight === 0, "every layer of it is an ellipse, so nothing in it ends on a straight line",
  `${shut.fade?.straight} layer(s) of the halo have a straight edge`)
/* The cut in the screenshot was the outermost layer: 1.2px of blur beginning
   all at once on crisp text. Now the outermost carries next to nothing and
   each layer inward carries more, so there is no radius at which it starts. */
must(!!shut.fade && shut.fade.radii[0] <= 0.05 && shut.fade.radii.every((v, i) => i === 0 || v > shut.fade.radii[i - 1]),
  "and the blur ramps up from nothing at the outermost layer, so there is no radius at which it begins",
  `the layers carry ${shut.fade?.radii.join(", ")}px, outermost first`)
must(!!shut.fade && Math.hypot(...(shut.fade.radii ?? [])) <= 5,
  "compounding to about 4px where they all overlap: more than visible, and still a softening",
  `the layers compound to about ${Math.hypot(...(shut.fade?.radii ?? [])).toFixed(1)}px around the bar`)
/* WIDER than the screen, on purpose. An ellipse exactly the screen's width
   has no height at its two tips, so the last stretch at each side would be
   bare, in an arc. Drawn wider, the display crops it. */
must(!!shut.fade && shut.fade.w > VIEW_W && shut.fade.w <= VIEW_W * 1.4,
  "and it is drawn wider than the screen, so the softening reaches both sides",
  `the halo is ${shut.fade?.w}px wide on a ${VIEW_W}px screen`)
must(!!shut.fade && shut.fade.h <= 160, "and is not much taller than the bar",
  `the halo is ${shut.fade?.h}px tall for a ${shut.pill.h}px bar`)
/* Its lower edge used to be tied to the pill's lift off the bottom, which on
   a phone with a home indicator left a bare strip under the pill, right
   where a thumb rests. It is anchored below the display now. */
must(!!shut.fade && shut.fade.belowScreen >= 24,
  "and it carries on past the bottom of the screen, so there is no bare strip under the pill",
  `the halo ends ${shut.fade?.belowScreen}px past the bottom of the screen`)
/* And the overhang costs the page nothing: a fixed box's overflow is not the
   document's, but that is worth reading rather than believing. */
must(shut.docWidth <= VIEW_W,
  "with nothing of it hanging off the page: the document is still the width of the screen",
  `the document is ${shut.docWidth}px wide on a ${VIEW_W}px screen, so the halo has given the page a sideways scroll`)
must(shut.fade?.masked === 0, "with no mask on any layer of it, which is the thing WKWebView cannot draw",
  `${shut.fade?.masked} layer(s) of the fade carry a mask`)
must(shut.fade?.opaque === 0, "and no opaque fill on any layer, so nothing in it can be a plate",
  `${shut.fade?.opaque} layer(s) of the fade have an opaque background`)
const pillAlpha = Number((shut.pill.bg.match(/rgba?\([^)]*?,\s*([\d.]+)\s*\)/) ?? [])[1] ?? 1)
/*
  FROSTED, NOT CLEAR, AND NOT A PANEL. This held the tint under 55% while
  "solid" was the complaint, and at 18% the glyphs ended up sitting on the
  dashboard's saturated artwork. "The bar itself doesn't need to be
  transparent" is the correction: 70% white over a blur is the material a
  system tab bar is made of. The band is 60 to 80: under it the glyphs sit on
  whatever is behind, at 100 it is a panel.
*/
/* 93% now: at 70% the bar read warm grey over the dark artwork ("I don't
   want it greyish in any circumstances"), and 90% was "not really that
   see-through, more whitish". */
must(/^rgba?\(255, 255, 255/.test(shut.pill.bg) && pillAlpha >= 0.9 && pillAlpha <= 0.96,
  "the bar is white over anything, a breath of what is under it and never grey",
  `the bar is ${shut.pill.bg}`)
must(/blur\(/.test(shut.glass.backdrop), "and it carries its own blur, so the page is visible THROUGH it",
  `the bar's backdrop-filter is "${shut.glass.backdrop}"`)
must(shut.selector.w === shut.selector.h, "the selector is a circle, not an oval",
  `it is ${shut.selector.w}x${shut.selector.h}`)
must(!/139, 92, 246|rgb\(139/.test(shut.selector.bg), "and it is not painted in the accent colour",
  `the selector is ${shut.selector.bg}`)
/* `translate`, the individual property, so the lift's `scale` can keep its
   own easing while the position has none under a finger. */
must(/translate/.test(shut.selector.moves) && /scale/.test(shut.selector.moves), "it slides between slots rather than jumping, on its own property",
  `it transitions ${shut.selector.moves}`)

must(Number.parseFloat(shut.scrollPadBottom) >= 88, "the page leaves room for the pill under its content",
  `.app-content-scroll pads only ${shut.scrollPadBottom} at the bottom, so the last row sits under the pill`)
must(shut.lastCardClear > 0, "so the last card is still clear of it at the end of the list",
  `the last card ends ${shut.lastCardClear}px past the top of the pill`)

console.log("")
console.log("  a column down the left margin, scrolled to the end of the page:")
for (const c of column) console.log(`    y=${String(c.y).padStart(3)}  rgb(${c.rgb.join(",")})${distance(c.rgb, pageColour) > 2 ? "   <- not the page colour" : ""}`)
console.log("")
console.log(`  the halo    stripes read ${blur.above} of contrast above it, ${blur.top} at its edge, ${blur.bottom} beside the bar, ${blur.margin} in the left margin, ${blur.under} under the pill\n`)
must(blur.above >= 120, "the stripe pattern is sharp where nothing is over it, so the test can see",
  `only ${blur.above} of contrast above the fade: the stripes are not being drawn sharply enough to measure against`)
/*
  ═══════════════════════════════════════════════════════════════════════════
   REACH IS GEOMETRY. STRENGTH IS A SEPARATE QUESTION, ASKED SEPARATELY.
  ═══════════════════════════════════════════════════════════════════════════
  This asked whether the stripes at the screen's left edge were blurred to at
  most 90% of their sharp contrast, and the two below asked for 45% beside the
  bar and under the pill. Written when the brief was "not that potent, but
  more than visible", they were a fair proxy: a halo that stopped short of the
  edge left the page there untouched, and the reading caught it.

  The brief has since gone the other way five times over — 2.4 to 1.2 to 0.9
  to 0.6 to 0.35, each asked for and each measured — and at 0.35 the proxy
  breaks. The halo still reaches the edge, and the stripes there still read
  close to sharp, because the outer layers now carry almost no blur. The
  reading no longer distinguishes "stops short" from "is gentle", so as a
  test of reach it has stopped working.

  Reach is therefore measured as reach: the halo's own box against the screen.
  Strength keeps one floor, so it cannot quietly become nothing at all, and
  that floor is deliberately loose because how strong it should be is a
  decision that has been revisited five times and will be again.
*/
must(shut.fade.w >= VIEW_W, "the halo spans the screen's full width rather than stopping in an arc short of the edges",
  `the halo is ${shut.fade.w}px wide on a ${VIEW_W}px screen`)
/* At the bar's own height the ellipse is at its widest, so every layer still
   covers the screen's edge and the reading there matches the reading at the
   bar. The fade is vertical and at the four corners, which is what the two
   readings above the halo prove; what this one guards is that the edge is
   never blurred HARDER than the middle, which would mean the shape had
   inverted. */
must(blur.under < blur.above, "and it covers the strip under the pill, where a home indicator sits",
  `the stripes read ${blur.under} under the pill and ${blur.above} above the halo: nothing at all is over that strip`)
must(blur.margin >= blur.bottom, "as strongly there as at the bar itself, and never more",
  `the screen's edge reads ${blur.margin} and the bar ${blur.bottom}: the halo is strongest at the screen's edge, which is not the shape it is meant to be`)
/* The one strength floor. Not a target — a guard against the halo becoming a
   no-op that nobody notices until a screenshot arrives. */
must(blur.bottom <= blur.above * 0.95, "beside the bar the page is softened, however gently",
  `the stripes read ${blur.bottom} beside the bar against ${blur.above} above the halo: the halo is doing nothing`)
must(blur.top > blur.bottom + 10, "and the blur is progressive: lighter at the top of the fade than at the bottom",
  `the top of the fade reads ${blur.top} and the bottom ${blur.bottom}, which is a flat blur with an edge rather than a fade`)
must(blur.top >= blur.above * 0.7, "with the halo's edge barely touched, so there is no line where it begins",
  `the top of the fade already reads ${blur.top} against ${blur.above} above it: the blur starts with a step`)

must(plateSteps.length === 0,
  "the screen is one colour from the content down to the bottom edge",
  `${plateSteps.length} of ${column.length} samples differ from the page colour rgb(${pageColour.join(",")}), the first at y=${plateSteps[0]?.y} reading rgb(${plateSteps[0]?.rgb.join(",")}). That is a plate with an edge across the screen.`)

console.log(`  see-through the same square inside the bar read rgb(${seeThrough.onRed}) over red and rgb(${seeThrough.onBlue}) over blue`)
console.log(`              ${seeThrough.moved} apart inside the bar, ${seeThrough.aside} apart in the bare margin beside it`)
console.log(`              on plain page: rgb(${seeThrough.aboveFade}) above the fade, rgb(${seeThrough.insideFade}) inside it\n`)
/*
  THESE FLOORS WERE 100 AND 200 WHEN NOTHING SAT BETWEEN THE BAR AND THE
  PAGE. Now the fade does, on purpose: at the height of the bar it lays about
  three quarters of the page's own colour over whatever is behind, and blurs
  it, because that frost is what was asked for. So a square that moved 150
  between red and blue with a bare bar moves 53 with a frosted one, and the
  bare margin beside it moves 86 rather than 241.

  What the floors guard is the difference between frosted and OPAQUE. A white
  panel moves 0 whatever is behind it. Anything past 30 is letting the page
  through; the tint is the rest of the distance, and the tint is the point.
*/
/* 93% white over pure red still moves a little between red and blue, and a
   panel moves exactly 0. The floor is 8: white that is not a panel. */
must(seeThrough.moved >= 8,
  "change what is behind the bar and the bar changes: it frosts the page, it does not hide it",
  `the same pixel moved only ${seeThrough.moved} when the colour behind it went from red to blue. A white panel would move 0`)
must(seeThrough.aside >= 40,
  "and the fade beside it frosts the page too, rather than painting over it",
  `the margin beside the bar moved only ${seeThrough.aside} between red and blue, which is a fill and not a frost`)
must(seeThrough.plate <= 3,
  "and beside the bar the page reads the same as it does well above it",
  `plain page reads rgb(${seeThrough.aboveFade}) higher up and rgb(${seeThrough.insideFade}) level with the bar, ${seeThrough.plate} apart: that difference is a paler rectangle with a top edge`)

console.log("")
must(open.open === "open", "the menu opens from the pill", "pressing the menu button did not open it")
must(open.covers > VIEW_H * 0.7, "as a page rather than a panel", `it covers ${open.covers}px of ${VIEW_H}`)
must(open.bg === "rgb(248, 249, 250)", "and it is the light page colour, not the dark menu in the reference",
  `the menu page is ${open.bg}`)
must(!/height|width|top|left|margin|padding/.test(open.transition) && /transform/.test(open.transition) && /opacity/.test(open.transition),
  "it moves on transform and opacity only", `it transitions ${open.transition}, which relayouts every frame`)
must(open.pageLocked === "hidden", "the page behind it does not scroll while it is open",
  `.app-content-scroll is overflow-y: ${open.pageLocked}`)
must(!!open.settingsOpen?.visible && !!open.settingsOpen?.hittable, "a settings circle appears when the menu opens",
  "there is no settings control while the menu is open")
must(!!open.settingsOpen?.leftOfTheBar, "to the LEFT of the bar, mirroring the X on the right",
  "the settings circle is not to the left of the bar")
must(!!open.settingsOpen?.round && open.settingsOpen.gap >= 4 && open.settingsOpen.gap <= 16, "as a circle of its own, the same distance from the bar as the X",
  `it is ${open.settingsOpen?.gap}px from the bar and ${open.settingsOpen?.round ? "round" : "not round"}`)
must(open.groupCentred, "and settings, the bar and the X together are still centred",
  "opening the menu pushed the group off centre")
must(!open.hasQuickSale, "and there is no Quick Sale", "a Quick Sale control is in the menu")
must(open.minRowHeight >= 40, "every row in it is at least 40px tall", `the shortest row is ${open.minRowHeight}px`)
must(open.closeIsInThePill, "the menu button has become the close button", "there is no close control in the pill")
must(open.pillOverMenu, "and the pill is on top of the page it opened", "the menu page is drawn over its own pill")
must(open.barItems.join(",") === "Home,Orders,Products,Analytics,Settings,Close menu",
  "and the four places in the bar are untouched by it",
  `the bar shows ${open.barItems.join(", ")}`)

console.log("")
must(group.openHeight > 0 && group.shutHeight === 0, "a group opens and closes",
  `it went ${group.shutHeight}px to ${group.openHeight}px and back to ${group.shutHeight}px`)
must(group.steps >= 3, "over intermediate heights, so it is animated rather than switched",
  `only ${group.steps} distinct heights between shut and open: it is jumping`)
must(group.sameNode, "and the element carrying the animation survives it",
  "the submenu node was replaced mid-transition, which is a remount, not an animation")
must(/grid-template-rows/.test(group.transition), "on a grid track, with nothing to measure or release",
  `it transitions ${group.transition}`)

console.log("")
console.log(`  a slide     the circle went ${drag.trail[0]}px to ${drag.trail[drag.trail.length - 1]}px over ${drag.distinct} distinct positions`)
console.log(`              ${drag.haptics.length} haptic ticks, landed on ${drag.went}\n`)
must(drag.travelled > 100, "a finger sliding along the bar drags the circle with it",
  `the circle moved ${drag.travelled}px across a slide from the first slot to the fourth`)
console.log(`  a tap       pressed ${OFF_CENTRE}px off the centre of ${slots[1].label}, held 60ms, ${tap.frames.length} frames watched`)
console.log(`              the circle went ${tap.from}px to ${tap.landed}px, ${tap.past}px past the slot, ${tap.backwards}px behind where it set off`)
console.log(`              ${tap.turns} changes of direction, ${tap.waypoints} places seen in between, resting ${tap.restOff}px off where the bar puts it`)
console.log(`              dipped to ${tap.dimmestTo} and back to ${tap.backTo}; ${tap.seenMoving} visible on the frame it changed place`)
console.log(`              the lens was on the pressed icon ${tap.arrivedMs}ms after the touch`)
console.log(`              its glass emptied to ${tap.emptiedTo}, filled back to ${tap.filledTo} over ${tap.glassSteps} steps, changing slot ${tap.movedFromEmpty} frame(s) from the emptiest it gets`)
console.log(`              and it grew to ${tap.biggest}x on the way, ${tap.grewPx}px across, and shrank back`)
console.log(`  a drag      released after four slots, ${drag.past}px past the slot, grew to ${dragScale.biggest}x while a finger held it\n`)
must(tap.restOff <= 0.6, "a tap leaves the circle on the slot it picked",
  `the circle finished ${tap.restOff}px from where the bar draws it at rest`)
must(tap.backwards <= 1, "and sets off for the slot, not for the fingertip",
  `it went ${tap.backwards}px the wrong way first, with the finger ${OFF_CENTRE}px off the slot's centre`)
/*
  AND IT DOES NOT CHANGE SIZE. This is the one that was missed for two rounds.
  Every check in this file read the circle's POSITION, and its position was
  clean, so the bar kept passing while the report kept coming back. On the
  live bar a 60ms tap grew it to 1.047x and shrank it back: 2.35px across,
  with nothing being held and nothing travelling anywhere.
*/
/*
  "When I click on the icon, make sure that it doesn't bump, scale, or do any
  of the movements left and right." The circle is on the pressed icon in one
  frame; it does not cross the bar to get there.
*/
must(tap.waypoints === 0, "a press puts the circle on the icon, rather than sending it across the bar",
  `it was seen in ${tap.waypoints} place(s) between the two slots: ${tap.frames.join(" ")}`)
/*
  AND IT DOES NOT FADE. THESE THREE CHECKS USED TO ASSERT THE OPPOSITE, and
  they are turned round rather than deleted so the reason is on the record.

  They held the lens to dipping almost out of sight, moving while faint, and
  coming back — which hid the change of place, and put a fade on every single
  press. "Too much fade and cheapness in the click" is what that is, and a
  dip is a wait however short it is made.

  So there is no dip. The lens is at full strength on every frame of a press,
  and its place changes in the open, which costs nothing now: it does not
  travel, so there is no path to follow, and it does not fade, so there is no
  flicker to catch. The smoothness is the ink filling the icon instead.
*/
must(tap.dimmestTo >= 0.99, "the lens never fades: it is at full strength on every frame of a press",
  `it dropped to ${tap.dimmestTo} part way through`)
must(tap.backTo >= 0.99, "and is still there at the end of one",
  `it finished at ${tap.backTo}`)
must(tap.waypoints === 0, "and changes place in one step rather than sliding or dissolving",
  `it was seen in ${tap.waypoints} place(s) on the way: ${tap.frames.join(" ")}`)
/*
  AND ITS GLASS ARRIVES RATHER THAN APPEARING. The element's opacity is held
  above, and never moves; this is the colour painted inside it, which ramps
  in one direction on the ink's curve. A lens switched on at full strength
  reads as too direct, and would show two steps here rather than a ramp.
*/
must(tap.movedFromEmpty <= 1, "and it changes slot at the moment there is no colour in it, so the change cannot be seen",
  `the move was ${tap.movedFromEmpty} frames away from the emptiest the glass gets`)
must(tap.emptiedTo <= 0.05, "emptying rather than dimming, which is the element's own opacity and never moves",
  `the least colour in it was ${tap.emptiedTo}`)
must(tap.glassSteps >= 4, "and filling back over a ramp rather than being switched on",
  `its colour passed through only ${tap.glassSteps} value(s) on the way in`)
/* The resting glass is 72% white now, clearer than the bar's frost
   (components/app/sidebar-mobile-nav REST_FILL), so "all the way" is 0.7. */
must(tap.filledTo >= 0.7, "all the way to its glass",
  `it finished at ${tap.filledTo}`)
/*
  AND NOTHING IS WAITED ON. Smoothness belongs to the coming back, never to
  the going away: a dip with a duration is a dip you wait through, on the one
  icon a finger is on.
*/
/*
  A LOOSE BOUND, AND DELIBERATELY SO. Cutting the dip from 120ms to 50 moved
  this from 134ms to 100 — but two runs of the same build gave 100 and 117, so
  most of what is left is React's own render passes between the touch and the
  timer, and the run-to-run spread is as wide as the change being made. A
  threshold tight enough to separate the two would fail on noise, which is a
  flaky test rather than a guard.

  So the exact dip lengths are pinned in tests/app-mobile-nav.test.ts, where
  they are deterministic, and this catches only a return to something much
  worse. The number is printed either way, which is what it is actually for.
*/
must(tap.arrivedMs <= 80, "and is on the icon you pressed within a few frames of the touch",
  `the lens took ${tap.arrivedMs}ms to reach the icon under the finger`)
must(tap.grewPx <= 0.5, "and it does not change size on the way, having nothing to hold",
  `a tap grew the circle to ${tap.biggest}x, ${tap.grewPx}px across, and shrank it back`)
/*
  The other half of the same claim. Without it, deleting the lift altogether
  would pass everything above.
*/
must(dragScale.grew >= 0.03, "while a finger dragging it does lift it, which is what the lift is for",
  `a drag across four slots changed the circle's size by only ${dragScale.grew}`)
/*
  The bump, measured the way it actually happens. A press hands CSS whatever
  the frame loop has not covered, and SETTLE's curve is an overshoot, so on a
  quick tap the circle sails past the icon you pressed and comes back.
*/
must(tap.past <= 1, "and lands on it rather than sailing past and coming back",
  `it went ${tap.past}px past the slot in the direction it was travelling: ${tap.frames.join(" ")}`)
must(tap.turns <= 1, "so a tap is one movement, not an out and back",
  `the circle changed direction ${tap.turns} time(s): ${tap.frames.join(" ")}`)
/*
  And the other half of the same claim: the bounce is still there for the
  gesture that asked for it. Without this, deleting SETTLE entirely would
  pass every check above.
*/
console.log(`  and then    the route landed 260ms later on ${routeTap.arrived}; the circle went ${routeTap.from}px to ${routeTap.landed}px`)
console.log(`              ${routeTap.turns} changes of direction, ${routeTap.past}px past the slot, last moved at ${routeTap.quietAfter}ms\n`)
/*
  THE ICONS ARE THE PAIR THE ICON SET SHIPS, AND ARE LEFT ALONE.

  The line glyph and the solid one are not exactly the same size: a stroke
  sits astride its path and reaches half a stroke past it where a solid stops
  at its edge, and three of the four are separate drawings besides. Measured,
  the solid is about 0.5px narrower and 1px shorter than the outline it
  replaces — against a threshold sweep on this very measurement that moves the
  reading by a pixel on its own, which is the size of a stroke's soft edge.

  THREE WAYS OF CLOSING THAT GAP WERE TRIED AND ALL THREE WERE WORSE.
  Overdrawing the solid with the outline, and giving the solid its own stroke,
  both closed up the gaps the solid is drawn WITH — a stroke runs along every
  contour a shape has, including the ones cut out of its middle — and the
  receipt went out as a dark blob. Scaling the solid 6% left the drawing
  intact and still changed how pressing an icon felt. Every one was rejected
  by the person using it, and the first two are visible in the screenshot this
  file writes, which is where they should have been caught.

  So the solid is drawn at the outline's size, and this is what says so. It is
  the SILHOUETTE that is asserted and not the centre of weight: an icon
  filling in moves its weight towards the middle of the shape by design, and
  pinning that would be forbidding the fill.
*/
console.log(`  the lens    at rest ${lens.rest}, under a finger ${lens.held}: ${lens.brighter} more opaque`)
console.log(`              on in ${lens.heldFor}, off over ${lens.backFor}, ${lens.grew}px wider while held`)
console.log(`              ${lens.ticks.length} haptic tick(s) for a tap: ${lens.ticks.join(", ") || "none"}\n`)
must(lens.brighter >= 0.1, "the bar answers a finger: the lens brightens under one",
  `it read ${lens.held} held against ${lens.rest} at rest, which is nothing happening`)
must(lens.grew === 0, "and answers with light rather than with movement",
  `it also changed width by ${lens.grew}px while held`)
must(lens.instantOn, "the answer is complete on the frame the finger lands, so a short press is a whole press",
  `background-color eases in over ${lens.heldFor}, and a 60ms tap would cut that off somewhere different every time`)
must(lens.easedOff, "and eases only on the way off, which nothing interrupts",
  `the release runs in ${lens.backFor} rather than easing`)
/*
  ONE TICK, AND A QUIET ONE. Every tick in this bar is a step down from what
  it was: medium read as loud on a control you press several times a minute.
  The shape is kept — the tick when a finger lands is still the firmer of the
  two — so what is asserted is both, that a tap ticks exactly once and that
  the tick is no louder than "light".
*/
/*
  ONE TICK, AND ONE THAT CAN BE FELT.

  This asserted "soft" for a while, on the reasoning that selection feedback
  is the quietest thing iOS makes and a row of tabs is a segmented control.
  It is the quietest, and it turned out to be quieter than a thumb can
  notice: the bar went silent on a real device. The plugin has three impact
  styles and nothing between Light and selection, so Light is the floor for a
  press. Selection feedback still earns its keep counting slots off under a
  finger that is dragging, where several come in a row.
*/
must(lens.ticks.length === 1, "and a tap is one tick, at the moment of contact",
  `a tap fired ${lens.ticks.length} tick(s): ${lens.ticks.join(", ") || "none"}`)
must(lens.ticks[0] === "light", "and it is an impact, because selection feedback could not be felt at all",
  `a tap fired ${lens.ticks.join(", ")}, and "soft" is selection feedback, which went unnoticed on a real phone`)
must(!lens.ticks.includes("medium"), "while still being the quietest impact there is",
  `a tap fired ${lens.ticks.join(", ")}`)

console.log(`  the glyphs  ${opTrail.length} readings of ${opTrail[0].svgAlpha.length} glyphs across a press and the route landing`)
console.log(`              the pair strayed from summing to 1 by at most ${worstSum}`)
console.log(`              the fade was caught in ${fadeSteps} positions between the two drawings`)
console.log(`              the box around them never went below ${boxDippedTo}`)
console.log(`              and it started ${swapAtMs}ms after the touch\n`)

/*
  THE PAIR NEVER GOES LIGHT, AND IS NEVER DOUBLE.

  The rule that has survived all three versions of this fill is that the
  glyph must not dim out and come back. A cross-fade satisfies it only if the
  two are exact complements: if the outline leaves faster than the solid
  arrives, the pair goes light mid-press, which is the dip reported as cheap;
  if it leaves slower, both drawings are painted at once and the icon reads
  as a blob for a few frames.

  This is the demand the band's `gap` made of the two clips, asked of
  opacities instead. It is the one assertion here that did not need
  rewriting in spirit when the mechanism changed underneath it.
*/
must(worstSum <= 0.05, "the two glyphs are exact complements: the pair never goes light or double",
  `outline + ink strayed from 1 by ${worstSum} at worst`)
/*
  AND IT SWEEPS RATHER THAN JUMPING. A state with no duration cannot be seen
  moving, and a glyph that changes in one frame is a hard edge however smooth
  everything around it is. Readings are ~12ms apart and the fill runs for
  FILL_MS, so a real cross-fade is caught several times part way through.
*/
must(fadeSteps >= 4, "and the fill sweeps rather than appearing in one frame",
  `the fade was caught in only ${fadeSteps} position(s) between the two drawings`)
must(boxDippedTo >= 0.99, "while the box around them stays solid the whole way through a press",
  `the faintest an icon went was ${boxDippedTo}`)
must(swapAtMs <= 40, "and it starts filling on the frame the finger lands, not after one",
  `the fill did not start until ${swapAtMs}ms after the finger landed`)

for (const c of centred) {
  must(c.dx !== null, `${c.label}'s glyph is drawn at all`, "no ink found inside its circle")
  must(Math.abs(c.dx) <= 0.5 && Math.abs(c.dy) <= 0.5,
    `${c.label}'s glyph sits in the middle of its circle, to half a pixel`,
    `its ink is ${c.dx} x ${c.dy} off centre: a glyph drawn bigger than the box it is given hangs the difference off its right and its bottom`)
}

for (const ic of icons) {
  must(!ic.missing, `${ic.label} is drawn at all`, "no ink found in its box")
  must(Math.abs(ic.grewW) <= 1 && Math.abs(ic.grewH) <= 1,
    `${ic.label} is the same size on as off`,
    `its ink box changed by ${ic.grewW} x ${ic.grewH} at 2x when the tab turned on: the icon shrinks as it fills`)
  must(ic.edges <= 1, `and in the same place, to the half pixel`,
    `an edge of it moved ${ic.edges} at 2x when the tab turned on`)
}
must(routeTap.arrived === "/app/products", "the page really does change under the bar, which is what a press is for",
  `the pathname finished at ${routeTap.arrived}`)
must(routeTap.quietAfter <= 500, "and the circle is done moving before the page arrives, not after it",
  `it was still moving ${routeTap.quietAfter}ms in, with the route landing at 260ms: ${routeTap.frames.join(" ")}`)
console.log(`  under load  a press while 260ms of page renders on the same thread: landed ${busy.landed}px`)
console.log(`              arrived after ${busy.arrivedMs}ms, ${busy.lateJump}px jump after that, ${busy.turns} changes of direction\n`)
must(busy.arrivedMs <= 700, "the hand-over finishes even while the page it opened is rendering",
  `the lens took ${busy.arrivedMs}ms to reach the slot with 260ms of page rendering on the same thread`)
must(busy.lateJump <= 1, "and does not lurch once it is there",
  `it jumped ${busy.lateJump}px after arriving: ${busy.frames.join(" ")}`)
must(routeTap.turns <= 1, "so arriving does not move it a second time",
  `the circle changed direction ${routeTap.turns} time(s) across the press and the route: ${routeTap.frames.join(" ")}`)
must(drag.distinct >= 3, "through the slots on the way, not straight to the end",
  `it only ever showed ${drag.distinct} positions`)
must(drag.monotonic, "and it never goes backwards while the finger goes forwards",
  `the trail was ${drag.trail.join(", ")}`)
must(drag.went === "/app/analytics", "lifting picks the slot the finger is over",
  `it navigated to ${drag.went} instead of the fourth slot`)
must(drag.haptics.length >= 4, "and it ticks on the way, once per slot crossed and once on the lift",
  `${drag.haptics.length} haptic ticks for a slide across four slots`)
must(drag.haptics.length <= 10, "rather than once per frame",
  `${drag.haptics.length} ticks for a slide across four slots is per frame, not per slot`)

console.log("")
must(routes.onepage.pill === false && routes.onepage.halo === false,
  "the pill is not rendered at all on OnePage, which has its own controls along the bottom",
  "the pill is still in the document on /app/onepage")
must(routes.deeper.pill === false, "nor anywhere under it",
  "the pill came back on a route below /app/onepage")
must(routes.back.pill === true, "and it is back on the next page that is a page",
  "the pill did not come back after leaving /app/onepage")

console.log(`  a tap       lifted on the third slot, went back ${settled.wentBack}px, resting ${settled.rest}px from it`)
must(settled.went === "/app/products", "a tap picks the slot it landed on", `it went to ${settled.went}`)
must(settled.wentBack < SLOT_W / 2,
  "and the circle stays on it while the page loads, instead of springing back and coming again",
  `it travelled ${settled.wentBack}px back toward the slot it left — over half a slot, which is the spring-back: ${settled.samples.join(", ")} against a target of ${settled.target}`)
must(settled.rest <= 2, "and it is still on it half a second later",
  `it is resting ${settled.rest}px away from the slot it was left on`)

console.log("")
must(share.during > share.before + 40, "a page that raises its own bottom bar gets the strip, and the pill drops away",
  `the pill sat at y=${share.before} and moved to y=${share.during} when a bottom bar appeared: it is still over it`)
must(!share.reachable, "and nothing can be pressed on it while it is gone",
  "the pill is invisible but still takes presses, which is worse than leaving it")
must(share.after === share.before, "it comes back when the bar goes",
  `it returned to y=${share.after} instead of y=${share.before}`)
must(share.moves, "and it moves rather than blinking", "the pill has no transform transition")

console.log("")
must(sheetOver.opacity > 0.9 && sheetOver.visibility === "visible" && sheetOver.painted,
  "a sheet opens over the pill and the pill stays visible under it, over the page",
  `opacity ${sheetOver.opacity}, ${sheetOver.visibility}, ${sheetOver.painted ? "painted" : "covered by the page"} (${sheetOver.under}, pill z ${sheetOver.z}): the pill disappears under a sheet`)
must(sheetOver.during.top === sheetOver.before.top, "and in its place",
  `the pill moved from y=${sheetOver.before.top} to y=${sheetOver.during.top} while a sheet was open`)
must(sheetOver.tapIsTheScrims, "and a tap on it is the scrim's, not the pill's",
  "the pill took a tap through an open sheet")

console.log(`  the glass   a slide from Home to Products in the native shell, ${glass.frames} frames watched`)
console.log(`              tracking: the lens ${glass.trackingMedianPx}px from the finger at the median, ${glass.trackingWorstPx}px at worst, over ${glass.trackedFrames} frames`)
console.log(`              stretched to ${glass.widestStretch}x its width, landed ${glass.landedOffPx.dx}px off the slot's centre, ${glass.pastSlotPx}px past it, still after ${glass.settledMs}ms`)
console.log(`              the glyphs' centres moved ${glass.glyphMovedPx}px at most; the links' opacity never went below ${glass.linkOpacityMin}`)
console.log(`              the icon touched gave to ${glass.pulse.min}x, sprang to ${glass.pulse.max}x and rested at ${glass.pulse.end}x; the others changed size by ${glass.othersResizedPx}px\n`)
must(glass.trackedFrames >= 5, "the slide was long enough to read the tracking", `only ${glass.trackedFrames} frames of it`)
must(glass.trackingMedianPx <= 1, "under a finger the lens is where the finger is, one to one",
  `it was ${glass.trackingMedianPx}px from the finger at the median`)
must(glass.trackingWorstPx <= 7, "and never more than a frame of the finger's own travel behind it",
  `it was ${glass.trackingWorstPx}px behind at worst`)
/* CHANGED (nav feel round): the stretch's cap went from 0.08 to 0.11 and an
   ordinary slide reaches more of it (STRETCH_AT), so the widest the glass
   gets, lift included, is 1.04 x 1.11 = about 1.15 rather than about 1.12. */
must(glass.widestStretch >= 1.05 && glass.widestStretch <= 1.16, "it stretches along the way it moves, to about 1.15 and no more",
  `it was ${glass.widestStretch}x as wide as it is round`)
if (glass.trace) console.log(glass.trace)
console.log(`              the drop's own shape: ${glass.squash.widest}x at its widest, ${glass.squash.narrowest}x at its narrowest once the finger stopped, ${glass.squash.last}x at rest`)
must(glass.squash.narrowest < 0.998 && glass.squash.narrowest >= 0.97 && glass.squash.last === 1,
  "and when the finger stops it runs on into a slight squash and settles round, like a drop, not a stamp",
  `narrowest ${glass.squash.narrowest}x after the finger stopped, ${glass.squash.last}x at rest`)
console.log(`  a flick     released at speed 18px past Products\u0027 centre: went to ${flick.went}, landed on slot ${flick.landedSlot + 1} ${flick.landedOffPx}px off its centre`)
console.log(`              ${flick.pastSlotPx}px past it, still after ${flick.settledMs}ms, widest ${flick.widest}x, biggest step after the lift ${flick.stepAfter}px\n`)
must(flick.landedOffPx <= 0.5, "a flick lands on a slot's exact centre too", `${flick.landedOffPx}px off it`)
must(flick.went === "/app/products" && flick.landedSlot === 2, "the slot the finger was over, with no momentum carried past it",
  `it went to ${flick.went}, slot ${flick.landedSlot + 1}`)
must(flick.widest <= 1.16, "stretched no more than about 1.15 however fast", `${flick.widest}x`)
must(flick.settledMs <= 600, "and it is still within about half a second", `it was still moving ${flick.settledMs}ms after the lift`)
must(glass.landedOffPx.dx <= 0.5 && glass.landedOffPx.dy <= 0.5, "and lands on the slot's exact centre",
  `it came to rest ${glass.landedOffPx.dx}px across and ${glass.landedOffPx.dy}px down from the slot's centre`)
must(glass.pastSlotPx <= 3, "with no more than a small overshoot on the way",
  `it went ${glass.pastSlotPx}px past the slot`)
must(glass.went === "/app/products", "letting go of it picks the slot it landed on", `it went to ${glass.went}`)
must(glass.glyphMovedPx < 0.5, "no icon moves, not by half a pixel, through the press, the slide and the release",
  `a glyph's centre moved ${glass.glyphMovedPx}px`)
/* "Make tapping an icon feel a touch more satisfying (subtle press scale/spring, nothing big)." */
must(glass.pulse.min >= 0.88 && glass.pulse.min <= 0.93 && glass.pulse.max >= 1.01 && glass.pulse.max <= 1.04 && Math.abs(glass.pulse.end - 1) < 0.002,
  "the icon touched gives a little (to about 0.9), springs back through about 1.03 and rests at exactly its size",
  `it went to ${glass.pulse.min}x, up to ${glass.pulse.max}x, and rested at ${glass.pulse.end}x`)
must(glass.othersResizedPx < 0.01, "and no other icon changes size", `another glyph's box changed by ${glass.othersResizedPx}px`)
must(glass.linkOpacityMin >= 0.999, "and none dims under the finger in the native shell, where a:active used to",
  `a link's opacity went down to ${glass.linkOpacityMin}`)
console.log(`              with :active forced in the native shell: a pill icon ${glass.forcedActive.pill}, an ordinary link ${glass.forcedActive.control}\n`)
must(glass.forcedActive.control < 0.9, "the native shell's press dimming is in play for this check (an ordinary link dims)",
  `an ordinary link read ${glass.forcedActive.control} with :active forced, so the check below proves nothing`)
must(glass.forcedActive.pill >= 0.999, "and a pill icon held under a finger keeps its full opacity",
  `a pill icon read ${glass.forcedActive.pill} with :active forced: it dims under the finger and flickers back on the release`)

console.log(`\n  pictures in .nav-probe/closed.png and .nav-probe/open.png\n`)
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The pill is where a thumb is, it is glass, and the menu is a light page.\n")
