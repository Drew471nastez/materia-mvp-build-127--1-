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
    "--no-install", "esbuild", join(root, "scripts/render-creator-editor.tsx"),
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
    if (r.exceptionDetails) fail(`The page threw: ${JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text)}\n${expression.slice(0, 160)}`)
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

for (const vp of [
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
    const r = JSON.parse(await p.js(`JSON.stringify([...document.querySelectorAll("button")].find((b) => b.textContent.trim() === ${JSON.stringify(label)})?.getBoundingClientRect() ?? null)`))
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
