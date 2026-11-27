/**
 * ===========================================================================
 *  ROUND 18: BLOCK PREVIEWS, COMING BACK TO THE TAB, ASK STORELIB ON A PHONE
 * ===========================================================================
 * The owner: "the blocks simply just don't have previews", "I come back to
 * the tab after 5 minutes, it shows a black screen and then it lags", and on
 * a phone "the whole Ask Storelib modal is laggy, it glitches, it bugs, when
 * I try to close it, it flashes". Measured with scripts/check-block-picker.mjs,
 * scripts/check-wb-return-r18.mjs and scripts/check-ask-sheet-r18.mjs:
 *
 *   BLOCKS   an imported theme's block library drew its blocks on a page
 *            with an empty shop (a product section's title, price and buy
 *            buttons drew nothing), and a block a section draws through a
 *            snippet could not be drawn alone: both showed only an icon
 *   RETURN   the canonical editor address (/store/…/themes/…/editor) had no
 *            ground and no held first paint; every return fired a resize
 *   ASK      typing re-rendered the memory button, whose popover re-anchored
 *            on every key until React's update limit was hit ("Maximum
 *            update depth exceeded"); a failed history read hid every new
 *            message; closing laid the whole page out in the slide's first
 *            frame (244ms at a quarter speed)
 *
 * Read from source (comments out). Run with:  npm run test:push
 */
import { existsSync } from "node:fs"
import { readCode } from "./_source"

