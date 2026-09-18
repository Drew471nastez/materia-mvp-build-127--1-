/**
 * ===========================================================================
 *  THE MOBILE MENU OPENS WHERE YOU ARE, AND THE PAGE UNDER IT STOPS
 * ===========================================================================
 * Three reports about the website builder's mobile nav, one cause each.
 *
 * IT OPENS AT THE TOP. In the editor the drawer is portalled into
 * `#wb-preview-root`, which is `position: relative` and `overflow-y: auto`.
 * An absolutely positioned child of a scroller is laid out against its
 * CONTENT box, so `top: 0` is the top of the whole page rather than the top
 * of what is on screen. The BROKEN case below is exactly that markup, kept
 * so the numbers here read against something: at 900px it lands at -900px.
 *
 * THE PAGE KEEPS SCROLLING UNDERNEATH. `overflow: hidden` on the body is not
 * a scroll lock on iOS, and in the editor there was no lock at all.
 *
 * IT IS HALF HEIGHT. Tapping the hamburger in the editor also selects the
 * header, so the inspector sheet opens on the same tap, publishes its peek
 * and the canvas subtracts it as padding. The canvas changes height and the
 * window never resizes, so a drawer measured once is left at the wrong size
 * for as long as it is open.
 *
 * ── WHY THIS DRIVES A REAL PAGE ──────────────────────────────────────────
 * The first version of this file used `--dump-dom --virtual-time-budget`,
 * like the probes around it. Timers run under virtual time but FRAMES DO
 * NOT: a requestAnimationFrame scheduled in that harness never fired, and
 * ResizeObserver notifications are delivered in the rendering steps, so the
 * third bug was unmeasurable there and the probe reported it fixed while it
 * was not. This one attaches over CDP to a real headless page instead.
 *
 *   pnpm build && node scripts/check-nav-drawer.mjs
 */
import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-drawer-"))
const stubs = join(root, ".drawer-probe")
mkdirSync(stubs, { recursive: true })
writeFileSync(join(stubs, "navigation.js"), `export const usePathname = () => "/"
export const useRouter = () => ({ push() {}, prefetch() {}, replace() {}, refresh() {}, back() {} })
export const useSearchParams = () => new URLSearchParams()
export const useParams = () => ({})
`)
writeFileSync(join(stubs, "link.jsx"), `import React from "react"
export default function Link({ href, children, ...rest }) { return React.createElement("a", { href, ...rest }, children) }
export const useLinkStatus = () => ({ pending: false })
`)

/* The canvas, copied from app/website-builder/editor/[installId]/page.tsx. */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"

const SCROLL_TO = 900
const VIEW_W = 390
const VIEW_H = 640
/* What the inspector sheet takes off the canvas when it opens on the tap. */
const SHEET = 260

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-nav-drawer.tsx"),
  "--bundle", "--format=iife", `--outfile=${join(out, "probe.js")}`,
  `--alias:next/link=${join(stubs, "link.jsx")}`,
  `--alias:next/navigation=${join(stubs, "navigation.js")}`,
  `--alias:@=${root}`,
  "--loader:.jsx=jsx", "--loader:.css=empty", "--loader:.svg=dataurl",
  "--jsx=automatic", '--define:process.env.NODE_ENV="production"', "--log-level=error",
], { cwd: root, stdio: "inherit" })

