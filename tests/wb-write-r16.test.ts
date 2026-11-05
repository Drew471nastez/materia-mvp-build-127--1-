/**
 * ===========================================================================
 *  ROUND 16: ASK STORELIB WRITES A SECTION, AND THE EDITOR OPENS CLEAN
 * ===========================================================================
 * The owner: "when the AI coding agent [writes a section] it smoothly closes
 * the window sheet, and takes me smoothly to the place where it's creating
 * the section with a beautiful animation, and after it finishes, auto smooth
 * scrolls me to that", and "no skeleton structure behind the loading
 * animation" when the editor opens. Measured with scripts/check-wb-write-r16.mjs:
 *
 *   THE SHEET     the canvas was asked to move 80ms into the sheet's slide,
 *                 and only when the spot was off screen: a spot under the
 *                 sheet counted as on screen, so nobody was taken anywhere
 *   THE SPOT      it rewrote its whole lane of code into the page every frame
 *                 (2 to 25% of frames dropped while it wrote, on a phone)
 *   THE LANDING   the finished section, rarely the spot's height, moved the
 *                 canvas 60px by itself (scroll anchoring) before the glide
 *   THE OPENING   a grey outline of a page behind the loader, and grey bars
 *                 in the sidebar
 *
 * Read from source (comments out). Run with:  npm run test:push
 */
import { existsSync, readFileSync } from "node:fs"
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

const editor = readCode("app/(storelib)/website-builder/editor/[installId]/page.tsx")
const writing = readCode("components/website-builder/editor/writing-section.tsx")
const css = readFileSync("app/globals.css", "utf8")

console.log("\nThe sheet goes down, then the canvas glides to the spot")
check("on a phone the sheet closes and the glide waits for it", /setAiOpen\(false\)\s*revealSection\(WRITING_SECTION_ID, true, sheetMoveMs\(\) \+ 60\)/.test(editor))
check("on a computer the canvas glides to the spot whenever it starts", /\} else \{\s*revealSection\(WRITING_SECTION_ID, true\)\s*\}/.test(editor))
check("revealSection can wait for something still moving over the canvas", /* Changed on purpose (round 14 INCOMING: `since`, so a run's end does not scroll a canvas the person moved) */ /const revealSection = useCallback\(\(sectionId: string, glide = false, afterMs\?: number(, since\?: number)?\) =>/.test(editor) && /\}, afterMs \?\? \(glide \? 120 : 80\)\)/.test(editor))

console.log("\nThe spot types its code without laying out the page")
check("only the line being typed is written each frame", /if \(current\) current\.innerHTML = `\$\{tint\(line\)\}<span class="wb-writing-caret"><\/span>`/.test(writing) && /if \(key !== laneKey \|\| !current\)/.test(writing))
check("and nothing on a frame that typed nothing", /if \(typed !== typedBefore\)/.test(writing))
check("its lane is contained, so its lines never lay the canvas out", /\.wb-writing-code \{[^}]*contain: strict;/.test(css))
check("and written thirty times a second, not sixty", /const TYPE_EVERY_MS = 30/.test(writing) && /if \(now - drawnAt < TYPE_EVERY_MS\)/.test(writing))
const library = readCode("components/website-builder/editor/section-library.tsx")
check("the section library draws nothing ahead while Storelib AI works", /if \(aiAtWork\) return INPUT_QUIET_MS/.test(library) && /holdPreviewsForAi\(aiBusy \|\| !!aiWriting\)/.test(editor))

console.log("\nThe section lands without a jump, then the canvas glides to it")
check("scroll anchoring is off for the swap and the glide, and on again after", /canvas\.style\.overflowAnchor = "none"\s*window\.setTimeout\(\(\) => \{ canvas\.style\.overflowAnchor = "" \}, 1400\)/.test(editor))
check("before the section is put in the spot's place", editor.indexOf('canvas.style.overflowAnchor = "none"') < editor.indexOf("setSections((previous) => placeWrittenSection(previous, writing.anchor"))
check("and it is glided to and arrives with its entrance", /revealSection\(id, true\)\s*return id/.test(editor) && /setArrivedId\(id\)/.test(editor))

console.log("\nThe editor opens on its loader alone")
check("no outline of a page behind the loader", !/<PageOutline \/>/.test(editor) && !/data-canvas-outline/.test(editor))
check("the loader is there from the first frame of the opening, on the editor's light grey", /const showCanvasLoader = useDelayedFlag\(canvasLoaderUp, SPINNER_WAIT_MS\) \|\| loading/.test(editor) && /wb-canvas-loader absolute inset-0 z-10 flex items-center justify-center bg-\[#f4f5f7\]/.test(editor))
check("no grey bars in the sidebar while it opens", /\{loading \? \(\s*<div data-sheet-scroll className="flex-1 overflow-y-auto wb-slim-scroll px-2 py-2" aria-busy="true" \/>/.test(editor))

console.log("\nThe probe")
const probe = existsSync("scripts/check-wb-write-r16.mjs") ? readCode("scripts/check-wb-write-r16.mjs") : ""
check("scripts/check-wb-write-r16.mjs writes a section through the real editor on a phone and a computer", /PROBE_WRITER/.test(probe) && /no jump the frame the section takes the spot's place/.test(probe) && /PROBE_WRITER/.test(readCode("scripts/render-editor-probe.tsx")))
check("this suite runs with the others", readCode("scripts/run-push-tests.mjs").includes('"tests/wb-write-r16.test.ts"'))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
