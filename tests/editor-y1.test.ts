/**
 * ===========================================================================
 *  Y1: LEAVING IN THE CANVAS, SWITCHING WITHOUT GLITCHES, FIELDS THAT WRAP
 * ===========================================================================
 * The pure parts and the shape of the code for three asks from the owner
 * about the website builder's editor. The motion and the geometry are
 * measured in Chromium by scripts/check-editor-exit.mjs,
 * scripts/check-view-switch.mjs and scripts/check-sidebar-fields.mjs; this
 * holds what can be checked without a browser:
 *
 *   MORPH    (round Z1, replacing Y1's edge strips) the card's own frames,
 *            from the old box to the new one, corners and lift with it
 *   SWITCH   the editor reads the card and the sidebar once before the change
 *            and plays each from there
 *   FIELDS   the sidebar's text controls wrap rather than scroll sideways
 *
 * Run with:  npx tsx tests/editor-y1.test.ts
 */
import { readCode, readSource } from "./_source"
import { morphFrames, type CardLook } from "@/lib/website-builder/canvas-switch"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label)
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}

console.log("\nMORPH: the card itself goes from the old box to the new one (round Z1)")
{
  /*
    Changed on purpose (round Z1). Y1 carried the card's edges with strips of
    white and of the shelf laid over it; the owner found that "glitchy ...
    flashy ... not accurate" and asked for the switch "like how it was before
    a long time ago": the card's own box changing shape, the page flowing
    with it. The strips are gone; what the strips promised (from the old box,
    to the new one, nothing in between left over) is now asked of the card's
    own frames.
  */
  const desktop: CardLook = { width: 1134, height: 846, radius: "20px 20px 0px 0px", shadow: "none" }
  const phone: CardLook = { width: 390, height: 798, radius: "16px", shadow: "rgba(0, 0, 0, 0.06) 0px 0px 0px 1px" }
  const frames = morphFrames(desktop, phone)
  check("two frames: where it was and where it goes", frames.length === 2, frames)
  check("from the old box, to the new one", frames[0].width === "1134px" && frames[0].height === "846px" && frames[1].width === "390px" && frames[1].height === "798px", frames)
  check("its corners and its lift go with it, one object", frames[0].borderRadius === desktop.radius && frames[1].borderRadius === phone.radius && frames[0].boxShadow === "none" && frames[1].boxShadow === phone.shadow)
  check("held centred, never shrunk by its row or capped by its own max-width on the way", frames.every((f) => f.alignSelf === "center" && f.flexShrink === "0" && f.maxWidth === "none"))
  const odd = morphFrames({ ...desktop, width: 1000.333 }, { ...phone, width: 390.06 })
  check("sizes are written to a tenth of a pixel", odd[0].width === "1000.3px" && odd[1].width === "390.1px", odd)
}

console.log("\nSWITCH: read once at the press, played from there")
{
  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const lib = readCode("lib/website-builder/canvas-switch.ts")
  const css = readCode("app/globals.css")
  /* Changed on purpose (round AX, the owner: "it flashes, it glitches, it bumps, it disappears, it fades"). The switch is one view transition: the browser takes a picture of the card and the sidebar before the change, lays the page out once at its new size, and morphs picture into page. Never a page laid out a frame at a time, never a blank card, never a fade to nothing. */
  check("the switch is a view transition over the card and the sidebar, committed at once inside it",
    /doc\.startViewTransition\(\(\) => \{\s*flushSync\(apply\)/.test(editor) && /card\.style\.setProperty\("view-transition-name", "wb-canvas"\)/.test(editor) && /fold\?\.style\.setProperty\("view-transition-name", "wb-sidebar"\)/.test(editor))
  check("the size switch, the full screen button and Escape all go through it",
    /onClick=\{\(\) => switchCanvas\(\(\) => go\(next\.key\)\)\}/.test(editor) && /onClick=\{\(\) => switchCanvas\(\(\) => toggleCanvasFullScreen\(!fullView\)\)\}/.test(editor) && /switchCanvas\(\(\) => setFullScreen\(false\)\)/.test(editor))
  check("only the card and the sidebar are pictured, not the whole page", /html\[data-wb-view-switch\] \{\s*view-transition-name: none;/.test(css))
  check("the names are taken off when it ends, ok or not", /\.finished\.then\(done, done\)/.test(editor) && /card\.style\.removeProperty\("view-transition-name"\)/.test(editor))
  check("no fade to nothing, no page pinned, no frame by frame morph left in the editor", !/canvasFadeOut|CANVAS_FADE_OUT_MS|pinCanvasPage|playCardMorph|playSidebarFold/.test(editor))
  check("the card is never slid or dimmed (the old glide is gone), and no strips are laid over it", !/translateX\(\$\{fullView \? by : -by\}px\)/.test(editor) && !/opacity: 0\.55, transform: "scale\(0\.985\)"/.test(editor) && !/playCardEdges|data-wb-switch-edge/.test(editor + lib))
  check("no CSS transition on the card's size", /"wb-canvas-frame relative overflow-hidden transition-opacity duration-300"/.test(editor))
  check("reduced motion, a hidden tab or no view transitions: it changes at once", /if \(!card \|\| calm \|\| typeof doc\.startViewTransition !== "function" \|\| document\.visibilityState !== "visible"/.test(editor))
}

console.log("\nFIELDS: the sidebar's text never scrolls sideways")
{
  const rich = readCode("components/website-builder/rich-text-field.tsx")
  const inline = readCode("components/website-builder/editor/controls/inline-richtext-control.tsx")
  const area = readCode("components/website-builder/auto-textarea.tsx")
  check("rich text wraps a long word or address", /min-w-0 overflow-y-auto overflow-x-hidden \[overflow-wrap:anywhere\]/.test(rich))
  check("its toolbar wraps onto a second line in the sidebar instead of scrolling", /page \? "max-sm:px-1 max-sm:py-0\.5" : "flex-wrap"/.test(rich))
  /* The chip is the shared pill now (value-pills.ts), used by every text box. */
  check("a value chip never runs past the field", /white-space:nowrap;max-width:100%/.test(readCode("components/website-builder/value-pills.ts")) && /pillHtml\(expr\.trim\(\)\)/.test(rich))
  check("an inline heading wraps rather than scrolling (it was one line that scrolled sideways)", /whitespace-normal \[overflow-wrap:anywhere\] overflow-x-hidden/.test(inline) && !/whitespace-nowrap overflow-x-auto/.test(inline))
  check("and Enter still adds no second line", /if \(e\.key === "Enter"\) \{\s*e\.preventDefault\(\)/.test(inline))
  check("a textarea wraps too", /w-full min-w-0 resize-none overflow-x-hidden \[overflow-wrap:anywhere\]/.test(area))
}

console.log("\nCOPY")
{
  const files = ["lib/website-builder/canvas-switch.ts", "lib/website-builder/exit-hold.ts", "scripts/check-view-switch.mjs", "scripts/check-sidebar-fields.mjs", "scripts/render-sidebar-fields-probe.tsx", "scripts/check-editor-exit.mjs"]
  /* Spelled in pieces so this file does not hold them. "transform" is a CSS property in these files, not a claim, so it is not on this list. */
  const banned = new RegExp(["\\u2014", "un" + "lock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less", "super" + "charge"].map((w) => (w.startsWith("\\") ? w : `\\b${w}`)).join("|"), "i")
  const bad = files.filter((f) => banned.test(readSource(f)))
  check("no em dash and no banned word in the files this round wrote", bad.length === 0, bad)
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) {
  console.log(failures.map((f) => `  - ${f}`).join("\n"))
  process.exit(1)
}
