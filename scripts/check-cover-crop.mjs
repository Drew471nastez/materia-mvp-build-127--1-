/**
 * ===========================================================================
 *  THE COVER UNDER A FINGER, AND THE SHEET IT IS EDITED IN, MEASURED
 * ===========================================================================
 * Four reports from the owner, each turned into numbers:
 *
 *   "I don't like the fade over the cover image on mobile."
 *      With Profile details open on a 390px phone, the band's pixels above
 *      the sheet are compared with the same pixels before it opened, and the
 *      band's own layers are read for any gradient or wash. At 1280 the band
 *      is compared with the markup it had before zoom existed: it must be
 *      pixel for pixel the same.
 *
 *   "The purple things in the corners."
 *      The cover in the report is black with the Storelib mark in the middle;
 *      the fixture draws one like it. Counted: purple pixels visible above
 *      the open sheet, and the colour just outside the sheet's rounded
 *      corners against what the page has there.
 *
 *   "Zoom in / zoom out should work by touch fingers."
 *      Real touches over CDP (Input.dispatchTouchEvent, two touch points for
 *      a pinch) on the real frame inside the real sheet. After every step of
 *      every gesture, mid-gesture included: does the photograph cover the
 *      frame (geometry, and a pixel scan for the frame's grey background),
 *      does the frame keep the band's shape, how many times did React render
 *      while a finger was down, and does the band then draw the same part of
 *      the photograph the frame showed.
 *
 *   "Smooth, 120fps, smooth close, smooth appear."
 *      Frame gaps while the sheet opens and while a pinch is under way, and
 *      whether the first frame of the open has the sheet below the screen.
 *
 * And the review of that work, each claim as a measurement: three phones
 * (375x667, 390x844, 430x932) for anything peeking above the sheet; the form
 * still scrolling around the frame at 320x568 and sideways at 667x375; a
 * finger lifted mid pinch, three fingers, a cancelled touch, a press that
 * starts on the pencil, double and slow taps, a glide caught mid way, Reset
 * during a glide and a turn mid drag, with no NaN anywhere; the page and the
 * frame showing the same part of a 4:3, a tall, a panoramic and a 60px
 * photograph at 390, 768 and 1280; and a save: a removed cover takes its
 * crop with it, and a save in flight cannot be closed out from under.
 *
 *   node scripts/check-cover-crop.mjs
 *
 * No production build is needed: the stylesheet is compiled from
 * app/globals.css with the Tailwind PostCSS plugin the build uses.
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { inflateSync } from "node:zlib"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-covercrop-"))
const stubs = join(root, ".cover-crop-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/andrewrullz"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() { window.__refreshes = (window.__refreshes || 0) + 1 }, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-cover-crop.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const logo = `data:image/webp;base64,${readFileSync(join(root, "public/storelib-logo.webp")).toString("base64")}`
const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))});window.__logo=${JSON.stringify(logo)}</script>` +
  `<script src="probe.js"></script></body></html>`)

/* ── The browser ─────────────────────────────────────────────────────── */
const proc = spawn(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
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

async function page({ width, height, phone, hash }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: phone })
  /* A phone: no hover, a coarse pointer, touches. That is what turns the
     touch-only rules in globals.css on, the `.group` transform strip among them. */
  await call("Emulation.setEmulatedMedia", {
    features: phone
      ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "prefers-reduced-motion", value: "no-preference" }]
      : [{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }, { name: "prefers-reduced-motion", value: "no-preference" }],
  })
  if (phone) await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await call("Page.navigate", { url: `file://${file}#${hash}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n${expression.slice(0, 160)}`)
    return r.result.value
  }
  for (let i = 0; i < 60; i++) {
    if (await js("!!window.__ready && !!document.querySelector('[data-cover-band]')")) break
    await sleep(100)
  }
  await sleep(600)
  const errs = await js("JSON.stringify(window.__err)")
  if (errs !== "[]") fail(`The page reported errors: ${errs}`)
  async function shot(clip) {
    const { data } = await call("Page.captureScreenshot", { format: "png", clip: { ...clip, scale: 1 }, captureBeyondViewport: false })
    return decodePng(Buffer.from(data, "base64"))
  }
  const touch = (type, points) => call("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) })
  return { call, js, shot, touch, close: () => send("Target.closeTarget", { targetId }) }
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
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const purple = (p) => p[2] > 120 && p[2] > p[1] * 1.5 && p[0] > p[1] * 1.1 && p[2] - p[1] > 60
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d

const problems = []
const report = {}
/** SHOTS=/some/dir keeps a picture of each state, for a person to look at. */
const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
async function keep(p, name) {
  if (!SHOTS) return
  const { data } = await p.call("Page.captureScreenshot", { format: "png" })
  writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
}

/* ======================================================================
   1. PROFILE PAGE, THREE PHONES AND 1280: the fade, the corners, the purple tab
   ====================================================================== */
/* Three phones, the small, the common and the large, for anything peeking above the sheet. */
const PROFILE_VIEWPORTS = [
  { name: "375x667", width: 375, height: 667, phone: true },
  { name: "390", width: 390, height: 844, phone: true },
  { name: "430x932", width: 430, height: 932, phone: true },
  { name: "1280", width: 1280, height: 800, phone: false },
]
for (const vp of PROFILE_VIEWPORTS) {
  const p = await page({ ...vp, hash: "profile" })
  const band = JSON.parse(await p.js(`(() => {
    const b = document.querySelector("[data-cover-band]")
    const r = b.getBoundingClientRect()
    const img = b.querySelector("img")
    const owner = b.querySelector("[aria-label='Edit profile']")?.closest("div.absolute")
    /* Every layer over the picture that is not the picture or the owner's buttons. */
    const layers = [...b.querySelectorAll("*")].filter((el) => el !== img && !(owner && owner.contains(el)))
      .map((el) => { const s = getComputedStyle(el); return { tag: el.tagName, bg: s.backgroundColor, bi: s.backgroundImage, op: s.opacity } })
      .filter((l) => l.bi !== "none" || !/rgba\\(0, 0, 0, 0\\)|transparent/.test(l.bg))
    const btn = b.querySelector("[aria-label='Edit profile']")
    return JSON.stringify({ top: r.top, left: r.left, w: r.width, h: r.height, layers, buttonBg: btn ? getComputedStyle(btn).backgroundColor : null,
      buttonH: btn ? btn.getBoundingClientRect().height : null })
  })()`))
  /* The whole screen, before and after, so the comparison covers whatever is left in view. */
  const before = await p.shot({ x: 0, y: 0, width: vp.width, height: vp.height })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  const owner = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").closest("div.absolute").getBoundingClientRect())`))
  const cx = pencil.x + pencil.width / 2, cy = pencil.y + pencil.height / 2
  /* Frame gaps from the press to the sheet at rest, and the sheet's first painted position. */
  await p.js(`(() => { window.__gaps = []; window.__firstTop = null; let last = 0; const tick = (t) => {
    if (last) window.__gaps.push(t - last); last = t
    const s = document.querySelector("[data-sheet-panel]") || document.querySelector("[role=dialog][data-state]")
    if (s && window.__firstTop === null) window.__firstTop = s.getBoundingClientRect().top
    if (window.__gaps.length < 90) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`)
  if (vp.phone) {
    await p.touch("touchStart", [[cx, cy]])
    await p.touch("touchEnd", [])
  } else {
    await p.call("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", clickCount: 1 })
    await p.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: cy, button: "left", clickCount: 1 })
    /* Off the button, so its own hover colour is not what gets measured. */
    await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: vp.height - 5 })
  }
  await sleep(1200)
  const sheet = JSON.parse(await p.js(`(() => {
    const panel = document.querySelector("[data-sheet-panel]") || document.querySelector("[role=dialog][data-state=open]")
    if (!panel) return JSON.stringify({ missing: true })
    const r = panel.getBoundingClientRect()
    const layer = panel.closest("[data-app-sheet]")
    const scrim = layer ? layer.firstElementChild : document.querySelector("[data-slot=dialog-overlay]")
    const frame = document.querySelector("[data-cover-crop-frame]")
    const fr = frame ? frame.getBoundingClientRect() : null
    const bs = getComputedStyle(panel)
    return JSON.stringify({ top: r.top, left: r.left, w: r.width, h: r.height, scrimBg: scrim ? getComputedStyle(scrim).backgroundColor : null,
      scrimOpacity: scrim ? getComputedStyle(scrim).opacity : null, radius: bs.borderTopLeftRadius, bg: bs.backgroundColor,
      frame: fr ? { w: fr.width, h: fr.height } : null, firstTop: window.__firstTop,
      gaps: window.__gaps.slice(2) })
  })()`))
  if (sheet.missing) { problems.push(`${vp.name}: Profile details never opened`); await p.close(); continue }
  const after = await p.shot({ x: 0, y: 0, width: vp.width, height: vp.height })
  await keep(p, `profile-${vp.name}-open`)
  /*
    What is still in view: above the sheet on a phone; left of the drawer on
    a desktop, less the 64px its (unchanged) shadow falls across. The owner's
    buttons are left out: a press changes their own colour, which is theirs.
  */
  const inOwner = (x, y) => x >= owner.x - 2 && x <= owner.x + owner.width + 2 && y >= owner.y - 2 && y <= owner.y + owner.height + 2
  let maxDiff = 0, counted = 0, purpleAbove = 0, bandCounted = 0
  const maxY = vp.phone ? Math.floor(sheet.top) - 1 : vp.height
  const maxX = vp.phone ? vp.width : Math.floor(sheet.left) - 64
  for (let y = 0; y < maxY; y += 2) {
    for (let x = 0; x < maxX; x += 2) {
      if (inOwner(x, y)) continue
      const d = dist(before.px(x, y), after.px(x, y))
      if (d > maxDiff) maxDiff = d
      counted++
      if (y >= band.top && y < band.top + band.h) bandCounted++
      if (purple(after.px(x, y))) purpleAbove++
    }
  }
  const r = {
    band: `${Math.round(band.w)}x${Math.round(band.h)} (${round(band.w / band.h)}:1) at y=${Math.round(band.top)}`,
    layersOverCover: band.layers.length,
    ownerButton: `${band.buttonBg}, ${band.buttonH}px`,
    sheet: `${Math.round(sheet.w)}x${Math.round(sheet.h)} at x=${Math.round(sheet.left)} y=${Math.round(sheet.top)}`,
    scrim: `${sheet.scrimBg} opacity ${sheet.scrimOpacity}`,
    pagePixelsChangedByOpen: `max RGB distance ${round(maxDiff)} over ${counted} samples still in view (${bandCounted} of them on the cover)`,
  }
  if (band.layers.length) problems.push(`${vp.name}: something is drawn over the cover: ${JSON.stringify(band.layers)}`)
  if (maxDiff > 3) problems.push(`${vp.name}: opening Profile details changed the page's pixels by up to ${round(maxDiff)} (a dim or a fade)`)
  if (vp.phone) {
    r.purplePixelsAboveSheet = purpleAbove
    if (purpleAbove > 0) problems.push(`${vp.name}: ${purpleAbove} purple pixels of the banner's mark still show above the sheet`)
    /* The rounded corners: just outside the curve is the page, unchanged; just inside is the sheet's white. */
    const ty = Math.round(sheet.top)
    const outside = [after.px(1, ty + 1), after.px(vp.width - 2, ty + 1)]
    const pageThere = [before.px(1, ty + 1), before.px(vp.width - 2, ty + 1)]
    const inside = after.px(40, ty + 14)
    r.corners = `outside ${JSON.stringify(outside)}, page there before ${JSON.stringify(pageThere)}, inside ${JSON.stringify(inside)}, radius ${sheet.radius}`
    if (outside.some((o) => purple(o))) problems.push(`${vp.name}: purple at the sheet's corners`)
    if (outside.some((o, i) => dist(o, pageThere[i]) > 3)) problems.push(`${vp.name}: the corners show something other than the page`)
    if (dist(inside, [255, 255, 255]) > 3) problems.push(`${vp.name}: the sheet's own surface is not white under its top edge: ${JSON.stringify(inside)}`)
    r.firstFrameTop = sheet.firstTop === null ? "n/a" : `${Math.round(sheet.firstTop)} (screen is ${vp.height})`
    if (sheet.firstTop !== null && sheet.firstTop < vp.height - 2) problems.push(`${vp.name}: the sheet's first frame was already on screen at ${sheet.firstTop}`)
    const g = sheet.gaps.slice().sort((a, b) => a - b)
    r.openFrameGaps = `p50 ${round(g[Math.floor(g.length * 0.5)] ?? 0, 1)}ms p95 ${round(g[Math.floor(g.length * 0.95)] ?? 0, 1)}ms max ${round(g[g.length - 1] ?? 0, 1)}ms over ${g.length}`
    r.frameInSheet = sheet.frame ? `${round(sheet.frame.w, 1)}x${round(sheet.frame.h, 1)} (${round(sheet.frame.w / sheet.frame.h)}:1, band ${round(band.w / band.h)}:1)` : "none"
    if (sheet.frame && Math.abs(sheet.frame.w / sheet.frame.h - band.w / band.h) > 0.02) problems.push(`${vp.name}: the frame in the sheet is not the band's shape`)
  }
  if (vp.phone) {
    /*
      THE KEYBOARD. ViewportVars publishes what the keyboard hides as
      --kb-inset and what is left as --vv-h; set them as a 320px keyboard
      would, and read where Save ends up.
    */
    const kb = JSON.parse(await p.js(`(async () => {
      const root = document.documentElement
      root.style.setProperty("--kb-inset", "320px")
      root.style.setProperty("--vv-h", "${vp.height - 320}px")
      await new Promise((r) => setTimeout(r, 450))
      const save = [...document.querySelectorAll("[data-sheet-panel] button")].find((b) => b.textContent.trim() === "Save")
      const panel = document.querySelector("[data-sheet-panel]").getBoundingClientRect()
      const s = save.getBoundingClientRect()
      root.style.removeProperty("--kb-inset")
      root.style.removeProperty("--vv-h")
      await new Promise((r) => setTimeout(r, 450))
      return JSON.stringify({ saveBottom: s.bottom, panelTop: panel.top, panelBottom: panel.bottom })
    })()`))
    r.withA320pxKeyboard = `Save ends at y=${Math.round(kb.saveBottom)}, keyboard starts at ${vp.height - 320}; sheet ${Math.round(kb.panelTop)}..${Math.round(kb.panelBottom)}`
    if (kb.saveBottom > vp.height - 320 + 0.5) problems.push(`${vp.name}: Save is under a 320px keyboard (bottom ${kb.saveBottom})`)
    if (kb.panelTop < 0) problems.push(`${vp.name}: with the keyboard up the sheet runs off the top (${kb.panelTop})`)

    /* THE CLOSE: Cancel, then every frame until the sheet is out of the document. */
    const closing = JSON.parse(await p.js(`(async () => {
      const cancel = [...document.querySelectorAll("[data-sheet-panel] button")].find((b) => b.textContent.trim() === "Cancel")
      const panel = document.querySelector("[data-sheet-panel]")
      const tops = []
      const t0 = performance.now()
      cancel.click()
      await new Promise((resolve) => {
        const tick = () => {
          const el = document.querySelector("[data-sheet-panel]")
          if (!el) return resolve()
          tops.push(Math.round(el.getBoundingClientRect().top))
          if (performance.now() - t0 > 2000) return resolve()
          requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      let back = 0
      for (let i = 1; i < tops.length; i++) if (tops[i] < tops[i - 1] - 0.5) back++
      return JSON.stringify({ ms: Math.round(performance.now() - t0), frames: tops.length, first: tops.slice(0, 3), last: tops.slice(-2), back, gone: !document.querySelector("[data-sheet-panel]") })
    })()`))
    r.closeOnCancel = `${closing.frames} frames, ${closing.ms}ms, tops ${closing.first.join(",")} .. ${closing.last.join(",")}, backward steps ${closing.back}, gone ${closing.gone}`
    if (!closing.gone) problems.push(`${vp.name}: the sheet was still in the document 2s after Cancel`)
    if (closing.back > 0) problems.push(`${vp.name}: the close moved backwards ${closing.back} times`)
    if (closing.frames < 12) problems.push(`${vp.name}: the close was ${closing.frames} frames, a cut rather than a slide`)
  }
  report[`profile @${vp.name}`] = r
  await p.close()
}

