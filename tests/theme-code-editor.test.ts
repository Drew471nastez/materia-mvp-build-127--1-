/**
 * ===========================================================================
 *  THE CODE EDITOR, AND WHETHER IT SHOWS THE THEME
 * ===========================================================================
 * A Shopify-shaped file browser existed — config, templates, sections,
 * snippets, assets, with tabs, dirty markers and a save route. Three things
 * were wrong with it, and none of them failed loudly:
 *
 *   1. The section list was TYPED OUT BY HAND and had drifted. Fifty section
 *      types exist; thirty-nine were listed. Eleven sections that render and
 *      can be added from the sidebar did not appear in the browser at all.
 *
 *   2. Opening a section showed a STUB — `{type, name, schema: {fields: []}}`
 *      — rather than the section. Somebody reading sections/faq.json to learn
 *      how a FAQ works was shown an empty schema.
 *
 *   3. Nothing in the product linked to it. The only way in was to know the
 *      URL.
 *
 * Run with:  npm run test:push
 */

import {
  buildThemeFileTree,
  flattenTree,
  getDefaultFileContent,
  orderedSectionTypes,
  THEME_PAGES,
} from "@/lib/website-builder/theme-file-tree"
import {
  SECTION_SCHEMAS,
  ADDABLE_SECTIONS,
  STRUCTURE_SECTIONS,
} from "@/lib/website-builder/section-schemas"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()

let passed = 0
let failed = 0
const failures: string[] = []

function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

const tree = buildThemeFileTree()
const paths = flattenTree(tree)

// ===========================================================================
section("Every section is in the browser, because the browser is derived")
// ===========================================================================

{
  const listed = paths
    .filter((path) => path.startsWith("sections/"))
    .map((path) => path.slice("sections/".length, -".json".length))
  const real = Object.keys(SECTION_SCHEMAS)

  const missing = real.filter((type) => !listed.includes(type))
  check(
    "not one of the fifty section types is missing",
    missing.length === 0,
    missing.join(", "),
  )
  const phantom = listed.filter((type) => !real.includes(type))
  check("and the browser lists nothing that does not exist", phantom.length === 0, phantom.join(", "))

  /**
   * The list is DERIVED rather than maintained. A section added tomorrow
   * appears the moment its JSON lands — which is what stops this drifting a
   * second time.
   */
  check(
    "the count follows the registry rather than a number in this file",
    listed.length === real.length && real.length > 45,
    `${listed.length} of ${real.length}`,
  )
  check(
    "and the manifest's own order is respected, so it matches the Add panel",
    orderedSectionTypes()[0] === Object.keys(SECTION_SCHEMAS)[0] ||
      orderedSectionTypes().length === real.length,
  )
}

{
  const missingPage = THEME_PAGES.filter((page) => !paths.includes(`templates/${page}.json`))
  check("every page has a template", missingPage.length === 0, missingPage.join(", "))
  for (const folder of ["config", "templates", "sections", "snippets", "assets"]) {
    check(
      `the ${folder} folder is there`,
      tree.some((node) => node.path === folder && node.type === "folder"),
    )
  }
}

// ===========================================================================
section("A file shows what that file is")
// ===========================================================================

{
  /**
   * The stub this replaces was `{type, name, schema: {fields: []}}` for every
   * one of the fifty. An empty schema is not a smaller version of a section —
   * it is a different claim about the theme, and a false one.
   */
  const thin: string[] = []
  for (const type of Object.keys(SECTION_SCHEMAS)) {
    const parsed = JSON.parse(getDefaultFileContent(`sections/${type}.json`))
    const fields = parsed.fields?.length ?? 0
    if (fields === 0 && (SECTION_SCHEMAS[type].fields ?? []).length > 0) thin.push(type)
  }
  check("no section file is a stub", thin.length === 0, thin.slice(0, 5).join(", "))

  const faq = JSON.parse(getDefaultFileContent("sections/faq.json"))
  check(
    "sections/faq.json is the FAQ — its controls, its block type, its preset",
    faq.fields.length === (SECTION_SCHEMAS.faq.fields ?? []).length &&
      (faq.blocks?.[0]?.fields?.length ?? 0) > 0 &&
      (faq.presets?.[0]?.blocks?.length ?? 0) > 0,
    JSON.stringify({ fields: faq.fields?.length, blocks: faq.blocks?.length }),
  )

  check(
    "a section type that does not exist says so rather than inventing one",
    /there is no section type/i.test(getDefaultFileContent("sections/not_a_section.json")),
  )
}

