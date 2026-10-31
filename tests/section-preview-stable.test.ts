/**
 * ===========================================================================
 *  ADD A SECTION: AN IMPORTED THEME'S PICTURES STAY ON THEIR OWN CARDS
 * ===========================================================================
 * The owner: previews overlapping each other, a section's picture drawn over
 * the next card or cut in half, an announcement bar across two cards,
 * headings cut mid line, fixed only by reloading, and worst while the editor
 * took pushes.
 *
 *   THE PAGE THE CARDS ARE PLACED ON COULD BE MOVED. Its lock was outside
 *   the cards' cascade layer, so a theme's stronger `!important` (room under
 *   a fixed bar: `body.template-index { margin-top }`) moved every picture
 *   off its card. It is in the first layer now, with zoom and transforms off
 *   and the page held at its top left.
 *   A SECTION'S LINKED STYLESHEET STYLED EVERY CARD. It is put in the head
 *   once, in an @scope of the cards that link it.
 *   A NEWER SHEET TOOK THE DOCUMENT ON ITS WAY OUT while the frame loaded
 *   the new one, and measured its sections in the old theme's styles.
 *   A PUSH WAS A NEW SHEET PER FILE while the library was open: a burst is
 *   taken once.
 *   A FONT REMEASURED EVERY CARD IN ONE TASK: a few ms a frame, nearest first.
 *
 * The browser half, with the numbers: scripts/check-section-preview-stress.mjs.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const src = read("components/website-builder/compat/compat-section-preview.tsx")
const rules = src.slice(src.indexOf("function sheetRules("), src.indexOf("/** The cards' document: the theme's head"))
const sheet = src.slice(src.indexOf("class PreviewSheet {"), src.indexOf("A CARD'S STYLES ARE ITS OWN"))

console.log("\nThe page the cards are placed on cannot be moved")
{
  const layerAt = rules.indexOf("`@layer ${CARD_LAYER}{`")
  const lockAt = rules.indexOf('"html,body{')
  check("the page's lock is inside the cards' layer, where no theme !important beats it", layerAt >= 0 && lockAt > layerAt)
  const lock = rules.slice(lockAt, rules.indexOf("\n", lockAt))
  for (const prop of ["margin:0!important", "padding:0!important", "position:static!important", "zoom:1!important", "transform:none!important", "overflow:hidden!important", "scroll-snap-type:none!important", "contain:none!important"]) {
    check(`  ${prop}`, lock.includes(prop))
  }
  check("the page is put back at its top left if anything scrolled it", /page\.scrollTo\(0, 0\)/.test(sheet) && /const page = this\.doc\.scrollingElement/.test(sheet))
}

console.log("\nA section's linked stylesheet reaches only the cards that link it")
{
  check("linked sheets are taken out of the section before its own styles are scoped", /w\.innerHTML = html\s*\n\s*this\.hoistSheets\(w\)\s*\n\s*keepStylesInside\(w, key\)/.test(sheet))
  check("  each distinct sheet once in the head, by its whole text", /const id = `\$\{media\}\|\$\{sheetTag\(text\)\}`/.test(sheet) && /doc\.head\.appendChild\(copy\)/.test(sheet))
  check("  kept to the cards carrying its token", /keepStyleTo\(copy, `\[data-sl-sheets~="\$\{token\}"\]`\)/.test(sheet) && /w\.setAttribute\("data-sl-sheets", tokens\.join\(" "\)\)/.test(sheet))
  check("  tokens are unique across sheets, so a reused document never mixes two sheets' styles", /token = `s\$\{\+\+sharedSheetCount\}`/.test(sheet))
  check("  and removed with the sheet", /for \(const el of this\.sharedEls\) el\.remove\(\)/.test(sheet))
  check("the section's own styles are still kept to its card", /keepStyleTo\(el, `\[data-sl-pv="\$\{esc\}"\]`\)/.test(src))
}

console.log("\nA push swaps the document cleanly")
{
  check("a document is a sheet's only once it has loaded that sheet's srcdoc", /if \(loaded\) loadedFrom\.set\(doc, frame\.getAttribute\("srcdoc"\) \?\? ""\)/.test(sheet) && /if \(loadedFrom\.get\(doc\) !== this\.srcDoc\) return/.test(sheet) && /onLoad=\{\(e\) => sheet\.attach\(e\.currentTarget, true\)\}/.test(src))
  check("  nothing of another sheet's is left in a document a sheet takes", /doc\.querySelectorAll\(`body>\$\{CARD_TAG\}, style\[data-sl-shared\]`\)/.test(sheet))
  check("  a section drawn the same as before is shown at once, not faded in again", /if \(this\.donor\?\.get\(key\) === html\) this\.instant\.add\(key\)/.test(sheet) && /shownBefore\.set\(this\.doc, drawn\)/.test(sheet))
  check("an open library takes a burst of changes once", /export const LIVE_ADOPT_QUIET_MS = 250/.test(src) && /export const LIVE_ADOPT_CAP_MS = 1_200/.test(src) && /behindSince\.current \+ LIVE_ADOPT_CAP_MS - now/.test(src))
  check("a card put in, taken out or hidden puts every section back over its card", /new MutationObserver\(\(\) => sheet\.requestSync\(\)\)/.test(src) && /attributeFilter: \["hidden"\]/.test(src))
}

console.log("\nNo long task while the list scrolls")
{
  check("remeasuring after a font or picture is a few ms of a frame, nearest the screen first", /if \(performance\.now\(\) - t0 >= REMEASURE_FRAME_MS\) break/.test(sheet) && /\.sort\(\(a, b\) => a\.d - b\.d\)/.test(sheet) && /if \(this\.remeasure\.size\) this\.queueRemeasure\(\)/.test(sheet) && /const REMEASURE_FRAME_MS = 4/.test(src))
  check("putting sections in takes less of a frame while the list scrolls", /performance\.now\(\) - lastInput < SCROLLING_MS \? REMEASURE_FRAME_MS : FRAME_BUDGET_MS/.test(sheet))
  check("a height is remembered only once the section's pictures are in", /if \(h > 0 && Array\.from\(w\.querySelectorAll\("img"\)\)\.every\(\(img\) => img\.complete\)\) rememberHeight/.test(sheet))
}

console.log("\nThe browser probe")
{
  check("the stress probe, its page and its theme exist", ["scripts/check-section-preview-stress.mjs", "scripts/render-section-preview-stress.tsx", "scripts/section-preview-stress-theme.ts"].every((p) => existsSync(join(process.cwd(), p))))
  const probe = read("scripts/check-section-preview-stress.mjs")
  check("  it fails on any overlap, misplaced, cut, stale or duplicate picture", ["pictures painted over another card", "off their card by more than 1px", "cut short of their own section", "stale pictures after a push", "duplicate pictures"].every((w) => probe.includes(w)))
  const theme = read("scripts/section-preview-stress-theme.ts")
  check("  its theme is the owner's shape: 157 sections, fixed bars, negative margins, late fonts and pictures, a linked pack stylesheet", /SECTION_COUNT = 157/.test(theme) && /position:fixed/.test(theme) && /margin:-/.test(theme) && /LateFont/.test(theme) && /marketing-sections\.css/.test(theme))
  check("  documented with the other live update checks", read("docs/operations/editor-live-updates.md").includes("check-section-preview-stress.mjs"))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
