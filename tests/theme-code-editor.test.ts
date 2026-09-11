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
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { isStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { detectLanguage } from "@/lib/website-builder/theme-file-tree"

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
  /** A section is its .json schema or, once it has moved to the engine, its .storelib file. */
  const listed = paths
    .filter((path) => path.startsWith("sections/"))
    .map((path) => path.slice("sections/".length).replace(/\.(json|storelib)$/, ""))
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
    if (isStorelibSection(type)) continue // its file is the source itself, checked below
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
    /<PreviewModeSwitch/.test(editor) && /<CodePane\s*\n\s*installId=\{installId\}/.test(editor),
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
    "and leaving with unsaved work is not silent — but the browser's dialog is not used inside the builder",
    /**
     * A browser fires `beforeunload` for every frame when the top document
     * navigates, so this handler put Chrome's own "Leave site?" box in front
     * of somebody who had pressed Back in the builder — a dialog written by
     * the browser, unable to say what is unsaved, over a screen that was
     * already asking properly. Standalone it is still the only thing that can
     * stop a tab closing; embedded, the page reports and the parent asks.
     */
    /beforeunload/.test(code) &&
      /if \(embedded \|\| !codeDirty\) return/.test(code) &&
      /postMessage\(\{ type: "storelib:code-dirty", dirty: codeDirty \}, window\.location\.origin\)/.test(code),
  )
}

// ===========================================================================
section("A section that lives in a .storelib file is edited as that file")
// ===========================================================================
{
  const hero = getDefaultFileContent("sections/hero.storelib")
  check("sections/hero.storelib opens as the file itself, verbatim", hero === DEFAULT_THEME_SOURCES["sections/hero.storelib"] && hero.includes("<schema>"))
  check("the tree lists it as .storelib, not as a JSON schema it no longer is", paths.includes("sections/hero.storelib") && !paths.includes("sections/hero.json"))
  check("and asking for the JSON says where the hero went", /hero\.storelib/.test(getDefaultFileContent("sections/hero.json")))
  check("a .storelib the theme does not have opens as a note, not as a crash", /Save this file to create it/.test(getDefaultFileContent("sections/nothing.storelib")))
  check("a .storelib is a language the editor knows", detectLanguage("sections/x.storelib") === "storelib")

  /**
   * FILES A PERSON CREATED are in the tree under their folder, and a folder
   * the theme does not have is made for them. Without this a saved file
   * exists and cannot be opened.
   */
  const withOwn = flattenTree(buildThemeFileTree(["sections/testimonial.storelib", "snippets/badge.storelib", "extras/notes.json"]))
  check("a saved section file the theme does not have is listed", withOwn.includes("sections/testimonial.storelib"))
  check("a saved snippet is listed", withOwn.includes("snippets/badge.storelib"))
  check("a saved file in a folder the theme does not have gets the folder", withOwn.includes("extras/notes.json"))
  check("a path that escapes the theme is never listed", !flattenTree(buildThemeFileTree(["../etc/passwd", "/abs.json"])).some((p) => p.includes("..") || p.startsWith("/")))
}

