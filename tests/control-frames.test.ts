/**
 * ===========================================================================
 *  WHAT A FINGER ON A CONTROL ASKS THE REST OF THE EDITOR TO DO
 * ===========================================================================
 * "The whole mobile bottom sheet with sections, pages and settings should not
 * lag at all."
 *
 * It did, and not because of anything the sheet does. Every control in the
 * editor ends in the same place: a setting changes and the canvas re-renders
 * the page to show it. A phone reports touches faster than it paints — up to
 * 240 a second on a 120Hz panel — and each one of those was a full page
 * render, inside the touch, before the next touch could be handled.
 *
 * Three rules come out of that, and this pins all three:
 *
 *   1. A control draws itself from its own state, so the thumb cannot be
 *      waiting on a round trip through the editor to move.
 *   2. What it sends upward goes at most once a frame. A frame is as often
 *      as a screen can show a change, so nothing is lost by going faster and
 *      a great deal is spent.
 *   3. The canvas gets a DEFERRED copy of that state, so React paints the
 *      control first and re-renders the page afterwards, throwing that work
 *      away and restarting it if another touch has arrived.
 *
 * Measured by scripts/check-control-frames.mjs, which drags the real slider
 * in the real sheet: sixty touches in bursts of four, which is a phone's
 * digitizer against a phone's display.
 *
 *     60 touches, 15 settings writes, 15 canvas renders
 *     with the coalescing taken out: 28 to 30 writes
 *
 * And the haptics are gone from the slider. A tick per step crossed sounded
 * right and is not.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const slider = read("components/website-builder/editor/slider-number-control.tsx")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const chip = read("components/website-builder/editor/color-chip.tsx")
  const gradient = read("components/website-builder/editor/gradient-editor.tsx")
  const probe = read("scripts/render-control-frames.tsx")

  console.log("\nThe slider is its own module, and the probe drives the real one")

  check("the editor imports it", /import \{ SliderNumberControl \} from "@\/components\/website-builder\/editor\/slider-number-control"/.test(editor))
  check("and does not keep a second copy", !/function SliderNumberControl/.test(editor))
  check("the probe imports the same one", /from "@\/components\/website-builder\/editor\/slider-number-control"/.test(probe))

  console.log("\nA control draws itself, and writes upward once a frame")

  check(
    "the thumb comes from the control's own state",
    /const \[shown, setShown\] = useState\(value\)/.test(slider),
    "drawn from the prop, it could not move until a settings change had gone up and come back",
  )
  /*
    AND A DRAG DOES NOT GO THROUGH REACT AT ALL. The Radix slider was
    controlled, so every pointermove was a state update and a render of the
    slider before the thumb moved. Now the finger writes the thumb's and the
    fill's transforms and the number straight to the DOM, once a frame, and
    React is told once, at the release. scripts/check-slider-drag.mjs counts
    it: 2 commits for a 96-move drag, against 138 for the old slider.
  */
  check(
    "a drag writes the thumb and the fill by transform, not by render",
    /railRef\.current\.style\.transform = `translate3d\(\$\{p \* 100\}%, 0, 0\)`/.test(slider) &&
      /fillRef\.current\.style\.transform = `scaleX\(\$\{p\}\)`/.test(slider),
  )
  check(
    "one write per frame however many moves arrive",
    /pendingX\.current = clientX\s*\n\s*if \(frame\.current\) return\s*\n\s*frame\.current = requestAnimationFrame/.test(slider),
  )
  check("the pointer is captured, so leaving the track keeps the drag", /setPointerCapture\(pointerId\)/.test(slider))
  check("React hears once, when the gesture ends", /const settle = useCallback\(\(\) => \{\s*\n\s*flush\(\)\s*\n\s*setShown\(live\.current\)/.test(slider))
  check("every value lands on the schema's step", /export function snapToStep/.test(slider) && /snapToStep\(min \+ p \* \(max - min\), min, max, step\)/.test(slider))
  check(
    "and the keyboard steps it",
    /role="slider"/.test(slider) && /e\.key === "ArrowRight"/.test(slider) && /e\.key === "Home"/.test(slider) && /e\.key === "End"/.test(slider),
  )
  check("what goes up is coalesced", /const \{ emit, flush \} = useFrameCommit\(onChange\)/.test(slider))
  check(
    "it does not fight its own echo",
    /if \(sent\.current !== null && value === sent\.current\) return/.test(slider),
  )
  check("the colour picker does the same", /useFrameCommit\(onChange\)/.test(chip))
  check("and so does the gradient", /useFrameCommit\(onChange\)/.test(gradient))
  check(
    "all three through one coalescer",
    /export function useFrameCommit/.test(read("components/website-builder/editor/use-frame-commit.ts")),
    "three copies of a rAF would be three places for it to go wrong",
  )

  console.log("\nNo haptics on a slider")

  check("the slider does not tap", !/hapticTap/.test(slider))
  check(
    "and the sheet opening still does",
    /if \(open && !wasOpen\.current\) hapticTap\("light"\)/.test(read("components/website-builder/mobile-editor-sheet.tsx")),
    "that one is an arrival, not a texture, and it was not what was asked to go",
  )

  console.log("\nThe canvas catches up; the control does not wait for it")

  check("the editor defers the canvas's copy of the theme", /const canvasThemeSettings = useDeferredValue\(activeThemeSettings\)/.test(editor))
  /* With Ask AI's placeholder laid over the deferred copy, never over the live one. */
  check("and of the sections",
    /const deferredSections = useDeferredValue\(sections\)/.test(editor)
      && /withWritingPlaceholder\(deferredSections, [^)]*\) : deferredSections\)/.test(editor))
  check(
    "and hands the canvas those, not the live ones",
    /theme=\{canvasThemeSettings\}/.test(editor)
      && (/sections=\{canvasSections\}/.test(editor) || (/sections=\{drawnSections\}/.test(editor) && /withDynamicSources\(canvasSections,/.test(editor))),
  )
  check(
    "the canvas is memoised, so an unchanged deferred value costs nothing",
    /const EditorCanvasPage = memo\(function EditorCanvasPage/.test(editor),
  )
  check(
    "selection is NOT deferred",
    /selectedSectionId=\{selectedSectionId\}/.test(editor),
    "the tap that selects a section was on the canvas, so the canvas has to answer it at once",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