/* ======================================================================
   2. REFERENCE: a cover saved before zoom looks exactly as it did
   ====================================================================== */
for (const vp of [{ name: "390", width: 390, height: 844, phone: true }, { name: "1280", width: 1280, height: 800, phone: false }]) {
  const p = await page({ ...vp, hash: "reference" })
  const rects = JSON.parse(await p.js(`JSON.stringify([document.querySelector("[data-cover-band]"), document.querySelector("[data-reference-band]")].map((b) => { const r = b.getBoundingClientRect(); return { top: r.top, h: r.height, w: r.width } }))`))
  /* The avatar straddles the real band's bottom edge; its rows are left out. */
  const avatarTop = await p.js(`(() => { const a = document.querySelector("[data-case=real] [data-slot=avatar]") || document.querySelector("[data-case=real] .rounded-full"); return a ? a.getBoundingClientRect().top : 1e9 })()`)
  const [a, b] = rects
  /* And 24px more: the avatar's soft shadow reaches above its circle. */
  const rows = Math.max(1, Math.min(Math.round(a.h), Math.floor(avatarTop - a.top) - 24))
  const sa = await p.shot({ x: 0, y: Math.round(a.top), width: vp.width, height: rows })
  const sb = await p.shot({ x: 0, y: Math.round(b.top), width: vp.width, height: rows })
  let max = 0, sum = 0, n = 0, at = null
  for (let y = 0; y < Math.min(sa.h, sb.h); y += 1) for (let x = 0; x < vp.width; x += 1) {
    const d = dist(sa.px(x, y), sb.px(x, y))
    sum += d; n++
    if (d > max) { max = d; at = [x, y, sa.px(x, y), sb.px(x, y)] }
  }
  report[`zoom-1 band vs the old markup @${vp.name}`] = `${Math.round(a.w)}x${Math.round(a.h)} at y=${a.top} vs ${Math.round(b.w)}x${Math.round(b.h)} at y=${b.top}, ${rows} rows above the avatar compared, max pixel difference ${round(max)} at ${JSON.stringify(at)}, mean ${round(sum / n, 3)}`
  if (Math.abs(a.h - b.h) > 0.5 || max > 2) problems.push(`${vp.name}: a zoom-1 cover no longer matches the old markup (max ${round(max)})`)
  await p.close()
}