const file = join(out, "index.html")
writeFileSync(file,
  `<!doctype html><html class="light"><head><meta charset="utf-8"><style>${css}</style>` +
  `<style>body{margin:0}</style></head><body>` +
  `<div id="canvas-frame" style="width:${VIEW_W}px;height:${VIEW_H}px;position:relative;overflow:hidden;box-sizing:border-box">` +
  `<div id="wb-preview-root" class="${CANVAS_CLASS}" style="touch-action:pan-y;overscroll-behavior:contain">` +
  `<div id="scoped" style="flex:0 0 auto"></div><div style="height:2400px;flex:0 0 auto"></div>` +
  `<div id="old-way" style="position:absolute;left:0;top:0;bottom:0;width:10px"></div>` +
  `</div></div>` +
  `<div id="live"></div><div style="height:2400px"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/*
  The page script, run through Runtime.evaluate rather than embedded, so a
  syntax error in it is an exception this file reports instead of a probe
  that quietly did not run.
*/
const SCRIPT = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  /* The slide is a transform on a transition. The claim here is about WHERE
     the drawer sits, not how long it took, so the transition is cut before
     reading and the transform is at its target. */
  const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }

  const r = { frames: 0 }
  requestAnimationFrame(() => { r.frames++ })
  await wait(400)

  const scroller = document.getElementById("wb-preview-root")
  const frame = document.getElementById("canvas-frame")
  const inPreview = (sel) => document.querySelector("#wb-preview-root " + sel)

  /* ---- the old geometry, for contrast ---- */
  scroller.scrollTop = ${SCROLL_TO}
  await wait(60)
  r.brokenTop = rect(document.getElementById("old-way")).top
  r.view = rect(scroller)

  /* ---- scoped: the editor canvas ---- */
  const openScoped = document.querySelector('#scoped button[aria-label="Open menu"]')
  r.foundScopedButton = !!openScoped
  if (openScoped) {
    openScoped.click()
    await wait(600)
    const d = inPreview('[role="dialog"][aria-label="Menu"]')
    r.foundScopedDrawer = !!d
    if (d) { settle(d); r.scopedDrawer = rect(d) }
    const cs = getComputedStyle(scroller)
    r.scopedLock = { overflowY: cs.overflowY, touchAction: cs.touchAction }
    r.scopedScrollTopWhileOpen = scroller.scrollTop

    /* The inspector sheet opening on the same tap, and settling back. */
    frame.style.paddingBottom = "${SHEET}px"
    await wait(300)
    r.shrunk = { drawer: rect(d), canvas: rect(scroller) }
    frame.style.paddingBottom = "0px"
    await wait(300)
    r.grown = { drawer: rect(d), canvas: rect(scroller) }

    /* ---- the three controls reported as dead, inside the editor ----
       The canvas intercepts clicks: it cancels a link's default, and
       navigates only when the link is inside the header or footer subtree.
       A portalled drawer is not inside either, which is the thing under
       test, so the stub carries the same rule the editor does. */
    r.editorNav = []
    const canvasIntercept = (e) => {
      const el = e.target
      const anchor = el && el.closest ? el.closest("a[href]") : null
      const inNav = !!(anchor && anchor.closest && anchor.closest("[data-chrome]"))
      const href = anchor ? (anchor.getAttribute("href") || "").trim() : ""
      const internal = href.startsWith("/") && !href.startsWith("//")
      if (anchor) e.preventDefault()
      if (inNav && internal) { e.stopPropagation(); r.editorNav.push(href) }
    }
    scroller.addEventListener("click", canvasIntercept, true)

    const navLink = inPreview('[role="dialog"][aria-label="Menu"] a[href="/shop"]')
    r.foundNavLink = !!navLink
    if (navLink) { navLink.click(); await wait(80) }
    r.navWentSomewhere = r.editorNav.length > 0

    const searchRow = inPreview('[role="dialog"][aria-label="Menu"] a[href="/search"]')
    r.foundSearchRow = !!searchRow
    if (searchRow) { searchRow.click(); await wait(80) }
    r.searchWentSomewhere = r.editorNav.includes("/search")

    scroller.removeEventListener("click", canvasIntercept, true)

    /* Leave it open, and hand node the point to tap. The canvas also
       cancels the default of every mousedown while the inspector is on, so
       that is installed too: a tap is a real sequence and a handler that
       runs anywhere in it can stop the one after it. */
    const reopen = document.querySelector('#scoped button[aria-label="Open menu"]')
    if (reopen) { reopen.click(); await wait(500) }
    document.addEventListener("mousedown", (e) => e.preventDefault(), true)

    /* In the editor a tap that gets past the backdrop reaches the section
       wrapper, which selects the section and opens its settings panel.
       Dismissing a menu is not that, so the tap has to stop at the backdrop.
       Counted on the canvas, which is the portal's DOM parent and therefore
       the first thing the event reaches on its way up; a listener on the
       header's own node would never see a portalled event at all and would
       report zero whatever the code did. */
    window.__gotPast = 0
    scroller.addEventListener("click", () => { window.__gotPast++ })
    scroller.addEventListener("pointerdown", () => { window.__gotPast++ })

    const backdrop = Array.from(scroller.querySelectorAll("div[aria-hidden]")).find((el) => {
      const cs = getComputedStyle(el)
      return cs.zIndex === "90" && cs.pointerEvents === "auto"
    })
    r.foundBackdrop = !!backdrop
    if (backdrop) {
      const b = backdrop.getBoundingClientRect()
      const panel = inPreview('[role="dialog"][aria-label="Menu"]').getBoundingClientRect()
      /* Beside the panel, not over it: that is where "click away" is. */
      r.tapAt = { x: Math.round(panel.right + (b.right - panel.right) / 2), y: Math.round(b.top + b.height / 2) }
    }
  }

  return JSON.stringify(r)
})()`

/* Everything after the real tap: did it close, and does the canvas come
   back. Run as its own evaluate because the tap happens in between. */
const AFTER_TAP = `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }
  const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }
  const r = {}
  const scroller = document.getElementById("wb-preview-root")
  const inPreview = (sel) => document.querySelector("#wb-preview-root " + sel)

  await wait(600)
  const d = inPreview('[role="dialog"][aria-label="Menu"]')
  r.backdropClosedIt = d ? d.getAttribute("aria-hidden") === "true" : true

  r.gotPast = window.__gotPast ?? 0

  const close = inPreview('button[aria-label="Close menu"]')
  if (close) close.click()
  await wait(600)
  const cs2 = getComputedStyle(scroller)
  r.scopedAfter = { overflowY: cs2.overflowY, touchAction: cs2.touchAction, scrollTop: scroller.scrollTop }

  /* ---- live: a published site ---- */
  window.scrollTo(0, ${SCROLL_TO})
  await wait(60)
  const openLive = document.querySelector('#live button[aria-label="Open menu"]')
  r.foundLiveButton = !!openLive
  if (openLive) {
    openLive.click()
    await wait(600)
    const all = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Menu"]'))
    const d = all.find((el) => !scroller.contains(el))
    r.foundLiveDrawer = !!d
    if (d) { settle(d); r.liveDrawer = rect(d); r.innerH = window.innerHeight }
    const b = getComputedStyle(document.body)
    r.liveLock = { position: b.position, top: document.body.style.top, overflow: b.overflow }

    const close = d ? d.querySelector('button[aria-label="Close menu"]') : null
    if (close) close.click()
    await wait(600)
    r.liveAfter = { position: getComputedStyle(document.body).position, scrollY: Math.round(window.scrollY) }
  }
  return JSON.stringify(r)
})()`

function reachabilityFlags() {
  const flags = []
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy
  if (proxy) flags.push(`--proxy-server=${proxy}`)
  return flags
}

const proc = spawn(CHROMIUM, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox", "--disable-gpu",
  "--hide-scrollbars", "--force-device-scale-factor=1", ...reachabilityFlags(), "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] })
let endpoint = ""
proc.stderr.on("data", (b) => { const m = String(b).match(/ws:\/\/[^\s]+/); if (m && !endpoint) endpoint = m[0] })
for (let i = 0; i < 100 && !endpoint; i++) await sleep(100)
if (!endpoint) { proc.kill("SIGKILL"); fail("Chromium never printed a debugging endpoint.") }

const ws = new WebSocket(endpoint)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("could not attach")) })
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
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    /* `== null` covers both: a browser-level call passes nothing, and the
       close calls pass null. Sending `sessionId: null` is rejected outright. */
    ws.send(JSON.stringify(sessionId == null ? { id: n, method, params } : { id: n, method, params, sessionId }))
  })

