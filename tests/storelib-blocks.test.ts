/**
 * ===========================================================================
 *  BLOCKS, WHICH ARE THE REPEATABLE PART OF A SECTION
 * ===========================================================================
 * A section is settings plus blocks. Blocks are what makes one FAQ template
 * serve nine questions, and what stops a section schema turning into
 * question_1, answer_1, question_2, answer_2 and so on for as long as anybody
 * can bear.
 *
 * Two halves are tested here. The ENGINE half — what a schema declares and
 * what resolution does with an instance's blocks — runs for real. The EDITOR
 * half is read out of the editor's source, because the operations are React
 * state handlers: what is held there is that each one records an undo step,
 * that adding respects the limits, and that a new block arrives with the
 * defaults its schema gives it.
 */
import { untt } from "./i18n-source"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { compileSection } from "../lib/storelib-theme"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { ADDABLE_SECTIONS } from "@/lib/website-builder/section-schemas"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`) }
}
function section(t: string) { console.log(`\n${t}`) }

const root = process.cwd()
const editor = untt(readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8"), "app/website-builder/editor/[installId]/page.tsx")
const blockList = untt(readFileSync(join(root, "components/website-builder/editor/section-block-list.tsx"), "utf8"), "components/website-builder/editor/section-block-list.tsx")

const SRC = [
  "<template>",
  "{% for block in blocks %}",
  '<div data-block-id="{{ block.id }}" class="row">{{ block.settings.label }}</div>',
  "{% else %}",
  "{% if page.in_editor %}<p>Add rows in the sidebar</p>{% endif %}",
  "{% endfor %}",
  "</template>",
  "<style>.row { padding: 8px; }</style>",
  "<schema>" + JSON.stringify({
    type: "rows", name: "Rows",
    settings: [{ type: "text", id: "heading", label: "H", default: "Rows" }],
    blocks: [
      { type: "row", name: "Row", limit: 3, settings: [{ type: "text", id: "label", label: "L", default: "A row" }] },
      { type: "note", name: "Note", settings: [{ type: "text", id: "label", label: "L", default: "A note" }] },
    ],
    max_blocks: 5,
    presets: [{ name: "Rows", blocks: [{ type: "row" }, { type: "row", settings: { label: "Second" } }] }],
  }) + "</schema>",
].join("\n")

function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("What a schema says about its blocks reaches the builder")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const c = compileSection(SRC, { file: "sections/rows.storelib" })
    check("a section declaring blocks compiles", c.ok === true, c.ok === false ? c.errors[0].message : "")
    if (c.ok === true) {
      const b = c.value.schema.blocks ?? []
      check("both block types survive, with their own settings", b.length === 2 && b[0].settings[0].id === "label")
      check("a per-type limit is kept", b[0].limit === 3)
      check("and the section's own total is kept", c.value.schema.max_blocks === 5)
      check("a preset's blocks come with their type and their overrides", (() => {
        const p = c.value.schema.presets?.[0]
        return p?.blocks?.length === 2 && p.blocks[1].settings?.label === "Second"
      })())
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("An instance's blocks render in order, each with its own settings")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const c = compileSection(SRC, { file: "sections/rows.storelib" })
    if (c.ok === false) { check("compiles", false); return }
    /**
     * Through renderStorelibSection, which is what both surfaces call, rather
     * than renderSection underneath it. The difference matters: the engine
     * holds blocks as a record keyed by id plus an order, and the adapter is
     * what turns the editor's array into that. Handing renderSection an array
     * directly makes `block.id` the array index, which is how this test first
     * read a bug into code that did not have one.
     */
    const draw = (blocks: { id: string; type: string; settings: Record<string, unknown> }[], inEditor = false) => {
      const r = renderStorelibSection(
        { id: "s1", type: "rows", name: "Rows", settings: {}, blocks },
        {} as never,
        { template: "index", in_editor: inEditor },
        { "sections/rows.storelib": SRC },
      )
      return r.ok === true ? r.html : `__FAILED__ ${r.errors[0].message}`
    }
    const html = draw([
      { id: "b1", type: "row", settings: { label: "First" } },
      { id: "b2", type: "row", settings: { label: "Second" } },
      { id: "b3", type: "row", settings: { label: "Third" } },
    ])
    check("three blocks draw three rows", (html.match(/class="row"/g) ?? []).length === 3)
    check("in the order they are in", html.indexOf("First") < html.indexOf("Second") && html.indexOf("Second") < html.indexOf("Third"))
    check("each carrying its own id, which is what the canvas selects by", html.includes('data-block-id="b1"') && html.includes('data-block-id="b3"'))
    check("a block with nothing typed into it falls back to its schema's default", draw([{ id: "b1", type: "row", settings: {} }]).includes("A row"))
    check("no blocks draws nothing at all on a published page", !draw([]).includes("Add rows"))
    check("and the prompt in the builder", draw([], true).includes("Add rows"))
    check("reordering is the order of the list and nothing else", (() => {
      const a = draw([{ id: "b1", type: "row", settings: { label: "A" } }, { id: "b2", type: "row", settings: { label: "B" } }])
      const b = draw([{ id: "b2", type: "row", settings: { label: "B" } }, { id: "b1", type: "row", settings: { label: "A" } }])
      return a.indexOf("A") < a.indexOf("B") && b.indexOf("B") < b.indexOf("A")
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Every block operation can be taken back")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * None of them could. Adding, deleting and reordering a block changed the
   * page without recording anything, so Undo went back past them to whatever
   * edit had last bothered to record itself — which is worse than not
   * offering Undo at all, because it silently loses the edits in between.
   */
  {
    const body = (name: string) => {
      const at = editor.indexOf(`const ${name} = `)
      return at === -1 ? "" : editor.slice(at, editor.indexOf("\n  }", at))
    }
    for (const op of ["addBlock", "duplicateBlock", "reorderBlocks", "removeBlock"]) {
      check(`${op} records an undo step`, /pushUndo\(\)/.test(body(op)), body(op) ? "" : "not found")
    }
    check("and typing in a block setting records one too, debounced like the rest", /debouncedPushUndo\(\)/.test(body("updateBlockSetting")))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Adding a block respects what the schema allows")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("a new block takes the defaults its block schema declares", /function blockDefaults\(/.test(editor) && /settings: \{ \.\.\.blockDefaults\(def\), \.\.\.\(opts\.preset\?\.settings \?\? \{\}\), \.\.\.initialSettings \}/.test(editor))
    /* V round: the rules live in lib/website-builder/block-room.ts, so Paste block keeps them too. */
    const room = readFileSync(join(root, "lib/website-builder/block-room.ts"), "utf8")
    check("the section's total is checked", /import \{ blockRoom \} from "@\/lib\/website-builder\/block-room"/.test(editor) && /function blockRoom\(/.test(room) && /placed\.length >= max/.test(room) && /countAll\(section\.blocks\) \+ room\.size > LIMITS\.blocksPerSection/.test(room))
    check("and so is the limit on that kind of block", /placed\.filter\(\(b\) => b\.type === blockType\)\.length >= limit/.test(room))
    check("both are checked before adding and before duplicating", (editor.match(/const room = blockRoom\(at\.owner, at\.siblings, /g) ?? []).length === 2)
    check("a refusal says which limit it is", /toast\.error\(room\.reason\)/.test(editor) && /holds \$\{limit\}/.test(room))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("Two blocks are never the same block")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("every new block gets an id nothing else has", /function newBlockId\(\)/.test(editor) && /blockSeq \+= 1/.test(editor))
    check("a duplicated block is a copy, not the same object", /const copy = cloneTree\(hit\.block, newBlockId\)/.test(editor) && /settings: \{ \.\.\.block\.settings \}/.test(untt(readFileSync(join(root, "lib/website-builder/block-tree.ts"), "utf8"), "lib/website-builder/block-tree.ts")))
    /**
     * A spread copies the reference to the blocks array and to every block in
     * it, so a duplicated section and its original were the same blocks under
     * the same ids: one `data-block-id` matching two places on the page.
     */
    check("and a duplicated SECTION copies its blocks rather than sharing them", /blocks: \(orig\.blocks \?\? \[\]\)\.map\(\(b\) => cloneTree\(b, newBlockId\)\)/.test(editor))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A block on the canvas is a block in the sidebar")
  // ═══════════════════════════════════════════════════════════════════════
  {
    check("clicking a block on the canvas selects that block", /closest\?\.\("\[data-block-id\]"\)/.test(editor) && /onSelectSection\(section\.id, field \? field\.block : path\.length \? pathKey\(path\) : null, field\)/.test(editor))
    /* The blocks are rows of the sidebar's tree now (block-tree-rows.tsx), and a block opens its own panel. */
    const tree = untt(readFileSync(join(root, "components/website-builder/editor/block-tree-rows.tsx"), "utf8"), "components/website-builder/editor/block-tree-rows.tsx")
    check("the tree's row is marked when selected, and the rows it sits inside open",
      /selectedKey=\{selectedBlockId\}/.test(editor) &&
        /const selected = selectedKey === key/.test(tree) && /aria-current=\{selected \|\| undefined\}/.test(tree) &&
        /setOpen\(\(prev\) => \(prev\.has\(row\) \? prev : new Set\(prev\)\.add\(row\)\)\)/.test(tree) &&
        /data-block-row=\{key\}/.test(editor))
    /**
     * By its own container, not by `scrollIntoView`, which walks EVERY
     * scrollable ancestor — so on a phone, where the sidebar is a sheet over
     * the canvas, bringing a row into view brought the canvas with it.
     */
    check("and is scrolled into view", /\[data-block-row="\$\{window\.CSS\.escape\(selectedBlockId\)\}"\]/.test(editor) && /scroller\.scrollBy\(\{ top: delta, behavior: "smooth" \}\)/.test(editor))
    check("deleting the selected block clears the selection", /setSelectedBlockId\(prev => \(prev && \(prev === key \|\| prev === blockKey \|\| prev\.startsWith\(`\$\{key\}\/`\)\) \? null : prev\)\)/.test(editor))
    check("every section in the library that has blocks marks them for the canvas", (() => {
      const missing = ADDABLE_SECTIONS.filter((t) => {
        const s = STORELIB_SCHEMAS[t]
        if (!(s.blocks ?? []).length) return false
        const file = join(root, `themes/default/sections/${t}.storelib`)
        return !untt(readFileSync(file, "utf8"), file).includes("data-block-id")
      })
      return missing.length === 0
    })())
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("A block is moved by its grip, not by arrows")
  // ═══════════════════════════════════════════════════════════════════════
  /**
   * The rows had an up arrow, a down arrow and a red bin. Now a grip drags
   * the row, with a mouse or a finger, through the hook the link list uses,
   * and the bin is grey. scripts/check-block-list.mjs drags it in a browser.
   */
  {
    check("no Move up or Move down on a block row", !/aria-label="Move (up|down)"/.test(blockList) && !/aria-label="Move (up|down)" disabled=\{at/.test(editor))
    check("the grip is the shared drag hook's", /useReorder<HTMLDivElement>\(/.test(blockList) && /\{\.\.\.gripProps\(i\)\}/.test(blockList) && /data-reorder-row=\{still \? undefined : ""\}/.test(blockList))
    check("a drag commits once, through reorderBlocks", /reorder: \(next, parentKey\) => reorderBlocks\(s\.id, next, parentKey\)/.test(editor) && /onReorder=\{\(next\) => ops\.reorder\(next, parentKey\)\}/.test(editor) && /onReorder\(next\)/.test(untt(readFileSync(join(root, "components/website-builder/editor/block-tree-rows.tsx"), "utf8"), "components/website-builder/editor/block-tree-rows.tsx")))
    check("picking a row up closes the open ones first", /onStart: \(\) => setOpen\(/.test(blockList))
    check("the bin is grey, never red", !/red-/.test(blockList) && /aria-label=\{`Delete \$\{name\}`\}[^>]*className=\{ROW_ACTION\}/.test(blockList))
    check("rows are 40px, 48px on a phone", /h-10 max-sm:h-12/.test(blockList))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
