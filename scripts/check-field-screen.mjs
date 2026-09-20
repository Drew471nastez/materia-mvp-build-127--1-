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
<style>body { margin: 0; background: #e5e7eb; }</style>
</head><body>
<div id="root"></div>
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
  const surface = document.querySelector("[data-mobile-bottom-sheet]")
  const panel = document.getElementById("panel")
  const before = {
    sheets: document.querySelectorAll("[data-mobile-bottom-sheet]").length,
    surface: boxOf(surface),
    content: panel.getBoundingClientRect().height,
  }
  const trigger = panel.querySelector("button[aria-expanded]")
  trigger.click()
  setTimeout(function () {
    const screen = document.querySelector("[data-sheet-screen]")
    const liveMotion = screen ? (function () {
      const cs = getComputedStyle(screen)
      return { property: cs.transitionProperty, duration: cs.transitionDuration, easing: cs.transitionTimingFunction }
    })() : null
    /* A virtual clock does not advance transitions, so the geometry below
       would be read from the middle of the slide. Captured above, killed
       here. */
    const kill = document.createElement("style")
    kill.textContent = "* { transition: none !important; animation: none !important }"
    document.head.append(kill)
    void document.body.offsetHeight

    const after = {
      sheets: document.querySelectorAll("[data-mobile-bottom-sheet]").length,
      surface: boxOf(document.querySelector("[data-mobile-bottom-sheet]")),
      content: panel.getBoundingClientRect().height,
    }
    const field = screen ? screen.querySelector("input") : null
    const firstRow = screen ? screen.querySelector("[data-sheet-scroll] button") : null
    const custom = screen ? screen.querySelectorAll("input")[1] : null
    const back = screen ? screen.querySelector("button[aria-label='Back']") : null
    const result = {
      before, after,
      /*
        THE SHEET IS PINNED TO THE BOTTOM OF THE WINDOW.
        Asserted because it stopped being: a position utility added for the
        pushed screen merged over the one that makes this a sheet at all, and
        it laid out in the flow of the body with its own translateY carrying
        it off screen. Nothing appeared, and every other number here still
        looked reasonable.
      */
      surfacePosition: surface ? getComputedStyle(surface).position : null,
      surfaceBottomGap: surface
        ? Math.round(window.innerHeight - surface.getBoundingClientRect().bottom)
        : null,
      screenExists: !!screen,
      /* Inside the sheet it came from, which is the whole point of this pass. */
      screenInsideSheet: !!screen && !!surface && surface.contains(screen),
      motion: liveMotion,
      screenBox: screen ? boxOf(screen) : null,
      viewport: { h: window.innerHeight, w: window.innerWidth },
      back: back ? { ...boxOf(back), topmost: topmostAt(back) } : null,
      searchBox: field ? { ...boxOf(field), topmost: topmostAt(field) } : null,
      firstRow: firstRow ? { ...boxOf(firstRow), text: firstRow.textContent.trim().slice(0, 20), topmost: topmostAt(firstRow) } : null,
      customBox: custom ? { ...boxOf(custom), topmost: topmostAt(custom) } : null,
      listH: screen ? boxOf(screen.querySelector("[data-sheet-scroll]")).h : null,
      inlinePanelStillThere: !!document.querySelector(".wb-field-panel"),
      grabber: (function () {
        const grab = surface ? surface.querySelector("[class*='cursor-grab']") : null
        if (!grab) return { found: false }
        const gb = grab.getBoundingClientRect()
        const hit = document.elementFromPoint(gb.left + gb.width / 2, gb.top + gb.height / 2)
        const cs = getComputedStyle(grab)
        const surfCs = surface ? getComputedStyle(surface) : null
        return {
          found: true, ...boxOf(grab), topmost: topmostAt(grab),
          point: { x: Math.round(gb.left + gb.width / 2), y: Math.round(gb.top + gb.height / 2) },
          hit: hit ? hit.tagName.toLowerCase() + "." + String(hit.className || "").slice(0, 30) : "null",
          pointerEvents: cs.pointerEvents, visibility: cs.visibility, opacity: cs.opacity,
          surface: surfCs ? { visibility: surfCs.visibility, opacity: surfCs.opacity, pointerEvents: surfCs.pointerEvents } : null,
        }
      })(),
    }
    const pre = document.createElement("pre"); pre.id = "result"; pre.textContent = JSON.stringify(result)
    document.body.append(pre)
  }, 400)
}, 700)
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
if (r.surfacePosition !== "fixed") problems.push(`the sheet is not fixed to the window: position ${r.surfacePosition}`)
if (r.surfaceBottomGap !== null && r.surfaceBottomGap > 0) {
  problems.push(`the sheet is not pinned to the bottom: ${r.surfaceBottomGap}px of window below it`)
}
if (!r.screenExists) problems.push("the picker did not open as a screen")
if (!r.screenInsideSheet) problems.push("the screen is not inside the sheet it was opened from")
if (r.after.sheets !== r.before.sheets) {
  problems.push(`a second sheet appeared: ${r.before.sheets} -> ${r.after.sheets}`)
}
/*
  THE SHEET MAY RISE, AND MAY NOT RESIZE.

  Rising is the point: a sub-page is a search box, a list and an address
  field, and at the middle stop its lower half is off the window. What must
  not happen is the sheet re-measuring itself around the screen — that is the
  re-snap this whole change exists to remove, and it shows up as a height
  that is not the height it had.
*/
if (r.after.surface.h !== r.before.surface.h) {
  problems.push(`the sheet resized around the screen: ${r.before.surface.h}px -> ${r.after.surface.h}px`)
}
if (r.after.surface.top > r.before.surface.top) {
  problems.push(`the sheet dropped instead of rising: top ${r.before.surface.top} -> ${r.after.surface.top}`)
}
if (Math.round(r.before.content) !== Math.round(r.after.content)) {
  problems.push(`opening the picker changed what the sheet measures: ${Math.round(r.before.content)} -> ${Math.round(r.after.content)}`)
}
if (r.inlinePanelStillThere) problems.push("the in-flow panel opened as well, which is the thing being replaced")
if (!r.motion) problems.push("no screen to measure motion on")
else {
  if (!/transform/.test(r.motion.property)) problems.push(`the screen does not travel: transition-property ${r.motion.property}`)
  if (r.motion.duration === "0s") problems.push("the screen appears rather than slides: transition-duration 0s")
  if (!/cubic-bezier\(0.32, 0.72, 0, 1\)/.test(r.motion.easing)) problems.push(`not the sheet's curve: ${r.motion.easing}`)
}
if (!r.back) problems.push("no way back from the screen")
else if (r.back.topmost !== "itself") problems.push(`the back control is covered by ${r.back.topmost}`)
if (!r.grabber.found) problems.push("no grabber on the sheet")
else if (r.grabber.topmost !== "itself") {
  problems.push(`the grabber is covered by ${r.grabber.topmost}, so the sheet cannot be dragged away with a screen open`)
}
for (const [name, box] of [["search box", r.searchBox], ["first row", r.firstRow], ["address box", r.customBox]]) {
  if (!box) { problems.push(`no ${name} on the screen`); continue }
  if (box.topmost !== "itself") problems.push(`the ${name} is covered by ${box.topmost}`)
  if (box.top < 0 || box.top > r.viewport.h) problems.push(`the ${name} is off screen at ${box.top}px`)
}
if (r.listH !== null && r.listH <= 240) problems.push(`the list is still capped at a sidebar height (${r.listH}px)`)

