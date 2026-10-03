/**
 * ===========================================================================
 *  A SECTION DOES NOT FLASH WHEN NOTHING IT DRAWS CHANGED
 * ===========================================================================
 * "Sometimes in the canvas, randomly in some sections, when I adjust
 * something in the sidebar, the hero section flashes on each click." Three
 * causes, each held here:
 *   1. StorelibSection keyed its markup on the render result object, so any
 *      new section or theme object rewrote the section's whole DOM;
 *   2. the editor wrote a setting set to the value it already had, which made
 *      that new object for nothing;
 *   3. a real edit replaced every node, so the untouched picture decoded again
 *      and the entrance animation replayed. It is applied as a change now
 *      (lib/website-builder/morph-html, measured in scripts/check-section-morph.mjs).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sameSettingValue } from "@/lib/website-builder/same-setting"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nThe section's markup")
{
  const src = read("components/website-builder/sections/StorelibSection.tsx")
  check("the stylesheet prop is keyed on its string, not on the render result", /const cssProp = useMemo\(\(\) => \(css \? \{ __html: css \} : null\), \[css\]\)/.test(src) && !/\[out\]\)/.test(src))
  check("React is given the first markup once and never a new object", /const \[htmlProp\] = useState\(\(\) => \(\{ __html: html \}\)\)/.test(src) && /dangerouslySetInnerHTML=\{htmlProp\}/.test(src))
  check("and a new string is applied as a change, before paint", /useLayoutEffect\(\(\) => \{\s*if \(!scriptRoot\) return[\s\S]*?morphInto\(scriptRoot, html\)[\s\S]*?\}, \[scriptRoot, html, htmlProp\]\)/.test(src))
}

console.log("\nA setting set to what it is")
{
  check("the same value, number, string or nothing", sameSettingValue(4, 4) && sameSettingValue("a", "a") && sameSettingValue(undefined, undefined) && sameSettingValue(NaN, NaN))
  check("an object or list with the same contents", sameSettingValue({ url: "/shop", label: "Shop" }, { url: "/shop", label: "Shop" }) && sameSettingValue([1, 2], [1, 2]))
  check("but not a different one, or 0 against an empty string", !sameSettingValue(4, 5) && !sameSettingValue(0, "") && !sameSettingValue(null, undefined) && !sameSettingValue({ a: 1 }, { a: 2 }) && !sameSettingValue([1], [1, 2]))
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("the theme's own settings drop it before an undo step or a redraw", /const updateSetting = \(key: string, value: unknown\) => \{\s*if \(sameSettingValue\(settingsRef\.current\[key\], value\)\) return\s*debouncedPushUndo\(\)/.test(page))
  check("so do a section's", /const updateSectionSetting = \(sectionId: string, key: string, value: unknown\) => \{\s*const current = sectionsRef\.current\.find\(s => s\.id === sectionId\)\s*if \(current && sameSettingValue\(current\.settings\?\.\[key\], value\)\) return\s*debouncedPushUndo\(\)/.test(page))
  /* A block is found by its path now (lib/website-builder/block-tree.ts), and the same value still stops before an undo step. */
  check("and a block's", /const updateBlockSetting = [^\n]*\n[\s\S]{0,1400}?const block = blockAt\(section\.blocks, path\)\?\.block\s*if \(block && sameSettingValue\(block\.settings\?\.\[key\], value\)\) return\s*debouncedPushUndo\(\)/.test(page))
  check("the canvas is not drawn again for a new function every render", /onCreateMissingPage=\{createMissingPage\}/.test(page) && /const createMissingPage = useCallback\(/.test(page))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
