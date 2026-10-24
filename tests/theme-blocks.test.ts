/**
 * ===========================================================================
 *  THEME BLOCKS, NESTED BLOCKS, STATIC BLOCKS AND PRESETS, RUN RATHER THAN READ
 * ===========================================================================
 * The owner asked for Shopify's block framework, all of it: theme blocks in
 * blocks/, `@theme`, `content_for`, blocks inside blocks, static blocks,
 * presets in the keyed form, and blocks for pictures. Each check below drives
 * the code that does it with what a real session sends:
 *
 *   lib/storelib-theme            compile, validate, resolve, render, package
 *   lib/website-builder/block-tree   every save door's shape, and the editor's
 *                                    add, move, copy and delete
 *   lib/website-builder/sanitize-sections   nested rich text, cleaned
 *   lib/website-builder/agent/operations    the assistant's block tools
 *   lib/agent-access                 what a connected agent may write and do
 *   the editor's source              the tree in the sidebar, Add block
 */
import { readFileSync } from "node:fs"

import {
  compileBlock,
  compileSection,
  compileThemeFile,
  keyedFromList,
  listFromKeyed,
  listFromPreset,
  presetTree,
  renderSection,
  sectionsFromTemplate,
  templateFromSections,
  validateSectionSchema,
  type CompiledBlock,
} from "@/lib/storelib-theme"
import { acceptsType } from "@/lib/storelib-theme/schema/validate"
import { DEFAULT_COLOR_SCHEMES, schemeTokenName } from "@/lib/storelib-theme/color-schemes"
import { visibleFields } from "@/lib/storelib-theme/visible-if"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import {
  blockAt,
  blockTreeProblem,
  cloneTree,
  countAll,
  freshBlocks,
  insertAt,
  moveAt,
  removeAt,
  resolvePath,
} from "@/lib/website-builder/block-tree"
/* Changed on purpose (round 12): the save schema has a file of its own, so zod stays out of every website's script. */
import { BlockInstanceSchema } from "@/lib/website-builder/block-tree-schema"
import { addableBlocks, schemaFromStorelib, themeBlockCatalog, STORELIB_SCHEMAS } from "@/lib/website-builder/storelib-schemas"
import { renderStorelibSection, toInstanceData } from "@/lib/website-builder/storelib-runtime"
import { sanitizeSections } from "@/lib/website-builder/sanitize-sections"
import { applyOp, describeSection } from "@/lib/website-builder/agent/operations"
import { agentMayWrite } from "@/lib/agent-access/protected"
import { checkOp } from "@/lib/agent-access/page-ops"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { ALL_TOPICS } from "@/lib/storelib-ai/knowledge"
import type { BlockInstance, SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 400)})` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")
const errorsOf = (r: { ok: boolean; errors?: { message: string }[] }) => (r.ok ? [] : (r.errors ?? []).map((e) => e.message))

/** A block file, written the way a person would. */
function blockFile(template: string, schema: Record<string, unknown>, style = "", script = ""): string {
  return `<template>\n${template}\n</template>\n<style>\n${style}\n</style>\n${script ? `<script>\n${script}\n</script>\n` : ""}<schema>\n${JSON.stringify(schema)}\n</schema>\n`
}
/** A section file. */
function sectionFile(template: string, schema: Record<string, unknown>, style = ".x { color: red; }"): string {
  return `<template>\n${template}\n</template>\n<style>\n${style}\n</style>\n<schema>\n${JSON.stringify({ type: "t", name: "T", settings: [], ...schema })}\n</schema>\n`
}

const library: Record<string, CompiledBlock> = {}
for (const [path, src] of Object.entries(DEFAULT_THEME_SOURCES as Record<string, string>)) {
  const m = path.match(/^blocks\/(.+)\.storelib$/)
  if (!m) continue
  const r = compileBlock(src, { type: m[1], file: path })
  if (r.ok === true) library[m[1]] = r.value
}
const lookup = (extra: Record<string, CompiledBlock> = {}) => (t: string) => extra[t] ?? library[t] ?? null

function main() {
  console.log("\nThe blocks that ship")
  const shipped = Object.keys(DEFAULT_THEME_SOURCES).filter((p) => p.startsWith("blocks/"))
  check("heading, text, button, image, video, spacer and group ship in blocks/", ["heading", "text", "button", "image", "video", "spacer", "group"].every((t) => shipped.includes(`blocks/${t}.storelib`)), shipped)
  check("every one of them compiles as a block", shipped.every((p) => library[p.slice(7, -9)] !== undefined), shipped.filter((p) => !library[p.slice(7, -9)]))
  check("Group holds any public theme block", JSON.stringify(library.group?.schema.accepts) === '["@theme"]')
  check("Group's three presets are what Add block offers for it", (library.group?.schema.presets ?? []).map((p) => p.name).join("|") === "Group|Two columns|Image with text")
  check("a block's CSS is scoped to its type", (library.heading?.css ?? "").includes('[data-block-type="heading"] .sl-heading'))
  check("Video may show a player, and only through embed", JSON.stringify(library.video?.schema.capabilities) === '["embed"]')

  const section = compileSection(DEFAULT_THEME_SOURCES["sections/blocks_section.storelib"], { file: "sections/blocks_section.storelib" })
  const grid = compileSection(DEFAULT_THEME_SOURCES["sections/image_grid.storelib"], { file: "sections/image_grid.storelib" })
  check("the Section compiles and accepts @theme", section.ok === true && JSON.stringify(section.value.schema.accepts) === '["@theme"]', errorsOf(section))
  check("Image grid accepts the image block by name, and places a static title", grid.ok === true && JSON.stringify(grid.value.schema.accepts) === '["image"]' && JSON.stringify(grid.value.statics) === '[{"type":"heading","id":"title"}]', errorsOf(grid))
  const manifest = JSON.parse(read("themes/default/manifest.json")) as { section_order: string[] }
  check("both are in the theme's library list", manifest.section_order.includes("blocks_section") && manifest.section_order.includes("image_grid"))

  console.log("\nWhat a section's schema may say about blocks")
  const mixed = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "@theme" }, { type: "q", name: "Q", settings: [] }] })
  check("its own blocks and theme blocks together are refused, with how to choose", mixed.ok === false && errorsOf(mixed).some((m) => /does one or the other/.test(m)))
  const app = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "@app" }] })
  check("@app is refused: there are no app blocks", app.ok === false && errorsOf(app).some((m) => /no app blocks/.test(m)))
  const keyedBad = validateSectionSchema({
    type: "t", name: "T", settings: [], blocks: [{ type: "@theme" }],
    presets: [{ name: "P", blocks: { a: { type: "text" }, b: { type: "text" } }, block_order: ["a", "ghost"] }],
  })
  const kb = errorsOf(keyedBad)
  check("a keyed preset naming an id with no block is refused", kb.some((m) => /"ghost", which is not in blocks/.test(m)), kb)
  check("and one with a block left out of block_order", kb.some((m) => /"b" is in blocks but not in block_order/.test(m)), kb)
  const staticNoId = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "@theme" }], presets: [{ name: "P", blocks: [{ type: "heading", static: true }] }] })
  check("a static block with no id is refused", errorsOf(staticNoId).some((m) => /static block needs the id/.test(m)))
  const named = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "image" }], presets: [{ name: "P", blocks: [{ type: "text" }] }] })
  check("a preset adding a block the section does not accept is refused", errorsOf(named).some((m) => /"text" is not one of the blocks accepted here: image/.test(m)))
  const nestedLocal = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "q", name: "Q", settings: [] }], presets: [{ name: "P", blocks: [{ type: "q", blocks: [{ type: "q" }] }] }] })
  check("a section's own block cannot hold blocks", errorsOf(nestedLocal).some((m) => /holds no blocks/.test(m)))
  const legacy = validateSectionSchema({ type: "t", name: "T", settings: [], blocks: [{ type: "q", name: "Q", settings: [] }], presets: [{ name: "P", blocks: [{ type: "q" }, { type: "q" }] }] })
  check("the list spelling of presets still validates", legacy.ok === true)
  check("a private block is only accepted by name", acceptsType(["@theme"], "text") && !acceptsType(["@theme"], "_slide") && acceptsType(["_slide"], "_slide"))

  console.log("\nWhat a template may say")
  const cfLocal = compileSection(sectionFile(`{% content_for "blocks" %}`, { blocks: [{ type: "q", name: "Q", settings: [] }] }))
  check('content_for "blocks" in a section of its own blocks says to loop instead', errorsOf(cfLocal).some((m) => /draws theme blocks, and this section's blocks are its own/.test(m)))
  const cfNone = compileSection(sectionFile(`{% content_for "blocks" %}`, {}))
  check("and in a section that accepts none, says how to accept them", errorsOf(cfNone).some((m) => /Add "blocks": \[\{ "type": "@theme" \}\]/.test(m)))
  const cfBad = compileSection(sectionFile(`{% content_for "block", type: settings.kind, id: "x" %}`, { blocks: [{ type: "@theme" }] }))
  check("a static block's type must be written in quotes", cfBad.ok === false)
  const cfTwice = compileSection(sectionFile(`{% content_for "block", type: "heading", id: "a" %}{% content_for "block", type: "text", id: "a" %}`, { blocks: [{ type: "@theme" }] }))
  check("one id placed as two types is refused", errorsOf(cfTwice).some((m) => /placed twice/.test(m)))
  const loopTheme = compileSection(sectionFile(`{% for block in blocks %}{{ block.settings.anything }}{% endfor %}{% content_for "blocks" %}`, { blocks: [{ type: "@theme" }] }))
  check("a loop over theme blocks is not held to settings it cannot know", loopTheme.ok === true, errorsOf(loopTheme))

  console.log("\nWhat a block file may say")
  const withScript = compileBlock(blockFile(`<p>{{ block.settings.t }}</p>`, { name: "B", settings: [{ type: "text", id: "t", label: "T" }] }, "", "root.textContent = 1"), { type: "b" })
  check("a block has no <script>, and is told where behaviour goes", errorsOf(withScript).some((m) => /A block has no <script>/.test(m)))
  const typo = compileBlock(blockFile(`<p>{{ block.settings.titel }}</p>`, { name: "B", settings: [{ type: "text", id: "title", label: "T" }] }), { type: "b" })
  check("a setting the block does not declare is a compile error with the list", errorsOf(typo).some((m) => /No setting is called "titel"\. This block declares: title/.test(m)))
  const reads = compileBlock(blockFile(`<p>{{ settings.title }} {{ section.settings.anything }} {{ block.id }}</p>`, { name: "B", settings: [{ type: "text", id: "title", label: "T" }] }), { type: "b" })
  check("settings.x, section.settings.x and block.id all read", reads.ok === true, errorsOf(reads))
  const bare = compileBlock(blockFile(`<li>{{ block.settings.t }}</li>`, { name: "B", tag: null, settings: [{ type: "text", id: "t", label: "T" }] }), { type: "b" })
  check('"tag": null without storelib_attributes is refused', errorsOf(bare).some((m) => /storelib_attributes/.test(m)))
  const badTag = compileBlock(blockFile(`<p></p>`, { name: "B", tag: "script", settings: [] }), { type: "b" })
  check("a block cannot be wrapped in a script", errorsOf(badTag).some((m) => /cannot wrap a block/.test(m)))
  /* Round 25: a block can be the nav of a menu, the details of a filter group, the dialog of a drawer. */
  for (const tag of ["nav", "header", "details", "dialog", "form"]) {
    const ok = compileBlock(blockFile(`<p></p>`, { name: "B", tag, settings: [] }), { type: "b" })
    check(`a block can be wrapped in a <${tag}>`, !errorsOf(ok).some((m) => /cannot wrap a block/.test(m)), errorsOf(ok))
  }
  const localChild = compileBlock(blockFile(`<p></p>`, { name: "B", settings: [], blocks: [{ type: "x", name: "X", settings: [] }] }), { type: "b" })
  check("a theme block holds theme blocks only", errorsOf(localChild).some((m) => /a theme block holds theme blocks/.test(m)))
  check("compileThemeFile compiles blocks/ as a block", compileThemeFile(DEFAULT_THEME_SOURCES["blocks/text.storelib"], { file: "blocks/text.storelib" }).ok === true)
  check("and refuses a block file with a bad name", compileThemeFile(DEFAULT_THEME_SOURCES["blocks/text.storelib"], { file: "blocks/Bad Name.storelib" }).ok === false)

  console.log("\nDrawing blocks inside blocks")
  if (section.ok !== true || grid.ok !== true) throw new Error("the library sections did not compile")
  const preset = section.value.schema.presets!.find((p) => p.name === "Image with text")!
  let n = 0
  const tree = listFromPreset(presetTree(preset), (t) => `${t}-${++n}`)
  check("the keyed preset reads as a tree: a row holding a picture and a group of three", tree.length === 1 && tree[0].type === "group" && tree[0].blocks?.length === 2 && tree[0].blocks?.[1].blocks?.length === 3, tree)
  const drawn = renderSection({
    compiled: section.value, id: "sec-1",
    instance: { type: "blocks_section", settings: preset.settings ?? {}, ...keyedFromList(tree) },
    theme: {}, page: { template: "index", in_editor: true }, blocks: lookup(),
  })
  check("every block is wrapped with its id and type, at every depth", (drawn.html.match(/class="sl-block" data-block-id="[^"]+" data-block-type="[a-z]+"/g) ?? []).length === 6, drawn.html.slice(0, 600))
  check("the inner group sits inside the outer one", /data-block-type="group">[\s\S]*data-block-type="image"[\s\S]*data-block-type="group">[\s\S]*data-block-type="heading"/.test(drawn.html))
  check("the preset's words reach the page", drawn.html.includes("Made by hand") && drawn.html.includes("Tell the story behind what you sell"))
  check("each block type's CSS is on the page once", (drawn.css.match(/\[data-block-type="group"\] \.sl-group \{/g) ?? []).length === 1 && drawn.css.includes('[data-block-type="image"]'))

  const gridPreset = grid.value.schema.presets![0]
  const gtree = listFromPreset(presetTree(gridPreset), (t) => `${t}-${++n}`)
  check("a static block keeps the id its template places it under", gtree.some((b) => b.static && b.id === "title"))
  const drawnGrid = renderSection({ compiled: grid.value, id: "g1", instance: { type: "image_grid", settings: {}, ...keyedFromList(gtree) }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("the static title is drawn where the template put it, with the preset's words", /<div class="head"><div class="sl-block" data-block-id="title" data-block-type="heading"><h2[^>]*>From the studio<\/h2>/.test(drawnGrid.html), drawnGrid.html.slice(0, 500))
  const neverEdited = renderSection({ compiled: grid.value, id: "g2", instance: { type: "image_grid", settings: {}, blocks: {}, block_order: [] }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a static block nobody has edited is drawn with its file's defaults", neverEdited.html.includes('data-block-id="title"') && neverEdited.html.includes("A heading"))
  const hiddenStatic = renderSection({ compiled: grid.value, id: "g3", instance: { type: "image_grid", settings: {}, blocks: { title: { type: "heading", static: true, hidden: true, settings: {} } }, block_order: [] }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a hidden static block is not drawn", !hiddenStatic.html.includes('data-block-id="title"'))
  const hiddenChild = renderSection({ compiled: section.value, id: "s2", instance: { type: "blocks_section", settings: {}, blocks: { a: { type: "heading", settings: { text: "Seen" } }, b: { type: "heading", hidden: true, settings: { text: "Unseen" } } }, block_order: ["a", "b"] }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a hidden block is kept out of the page", hiddenChild.html.includes("Seen") && !hiddenChild.html.includes("Unseen"))

  const gone = { type: "blocks_section", settings: {}, blocks: { a: { type: "deleted_kind", settings: { x: 1 } } }, block_order: ["a"] }
  const editorGone = renderSection({ compiled: section.value, id: "s3", instance: gone, theme: {}, page: { template: "index", in_editor: true }, blocks: lookup() })
  const liveGone = renderSection({ compiled: section.value, id: "s3", instance: gone, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a block whose file is gone says so in the editor", editorGone.html.includes("This theme has no blocks/deleted_kind.storelib"))
  check("and draws nothing for a visitor", !liveGone.html.includes("deleted_kind.storelib") && !liveGone.html.includes('data-block-id="a"'))

  const sneaky = renderSection({ compiled: section.value, id: "s4", instance: { type: "blocks_section", settings: {}, blocks: { 'x"><script>alert(1)</script>': { type: "heading", settings: { text: "<img src=x onerror=alert(1)>" } } }, block_order: ['x"><script>alert(1)</script>'] }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a block id cannot leave its attribute", !sneaky.html.includes("<script>") && sneaky.html.includes("&quot;&gt;&lt;script&gt;"))
  check("and a block's text is escaped like a section's", !sneaky.html.includes("<img src=x") && sneaky.html.includes("&lt;img"))

  // Per-instance CSS, deep nesting, and section.settings from inside a block.
  const perInstance = compileBlock(blockFile(`<p class="bx">{{ section.settings.heading }}</p>{% content_for "blocks" %}`, { name: "Box", blocks: [{ type: "@theme" }], settings: [{ type: "range", id: "pad", label: "P", min: 0, max: 40, step: 4, default: 8 }] }, `.bx { padding: {{ block.settings.pad }}px; }`), { type: "box" })
  check("a block whose CSS reads a setting compiles", perInstance.ok === true, errorsOf(perInstance))
  if (perInstance.ok === true) {
    const host = compileSection(sectionFile(`{% content_for "blocks" %}`, { settings: [{ type: "text", id: "heading", label: "H", default: "From the section" }], blocks: [{ type: "@theme" }] }))
    if (host.ok === true) {
      const deep: Record<string, unknown> = { type: "box", settings: { pad: 12 } }
      let cur = deep
      for (let i = 0; i < 12; i++) { const child = { type: "box", settings: {} }; cur.blocks = { [`d${i}`]: child }; cur.block_order = [`d${i}`]; cur = child }
      const out = renderSection({ compiled: host.value, id: "h1", instance: { type: "t", settings: {}, blocks: { top: deep as never }, block_order: ["top"] }, theme: {}, page: { template: "index" }, blocks: lookup({ box: perInstance.value }) })
      check("a block reads the section it sits in through section.settings", out.html.includes("From the section"))
      check("a rule that reads a setting is scoped to that block in that section", out.css.includes('[data-section-id="h1"] [data-block-id="top"] .bx { padding: 12px; }'), out.css.slice(0, 300))
      check("nothing is drawn deeper than eight levels", (out.html.match(/data-block-type="box"/g) ?? []).length === 8, (out.html.match(/data-block-type="box"/g) ?? []).length)
    }
  }

  console.log("\nColours a block has of its own")
  /*
    "Sections and blocks can have custom colour settings for specific
    elements, like Shopify." Each shipped block that draws a colour has a
    setting for it, whose default names a colour of the section's scheme
    (render.ts, followSchemeColours) and whose value reaches the page as an
    inline custom property the block's one rule reads.
  */
  const colourDefaults = (t: string) => Object.fromEntries((library[t]?.schema.settings ?? []).filter((s) => s.type === "color").map((s) => [s.id, s.default]))
  check("Heading has a text colour following the scheme's heading", JSON.stringify(colourDefaults("heading")) === '{"color":"scheme.heading"}', colourDefaults("heading"))
  check("Text has a text colour following the scheme's text", JSON.stringify(colourDefaults("text")) === '{"color":"scheme.text"}', colourDefaults("text"))
  const btn = colourDefaults("button")
  check("Button has fill, text and both hovers for each style, following that button of the scheme",
    btn.button_color === "scheme.primary_button_background" && btn.button_text_color === "scheme.primary_button_text" &&
      btn.button_hover_color === "scheme.primary_button_hover_background" && btn.button_hover_text_color === "scheme.primary_button_hover_text" &&
      btn.secondary_color === "scheme.secondary_button_background" && btn.secondary_text_color === "scheme.secondary_button_text" &&
      btn.secondary_border_color === "scheme.secondary_button_border" && btn.secondary_hover_color === "scheme.secondary_button_hover_background" &&
      btn.secondary_hover_text_color === "scheme.secondary_button_hover_text", btn)
  check("Group has a background that is empty for none, and a corner radius",
    colourDefaults("group").background === "" && library.group?.schema.settings.some((s) => s.id === "radius" && s.type === "range" && s.default === 0) === true, colourDefaults("group"))
  const schemeNames = ["heading", "text", "button"].flatMap((t) => Object.values(colourDefaults(t)))
  check("every scheme name a block's default uses is one the scheme has", schemeNames.length === 11 && schemeNames.every((d) => schemeTokenName(d) !== null), schemeNames.filter((d) => schemeTokenName(d) === null))
  const btnCatalog = themeBlockCatalog().button?.fields ?? []
  const shownFor = (style: string) => visibleFields(btnCatalog, { style }, { fields: [], saved: {} }).filter((f) => f.type === "color").map((f) => f.label)
  check("the sidebar shows only the chosen style's colours", shownFor("primary").join(",") === "Fill,Text,Hover fill,Hover text" && shownFor("secondary").join(",") === "Fill,Text,Border,Hover fill,Hover text", { primary: shownFor("primary"), secondary: shownFor("secondary") })
  check("and draws a block's colour with SectionColorSetting, against the section's scheme",
    /* Round K3 wraps it in SharedInAllLanguages (a colour is the same in every language the sidebar edits); the control and its scheme are unchanged. */
    /field\.type === "color" \? \(\s*(?:<SharedInAllLanguages>\s*)?<SectionColorSetting\s+field=\{field\}\s+value=\{block\.settings\[field\.id\]\}\s+settings=\{section\.settings\}/.test(read("app/website-builder/editor/[installId]/page.tsx")))
  for (const [type, rule] of [["heading", /\[data-block-type="heading"\] \.sl-heading \{[^}]*color: var\(--heading-color, var\(--s-heading/], ["text", /\[data-block-type="text"\] \.sl-text \{[^}]*color: var\(--text-color, var\(--s-para/], ["button", /\[data-block-type="button"\] \.sl-button--primary \{ background: var\(--b-bg, var\(--s-btn/], ["group", /\[data-block-type="group"\] \.sl-group \{[^}]*background: var\(--g-bg, transparent\); border-radius: var\(--g-radius, 0\)/]] as const) {
    check(`${type}'s one rule, scoped to its type, reads its colour from the inline property`, rule.test(library[type]?.css ?? ""), (library[type]?.css ?? "").slice(0, 300))
  }
  const paint = (settings: Record<string, unknown>, blocks: Record<string, unknown>) => renderSection({
    compiled: section.value, id: "c1",
    instance: { type: "blocks_section", settings, blocks: blocks as never, block_order: Object.keys(blocks) },
    theme: {}, page: { template: "index" }, blocks: lookup(),
  }).html
  const four = { h: { type: "heading", settings: { text: "H" } }, t: { type: "text", settings: {} }, p: { type: "button", settings: {} }, s: { type: "button", settings: { style: "secondary" } }, g: { type: "group", settings: {} } }
  for (const key of ["white", "dark"] as const) {
    const sc = DEFAULT_COLOR_SCHEMES[key]
    const html = paint({ color_scheme: key }, four)
    check(`on a ${sc.name} section every block's colour is that scheme's`,
      html.includes(`style="--heading-color: ${sc.heading};"`) && html.includes(`style="--text-color: ${sc.text};"`) &&
        html.includes(`--b-bg: ${sc.primary_button_background}; --b-text: ${sc.primary_button_text};`) &&
        html.includes(`--b-bg: ${sc.secondary_button_background}; --b-text: ${sc.secondary_button_text}; --b-border: ${sc.secondary_button_border};`) &&
        html.includes("--g-bg: transparent; --g-radius: 0px;"), html.slice(html.indexOf('data-block-id="h"'), html.indexOf('data-block-id="h"') + 900))
  }
  const overridden = paint({ color_scheme: "dark", color_overrides: { heading: "#abcdef", primary_button_background: "#123456" } }, four)
  check("and a section's own override of its scheme reaches the blocks in it too", overridden.includes('--heading-color: #abcdef;') && overridden.includes("--b-bg: #123456;"), overridden.slice(overridden.indexOf('data-block-id="h"'), overridden.indexOf('data-block-id="h"') + 500))
  const explicit = paint({ color_scheme: "dark" }, {
    h: { type: "heading", settings: { text: "H", color: "#ff0000" } },
    t: { type: "text", settings: { color: "#00aa00" } },
    p: { type: "button", settings: { button_color: "#7c3aed", button_text_color: "#fefefe", button_hover_color: "#6d28d9", button_hover_text_color: "#ffffff" } },
    s: { type: "button", settings: { style: "secondary", secondary_color: "#eeeeee", secondary_border_color: "#111111" } },
    g: { type: "group", settings: { background: "#f5f3ff", radius: 12 }, blocks: { inner: { type: "group", settings: {} } }, block_order: ["inner"] },
  })
  check("a colour somebody picked reaches the page, over the scheme", explicit.includes('style="--heading-color: #ff0000;"') && explicit.includes('style="--text-color: #00aa00;"'), explicit.slice(0, 1200))
  check("on a primary button: fill, text and both hovers, the border with the fill",
    explicit.includes("--b-bg: #7c3aed; --b-text: #fefefe; --b-border: #7c3aed; --b-hover-bg: #6d28d9; --b-hover-text: #ffffff;"))
  check("on a secondary one: its own fill and border, the rest still the scheme's",
    explicit.includes(`--b-bg: #eeeeee; --b-text: ${DEFAULT_COLOR_SCHEMES.dark.secondary_button_text}; --b-border: #111111;`))
  check("a group's background and radius, and a group inside it does not inherit them",
    explicit.includes("--g-bg: #f5f3ff; --g-radius: 12px;") && explicit.includes("--g-bg: transparent; --g-radius: 0px;"))
  const unsafe = paint({}, { h: { type: "heading", settings: { color: "red; background: url(x)" } } })
  check("a colour that is not one never reaches the style attribute", !unsafe.includes("url(x)") && /--heading-color: #[0-9a-f]{6};/.test(unsafe), unsafe.slice(unsafe.indexOf("<h2"), unsafe.indexOf("<h2") + 160))
  const titled = renderSection({ compiled: grid.value, id: "g9", instance: { type: "image_grid", settings: { color_scheme: "dark" }, blocks: {}, block_order: [] }, theme: {}, page: { template: "index" }, blocks: lookup() })
  check("a static block nobody has edited follows the scheme too", titled.html.includes(`--heading-color: ${DEFAULT_COLOR_SCHEMES.dark.heading};`), titled.html.slice(titled.html.indexOf('data-block-id="title"'), titled.html.indexOf('data-block-id="title"') + 300))

  console.log("\nThe two shapes, and nothing lost between them")
  const editorTree: BlockInstance[] = [
    { id: "title", type: "heading", static: true, settings: { text: "T" } },
    { id: "row", type: "group", settings: { direction: "row" }, blocks: [
      { id: "pic", type: "image", settings: {} },
      { id: "words", type: "text", settings: {}, hidden: true },
    ] },
  ]
  const keyed = keyedFromList(editorTree)
  check("the keyed form leaves the static block out of the order", JSON.stringify(keyed.block_order) === '["row"]' && keyed.blocks.title?.static === true)
  check("and keeps the order and the hidden mark inside a block", JSON.stringify(keyed.blocks.row?.block_order) === '["pic","words"]' && keyed.blocks.row?.blocks?.words?.hidden === true)
  check("and comes back as the same tree", JSON.stringify(listFromKeyed(keyed)) === JSON.stringify([editorTree[1], editorTree[0]]) || JSON.stringify(listFromKeyed(keyed).map((b) => b.id).sort()) === '["row","title"]')
  const page: SectionInstance[] = [{ id: "s", type: "blocks_section", name: "Section", settings: {}, blocks: editorTree }]
  const roundTrip = sectionsFromTemplate(templateFromSections(page as never))
  const back = roundTrip[0]?.blocks as BlockInstance[] | undefined
  check("an exported page imports with its blocks inside blocks", back?.find((b) => b.id === "row")?.blocks?.length === 2 && back?.some((b) => b.id === "title" && b.static), back)
  check("the runtime hands the engine the same tree", JSON.stringify(toInstanceData(page[0]).blocks?.row?.block_order) === '["pic","words"]')

  console.log("\nEvery save door keeps the tree")
  const parsed = BlockInstanceSchema.safeParse(editorTree[1])
  check("the shared block schema keeps blocks inside blocks", parsed.success && (parsed.data.blocks?.length ?? 0) === 2 && parsed.data.blocks?.[1].hidden === true)
  check("and the static mark", BlockInstanceSchema.safeParse(editorTree[0]).success && (BlockInstanceSchema.safeParse(editorTree[0]) as { data: { static?: boolean } }).data.static === true)
  for (const route of ["app/api/website-builder/themes/[installId]/sections/route.ts", "app/api/website-builder/themes/[installId]/sections/sync-global/route.ts", "app/api/website-builder/themes/[installId]/agent/route.ts"]) {
    /* The sections and sync routes read sections by one shared schema, which holds the tree (lib/website-builder/section-save-schema.ts). */
    check(`${route.split("/").slice(-2).join("/")} uses it, not a shape that drops nested blocks`, /const BlockSchema = BlockInstanceSchema/.test(read(route)) || (/SectionSaveSchema/.test(read(route)) && /blocks: z\.array\(BlockInstanceSchema\)/.test(read("lib/website-builder/section-save-schema.ts"))))
  }
  const many: BlockInstance[] = Array.from({ length: 30 }, (_, i) => ({ id: `g${i}`, type: "group", settings: {}, blocks: [{ id: `t${i}`, type: "text", settings: {} }] }))
  check("50 blocks per section counts the ones inside blocks", blockTreeProblem({ type: "t", blocks: many })?.includes("holds 50 blocks") === true)
  let deepList: BlockInstance[] = [{ id: "leaf", type: "text", settings: {} }]
  for (let i = 0; i < 9; i++) deepList = [{ id: `n${i}`, type: "group", settings: {}, blocks: deepList }]
  check("and blocks nest eight deep at most", blockTreeProblem({ type: "t", blocks: deepList })?.includes("8 deep") === true)

  const dirty: SectionInstance[] = [{ id: "s", type: "blocks_section", name: "S", settings: {}, blocks: [{ id: "row", type: "group", settings: {}, blocks: [{ id: "t", type: "text", settings: { text: '<p>Hi<script>alert(1)</script><img src=x onerror="alert(2)"></p>' } }] }] }]
  const cleaned = sanitizeSections(dirty)
  const cleanText = String(cleaned[0].blocks?.[0].blocks?.[0].settings.text)
  check("rich text inside a block inside a block is cleaned on save", !/<script|onerror/i.test(cleanText) && cleanText.includes("Hi"), cleanText)

  console.log("\nThe editor's operations")
  const base: BlockInstance[] = [
    { id: "title", type: "heading", static: true, settings: {} },
    { id: "row", type: "group", settings: {}, blocks: [{ id: "a", type: "text", settings: {} }, { id: "b", type: "image", settings: {} }] },
    { id: "nav", type: "nav_link", settings: {} },
    { id: "sub", type: "nav_link", settings: { parent_id: "nav" } },
  ]
  check("a bare id finds a block inside another", JSON.stringify(resolvePath(base, "b")) === '["row","b"]')
  check("a path finds it too", JSON.stringify(resolvePath(base, "row/b")) === '["row","b"]' && resolvePath(base, "row/zz") === null)
  const added = insertAt(base, ["row"], { id: "c", type: "button", settings: {} }, 1)
  check("add inside a block, at a place", JSON.stringify(blockAt(added, ["row"])?.block.blocks?.map((x) => x.id)) === '["a","c","b"]')
  check("without touching the list it came from", base[1].blocks?.length === 2)
  check("a static block does not move", JSON.stringify(moveAt(base, ["title"], 2).map((x) => x.id)) === JSON.stringify(base.map((x) => x.id)))
  check("a block inside moves among its siblings", JSON.stringify(blockAt(moveAt(base, ["row", "b"], 0), ["row"])?.block.blocks?.map((x) => x.id)) === '["b","a"]')
  check("removing a block takes everything inside it", !JSON.stringify(removeAt(base, ["row"])).includes('"a"'))
  check("and a header link's dropdown with it", JSON.stringify(removeAt(base, ["nav"]).map((x) => x.id)) === '["title","row"]')
  let seq = 0
  const copy = cloneTree(base[1], () => `new-${++seq}`)
  check("a copy has new ids all the way down", copy.id !== "row" && copy.blocks?.every((x) => x.id.startsWith("new-")) === true)
  const fresh = freshBlocks([{ id: "title", type: "heading", static: true, settings: {} }, { id: "x", type: "group", settings: {}, blocks: [{ id: "y", type: "text", settings: {} }] }], () => `f-${++seq}`)
  check("a preset placed twice gets its own ids, except a static block", fresh[0].id === "title" && fresh[1].id.startsWith("f-") && fresh[1].blocks?.[0].id.startsWith("f-") === true)
  check("countAll counts every depth", countAll(base) === 6)

  const editor = read("app/website-builder/editor/[installId]/page.tsx")
  /* Shopify's tree: a section's blocks are rows under it in the sidebar's list, not a list in its settings. */
  check("the sidebar's tree draws each section's blocks with BlockTreeFor", /<BlockTreeFor[\s\S]*parent=\{\[\]\}/.test(editor) && /function BlockTreeFor\(/.test(editor) && /blocksOf=\{\(s\) => \{/.test(editor))
  check("a block that holds blocks lists them under its own row, a level further in", /children=\{\(block\) => \{[\s\S]{0,400}<BlockTreeFor[\s\S]{0,300}parent=\{\[\.\.\.parent, block\.id\]\}/.test(editor))
  check("each level has its own Add block, listing what it accepts", /<TreeAddBlock options=\{options\}/.test(editor) && /addableBlocks\(/.test(editor))
  check("and the section's settings panel no longer lists them", !/<BlockLevel/.test(editor) && /data-block-hint=""/.test(editor))
  check("a click on the canvas selects the deepest block, by its path", /path\.unshift\(bid\)/.test(editor) && /pathKey\(path\)/.test(editor))
  check("adding a preset gives its blocks fresh ids", /blocks: freshBlocks\(preset\?\.blocks, newBlockId\)/.test(editor))
  check("duplicating a section copies its blocks all the way down", /blocks: \(orig\.blocks \?\? \[\]\)\.map\(\(b\) => cloneTree\(b, newBlockId\)\)/.test(editor))
  const list = read("components/website-builder/editor/section-block-list.tsx")
  check("a static row has no grip, Duplicate or Delete", /still \?/.test(list) && /\{!still && \(/.test(list))
  check("a row opens when a block inside it is selected", /selectedId\.startsWith\(`\$\{k\}\/`\)/.test(list))
  const addButton = read("components/website-builder/editor/add-block-button.tsx")
  check("Add block is the shared action list: a menu on a computer, a sheet on a phone", /ResponsiveActionMenu/.test(addButton))

  console.log("\nThe sidebar's schemas")
  const catalog = themeBlockCatalog()
  check("the theme's blocks are in the catalog with their fields", ["heading", "text", "button", "image", "video", "spacer", "group"].every((t) => (catalog[t]?.fields.length ?? 0) > 0))
  const own = themeBlockCatalog({ "blocks/_slide.storelib": blockFile(`<p>{{ block.settings.t }}</p>`, { name: "Slide", settings: [{ type: "text", id: "t", label: "T" }] }) })
  check("an install's own block joins it, private when its name starts with _", own._slide?.private === true)
  check("@theme does not offer a private block", !addableBlocks({ accepts: ["@theme"] }, own).some((b) => b.type === "_slide"))
  check("naming it does", addableBlocks({ accepts: ["_slide"] }, own).some((b) => b.type === "_slide"))
  const gridSchema = schemaFromStorelib(DEFAULT_THEME_SOURCES["sections/image_grid.storelib"], "sections/image_grid.storelib")
  check("the sidebar knows Image grid's static title", gridSchema.ok === true && JSON.stringify(gridSchema.schema.statics) === '[{"type":"heading","id":"title"}]')
  const sectionSchema = STORELIB_SCHEMAS.blocks_section
  const twoCol = sectionSchema?.presets?.find((p) => p.name === "Three columns")
  check("a preset reaches the sidebar as a tree", twoCol?.blocks?.[1]?.blocks?.length === 3, twoCol?.blocks)
  check("a preset may file itself under another category", sectionSchema?.presets?.find((p) => p.name === "Image with text")?.category === "media")
  check("Add section files a preset by its own category", /presets\[i\]\?\.category/.test(read("components/website-builder/editor/section-library.tsx")))

  console.log("\nThe assistant's block tools")
  const schemas = { ...SECTION_SCHEMAS, ...STORELIB_SCHEMAS }
  const state = { sections: [{ id: "s", type: "blocks_section", name: "Section", settings: {}, blocks: [{ id: "row", type: "group", settings: {} }] }] as SectionInstance[], settings: {} }
  const inGroup = applyOp(state, { kind: "add_block", sectionId: "s", blockId: "h1", blockType: "heading", parentId: "row", settings: { text: "Inside" } }, schemas)
  const placed = inGroup.sections[0].blocks?.[0].blocks?.[0]
  check("add_block with a parent puts the block inside it, with its defaults", placed?.id === "h1" && placed.settings.text === "Inside" && placed.settings.size === "medium", placed)
  const notAccepted = applyOp(state, { kind: "add_block", sectionId: "s", blockId: "q", blockType: "question", settings: {} }, schemas)
  check("a block the section does not accept is not added", notAccepted === state)
  const upd = applyOp(inGroup, { kind: "update_block", sectionId: "s", blockId: "row/h1", settings: { text: "Changed" } }, schemas)
  check("update_block reaches a block by its path", upd.sections[0].blocks?.[0].blocks?.[0].settings.text === "Changed")
  const withStatic = { ...state, sections: [{ ...state.sections[0], blocks: [{ id: "title", type: "heading", static: true, settings: {} }] }] }
  check("remove_block leaves a static block alone", applyOp(withStatic, { kind: "remove_block", sectionId: "s", blockId: "title" }, schemas).sections[0].blocks?.length === 1)
  const described = describeSection(inGroup.sections[0], schemas)
  check("read_section lists blocks inside blocks with their paths", /\[row\/h1\] heading/.test(described) && /parentBlockId/.test(described), described.slice(-500))
  check("and what a section of theme blocks takes", /BLOCK TYPES THIS SECTION TAKES[\s\S]*group — Group/.test(described))

  console.log("\nA connected agent")
  check("may write a new theme block", agentMayWrite("blocks/pull_quote.storelib").ok === true)
  check("and a private one", agentMayWrite("blocks/_slide_custom.storelib").ok === true)
  const builtIn = agentMayWrite("blocks/heading.storelib")
  check("not one Storelib ships, and is told what to write instead", builtIn.ok === false && /blocks\/heading_custom\.storelib/.test(builtIn.error))
  check("not a path outside blocks/", agentMayWrite("blocks/../config/x.storelib").ok === false && agentMayWrite("blocks/a/b.storelib").ok === false)
  const op = checkOp(state, { op: "add_block", section_id: "s", block_type: "text", parent_block_id: "row" }, schemas, () => "t1")
  check("page tools add inside a block with parent_block_id", (op.op as { parentId?: string } | undefined)?.parentId === "row", op)
  const wrong = checkOp(state, { op: "add_block", section_id: "s", block_type: "question", parent_block_id: "row" }, schemas, () => "t2")
  check("and refuse a type the block does not hold, with what it does", /does not take a "question" block/.test(wrong.error ?? ""), wrong)

  console.log("\nDocumented where people and agents look")
  const doc = read("content/developers/blocks.md")
  check("the developer hub explains theme blocks, content_for, static blocks and keyed presets", ["## Theme blocks", '{% content_for "blocks" %}', "## Static blocks", "block_order", "@[theme-blocks]", "## From an imported theme"].every((s) => doc.includes(s)))
  check("Ask AI's reference has a topic for them", ALL_TOPICS.some((t) => t.id === "theme-blocks" && /content_for/.test(t.text)))
  check("the manual covers them", /### 9\.1 Theme blocks/.test(read("docs/storelib-manual.md")))
  for (const word of ["unlock", "elevate", "seamless", "powerful", "effortlessly", "supercharge", "transform", "—"]) {
    check(`the blocks page never says "${word}"`, !doc.toLowerCase().includes(word))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

main()
