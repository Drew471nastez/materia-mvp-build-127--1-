/**
 * ===========================================================================
 *  THE EDITOR'S SHEET IS READ AND PRESSED WITH A THUMB
 * ===========================================================================
 * Every control in it was drawn for the desktop sidebar: 9px labels in
 * capitals, 36px fields, 12px type, a 21px slider thumb, and an empty image
 * box with the aspect of a video — about 200px of dashed nothing in a sheet
 * that shows 500.
 *
 * Measured at 390x844 by scripts/check-sheet-controls.mjs:
 *
 *     text field    44px tall, 16px type
 *     number box    40px tall, 72px wide, 16px type
 *     label         14px
 *     slider        row 44px, track 6px, thumb 28px
 *     image box     56px, hint hidden
 *
 * 44 is the smallest thing a finger hits reliably, and 16 is the size under
 * which iOS zooms the page for a focused field and does not zoom back. Both
 * are why those two numbers and not others.
 *
 * This pins the rules; the probe measures what they produce.
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
  const css = read("app/globals.css")
  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  const panels = read("components/website-builder/editor/design-panels.tsx")
  const sheet = read("components/website-builder/mobile-editor-sheet.tsx")
  const picker = read("components/website-builder/editor/image-picker.tsx")

  /* The whole block, so "scoped to the sheet" can be checked rather than assumed. */
  const start = css.indexOf("THE EDITOR'S SHEET IS READ AND PRESSED WITH A THUMB")
  /**
   * To the end of the `@media` this lives in, found by counting brackets.
   *
   * It used to be "to the end of the file", which was true exactly as long as
   * nothing else was ever appended to globals.css. The first thing appended
   * after it — the panel move in the sheet — was then read as part of this
   * block and judged against rules written for a different thing.
   */
  const block = start < 0 ? "" : (() => {
    const rest = css.slice(start)
    const open = rest.indexOf("{")
    if (open < 0) return rest
    let depth = 0
    for (let i = open; i < rest.length; i++) {
      if (rest[i] === "{") depth++
      else if (rest[i] === "}") { depth--; if (depth === 0) return rest.slice(0, i + 1) }
    }
    return rest
  })()

  console.log("\nSized for a thumb, and only in the sheet")

  check("the block is there", block.length > 0)
  check(
    "it is behind the phone breakpoint",
    /@media \(max-width: 639px\)/.test(block),
    "the sidebar keeps the scale that is right for it",
  )
  check(
    "and every rule is scoped to the sheet",
    (block.match(/^\s{2}\[data-mobile-bottom-sheet\]/gm) ?? []).length >= 8 &&
      !/^\s{2}(input|label|select|textarea)\b/m.test(block),
    "an unscoped rule here reaches the canvas and the site being built",
  )
  check("anything typable is 44 and 16", /min-height: 44px;\s*\n\s*font-size: 16px;/.test(block))
  check("the slider's row is 44, not its track", /min-height: 44px;\s*\n\s*padding-block: 12px;/.test(block))
  check("the thumb is 28", /\[data-slot="slider-thumb"\] \{\s*\n\s*width: 28px;/.test(block))
  check(
    "the image box is a row with a floor, not a height",
    /min-height: 56px;\s*\n\s*flex: none;/.test(block),
    "a flex child with a height and min-height 0 shrinks to its content; the first version measured 36px",
  )
  check(
    "and the drag-and-drop hint is not shown to a thumb",
    /\.wb-dropzone > p \+ p \{[\s\S]{0,40}display: none;/.test(block),
    "the probe reads its computed display; this is only the rule that sets it",
  )
  check("the dropzone carries the class the rules need", /"wb-dropzone relative w-full rounded-lg border-2 border-dashed/.test(picker),
    "the picker is its own module now; the rules still size this element")
  check(
    "and the slider the rules size is the one the editor uses",
    /import \{ SliderNumberControl \} from "@\/components\/website-builder\/editor\/slider-number-control"/.test(editor),
    "it lives in its own module so the frame probe drives the same code the product does",
  )

  console.log("\nAnd it answers a finger")

  check(
    "the sheet taps when it opens",
    /if \(open && !wasOpen\.current\) hapticTap\("light"\)/.test(sheet),
  )
  check(
    "on the way in only",
    /wasOpen\.current = open/.test(sheet) && !/hapticTap\("light"\)\s*\n\s*\}\s*\n\s*if \(!open\)/.test(sheet),
    "a sheet closing is the result of something already felt",
  )
  check(
    "and a slider does not tap at all",
    !/hapticTap/.test(read("components/website-builder/editor/slider-number-control.tsx")),
    "a tick per step crossed sounded right and is not: a drag crosses a lot of steps, the taps run into each other, and you are already watching the number",
  )
  check(
    "through the one function that reaches the Taptic Engine",
    /import \{ hapticTap \} from "@\/lib\/native-bridge"/.test(sheet) &&
      /export function hapticTap/.test(read("lib/native-bridge.ts")),
  )

  console.log("\nAnd a gradient is edited, not typed")

  check(
    "a gradient setting opens the gradient editor",
    /kind === "text" && \/gradient\/i\.test/.test(editor) && /<GradientEditor/.test(editor),
    "there is no gradient kind in the schema, so every one of them arrived as a box of CSS",
  )
  check(
    "matched on the field's name, so an empty one gets it too",
    /String\(field\.id \?\? ""\) \+ " " \+ String\(field\.label \?\? ""\)/.test(editor),
    "matching on the value would give the box to the one case that needs the editor most",
  )
  check("and it is the editor the colour schemes already use", /from "@\/components\/website-builder\/editor\/gradient-editor"/.test(editor))

  console.log("\nThe colour scheme swatch keeps its colour when a thumb touches it")

  /*
    THE SHEET CLEARS A HOVERED BACKGROUND, and on a phone `:hover` stays on
    the last element tapped. The rule already spares anything that sets its
    own background through a class. The scheme picker sets its own through a
    STYLE ATTRIBUTE, because the colour is data rather than a utility, and
    `!important` beats an inline style: tapping the swatch cleared it to
    nothing and it stayed cleared. Reported as the colour scheme going white
    and transparent out of nowhere.
  */
  check("the swatch paints itself from the scheme, inline, because a colour is data",
    /style=\{\{ background: active\.gradient \|\| active\.background, color: active\.heading \}\}/.test(panels))
  check("and the sheet's hover reset spares an element that painted itself that way",
    (css.match(/:not\(\[style\*="background"\]\)/g) ?? []).length === 4,
    "one for each of the four selectors: button and link, in the bottom sheet and the top one")
  check("while still clearing a background that exists only as a hover state",
    /\[data-mobile-bottom-sheet\] button:not\(\.wb-chip\):not\(\[style\*="background"\]\):not\(\[class\^="bg-"\]\)/.test(css),
    "the class tests are what draw that line, and they stay")

  console.log("\nThe three tabs are places, so the panel arrives from the side")

  /*
    Sections, Pages and Settings were all depth 0, so the direction between
    them subtracted to nothing and the panel was replaced with a cut: a heavy
    form appearing in a single frame. Going INTO a section already slid,
    which is why only the tab row read as glitchy.
  */
  check("each tab has the position it is drawn in",
    /const TAB_POSITION: Record<string, number> = \{ sections: 0, pages: 1, settings: 2 \}/.test(editor))
  check("a section's settings sit past all three, because they are not a fourth tab",
    /if \(key\.startsWith\("section:"\)\) return 10/.test(editor))
  check("and the tab row is read by the same function the slide already used",
    /const tab = key\.split\(":"\)\[0\]\s*\n\s*return TAB_POSITION\[tab\] \?\? 0/.test(editor))
  check("with the layer asked for before the slide starts, not during it",
    /\.wb-sheet-panel\[data-dir="in"\],\s*\n\.wb-sheet-panel\[data-dir="back"\] \{\s*\n\s*will-change: transform, opacity;/.test(css),
    "a layer promoted halfway through its own slide drops the frames it spends being promoted")

  console.log("\nReplace and Remove are one control, and uploading happens over the picture")

  check("the two answers share one bordered row, split down the middle",
    /<div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border">/.test(picker)
      && /border-l border-border text-\[13px\] font-medium transition-colors/.test(picker),
    "two outlined pills with a gap read as two separate decisions")
  check("at 44px for a thumb, and the sidebar's own size on a desktop",
    (picker.match(/flex h-11 items-center justify-center gap-1\.5[^"]*md:h-9/g) ?? []).length === 2)
  /*
    THE UPLOADING STATE USED TO BE A BOX OF ITS OWN. A spinner and the word
    Uploading, in the dashed empty dropzone, with no picture anywhere — so
    choosing an image made the panel go blank, then showed a spinner, then
    went blank again while the stored copy loaded, then popped.

    It is now the picture you chose with the spinner over it, which is both
    fewer states and the truthful one: the thing being uploaded is visible
    the entire time it is uploading. tests/image-picker.test.ts holds the
    detail and scripts/check-image-picker.mjs measures the sequence.
  */
  check("the spinner sits over the picture rather than in place of it",
    /\{uploading && \(\s*\n\s*<span className="absolute inset-0 z-10 flex items-center justify-center bg-white\/55">/.test(picker))
  check("and the dashed box has no uploading state left to get wrong",
    !/>Uploading</.test(picker),
    "there is nothing to lay out in 56px any more, because nothing is laid out there")
  /*
    It was set to 10, then 30, then 80, then 100 around a call that reports
    no progress at all, so it sat at 30 for the whole upload and jumped.
  */
  check("and it claims no percentage, because there was never one to claim",
    !/\{progress\}%/.test(picker) && !/setProgress/.test(picker),
    "a number that is not measured is worse than no number")
  check("the box cannot be re-opened while it is busy",
    /const pick = \(\) => \{ if \(!uploading\) inputRef\.current\?\.click\(\) \}/.test(picker)
      && /if \(uploading\) return; const f = e\.dataTransfer\.files\[0\]/.test(picker))

  console.log("\nA row with a label at each end does not wrap when the column is narrow")

  /*
    A flex item's `min-width` is `auto`, so it will not shrink below its own
    content: two of them in a row that has run out of width do not shrink,
    the text inside them wraps, and the row doubles in height. Reported as
    "Advanced" over "colors" beside "Using" over "scheme".

    scripts/check-panel-rows.mjs measures both markups at five widths and
    shows the old one wrapping at 220px and below. These are the classes
    that produce the measured result.
  */
  check("the name keeps its line and is not the thing that shrinks",
    /<span className="shrink-0 whitespace-nowrap font-medium text-foreground">Advanced colors<\/span>/.test(panels))
  check("the status beside it may shrink, and loses characters rather than lines",
    /<span className="flex min-w-0 items-center gap-2 text-\[12px\] text-muted-foreground">\s*\n\s*<span className="truncate">/.test(panels),
    "`min-w-0` is what lets a flex child shrink at all; without it `truncate` never fires")
  check("the chevron is never squeezed",
    /<ChevronDown className=\{cn\("h-3\.5 w-3\.5 shrink-0 transition-transform duration-200", customizeOpen && "rotate-180"\)\} \/>/.test(panels))
  check("and the row is a thumb's height on a phone, the sidebar's on a desktop",
    /className="w-full flex items-center justify-between gap-2 overflow-hidden px-3 h-11 md:h-10 text-sm"/.test(panels))
  check("the same shape one panel down got the same three rules",
    /<span className="min-w-0 truncate">Page colors<\/span>/.test(panels)
      && /h-3\.5 w-3\.5 shrink-0 text-muted-foreground transition-transform/.test(panels),
    "it had not been reported yet, which is not a reason to leave it")
  check("and the probe compares the two markups rather than asserting the new one looks fine",
    /the markup that was reported really does wrap, so this is measuring something/.test(read("scripts/check-panel-rows.mjs")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