const { targetId } = await send("Target.createTarget", { url: "about:blank" })
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
const call = (method, params) => send(method, params, sessionId)
await call("Page.enable", {})
await call("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: true })
await call("Page.navigate", { url: `file://${file}` })
await sleep(1200)
const evaluated = await call("Runtime.evaluate", { expression: SCRIPT, awaitPromise: true, returnByValue: true })
if (evaluated.exceptionDetails) {
  ws.close(); proc.kill("SIGKILL")
  fail(`The probe threw: ${evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text}`)
}
if (typeof evaluated.result?.value !== "string") {
  ws.close(); proc.kill("SIGKILL")
  fail("Nothing reported. The probe did not run.")
}
const first = JSON.parse(evaluated.result.value)

/*
  A REAL TAP, not `element.click()`.

  "Clicking away does nothing" is a thing that only happens to real input: a
  synthetic click() skips the press and release entirely, so it cannot see a
  handler earlier in the sequence cancelling what comes after it. These are
  dispatched through the browser's own input pipeline.
*/
if (first.tapAt) {
  const at = { x: first.tapAt.x, y: first.tapAt.y, button: "left", clickCount: 1 }
  await call("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, clickCount: 0 })
  await call("Input.dispatchMouseEvent", { type: "mousePressed", ...at })
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", ...at })
}

const evaluated2 = await call("Runtime.evaluate", { expression: AFTER_TAP, awaitPromise: true, returnByValue: true })
ws.close()
proc.kill("SIGKILL")

if (evaluated2.exceptionDetails) {
  fail(`The probe threw after the tap: ${evaluated2.exceptionDetails.exception?.description || evaluated2.exceptionDetails.text}`)
}
if (typeof evaluated2.result?.value !== "string") fail("Nothing reported after the tap.")
const r = { ...first, ...JSON.parse(evaluated2.result.value) }
if (process.env.DEBUG) console.log(JSON.stringify(r, null, 2))

let broken = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${got === undefined ? "" : `  — ${got}`}`)
  if (!ok) broken++
}

/* If this is zero the harness is not painting and every ResizeObserver
   result below is meaningless, which is how the first version of this file
   passed while the drawer was still half height. */
expect(r.frames > 0, "the page is running frames, so a resize can be observed at all", `${r.frames} frame(s)`)

console.log(`\nThe editor canvas, scrolled to ${SCROLL_TO}px\n`)
expect(r.brokenTop < -400, "an absolute top:0 bottom:0 child is off screen, which is the bug", `top ${r.brokenTop}px`)
expect(r.foundScopedButton && r.foundScopedDrawer, "the drawer mounted inside the canvas")
if (r.scopedDrawer) {
  expect(Math.abs(r.scopedDrawer.top - r.view.top) <= 1, "the drawer's top is the top of what you are looking at",
    `drawer ${r.scopedDrawer.top}px, canvas ${r.view.top}px`)
  expect(Math.abs(r.scopedDrawer.h - r.view.h) <= 1, "and it is exactly as tall as the canvas",
    `drawer ${r.scopedDrawer.h}px, canvas ${r.view.h}px`)
  expect(r.scopedDrawer.left === 0, "and it has slid all the way in", `left ${r.scopedDrawer.left}px`)
}
expect(r.shrunk && Math.abs(r.shrunk.drawer.h - r.shrunk.canvas.h) <= 1 && Math.abs(r.shrunk.drawer.top - r.shrunk.canvas.top) <= 1,
  "the inspector sheet squeezing the canvas takes the drawer with it",
  `drawer ${r.shrunk?.drawer.h}px at ${r.shrunk?.drawer.top}px, canvas ${r.shrunk?.canvas.h}px at ${r.shrunk?.canvas.top}px`)
expect(r.grown && Math.abs(r.grown.drawer.h - r.grown.canvas.h) <= 1,
  "and the canvas growing back does too",
  `drawer ${r.grown?.drawer.h}px, canvas ${r.grown?.canvas.h}px`)
expect(r.scopedLock?.overflowY === "hidden", "the canvas cannot scroll while it is open", `overflow-y ${r.scopedLock?.overflowY}`)
expect(r.scopedLock?.touchAction === "none", "and a finger on it does nothing", `touch-action ${r.scopedLock?.touchAction}`)
expect(r.scopedScrollTopWhileOpen === SCROLL_TO, "it did not jump on lock", `scrollTop ${r.scopedScrollTopWhileOpen}`)
expect(r.scopedAfter?.overflowY === "auto" && r.scopedAfter?.scrollTop === SCROLL_TO,
  "and it scrolls again, from where it was, once closed",
  `overflow-y ${r.scopedAfter?.overflowY}, scrollTop ${r.scopedAfter?.scrollTop}`)

console.log("\nAnd the controls inside it\n")
expect(r.foundNavLink === true, "the menu has the site's nav links in it")
expect(r.navWentSomewhere === true, "a nav link goes somewhere", r.navWentSomewhere ? "yes" : "the click was cancelled and nothing navigated")
expect(r.foundSearchRow === true, "the menu has a search row")
expect(r.searchWentSomewhere === true, "and search goes somewhere", r.searchWentSomewhere ? "yes" : "the click was cancelled and nothing navigated")
expect(r.foundBackdrop === true, "there is a backdrop to tap")
expect(r.backdropClosedIt === true, "and a real tap on it closes the menu", r.backdropClosedIt ? "yes" : "it stayed open")
expect(r.gotPast === 0, "and the tap stops there instead of reaching the canvas behind it", `${r.gotPast} event(s) got past`)

console.log(`\nA published site, scrolled to ${SCROLL_TO}px\n`)
expect(r.foundLiveButton && r.foundLiveDrawer, "the drawer mounted on the page")
if (r.liveDrawer) {
  expect(r.liveDrawer.top === 0, "the drawer starts at the top of the viewport", `top ${r.liveDrawer.top}px`)
  expect(Math.abs(r.liveDrawer.h - r.innerH) <= 1, "and fills it", `drawer ${r.liveDrawer.h}px, viewport ${r.innerH}px`)
  expect(r.liveDrawer.left === 0, "and it has slid all the way in", `left ${r.liveDrawer.left}px`)
}
expect(r.liveLock?.position === "fixed", "the page is pinned, not merely overflow hidden", `body position ${r.liveLock?.position}`)
expect(r.liveLock?.top === `-${SCROLL_TO}px`, "pinned at the offset it was read at", `body top ${r.liveLock?.top}`)
expect(r.liveAfter?.position !== "fixed" && r.liveAfter?.scrollY === SCROLL_TO,
  "and the scroll position comes back on close", `scrollY ${r.liveAfter?.scrollY}`)

console.log("")
if (broken) fail(`${broken} check${broken === 1 ? "" : "s"} failed.`)
console.log("The mobile menu opens over what is on screen, follows it, and what is under it is frozen.\n")
