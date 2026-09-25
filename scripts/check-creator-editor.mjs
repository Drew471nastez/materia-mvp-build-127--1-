/**
 * ===========================================================================
 *  THE CREATOR PAGE EDITOR'S SHEETS, OPENED AND CLOSED FOR REAL
 * ===========================================================================
 * The owner's reports, each as something a browser does and a number it
 * reads back:
 *
 *   "Sometimes after closing Edit profile it cannot be opened again."
 *      Every way out of the sheet (Cancel, a tap outside, Escape, a pull
 *      down, Save, a tap outside while it is still arriving, the three-dots
 *      menu in between), each followed by a press on the pencil, at 390 with
 *      touches and at 1280 with a mouse. After each press: is the sheet up.
 *
 *   "The 'your page is live' card lags when it is closed."
 *      Frame gaps from the press that closes it to the card being gone, and
 *      how long before anything visibly moved.
 *
 *   node scripts/check-creator-editor.mjs            (SHOTS=dir keeps pictures)
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import postcss from "postcss"
import tailwind from "@tailwindcss/postcss"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)

const cssPath = join(root, "app/globals.css")
const css = (await postcss([tailwind({ base: root })]).process(readFileSync(cssPath, "utf8"), { from: cssPath })).css

const out = mkdtempSync(join(tmpdir(), "storelib-creator-editor-"))
const stubs = join(root, ".creator-editor-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/andrewrullz"
export const useRouter = () => ({ push() {},
  prefetch(href) { (window.__prefetched = window.__prefetched || []).push(href) },
  replace(href) { (window.__replaced = window.__replaced || []).push(href); window.__onReplace && window.__onReplace(href) },
  refresh() { window.__refreshes = (window.__refreshes || 0) + 1; window.__onRefresh && window.__onRefresh() }, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
/* Storage, answered here: an upload that reports progress over a second and a half, and a public URL the page can load. */
writeFileSync(join(stubs, "upload.js"), `export async function uploadWithProgress(bucket, path, file, o = {}) {
  for (const p of [8, 20, 35, 50, 65, 80, 96]) { await new Promise((r) => setTimeout(r, window.__uploadStep ?? 200)); o.onProgress && o.onProgress(p) }
  ;(window.__uploaded = window.__uploaded || []).push(bucket + "/" + path)
}
`)
writeFileSync(join(stubs, "supabase.js"), `export function createClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: window.__uploadedUrl } }), upload: async () => ({ error: null }) }) },
  }
}
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, prefetch, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)
try {
  execFileSync("npx", [
    "--no-install", "esbuild", join(root, "scripts/render-creator-editor.tsx"),
    "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error",
    `--outfile=${join(out, "probe.js")}`,
    '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
    '--define:process.env.NODE_ENV="production"',
    `--alias:next/link=${join(stubs, "link.jsx")}`,
    `--alias:next/navigation=${join(stubs, "navigation.js")}`,
    `--alias:@/lib/storage/upload-with-progress=${join(stubs, "upload.js")}`,
    `--alias:@/lib/supabase/client=${join(stubs, "supabase.js")}`,
    `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl",
  ], { cwd: root, stdio: ["ignore", "ignore", "inherit"] })
} finally {
  rmSync(stubs, { recursive: true, force: true })
}
const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
  `<style>${css}</style><style>body{margin:0}</style></head><body><div id="app"></div>` +
  `<script>window.__err=[];window.addEventListener("error",function(e){window.__err.push(String(e.message))})</script>` +
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
  await call("Emulation.setEmulatedMedia", {
    features: phone
      ? [{ name: "hover", value: "none" }, { name: "pointer", value: "coarse" }, { name: "prefers-reduced-motion", value: "no-preference" }]
      : [{ name: "hover", value: "hover" }, { name: "pointer", value: "fine" }, { name: "prefers-reduced-motion", value: "no-preference" }],
  })
  if (phone) await call("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 })
  await call("Page.navigate", { url: `file://${file}#${hash}` })
  const js = async (expression) => {
    const r = await call("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) { if (SHOTS) { const { data } = await call("Page.captureScreenshot", { format: "png" }); writeFileSync(join(SHOTS, "threw.png"), Buffer.from(data, "base64")) } fail(`The page threw (${width}): ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n${expression.slice(0, 160)}`) }
    return r.result.value
  }
  for (let i = 0; i < 60; i++) {
    if (await js("!!window.__ready")) break
    await sleep(100)
  }
  await sleep(600)
  const errs = await js("JSON.stringify(window.__err)")
  if (errs !== "[]") fail(`The page reported errors: ${errs}`)
  const touch = (type, points) => call("Input.dispatchTouchEvent", { type, touchPoints: points.map(([x, y], i) => ({ x, y, id: i + 1 })) })
  const tap = async (x, y) => {
    if (phone) { await touch("touchStart", [[x, y]]); await touch("touchEnd", []) }
    else {
      await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y })
      await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 })
      await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 })
    }
  }
  const key = async (k) => {
    await call("Input.dispatchKeyEvent", { type: "keyDown", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 })
    await call("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: k === "Escape" ? 27 : 0 })
  }
  const shot = async (name) => {
    if (!SHOTS) return
    const { data } = await call("Page.captureScreenshot", { format: "png" })
    writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(data, "base64"))
  }
  return { call, js, touch, tap, key, shot, close: () => send("Target.closeTarget", { targetId }) }
}