/* ── The frame and the band, read together, and what each shows of the photograph ── */
const READ = `(() => {
  const f = document.querySelector("[data-cover-crop-frame]")
  const img = f.querySelector("img")
  const fr = f.getBoundingClientRect(), ir = img.getBoundingClientRect()
  const cs = getComputedStyle(f)
  const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth)
  const inner = { l: fr.left + bl, t: fr.top + bt, r: fr.right - parseFloat(cs.borderRightWidth), b: fr.bottom - parseFloat(cs.borderBottomWidth) }
  /* The corner controls draw white glyphs; the scan for the frame's grey leaves them out. */
  const controls = [...f.querySelectorAll("button")].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left - 2, t: r.top - 2, r: r.right + 2, b: r.bottom + 2 } })
  const band = document.querySelector("[data-cover-band]")
  const br = band.getBoundingClientRect()
  const bimg = band.querySelector("img")
  const bir = bimg.getBoundingClientRect()
  const bcs = getComputedStyle(bimg)
  return JSON.stringify({ inner, img: { l: ir.left, t: ir.top, r: ir.right, b: ir.bottom, w: ir.width, h: ir.height },
    nw: img.naturalWidth, nh: img.naturalHeight, frameAspect: (inner.r - inner.l) / (inner.b - inner.t),
    band: { l: br.left, t: br.top, w: br.width, h: br.height }, bandImg: { l: bir.left, t: bir.top, w: bir.width, h: bir.height, pos: bcs.objectPosition, fit: bcs.objectFit },
    crop: window.__crop, renders: window.__renders, transform: img.style.transform, controls })
})()`
/** Which part of the photograph the frame shows, as fractions of it (the frame's <img> is the photograph's own rect). */
const visibleFrame = (s) => {
  const w = s.img.w, h = s.img.h
  return { u0: (s.inner.l - s.img.l) / w, u1: (s.inner.r - s.img.l) / w, v0: (s.inner.t - s.img.t) / h, v1: (s.inner.b - s.img.t) / h }
}
/** The same for the band: object-fit: cover inside the band image's box, at its object-position. */
const visibleBand = (s) => {
  const bw = s.bandImg.w, bh = s.bandImg.h
  const k = Math.max(bw / s.nw, bh / s.nh)
  const pw = s.nw * k, ph = s.nh * k
  const [ox, oy] = s.bandImg.pos.split(" ").map((v) => parseFloat(v) / 100)
  const left = s.bandImg.l + (bw - pw) * ox, top = s.bandImg.t + (bh - ph) * oy
  return { u0: (s.band.l - left) / pw, u1: (s.band.l + s.band.w - left) / pw, v0: (s.band.t - top) / ph, v1: (s.band.t + s.band.h - top) / ph }
}
const uvDiff = (a, b) => Math.max(Math.abs(a.u0 - b.u0), Math.abs(a.u1 - b.u1), Math.abs(a.v0 - b.v0), Math.abs(a.v1 - b.v1))

