/**
 * ===========================================================================
 *  THE BOUNCE GUARD DOES NOT POLICE A SURFACE THAT POLICES ITSELF
 * ===========================================================================
 * `CapacitorBounceGuard` listens on the document and cancels touchmove to
 * stop WKWebView rubber-banding. Its last branch is the one that matters
 * here: when the DOCUMENT is not scrollable it prevents every vertical move,
 * in both directions, on the reasoning that a page which fits on screen has
 * nothing to scroll and so any movement is a bounce.
 *
 * The website builder's document is never scrollable. That is deliberate —
 * it is a fixed screen and html and body are locked to the viewport — so any
 * touch inside it that did not find a scrollable ancestor on the way up had
 * its gesture cancelled outright. A canvas showing a page shorter than
 * itself, a canvas mid-layout, a touch landing between two scrollers: all of
 * them came out as "the preview is frozen".
 *
 * So the builder opts out, the way the bottom sheets already do. This
 * transcribes the guard's real logic, fires real touch events at a locked
 * document, and asks the only question that matters: was the gesture
 * cancelled?
 *
 *   locked + no opt-out     the control — must cancel
 *   locked + opt-out        must not
 *   and a genuine boundary bounce is still cancelled outside the builder,
 *   or the opt-out has simply turned the guard off
 *
 *   node scripts/check-bounce-guard.mjs
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const fail = (m) => { console.error(m); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}. Set CHROMIUM=/path/to/chromium.`)

const html = `<!doctype html><html class="capacitor"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
/* the builder's lock: a document that is exactly the viewport */
html,body{height:100%;overflow:hidden}
.editor{position:fixed;inset:0;display:flex;flex-direction:column;background:#eef1f5}
.bar{height:44px;flex:none;background:#171717}
/* a canvas that is scrollable, and one that is not: the second is the case
   the guard used to swallow */
.canvas{flex:1;min-height:0;overflow-y:auto;background:#fff}
.tall{height:3000px}
.short{height:40px}
/* somewhere outside the builder, where the guard should still work */
.plain{position:fixed;left:0;right:0;bottom:0;height:60px;background:#ddd}
</style></head><body>
<div class="editor" id="ed" data-wb-no-bounce-guard="">
  <div class="bar"></div>
  <div class="canvas" id="scrollable"><div class="tall"></div></div>
  <div class="canvas" id="unscrollable" style="overflow-y:auto"><div class="short"></div></div>
</div>
<div class="plain" id="plain"></div>
<script>
/* ── the guard's logic, transcribed ── */
let prevented = false
let lastTouchY = 0, lastTouchX = 0
function onTouchStart(e){ lastTouchY = e.touches[0].clientY; lastTouchX = e.touches[0].clientX }
function onTouchMove(e){
  const touchY = e.touches[0].clientY, touchX = e.touches[0].clientX
  const deltaY = touchY - lastTouchY, deltaX = touchX - lastTouchX
  if (window.innerWidth > window.innerHeight) { e.preventDefault(); return }
  const target = e.target
  if (target && (target.closest("[data-mobile-bottom-sheet]") || target.closest("[data-mobile-top-sheet]")
      || (window.OPT_OUT && target.closest("[data-wb-no-bounce-guard]")))) return
  if (Math.abs(deltaX) > Math.abs(deltaY) * 0.5 && Math.abs(deltaX) > 4) return
  let el = target
  while (el && el !== document.documentElement) {
    const style = getComputedStyle(el)
    if (style.overflowX === "auto" || style.overflowX === "scroll") {
      if (el.scrollWidth > el.clientWidth + 1) return
    }
    if (style.overflowY === "auto" || style.overflowY === "scroll") {
      if (!(el.scrollHeight > el.clientHeight + 1)) { el = el.parentElement; continue }
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) e.preventDefault()
      return
    }
    el = el.parentElement
  }
  const scrollEl = document.scrollingElement || document.documentElement
  const scrollTop = Math.max(scrollEl.scrollTop, document.documentElement.scrollTop, document.body.scrollTop)
  const scrollHeight = Math.max(scrollEl.scrollHeight, document.documentElement.scrollHeight)
  const atTop = scrollTop <= 0
  const atBottom = scrollTop + window.innerHeight >= scrollHeight - 1
  const isScrollable = scrollHeight > window.innerHeight + 1
  if (isScrollable) { if ((deltaY > 0 && atTop) || (deltaY < 0 && atBottom)) e.preventDefault() }
  else { if (deltaY !== 0) e.preventDefault() }
}
document.addEventListener("touchstart", onTouchStart, { passive: true })
document.addEventListener("touchmove", onTouchMove, { passive: false })

/* ── fire a real two-event gesture at a node and report whether it was eaten ── */
function swipe(node, dy) {
  prevented = false
  const r = node.getBoundingClientRect()
  const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + Math.min(r.height, 200) / 2)
  const mk = (type, cy) => {
    const t = new Touch({ identifier: 1, target: node, clientX: x, clientY: cy })
    return new TouchEvent(type, { touches: [t], targetTouches: [t], changedTouches: [t], bubbles: true, cancelable: type === "touchmove" })
  }
  node.dispatchEvent(mk("touchstart", y))
  const ev = mk("touchmove", y + dy)
  node.dispatchEvent(ev)
  return ev.defaultPrevented
}

const scrollable = document.getElementById("scrollable")
const unscrollable = document.getElementById("unscrollable")
const plain = document.getElementById("plain")
const out = {}
window.OPT_OUT = false
out.lockedNoOptOut = { unscrollable: swipe(unscrollable, -60), plainBounce: swipe(plain, -60) }
window.OPT_OUT = true
out.lockedOptOut = { unscrollable: swipe(unscrollable, -60), scrollable: swipe(scrollable, -60), plainBounce: swipe(plain, -60) }
document.title = JSON.stringify(out)
</script></body></html>`

let broken = 0
const expect = (ok, what, got = "") => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}${ok ? "" : `   ${got}`}`)
  if (!ok) broken++
}

