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
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
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
   1. PROFILE PAGE, 390 AND 1280: the fade, the corners, the purple tab
   ====================================================================== */
for (const vp of [{ name: "390", width: 390, height: 844, phone: true }, { name: "1280", width: 1280, height: 800, phone: false }]) {
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
    if (purpleAbove > 0) problems.push(`390: ${purpleAbove} purple pixels of the banner's mark still show above the sheet`)
    /* The rounded corners: just outside the curve is the page, unchanged; just inside is the sheet's white. */
    const ty = Math.round(sheet.top)
    const outside = [after.px(1, ty + 1), after.px(vp.width - 2, ty + 1)]
    const pageThere = [before.px(1, ty + 1), before.px(vp.width - 2, ty + 1)]
    const inside = after.px(40, ty + 14)
    r.corners = `outside ${JSON.stringify(outside)}, page there before ${JSON.stringify(pageThere)}, inside ${JSON.stringify(inside)}, radius ${sheet.radius}`
    if (outside.some((o) => purple(o))) problems.push("390: purple at the sheet's corners")
    if (outside.some((o, i) => dist(o, pageThere[i]) > 3)) problems.push("390: the corners show something other than the page")
    if (dist(inside, [255, 255, 255]) > 3) problems.push(`390: the sheet's own surface is not white under its top edge: ${JSON.stringify(inside)}`)
    r.firstFrameTop = sheet.firstTop === null ? "n/a" : `${Math.round(sheet.firstTop)} (screen is ${vp.height})`
    if (sheet.firstTop !== null && sheet.firstTop < vp.height - 2) problems.push(`390: the sheet's first frame was already on screen at ${sheet.firstTop}`)
    const g = sheet.gaps.slice().sort((a, b) => a - b)
    r.openFrameGaps = `p50 ${round(g[Math.floor(g.length * 0.5)] ?? 0, 1)}ms p95 ${round(g[Math.floor(g.length * 0.95)] ?? 0, 1)}ms max ${round(g[g.length - 1] ?? 0, 1)}ms over ${g.length}`
    r.frameInSheet = sheet.frame ? `${round(sheet.frame.w, 1)}x${round(sheet.frame.h, 1)} (${round(sheet.frame.w / sheet.frame.h)}:1, band ${round(band.w / band.h)}:1)` : "none"
    if (sheet.frame && Math.abs(sheet.frame.w / sheet.frame.h - band.w / band.h) > 0.02) problems.push("390: the frame in the sheet is not the band's shape")
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
    if (kb.saveBottom > vp.height - 320 + 0.5) problems.push(`390: Save is under a 320px keyboard (bottom ${kb.saveBottom})`)
    if (kb.panelTop < 0) problems.push(`390: with the keyboard up the sheet runs off the top (${kb.panelTop})`)

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
    if (!closing.gone) problems.push("390: the sheet was still in the document 2s after Cancel")
    if (closing.back > 0) problems.push(`390: the close moved backwards ${closing.back} times`)
    if (closing.frames < 12) problems.push(`390: the close was ${closing.frames} frames, a cut rather than a slide`)
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

/* ======================================================================
   3. THE CROP UNDER REAL FINGERS, 390
   ====================================================================== */
{
  const vp = { width: 390, height: 844, phone: true }
  const p = await page({ ...vp, hash: "crop" })
  await sleep(700)
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
  const visibleFrame = (s) => {
    const w = s.img.w, h = s.img.h
    return { u0: (s.inner.l - s.img.l) / w, u1: (s.inner.r - s.img.l) / w, v0: (s.inner.t - s.img.t) / h, v1: (s.inner.b - s.img.t) / h }
  }
  const visibleBand = (s) => {
    /* object-fit: cover inside the band image's box, at its object-position. */
    const bw = s.bandImg.w, bh = s.bandImg.h
    const k = Math.max(bw / s.nw, bh / s.nh)
    const pw = s.nw * k, ph = s.nh * k
    const [ox, oy] = s.bandImg.pos.split(" ").map((v) => parseFloat(v) / 100)
    const left = s.bandImg.l + (bw - pw) * ox, top = s.bandImg.t + (bh - ph) * oy
    return { u0: (s.band.l - left) / pw, u1: (s.band.l + s.band.w - left) / pw, v0: (s.band.t - top) / ph, v1: (s.band.t + s.band.h - top) / ph }
  }
  const vf = visibleFrame(fin), vb = visibleBand(fin)
  const cropDiff = Math.max(Math.abs(vf.u0 - vb.u0), Math.abs(vf.u1 - vb.u1), Math.abs(vf.v0 - vb.v0), Math.abs(vf.v1 - vb.v1))
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
