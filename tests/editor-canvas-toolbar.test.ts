/**
 * ===========================================================================
 *  THE TOOLBAR OVER A BLOCK, AND ADD SECTION ON AN IMPORTED THEME, ROUND 1023
 * ===========================================================================
 * The owner:
 *
 *   "The floating toolbar over a selected BLOCK (a price block inside a
 *   product information section): Move up and Move down move the whole
 *   section instead of the block." Duplicate, Hide and Delete the same.
 *
 *   "Imported themes are missing the hover + Add section between sections."
 *
 * Measured on the real editor by scripts/check-canvas-toolbar.mjs; what is
 * held here:
 *
 *   STEP      a block steps past its nearest neighbour that can move, in its
 *             own list; a static block never moves and stays in its place;
 *             a header link's dropdown items move among themselves
 *             (block-tree.ts, stepBlock)
 *   TOOLBAR   with a block selected the toolbar's buttons are the block's
 *   PLACE     a place pointed at between two sections lands between them,
 *             in the page's content or in its group (section-order.ts,
 *             insertPlaceBetween)
 *   STRIP     the imported theme's frame draws the strip itself, on the
 *             editor's look and its 200ms ease, and costs the page no height
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { blockSteps, stepBlock } from "@/lib/website-builder/block-tree"
import { bodyGapToListIndex, insertPlaceBetween } from "@/lib/website-builder/section-order"
import { CANVAS_BRIDGE } from "@/lib/storelib-theme/compat/canvas-bridge"
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const b = (id: string, extra: Partial<BlockInstance> = {}): BlockInstance => ({ id, type: "t", settings: {}, ...extra })
const ids = (list: readonly BlockInstance[] | null) => (list ?? []).map((x) => x.id).join(",")

console.log("\nA BLOCK, ONE STEP")
{
  /* A product's information: a title, a price, buy buttons, a description. */
  const info = [b("title"), b("price"), b("buy"), b("desc")]
  check("down: the price after the buy buttons", ids(stepBlock(info, ["price"], 1)) === "title,buy,price,desc", ids(stepBlock(info, ["price"], 1)))
  check("up: the price before the title", ids(stepBlock(info, ["price"], -1)) === "price,title,buy,desc")
  check("the first cannot go up, the last cannot go down", stepBlock(info, ["title"], -1) === null && stepBlock(info, ["desc"], 1) === null)
  check("what it can do, said for the toolbar", JSON.stringify(blockSteps(info, ["title"])) === '{"up":false,"down":true}' && JSON.stringify(blockSteps(info, ["price"])) === '{"up":true,"down":true}')
  check("the list that came in is untouched (Undo keeps it)", ids(info) === "title,price,buy,desc")

  const withStatic = [b("a"), b("s", { static: true }), b("c")]
  check("a static block never moves", stepBlock(withStatic, ["s"], 1) === null && JSON.stringify(blockSteps(withStatic, ["s"])) === '{"up":false,"down":false}')
  check("a block steps past a static one, which stays where the template put it", ids(stepBlock(withStatic, ["a"], 1)) === "c,s,a", ids(stepBlock(withStatic, ["a"], 1)))
  const onlyStatic = [b("s1", { static: true }), b("a"), b("s2", { static: true })]
  check("nothing to step past but statics: nowhere to go", stepBlock(onlyStatic, ["a"], -1) === null && stepBlock(onlyStatic, ["a"], 1) === null)

  const nested = [b("group", { blocks: [b("x"), b("y")] }), b("after")]
  check("a block inside a block moves among its own siblings", JSON.stringify(stepBlock(nested, ["group", "x"], 1)?.[0].blocks?.map((x) => x.id)) === '["y","x"]')
  check("never out of its parent", stepBlock(nested, ["group", "y"], 1) === null)

  const links = [b("home"), b("shop"), b("shirts", { settings: { parent_id: "shop" } }), b("hats", { settings: { parent_id: "shop" } }), b("about")]
  check("a top link steps past a dropdown's items to the next top link", ids(stepBlock(links, ["shop"], 1)) === "home,about,shirts,hats,shop", ids(stepBlock(links, ["shop"], 1)))
  check("a dropdown's item moves among the items of its parent", ids(stepBlock(links, ["shirts"], 1)) === "home,shop,hats,shirts,about")
  check("and not past them", stepBlock(links, ["hats"], 1) === null)
  check("a path that names no block: nothing", stepBlock(info, ["nope"], 1) === null)
}

console.log("\nTHE TOOLBAR'S BUTTONS ARE THE BLOCK'S")
{
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("a block selected in the section shown is what it acts on", /const blockKey = selectedBlockId && selectedSectionId === shownSectionId && current\.type !== "header" \? selectedBlockId : null/.test(page))
  check("Move up and down step the block", /onMoveUp=\{\(\) => moveBlockBy\(sid, blockKey, -1\)\}/.test(page) && /onMoveDown=\{\(\) => moveBlockBy\(sid, blockKey, 1\)\}/.test(page))
  check("Duplicate, Hide and Delete are the block's", /onDuplicate=\{\(\) => duplicateBlock\(sid, blockKey\)\}/.test(page) && /onToggleHide=\{\(\) => toggleBlockHidden\(sid, blockKey, blockHit\.virtual\)\}/.test(page) && /onRemove=\{\(\) => removeBlock\(sid, blockKey\)\}/.test(page))
  check("a static block is not copied or deleted", /canDuplicate=\{!fixed && !!path\}/.test(page) && /canRemove=\{!fixed && !!path\}/.test(page))
  check("hiding as the block's own menu offers it", /canHide=\{isStorelibSection\(current\.type, storelibSources\)\}/.test(page))
  check("moveBlockBy goes through stepBlock, with Undo", /const moveBlockBy = [\s\S]{0,400}stepBlock\(section\.blocks, path, dir\)[\s\S]{0,200}pushUndo\(\)/.test(page))
  check("the toolbar says what it acts on", /data-toolbar-target=\{target\}/.test(page))
  check("the section's own toolbar is unchanged when no block is selected", /onMoveUp=\{\(\) => shownSectionId && moveSectionBy\(shownSectionId, -1\)\}/.test(page))
}