console.log(`sheets           ${r.before.sheets} before, ${r.after.sheets} after`)
console.log(`sheet position   ${r.surfacePosition}, ${r.surfaceBottomGap}px of window below it`)
console.log(`sheet surface    ${r.before.surface.h}px at ${r.before.surface.top} before, ${r.after.surface.h}px at ${r.after.surface.top} after`)
console.log(`panel content    ${Math.round(r.before.content)}px before, ${Math.round(r.after.content)}px after`)
console.log(`screen           ${r.screenBox ? r.screenBox.h : "?"}px, inside the sheet: ${r.screenInsideSheet}`)
console.log(`motion           ${r.motion ? `${r.motion.property} ${r.motion.duration} ${r.motion.easing}` : "none"}`)
console.log(`grabber          top ${r.grabber.top}, ${r.grabber.h}px tall, topmost ${r.grabber.topmost}`)
console.log(`back             top ${r.back ? r.back.top : "?"}, topmost ${r.back ? r.back.topmost : "?"}`)
console.log(`list             ${r.listH}px`)
console.log(`search box       top ${r.searchBox ? r.searchBox.top : "?"}, topmost ${r.searchBox ? r.searchBox.topmost : "?"}`)
console.log(`first row        ${r.firstRow ? r.firstRow.text : "?"} at ${r.firstRow ? r.firstRow.top : "?"}, topmost ${r.firstRow ? r.firstRow.topmost : "?"}`)
console.log(`address box      top ${r.customBox ? r.customBox.top : "?"}, topmost ${r.customBox ? r.customBox.topmost : "?"}`)
if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe picker is a sub-page of the sheet it was opened from: one surface, it slid across, and everything on it can be pressed.")