/* ======================================================================
   3. THE CROP UNDER REAL FINGERS, 390
   ====================================================================== */
{
  const vp = { width: 390, height: 844, phone: true }
  const p = await page({ ...vp, hash: "crop" })
  await sleep(700)
  const read = async () => JSON.parse(await p.js(READ))
  const s0 = await read()
  const sheetTop0 = await p.js(`document.querySelector("[data-sheet-panel]").getBoundingClientRect().top`)
  const inner = s0.inner
  const cx = (inner.l + inner.r) / 2, cy = (inner.t + inner.b) / 2
  const results = { steps: 0, worstUncovered: 0, worstGrey: 0, midGestureRenders: 0 }
  /** Coverage: geometry with a hundredth of a pixel of slack, then a pixel scan for the frame's grey. */
  async function coverage(tag) {
    const s = await read()
    const gap = Math.max(s.img.l - s.inner.l, s.img.t - s.inner.t, s.inner.r - s.img.r, s.inner.b - s.img.b, 0)
    results.worstUncovered = Math.max(results.worstUncovered, gap)
    const clip = { x: Math.ceil(s.inner.l) + 3, y: Math.ceil(s.inner.t) + 3, width: Math.floor(s.inner.r - s.inner.l) - 6, height: Math.floor(s.inner.b - s.inner.t) - 6 }
    const img = await p.shot(clip)
    let grey = 0
    for (let y = 0; y < img.h; y += 2) for (let x = 0; x < img.w; x += 2) {
      const X = x + clip.x, Y = y + clip.y
      if (s.controls.some((c) => X >= c.l && X <= c.r && Y >= c.t && Y <= c.b)) continue
      const px = img.px(x, y)
      if (dist(px, [245, 245, 245]) < 14) { grey++; if (process.env.DEBUG_GREY && grey < 4) console.log(tag, "grey at", x + clip.x, y + clip.y, px, JSON.stringify(s.inner)) }
    }
    results.worstGrey = Math.max(results.worstGrey, grey)
    results.steps++
    if (gap > 0.5) problems.push(`crop: ${tag}: the picture left ${round(gap)}px of the frame uncovered`)
    if (grey > 0) problems.push(`crop: ${tag}: ${grey} grey pixels inside the frame`)
    return s
  }
  const gaps = []
  await p.js(`(() => { window.__g = []; let last = 0; window.__run = true; const tick = (t) => { if (last) window.__g.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick) }; requestAnimationFrame(tick) })()`)

  /* A one-finger drag at zoom 1: down and right, 12 steps. */
  let r0 = await read()
  const rendersAtStart = r0.renders
  await p.touch("touchStart", [[cx, cy]])
  for (let i = 1; i <= 12; i++) {
    await p.touch("touchMove", [[cx + i * 5, cy + i * 6]])
    await sleep(16)
    if (i % 4 === 0) await coverage(`drag step ${i}`)
  }
  let mid = await read()
  results.midGestureRenders = Math.max(results.midGestureRenders, mid.renders - rendersAtStart)
  await p.touch("touchEnd", [])
  await sleep(120)
  const afterDrag = await coverage("after the drag")

  /* A pinch out, two fingers from 80px apart to 220px, around a point left of centre. */
  const px0 = cx - 40
  r0 = await read()
  await p.touch("touchStart", [[px0 - 40, cy], [px0 + 40, cy]])
  for (let i = 1; i <= 14; i++) {
    const half = 40 + i * 5
    await p.touch("touchMove", [[px0 - half, cy + i], [px0 + half, cy + i]])
    await sleep(16)
    if (i % 5 === 0) await coverage(`pinch out step ${i}`)
  }
  mid = await read()
  results.midGestureRenders = Math.max(results.midGestureRenders, mid.renders - r0.renders)
  await p.touch("touchEnd", [])
  await sleep(120)
  const afterPinch = await coverage("after the pinch out")

  /* Drag hard past every edge while zoomed. */
  for (const [dx, dy] of [[400, 300], [-800, -600], [800, -600], [-800, 600]]) {
    await p.touch("touchStart", [[cx, cy]])
    for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [[cx + (dx * i) / 8, cy + (dy * i) / 8]]); await sleep(12) }
    await coverage(`dragged ${dx},${dy} before release`)
    await p.touch("touchEnd", [])
    await sleep(80)
    await coverage(`dragged ${dx},${dy}`)
  }

  /* Pinch in far past 1. */
  await p.touch("touchStart", [[cx - 120, cy], [cx + 120, cy]])
  for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[cx - 120 + i * 11, cy], [cx + 120 - i * 11, cy]]); await sleep(16) }
  await coverage("pinched in past 1, before release")
  await p.touch("touchEnd", [])
  await sleep(120)
  const afterPinchIn = await coverage("after pinching in past 1")

  /* Zoom back in and leave it there for the band comparison. */
  await p.touch("touchStart", [[cx - 30, cy], [cx + 30, cy]])
  for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[cx - 30 - i * 6, cy - i], [cx + 30 + i * 6, cy - i]]); await sleep(16) }
  await p.touch("touchEnd", [])
  await sleep(200)
  const fin = await coverage("final")
  await keep(p, "crop-390-final")
  await p.js("window.__run = false")
  gaps.push(...JSON.parse(await p.js("JSON.stringify(window.__g)")))

  /* The band draws the same part of the photograph the frame shows. */
  const vf = visibleFrame(fin), vb = visibleBand(fin)
  const cropDiff = uvDiff(vf, vb)
  if (cropDiff > 0.004) problems.push(`crop: the band shows a different part of the photograph from the frame (by ${round(cropDiff * 100, 2)}% of it)`)
  const g = gaps.slice(2).sort((a, b) => a - b)
  report["crop @390, real touches"] = {
    frame: `${round(inner.r - inner.l, 1)}x${round(inner.b - inner.t, 1)}, ${round(s0.frameAspect)}:1; band ${round(s0.band.w)}x${round(s0.band.h)}, ${round(s0.band.w / s0.band.h)}:1`,
    afterDrag: afterDrag.crop,
    afterPinchOut: afterPinch.crop,
    afterPinchInPast1: afterPinchIn.crop,
    final: fin.crop,
    coverageChecks: `${results.steps} (mid-gesture and after release), worst uncovered ${round(results.worstUncovered, 3)}px, worst grey pixels ${results.worstGrey}`,
    reactRendersWhileAFingerWasDown: results.midGestureRenders,
    transformLeftAfterRelease: fin.transform || "none",
    bandVsFrame: `frame shows u ${round(vf.u0, 4)}..${round(vf.u1, 4)} v ${round(vf.v0, 4)}..${round(vf.v1, 4)}; band u ${round(vb.u0, 4)}..${round(vb.u1, 4)} v ${round(vb.v0, 4)}..${round(vb.v1, 4)}; max difference ${round(cropDiff * 100, 3)}% of the photo`,
    frameGapsDuringGestures: `p50 ${round(g[Math.floor(g.length * 0.5)] ?? 0, 1)}ms p95 ${round(g[Math.floor(g.length * 0.95)] ?? 0, 1)}ms max ${round(g[g.length - 1] ?? 0, 1)}ms over ${g.length}`,
  }
  const sheetTop1 = await p.js(`document.querySelector("[data-sheet-panel]")?.getBoundingClientRect().top ?? null`)
  report["crop @390, real touches"].sheetTopBeforeAndAfterGestures = `${sheetTop0} -> ${sheetTop1}`
  if (sheetTop1 === null || Math.abs(sheetTop1 - sheetTop0) > 0.5) problems.push(`crop: gestures on the frame moved the sheet (${sheetTop0} -> ${sheetTop1})`)
  if (results.midGestureRenders > 0) problems.push(`crop: React rendered ${results.midGestureRenders} times while a finger was down`)
  if (fin.transform) problems.push(`crop: a transform was left on the picture after release: ${fin.transform}`)
  if (!(afterPinch.crop.zoom > 1.5)) problems.push(`crop: a pinch out did not zoom (zoom ${afterPinch.crop.zoom})`)
  if (afterPinchIn.crop.zoom !== 1) problems.push(`crop: pinching in past 1 did not stop at 1 (zoom ${afterPinchIn.crop.zoom})`)
  if (!(afterDrag.crop.y < 50)) problems.push(`crop: a drag down did not bring the top of the picture into view (y ${afterDrag.crop.y})`)
  await p.close()
}