const SHOTS = process.env.SHOTS
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const problems = []
const report = {}
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d

/* ======================================================================
   1. EDIT PROFILE: every way out, then the pencil again
   ====================================================================== */
const SHEET_STATE = `(() => {
  const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]")
  if (panel) {
    const layer = panel.closest("[data-app-sheet]")
    const r = panel.getBoundingClientRect()
    return JSON.stringify({ kind: "sheet", state: layer.getAttribute("data-app-sheet"), top: Math.round(r.top), h: Math.round(r.height) })
  }
  const d = [...document.querySelectorAll("[role=dialog][data-state]")].find((el) => el.querySelector("h2")?.textContent === "Profile details")
  if (d) { const r = d.getBoundingClientRect(); return JSON.stringify({ kind: "drawer", state: d.getAttribute("data-state"), left: Math.round(r.left), w: Math.round(r.width) }) }
  return JSON.stringify({ kind: "none" })
})()`

const ONLY = process.env.ONLY
if (ONLY === "debug") {
  const p = await page({ width: 390, height: 844, phone: true, hash: "profile" })
  await p.js(`window.addEventListener("error", (e) => window.__err.push(String(e.message))); window.addEventListener("unhandledrejection", (e) => window.__err.push("rej " + String(e.reason)))`)
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  await p.tap(pencil.x + pencil.width / 2, pencil.y + pencil.height / 2)
  await sleep(900)
  console.log(await p.js(`JSON.stringify({ err: window.__err, schemes: document.querySelectorAll("[data-scheme]").length, picker: !!document.querySelector("[data-scheme-picker]"), sheet: !!document.querySelector("[data-app-sheet]"), html: document.querySelector("[data-app-sheet]")?.outerHTML.slice(0, 300) })`))
  process.exit(0)
}
for (const vp of ONLY && ONLY !== "reopen" ? [] : [
  { name: "390", width: 390, height: 844, phone: true },
  { name: "1280", width: 1280, height: 800, phone: false },
]) {
  const p = await page({ ...vp, hash: "profile" })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  const px = pencil.x + pencil.width / 2, py = pencil.y + pencil.height / 2
  const dots = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Creator options']").getBoundingClientRect())`))
  const state = async () => JSON.parse(await p.js(SHEET_STATE))
  const isUp = (s) => s.kind !== "none" && s.state === "open" && (s.kind === "sheet" ? s.top < vp.height - 100 : s.left + s.w >= vp.width - 1 && s.left < vp.width - 200)
  const isGone = (s) => s.kind === "none" || s.state !== "open"
  const openIt = async () => { await p.tap(px, py); await sleep(750); return state() }
  /* Somewhere outside the sheet or drawer, on the page, away from the pencil. */
  const outside = vp.phone ? [vp.width / 2, 20] : [60, vp.height - 60]
  const button = async (label) => {
    const r = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)} || (${JSON.stringify(label)} === "Save" && b.textContent.trim() === "SaveSaving"))?.getBoundingClientRect() ?? null)`))
    if (r) await p.tap(r.x + r.width / 2, r.y + r.height / 2)
    return !!r
  }
  const cancelBtn = () => button("Cancel")
  const saveBtn = () => button("Save")
  const ways = {
    cancel: async () => { await cancelBtn(); await sleep(600) },
    tapOutside: async () => { await p.tap(...outside); await sleep(600) },
    escape: async () => { await p.key("Escape"); await sleep(600) },
    save: async () => { await saveBtn(); await sleep(900) },
    reopenMidClose: async () => { await p.tap(...outside); await sleep(90) },
    closeWhileArriving: async () => { /* handled below */ },
    ownerMenuBetween: async () => {
      await cancelBtn(); await sleep(600)
      await p.tap(dots.x + dots.width / 2, dots.y + dots.height / 2); await sleep(500)
      await p.key("Escape"); await sleep(500)
    },
    ownerMenuTapOutside: async () => {
      await cancelBtn(); await sleep(600)
      await p.tap(dots.x + dots.width / 2, dots.y + dots.height / 2); await sleep(500)
      await p.tap(...outside); await sleep(500)
    },
  }
  if (vp.phone) {
    ways.pullDown = async () => {
      const s = await state()
      const x = vp.width / 2, y0 = s.top + 8
      await p.touch("touchStart", [[x, y0]])
      for (let i = 1; i <= 12; i++) { await p.touch("touchMove", [[x, y0 + i * 25]]); await sleep(16) }
      await p.touch("touchEnd", [])
      await sleep(600)
    }
  }
  const rows = []
  for (const [name, leave] of Object.entries(ways)) {
    for (let round_ = 0; round_ < 2; round_++) {
      const opened = await openIt()
      if (!isUp(opened)) { problems.push(`${vp.name}: ${name}#${round_}: the pencil did not open the sheet (${JSON.stringify(opened)})`); continue }
      if (name === "closeWhileArriving") {
        await p.tap(...outside)
        await sleep(40)
        await p.tap(...outside)
        await sleep(700)
      } else await leave()
      const left = await state()
      if (name !== "reopenMidClose" && !isGone(left)) problems.push(`${vp.name}: ${name}#${round_}: the sheet did not close (${JSON.stringify(left)})`)
      const again = await openIt()
      const ok = isUp(again)
      rows.push(`${name.padEnd(20)} #${round_}: closed ${isGone(left) ? "yes" : "no"}, reopened ${ok ? "yes" : "NO " + JSON.stringify(again)}`)
      if (!ok) { problems.push(`${vp.name}: after ${name} (round ${round_}) the pencil did not open the sheet again`); await p.shot(`reopen-${vp.name}-${name}-${round_}`) }
      /* Back to a closed page for the next round. */
      await cancelBtn().catch(() => {})
      await sleep(700)
      const bodyPE = await p.js("getComputedStyle(document.body).pointerEvents")
      if (bodyPE === "none") { problems.push(`${vp.name}: after ${name}, the page is left with pointer-events: none`); await p.js("document.body.style.pointerEvents = ''") }
    }
  }
  report[`edit profile @${vp.name}, every way out and back in`] = rows.join("\n  ")

  /* The owner's buttons on the cover, and the three dots' menu: a sheet on a phone, a dropdown on a computer. */
  await p.shot(`owner-controls-${vp.name}`)
  const controls = JSON.parse(await p.js(`JSON.stringify({ top: document.querySelector("[aria-label='Edit profile']").getBoundingClientRect().top - document.querySelector("[data-cover-band]").getBoundingClientRect().top,
    shadow: getComputedStyle(document.querySelector("[aria-label='Edit profile']")).boxShadow })`))
  await p.tap(dots.x + dots.width / 2, dots.y + dots.height / 2)
  await sleep(700)
  const menu = JSON.parse(await p.js(`JSON.stringify({ sheet: !!document.querySelector("[data-app-sheet] [data-sheet-panel] a[href='/app/products']"), dropdown: !!document.querySelector("[role=menu] a[href='/app/products']"),
    top: [...document.querySelectorAll("a[href='/app/products']")].map((a) => a.getAttribute("target")) })`))
  await p.shot(`owner-menu-${vp.name}`)
  await p.key("Escape")
  await sleep(600)
  report[`owner controls @${vp.name}`] = `buttons ${round(controls.top)}px into the banner; shadow ${controls.shadow}; menu as ${menu.sheet ? "a bottom sheet" : menu.dropdown ? "a dropdown" : "nothing"}, links target ${JSON.stringify(menu.top)}`
  if (vp.phone ? !menu.sheet : !menu.dropdown) problems.push(`${vp.name}: the three dots opened ${menu.sheet ? "a sheet" : menu.dropdown ? "a dropdown" : "nothing"}`)
  if (!menu.top.every((t) => t === "_top")) problems.push(`${vp.name}: an owner menu link would load the app inside the frame`)

  /* ── The motion: how soon it moves after the press, and whether any frame is late ── */
  const RECORD = `(() => {
    window.__track = []; window.__long = 0; window.__press = performance.now()
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration) }).observe({ type: "longtask" }) } catch {}
    const pos = () => {
      const s = document.querySelector("[data-app-sheet] [data-sheet-panel]")
      if (s) return s.getBoundingClientRect().top
      const d = [...document.querySelectorAll("[role=dialog][data-state]")].find((el) => el.querySelector("h2")?.textContent === "Profile details")
      return d ? d.getBoundingClientRect().left : null
    }
    const t0 = performance.now()
    const tick = (t) => { window.__track.push([t, pos()]); if (t - t0 < 900) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })()`
  const READ = `(() => {
    const tr = window.__track, first = tr[0]?.[1]
    const moved = tr.find(([, y]) => y !== first)
    const gaps = tr.slice(1).map(([t], i) => t - tr[i][0]).sort((a, b) => a - b)
    return JSON.stringify({ firstMoveMs: moved ? moved[0] - window.__press : null, p95: gaps[Math.floor(gaps.length * 0.95)] ?? 0, max: gaps[gaps.length - 1] ?? 0, long: window.__long })
  })()`
  const motion = {}
  for (let i = 0; i < 3; i++) {
    await p.js(RECORD)
    await p.tap(px, py)
    await sleep(1000)
    const o = JSON.parse(await p.js(READ))
    await p.js(RECORD)
    await button("Cancel")
    await sleep(1000)
    const c = JSON.parse(await p.js(READ))
    motion[`open #${i}`] = `moves ${round(o.firstMoveMs ?? -1)}ms after the press, frame gaps p95 ${round(o.p95)}ms max ${round(o.max)}ms, longest task ${round(o.long)}ms`
    motion[`close #${i}`] = `moves ${round(c.firstMoveMs ?? -1)}ms after the press, frame gaps p95 ${round(c.p95)}ms max ${round(c.max)}ms, longest task ${round(c.long)}ms`
  }
  report[`edit profile @${vp.name}, motion`] = motion

  /* ── The scrollbar: none of the platform's under a mouse, a thin thumb that shows while it moves ── */
  if (!vp.phone) {
    await p.tap(px, py)
    await sleep(800)
    await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: vp.width - 200, y: 400 })
    await p.call("Input.dispatchMouseEvent", { type: "mouseWheel", x: vp.width - 200, y: 400, deltaX: 0, deltaY: 240 })
    await sleep(150)
    const bar = JSON.parse(await p.js(`(() => {
      const sc = document.querySelector("[role=dialog] [data-sheet-scroll]")
      const rail = document.querySelector("[role=dialog] .cp-overlay-rail")
      const thumb = rail?.firstElementChild
      const r = thumb?.getBoundingClientRect(), sr = sc.getBoundingClientRect()
      return JSON.stringify({ scrollTop: sc.scrollTop, native: sc.offsetWidth - sc.clientWidth, width: getComputedStyle(sc).scrollbarWidth,
        railOpacity: rail ? getComputedStyle(rail).opacity : null, thumb: r ? { w: r.width, h: r.height, right: Math.round(sr.right - r.right) } : null })
    })()`))
    await p.shot("drawer-scrolled-1280")
    /* The pointer leaves the drawer: the thumb goes once the list is still. */
    await p.call("Input.dispatchMouseEvent", { type: "mouseMoved", x: 100, y: 400 })
    await sleep(1300)
    const later = await p.js(`getComputedStyle(document.querySelector("[role=dialog] .cp-overlay-rail")).opacity`)
    report["drawer scrollbar @1280"] = `scrolled ${bar.scrollTop}px; platform bar ${bar.native}px wide (scrollbar-width ${bar.width}); thumb ${JSON.stringify(bar.thumb)} at opacity ${bar.railOpacity}, ${later} once still`
    if (bar.native !== 0) problems.push(`1280: the drawer still draws the platform's ${bar.native}px scrollbar`)
    if (!bar.thumb || bar.thumb.w > 8 || Number(bar.railOpacity) < 0.5) problems.push(`1280: no slim thumb showed while the drawer scrolled (${JSON.stringify(bar)})`)
    if (Number(later) > 0.05) problems.push(`1280: the thumb did not fade once the drawer was still (${later})`)
    await button("Cancel")
    await sleep(600)
  }
  await p.close()
}