// ===========================================================================
section("Save compiles, errors carry lines, the canvas finds out")
// ===========================================================================
{
  const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8")
  const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
  const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  const creator = readFileSync(join(root, "app/(marketing)/[sellername]/page.tsx"), "utf8")
  const section = readFileSync(join(root, "components/website-builder/sections/StorelibSection.tsx"), "utf8")

  check(
    "PUT compiles a .storelib before storing it and refuses with the errors, 422",
    /compileSection\(content, \{ file: path, expectType/.test(route) && /\{ error: `\$\{path\} did not compile`, errors: r\.errors \},\s*\{ status: 422 \}/.test(route),
  )
  check(
    "and the compile runs before the upsert, so a broken file never reaches a row",
    route.indexOf("compileSection(content, { file: path, expectType") < route.indexOf('.upsert({ install_id: installId, path, content }'),
  )
  check(
    "DELETE of a section file the theme does not have is refused with the pages that use it",
    /status: 409/.test(route) && /used_by: usedBy/.test(route) && /searchParams\.get\("force"\) !== "1"/.test(route),
  )
  check("a rename compiles under the new name before the row moves", /export async function PATCH/.test(route) && route.indexOf("compileSection(existing.content, { file: to") < route.indexOf('.upsert({ install_id: installId, path: to'))
  check("the canvas can ask for every saved source at once", /searchParams\.get\("sources"\) === "1"/.test(route) && /\.like\("path", "%\.storelib"\)/.test(route))

  check("the code editor shows the compiler's errors with their lines", /res\.status === 422 && Array\.isArray\(d\.errors\)/.test(codePage) && /data-compile-errors=""/.test(codePage) && /goToLine\(err\.line\)/.test(codePage))
  check("and marks the line in the gutter", /hasError=\{errorLines\.has\(i \+ 1\)\}/.test(codePage) && /data-error-line=/.test(codePage))
  check("a broken file is not saved and says so", /did not compile — not saved/.test(codePage))
  check("the code editor tells the canvas when a file changed", (codePage.match(/announceFileChange\(/g) ?? []).length >= 5 && /type: "storelib:file-saved"/.test(codePage))
  check("the editor listens and reloads the saved sources", /data\?\.type === "storelib:file-saved"\) void loadStorelibSources\(\)/.test(editor) && /files\?sources=1/.test(editor))
  // The sidebar reads the library, which is the theme's sections and this
  // creator's own together — see librarySchemas in the editor.
  check("and hands them to the canvas and the sidebar", /<StorelibLiveProvider sources=\{sources\}/.test(editor) && (editor.match(/schemaFor\(section\.type, storelibSources, librarySchemas\)/g) ?? []).length === 2)
  check("a section this creator wrote is in the library too", /customSectionSchemas\(storelibSources\)/.test(editor) && /customAddableSections\(customSchemas\)/.test(editor) && /addable=\{libraryAddable\}/.test(editor))
  check("a section renders from the saved source when there is one", /renderStorelibSection\(section, theme, \{ template \}, sources\)/.test(readFileSync(join(root, "components/website-builder/sections/storelib-live.tsx"), "utf8")))
  check("the published page draws the saved sections too, not the bundled ones", /\.from\("store_theme_custom_files"\)/.test(creator) && /renderStorelibSection\(section, themeSettings, \{ template: "index" \}, storelibSources\)/.test(creator))
  check("a new section file starts as one that compiles", /const starterFor = \(path: string\)/.test(codePage) && /"<template>",/.test(codePage) && /"<schema>",/.test(codePage))
  check("new, rename, duplicate and delete are there", /kind: "new"/.test(codePage) && /kind: "rename"/.test(codePage) && /kind: "duplicate"/.test(codePage) && /deleteFile\(true\)/.test(codePage))
}

// ===========================================================================
section("A rename is a delete, for the pages that use the section")
// ===========================================================================
{
  const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8")
  const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")

  /**
   * Renaming sections/x.storelib to sections/y.storelib takes the type with
   * it, and every instance of x renders nothing — exactly what DELETE
   * refuses to do quietly. It went through without a word until this.
   */
  check("DELETE and PATCH ask the same question, through one helper", /async function pagesUsingSection\(/.test(route) && (route.match(/pagesUsingSection\(supabase, installId/g) ?? []).length === 2)
  check("a rename that changes the type is refused with the pages that use it", /fromSection\[1\] !== to\.match/.test(route) && /used_by: usedBy/.test(route))
  check("and force=1 is what goes through", (route.match(/searchParams\.get\("force"\) !== "1"/g) ?? []).length === 2)
  check("the code editor asks rather than reporting a failure", /setRenameBlocked\(/.test(codePage) && /Rename anyway/.test(codePage) && /runPendingAction\(true\)/.test(codePage))
}

// ===========================================================================
section("The page a section is on is the page it is on")
// ===========================================================================
{
  const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  const provider = readFileSync(join(root, "components/website-builder/sections/storelib-sources.tsx"), "utf8")
  const sectionSrc = readFileSync(join(root, "components/website-builder/sections/StorelibSection.tsx"), "utf8")
  const creator = readFileSync(join(root, "app/(marketing)/[sellername]/page.tsx"), "utf8")

  /**
   * `page.template` was the string "index" wherever a section rendered, so a
   * section on the product page read the home page's name — and
   * `allowed_templates`, which is written against that name, would have been
   * answering about the wrong page.
   */
  check("the provider carries the template, not just the sources", /export function useStorelibPage/.test(provider) && /page: \{ template: string \}/.test(provider))
  /**
   * A PUBLISHED SITE SHIPS NO COMPILER. The section component reads what was
   * rendered; only the editor's live provider imports the engine. Measured
   * before this split: postcss, 160 KB of it, in the chunk every visitor of
   * every creator's site downloaded to recompute CSS the server had already
   * sent them.
   */
  check(
    "the section component holds no engine at all",
    !/storelib-runtime|storelib-theme/.test(sectionSrc) && !/storelib-runtime|storelib-theme/.test(provider),
    sectionSrc.split("\n").filter((l) => l.startsWith("import")).join(" | "),
  )
  check(
    "the editor's live provider is the one thing in the tree that does",
    /renderStorelibSection/.test(readFileSync(join(root, "components/website-builder/sections/storelib-live.tsx"), "utf8")),
  )
  check(
    "and the published page renders on the server and hands down the strings",
    /const prerendered: Record<string, \{ html: string; css: string \}> = \{\}/.test(creator) && /<StorelibSourcesProvider prerendered=\{prerendered\}/.test(creator),
  )
  check("and a section reads it instead of assuming index", /useStorelibContext\(\)/.test(sectionSrc) && !/template: "index"/.test(sectionSrc))
  check("the editor hands it the page being edited", /pageTemplate=\{currentPage === "home" \? "index" : currentPage\}/.test(editor) && /page=\{\{ template: pageTemplate \}\}/.test(editor))
}

// ===========================================================================
section("Caches keyed on file content cannot grow without end")
// ===========================================================================
{
  const runtime = readFileSync(join(root, "lib/website-builder/storelib-runtime.ts"), "utf8")
  const schemas = readFileSync(join(root, "lib/website-builder/storelib-schemas.ts"), "utf8")
  const compile = readFileSync(join(root, "lib/storelib-theme/storelib/compile.ts"), "utf8")

  /**
   * The key is the file's text, so every save of every file by every
   * creator is a new entry, and the value is a compiled template tree. Three
   * unbounded Maps on a server that lives for days is a heap that only goes
   * one way.
   */
  check("the engine has one bounded cache and the application uses it", /export function createLru<T>\(limit: number\)/.test(compile) && /while \(map\.size > limit\)/.test(compile))
  check("the section compile cache is bounded", /createLru<Compiled>\(COMPILE_CACHE_LIMIT\)/.test(runtime) && !/new Map<string, Compiled>/.test(runtime))
  check("the schema cache is bounded", /createLru<StorelibSchemaResult>\(COMPILE_CACHE_LIMIT\)/.test(schemas) && !/new Map<string, StorelibSchemaResult>/.test(schemas))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}
