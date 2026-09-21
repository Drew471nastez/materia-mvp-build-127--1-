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
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const VIEW_W = 390
const VIEW_H = 844
const shots = join(root, ".nav-probe")
mkdirSync(shots, { recursive: true })

/* The stubs live INSIDE the repo: esbuild resolves "react" from the nearest
   node_modules, and a file in /tmp has none above it. */
const out = mkdtempSync(join(tmpdir(), "storelib-navpill-"))
writeFileSync(join(shots, "navigation.js"), `export const usePathname = () => "/app"
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
  const controls = [...pill.querySelectorAll("a[aria-label]"), document.querySelector("[data-app-nav-pill] button[aria-label]")]
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
              const btn = document.querySelector("[data-app-nav-pill] button[aria-label]").getBoundingClientRect()
              const left = Math.min(b.left, btn.left)
              const right = Math.max(b.right, btn.right)
              return Math.abs((left + right) / 2 - window.innerWidth / 2) <= 1
            })(),
            gapToButton: (() => {
              const btn = document.querySelector("[data-app-nav-pill] button[aria-label]").getBoundingClientRect()
              return Math.round(btn.left - b.right)
            })(),
            radius: ps.borderRadius, bg: ps.backgroundColor, shadow: ps.boxShadow.slice(0, 120) },
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
      return { h: Math.round(fade.getBoundingClientRect().height), layers: layers.length, masked, opaque, steps }
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
  }
})()`
const shut = await ev(READ_PILL)
await ev('document.querySelector(".app-content-scroll").scrollTop = 0')
await sleep(120)
await shoot("closed.png")

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
const fadeBox = await ev(`(() => {
  const f = document.querySelector("[data-app-nav-fade]").getBoundingClientRect()
  const b = document.querySelector('nav[aria-label="Main"]').getBoundingClientRect()
  return { top: Math.round(f.top), bottom: Math.round(f.bottom), barMid: Math.round(b.top + b.height / 2) }
})()`)
const contrastAt = async (y) => {
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 4, y: y - 8, width: 8, height: 16, scale: 1 }, captureBeyondViewport: false })
  return contrastOf(decodePng(Buffer.from(data, "base64")))
}
const blur = {
  above: await contrastAt(fadeBox.top - 60),
  top: await contrastAt(fadeBox.top + 10),
  bottom: await contrastAt(fadeBox.barMid),
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
await sleep(300)
const drag = {
  trail: dragTrail,
  travelled: dragTrail[dragTrail.length - 1] - dragTrail[0],
  distinct: new Set(dragTrail).size,
  monotonic: dragTrail.every((v, i) => i === 0 || v >= dragTrail[i - 1] - 1),
  went: await ev("window.__went"),
  haptics: await ev("(globalThis.__haptics || []).slice()"),
  target: slots[3],
}
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
const after = []
for (let i = 0; i < 16; i++) { await sleep(32); after.push(await ev(dot)) }
const settled = {
  samples: after,
  target: slots[2].x,
  /* How far BACK it went. With the pick forgotten this is a whole slot or
     more; the few pixels left are the tail of the settle still arriving. */
  wentBack: Math.round(slots[2].x - Math.min(...after)),
  /* And where it ends up once the spring has finished. */
  rest: Math.round(Math.max(...after.slice(6).map((v) => Math.abs(v - slots[2].x)))),
  went: await ev("window.__went"),
}
await ev("window.__went = null; true")

/* ── open it, the way the pill does ──────────────────────────────────────── */
const menuBtn = await ev(`(() => {
  /* Its own button beside the bar now, not a slot inside it. */
  const b = document.querySelector('[data-app-nav-pill] button[aria-label]')
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
    settingsInTheBar: (() => {
      const b = document.querySelector('[data-app-nav-pill] button[aria-label="Settings"]')
      if (!b) return null
      const r = b.getBoundingClientRect()
      const x = document.querySelector('[data-app-nav-pill] button[aria-label="Close menu"]').getBoundingClientRect()
      return { visible: Number(getComputedStyle(b).opacity) > 0.9, rightOfTheX: r.left >= x.right - 1,
               round: Math.round(r.width) === Math.round(r.height), gap: Math.round(r.left - x.right) }
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
console.log(`  the fade    ${shut.fade?.h}px tall, ${shut.fade?.steps} blur steps and a tint, ${shut.fade?.masked} masks, ${shut.fade?.opaque} opaque fills, ${shut.maskedBlurs} masked backdrop-filters`)
console.log(`  targets     ${shut.targets.map((t) => `${t.label} ${t.w}x${t.h}`).join(", ")}`)
console.log(`  clearance   list padded ${shut.scrollPadBottom} at the bottom; scrolled to the end the last card stops ${shut.lastCardClear}px above the pill`)
console.log(`  the menu    ${open.covers}px tall from y=${open.top}, ${open.bg}, moves ${open.transition}`)
console.log(`  a group     ${group.shutHeight}px to ${group.openHeight}px over ${group.steps} distinct heights, worst frame ${group.worstFrame}ms of ${group.frames}\n`)

must(!shut.headerHasHamburger, "the hamburger is out of the header", "the header still carries a hamburger")
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
must(shut.targets.length === 5, "the bar carries Home, Orders, Products, Settings, and the menu beside them",
  `it carries ${shut.targets.map((t) => t.label).join(", ")}`)
must(shut.targets.map((t) => t.label).join(",") === "Home,Orders,Products,Settings,Menu",
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
must(!!shut.fade && shut.fade.steps >= 4, "the page dissolves into a stacked progressive blur toward the bottom edge",
  `the fade has ${shut.fade?.steps ?? 0} blur steps`)
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
must(/^rgba?\(255, 255, 255/.test(shut.pill.bg) && pillAlpha >= 0.6 && pillAlpha <= 0.8,
  "the bar is frosted white: readable over anything, and not a panel",
  `the bar is ${shut.pill.bg}`)
must(/blur\(/.test(shut.glass.backdrop), "and it carries its own blur, so the page is visible THROUGH it",
  `the bar's backdrop-filter is "${shut.glass.backdrop}"`)
must(shut.selector.w === shut.selector.h, "the selector is a circle, not an oval",
  `it is ${shut.selector.w}x${shut.selector.h}`)
must(!/139, 92, 246|rgb\(139/.test(shut.selector.bg), "and it is not painted in the accent colour",
  `the selector is ${shut.selector.bg}`)
must(/transform/.test(shut.selector.moves), "it slides between slots rather than jumping",
  `it transitions ${shut.selector.moves}`)

must(Number.parseFloat(shut.scrollPadBottom) >= 88, "the page leaves room for the pill under its content",
  `.app-content-scroll pads only ${shut.scrollPadBottom} at the bottom, so the last row sits under the pill`)
must(shut.lastCardClear > 0, "so the last card is still clear of it at the end of the list",
  `the last card ends ${shut.lastCardClear}px past the top of the pill`)

console.log("")
console.log("  a column down the left margin, scrolled to the end of the page:")
for (const c of column) console.log(`    y=${String(c.y).padStart(3)}  rgb(${c.rgb.join(",")})${distance(c.rgb, pageColour) > 2 ? "   <- not the page colour" : ""}`)
console.log("")
console.log(`  the blur    stripes read ${blur.above} of contrast above the fade, ${blur.top} at its top, ${blur.bottom} at the bar\n`)
must(blur.above >= 120, "the stripe pattern is sharp where nothing is over it, so the test can see",
  `only ${blur.above} of contrast above the fade: the stripes are not being drawn sharply enough to measure against`)
must(blur.bottom <= blur.above * 0.3, "at the bar the page is blurred, not just tinted",
  `the stripes still read ${blur.bottom} of contrast at the bar against ${blur.above} above the fade`)
must(blur.top > blur.bottom + 10, "and the blur is progressive: lighter at the top of the fade than at the bottom",
  `the top of the fade reads ${blur.top} and the bottom ${blur.bottom}, which is a flat blur with an edge rather than a fade`)
must(blur.top >= blur.above * 0.35, "with the top edge of the fade barely touched, so there is no line where it begins",
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
/* 70% frost over pure red measures 31. The floor is 20 so that reading is a
   pass with room, and a panel, which moves 0, is still a long way under it. */
must(seeThrough.moved >= 20,
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
must(open.barItems.filter((l) => l === "Settings").length === 1,
  "settings is in the bar and stays there, open or shut",
  "settings used to appear beside the X only while the menu was open, which is the one time you are not looking for it")
must(open.groupCentred, "and the bar is still centred with the menu open",
  "opening the menu pushed the bar off centre")
must(!open.hasQuickSale, "and there is no Quick Sale", "a Quick Sale control is in the menu")
must(open.minRowHeight >= 40, "every row in it is at least 40px tall", `the shortest row is ${open.minRowHeight}px`)
must(open.closeIsInThePill, "the menu button has become the close button", "there is no close control in the pill")
must(open.pillOverMenu, "and the pill is on top of the page it opened", "the menu page is drawn over its own pill")
must(open.barItems.join(",") === "Home,Orders,Products,Settings,Close menu",
  "and nothing is added or taken away when it opens",
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
must(drag.distinct >= 3, "through the slots on the way, not straight to the end",
  `it only ever showed ${drag.distinct} positions`)
must(drag.monotonic, "and it never goes backwards while the finger goes forwards",
  `the trail was ${drag.trail.join(", ")}`)
must(drag.went === "/app/settings", "lifting picks the slot the finger is over",
  `it navigated to ${drag.went} instead of the fourth slot`)
must(drag.haptics.length >= 4, "and it ticks on the way, once per slot crossed and once on the lift",
  `${drag.haptics.length} haptic ticks for a slide across four slots`)
must(drag.haptics.length <= 10, "rather than once per frame",
  `${drag.haptics.length} ticks for a slide across four slots is per frame, not per slot`)

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

console.log(`\n  pictures in .nav-probe/closed.png and .nav-probe/open.png\n`)
if (problems.length) {
  console.error(`${problems.length} problem${problems.length > 1 ? "s" : ""}:\n`)
  problems.forEach((p, i) => console.error(`  ${i + 1}. ${p}`))
  console.error("")
  process.exit(1)
}
console.log("  The pill is where a thumb is, it is glass, and the menu is a light page.\n")