const out = mkdtempSync(join(tmpdir(), "storelib-bounce-"))
try {
  const page = join(out, "b.html")
  writeFileSync(page, html)
  const dom = execFileSync(
    CHROMIUM,
    ["--headless=new", "--no-sandbox", "--disable-gpu", "--window-size=420,780",
     "--virtual-time-budget=1500", "--dump-dom", `file://${page}`],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
  const t = dom.match(/<title>(.*?)<\/title>/)
  if (!t) fail("the fixture never reported its measurements")
  const m = JSON.parse(t[1])

  console.log("\nthe bounce guard does not police a surface that polices itself\n")

  // The control: this is the freeze, reproduced.
  expect(m.lockedNoOptOut.unscrollable === true,
    "in a locked document the guard cancelled a swipe in the builder outright",
    "it did not cancel, so this fixture is not reproducing the fault")

  // And the fix.
  expect(m.lockedOptOut.unscrollable === false,
    "with the builder opted out, that same swipe is left alone",
    "the gesture is still being cancelled")
  expect(m.lockedOptOut.scrollable === false,
    "and a swipe on a canvas that can scroll is left alone too",
    "the scrollable canvas is being cancelled")

  // And the guard is still a guard everywhere else.
  expect(m.lockedOptOut.plainBounce === true,
    "outside the builder it still stops the bounce, so the opt-out is an opt-out and not an off switch",
    "the guard no longer prevents anything anywhere")

  console.log(`\n  no opt-out   builder swipe cancelled: ${m.lockedNoOptOut.unscrollable}   outside: ${m.lockedNoOptOut.plainBounce}`)
  console.log(`  opt-out      builder swipe cancelled: ${m.lockedOptOut.unscrollable}   scrollable: ${m.lockedOptOut.scrollable}   outside: ${m.lockedOptOut.plainBounce}\n`)
} finally {
  rmSync(out, { recursive: true, force: true })
}

process.exit(broken ? 1 : 0)
