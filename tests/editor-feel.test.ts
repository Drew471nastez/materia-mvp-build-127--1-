/**
 * How the editor feels: the link picker as a sheet on a phone, lists that
 * grow and shrink instead of snapping, a round size switcher, soft square
 * toggles, a scheme list that leaves as smoothly as it arrives.
 *
 *   npx tsx tests/editor-feel.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const popover = read("components/website-builder/field-popover.tsx")
const picker = read("components/website-builder/link-picker.tsx")
const editor = read("app/website-builder/editor/[installId]/page.tsx")

console.log("\nThe link picker on a phone is a bottom sheet\n")
{
  check("a float panel on a phone opens in the app's own BottomSheet, with a label", /if \(float && phone\) \{[\s\S]{0,400}<BottomSheet[\s\S]{0,200}label=\{sheetLabel \?\? "Choose"\}/.test(popover))
  check("  sized to the screen and lifted over the keyboard", /aboveKeyboard/.test(popover) && /maxHeight="min\(80dvh, 640px\)"/.test(popover))
  check("the field is a door on a phone: tapping it opens the sheet, it never takes the keyboard", /readOnly=\{sheet\}/.test(picker) && /if \(sheet\) \{\s*e\.currentTarget\.blur\(\)/.test(picker))
  check("  the sheet has its own search box, 16px so iOS does not zoom", /data-link-sheet-search=""/.test(picker) && /text-\[16px\]/.test(picker))
  check("  an address typed there can be used as it is", /data-link-use-typed=""/.test(picker) && /canUseTyped/.test(picker))
  check("  and swiping the sheet away with one typed keeps it, as a blur does", /if \(sheet\) commit\(\)\s*close\(\)/.test(picker))
  check("  it stays open with nothing matching, where the list at a computer would shut", /const panelOpen = sheet \? open : showList/.test(picker))
}

console.log("\nA list of another length grows and shrinks to it\n")
{
  check("the height is read before and after, and the change is played", /const lastHeight = React\.useRef<number \| null>\(null\)/.test(picker) && /el\.animate\(\[\{ height: `\$\{was\}px` \}, \{ height: `\$\{now\}px` \}\]/.test(picker))
  check("  on the rows' own curve, never under reduced motion, never while typing", /cubic-bezier\(0\.32, 0\.72, 0, 1\)/.test(picker) && /prefers-reduced-motion: reduce/.test(picker) && /const listKey = searching \? "search"/.test(picker))
  check("  and the box clips while it moves", /ref=\{boxRef\}\s*className="flex min-h-0 flex-col overflow-hidden"/.test(picker))
}

console.log("\nSmall things that were off\n")
{
  check("the preview size switcher is a circle, 32 by 32", /hidden sm:flex h-8 w-8 aspect-square shrink-0 items-center justify-center rounded-full/.test(editor) && !/sm:flex h-8 w-9 shrink-0/.test(editor))
  const sw = read("components/ui/switch-style.ts")
  check("toggles are soft squares: an 8px track and a 6px knob, not pills", /rounded-\[8px\]/.test(sw) && /rounded-\[6px\]/.test(sw) && !/w-\[36px\] shrink-0 rounded-full/.test(sw))
  check("  with a light lip under the track, a touch of depth", /0_1px_0_rgba\(255,255,255,0\.7\)/.test(sw))
  const design = read("components/website-builder/editor/design-panels.tsx")
  check("the colour scheme list leaves as it arrives, on transform and opacity", /scheme-dropdown-out/.test(design) && /SCHEME_LIST_OUT_MS = 140/.test(design) && !/scaleY/.test(design))
  check("Storelib AI is heard: -11 dBFS, the limiter 10 dB above it", /export const PEAK_DBFS = -11/.test(read("lib/website-builder/ask-sounds.ts")))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