/* ======================================================================
   2. COLOUR SCHEMES: on the press, eased, everywhere, and put back on Cancel
   ====================================================================== */
const hex = (h) => { const m = h.replace("#", ""); return `rgb(${parseInt(m.slice(0, 2), 16)}, ${parseInt(m.slice(2, 4), 16)}, ${parseInt(m.slice(4, 6), 16)})` }
const lum = (rgb) => { const [r, g, b] = rgb.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
for (const vp of ONLY && ONLY !== "schemes" ? [] : [
  { name: "1280", width: 1280, height: 800, phone: false },
  { name: "390", width: 390, height: 844, phone: true },
]) {
  const p = await page({ ...vp, hash: "profile" })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  const openSheet = async () => { await p.tap(pencil.x + pencil.width / 2, pencil.y + pencil.height / 2); await sleep(800) }
  const button = async (label) => {
    const r = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)} || (${JSON.stringify(label)} === "Save" && b.textContent.trim() === "SaveSaving"))?.getBoundingClientRect() ?? null)`))
    if (r) await p.tap(r.x + r.width / 2, r.y + r.height / 2)
    return !!r
  }
  const pick = async (key) => {
    /* Only if it is not already in view: on a phone a lowered sheet has it in view, and a scroll would take it away. */
    await p.js(`(() => { const b = document.querySelector("[data-scheme=${key}]"), r = b.getBoundingClientRect()
      const foot = [...document.querySelectorAll("[data-sheet-pin-bottom]")].map((f) => f.getBoundingClientRect().top).filter((t) => t > 0)[0] ?? innerHeight
      if (r.top < 60 || r.bottom > foot - 4) b.scrollIntoView({ block: "center" }) })()`)
    await sleep(120)
    const r = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[data-scheme=${key}]").getBoundingClientRect())`))
    await p.js(`(() => { window.__samples = []; window.__t0 = performance.now(); window.__clickAt = null
      document.addEventListener("click", () => { if (window.__clickAt === null) window.__clickAt = performance.now() - window.__t0 }, { capture: true, once: true })
      const root = document.querySelector("[data-storefront-root]"), card = document.querySelector("[data-card]")
      const tick = (t) => { window.__samples.push([t - window.__t0, getComputedStyle(root).backgroundColor, getComputedStyle(card).borderTopColor, root.getAnimations().length]); if (t - window.__t0 < 1400) requestAnimationFrame(tick) }
      requestAnimationFrame(tick) })()`)
    await p.tap(r.x + r.width / 2, r.y + r.height / 2)
    await sleep(1500)
    const samples = JSON.parse(await p.js("JSON.stringify(window.__samples)"))
    samples.clickAt = await p.js("window.__clickAt")
    return samples
  }
  await openSheet()
  const rows = []
  const theme = JSON.parse(await p.js(`JSON.stringify(Object.fromEntries([...document.querySelectorAll("[data-scheme]")].map((b) => [b.dataset.scheme, b.title])))`))
  for (const key of ["sage", "harbor", "clay", "astrid", "cream", "pink", "blacks", "default"]) {
    const samples = await pick(key)
    const first = samples[0][1]
    /* When the page started to move, counted from the click itself: the first frame with a colour transition running on it. */
    const startedAt = samples.find(([t, , , anims]) => t >= samples.clickAt && anims > 0)?.[0]
    const changedAt = startedAt == null ? (samples.find(([, bg]) => bg !== first) ? samples.clickAt + 999 : null) : startedAt - samples.clickAt
    const distinctRoot = new Set(samples.map(([, bg]) => bg)).size
    const distinctCard = new Set(samples.map(([, , bd]) => bd)).size
    const last = samples[samples.length - 1]
    const state = JSON.parse(await p.js(`(() => {
      const root = document.querySelector("[data-storefront-root]"), name = document.querySelector("h1, h2")
      const card = document.querySelector("[data-card]"), price = card.querySelectorAll("p")[1]
      return JSON.stringify({ page: getComputedStyle(root).backgroundColor, name: getComputedStyle(name).color, card: getComputedStyle(card).backgroundColor,
        cardText: getComputedStyle(card).color, price: getComputedStyle(price).color, bar: getComputedStyle(document.querySelector("[data-bar]")).backgroundColor,
        shifting: document.documentElement.classList.contains("cp-scheme-shift"), address: window.__replaced?.slice(-1)[0] })
    })()`))
    const nameC = contrast(state.name, state.page), cardC = contrast(state.cardText, state.card), priceC = contrast(state.price, state.card)
    rows.push(`${key.padEnd(7)} page started moving ${changedAt == null ? "never" : round(changedAt) + "ms"} after the click, through ${distinctRoot} shades, cards through ${distinctCard}; page ${state.page}; name ${round(nameC, 2)}:1, card text ${round(cardC, 2)}:1, price ${round(priceC, 2)}:1; transition left on: ${state.shifting}; asked for ${state.address}`)
    if (changedAt == null && key !== "default") problems.push(`${vp.name}: pressing ${key} did not change the page`)
    else if (changedAt != null && changedAt > 34) problems.push(`${vp.name}: pressing ${key} took ${round(changedAt)}ms to start changing the page`)
    if (distinctRoot < 4 && first !== last[1]) problems.push(`${vp.name}: ${key} cut to the new page colour instead of easing (${distinctRoot} shades)`)
    if (state.shifting) problems.push(`${vp.name}: the colour transition was left on after ${key} arrived`)
    if (nameC < 4.5 || cardC < 4.5 || priceC < 3) problems.push(`${vp.name}: ${key} is hard to read: name ${round(nameC, 2)}, card ${round(cardC, 2)}, price ${round(priceC, 2)}`)
    await p.shot(`scheme-${vp.name}-${key}`)
  }
  report[`schemes @${vp.name}`] = rows.join("\n  ")
  /* Cancel puts the saved page back; Save keeps the pick and says so. */
  await pick("clay")
  await button("Cancel")
  await sleep(1200)
  const afterCancel = await p.js(`getComputedStyle(document.querySelector("[data-storefront-root]")).backgroundColor`)
  const defaultPage = JSON.parse(await p.js(`JSON.stringify(window.__replaced.slice(-1)[0])`))
  await openSheet()
  await pick("harbor")
  await button("Save")
  await sleep(1500)
  const sent = JSON.parse(await p.js(`JSON.stringify(window.__bodies.filter((b) => b.body && "themePreset" in b.body).pop()?.body.themePreset ?? null)`))
  const address = await p.js("location.search")
  const afterSave = await p.js(`getComputedStyle(document.querySelector("[data-storefront-root]")).backgroundColor`)
  if (vp.phone) {
    /* The lowered sheet: the page shows above it, Cancel and Save stay on screen, and a pull up takes it back. */
    await button("Cancel")
    await sleep(900)
    await openSheet()
    await pick("sage")
    const geo = async () => JSON.parse(await p.js(`(() => { const panel = document.querySelector("[data-app-sheet] [data-sheet-panel]"), foot = panel.querySelector("[data-sheet-pin-bottom]")
      const pr = panel.getBoundingClientRect(), fr = foot.getBoundingClientRect(), picker = panel.querySelector("[data-scheme-picker]").getBoundingClientRect()
      return JSON.stringify({ top: Math.round(pr.top), footTop: Math.round(fr.top), footBottom: Math.round(fr.bottom), pickerBottom: Math.round(picker.bottom), pickerTop: Math.round(picker.top), footTransform: getComputedStyle(foot).transform }) })()`))
    const low = await geo()
    await p.shot("lowered-390")
    const x = vp.width / 2, y0 = low.top + 20
    await p.touch("touchStart", [[x, y0]])
    for (let i = 1; i <= 10; i++) { await p.touch("touchMove", [[x, y0 - i * 20]]); await sleep(16) }
    await p.touch("touchEnd", [])
    await sleep(700)
    const up = await geo()
    report["schemes @390, lowered and raised"] = `lowered: sheet top ${low.top}, picker ${low.pickerTop}..${low.pickerBottom}, footer ${low.footTop}..${low.footBottom} of ${vp.height}; after a pull up: sheet top ${up.top}, footer ${up.footTop}..${up.footBottom}, footer transform ${up.footTransform}`
    if (low.top < vp.height * 0.4) problems.push(`390: a scheme press did not lower the sheet (top ${low.top})`)
    if (low.footBottom > vp.height || low.footTop < low.pickerBottom) problems.push(`390: lowered, Cancel and Save are not on screen below the picker (${JSON.stringify(low)})`)
    if (low.pickerTop < low.top) problems.push(`390: lowered, the picker is not inside the sheet's visible part`)
    if (up.top > 100) problems.push(`390: a pull up did not raise the sheet (top ${up.top})`)
    if (up.footTransform !== "none" && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(up.footTransform)) problems.push(`390: the footer was left moved after raising (${up.footTransform})`)
    await button("Cancel")
    await sleep(900)
  }
  report[`schemes @${vp.name}, cancel and save`] = `after Cancel the page is ${afterCancel} (asked for ${defaultPage}); Save sent ${sent}, page ${afterSave}, address "${address}"`
  if (sent !== "harbor") problems.push(`${vp.name}: Save did not send the scheme that was being shown (${sent})`)
  if (afterSave !== hex("#ECF1F5")) problems.push(`${vp.name}: after saving Harbor the page is ${afterSave}`)
  if (/scheme=/.test(address)) problems.push(`${vp.name}: the preview is still in the address after Save (${address})`)
  await p.close()
}