/* ======================================================================
   4. THE CROP ON A DESKTOP: mouse drag and a trackpad pinch (ctrl + wheel)
   ====================================================================== */
{
  const vp = { width: 1280, height: 800, phone: false }
  const p = await page({ ...vp, hash: "crop" })
  await sleep(700)
  const f = JSON.parse(await p.js(`(() => { const f = document.querySelector("[data-cover-crop-frame]"); const r = f.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }) })()`))
  await p.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: f.x, y: f.y, deltaX: 0, deltaY: -120, modifiers: 2 })
  await sleep(40)
  await p.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: f.x, y: f.y, deltaX: 0, deltaY: -120, modifiers: 2 })
  await sleep(400)
  const zoomed = JSON.parse(await p.js("JSON.stringify(window.__crop)"))
  await p.call("Input.dispatchMouseEvent", { type: "mousePressed", x: f.x, y: f.y, button: "left", buttons: 1, clickCount: 1 })
  for (let i = 1; i <= 10; i++) {
    await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: f.x - i * 6, y: f.y - i * 2, button: "left", buttons: 1 })
    await sleep(16)
  }
  await p.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: f.x - 60, y: f.y - 20, button: "left", buttons: 0, clickCount: 1 })
  await sleep(300)
  const dragged = JSON.parse(await p.js("JSON.stringify(window.__crop)"))
  const band = JSON.parse(await p.js(`(() => { const b = document.querySelector("[data-cover-band]").getBoundingClientRect(); return JSON.stringify({ w: b.width, h: b.height }) })()`))
  report["crop @1280, mouse and trackpad"] = {
    frame: `${round(f.w, 1)}x${round(f.h, 1)} (${round(f.w / f.h)}:1), band ${round(band.w)}x${round(band.h)} (${round(band.w / band.h)}:1)`,
    afterCtrlWheel: zoomed,
    afterMouseDrag: dragged,
  }
  if (!(zoomed.zoom > 1)) problems.push("1280: ctrl + wheel did not zoom")
  if (!(dragged.x > zoomed.x)) problems.push("1280: a mouse drag to the left did not move the picture left")
  if (Math.abs(f.w / f.h - band.w / band.h) > 0.02) problems.push("1280: the frame in the drawer is not the band's shape")
  await p.close()
}

/* ======================================================================
   5. SMALL SCREENS: the frame keeps every touch, so the form has to be
      reachable around it
   ====================================================================== */
for (const vp of [
  { name: "320x568", width: 320, height: 568, phone: true },
  { name: "667x375 landscape", width: 667, height: 375, phone: true },
]) {
  const p = await page({ ...vp, hash: "profile" })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  await p.touch("touchStart", [[pencil.x + pencil.width / 2, pencil.y + pencil.height / 2]])
  await p.touch("touchEnd", [])
  await sleep(1200)
  const GEO = `(() => {
    const panel = document.querySelector("[data-sheet-panel]")
    const sc = panel.querySelector("[data-sheet-scroll]")
    const f = panel.querySelector("[data-cover-crop-frame]")
    const s = sc.getBoundingClientRect(), fr = f.getBoundingClientRect()
    return JSON.stringify({ sc: { t: s.top, b: s.bottom, h: s.height, l: s.left, r: s.right }, fr: { t: fr.top, b: fr.bottom, h: fr.height, w: fr.width, l: fr.left, r: fr.right }, top: sc.scrollTop, max: sc.scrollHeight - sc.clientHeight })
  })()`
  const g = JSON.parse(await p.js(GEO))
  const covered = Math.max(0, Math.min(g.sc.b, g.fr.b) - Math.max(g.sc.t, g.fr.t))
  /* The widest strip of the form a thumb can start a scroll in, beside the frame. */
  const sideFree = Math.max(g.fr.l - g.sc.l, g.sc.r - g.fr.r)
  const below = Math.max(0, g.sc.b - g.fr.b)
  const above = Math.max(0, g.fr.t - g.sc.t)
  /* A scroll that starts on the form under the frame, or beside it when there is no room under it. */
  const startX = below >= 44 || sideFree < 44 ? (g.sc.l + g.sc.r) / 2 : g.fr.r + sideFree / 2
  const startY = below >= 44 ? g.fr.b + below / 2 : sideFree >= 44 ? (g.fr.t + g.fr.b) / 2 : g.fr.t - above / 2
  await p.touch("touchStart", [[startX, startY]])
  for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[startX, startY - i * 12]]); await sleep(16) }
  await p.touch("touchEnd", [])
  await sleep(500)
  const after = JSON.parse(await p.js(GEO))
  report[`small screen ${vp.name}`] = {
    scroller: `${Math.round(g.sc.h)}px tall, ${Math.round(g.max)}px to scroll`,
    frame: `${round(g.fr.w, 1)}x${round(g.fr.h, 1)}, covering ${Math.round(covered)}px of it (${Math.round((covered / g.sc.h) * 100)}%)`,
    freeAroundFrame: `${Math.round(below)}px under, ${Math.round(sideFree)}px beside`,
    scrollFromTheForm: `started at ${Math.round(startX)},${Math.round(startY)}: scrollTop ${Math.round(g.top)} -> ${Math.round(after.top)}`,
  }
  if (Math.max(below, sideFree) < 44) problems.push(`${vp.name}: the frame leaves no 44px strip of the form to start a scroll in (${Math.round(below)} under, ${Math.round(sideFree)} beside)`)
  if (!(after.top > g.top + 20)) problems.push(`${vp.name}: a drag on the form next to the frame did not scroll it (${g.top} -> ${after.top})`)
  await p.close()
}