let passed = 0
let failed = 0
function check(label: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}`)
  }
}

const picker = readCode("components/website-builder/editor/block-picker.tsx")
const canvas = readCode("components/website-builder/compat/compat-canvas.tsx")
const layout = readCode("app/(storelib)/layout.tsx")
const editor = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")
const memory = readCode("components/website-builder/ask-memory.tsx")
const chat = readCode("components/website-builder/theme-chat.tsx")
const sheet = readCode("components/website-builder/mobile-editor-sheet.tsx")
const library = readCode("components/website-builder/editor/section-library.tsx")

console.log("\nEvery block has a preview")
check("the canvas hands its page (the store's products) to the picker", /setShownCompatPage\(page\)/.test(canvas) && /shownCompatPage\(\)/.test(picker))
check("the picker's page carries the canvas's shop, or a sample product in an empty one", /function pageWithShop\(base: CompatPage\): CompatPage/.test(picker) && /\[sampleCard\(\)\]/.test(picker))
check("blocks are drawn with that page", /blockMarkup\(ctx\.theme, page,/.test(picker) && /sheetDocument\(ctx\.theme, page,/.test(picker))
check("a block that cannot be drawn alone is drawn in its section and cropped to it", /sectionMarkup\(ctx\.theme, page, session\.sectionFor\(choice\)/.test(picker) && /drawn\.includes\(`data-block-id="\$\{PREVIEW_BLOCK_ID\}"`\)/.test(picker))

console.log("\nComing back to the tab")
check("the canonical editor address gets the editor's ground and held first paint", /\^\\\\\/store\\\\\/\[\^\/\]\+\\\\\/themes\\\\\/\[\^\/\]\+\\\\\/editor/.test(layout))
check("a return fires a resize only when the size changed while away", /if \(!restored && now === size\) return/.test(editor) && /revive\(e\.persisted\)/.test(editor))

console.log("\nAsk Storelib on a phone")
check("the memory button is kept out of the chat's renders", /export const AskMemoryButton = React\.memo\(/.test(memory))
check("a failed history read sits above the thread instead of hiding it", /historyError === "read_failed" && exchanges\.length === 0 \?/.test(chat) && /data-ask-read-failed=""/.test(chat))
check("the page lock is let go after the sheet's slide, not in its first frame", /window\.setTimeout\(release, moveMs \+ 120\)/.test(sheet) && /pageRelease\?\.\(\)/.test(sheet))
check("the keyboard's settle reads at the start of a frame", /const soon = \(\) => requestAnimationFrame\(settleCanvas\)/.test(editor))
check("the section library draws nothing ahead while a sheet slides", /window\.addEventListener\("transitionrun", moving, o\)/.test(library))

console.log("\nA new section goes to its spot at Enter, on every kind of theme")
const route = readCode("lib/website-builder/ask-route.ts")
const theme = readCode("lib/storelib-theme/compat/theme.ts")
const spot = readCode("lib/storelib-theme/compat/writing-spot.ts")
check("the server's rules run in the chat at Enter", /export function writerAtOnce\(ask: RouteAsk\): boolean/.test(route) && /routeByRules\(/.test(route) && /ruled\.agent === "writer" && !ruled\.ambiguous/.test(route))
check("a clear writer starts the spot and the glide before the router answers", /const early = !writing && !busy && writerAtOnce\(ask\)/.test(chat) && chat.indexOf("onWriteStart?.(prompt, writePlace.current)\n          onWorkingChange") > -1 && chat.indexOf("onWriteStart?.(prompt, writePlace.current)\n          onWorkingChange") < chat.indexOf("const route = await asked") /* Changed on purpose (r69): with the chip's place */ && /const asked = decideRoute\(installId, ask\)/.test(chat))
check("and is not started twice", /if \(!into \|\| startedEarly\.current !== into\) onWriteStart\?\.\(prompt, writePlace\.current\)/.test(chat)) /* Changed on purpose (r69): with the chip\'s place */
check("a guess the server overrules is put back", /onWriteCancel\?\.\(\)/.test(chat) && /const handleWriteCancel = useCallback/.test(editor) && (editor.match(/onWriteCancel=\{handleWriteCancel\}/g) ?? []).length === 2)
check("an imported theme's canvas draws the spot", /if \(instance\.type === WRITING_SPOT_TYPE\) return \{ html: writingSpotHtml\(/.test(theme) && /data-writing-section=""/.test(spot))
check("with CSS motion only, still under reduced motion", /@keyframes slw-roll/.test(spot) && /prefers-reduced-motion:reduce/.test(spot))

console.log("\nA push or a written section lands without drawing the page again")
const live = readCode("components/website-builder/sections/storelib-live.tsx")
check("a changed file redraws the sections that read it, and the render function stays put so the rest of the page is not drawn again", /useSectionSourceRev\(section\.type\)/.test(readCode("components/website-builder/sections/StorelibSection.tsx")) && /noteSourceChanges\(changed\)/.test(live) && /\[template, inEditor, products, dataKey, globals, extras, headerLogo, canvas\]/.test(live))
check("and a new section draws from the files as they are now", /sourcesNow\.current, products, dataNow\.current/.test(live))
check("the back guard's history entry waits for a quiet moment", /w\.requestIdleCallback\(armBackGuard, \{ timeout: 1000 \}\)/.test(editor))
check("the rules run a frame after Enter, with the router already asked", /const asked = decideRoute\(installId, ask\)\s*await new Promise<void>\(\(done\) => requestAnimationFrame/.test(chat))

console.log("\nThe probes")
const ask = existsSync("scripts/check-ask-sheet-r18.mjs") ? readCode("scripts/check-ask-sheet-r18.mjs") : ""
const back = existsSync("scripts/check-wb-return-r18.mjs") ? readCode("scripts/check-wb-return-r18.mjs") : ""
check("scripts/check-ask-sheet-r18.mjs measures the phone sheet's edges and its close", /nothing in the sheet ends past its edges/.test(ask) && /its top only moves down while it closes/.test(ask))
check("scripts/check-wb-return-r18.mjs measures a return after minutes away", /AWAY_S/.test(back) && /the first frame comes within 200ms/.test(back))
const imported = existsSync("scripts/check-wb-write-imported-r18.mjs") ? readCode("scripts/check-wb-write-imported-r18.mjs") : ""
check("scripts/check-wb-write-imported-r18.mjs writes a section in an imported theme with a slow router", /DECIDE_MS/.test(imported) && /the spot is in the frame within 400ms of Enter/.test(imported) && /decideMs/.test(readCode("scripts/render-editor-probe.tsx")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-r18.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
