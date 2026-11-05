/**
 * ===========================================================================
 *  THE SHEET STAYS WHERE IT WAS PUT, AND THE COLOUR CONTROLS KEEP UP
 * ===========================================================================
 * Six reports, three causes.
 *
 *   "the mobile bottom sheet randomly becomes half, with no reason"
 *   "dragging the sliders left and right glitches the sheet and makes it half"
 *   "selecting something in an input makes the sheet become mid, randomly"
 *
 * One cause. A drag ended by writing the transform straight to the node and
 * keeping the offset in a ref; the render fell back to `openY`, the middle
 * stop, so the next render for any reason put it back there. The reasons are
 * constant in an editor: a slider value, a field taking focus, a keyboard
 * resizing the window. The settled stop is now state, and the effect that
 * moves the sheet reads the same answer the render draws.
 *
 * Sliders had a second cause of their own: the sheet arbitrates every touch
 * that lands on it, and a thumb dragging sideways is not sideways enough to
 * be handed back. `data-sheet-no-drag` is the sheet's own opt-out and the
 * slider now carries it.
 *
 *   "the darkening overlay applies direct and laggy"
 *
 * The scrim faded on the snap's curve, which puts more than half the
 * distance in the first fifth of the time. A fade wants its time spread
 * evenly.
 *
 *   "the colour customisers should be smooth and not lag"
 *
 * Every `pointermove` inside the picker rewrote a theme setting and
 * repainted the canvas — up to 240 a second on a phone. Coalesced to one a
 * frame.
 *
 *   "sometimes the colour scheme selector bugs and becomes fully white"
 *
 * A scheme's gradient was the one value in a scheme that was never checked.
 * A browser handed a background it cannot parse drops the declaration and
 * paints nothing, so a half-written gradient turned the picker into a white
 * box with the scheme's own heading colour still on the text — white on
 * white. It is validated now, like every colour beside it.
 *
 * Geometry is measured by scripts/check-sheet-rest.mjs. This pins the rules
 * and drives the one part that is pure: the scheme reader.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { normalizeScheme, themeColorSchemes, DEFAULT_COLOR_SCHEMES } from "@/lib/storelib-theme/color-schemes"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label + (detail ? ` — ${detail}` : "")); console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

function main() {
  const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
  const editor = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  const chip = read("components/website-builder/editor/color-chip.tsx")
  const gradient = read("components/website-builder/editor/gradient-editor.tsx")
  const css = read("app/globals.css")

  console.log("\nWhere the sheet is, is something React knows")

  check(
    "the settled stop is state, not only a ref",
    /const \[restIndex, setRestIndex\] = React\.useState<number \| null>\(null\)/.test(sheet),
    "a ref is invisible to a render, so every render put the sheet back at openY",
  )
  check(
    "the drag records where it landed",
    /setRestIndex\(nowOpen \? index : null\)/.test(sheet),
  )
  check(
    "as an index, so a resize cannot leave it at a stale pixel",
    /restIndex !== null && restIndex < offsets\.length\s*\n\s*\? offsets\[restIndex\]/.test(sheet),
    "the offsets are rebuilt whenever the window is, which on a phone is every keyboard",
  )
  /**
   * `held` rather than `dragging`, and `settleTick` in the effect's list.
   * A release now tells the page where the sheet went once the snap has
   * arrived rather than in the frame it starts (see "THE PAGE HEARS ABOUT A
   * RELEASE WHEN THE SHEET HAS ARRIVED" in the sheet), so for those few
   * hundred milliseconds the ref is the truth exactly as it is mid-drag, and
   * the effect runs once more when the settle finishes. What these pin is
   * unchanged: at rest the render and the effect both read `settledY`.
   */
  check(
    "the render draws the settled stop",
    /const held = dragging \|\| settle\.current\.active/.test(sheet) &&
      /const renderY = (waiting \? settledY : )?held \? drag\.current\.currentY : open \? settledY : closedY/.test(sheet),
  )
  check(
    "and the effect that moves the sheet reads the same answer",
    /const target = open \? settledY : closedY/.test(sheet) && /\}, \[open, settledY, closedY, settleTick\]\)/.test(sheet),
    "reading openY there is what moved a sheet back to half when a field took focus",
  )
  check(
    "a closed sheet forgets it",
    /setExpanders\(\[\]\)\s*\n\s*setRestIndex\(null\)/.test(sheet),
  )
  check(
    "a control asking for the full height still outranks it",
    /const lifted = expanders\.length > 0 \|\| keyboardHere/.test(sheet) && /lifted\s*\n\s*\? openY/.test(sheet),
    "it is asking because what it opened does not fit",
  )

  console.log("\nA slider's finger is the slider's")

  check(
    "the slider row opts out of the sheet's drag",
    /* Round AC3: pan-y, not none, so a vertical swipe that starts on a slider scrolls the panel. */ /<div data-sheet-no-drag data-slider-row="" className="flex-1 relative py-2 -my-2 touch-pan-y select-none">/.test(
      read("components/website-builder/editor/slider-number-control.tsx"),
    ),
    "the slider moved into its own module so a frame probe can drive the real one",
  )
  check(
    "and the sheet honours that opt-out at touchdown",
    /if \(ownsItsTouch\(e\.target, sheet, handleRef\.current\)\) return/.test(sheet) &&
      /node\.hasAttribute\("data-sheet-no-drag"\)\) return true/.test(sheet),
  )
  check(
    "the picker's two drag surfaces do too",
    (chip.match(/data-sheet-no-drag/g) ?? []).length >= 2,
    "the saturation box and the hue strip are both dragged",
  )

  console.log("\nThe scrim fades on a fade's curve")

  check("it has its own easing", /const FADE_EASING = "cubic-bezier\(0\.4, 0, 0\.2, 1\)"/.test(sheet))
  check("and its own duration", /const FADE_MS = 300/.test(sheet))
  check(
    "never longer than the movement it belongs to",
    /const fadeMs = \(ms: number\) => Math\.min\(ms, FADE_MS\)/.test(sheet),
  )
  check(
    "and it is not on the snap's curve any more",
    !/opacity \$\{[^}]*\}ms \$\{SNAP_EASING\}/.test(sheet),
    "SNAP_EASING puts half the distance in the first fifth of the time: direct, then laggy",
  )

  console.log("\nGoing into a section, and coming back")

  check("the panel plays a move, and it has a direction", /\.wb-sheet-panel\[data-dir="in"\]/.test(css) && /\.wb-sheet-panel\[data-dir="back"\]/.test(css))
  check("they are different moves", /@keyframes wb-panel-in/.test(css) && /@keyframes wb-panel-back/.test(css))
  /*
    AND FAR ENOUGH TO READ AS ONE. It was ten pixels, which across a panel
    the width of a phone is a nudge: what you saw was the old panel vanishing
    and the new one already in place, reported twice as the move back being
    "too direct". The numbers are pinned because the point of them is that
    they are not two or three.
  */
  check("far enough that the eye follows it",
    /translate3d\(26px, 0, 0\)/.test(css) && /translate3d\(-26px, 0, 0\)/.test(css))
  check("and long enough, without being a slide across the sheet",
    (css.match(/wb-panel-(in|back) 280ms/g) ?? []).length === 2)
  check("nothing moves when reduced motion is asked for", /prefers-reduced-motion: reduce\)\s*\{\s*\n\s*\.wb-sheet-panel\[data-dir="in"\]/.test(css))
  check(
    "the direction is a depth, taken when the panel changes",
    /panelDepth\(sidebarPanelKey\) - panelDepth\(panelMove\.current\.key\)/.test(editor),
  )
  check(
    "and only the sheet plays it, not the sidebar",
    (editor.match(/wb-sheet-panel/g) ?? []).length === 1,
    "on the desktop a panel swap is a cut on purpose: a slide on every click is a twitch",
  )

  console.log("\nThe colour controls keep up with a finger")

  check("there is one coalescer, shared", /export function useFrameCommit/.test(read("components/website-builder/editor/use-frame-commit.ts")))
  check("the picker uses it", /useFrameCommit\(onChange\)/.test(chip))
  check("the gradient uses it", /useFrameCommit\(onChange\)/.test(gradient))
  check(
    "a gesture ending flushes what is pending",
    /onPointerUp=\{flush\}/.test(chip),
    "a control that closes on release would leave its last value in a frame that never runs",
  )
  check(
    "the picker does not fight its own echo",
    /if \(sent\.current && value\.toLowerCase\(\) === sent\.current\.toLowerCase\(\)\) return/.test(chip),
    "every colour with v=0 is #000000, so reading it back threw the hue away",
  )

  console.log("\nThe gradient is touched, not typed")

  check(
    "no range sliders",
    !/type="range"/.test(gradient),
    "a range input in a bottom sheet is a thumb-width target that fights the sheet for the gesture",
  )
  check("no grid of preset rectangles", !/Start from/.test(gradient) && !/grid-cols-4/.test(gradient))
  check("the stops sit on the gradient and are dragged", /onPointerDown=\{onTrackDown\}/.test(gradient) && /grabbed\.current/.test(gradient))
  check("a press away from every colour does nothing", /if \(best > GRAB_WITHIN\) return/.test(gradient))
  check(
    "the direction is one button with eight answers, not a dial",
    /const TURN_BY = 45/.test(gradient) && /DIRECTION_NAME/.test(gradient) && !/role="slider"/.test(gradient),
    "a dial is precise about the one thing nobody needs to be precise about",
  )
  check("and it says which one it is on, in words", /DIRECTION_NAME\[Math\.round\(g\.angle \/ TURN_BY\) % 8\]/.test(gradient))
  check(
    "the bar shows the colour sequence, so a handle sits on the colour it carries",
    /serializeGradient\(\{ \.\.\.g, angle: 90 \}\)/.test(gradient),
    "at 135deg the colour under a handle was not the colour it was setting",
  )
  check("the presets are still exported for the toggle that starts one", /export const GRADIENT_PRESETS/.test(gradient))

  console.log("\nA string that is not a gradient is not a gradient")

  const base = DEFAULT_COLOR_SCHEMES.dark
  const keep = (g: string) => normalizeScheme({ gradient: g }, base).gradient
  check("a real one is kept", keep("linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)") === "linear-gradient(135deg, #0f172a 0%, #4c1d95 100%)")
  check("a radial one is kept", keep("radial-gradient(circle, #fff 0%, #000 100%)").startsWith("radial-gradient"))
  check("half-typed is refused", keep("linear-gradient(135deg, #0f172") === base.gradient, "the browser drops the declaration and paints nothing")
  check("a bare colour is refused", keep("#ffffff") === base.gradient)
  check("a stray bracket is refused", keep("linear-gradient(135deg, #000 0%, #fff 100%))") === base.gradient)
  check("something after the gradient is refused", keep("linear-gradient(1deg, #000 0%, #fff 100%) evil") === base.gradient)
  check("a url inside one is refused", keep("linear-gradient(1deg, url(https://example.com/a.png), #fff 100%)") === base.gradient)
  check("and so is anything carrying a semicolon or a brace", keep("linear-gradient(1deg, #000 0%, #fff 100%); }") === base.gradient)
  check("an empty string still clears the base's gradient", normalizeScheme({ gradient: "" }, base).gradient === "")

  /* The white box, from the top: a theme carrying a broken gradient. */
  const schemes = themeColorSchemes({ color_schemes: { dark: { gradient: "linear-gradient(135deg, #0f172" } } })
  check(
    "a theme saved with a broken gradient still paints its scheme",
    (schemes.dark.gradient || schemes.dark.background) === (base.gradient || base.background),
    "this is the empty white box the scheme picker became",
  )
  check("and the rest of that scheme is untouched", schemes.dark.heading === base.heading)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