/* ======================================================================
   6. THE AWKWARD GESTURES, 390: a finger lifted mid pinch, three fingers,
      a cancelled touch, a press on the corner buttons, taps, a glide
      caught mid way, Reset during a glide
   ====================================================================== */
{
  const vp = { width: 390, height: 844, phone: true }
  const p = await page({ ...vp, hash: "crop" })
  await sleep(700)
  const STATE = `(() => {
    const f = document.querySelector("[data-cover-crop-frame]")
    const img = f.querySelector("img")
    const fr = f.getBoundingClientRect(), ir = img.getBoundingClientRect()
    const btn = (label) => { const b = [...f.querySelectorAll("button")].find((x) => (x.getAttribute("aria-label") || x.textContent.trim()) === label); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } }
    return JSON.stringify({ frame: { l: fr.left, t: fr.top, r: fr.right, b: fr.bottom }, img: { l: ir.left, t: ir.top, w: ir.width, h: ir.height },
      crop: window.__crop, css: img.style.cssText, transform: img.style.transform, pencil: btn("Change banner"), reset: btn("Reset") })
  })()`
  const st = async () => JSON.parse(await p.js(STATE))
  const finite = (c) => [c.x, c.y, c.zoom].every((n) => typeof n === "number" && Number.isFinite(n))
  const s0 = await st()
  const cx = (s0.frame.l + s0.frame.r) / 2, cy = (s0.frame.t + s0.frame.b) / 2
  const r = {}
  const seen = []
  const note = (tag, s) => { seen.push(s); if (!finite(s.crop) || /NaN|Infinity/.test(s.css)) problems.push(`gestures: ${tag}: a non-number reached the crop or the style: ${JSON.stringify(s.crop)} ${s.css}`) }
  const settle = async (ms = 450) => { await sleep(ms); return st() }

  /* a. Pinch out, lift one finger, carry on with the other. */
  await p.touch("touchStart", [[cx - 40, cy], [cx + 40, cy]])
  for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [[cx - 40 - i * 8, cy], [cx + 40 + i * 8, cy]]); await sleep(16) }
  await sleep(40)
  const beforeLift = await st()
  /* The second finger leaves (a touchEnd naming only it); the first stays exactly where it was. */
  await p.call("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [{ x: cx + 104, y: cy, id: 2 }] })
  await p.touch("touchMove", [[cx - 104, cy]])
  await sleep(40)
  const atLift = await st()
  for (let i = 1; i <= 6; i++) { await p.touch("touchMove", [[cx - 104 + i * 6, cy + i * 3]]); await sleep(16) }
  await sleep(40)
  const dragged = await st()
  await p.touch("touchEnd", [])
  const a = await settle()
  note("lift one finger", a)
  const liftJump = Math.max(Math.abs(atLift.img.l - beforeLift.img.l), Math.abs(atLift.img.t - beforeLift.img.t), Math.abs(atLift.img.w - beforeLift.img.w))
  const carried = Math.hypot(dragged.img.l - atLift.img.l, dragged.img.t - atLift.img.t)
  r.pinchThenLiftOne = `zoom ${a.crop.zoom}; picture moved ${round(liftJump)}px when the finger lifted, then ${round(carried)}px under the remaining finger (it moved 40px)`
  if (liftJump > 1) problems.push(`gestures: lifting one finger of a pinch jumped the picture ${round(liftJump)}px`)
  if (carried < 10) problems.push("gestures: the finger left after a pinch did not carry on moving the picture")
  if (!(a.crop.zoom > 1.2)) problems.push(`gestures: the pinch before the lift did not zoom (${a.crop.zoom})`)

  /* b. Three fingers. */
  await p.touch("touchStart", [[cx - 50, cy], [cx + 50, cy], [cx, cy + 30]])
  for (let i = 1; i <= 6; i++) { await p.touch("touchMove", [[cx - 50 - i * 5, cy], [cx + 50 + i * 5, cy], [cx + i * 4, cy + 30]]); await sleep(16) }
  await p.touch("touchEnd", [])
  const b = await settle()
  note("three fingers", b)
  r.threeFingers = `zoom ${a.crop.zoom} -> ${b.crop.zoom}, transform after "${b.transform || "none"}"`
  if (b.transform) problems.push(`gestures: three fingers left a transform: ${b.transform}`)

  /* c. A pinch in that the system takes away, then a plain drag. A finger
     left behind would turn the drag into a pinch against where it was. */
  await p.touch("touchStart", [[cx - 60, cy], [cx + 60, cy]])
  for (let i = 1; i <= 6; i++) { await p.touch("touchMove", [[cx - 60 + i * 5, cy], [cx + 60 - i * 5, cy]]); await sleep(16) }
  await p.touch("touchCancel", [])
  const c1 = await settle(200)
  note("touch cancelled", c1)
  await p.touch("touchStart", [[cx, cy]])
  for (let i = 1; i <= 6; i++) { await p.touch("touchMove", [[cx - i * 8, cy]]); await sleep(16) }
  await p.touch("touchEnd", [])
  const c2 = await settle(200)
  note("drag after a cancel", c2)
  r.cancelledPinch = `transform after cancel "${c1.transform || "none"}", zoom ${c1.crop.zoom}; a one-finger drag after it: zoom ${c2.crop.zoom}`
  if (c1.transform) problems.push("gestures: a cancelled pinch left a transform on the picture")
  if (Math.abs(c2.crop.zoom - c1.crop.zoom) > 0.001) problems.push(`gestures: a one-finger drag after a cancelled pinch zoomed (${c1.crop.zoom} -> ${c2.crop.zoom}): a finger was left behind`)

  /* d. A press that starts on the pencil and slides onto the picture. */
  const d0 = await st()
  await p.touch("touchStart", [[d0.pencil.x, d0.pencil.y]])
  for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [[d0.pencil.x - i * 12, d0.pencil.y + i * 4]]); await sleep(16) }
  await p.touch("touchEnd", [])
  const d1 = await settle(200)
  r.dragFromThePencil = `crop ${JSON.stringify(d0.crop)} -> ${JSON.stringify(d1.crop)}`
  if (JSON.stringify(d0.crop) !== JSON.stringify(d1.crop)) problems.push("gestures: a drag that started on the pencil moved the picture")

  const tap = async (x, y) => { await p.touch("touchStart", [[x, y]]); await p.touch("touchEnd", []) }
  /* e. Double tap in, double tap out. */
  await tap(cx, cy); await sleep(90); await tap(cx, cy)
  const e1 = await settle(500)
  await tap(cx, cy); await sleep(90); await tap(cx, cy)
  const e2 = await settle(500)
  note("double tap", e2)
  r.doubleTap = `zoom ${d1.crop.zoom} -> ${e1.crop.zoom} -> ${e2.crop.zoom}`
  const toggled = (from, to) => (from > 1.05 ? Math.abs(to - 1) < 0.001 : Math.abs(to - 2) < 0.01)
  if (!toggled(d1.crop.zoom, e1.crop.zoom) || !toggled(e1.crop.zoom, e2.crop.zoom)) problems.push(`gestures: double taps did not go in and back out (${r.doubleTap})`)

  /* f. Two taps too far apart in time are two taps. */
  await tap(cx, cy); await sleep(450); await tap(cx, cy)
  const f1 = await settle(500)
  r.twoSlowTaps = `zoom ${e2.crop.zoom} -> ${f1.crop.zoom}`
  if (Math.abs(f1.crop.zoom - e2.crop.zoom) > 0.001) problems.push("gestures: two taps 450ms apart zoomed")

  /* g. A finger that lands on a glide half way stops it there. */
  await tap(cx, cy); await sleep(90); await tap(cx, cy)
  await sleep(110)
  await tap(cx + 30, cy)
  const g1 = await settle(500)
  note("glide caught", g1)
  const target = f1.crop.zoom > 1.05 ? 1 : 2
  r.glideCaughtMidWay = `going from ${f1.crop.zoom} to ${target}, stopped at ${g1.crop.zoom}`
  if (!(Math.abs(g1.crop.zoom - target) > 0.02 && Math.abs(g1.crop.zoom - f1.crop.zoom) > 0.02)) problems.push(`gestures: a finger on a glide did not stop it where it was (${r.glideCaughtMidWay})`)

  /* h. Reset while a glide is still running. */
  const h0 = await st()
  if (!h0.reset) { await tap(cx, cy); await sleep(90); await tap(cx, cy); await sleep(500) }
  await sleep(400)
  await tap(cx, cy); await sleep(90); await tap(cx, cy)
  await sleep(60)
  const h1 = await st()
  if (h1.reset) await tap(h1.reset.x, h1.reset.y)
  const h2 = await settle(600)
  note("reset during a glide", h2)
  r.resetDuringGlide = `${h1.reset ? "Reset pressed" : "no Reset shown"} 60ms into a glide; crop after ${JSON.stringify(h2.crop)}, transform "${h2.transform || "none"}"`
  if (!h1.reset || h2.crop.x !== 50 || h2.crop.y !== 50 || h2.crop.zoom !== 1 || h2.transform) problems.push(`gestures: Reset during a glide did not stick (${r.resetDuringGlide})`)

  /* i. The phone turns sideways with a finger down, and the finger carries on. */
  await p.touch("touchStart", [[cx, cy]])
  for (let i = 1; i <= 4; i++) { await p.touch("touchMove", [[cx + i * 6, cy + i * 3]]); await sleep(16) }
  /* 667 wide, so it is still the phone sheet: past 767 the editor becomes
     the drawer, a different element, and a gesture under way goes with the
     old one (the crop stays what it was saved as). */
  await p.call("Emulation.setDeviceMetricsOverride", { width: 667, height: 375, deviceScaleFactor: 1, mobile: true })
  await sleep(250)
  for (let i = 5; i <= 8; i++) { await p.touch("touchMove", [[cx + i * 6, cy + i * 3]]); await sleep(16) }
  await p.touch("touchEnd", [])
  const i1 = await settle(500)
  note("turned mid drag", i1)
  if (!(i1.crop.y < 49)) problems.push(`gestures: a drag that carried on through a turn was not kept (${JSON.stringify(i1.crop)})`)
  const turned = JSON.parse(await p.js(READ))
  const turnedGap = Math.max(turned.img.l - turned.inner.l, turned.img.t - turned.inner.t, turned.inner.r - turned.img.r, turned.inner.b - turned.img.b, 0)
  const turnedDiff = uvDiff(visibleFrame(turned), visibleBand(turned))
  r.turnedMidDrag = `crop ${JSON.stringify(i1.crop)}, frame ${round(turned.frameAspect)}:1, uncovered ${round(turnedGap, 2)}px, band differs by ${round(turnedDiff * 100, 3)}%, transform "${i1.transform || "none"}"`
  if (turnedGap > 0.5 || turnedDiff > 0.004 || i1.transform) problems.push(`gestures: turning the phone mid drag left the frame wrong (${r.turnedMidDrag})`)

  r.nonNumbers = `${seen.length} states read, none with NaN or Infinity in the crop or the image's style`
  report["gestures @390"] = r
  await p.close()
}

