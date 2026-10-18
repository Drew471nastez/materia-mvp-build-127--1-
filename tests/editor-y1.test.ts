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
 *   EDGES    the strips that carry the card's edges between two boxes:
 *            white going narrower, the shelf's grey going wider, each shrinking
 *            toward where the edge now is, never overlapping
 *   SWITCH   the editor reads the card's box once before the change, moves
 *            only the sidebar or the edges, and animates no radius or shadow
 *   FIELDS   the sidebar's text controls wrap rather than scroll sideways
 *
 * Run with:  npx tsx tests/editor-y1.test.ts
 */
import { readCode, readSource } from "./_source"
import { CARD_WHITE, SHELF_GREY, edgeStrips, type Box } from "@/lib/website-builder/canvas-switch"

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

console.log("\nEDGES: the card's edges carried from the old box to the new one")
{
  /* The desktop card, flush in a 1134 x 846 canvas, and the phone card centred in it. */
  const desktop: Box = { left: 0, top: 0, right: 1134, bottom: 846 }
  const phone: Box = { left: 372, top: 24, right: 762, bottom: 822 }

  const narrower = edgeStrips(desktop, phone)
  const side = (list: ReturnType<typeof edgeStrips>, s: string) => list.find((x) => x.side === s)
  const l = side(narrower, "left")
  const r = side(narrower, "right")
  const t = side(narrower, "top")
  const b = side(narrower, "bottom")
  check("going to the phone: four strips of the card's own white", narrower.length === 4 && narrower.every((x) => x.color === CARD_WHITE), narrower)
  check("the side strips fill from the old edge to the new one, the full height", !!l && l.left === 0 && l.width === 372 && l.top === 0 && l.height === 846 && !!r && r.left === 762 && r.width === 372)
  check("and shrink inward, toward where the edge is now", l?.origin === "right" && r?.origin === "left" && l.axis === "x")
  check("the top and bottom ones are only as wide as the phone, so nothing overlaps", !!t && t.left === 372 && t.width === 390 && t.height === 24 && t.origin === "bottom" && !!b && b.top === 822 && b.height === 24 && b.origin === "top")

  const wider = edgeStrips(phone, desktop)
  const wl = side(wider, "left")
  const wr = side(wider, "right")
  check("going to the desktop: strips of the shelf's grey over the new card", wider.length === 4 && wider.every((x) => x.color === SHELF_GREY), wider)
  check("which shrink outward, toward the new edge", wl?.origin === "left" && wr?.origin === "right" && side(wider, "top")?.origin === "top" && side(wider, "bottom")?.origin === "bottom")
  check("covering exactly the room the card gained", !!wl && wl.left === 0 && wl.width === 372 && !!wr && wr.left === 762 && wr.width === 372)

  check("the same box twice: nothing to carry", edgeStrips(desktop, desktop).length === 0)
  /* A canvas narrowed by the sidebar coming back while on the phone: only the sides that moved. */
  const moved = edgeStrips({ left: 0, top: 0, right: 1428, bottom: 846 }, { left: 0, top: 0, right: 1134, bottom: 846 })
  check("an edge that did not move gets no strip", moved.length === 1 && moved[0].side === "right" && moved[0].color === CARD_WHITE && moved[0].width === 294)
  /* Rounded to a tenth of a pixel, as the stylesheet writes them. */
  const odd = edgeStrips({ left: 0.333, top: 0, right: 1000.25, bottom: 800 }, { left: 300.111, top: 0, right: 700.777, bottom: 800 })
  check("sizes are written to a tenth of a pixel", odd.every((x) => Number.isInteger(x.width * 10) && Number.isInteger(x.left * 10)), odd)
}

console.log("\nSWITCH: one layout, then only transforms")
{
  const editor = readCode("app/website-builder/editor/[installId]/page.tsx")
  const lib = readCode("lib/website-builder/canvas-switch.ts")
  check("the card's box is read once on the press, before the change", /const switchCanvas = useCallback\(\(apply: \(\) => void\) => \{\s*\n\s*switchFrom\.current = canvasFrameRef\.current\?\.getBoundingClientRect\(\) \?\? null\s*\n\s*apply\(\)/.test(editor))
  check("the size switch, the full screen button and Escape all go through it",
    /onClick=\{\(\) => switchCanvas\(\(\) => go\(next\.key\)\)\}/.test(editor) && /onClick=\{\(\) => switchCanvas\(\(\) => toggleCanvasFullScreen\(!fullView\)\)\}/.test(editor) && /switchCanvas\(\(\) => setFullScreen\(false\)\)/.test(editor))
  check("full screen moves the sidebar; a size change moves the edges", /playSidebarFold\(sidebarFoldRef\.current, sidebarRef\.current, fullView\)/.test(editor) && /playCardEdges\(host, from, frame\.getBoundingClientRect\(\)\)/.test(editor))
  check("the card is never slid or dimmed (the old glide is gone)", !/translateX\(\$\{fullView \? by : -by\}px\)/.test(editor) && !/opacity: 0\.55, transform: "scale\(0\.985\)"/.test(editor))
  check("and animates no radius or shadow: a repaint of the whole card on every frame", /"wb-canvas-frame relative overflow-hidden transition-opacity duration-300"/.test(editor))
  check("the motion is transform and opacity alone", /el\.animate\(\[\{ transform: "none" \}, \{ transform: gone \}\]/.test(lib) && /panel\.animate\(\[\{ transform: "none", opacity: 1 \}, \{ transform: to, opacity: 0 \}\]/.test(lib) && !/width:.*animate|animate\([^)]*(width|left|height)/.test(lib))
  check("reduced motion: nothing moves", (lib.match(/if \(reduced\(\) \|\|/g) ?? []).length === 2)
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