/* ======================================================================
   4. A COVER AND A PICTURE UPLOADED: shown at once, sharpening, no flash
   ====================================================================== */
for (const vp of ONLY && ONLY !== "upload" ? [] : [
  { name: "1280", width: 1280, height: 800, phone: false },
  { name: "390", width: 390, height: 844, phone: true },
]) {
  const p = await page({ ...vp, hash: "profile" })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  await p.tap(pencil.x + pencil.width / 2, pencil.y + pencil.height / 2)
  await sleep(900)
  for (const which of ["cover", "avatar"]) {
    const rows = await p.js(`(async () => {
      const pic = (w, h, hue) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const g = c.getContext("2d")
        g.fillStyle = "hsl(" + hue + ", 70%, 45%)"; g.fillRect(0, 0, w, h); g.fillStyle = "#fff"; g.fillRect(w * 0.4, h * 0.4, w * 0.2, h * 0.2); return c }
      window.__uploadedUrl = pic(900, 300, 20).toDataURL("image/png")
      const blob = await new Promise((r) => pic(1200, 400, 200).toBlob(r, "image/png"))
      const file = new File([blob], "picked.png", { type: "image/png" })
      const panel = document.querySelector("[data-sheet-panel]") || document.querySelector("[role=dialog][data-state=open]")
      const inputs = [...panel.querySelectorAll("input[type=file]")]
      const input = inputs[${which === "cover" ? 0 : 1}]
      const box = ${which === "cover" ? `() => panel.querySelector("[data-cover-crop-frame]")` : `() => panel.querySelector(".w-28")`}
      const samples = []
      const t0 = performance.now()
      await new Promise((done) => {
        const tick = (t) => {
          const b = box(), veil = b && b.querySelector("[data-upload-pending]")
          const imgs = b ? [...b.querySelectorAll("img")] : []
          const painted = imgs.some((img) => img.complete && img.naturalWidth > 0 && !img.closest("[data-upload-pending]") && getComputedStyle(img).opacity !== "0")
          const blurred = veil?.querySelector("img")
          const bar = veil?.querySelector("[role=progressbar]")
          samples.push({ t: Math.round(t - t0), painted, veil: !!veil, blurOpacity: blurred ? Number(getComputedStyle(blurred).opacity) : null,
            progress: bar ? Number(bar.getAttribute("aria-valuenow")) : null, src: (imgs.find((i) => !i.closest("[data-upload-pending]"))?.getAttribute("src") || "").slice(0, 5) })
          if (t - t0 < 3200) requestAnimationFrame(tick); else done()
        }
        requestAnimationFrame(tick)
        const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files
        input.dispatchEvent(new Event("change", { bubbles: true }))
      })
      return JSON.stringify(samples)
    })()`)
    const samples = JSON.parse(rows)
    const firstVeil = samples.find((x) => x.veil)
    /* From the moment there is a picture to show: an empty avatar box before the pick is not a flash. */
    const had = which === "cover" ? samples : samples.filter((x) => firstVeil && x.t >= firstVeil.t)
    const blank = had.filter((x) => !x.painted).length
    const blankAt = had.filter((x) => !x.painted).slice(0, 4).map((x) => x.t)
    const opacities = samples.filter((x) => x.blurOpacity != null).map((x) => x.blurOpacity)
    const falling = opacities.every((o, i) => i === 0 || o <= opacities[i - 1] + 0.001)
    const last = samples[samples.length - 1]
    report[`${which} upload @${vp.name}`] = `preview up ${firstVeil ? firstVeil.t + "ms" : "never"} after the pick; blur ${opacities.length ? `${round(opacities[0], 2)} -> ${round(Math.min(...opacities), 2)}${falling ? ", only ever sharpening" : ", NOT monotonic"}` : "none"}; frames with nothing painted ${blank} of ${samples.length}${blank ? " at " + blankAt.join(",") + "ms" : ""}; at the end the picture is ${last.src}… with ${last.veil ? "the veil still on" : "no veil"}`
    if (!firstVeil || firstVeil.t > 80) problems.push(`${vp.name}: the picked ${which} did not show at once (${firstVeil?.t}ms)`)
    if (!falling) problems.push(`${vp.name}: the ${which}'s blur went back up during its upload`)
    if (blank > 0) problems.push(`${vp.name}: the ${which} frame was blank for ${blank} frames of its upload`)
    if (last.veil || last.src !== "data:") problems.push(`${vp.name}: the uploaded ${which} did not take over (${JSON.stringify(last)})`)
    await p.shot(`upload-${which}-${vp.name}`)
    if (SHOTS) {
      /* A picture of the middle of an upload, for a person to look at. */
      await p.js(`(async () => { const c = document.createElement("canvas"); c.width = 1200; c.height = 800; const g = c.getContext("2d")
        const gr = g.createLinearGradient(0, 0, 1200, 800); gr.addColorStop(0, "#1f4b6e"); gr.addColorStop(1, "#d9c7a3"); g.fillStyle = gr; g.fillRect(0, 0, 1200, 800)
        g.fillStyle = "#fff"; g.font = "bold 120px sans-serif"; g.fillText("New", 420, 440)
        const blob = await new Promise((r) => c.toBlob(r, "image/png")); const file = new File([blob], "mid.png", { type: "image/png" })
        const panel = document.querySelector("[data-sheet-panel]") || document.querySelector("[role=dialog][data-state=open]")
        const input = [...panel.querySelectorAll("input[type=file]")][${which === "cover" ? 0 : 1}]
        const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files; input.dispatchEvent(new Event("change", { bubbles: true })) })()`)
      await sleep(650)
      await p.shot(`upload-${which}-${vp.name}-midway`)
      await sleep(2600)
    }
  }
  await p.close()
}

