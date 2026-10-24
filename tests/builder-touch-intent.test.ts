/**
 * ===========================================================================
 *  A SWIPE UP THE BUILDER'S PANEL IS A SCROLL, NOT A SLIDER DRAG (round AC3)
 * ===========================================================================
 * The owner: "in the sidebar, when I scroll with my finger up and down
 * through the sections, it confuses the touch scroll and accidentally
 * touches the sliders and things like this, it drags the sliders."
 *
 * The rule (lib/website-builder/touch-intent.ts) is checked with numbers,
 * and every draggable control in the panel's flow is pinned to it: the
 * slider rows, the gradient's handles and the focal point. The colour
 * picker's square and hue bar are in their own popover, out of the scroll,
 * and keep owning their finger. scripts/check-slider-scroll.mjs swipes over
 * twenty real slider rows in a browser.
 */
import { readCode } from "./_source"
import { INTENT_MAX_ANGLE_DEG, INTENT_SLOP_PX, scrolledRecently, touchIntent, waitsForIntent } from "@/lib/website-builder/touch-intent"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}

console.log("\nThe rule")
check("eight pixels, thirty degrees", INTENT_SLOP_PX === 8 && INTENT_MAX_ANGLE_DEG === 30)
check("under eight pixels it means nothing yet, in any direction", touchIntent(5, 5) === "pending" && touchIntent(7, 0) === "pending" && touchIntent(0, -7.9) === "pending")
check("a swipe up or down is vertical, wobble and all", touchIntent(3, -40) === "vertical" && touchIntent(-6, 230) === "vertical" && touchIntent(0, 9) === "vertical")
check("forty five degrees is a scroll, not a drag", touchIntent(20, 20) === "vertical")
check("level, or up to thirty degrees off it, is a drag", touchIntent(12, 0) === "horizontal" && touchIntent(-10, 3) === "horizontal" && touchIntent(100, 36) === "horizontal" && touchIntent(100, 57) === "horizontal")
check("just past thirty degrees is not", touchIntent(100, 59) === "vertical")
check("a finger and a pen wait; a mouse does not", waitsForIntent("touch") && waitsForIntent("pen") && !waitsForIntent("mouse"))
check("with no scroll heard, a tap counts", scrolledRecently(1e9) === false)

console.log("\nThe controls")
const slider = readCode("components/website-builder/editor/slider-number-control.tsx")
const gradient = readCode("components/website-builder/editor/gradient-editor.tsx")
const focal = readCode("components/website-builder/editor/controls/focal-point-control.tsx")
check("the slider row and the slider are touch-action pan-y, not none", /data-slider-row="" className="flex-1 relative py-2 -my-2 touch-pan-y select-none"/.test(slider) && /className="wb-black-slider touch-pan-y"/.test(slider) && !/touch-none/.test(slider))
check("  a finger is held until it has gone sideways, and the drag starts from where it came down", /if \(waitsForIntent\(e\.pointerType\)\) \{\s*watchScrolls\(\)\s*waiting = \{ pointerId: e\.pointerId, x: e\.clientX, y: e\.clientY \}\s*return/.test(slider) && /if \(intent === "horizontal"\) begin\(e\.pointerId, w\.x, e\.clientX\)/.test(slider))
check("  a tap on the track moves the thumb, but not straight after a scroll", /if \(e\.type !== "pointerup" \|\| scrolledRecently\(\)\) return/.test(slider) && /begin\(e\.pointerId, w\.x, w\.x\)/.test(slider))
check("  none of the pointer's events reach Radix, whose thumb follows any move on a held element", /if \(ours\.has\(e\.pointerId\)\) e\.stopPropagation\(\)/.test(slider) && /ours\.add\(e\.pointerId\)/.test(slider))
check("  the browser's own hold handed to the row is not the end of the drag", /if \(e\.type === "lostpointercapture" && e\.target !== wrap\)/.test(slider))
check("the gradient's handles wait for sideways too", /touch-pan-y select-none overflow-hidden rounded-xl/.test(gradient) && /if \(waitsForIntent\(e\.pointerType\)\) \{\s*waiting\.current = /.test(gradient) && /if \(intent === "vertical"\) return/.test(gradient))
check("the focal point too, and a tap still marks a point", /bg-muted touch-pan-y cursor-crosshair/.test(focal) && /if \(w && w\.pointerId === e\.pointerId && !scrolledRecently\(\)\) fromEvent\(e\)/.test(focal) && /if \(following\.current === e\.pointerId\) fromEvent\(e\)/.test(focal))

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed ? 1 : 0)