console.log("\nA PLACE BETWEEN TWO SECTIONS")
{
  const s = (id: string, group?: string): SectionInstance => ({ id, type: id, name: id, settings: {}, blocks: [], ...(group ? { group } : {}) }) as unknown as SectionInstance
  const list = [s("bar", "header"), s("header", "header"), s("hero"), s("story"), s("products"), s("footer", "footer"), s("links", "footer"), s("popup", "overlay")]
  const a = insertPlaceBetween(list, { before: "story", after: "hero" })
  check("between two of the page's sections: a canvas gap", JSON.stringify(a) === '{"group":"template","at":1}', a)
  check("which is the list index of the section below", a && bodyGapToListIndex(list, a.at) === 3)
  check("above the first", JSON.stringify(insertPlaceBetween(list, { before: "hero", after: null })) === '{"group":"template","at":0}')
  check("below the last", JSON.stringify(insertPlaceBetween(list, { before: null, after: "products" })) === '{"group":"template","at":3}')
  check("inside the header group: counted in that group", JSON.stringify(insertPlaceBetween(list, { before: "header", after: "bar" })) === '{"group":"header","at":1}')
  check("inside the footer group", JSON.stringify(insertPlaceBetween(list, { before: "links", after: "footer" })) === '{"group":"footer","at":1}')
  check("not in the overlay group", insertPlaceBetween(list, { before: "popup", after: null }) === null)
  check("not for a section the list does not have", insertPlaceBetween(list, { before: "nope", after: null }) === null)
  const page = read("app/(storelib)/website-builder/editor/[installId]/page.tsx")
  check("the editor opens Add section there", /onAddSectionAt=\{openAddSectionBetween\}/.test(page) && /const openAddSectionBetween = useCallback/.test(page))
  check("a group's place reaches placeSection", /requested !== "template" && groupInsertAt != null \? groupInsertAt : null/.test(page))
  check("and is let go after the add and when the library closes without one", (page.match(/setGroupInsertAt\(null\)/g) ?? []).length >= 5)
  const canvas = read("components/website-builder/compat/compat-canvas.tsx")
  check("the canvas passes the press on, with the inspector on, from the page in front", /m\.type === "add-section" && inspecting\.current && isFront/.test(canvas))
}

console.log("\nTHE STRIP IN AN IMPORTED THEME'S PAGE")
{
  check("fixed over the line: nothing in the page's flow", /\[data-sl-add\]\{position:fixed;z-index:2147483645;height:12px/.test(CANVAS_BRIDGE))
  check("the editor's look: a grey line and a near black round button", /background:#d4d7dd/.test(CANVAS_BRIDGE) && /width:24px;height:24px;border-radius:999px/.test(CANVAS_BRIDGE) && /background:#1a1a2e/.test(CANVAS_BRIDGE))
  check("the editor's motion: the line grows from the middle, the button turns in, 200ms ease-out", /transform:scaleX\(0\)/.test(CANVAS_BRIDGE) && /transform:rotate\(-90deg\) scale\(\.75\)/.test(CANVAS_BRIDGE) && /transform \.2s ease-out,opacity \.2s ease-out/.test(CANVAS_BRIDGE))
  check("still under reduced motion", /prefers-reduced-motion:reduce\)\{\[data-sl-add\] i,\[data-sl-add\] b\{transition:none\}/.test(CANVAS_BRIDGE))
  check("within 8px of the line, on the section's width", /if \(d > 8 \|\| x < g\.left \|\| x > g\.left \+ g\.width\) continue;/.test(CANVAS_BRIDGE))
  check("the page's own content: above every section and below the last; a header or footer group: between its sections", /var body = g === "";/.test(CANVAS_BRIDGE) && /if \(!body && !\/header\|footer\/i\.test\(g\)\) return;/.test(CANVAS_BRIDGE))
  check("a mouse only, and only with the inspector on", /if \(!addAt \|\| !inspect \|\| leaving \|\| touching\) return null;/.test(CANVAS_BRIDGE) && /if \(e\.pointerType !== "mouse"\) return;\s*addAt = /.test(CANVAS_BRIDGE))
  check("the inspector switched off takes it away", /showGap\(null\);\s*fadeBoxes\(false\);/.test(CANVAS_BRIDGE))
  check("pressed: the sections either side, to the builder", /post\(\{ type: "add-section", before: gapShown\.before, after: gapShown\.after \}\)/.test(CANVAS_BRIDGE))
  check("its own changes do not wake the outline's watcher", /t\.hasAttribute\("data-sl-add"\)/.test(CANVAS_BRIDGE))
  check("the same words as the Storelib strip", /"Add a section here"/.test(CANVAS_BRIDGE) && /aria-label="Add a section here"/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