/* ======================================================================
   5. SAVING: the button keeps its size and says "Saving", then "Saved" shows
   ====================================================================== */
for (const vp of ONLY && ONLY !== "save" ? [] : [
  { name: "1280", width: 1280, height: 800, phone: false },
  { name: "390", width: 390, height: 844, phone: true },
]) {
  const p = await page({ ...vp, hash: "profile" })
  const pencil = JSON.parse(await p.js(`JSON.stringify(document.querySelector("[aria-label='Edit profile']").getBoundingClientRect())`))
  await p.tap(pencil.x + pencil.width / 2, pencil.y + pencil.height / 2)
  await sleep(900)
  const saveBox = `(() => { const b = [...document.querySelectorAll("button[aria-disabled], button")].find((x) => /^(Save|Saving)/.test(x.textContent.trim()) && x.closest("[data-sheet-pin-bottom]")); const r = b.getBoundingClientRect()
    const label = [...b.querySelectorAll("span")].filter((x) => getComputedStyle(x).opacity === "1").map((x) => x.textContent.trim()).filter(Boolean)
    return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, bg: getComputedStyle(b).backgroundColor, label, busy: b.getAttribute("aria-busy"), opacity: getComputedStyle(b).opacity }) })()`
  const before = JSON.parse(await p.js(saveBox))
  await p.js("window.__hold = true")
  await p.tap(before.x + before.w / 2, before.y + before.h / 2)
  await sleep(400)
  const during = JSON.parse(await p.js(saveBox))
  await p.shot(`saving-${vp.name}`)
  await p.js("window.__release && window.__release()")
  await sleep(vp.phone ? 700 : 500)
  const toast = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll("span")].filter((x) => x.textContent === "Saved").map((x) => { const pill = x.parentElement, cs = getComputedStyle(pill); return { bg: cs.backgroundColor, color: getComputedStyle(x).color } }))`))
  await p.shot(`saved-${vp.name}`)
  report[`saving @${vp.name}`] = `Save ${Math.round(before.w)}x${Math.round(before.h)} ${before.bg}; while saving ${Math.round(during.w)}x${Math.round(during.h)}, aria-busy ${during.busy}, opacity ${during.opacity}, showing ${JSON.stringify(during.label)}; then ${toast.length ? `a "Saved" pill ${JSON.stringify(toast[0])}` : "no toast"}`
  if (Math.abs(before.w - during.w) > 0.5 || Math.abs(before.x - during.x) > 0.5) problems.push(`${vp.name}: the Save button moved or resized while saving`)
  if (!during.label.some((l) => /^Saving/.test(l))) problems.push(`${vp.name}: a save in flight does not say so (${JSON.stringify(during.label)})`)
  if (during.opacity !== "1") problems.push(`${vp.name}: the Save button faded while saving`)
  if (!toast.length) problems.push(`${vp.name}: nothing said the save was kept`)
  await p.close()
}

/* ======================================================================
   3. "YOUR PAGE IS LIVE": how soon a close shows, and whether it drops frames
   ====================================================================== */
for (const vp of ONLY && ONLY !== "share" ? [] : [
  { name: "1280", width: 1280, height: 800, phone: false },
  { name: "390", width: 390, height: 844, phone: true },
]) {
  const p = await page({ ...vp, hash: "share" })
  const card = `(() => { const h = [...document.querySelectorAll("h2")].find((e) => e.textContent === "Your page is live"); if (!h) return null
    let el = h; while (el && el.parentElement && !(el.getAttribute("role") === "dialog" || el.hasAttribute("data-sheet-panel"))) el = el.parentElement
    return el })()`
  const rows = []
  for (let i = 0; i < 3; i++) {
    await p.js("window.__setShare(true)")
    await sleep(700)
    const box = JSON.parse(await p.js(`JSON.stringify(${card}?.getBoundingClientRect() ?? null)`))
    if (!box) { problems.push(`${vp.name}: the share card did not open`); break }
    await p.js(`(() => { window.__trk = []; window.__long = 0; window.__clickAt = null
      try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long = Math.max(window.__long, e.duration) }).observe({ type: "longtask" }) } catch {}
      document.addEventListener(${vp.phone ? '"touchend"' : '"pointerdown"'}, () => { if (window.__clickAt === null) window.__clickAt = performance.now() }, { capture: true, once: true })
      const t0 = performance.now()
      const tick = (t) => { const el = ${card}; const r = el?.getBoundingClientRect(); const cs = el && getComputedStyle(el)
        window.__trk.push([t, el ? Math.round(r.top) : null, el ? Number(cs.opacity) : 0]); if (t - t0 < 1100) requestAnimationFrame(tick) }
      requestAnimationFrame(tick) })()`)
    /* Out: a tap beside the card on a computer, above the sheet on a phone. */
    await p.tap(vp.phone ? vp.width / 2 : 80, vp.phone ? 60 : vp.height - 80)
    await sleep(1200)
    const r = JSON.parse(await p.js(`(() => { const tr = window.__trk, c = window.__clickAt
      const after = tr.filter(([t]) => t >= c), base = after[0]
      const moved = after.find(([, y, o]) => y !== base?.[1] || Math.abs(o - (base?.[2] ?? 1)) > 0.03)
      const gone = after.find(([, y]) => y === null)
      const gaps = after.slice(1).map(([t], i) => t - after[i][0]).sort((a, b) => a - b)
      return JSON.stringify({ firstMove: moved ? moved[0] - c : null, gone: gone ? gone[0] - c : null, max: gaps[gaps.length - 1] ?? 0, long: window.__long })
    })()`))
    rows.push(`close #${i}: visibly moving ${r.firstMove == null ? "never" : round(r.firstMove) + "ms"} after the press, gone at ${r.gone == null ? "never" : round(r.gone) + "ms"}, worst frame gap ${round(r.max)}ms, longest task ${round(r.long)}ms`)
    if (r.firstMove == null || r.firstMove > 40) problems.push(`${vp.name}: the share card took ${r.firstMove}ms to start leaving`)
    if (r.gone == null) problems.push(`${vp.name}: the share card never left`)
    if (r.max > 34) problems.push(`${vp.name}: a ${round(r.max)}ms frame while the share card closed`)
  }
  await p.js("window.__setShare(true)"); await sleep(800); await p.shot(`share-${vp.name}`)
  report[`share card @${vp.name}`] = rows.join("\n  ")
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
console.log("\nall creator editor checks passed")
process.exit(0)
