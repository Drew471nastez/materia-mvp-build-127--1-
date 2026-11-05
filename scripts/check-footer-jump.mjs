/**
 * ===========================================================================
 *  A FOOTER LINK MUST NOT MOVE THE PAGE BEFORE IT LEAVES IT
 * ===========================================================================
 * Reported as: clicking a menu link in the footer glitches, the scroll jumps
 * up a little, and then it opens the page. The jump is the complaint, and it
 * happens BEFORE the navigation, which is the part that says what it is.
 *
 * A footer link is a plain anchor. The canvas intercepts the CLICK and
 * navigates, but the press before it is untouched, so the browser does what
 * a browser does with a press on a link: it focuses it. Focusing an element
 * inside a scroller scrolls that scroller enough to bring the element fully
 * into view, and a footer link is by definition at the very bottom of the
 * page, which is exactly where "enough" is a few dozen pixels. The canvas
 * then changes the page and resets the scroll, so what is left on screen is
 * a nudge followed by a page change: the glitch.
 *
 * So this drives the real footer in a real scroller with a real press, and
 * samples the scroller every frame from before the press until after the
 * navigation. The claim is a number: the scroll does not move at all
 * between the press and the navigation.
 *
 * It runs both modes, because the guard that already exists for this is
 * gated on the inspector being on, and the report is from a canvas where it
 * can be off.
 *
 *   pnpm build && node scripts/check-footer-jump.mjs
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

const out = mkdtempSync(join(tmpdir(), "storelib-footer-"))
const stubs = join(root, ".footer-probe")
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

/* The canvas, copied from app/(storelib)/website-builder/editor/[installId]/page.tsx. */
const CANVAS_CLASS = "relative isolate bg-white flex flex-col overflow-y-auto overflow-x-hidden border-0 rounded-none w-full h-full"
const VIEW_W = 900
const VIEW_H = 640
/* Tall enough that the footer is far below the fold, so the page is really
   scrolled when the footer is reached, as it is on a site. */
const FILLER = 2400

