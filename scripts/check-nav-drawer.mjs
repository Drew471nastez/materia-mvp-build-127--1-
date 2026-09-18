/**
 * ===========================================================================
 *  THE MOBILE MENU OPENS WHERE YOU ARE, AND THE PAGE UNDER IT STOPS
 * ===========================================================================
 * Two reports about the website builder's mobile nav, and they have one
 * cause each.
 *
 * IT OPENS AT THE TOP. In the editor the drawer is portalled into
 * `#wb-preview-root`, which is `position: relative` and `overflow-y: auto`.
 * An absolutely positioned child of a scroller is laid out against its
 * CONTENT box, so `top: 0` means the top of the whole page rather than the
 * top of what is on screen. Scroll down, open the menu, and it is drawn
 * above you. The BROKEN case below is exactly that markup, kept so the
 * numbers here can be read against something.
 *
 * THE PAGE KEEPS SCROLLING UNDERNEATH. `overflow: hidden` on the body is
 * not a scroll lock on iOS, and in the editor there was no lock at all.
 *
 * What is measured: where the drawer lands relative to the rectangle you
 * are actually looking at, and whether the thing underneath it is frozen
 * and then given its position back on close. The freeze is read from
 * computed style because a synthesized wheel event is untrusted and would
 * not scroll anything here even when the lock is missing.
 *
 *   pnpm build && node scripts/check-nav-drawer.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
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
const VIEW_H = 640

const PROBE = `<script>
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
/* The slide is a transform on a transition, and under a virtual clock the
   transition has not necessarily finished when the timers say it has. The
   claim here is about WHERE the drawer sits, not how it got there, so the
   transition is cut before reading and the transform snaps to its target. */
const settle = (el) => { el.style.transition = "none"; void el.offsetHeight }
const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } }

const errors = []
window.addEventListener("error", (e) => errors.push(String(e.message)))
window.addEventListener("unhandledrejection", (e) => errors.push("rejection: " + String(e.reason)))

async function run() {
  const r = { errors }
  await wait(400)
  r.scopedHTML = (document.getElementById("scoped").innerHTML || "").length
  r.liveHTML = (document.getElementById("live").innerHTML || "").length
  r.buttons = Array.from(document.querySelectorAll("button")).map((b) => b.getAttribute("aria-label")).filter(Boolean)

  const scroller = document.getElementById("wb-preview-root")
  const inPreview = (sel) => document.querySelector("#wb-preview-root " + sel)

  /* ---- the old geometry, for contrast ---- */
  scroller.scrollTop = ${SCROLL_TO}
  await wait(60)
  r.brokenTop = rect(document.getElementById("old-way")).top
  r.viewTop = rect(scroller).top
  r.viewH = rect(scroller).h

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

    const close = inPreview('button[aria-label="Close menu"]')
    if (close) close.click()
    await wait(600)
    const cs2 = getComputedStyle(scroller)
    r.scopedAfter = { overflowY: cs2.overflowY, touchAction: cs2.touchAction, scrollTop: scroller.scrollTop }
  }

  /* ---- live: a published site ---- */
  window.scrollTo(0, ${SCROLL_TO})
  await wait(60)
  r.windowBefore = Math.round(window.scrollY)
  const openLive = document.querySelector('#live button[aria-label="Open menu"]')
  r.foundLiveButton = !!openLive
  if (openLive) {
    openLive.click()
    await wait(600)
    const all = Array.from(document.querySelectorAll('[role="dialog"][aria-label="Menu"]'))
    const d = all.find((el) => !document.getElementById("wb-preview-root").contains(el))
    r.foundLiveDrawer = !!d
    if (d) { settle(d); r.liveDrawer = rect(d); r.innerH = window.innerHeight }
    const b = getComputedStyle(document.body)
    r.liveLock = { position: b.position, top: document.body.style.top, overflow: b.overflow }

    const close = all.length && d ? d.querySelector('button[aria-label="Close menu"]') : null
    if (close) close.click()
    await wait(600)
    r.liveAfter = { position: getComputedStyle(document.body).position, scrollY: Math.round(window.scrollY) }
  }

  const pre = document.createElement("pre")
  pre.id = "out"
  pre.textContent = JSON.stringify(r)
  document.documentElement.appendChild(pre)
}
run()
</script>`

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
  `<div style="width:390px;height:${VIEW_H}px;position:relative;overflow:hidden">` +
  `<div id="wb-preview-root" class="${CANVAS_CLASS}" style="touch-action:pan-y;overscroll-behavior:contain">` +
  `<div id="scoped" style="flex:0 0 auto"></div><div style="height:2400px;flex:0 0 auto"></div>` +
  `<div id="old-way" style="position:absolute;left:0;top:0;bottom:0;width:10px"></div>` +
  `</div></div>` +
  `<div id="live"></div><div style="height:2400px"></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script>${PROBE}</body></html>`)

const dom = execFileSync(CHROMIUM,
  ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
   "--window-size=390,640", "--virtual-time-budget=20000", "--dump-dom", `file://${file}`],
  { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] })
const m = dom.match(/<pre id="out">([\s\S]*?)<\/pre>/)
if (!m) fail("Nothing reported. The probe did not run.")
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

if (process.env.DEBUG) console.log(JSON.stringify(r, null, 2))
let broken = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${what}${got === undefined ? "" : `  — ${got}`}`)
  if (!ok) broken++
}

console.log("\nThe editor canvas, scrolled to " + SCROLL_TO + "px\n")
expect(r.brokenTop < -400, "an absolute top:0 bottom:0 child is off screen, which is the bug", `top ${r.brokenTop}px`)
expect(r.foundScopedButton && r.foundScopedDrawer, "the drawer mounted inside the canvas")
if (r.scopedDrawer) {
  expect(Math.abs(r.scopedDrawer.top - r.viewTop) <= 1, "the drawer's top is the top of what you are looking at",
    `drawer ${r.scopedDrawer.top}px, canvas ${r.viewTop}px`)
  expect(Math.abs(r.scopedDrawer.h - r.viewH) <= 1, "and it is exactly as tall as the canvas",
    `drawer ${r.scopedDrawer.h}px, canvas ${r.viewH}px`)
  expect(r.scopedDrawer.left === 0, "and it has slid all the way in", `left ${r.scopedDrawer.left}px`)
}
expect(r.scopedLock?.overflowY === "hidden", "the canvas cannot scroll while it is open", `overflow-y ${r.scopedLock?.overflowY}`)
expect(r.scopedLock?.touchAction === "none", "and a finger on it does nothing", `touch-action ${r.scopedLock?.touchAction}`)
expect(r.scopedScrollTopWhileOpen === SCROLL_TO, "it did not jump on lock", `scrollTop ${r.scopedScrollTopWhileOpen}`)
expect(r.scopedAfter?.overflowY === "auto" && r.scopedAfter?.scrollTop === SCROLL_TO,
  "and it scrolls again, from where it was, once closed",
  `overflow-y ${r.scopedAfter?.overflowY}, scrollTop ${r.scopedAfter?.scrollTop}`)

console.log("\nA published site, scrolled to " + SCROLL_TO + "px\n")
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
console.log("The mobile menu opens over what is on screen, and what is under it is frozen.\n")
