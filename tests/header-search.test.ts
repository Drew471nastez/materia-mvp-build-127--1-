/**
 * ===========================================================================
 *  THE SEARCH THE EDITOR SHOWED CORRECT AND THE SITE SHOWED BROKEN
 * ===========================================================================
 * Reported from a published site with a picture: the field stuck to the top
 * of a tall header, its own magnifier floating below its bottom edge, and
 * the close button below that again. Nothing lined up with anything.
 *
 * Two rules, one bug.
 *
 * THE PANEL WAS GIVEN THE HEADER'S VERTICAL PADDING. `innerStyle` carries
 * it, and it was spread onto the panel's row as an inline style, where it
 * quietly beat the `py-2` class beside it. That padding is a DIFFERENT
 * NUMBER in the two places the header renders: in the editor the header is
 * drawn for one device and the padding is on the row, so the panel got it
 * too and the field was laid out inside it; published, both shells are
 * rendered and each carries its own padding, so the panel's row gets none
 * and the field was laid out against the header's whole height. The editor
 * was right and the site was wrong, which is why it shipped.
 *
 * AND THE FIELD WAS STRETCHED AND THEN TRIMMED. `align-self: stretch` with
 * `max-height: 44px` lays the box out at the row's height and clamps it —
 * from the bottom, because a stretched item keeps its start edge. In a 60px
 * header that is invisible. In a 104px header the field is a 44px box at the
 * top while the magnifier, positioned at 50% of the form that really did
 * stretch, and the close button, centred in the row, both sit 30px below it.
 *
 * Measured by scripts/check-header-search.mjs, which opens the search in
 * three headers at two widths and reads where the three things actually are:
 *
 *     36px tall — field 676x28, middles: header 12, field 12, icons 12
 *     68px tall — field 676x44, middles: header 124, field 124, icons 124
 *    116px tall — field 676x44, middles: header 276, field 276, icons 276
 *
 * With the old rules back, the 116px header puts the field's middle at 240
 * and both icons at 276: 36px apart, which is the picture that was sent.
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
  const header = read("components/website-builder/sections/renderers/HeaderSection.tsx")
  /* The panel only, so a rule about it cannot be satisfied by the header's
     own row further down the file. */
  const start = header.indexOf("function HeaderSearchPanel(")
  const panel = start < 0 ? "" : header.slice(start, header.indexOf("\nfunction ", start + 10))

  console.log("\nThe panel is a layer over the header, not a copy of its box")

  check("it is there to read", panel.length > 0)
  check(
    "the header's vertical padding is not applied to the panel's row",
    /style=\{\{ \.\.\.innerStyle, paddingTop: 0, paddingBottom: 0, \.\.\.widthStyle \}\}/.test(panel),
    "it is a different number published from in the editor, which is why one was right and the other was not",
  )
  check(
    "and nothing is relying on a padding class beside an inline style",
    !/paddingClass[^\n]*py-2/.test(panel),
    "an inline style beats a class silently",
  )

  console.log("\nOne answer to where the middle is")

  check(
    "the row centres what is in it",
    /max-w-\[720px\] items-center gap-2/.test(panel),
    "items-stretch is what put the field at the top and left the icons in the middle",
  )
  /* On the class attributes, not on the prose: the note above the row says
     the word "items-stretch" while explaining why it is gone. */
  check(
    "and nothing stretches any more",
    !/className="[^"]*self-stretch/.test(panel) && !/className="[^"]*items-stretch/.test(panel),
  )
  check(
    "the field's height is the form's, capped and clamped to the room there is",
    /style=\{\{ height: "min\(44px, calc\(100% - 8px\)\)" \}\}/.test(panel),
    "44px in a roomy header, less in a tight one, and never taller than the header",
  )
  check(
    "and the input simply fills it",
    /className="hdr-search-field h-full w-full bg-transparent outline-none"/.test(panel),
  )
  check(
    "with no height floor or ceiling left on the input",
    !/maxHeight: 44/.test(panel) && !/minHeight: 40/.test(panel),
    "two boxes deciding one height is how this went wrong three times",
  )
  check(
    "the magnifier is positioned against the form, which is now the field",
    /absolute right-1 top-1\/2 -translate-y-1\/2/.test(panel),
  )
  check("and the close button is centred in the same row", /shrink-0 self-center/.test(panel))

  console.log("\nAnd it goes away when you press past it")

  check(
    "what is ours is the search, not the header it is drawn on",
    /if \(barRef\.current\?\.contains\(el\)\) return/.test(panel)
      && /if \(listRef\.current\?\.contains\(el\)\) return/.test(panel)
      && !/if \(el && panelRef\.current\?\.contains\(el\)\) return/.test(panel),
    "the panel is `absolute inset-0`, so asking about the panel meant the whole header counted as the search and pressing the empty band beside the field did nothing",
  )
  check(
    "the two boxes that are ours carry the refs",
    /<div ref=\{barRef\} className="relative mx-auto flex h-full w-full max-w-\[720px\]/.test(panel)
      && /<div ref=\{listRef\}/.test(panel),
  )
  check(
    "it is still the press, not the click",
    /document\.addEventListener\("pointerdown", onDown\)/.test(panel)
      && /document\.removeEventListener\("pointerdown", onDown\)/.test(panel),
    "a drag that starts on the field and ends on the page is a selection, not a dismissal",
  )
  check(
    "the way out is nearly as long as the way in, and not an ease-in",
    /: "opacity 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\), transform 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\)"/.test(panel),
    "160ms of ease-in accelerates into the disappearance, which reads as a cut",
  )
  check(
    "and a closed panel does not keep the caret",
    /if \(active && panelRef\.current\?\.contains\(active\)\) active\.blur\(\)/.test(panel),
    "focus was left in a field at opacity zero that takes no input",
  )

  console.log("\nAnd the probe measures the case a visitor sees")

  const probe = read("scripts/render-header-search.tsx")
  check(
    "the harness renders the header with no deviceMode",
    !/deviceMode:/.test(probe),
    "with one it takes the editor's path, which was never the broken one",
  )
  check("at three header heights", /const section = \(id: string, pad: number\)/.test(probe))
  const checker = read("scripts/check-header-search.mjs")
  check("and the checker reads all three middles", /the magnifier sits at/.test(checker))
  check(
    "and tries the three presses a person makes",
    /pressing the field itself closed the search/.test(checker)
      && /pressing the empty header beside the field/.test(checker)
      && /pressing the page below left the search open/.test(checker),
  )
  check(
    "with the fades turned off first, because a virtual clock does not run them",
    /transition: none !important/.test(read("scripts/header-search-page.js")),
    "an open panel mid-fade reads as opacity 0, and the first version of this called that closed",
  )

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}
main()