execFileSync("npx", [
  "esbuild", join(root, "scripts/render-footer-jump.tsx"),
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
  `<div id="frame" style="width:${VIEW_W}px;height:${VIEW_H}px;position:relative;overflow:hidden;box-sizing:border-box">` +
  `<div id="wb-preview-root" class="${CANVAS_CLASS}">` +
  `<div style="height:${FILLER}px;flex:0 0 auto;background:linear-gradient(#fff,#eee)"></div>` +
  `<div id="footer" style="flex:0 0 auto"></div>` +
  `</div></div>` +
  `<script>window.process={env:{NODE_ENV:"production"}}</script>` +
  `<script>${readFileSync(join(out, "probe.js"), "utf8")}</script></body></html>`)

/*
  ARM: install the editor's own two capture handlers on the scroller, put the
  canvas where a person reading the footer would have it, and start watching
  the scroll every frame. `inspectorEnabled` is the argument, because the
  guard that exists for this is gated on it.
*/
const ARM = (inspectorEnabled, partial) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
  const scroller = document.getElementById("wb-preview-root")
  const inspectorEnabled = ${inspectorEnabled}
  const partial = ${partial}
  window.__nav = []

  /* The canvas's rule, copied from the editor. */
  const isTypingTarget = (t) => !!(t && t.closest && t.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])"))
  window.__down = (e) => { if (!isTypingTarget(e.target)) e.preventDefault() }
  if (inspectorEnabled) scroller.addEventListener("mousedown", window.__down, true)

  window.__click = (e) => {
    const anchor = e.target && e.target.closest ? e.target.closest("a[href]") : null
    if (anchor) e.preventDefault()
    const inNav = !!(anchor && anchor.closest && anchor.closest("[data-chrome]"))
    const ownsItsExit = !!(anchor && anchor.closest && anchor.closest('[role="dialog"], [data-self-nav]'))
    const href = anchor ? (anchor.getAttribute("href") || "").trim() : ""
    const internal = href.startsWith("/") && !href.startsWith("//")
    if (inNav && internal && !ownsItsExit) {
      e.stopPropagation()
      window.__nav.push({ href, at: Math.round(performance.now()), scrollTop: scroller.scrollTop })
    }
  }
  scroller.addEventListener("click", window.__click, true)

  /* All the way down, then back up a little, so the footer is on screen and
     the scroller still has somewhere to go in BOTH directions. A nudge is
     then a real measurement rather than a value the scroller could not have
     changed anyway. */
  scroller.scrollTop = scroller.scrollHeight
  await wait(80)
  scroller.scrollTop = Math.max(0, scroller.scrollTop - 40)
  await wait(120)

  const link = scroller.querySelector('[data-chrome] a[href="/refund-policy"]')
    || scroller.querySelector('[data-chrome] a[href^="/"]')
  if (!link) return JSON.stringify({ foundLink: false })

  /*
    THE CASE THE REPORT IS ABOUT. A footer link is at the bottom of the page,
    so the one somebody taps is very often the one still half below the fold.
    That is the only time a browser scrolls for focus: it moves the scroller
    by exactly the few dozen pixels needed to bring the link fully in, which
    is the nudge in "it moves the scroll a little bit and then opens it".
  */
  if (partial) {
    const b = link.getBoundingClientRect()
    const f = document.getElementById("frame").getBoundingClientRect()
    /* Leave the bottom third of the link under the fold. */
    const overhang = Math.round(b.height / 3) + 6
    /* Moving the scroller by d moves the link's bottom edge by -d, so to put
       the overhang under the fold the scroller goes UP by that much. */
    scroller.scrollTop = Math.max(0, scroller.scrollTop + (b.bottom - f.bottom) - overhang)
    await wait(120)
  }

  const box = link.getBoundingClientRect()
  const frame = document.getElementById("frame").getBoundingClientRect()

  /* Every frame from now until the probe reads the result. */
  window.__samples = [scroller.scrollTop]
  window.__watch = true
  const tick = () => {
    if (!window.__watch) return
    window.__samples.push(scroller.scrollTop)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return JSON.stringify({
    foundLink: true,
    href: link.getAttribute("href"),
    start: scroller.scrollTop,
    canScrollUp: scroller.scrollTop > 0,
    canScrollDown: scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0,
    /* Where node must press, in page coordinates. */
    /* The middle of the link, or the last row of it that is still on screen:
       a press lands where a thumb can reach, and a link half under the fold
       is pressed on the half that is showing. */
    tapAt: {
      x: Math.round(box.left + box.width / 2),
      y: Math.round(Math.max(box.top + 2, Math.min(box.top + box.height / 2, frame.bottom - 3))),
    },
    linkFullyVisible: box.top >= frame.top && box.bottom <= frame.bottom,
    /* How far under the fold the link's bottom edge is, which is how far a
       browser would scroll to focus it. */
    overhang: Math.round(Math.max(0, box.bottom - frame.bottom)),
  })
})()`

const READ = `(async () => {
  await new Promise((r) => setTimeout(r, 400))
  window.__watch = false
  const scroller = document.getElementById("wb-preview-root")
  const s = window.__samples
  const start = s[0]
  let worst = 0
  for (const v of s) worst = Math.max(worst, Math.abs(v - start))
  return JSON.stringify({
    start,
    end: scroller.scrollTop,
    worst,
    samples: s.length,
    nav: window.__nav,
    /* Whatever ended up focused: a link that took focus is what scrolls. */
    focused: document.activeElement ? (document.activeElement.tagName + (document.activeElement.getAttribute("href") ? " " + document.activeElement.getAttribute("href") : "")) : "none",
  })
})()`


/*
  ═══════════════════════════════════════════════════════════════════════════
   THE NUDGE, AND THE HOLD THAT ABSORBS IT
  ═══════════════════════════════════════════════════════════════════════════
  A page is fetched, so a few hundred milliseconds pass between the link
  being followed and the page arriving, and nothing is supposed to move in
  them. What can move the canvas there is a focus scroll: a browser brings a
  focused element fully into view, and a link at the bottom of the page needs
  a few dozen pixels of scrolling to get there.

  That is a scroll WITHIN the range the scroller already has, which is the
  kind a hold can put back, so it is reproduced here as one. Twice: once with
  nothing holding the canvas, which is the control, and once with the real
  pinScroll armed.

  MEASURED AND NOT FIXED BY THIS: a canvas that CHANGES HEIGHT mid flight is
  a different problem. The furthest a scroller can go is its content height
  minus its own, so a canvas that grows has its scrollTop pulled down and the
  page moves up by the difference — and no hold can restore a position that
  has stopped existing. It is not what happens here (the editor's sheet
  publishes a constant peek, on purpose, for this reason) but it is worth
  saying that the hold below would not save it if it ever did.
*/
const NUDGE = (pinned) => `(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const scroller = document.getElementById("wb-preview-root")
  scroller.scrollTop = scroller.scrollHeight
  await wait(120)
  const before = scroller.scrollTop

  window.__release = false
  if (${pinned}) window.__pin()

  /* What focusing a link at the bottom of the page does to the scroller. */
  scroller.scrollTop = Math.max(0, before - 40)
  await wait(200)
  const during = scroller.scrollTop

  /* The page arrives: the hold ends and the canvas goes to the top, which is
     the one movement this is all for. */
  window.__release = true
  scroller.scrollTo({ top: 0, behavior: "instant" })
  await wait(140)
  const after = scroller.scrollTop
  return JSON.stringify({ before, during, after, moved: Math.abs(during - before) })
})()`

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
const send = (method, params, sessionId) =>
  new Promise((resolve, reject) => {
    const n = ++id
    pending.set(n, { resolve, reject })
    ws.send(JSON.stringify(sessionId ? { id: n, method, params, sessionId } : { id: n, method, params }))
  })

async function run(inspectorEnabled, partial = false) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" })
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true })
  const call = (m, p) => send(m, p, sessionId)
  await call("Page.enable", {})
  await call("Runtime.enable", {})
  await call("Emulation.setDeviceMetricsOverride", { width: VIEW_W, height: VIEW_H, deviceScaleFactor: 1, mobile: false })
  await call("Page.navigate", { url: "file://" + file })
  await sleep(1100)

  const armed = await call("Runtime.evaluate", { expression: ARM(inspectorEnabled, partial), awaitPromise: true, returnByValue: true })
  if (armed.exceptionDetails) fail(`Arming threw: ${JSON.stringify(armed.exceptionDetails.text || armed.exceptionDetails)}`)
  const a = JSON.parse(armed.result.value)
  if (!a.foundLink) fail("The footer rendered no link to press.")

  /* A real press, a real release: the focus a browser gives a link on
     mousedown is the thing under test, and a synthetic click never gives
     it. Pressed in the part of the link that IS on screen, because a press
     lands where a thumb can reach. */
  for (const type of ["mousePressed", "mouseReleased"]) {
    await call("Input.dispatchMouseEvent", { type, x: a.tapAt.x, y: a.tapAt.y, button: "left", clickCount: 1 })
    await sleep(30)
  }

  const read = await call("Runtime.evaluate", { expression: READ, awaitPromise: true, returnByValue: true })
  if (read.exceptionDetails) fail(`Reading threw: ${JSON.stringify(read.exceptionDetails.text || read.exceptionDetails)}`)

  const loose = await call("Runtime.evaluate", { expression: NUDGE(false), awaitPromise: true, returnByValue: true })
  if (loose.exceptionDetails) fail(`The unheld nudge threw: ${JSON.stringify(loose.exceptionDetails.text || loose.exceptionDetails)}`)
  const held = await call("Runtime.evaluate", { expression: NUDGE(true), awaitPromise: true, returnByValue: true })
  if (held.exceptionDetails) fail(`The held nudge threw: ${JSON.stringify(held.exceptionDetails.text || held.exceptionDetails)}`)

  await send("Target.closeTarget", { targetId }, null)
  return { ...a, ...JSON.parse(read.result.value), loose: JSON.parse(loose.result.value), held: JSON.parse(held.result.value) }
}

const withInspector = await run(true)
const withoutInspector = await run(false)
/* And the one the report is actually about. */
const partialOn = await run(true, true)
const partialOff = await run(false, true)
ws.close()
proc.kill()

let bad = 0
const expect = (ok, what, got) => {
  console.log(`${ok ? "  ok" : "FAIL"}  ${what}${got === undefined ? "" : `  →  ${got}`}`)
  if (!ok) bad++
}

console.log("\nPressing a link in the footer, with the canvas scrolled to it\n")

for (const [label, r] of [
  ["inspector on", withInspector],
  ["inspector off", withoutInspector],
  ["inspector on, link half under the fold", partialOn],
  ["inspector off, link half under the fold", partialOff],
]) {
  console.log(`  ${label}: start ${r.start}, worst ${r.worst}px, end ${r.end}, ${r.samples} frames, focus ${r.focused}`)
  expect(r.canScrollUp === true, `${label}: the canvas had somewhere to jump to, so the next check means something`,
    `${r.start}px of scroll above it`)
  if (r.overhang > 0) {
    expect(r.overhang > 0, `${label}: the link really is under the fold, so a browser has a reason to scroll`,
      `${r.overhang}px of it below the edge`)
  } else {
    expect(r.linkFullyVisible === true, `${label}: the link was fully on screen when it was pressed`)
  }
  expect(r.nav.length === 1 && r.nav[0].href === r.href, `${label}: the press navigated`, JSON.stringify(r.nav))
  /* One pixel of tolerance for a fractional layout, and no more: the report
     is about a movement somebody can see. */
  expect(r.worst <= 1, `${label}: and the canvas did not move on the way`, `${r.worst}px`)
}

console.log("\nAnd something nudging the canvas while the page is still being fetched\n")

{
  const { loose, held } = withInspector
  console.log(`  unheld: ${loose.before} → ${loose.during} → ${loose.after}`)
  console.log(`  held:   ${held.before} → ${held.during} → ${held.after}`)
  expect(loose.moved > 1, "with nothing holding it, the canvas moves, so the next check measures something",
    `${loose.moved}px`)
  expect(held.moved <= 1, "and the hold absorbs it entirely", `${held.moved}px`)
  expect(held.after === 0, "then the page arrives, the hold is released, and the top is the only move anybody sees",
    `scrollTop ${held.after}`)
}

console.log("")
if (bad) fail(`${bad} measurement${bad === 1 ? "" : "s"} failed.`)
console.log("A footer link navigates without moving the page first.\n")