/* ======================================================================
   7. SAVING: a removed cover takes its crop with it, and a sheet with a
      save in flight cannot be closed out from under it
   ====================================================================== */
{
  const vp = { width: 390, height: 844, phone: true }
  const p = await page({ ...vp, hash: "save" })
  const openSheet = async () => {
    const b = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
    await p.touch("touchStart", [[b.x + b.width / 2, b.y + b.height / 2]])
    await p.touch("touchEnd", [])
    await sleep(1100)
  }
  const tapButton = async (label) => {
    const b = JSON.parse(await p.js(`(() => { const el = [...document.querySelectorAll("[data-sheet-panel] button")].find((x) => (x.getAttribute("aria-label") || x.textContent.trim()) === ${JSON.stringify(label)}); if (!el) return "null"; const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }) })()`))
    if (!b) { problems.push(`save: no "${label}" button`); return }
    await p.touch("touchStart", [[b.x, b.y]])
    await p.touch("touchEnd", [])
  }
  const sheetState = async () => JSON.parse(await p.js(`(() => { const s = document.querySelector("[data-app-sheet]:not([data-sheet-ghost])"); const panel = s && s.querySelector("[data-sheet-panel]"); return JSON.stringify({ state: s ? s.getAttribute("data-app-sheet") : "gone", top: panel ? panel.getBoundingClientRect().top : null, refreshes: window.__refreshes, bodies: window.__bodies }) })()`))
  const r = {}

  await openSheet()
  await tapButton("Remove image")
  await sleep(300)
  const frameLeft = await p.js(`!!document.querySelector("[data-sheet-panel] [data-cover-crop-frame]")`)
  await tapButton("Save")
  await sleep(1200)
  const saved = await sheetState()
  const body = saved.bodies[0] || {}
  r.removeThenSave = `frame after remove ${frameLeft ? "still there" : "gone"}; sent coverUrl ${JSON.stringify(body.coverUrl)}, coverFocalPoint ${JSON.stringify(body.coverFocalPoint)}, coverZoom ${JSON.stringify(body.coverZoom)}; sheet ${saved.state}; refreshes ${saved.refreshes}`
  if (frameLeft) problems.push("save: the frame stayed after the cover was removed")
  if (body.coverUrl !== null || body.coverFocalPoint !== null || body.coverZoom !== null) problems.push(`save: removing a zoomed cover did not clear its crop (${r.removeThenSave})`)
  if (saved.state !== "gone" || saved.refreshes !== 1) problems.push(`save: after a save the sheet should be gone and the page refreshed once (${saved.state}, ${saved.refreshes})`)

  /* The same sheet again, and a save that does not come back yet. */
  await openSheet()
  const open0 = await sheetState()
  await p.js("window.__hold = true")
  await tapButton("Save")
  await sleep(150)
  await p.touch("touchStart", [[195, 16]])
  await p.touch("touchEnd", [])
  await sleep(700)
  const afterTap = await sheetState()
  await p.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await p.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(700)
  const afterEscape = await sheetState()
  /* A pull down on the title, well past the distance that closes an idle sheet. */
  const hy = open0.top + 30
  await p.touch("touchStart", [[195, hy]])
  for (let i = 1; i <= 12; i++) { await p.touch("touchMove", [[195, hy + i * 20]]); await sleep(16) }
  await p.touch("touchEnd", [])
  await sleep(800)
  const afterPull = await sheetState()
  await p.js("window.__release && window.__release()")
  await sleep(1300)
  const done = await sheetState()
  r.closeDuringSave = `tap above: ${afterTap.state} at ${Math.round(afterTap.top)}; Escape: ${afterEscape.state} at ${Math.round(afterEscape.top)}; pull down 240px: ${afterPull.state} at ${Math.round(afterPull.top)} (was ${Math.round(open0.top)}); after the save answered: ${done.state}, refreshes ${done.refreshes}`
  for (const [tag, s2] of [["a tap above", afterTap], ["Escape", afterEscape], ["a pull down", afterPull]]) {
    if (s2.state !== "open" || Math.abs(s2.top - open0.top) > 1) problems.push(`save: ${tag} closed or moved the sheet with a save in flight (${s2.state}, top ${s2.top})`)
  }
  if (done.state !== "gone" || done.refreshes !== 2) problems.push(`save: once the held save answered, the sheet should close and refresh exactly once more (${done.state}, ${done.refreshes})`)

  /* And with nothing in flight, Escape is a Cancel: the sheet goes, and nothing is refreshed. */
  await p.js("window.__hold = false")
  await openSheet()
  await p.call("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await p.call("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 })
  await sleep(800)
  const escaped = await sheetState()
  r.escapeWhenIdle = `${escaped.state}, refreshes ${escaped.refreshes}`
  if (escaped.state !== "gone" || escaped.refreshes !== 2) problems.push(`save: Escape on an idle sheet should close it without a refresh (${r.escapeWhenIdle})`)
  report["save @390"] = r
  await p.close()
}

