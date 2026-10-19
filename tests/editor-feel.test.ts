/**
 * How the editor feels: the link picker as a sheet on a phone, lists that
 * grow and shrink instead of snapping, a round size switcher, soft square
 * toggles, a scheme list that leaves as smoothly as it arrives.
 *
 *   npx tsx tests/editor-feel.test.ts
 */
import { iconLabel } from "@/components/website-builder/icon-picker"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

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

console.log("\nDragging a row: sections, blocks and menu links, one engine\n")
{
  const hook = read("components/website-builder/editor/controls/use-reorder.ts")
  const list = read("components/website-builder/editor/sections-list.tsx")
  const blocks = read("components/website-builder/editor/block-tree-rows.tsx")
  const tree = read("components/website-builder/editor/tree-parts.tsx")
  check("positions come from layout, which a transform does not move", /r\.offsetTop \+ k/.test(hook) && /offsetToContent: baseTop - el\.offsetTop/.test(hook))
  check("  the lifted row is placed from where the pointer went down, before an open row closes", /const top = d\.baseTop \+ \(d\.lastY - d\.startY\)/.test(hook) && hook.indexOf("const baseTop = rect.top + scroll") < hook.indexOf("onStart?.()"))
  check("  transforms are written to the rows once a frame, not rendered", /me\.style\.transform = `translate3d/.test(hook) && /if \(d\.dirty\) \{\s*d\.dirty = false\s*paint\(\)/.test(hook))
  check("  React hears only when the slot changes", /prev && prev\.from === d\.from && prev\.to === d\.to && prev\.nesting === d\.nesting\s*\?\s*prev/.test(hook))
  check("  the row style is a layer, never a transform", /\{ zIndex: 20, position: "relative" \} : undefined/.test(hook))
  check("  the drop renders at once and glides the last pixels", /flushSync\(\(\) => \{/.test(hook) && /d\.el\.animate\(/.test(hook))
  check("  a tap for picking up, each new slot, and the drop", /hapticTap\("medium"\)/.test(hook) && /hapticTap\("light"\)/.test(hook))
  check("a block's offset is applied once, on its row, not again on the line inside it", !/\.\.\.\(style \?\? \{\}\), paddingLeft/.test(blocks))
  check("the page's sections use the same drag, not dnd-kit", /useReorder<HTMLDivElement>\(\{\s*count: body\.length/.test(list) && !/@dnd-kit/.test(list) && !/DragOverlay/.test(list))
  check("  a row, its open blocks and the insert line after it move as one", /data-reorder-row=""\s*data-section-lifted/.test(list))
  check("the grip's wider touch area grows to the right only, so it never covers the chevron", /after:left-0 after:-right-1\.5/.test(list) && !/after:-inset-x-1\.5/.test(list))
  check("  and the chevron's own target reaches the row's height and its left padding", /after:-left-1 after:right-0 after:-inset-y-1/.test(tree) && /max-sm:after:-left-2 max-sm:after:-inset-y-1\.5/.test(tree))
  check("a block can be deleted from its row, in grey, never on a static block", /data-block-remove=""/.test(blocks) && /onRemove && !still/.test(blocks) && !/text-red|bg-red|destructive/.test(blocks))
  check("  wired to the editor's own removeBlock, which undo covers", /remove: \(key\) => removeBlock\(s\.id, key\)/.test(editor) && /onRemove=\{\(key\) => ops\.remove\(key\)\}/.test(editor))
}

console.log("\nAdd section shows the section as it will arrive\n")
{
  const lib = read("components/website-builder/editor/section-library.tsx")
  check("cards are drawn with the site's own theme, not a stock one", /theme=\{job\.theme\}/.test(lib) && /<SectionLibrary[\s\S]{0,400}?theme=\{settingsDraft\}/.test(editor))
  check("  and a change of colours or type draws them again, nothing else does", /const LOOK = \/color\|colour\|scheme\|font/.test(lib) && /previewKey\(type, i, w, `\$\{own\.has\(type\) \? sourcesTag : ""\}\$\{lookTag\}`\)/.test(lib))
  check("  a preset's settings and blocks are both the card and what is added", /settings: preset\?\.settings \?\? \{\},\s*\n\s*blocks: preset\?\.blocks \?\? \[\]/.test(lib) && /blocks: freshBlocks\(preset\?\.blocks, newBlockId\)/.test(editor))
}

console.log("\nThe icon picker looks like the rest of the builder\n")
{
  const ip = read("components/website-builder/icon-picker.tsx")
  check("names are words, not code: shopping-bag reads Shopping bag", iconLabel("shopping-bag") === "Shopping bag" && iconLabel("building2") === "Building")
  check("  the chosen icon is on the sidebar's soft grey, never a black square", /TILE_ON = "bg-\[#ebecef\]/.test(ip) && !/bg-foreground text-background/.test(ip))
  check("  no shouting group headings; the groups are chips that narrow the grid", !/uppercase tracking-wide/.test(ip) && /data-icon-groups=""/.test(ip))
  check("  No icon is a tile like the others", /data-icon-none=""/.test(ip))
  check("  on a phone it is the app's bottom sheet, with the search at its top", /<FieldPopover[\s\S]{0,80}float[\s\S]{0,80}sheetLabel="Choose an icon"[\s\S]{0,40}sheetHeader=\{search\}/.test(ip))
}

console.log("\nShop data in a sentence is a chip\n")
{
  const ct = read("components/website-builder/editor/controls/chip-text-input.tsx")
  const ds = read("components/website-builder/editor/controls/dynamic-source-field.tsx")
  check("a plain text setting with a source in it is drawn as words and grey chips", /chipped \? \(\s*<ChipTextInput/.test(ds) && /target === "text" && named\.length > 0/.test(ds))
  check("  and stays that field after its last chip goes, so typing is never cut off", /wasChipped\.current = true/.test(ds))
  const vp = read("components/website-builder/value-pills.ts")
  check("  the stored value is still the placeholder string the pages read", /out \+= placeholderFor\(child\.dataset\.value \?\? ""\)/.test(ct))
  check("  a pill comes out with Backspace or its list's Remove, and pasting brings words only", /pillKeyDown\(e, el\.current\)/.test(ct) && /data-pill-remove/.test(ds) && /getData\("text\/plain"\)/.test(ct) && /el\.contentEditable = "false"/.test(vp))
  check("  the line spelling the sentence back is only left under a box that shows braces", /named\.length > 0 && !drawsPills \? placeholderParts\(text\)/.test(ds))
  check("  the list of shop data says what each one is, under calm group names", /s\.description/.test(ds) && !/uppercase tracking-widest/.test(ds))
  check("  a connected field is the height of the boxes beside it", /flex h-8 max-sm:h-auto max-sm:min-h-11/.test(ds))
}

console.log("\nA block goes into a group, and out of one, by dragging sideways\n")
{
  const rows = read("components/website-builder/editor/block-tree-rows.tsx")
  check("the tree hands the drag its rule and its move", /nest: canNest && onNest \? \{ step: TREE_STEP, can: canNest, onNest \} : undefined/.test(rows))
  check("  the block it would go into is marked while held", /const into = drag && nesting === 1 \? drag\.from - 1 : -1/.test(rows) && /data-tree-nesting=/.test(rows))
  check("  right only into a block above that holds blocks and takes this kind, with room", /if \(!above \|\| !holds\(above\)\) return false/.test(editor) && /levelOwner\.max_blocks && held\.filter/.test(editor) && /levelDepth \+ depthOf\(\[b\]\) <= MAX_BLOCK_DEPTH/.test(editor))
  check("  left only out to a level that takes it, just after the group it left", /return parent\.length > 0 && levelTakes\(outer\?\.owner/.test(editor) && /ops\.moveTo\(keyOf\(b\), outerKey, at < 0 \? undefined : at \+ 1\)/.test(editor))
  check("  the move carries its children, is one undo, and never puts a block inside itself", /insertBlockAt\(removeAt\(s\.blocks, path\), parent, found\.block, index\)/.test(editor) && /pathKey\(parent\)\.startsWith\(`\$\{pathKey\(path\)\}\/`\)/.test(editor) && /const moveBlockTo[\s\S]{0,900}pushUndo\(\)/.test(editor))
  check("  and a selected block stays selected at its new address", /setSelectedBlockId\(prev => \(prev === was \|\| prev === blockKey \? now/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
