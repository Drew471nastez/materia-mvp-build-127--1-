/**
 * ===========================================================================
 *  DRAGGING SECTIONS AND BLOCKS IN THE SIDEBAR, ROUND 1023
 * ===========================================================================
 * The owner: drag and drop like Shopify's theme editor. The rows move aside
 * as a section (or a block, nested blocks too) is carried, it follows the
 * pointer, the list scrolls near its edges, only valid places take it, the
 * drop settles and the canvas shows the new order at once, the keyboard can
 * do it, and it is smooth with a mouse, a finger and a trackpad.
 *
 * The engine is controls/use-reorder.ts, which already did most of that
 * (it replaced dnd-kit because dnd-kit waited 220ms before a finger counted).
 * This round it follows any scroll (a trackpad under a held row), Escape
 * puts the row back, the grip's listeners always come off, and a screen
 * reader hears each pick up, move and drop. scripts/check-sidebar-dnd.mjs
 * drags the real sections list and block tree in Chromium and measures
 * frame times, displacement, the drop order and the canvas order.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const hook = read("components/website-builder/editor/controls/use-reorder.ts")
const list = read("components/website-builder/editor/sections-list.tsx")
const tree = read("components/website-builder/editor/block-tree-rows.tsx")
const blockList = read("components/website-builder/editor/section-block-list.tsx")
const editor = read("app/website-builder/editor/[installId]/page.tsx")

console.log("\nTHE ROWS MOVE ASIDE, THE ROW FOLLOWS THE POINTER")
{
  check("the rows a held row passes slide one slot, by transform", /if \(to > d\.from && i > d\.from && i <= to\) y = -shift/.test(hook) && /else if \(to < d\.from && i < d\.from && i >= to\) y = shift/.test(hook) && /const SLIDE = "transform 200ms cubic-bezier\(0\.2, 0, 0, 1\)"/.test(hook))
  check("the held row is placed under the pointer each frame, not rendered", /me\.style\.transform = `translate3d\(\$\{side\.x\}px, \$\{top - mine\.top\}px, 0\)`/.test(hook) && /requestAnimationFrame\(tick\)/.test(hook))
  check("  lifted above the rest with a shadow", /wb-drag-lift bg-white/.test(list) && /lifted && "bg-white shadow-\[0_6px_20px_rgba\(0,0,0,0\.12\)\]"/.test(tree))
  check("the drop renders at once and glides into its slot", /flushSync\(\(\) => \{/.test(hook) && /d\.el\.animate\(/.test(hook))
}

console.log("\nANY SCROLL CARRIES THE ROW: THE EDGE, A TRACKPAD, A WHEEL")
{
  check("near an edge the scroller scrolls", /const EDGE = 56/.test(hook) && /if \(d\.scroller\) d\.scroller\.scrollTop \+= speed/.test(hook))
  check("every frame compares the scroll with the last one seen", /const at = scrollTopOf\(d\.scroller\)\s*\n\s*const moved = at - d\.scrollAt/.test(hook) && /d\.lastY \+= moved/.test(hook))
  check("  and a pointer move resets it, so nothing is counted twice", /d\.lastY = ev\.clientY \+ at\s*\n\s*d\.scrollAt = at/.test(hook))
  check("  starting from where the scroller was when the row was picked up", /scrollAt: scroll,/.test(hook))
}

console.log("\nESCAPE, AND A DRAG THAT ALWAYS ENDS CLEAN")
{
  check("Escape while held puts the row back and saves nothing", /if \(ev\.key !== "Escape"\) return[\s\S]{0,120}finish\(false\)/.test(hook) && /window\.addEventListener\("keydown", live\.current\.onKey, true\)/.test(hook))
  check("  the listener comes off however the drag ends", /window\.removeEventListener\("keydown", d\.onKey, true\)/.test(hook))
  check("the grip's own listeners come off too, Escape included", /d\.detach\(\)/.test(hook) && /live\.current\.detach = \(\) => \{/.test(hook))
}

console.log("\nHEARD AS WELL AS SEEN")
{
  check("one polite live region for every list", /region\.setAttribute\("role", "status"\)/.test(hook) && /region\.setAttribute\("aria-live", "polite"\)/.test(hook) && /export function announceReorder\(/.test(hook))
  check("picked up, moved, put back, in and out a level", ["Picked up {name}, position {n} of {total}", "Moved {name} to position {n} of {total}", "{name} put back at position {n} of {total}", "Moved {name} in a level", "Moved {name} out a level"].every((w) => hook.includes(`tt("${w}"`)))
  check("  the arrow keys say where the row went", /announceReorder\(tt\("Moved \{name\} to position \{n\} of \{total\}", \{ name: said\(index\), n: to \+ 1, total: countRef\.current \}\)\)\s*\n\s*onMoveRef\.current\(index, to\)/.test(hook))
  check("each list names its rows: sections, blocks, the block tree", /nameOf: \(i\) => \(bodyRef\.current\[i\] \? nameOf\(bodyRef\.current\[i\]\) : ""\)/.test(list) && /nameOf: \(i\) => \(blocksRef\.current\[i\] \? title\(blocksRef\.current\[i\]\)\.name : ""\)/.test(blockList) && /nameOf: \(i\) => \{\s*\n\s*const b = blocksRef\.current\[i\]/.test(tree))
  for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
    const cat = read(`lib/i18n/catalog/${lang}.ts`)
    check(`  in ${lang}`, ["Picked up {name}, position {n} of {total}", "Moved {name} to position {n} of {total}", "{name} put back at position {n} of {total}", "Moved {name} in a level", "Moved {name} out a level"].every((w) => cat.includes(JSON.stringify(w) + ":")))
  }
}

console.log("\nONLY WHERE IT MAY GO")
{
  check("the page's own sections drag; the header, footer and overlay groups do not", /<div ref=\{listRef\} data-section-drag-list="">/.test(list) && /fixed\s*\n\s*index=\{0\}/.test(list))
  check("  so the editor moves a section inside the page's own group", /arrayMove\(g\.template, oldIdx, newIdx\)/.test(editor))
  check("a static block has no grip and is not a row of the drag", /data-reorder-row=\{still \? undefined : ""\}/.test(tree) && /\{still \? \(\s*<span aria-hidden/.test(tree))
  check("a block goes in or out a level only where the page allows that type", /nest: canNest && onNest \? \{ step: TREE_STEP, can: canNest, onNest \} : undefined/.test(tree) && /if \(!n\.can\(d\.from, dir\)\)/.test(hook))
  check("each level of blocks is its own list, so a nested block moves among its siblings", /:scope > \[data-reorder-row\]/.test(hook))
}

console.log("\nTHE CANVAS FOLLOWS, NO RELOAD")
{
  check("a drop is the editor's state, which the canvas draws", /dnd=\{\{ onReorder: reorderSection \}\}/.test(editor) && /setSections\(prev => \{\s*\n\s*\/\* The page's own sections move/.test(editor))
  check("  one undo step for a drop, none for a drop where it started", /if \(fromId === toId\) return[\s\S]{0,200}pushUndo\(\)/.test(editor))
  check("a block drop too", /onReorder=\{\(next\) => ops\.reorder\(next, parentKey\)\}/.test(editor))
}

console.log("\nA MOUSE, A FINGER, A TRACKPAD")
{
  check("pointer events with the grip owning its finger", /setPointerCapture\(e\.pointerId\)/.test(hook) && /style: \{ touchAction: "none" \} as React\.CSSProperties/.test(hook))
  check("  and the phone sheet does not move under it", /"data-sheet-no-drag": ""/.test(hook))
}

console.log("\nMEASURED")
{
  const probe = read("scripts/check-sidebar-dnd.mjs")
  check("the probe drags the real list and tree at 1280 with a mouse and 390 with a finger", /SectionsList/.test(read("scripts/render-sidebar-dnd.tsx")) && /BlockTreeLevel/.test(read("scripts/render-sidebar-dnd.tsx")) && /width: 1280/.test(probe) && /width: 390/.test(probe))
  check("  frame times, displacement, the order, the canvas, Escape, the keyboard", ["frame", "slid aside", "canvas", "Escape", "Arrow"].every((w) => probe.includes(w)))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
