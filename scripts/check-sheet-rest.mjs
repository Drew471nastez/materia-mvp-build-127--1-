/**
 * ===========================================================================
 *  THE SHEET STAYS WHERE IT WAS PUT
 * ===========================================================================
 * Reported three times over, as three bugs: the sheet becomes half at random,
 * dragging a slider left and right glitches it to half, and selecting
 * something in a field moves it to the middle. All three are one thing.
 *
 * A drag ended by writing the transform straight to the node and keeping the
 * offset in a ref, so React never knew where the sheet was. The render fell
 * back to `openY` — the middle stop — which meant the NEXT render for any
 * reason at all put it back there. In the editor a render for any reason at
 * all is constant: a slider value, a field taking focus, the keyboard
 * resizing the window.
 *
 * Two of those are measured here, and the third — a slider taking the sheet's
 * own drag — with it:
 *
 *   1. drag the sheet to the top, re-render, and it has not moved
 *   2. drag a slider sideways, and the sheet has not moved
 *   3. the backdrop fades on a fade's curve, not on a thrown object's
 *   4. going into a section and coming back is a move, on the phone
 *
 * CSS transitions do not run under a virtual clock, so everything that is
 * about where an element ENDS UP is measured with transitions off, and the
 * transition itself is read from computed style before they are turned off.
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

const out = mkdtempSync(join(tmpdir(), "storelib-sheetrest-"))
execFileSync("npx", ["--no-install", "esbuild", join(root, "scripts/render-sheet-rest.tsx"),
  "--bundle", "--format=iife", "--platform=browser", "--jsx=automatic", "--log-level=error", `--outfile=${join(out, "probe.js")}`,
  '--banner:js=var process=globalThis.process||{env:{NODE_ENV:"production"},browser:true};globalThis.process=process;',
  '--define:process.env.NODE_ENV="production"',
  `--alias:@=${root}`, "--loader:.css=empty", "--loader:.svg=dataurl", "--loader:.png=dataurl"],
  { stdio: ["ignore", "ignore", "inherit"] })

const page = readFileSync(join(root, "scripts/sheet-rest-page.js"), "utf8")

writeFileSync(join(out, "index.html"), `<!doctype html><html><head><meta charset="utf-8">
<style>${css}</style>
<style>body { margin: 0; background: #e5e7eb; }</style>
</head><body>
<div id="root"></div>
<script src="probe.js"></script>
<script>
${page}
</script></body></html>`)

const dom = execFileSync(CHROMIUM, ["--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
  "--window-size=390,844", "--virtual-time-budget=12000", "--dump-dom", `file://${join(out, "index.html")}`],
  { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 })
/* The LAST one. The page script is dumped with the document, so anything
   in it that looks like the result element would otherwise be read as it. */
const all = [...dom.matchAll(/<pre id="result">([\s\S]*?)<\/pre>/g)]
const found = all.length ? all[all.length - 1] : null
if (!found) fail("The sheet never reported.")
const r = JSON.parse(found[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"))
if (r.error) fail(`The probe threw: ${r.error}`)

console.log(`window        ${r.viewport.w}x${r.viewport.h}`)
console.log(`sheet top     at rest ${r.atRest}px, mid-drag ${r.midDrag}px, landed ${r.dragged}px`)
console.log(`              after a re-render ${r.afterRender}px, and another ${r.afterRender2}px`)
console.log(`              during a slider drag ${r.midSlider}px, after it ${r.afterSlider}px, after a field took focus ${r.afterFocus}px`)
console.log(`backdrop      ${r.fade.duration} ${r.fade.easing}`)
console.log(`panel move    in ${r.panel.in.name} ${r.panel.in.duration}, back ${r.panel.back.name} ${r.panel.back.duration}, neither ${r.panel.none.name}`)

const problems = []
if (!(r.midDrag < r.atRest - 40)) {
  problems.push(`a render during the drag found the sheet at ${r.midDrag}px rather than moved from ${r.atRest}px — the probe is not driving it`)
}
if (!(r.dragged < r.atRest - 40)) {
  problems.push(`the drag ended with the sheet back at ${r.dragged}px, its resting stop — it was at ${r.midDrag}px when a render landed mid-gesture, and that render is what put it back`)
}
const same = (what, got) => {
  if (got !== r.dragged) problems.push(`${what} moved the sheet from ${r.dragged}px to ${got}px — it should not have moved at all`)
}
same("a re-render", r.afterRender)
same("a second re-render", r.afterRender2)
same("dragging a slider sideways", r.midSlider)
same("and the sheet is still there when it is released", r.afterSlider)
same("a field taking focus", r.afterFocus)
if (!r.sliderOptsOut) problems.push("the slider does not carry data-sheet-no-drag, so the sheet arbitrates its gesture")

const fadeMs = Math.round(parseFloat(r.fade.duration) * 1000)
if (!(fadeMs >= 200 && fadeMs <= 320)) problems.push(`the backdrop fades over ${fadeMs}ms, wanted 200 to 320`)
if (/0\.32,\s*0\.72/.test(r.fade.easing)) {
  problems.push(`the backdrop is still on the snap's curve (${r.fade.easing}), which spends half its distance in the first fifth of the time`)
}
if (r.panel.in.name === "none" || r.panel.back.name === "none") {
  problems.push("the sheet's panel does not move when you go into a section or come back")
}
if (r.panel.in.name === r.panel.back.name) {
  problems.push(`going in and coming back play the same animation (${r.panel.in.name}); the direction is the point`)
}
if (r.panel.none.name !== "none") problems.push(`a panel that did not change direction still animates (${r.panel.none.name})`)

if (problems.length) fail(problems.map((p) => `  - ${p}`).join("\n"))
console.log("\nThe sheet stays where it was put, and the backdrop and the panels move on their own curves.")
