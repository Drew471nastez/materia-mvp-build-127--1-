/**
 * ===========================================================================
 *  A PICKER ON A PHONE IS A SCREEN, AND IT LEAVES THE SHEET ALONE
 * ===========================================================================
 * The claim is geometric, so it is measured. Opening the link picker inside
 * the editor's phone sheet used to expand it IN FLOW, which changed the
 * height the sheet measures to pick its detent — the sheet snapped to half
 * and the list that had just been asked for was under the fold.
 *
 * Three numbers say whether that is fixed: the height of the sheet's content
 * before and after opening (it must not move), where the panel is in the
 * document (outside the sheet, or it is still in its flow), and whether the
 * search box and the first row are actually on screen and on top at their
 * own centres — the two things that were unreachable.
 *
 *   pnpm build && node scripts/check-field-screen.mjs
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

const CHROMIUM = process.env.CHROMIUM ?? "/opt/pw-browsers/chromium"
const root = process.cwd()
const fail = (m) => { console.error(`\n${m}\n`); process.exit(1) }
if (!existsSync(CHROMIUM)) fail(`No browser at ${CHROMIUM}.`)
const cssDir = join(root, ".next/static/chunks")
if (!existsSync(cssDir)) fail("No production build found. Run `pnpm build` first.")
const css = readdirSync(cssDir).filter((f) => f.endsWith(".css")).map((f) => readFileSync(join(cssDir, f), "utf8")).join("\n")

const out = mkdtempSync(join(tmpdir(), "storelib-fieldscreen-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-field-screen.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

/*
  THE SHEET, NEAR ENOUGH: a bottom panel of its own height, holding a
  scroller with the field in it. What matters is that it HAS a measured
  content height, because that is the number the real sheet reads to choose
  a detent and the number the old panel moved.
*/
writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>
  body { margin: 0; background: #e5e7eb; }
  #sheet-wrap { position: fixed; left: 0; right: 0; bottom: 0; background: #fff; border-top-left-radius: 16px; border-top-right-radius: 16px; }
  #sheet { max-height: 52svh; overflow-y: auto; padding: 16px; }
</style>
</head><body>
<div id="sheet-wrap"><div id="sheet"></div></div>
<script src="probe.js"></script>
<script>
window.addEventListener("error", function (e) {
  var pre = document.createElement("pre"); pre.id = "probe-error"
  pre.textContent = String(e.message) + " @ " + String(e.filename) + ":" + String(e.lineno)
  document.body.append(pre)
})
function boxOf(el) { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) } }
function topmostAt(el) {
  const r = el.getBoundingClientRect()
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
  if (!hit) return "nothing"
  if (hit === el || el.contains(hit)) return "itself"
  return hit.tagName.toLowerCase() + "." + String(hit.className || "").slice(0, 30)
}
setTimeout(function () {
  const sheet = document.getElementById("sheet")
  const before = { content: sheet.scrollHeight, box: boxOf(document.getElementById("sheet-wrap")) }
  const trigger = sheet.querySelector("button[aria-expanded]")
  trigger.click()
  setTimeout(function () {
    const after = { content: sheet.scrollHeight, box: boxOf(document.getElementById("sheet-wrap")) }
    const screen = document.querySelector("[data-field-screen]")
    /*
      MOTION IS READ FROM THE LIVE STYLE, GEOMETRY AFTER IT IS SHORT-CIRCUITED.

      A headless run with a virtual clock does not advance CSS transitions, so
      the sheet is caught part-way up and every rect below it is a number from
      the middle of an animation — the first version of this read the search
      box at 762px in a 757px window and called it off screen. The transition
      string is captured first, because it is the thing being asserted; then
      transitions are switched off so the rects are the settled ones.
    */
    const surface = screen ? screen.closest("[data-mobile-bottom-sheet]") : null
    const liveMotion = surface ? (function () {
      const cs = getComputedStyle(surface)
      return { property: cs.transitionProperty, duration: cs.transitionDuration, easing: cs.transitionTimingFunction,
               radius: cs.borderTopLeftRadius, shadow: cs.boxShadow.slice(0, 40) }
    })() : null
    const kill = document.createElement("style")
    kill.textContent = "[data-mobile-bottom-sheet], [data-mobile-bottom-sheet] * { transition: none !important; animation: none !important }"
    document.head.append(kill)
    void document.body.offsetHeight
    const field = screen ? screen.querySelector("input") : null
    const firstRow = screen ? screen.querySelector("[data-sheet-scroll] button") : null
    const custom = screen ? screen.querySelectorAll("input")[1] : null
    const result = {
      before, after,
      screenExists: !!screen,
      /* Outside the sheet's flow, or the sheet still measures it. */
      screenInsideSheet: !!screen && sheet.contains(screen),
      /* The surface is the editor's own sheet, which portals itself to the
         body. That is what has to be outside the first sheet, not the little
         wrapper inside it. */
      surfaceParent: (function () {
        const surf = screen ? screen.closest("[data-mobile-bottom-sheet]") : null
        if (!surf) return null
        return surf.parentElement === document.body ? "body" : surf.parentElement.tagName.toLowerCase()
      })(),
      screenZ: (function () {
        const surf = screen ? screen.closest("[data-mobile-bottom-sheet]") : null
        return surf ? getComputedStyle(surf).zIndex : null
      })(),
      /* MOTION, because "it is not smooth" is a property of this string.
         The sections sheet travels on transform for 360ms on the iOS curve;
         a screen that arrives with no transition is the one that looked
         cheap. */
      motion: liveMotion,
      grabber: !!(screen && screen.closest("[data-mobile-bottom-sheet]")?.querySelector("[class*='cursor-grab']")),
      panel: (function () {
        const surf = screen ? screen.closest("[data-mobile-bottom-sheet]") : null
        return surf ? boxOf(surf) : null
      })(),
      viewport: { h: window.innerHeight, w: window.innerWidth },
      searchBox: field ? { ...boxOf(field), topmost: topmostAt(field), focused: document.activeElement === field } : null,
      firstRow: firstRow ? { ...boxOf(firstRow), text: firstRow.textContent.trim().slice(0, 20), topmost: topmostAt(firstRow) } : null,
      customBox: custom ? { ...boxOf(custom), topmost: topmostAt(custom) } : null,
      /* The list must take the room, not sit in a 240px box with space under it. */
      listH: screen ? boxOf(screen.querySelector("[data-sheet-scroll]")).h : null,
      inlinePanelStillThere: !!sheet.querySelector(".wb-field-panel"),
    }
    const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(result)
    document.body.append(pre)
  }, 400)
}, 600)
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
const m = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/)
if (!m) {
  /* What the page actually was, rather than a sentence about what it was not.
     A probe that says only "it never reported" has hidden the reason. */
  const err = dom.match(/<pre id="probe-error">([\s\S]*?)<\/pre>/)
  if (err) fail(`The probe threw: ${err[1]}`)
  fail(`The picker never reported. The body held ${dom.length} characters; first 600 of <body>:\n${(dom.split("<body")[1] ?? dom).slice(0, 600)}`)
}
const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"))

