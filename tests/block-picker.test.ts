/**
 * Round 34: Add block, with each block shown in its section before it is added.
 *
 *   ARITHMETIC  the block as Add block makes it, the section with it in place,
 *               the search, the window cut around the block, where the panel goes
 *   WIRING      the tree's Add block and insert line open the picker with the
 *               section, the level, the place and the room rules; one kind of
 *               block still adds at once
 *   PREVIEW     the real renderer, the canvas's own width and theme root, no
 *               network, drawn in the press and in idle moments
 *   SHELLS      a panel beside the sidebar on a computer, the builder's sheet on
 *               a phone; Escape, a press outside, focus back on the row
 *   WORDS       every new sentence translated, none of the words the rules ban
 *
 * scripts/check-block-picker.mjs drives it in the real editor at 1440, 1280
 * and 390 wide, and in an imported Shopify theme.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { PICKER_SIZE, PREVIEW_BLOCK_ID, blockDefaults, cropFor, matchChoices, placePicker, previewBlock, sectionWith } from "@/lib/website-builder/block-picker"
import type { SectionInstance } from "@/lib/website-builder/types"

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
    console.log(`  FAIL  ${label}${detail === undefined ? "" : `   ${JSON.stringify(detail).slice(0, 400)}`}`)
  }
}
const src = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => src(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const PICKER = "components/website-builder/editor/block-picker.tsx"
const ROWS = "components/website-builder/editor/block-tree-rows.tsx"
const EDITOR = "app/website-builder/editor/[installId]/page.tsx"

function main() {
  console.log("\nThe block as Add block makes it, in the section it goes into")
  {
    const def = { fields: [{ id: "text", type: "text", label: "Heading", default: "A heading" }, { id: "size", type: "select", label: "Size", default: "medium" }, { id: "color", type: "color", label: "Colour" }] } as never
    check("a block's defaults are its fields' defaults, and nothing for a field without one", JSON.stringify(blockDefaults(def)) === JSON.stringify({ text: "A heading", size: "medium" }))
    const b = previewBlock({ type: "heading", label: "Heading", preset: { name: "Big", settings: { size: "large" } } }, def)
    check("the preset's settings go over the defaults", b.settings.size === "large" && b.settings.text === "A heading" && b.id === PREVIEW_BLOCK_ID, b)
    const g = previewBlock({ type: "group", label: "Two columns", preset: { name: "Two columns", settings: {}, blocks: [{ id: "a", type: "text", settings: { text: "First" } }, { id: "b", type: "text", settings: {} }] } }, { fields: [] } as never)
    check("a preset's blocks come with it, with ids of their own", g.blocks?.length === 2 && g.blocks.every((x) => x.id.startsWith(PREVIEW_BLOCK_ID)) && g.blocks[0].settings.text === "First", g)

    const section: SectionInstance = { id: "s1", type: "blocks_section", settings: { scheme: "dark" }, hidden: true, blocks: [{ id: "x", type: "heading", settings: {} }, { id: "grp", type: "group", settings: {}, blocks: [{ id: "y", type: "text", settings: {} }] }, { id: "z", type: "button", settings: {} }] }
    const at1 = sectionWith(section, [], 1, b)
    check("the block lands at the place asked for among the section's own", at1.blocks?.map((x) => x.id).join() === `x,${PREVIEW_BLOCK_ID},grp,z`, at1.blocks?.map((x) => x.id))
    check("  last when no place is given", sectionWith(section, [], undefined, b).blocks?.at(-1)?.id === PREVIEW_BLOCK_ID)
    const inner = sectionWith(section, ["grp"], 0, b)
    check("  inside a group, at its level", inner.blocks?.[1].blocks?.map((x) => x.id).join() === `${PREVIEW_BLOCK_ID},y`)
    check("drawn under an id of its own, shown, with the section's own settings (its scheme)", at1.id !== section.id && at1.id.includes(section.id) && at1.hidden === false && at1.settings.scheme === "dark")
    check("  and the section itself is left as it was", section.blocks?.length === 3 && section.blocks[1].blocks?.length === 1)
  }

  console.log("\nThe search")
  {
    const all = [{ type: "heading", label: "Heading" }, { type: "group", label: "Two columns" }, { type: "collection_card", label: "Collection card" }, { type: "text", label: "Text" }]
    check("nothing typed keeps every block, in its order", matchChoices(all, "  ").map((c) => c.type).join() === "heading,group,collection_card,text")
    check("by name, any case", matchChoices(all, "COLUMN").map((c) => c.type).join() === "group")
    check("by type, underscores read as spaces", matchChoices(all, "collection card").map((c) => c.type).join() === "collection_card" && matchChoices(all, "group").length === 1)
    check("every word has to be there, in any order", matchChoices(all, "card collection").length === 1 && matchChoices(all, "card heading").length === 0)
  }

  console.log("\nThe window cut around the block")
  {
    const f = cropFor({ x: 100, y: 400, w: 200, h: 40 }, { w: 1000, h: 900 }, { w: 500, h: 400 }, 24)
    check("a small block is shown at its own size, never blown up", f.scale === 1, f)
    check("  in the middle of the pane", Math.abs(f.x + (100 + 100) * f.scale - 250) < 0.5 && Math.abs(f.y + (400 + 20) * f.scale - 200) < 0.5, f)
    const wide = cropFor({ x: 0, y: 0, w: 1000, h: 300 }, { w: 1000, h: 300 }, { w: 500, h: 400 }, 24)
    check("a block wider than the pane is scaled to fit it", Math.abs(wide.scale - 0.5) < 1e-9 && wide.window.x === 0 && wide.window.w === 1000, wide)
    const tall = cropFor({ x: 0, y: 0, w: 400, h: 2000 }, { w: 400, h: 2000 }, { w: 500, h: 400 }, 0)
    check("a tall block is scaled to fit the pane's height", Math.abs(tall.scale - 0.2) < 1e-9)
    check("the window stays inside the section", wide.window.y === 0 && wide.window.h === 300)
  }

  console.log("\nWhere the panel goes on a computer")
  {
    const beside = placePicker({ top: 500 }, { right: 294 }, { w: 1440, h: 900 })
    check("beside the sidebar, a gap from it, as wide as it wants", beside.mode === "beside" && beside.left === 294 + PICKER_SIZE.gap && beside.width === PICKER_SIZE.w, beside)
    check("  level with the row, kept on screen", beside.top + beside.height <= 900 - PICKER_SIZE.margin && beside.top >= PICKER_SIZE.margin, beside)
    const high = placePicker({ top: 120 }, { right: 294 }, { w: 1440, h: 900 })
    check("  its top by the row when there is room under it", high.top === 104, high)
    const narrow = placePicker({ top: 300 }, { right: 360 }, { w: 900, h: 700 })
    check("no room beside the sidebar: in the middle of the window", narrow.mode === "center" && narrow.left === Math.round((900 - narrow.width) / 2), narrow)
    const small = placePicker({ top: 300 }, { right: 294 }, { w: 1280, h: 500 })
    check("a short window: the panel is as tall as the window allows", small.height === 500 - PICKER_SIZE.margin * 2 && small.top === PICKER_SIZE.margin, small)
  }

  console.log("\nThe tree opens it, with what the preview and the rules need")
  {
    const rows = code(ROWS)
    const editor = code(EDITOR)
    check("Add block and the insert line ask for the picker", /const openPicker = useBlockPicker\(\)/.test(rows) && (rows.match(/openPicker\(\{ \.\.\.target, anchor: e\.currentTarget, options, choices, onAdd \}\)/g) ?? []).length === 2)
    check("  only with more than one kind: one kind still adds at once", /choices\.length === 1 \? \(\) => onAdd\(choices\[0\]\) : pick/.test(rows))
    check("  and the menu stays where there is no picker (outside the editor's tree)", /return <ResponsiveActionMenu title=\{tt\("Add block"\)\}/.test(rows))
    check("the editor hands each level its section, its place, and why a kind has no room", /target=\{\{ section, parent, reasonFor: roomFor \}\}/.test(editor) && /target=\{\{ section, parent, index: at < 0 \? undefined : at, reasonFor: roomFor \}\}/.test(editor))
    check("  the room is the rule addBlock keeps (block-room.ts)", /const roomFor = \(choice: BlockChoice\): string \| null => \{\s*const room = blockRoom\(/.test(editor))
    check("the picker is mounted once, around the sidebar's tree, with the site's theme and files", /<BlockPickerProvider theme=\{settingsDraft\} sources=\{storelibSources\} compatInstallId=\{compatInstall \? installId : null\}>/.test(editor))
  }

  console.log("\nThe preview")
  {
    const picker = code(PICKER)
    check("drawn by the real renderer, with the theme and the site's files", /<SectionRenderer section=\{section\} theme=\{theme\}/.test(picker) && /<StorelibLiveProvider sources=\{sources\} inEditor>/.test(picker))
    check("at the canvas's own width, with its theme root's style", /document\.getElementById\(`wb-section-\$\{sectionId\}`\)/.test(picker) && /closest<HTMLElement>\(`\[\$\{THEME_ROOT_ATTRIBUTE\}\]`\)/.test(picker) && /\{\.\.\.\{ \[THEME_ROOT_ATTRIBUTE\]: "" \}\}/.test(picker))
    check("everything but the block out of sight, still in its place", /\[data-bp-stage\]\[data-bp-isolate\] \*:not\(\[data-bp-target\]\):not\(\[data-bp-target\] \*\)\{visibility:hidden\}/.test(picker))
    check("each block drawn once an opening, the first in the press, the rest in idle moments", /s\.ensure\(first\)/.test(picker) && /cancel = idle\(next\)/.test(picker) && /this\.markup\.get\(key\)/.test(picker))
    check("nothing fetched for a preview", !/fetch\(/.test(picker))
    check("the pointer's block is committed in the move itself", /flushSync\(\(\) => setActiveKey\(choiceKey\(c\)\)\)/.test(picker))
    check("an imported theme is drawn by its own engine, in a frame without scripts", /sectionMarkup\(ctx\.theme, ctx\.page, session\.sectionFor\(choice\)/.test(picker) && /sandbox="allow-same-origin"/.test(picker))
    check("  a block the theme gives no marker is shown in its section, and says so", /tt\("Shown in its section"\)/.test(picker))
  }

  console.log("\nThe shells")
  {
    const picker = code(PICKER)
    check("a phone gets the builder's sheet, over the sections sheet", /<MobileEditorSheet open=\{open\}[\s\S]{0,200}layer="raised"/.test(picker) && /request\.anchor\.closest\(PHONE_SHEET\)/.test(picker))
    check("  a tap picks and Add adds", /onClick=\{\(\) => \(phone \? show\(c\) : add\(c\)\)\}/.test(picker) && /data-block-picker-add=""/.test(picker))
    check("a computer gets a panel beside the sidebar", /placePicker\(anchor\.getBoundingClientRect\(\), sidebar \?/.test(picker) && /data-wb-sidebar-fold/.test(picker))
    check("  the search has the focus; Escape and a press outside close it; the row has the focus back", /searchRef\.current\?\.focus\(\{ preventScroll: true \}\)/.test(picker) && /e\.key === "Escape"/.test(picker) && /addEventListener\("pointerdown", onDown, true\)/.test(picker) && /anchor\.focus\(\{ preventScroll: true \}\)/.test(picker))
    check("  arrows and Enter from the search box", /e\.key === "ArrowDown" \|\| e\.key === "ArrowUp"/.test(picker) && /e\.key === "Enter"/.test(picker) && /aria-activedescendant=/.test(picker))
    check("a kind with no room is shown, greyed, with the reason", /aria-disabled=\{reason \? true : undefined\}/.test(picker) && /\{reason \? <span/.test(picker))
    check("adding closes first, then adds, then brings the new block on screen", /onClose\(\)\s*\/\*[^]*?\*\/\s*requestAnimationFrame\(\(\) => \{\s*request\.onAdd\(c\)\s*revealNewBlock\(/.test(src(PICKER)))
  }

  console.log("\nWords")
  {
    const text = src(PICKER) + src(ROWS) + src("lib/website-builder/block-picker.ts")
    const said = [...text.matchAll(/tt\("([^"]+)"/g)].map((m) => m[1])
    check("no em dash in anything it says", said.every((s) => !s.includes("—")), said.filter((s) => s.includes("—")))
    check("none of the banned words", !/\b(unlock|elevate|seamless|powerful|effortless|supercharge|transform(?:s|ing)? your)\b/i.test(said.join(" ")))
    for (const lang of ["es", "fr", "de", "pt-BR", "it", "pl"]) {
      const cat = src(`lib/i18n/catalog/${lang}.ts`)
      const missing = [...new Set(said)].filter((s) => !cat.includes(`${JSON.stringify(s)}:`))
      check(`every sentence has its ${lang} words`, missing.length === 0, missing)
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailures:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main()
