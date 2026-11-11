/**
 * The OnePage editor round after AR: invisible click to select in the
 * phone preview, no AI in the editor, and the block inputs a creator types
 * into (Instagram handle, posts added by hand, the booking message and its
 * placeholders, YouTube autoplay, the Canva mark, addresses and phone
 * numbers).
 *
 * scripts/check-onepage-pick-op.mjs measures the click to select in
 * Chromium.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { nearestBlock, pickAction, pickStyle } from "@/lib/onepage/preview-select"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}`) }
}
function section(name: string) { console.log(`\n${name}`) }
const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

section("Click a block in the phone preview, nothing drawn")
{
  const rects = [
    { id: "a", left: 20, top: 100, right: 370, bottom: 150 },
    { id: "b", left: 20, top: 166, right: 370, bottom: 216 },
  ]
  check("a point on a block is that block", nearestBlock(rects, 100, 120) === "a")
  check("a point in the gap goes to the nearer block", nearestBlock(rects, 100, 154) === "a" && nearestBlock(rects, 100, 162) === "b")
  check("far from every block is nothing", nearestBlock(rects, 100, 400) === null && nearestBlock(rects, 100, 40) === null)
  check("a page margin wider than the slack is nothing", nearestBlock(rects, 2, 120, 8) === null)
  check("an empty box is never picked", nearestBlock([{ id: "z", left: 0, top: 0, right: 0, bottom: 0 }], 0, 0) === null)
  check("the open block's click goes to the page and brings the list back", pickAction({ mode: true, selected: "a", hit: "a" }) === "reveal")
  check("another block's click is taken", pickAction({ mode: true, selected: "a", hit: "b" }) === "select")
  const css = pickStyle("blk_1")
  check("frames in blocks give their clicks to the block, except the open block's", /\[data-op-block\] iframe\{pointer-events:none\}/.test(css) && /\[data-op-block="blk_1"\] iframe\{pointer-events:auto\}/.test(css))
  check("a hand over every block, nothing else in the style", /cursor:pointer/.test(css) && !/outline|box-shadow|border/.test(css))
  check("an id that is not the editor's never reaches the style", !/<|"\]\{/.test(pickStyle('x"]{color:red}')) && pickStyle(null).indexOf("auto") === -1)
  const doc = code("components/onepage/preview-document.tsx")
  const picker = doc.slice(doc.indexOf("function BlockPicker"), doc.indexOf("A NEW THEME IS DRAWN"))
  check("the frame draws no ring or outline", !/data-pick-hover|data-pick-open|boxShadow|\bring\b|outline/.test(picker))
  check("a gap click only counts on the page round the blocks, never in a sheet over it", /querySelector\("\[data-op-block\]"\)\) return null/.test(picker))
  const list = code("components/onepage/tabs/links-tab.tsx")
  check("the list glides again on a second click of the open block", /setPickTick\(\(n\) => n \+ 1\)/.test(list) && /\[selectedBlockId, pickTick\]/.test(list))
}

section("No AI in the OnePage editor")
{
  check("the AI line is gone, with its edits and route", !existsSync(join(process.cwd(), "components/onepage/ai-edit-bar.tsx")) && !existsSync(join(process.cwd(), "lib/onepage/ai-edits.ts")) && !existsSync(join(process.cwd(), "app/api/onepage/ai")))
  check("nothing in the OnePage editor asks for it", !/AiEditBar|api\/onepage\/ai/.test(code("components/onepage/tabs/links-tab.tsx") + code("components/onepage/onepage-editor.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