/* ======================================================================
   8. THE SAME CROP ON THE PAGE AS IN THE FRAME, for photographs of every
      shape (4:3, tall, a panorama, a 60px thumbnail) at 390, 768 and 1280,
      after a zoom and a move
   ====================================================================== */
{
  const rows = []
  let worst = 0
  for (const shape of ["photo", "tall", "panorama", "tiny"]) {
    for (const vp of [
      { name: "390", width: 390, height: 844, phone: true },
      { name: "768", width: 768, height: 1024, phone: false },
      { name: "1280", width: 1280, height: 800, phone: false },
    ]) {
      const p = await page({ ...vp, hash: `crop-${shape}` })
      await sleep(700)
      const s0 = JSON.parse(await p.js(READ))
      const cx = (s0.inner.l + s0.inner.r) / 2, cy = (s0.inner.t + s0.inner.b) / 2
      if (vp.phone) {
        await p.touch("touchStart", [[cx - 30, cy], [cx + 30, cy]])
        for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [[cx - 30 - i * 7, cy - i], [cx + 30 + i * 7, cy - i]]); await sleep(16) }
        await p.touch("touchEnd", [])
        await sleep(150)
        await p.touch("touchStart", [[cx, cy]])
        for (let i = 1; i <= 8; i++) { await p.touch("touchMove", [[cx + i * 9, cy + i * 5]]); await sleep(16) }
        await p.touch("touchEnd", [])
      } else {
        await p.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: cx, y: cy, deltaX: 0, deltaY: -90, modifiers: 2 })
        await sleep(400)
        await p.call("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: cy, button: "left", buttons: 1, clickCount: 1 })
        for (let i = 1; i <= 8; i++) { await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx + i * 9, y: cy + i * 5, button: "left", buttons: 1 }); await sleep(16) }
        await p.call("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx + 72, y: cy + 40, button: "left", buttons: 0, clickCount: 1 })
      }
      await sleep(400)
      const s = JSON.parse(await p.js(READ))
      const diff = uvDiff(visibleFrame(s), visibleBand(s))
      const gap = Math.max(s.img.l - s.inner.l, s.img.t - s.inner.t, s.inner.r - s.img.r, s.inner.b - s.img.b, 0)
      worst = Math.max(worst, diff)
      const finiteCrop = [s.crop.x, s.crop.y, s.crop.zoom].every(Number.isFinite)
      rows.push(`${shape.padEnd(8)} @${vp.name.padEnd(4)} ${s.nw}x${s.nh} in ${round(s.frameAspect)}:1, crop ${JSON.stringify(s.crop)}, differs by ${round(diff * 100, 3)}%, uncovered ${round(gap, 2)}px`)
      if (diff > 0.004) problems.push(`parity: ${shape} @${vp.name}: the band shows ${round(diff * 100, 2)}% of the photograph differently from the frame`)
      if (gap > 0.5) problems.push(`parity: ${shape} @${vp.name}: the picture left ${round(gap, 2)}px of the frame uncovered`)
      if (!finiteCrop) problems.push(`parity: ${shape} @${vp.name}: a non-number reached the crop ${JSON.stringify(s.crop)}`)
      if (!(s.crop.zoom > 1)) problems.push(`parity: ${shape} @${vp.name}: the zoom did not take (${s.crop.zoom})`)
      await p.close()
    }
  }
  report["band vs frame, every shape and width"] = [...rows, `worst difference ${round(worst * 100, 3)}% of the photograph`].join("\n  ")
}

proc.kill()
rmSync(out, { recursive: true, force: true })

for (const [k, v] of Object.entries(report)) {
  console.log(`\n${k}`)
  if (typeof v === "string") console.log(`  ${v}`)
  else for (const [kk, vv] of Object.entries(v)) console.log(`  ${kk.padEnd(34)} ${typeof vv === "string" ? vv : JSON.stringify(vv)}`)
}
if (problems.length) {
  console.log(`\n${problems.length} problem(s):`)
  for (const pr of problems) console.log(`  - ${pr}`)
  process.exit(1)
}
console.log("\nall cover and sheet checks passed")
process.exit(0)