const problems = []
if (!r.screenExists) problems.push("the picker did not open as a screen on a phone")
if (r.screenInsideSheet) problems.push("the screen is inside the sheet, so the sheet still measures it")
if (r.surfaceParent !== "body") problems.push(`the sheet is not portalled to the body (parent: ${r.surfaceParent})`)
if (!r.motion) problems.push("no sheet surface to measure motion on")
else {
  if (!/transform/.test(r.motion.property)) problems.push(`the screen does not travel: transition-property ${r.motion.property}`)
  if (r.motion.duration === "0s") problems.push("the screen appears rather than slides: transition-duration 0s")
  if (!/cubic-bezier\(0.32, 0.72, 0, 1\)/.test(r.motion.easing)) problems.push(`not the sheet's curve: ${r.motion.easing}`)
  if (parseInt(r.motion.radius, 10) < 12) problems.push(`the corner is not the sheet's: ${r.motion.radius}`)
}
if (!r.grabber) problems.push("no grabber, so it cannot be dragged away like the sheet it opened from")
if (r.inlinePanelStillThere) problems.push("the in-flow panel opened as well, which is the thing being replaced")
if (r.before.content !== r.after.content) {
  problems.push(`opening the picker changed what the sheet measures: ${r.before.content} -> ${r.after.content}`)
}
if (!r.searchBox) problems.push("no search box on the screen")
else {
  if (r.searchBox.topmost !== "itself") problems.push(`the search box is covered by ${r.searchBox.topmost}`)
  if (r.searchBox.top < 0 || r.searchBox.top > r.viewport.h) problems.push(`the search box is off screen at ${r.searchBox.top}px`)
}
if (!r.firstRow) problems.push("no rows to choose from")
else {
  if (r.firstRow.topmost !== "itself") problems.push(`the first row is covered by ${r.firstRow.topmost}`)
  if (r.firstRow.top < 0 || r.firstRow.top > r.viewport.h) problems.push(`the first row is off screen at ${r.firstRow.top}px`)
}
if (r.customBox && r.customBox.topmost !== "itself") problems.push(`the custom address box is covered by ${r.customBox.topmost}`)
/* A screen worth opening: at least a third of the window, and the list takes
   most of what is left rather than staying in its sidebar-sized box. */
if (r.panel && r.panel.h < r.viewport.h * 0.33) problems.push(`the screen is only ${r.panel.h}px of a ${r.viewport.h}px window`)
if (r.listH !== null && r.listH <= 240) problems.push(`the list is still capped at a sidebar height (${r.listH}px)`)

console.log(`sheet content   ${r.before.content}px before, ${r.after.content}px after`)
console.log(`screen          ${r.panel ? r.panel.h : "?"}px of ${r.viewport.h}px, portalled to ${r.surfaceParent}, z ${r.screenZ}`)
console.log(`motion          ${r.motion ? `${r.motion.property} ${r.motion.duration} ${r.motion.easing}` : "none"}`)
console.log(`surface         radius ${r.motion ? r.motion.radius : "?"}, grabber ${r.grabber ? "yes" : "no"}`)
console.log(`list            ${r.listH}px`)
console.log(`search box      top ${r.searchBox ? r.searchBox.top : "?"}, topmost ${r.searchBox ? r.searchBox.topmost : "?"}`)
console.log(`first row       ${r.firstRow ? r.firstRow.text : "?"} at ${r.firstRow ? r.firstRow.top : "?"}, topmost ${r.firstRow ? r.firstRow.topmost : "?"}`)
console.log(`custom box      top ${r.customBox ? r.customBox.top : "?"}, topmost ${r.customBox ? r.customBox.topmost : "?"}`)
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe picker is a screen of its own, the sheet never moved, and everything on it can be pressed.")