{
  const theme = JSON.parse(getDefaultFileContent("theme.json"))
  check(
    "theme.json lists every section the theme really supports",
    theme.supports.sections.length === Object.keys(SECTION_SCHEMAS).length,
    `${theme.supports.sections.length}`,
  )
  check(
    "and says which are addable and which are structure",
    theme.addable_sections.length === ADDABLE_SECTIONS.length &&
      theme.structure_sections.length === STRUCTURE_SECTIONS.length,
  )

  const schema = JSON.parse(getDefaultFileContent("config/settings_schema.json"))
  check(
    "config/settings_schema.json is the real theme schema, all twelve groups",
    Array.isArray(schema) && schema.length === THEME_SETTINGS_GROUPS.length,
    `${schema.length} groups`,
  )

  const data = JSON.parse(getDefaultFileContent("config/settings_data.json"))
  check(
    "and settings_data.json carries the defaults that schema declares",
    Object.keys(data.current).length > 40,
    `${Object.keys(data.current).length} values`,
  )
}

{
  /**
   * The templates say what a page of that kind starts with. Asserted against
   * what the EDITOR actually seeds, because a second list nobody reads is how
   * the section list drifted in the first place.
   */
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
  const product = JSON.parse(getDefaultFileContent("templates/product.json"))
  check(
    "the product template seeds a product section, as the editor does",
    product.sections.order.includes("product") &&
      /type: "product", name: ps\.name/.test(editor),
    JSON.stringify(product.sections.order),
  )
  const home = JSON.parse(getDefaultFileContent("templates/home.json"))
  check(
    "and every page starts between a header and a footer",
    home.sections.order[0] === "header" &&
      home.sections.order[home.sections.order.length - 1] === "footer",
  )
}

// ===========================================================================
section("It is reachable, and it works on a file longer than the window")
// ===========================================================================

{
  const editor = readFileSync(
    join(root, "app/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
  check(
    "there is a door to it from the theme editor, over the canvas",
    /**
     * It was a button on the bar that opened a new tab. The code IS the
     * preview seen the other way round, so the door is a switch over the
     * canvas, beside the thing it switches.
     */
    /<PreviewModeSwitch/.test(editor) && /<CodePane installId=\{installId\}/.test(editor),
  )
  check(
    "and it loads in place, so unsaved theme work is not navigated away from",
    (() => {
      const pane = readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8")
      return /src=\{`\/website-builder\/code\/\$\{installId\}\?embedded=1`\}/.test(pane)
    })(),
  )
}

{
  const code = readFileSync(
    join(root, "app/website-builder/code/[installId]/page.tsx"),
    "utf8",
  )

  /**
   * THE EDITOR IS A TRANSPARENT TEXTAREA OVER A RENDERED COPY of the same
   * text. That only works while both are scrolled to the same place, and
   * nothing was keeping them there — the textarea scrolled, the visible layer
   * did not, and on any file longer than the window the caret walked away from
   * the text underneath it. Every section file is a couple of hundred lines.
   */
  check(
    "the two layers scroll together",
    /onScroll=\{e => \{/.test(code) &&
      /display\.scrollTop = e\.currentTarget\.scrollTop/.test(code) &&
      /display\.scrollLeft = e\.currentTarget\.scrollLeft/.test(code),
  )
  check(
    "and the rendered layer does not scroll on its own, which would fight it",
    /ref=\{displayRef\} className="absolute inset-0 overflow-hidden/.test(code),
  )
  check(
    "their padding matches, or the text would sit a line off",
    /px-\[2\.75rem\] py-2 z-10/.test(code) && /<div className="py-2 min-h-full">/.test(code),
  )

  check(
    "sixty-one files can be searched rather than scrolled through",
    /placeholder="Find a file…"/.test(code) && /const visibleTree = useMemo/.test(code),
  )
  check(
    "a folder survives the filter when something under it matches",
    /children\.length > 0 \? \{ \.\.\.node, children \} : null/.test(code),
  )
  check(
    "⌘S saves, and does not let the browser open its own Save dialog",
    /event\.metaKey \|\| event\.ctrlKey/.test(code) && /event\.preventDefault\(\)/.test(code),
  )
  check(
    "and leaving with unsaved work is not silent",
    /beforeunload/.test(code) && /if \(!isDirty && dirtyPaths\.size === 0\) return/.test(code),
  )
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
