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
import { readFileSync, readdirSync } from "node:fs"
import { completionsAt, documentationAt, undeclaredNames } from "@/lib/website-builder/storelib-complete"
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
      return /src=\{`\/website-builder\/code\/\$\{installId\}\?embedded=1\$\{codeFilePath \? `&path=/.test(pane)
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
    // The write is saveDraft now, which puts it in the file's draft half.
    // Same property: nothing is stored until it has compiled.
    route.indexOf("compileSection(content, { file: path, expectType") < route.indexOf("const saved = await saveDraft("),
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
  check("and hands them to the canvas and the sidebar", /<StorelibLiveProvider sources=\{sources\} page=\{\{ template: pageTemplate \}\} inEditor>/.test(editor) && (editor.match(/schemaFor\(section\.type, storelibSources, librarySchemas\)/g) ?? []).length >= 2)
  check("a section this creator wrote is in the library too", /customSectionSchemas\(storelibSources\)/.test(editor) && /customAddableSections\(customSchemas\)/.test(editor) && /addable=\{libraryAddable\}/.test(editor))
  check("a section renders from the saved source when there is one", /renderStorelibSection\(section, theme, \{ template, in_editor: inEditor === true \}, sources\)/.test(readFileSync(join(root, "components/website-builder/sections/storelib-live.tsx"), "utf8")))
  // Done in one place now, for every public route rather than the storefront
  // alone: see prerenderStorelibSections, and the route list in
  // tests/website-builder.test.ts.
  const prerender = readFileSync(join(root, "lib/website-builder/storefront-render.ts"), "utf8")
  check(
    "the published page draws the saved sections too, not the bundled ones",
    /\.from\("store_theme_custom_files"\)/.test(prerender)
      && /renderStorelibSection\(section, theme, \{ template \}, sources\)/.test(prerender)
      && /prerenderStorelibSections\(/.test(creator),
  )
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
    /Promise<Record<string, RenderedSection>>/.test(readFileSync(join(root, "lib/website-builder/storefront-render.ts"), "utf8"))
      && /<StorelibSourcesProvider prerendered=\{prerendered\}/.test(creator),
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

// ===========================================================================
section("A section somebody wrote is a section, not an unknown type")
// ===========================================================================
{
  const renderer = readFileSync(join(root, "components/website-builder/sections/SectionRenderer.tsx"), "utf8")
  const sectionSrc = readFileSync(join(root, "components/website-builder/sections/StorelibSection.tsx"), "utf8")

  /**
   * The registry is built at build time from the theme this build ships, so
   * a type somebody wrote in their own install can never be in it. It was
   * drawn as "Unknown section type: drewwww" — a red box naming no cause,
   * about a file that exists and compiles.
   */
  // Anchored to the markup, not to the words: the comment above the fix says
  // "Unknown section type" too, and a guard that matches its own explanation
  // passes whatever the code does.
  check(
    "a type the registry does not name goes to the engine rather than to a red box",
    /SECTION_COMPONENTS\[props\.section\.type\] \?\? StorelibSection/.test(renderer) &&
      !/Unknown section type: <code>/.test(renderer),
  )
  check(
    "and when there really is no file, it says which file it wanted",
    /There is no sections\/\$\{section\.type\}\.storelib in this theme/.test(sectionSrc),
  )
  check(
    "the registry still knows every section the theme itself ships",
    /STORELIB_SECTION_TYPES\.map\(\(type\) => \[type, StorelibSection\]\)/.test(readFileSync(join(root, "components/website-builder/sections/registry.ts"), "utf8")),
  )
}

// ===========================================================================
section("Create writes the file, and you name it rather than its path")
// ===========================================================================
{
  const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
  const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8")

  /**
   * Create used to open a tab and nothing else: the starter went in the
   * textarea, the tree drew the name, and none of it was anywhere but that
   * browser. A refresh took the lot, silently, because it had never been
   * saved at all.
   */
  const createBlock = codePage.slice(codePage.indexOf('if (pendingAction.kind === "new")'), codePage.indexOf('if (pendingAction.kind === "duplicate")'))
  check("creating a file saves it before the tab opens", /method: "PUT"/.test(createBlock) && createBlock.indexOf("method: \"PUT\"") < createBlock.indexOf("setOpenTabs"))
  check("and a refusal opens no tab and says why", /if \(!res\.ok\) \{/.test(createBlock) && createBlock.indexOf("if (!res.ok) {") < createBlock.indexOf("setSelectedFile"))
  check("and what is saved is what the editor then shows, so it does not open dirty", /setOriginalContent\(starter\)/.test(createBlock))

  // The folder and the extension are what make a file a section; neither is
  // a choice, so neither is typed.
  check("the folder and the extension sit outside the field", /export function fileNameOf\(/.test(codePage) && /\{dir \? <span className="shrink-0 select-none/.test(codePage) && /\{ext \? <span className="shrink-0 select-none/.test(codePage))
  check("the field holds only the name", /value=\{name\}/.test(codePage) && /onChange=\{\(e\) => onChange\(`\$\{dir\}\$\{asFileName\(e\.target\.value\)\}\$\{ext\}`\)\}/.test(codePage))
  check("and what is typed is made into a file name as it is typed", /export function asFileName\(/.test(codePage) && /toLowerCase\(\)/.test(codePage))
  /**
   * Both dialogs: the same weight on both buttons, and the solid one near
   * black rather than the product's violet, which is for the product's own
   * actions rather than a file dialog. Their sizes stay where
   * tests/section-responsive.test.ts measures them.
   */
  check("Create and Cancel are the same weight, and Create is the solid one",
    (codePage.match(/font-\[550\]/g) ?? []).length >= 4
    && (codePage.match(/rounded-md bg-\[#111114\]/g) ?? []).length >= 2
    && !/bg-\[#8B56FA\][^"]*>Create/.test(codePage))
  // 16px on a phone in both dialogs, because anything smaller in a focused
  // field is what makes iOS zoom the page and not zoom back.
  check("and they stay finger-sized on a phone, with a field iOS will not zoom",
    /h-10 flex-1 rounded-md bg-\[#111114\][^"]*md:h-7 md:flex-none/.test(codePage)
    && /h-10 w-full min-w-0 rounded-md border[^"]*text-\[16px\] md:h-8 md:text-\[12px\]/.test(codePage)
    && /h-10 min-w-0 flex-1 rounded-md border[^"]*text-\[16px\] md:h-7 md:text-\[12px\]/.test(codePage))
  check("a nameless file cannot be created", (codePage.match(/disabled=\{!fileNameOf\(pendingAction\.path\)\.name\}/g) ?? []).length === 2)

  check("two sections cannot be given the same name", /async function sectionNamesInUse\(/.test(route) && /Another section is already called/.test(route) && /status: 409/.test(route))
  check("and a section keeps its own name when it is saved again", /if \(p === except\) continue/.test(route))
  check("the check reads the theme's sections and this creator's together", /DEFAULT_THEME_SOURCES/.test(route) && /store_theme_custom_files/.test(route))
}

// ===========================================================================
section("The library draws what you would actually get")
// ===========================================================================
{
  const editor = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  /**
   * The cards used to render with no sources at all, deliberately, so that
   * they showed "the section as the theme ships it". A section the creator
   * wrote does not ship with the theme, so it had nothing to draw from and
   * arrived as an empty box under its own name.
   */
  check("a section you wrote has a preview, because the cards get your files", /<StorelibLiveProvider sources=\{sources\}>/.test(editor) && /sources=\{storelibSources\}/.test(editor))
  check("and there is one renderer around the grid, not one per card", (editor.match(/<StorelibLiveProvider/g) ?? []).length === 2)
  /**
   * Thirty cards measuring themselves was thirty observers agreeing, each
   * reporting after the first paint — so every card drew once at a guess and
   * then jumped. Measured once, before paint, and kept across a category
   * change so the next set of cards is right on its first frame.
   */
  check("the column is measured once, by the grid, before it paints", /const gridRef = useRef<HTMLDivElement>\(null\)/.test(editor) && /useLayoutEffect\(\(\) => \{[\s\S]{0,400}new ResizeObserver\(read\)/.test(editor) && !/new ResizeObserver\(\(\[entry\]\) => \{/.test(editor))
  check("and a card takes that width rather than finding its own", /\/\*\* Measured once by the grid, not thirty times by thirty cards\. \*\//.test(editor) && /width: number/.test(editor))
  // A box whose height is known before anything renders cannot shift when it does.
  check("a preview box is a known shape before it draws, so the grid never resettles", /const PREVIEW_RATIO = 0\.5/.test(editor) && /height,\s*\n\s*contentVisibility: "auto"/.test(editor) && /containIntrinsicSize:/.test(editor))
  check("and it scales with a transform, which costs no layout", /transform: `scale\(\$\{scale\}\)`/.test(editor) && !/zoom: scale/.test(editor))
}

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed > 0) {
  console.log("Failing:", failures.join(", "))
  process.exit(1)
}

// ===========================================================================
section("The editor knows what is in the file in front of it")
// ===========================================================================
{
  const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
  const complete = readFileSync(join(root, "lib/website-builder/storelib-complete.ts"), "utf8")

  const FILE = [
    "<template>",
    "<h2>{{ settings.heading }}</h2>",
    "{% for block in blocks %}<p>{{ block.settings.question }}</p>{% endfor %}",
    "</template>",
    "<schema>",
    JSON.stringify({
      type: "faq", name: "FAQ",
      settings: [
        { type: "text", id: "heading", label: "Heading", default: "Questions" },
        { type: "checkbox", id: "open_first", label: "Open first" },
        { type: "header", id: "hdr", label: "Layout" },
      ],
      blocks: [{ type: "qa", name: "Question", settings: [{ type: "text", id: "question", label: "Q" }, { type: "richtext", id: "answer", label: "A" }] }],
    }),
    "</schema>",
  ].join("\n")

  const after = (marker: string, typed: string) => {
    const src = FILE.replace(marker, marker + typed)
    return completionsAt(src, src.indexOf(marker) + marker.length + typed.length).items
  }
  const labels = (items: { label: string }[]) => items.map((i) => i.label)

  check("after `settings.` it offers this file's own settings", (() => {
    const l = labels(after("<h2>{{", " settings."))
    return l.includes("heading") && l.includes("open_first") && !l.includes("hdr")
  })(), "a header draws a divider and holds no value, so it is not a name to type")
  check("and narrows as you type", labels(after("<h2>{{", " settings.o")).join() === "open_first")
  check("after `block.settings.` it offers the block's settings", (() => {
    const l = labels(after("<p>{{", " block.settings."))
    return l.includes("question") && l.includes("answer")
  })())
  check("after a pipe it offers filters", labels(after("<h2>{{", " settings.heading | ")).includes("raw"))
  check("inside a tag it offers tags", labels(after("{%", " e")).includes("endfor"))
  check("after `theme.` it offers the theme's tokens", labels(after("<h2>{{", " theme.")).includes("typography.heading"))
  check("and outside an expression it offers nothing", completionsAt(FILE, 3).items.length === 0)

  check("a name the schema does not declare is marked while typing", (() => {
    const bad = FILE.replace("settings.heading", "settings.headng")
    const d = undeclaredNames(bad)
    return d.length === 1 && d[0].line === 2 && /No setting is called "headng"/.test(d[0].message)
  })())
  check("and so is a block setting that does not exist", (() => {
    const bad = FILE.replace("block.settings.question", "block.settings.q")
    return undeclaredNames(bad).some((d) => /No block setting is called "q"/.test(d.message))
  })())
  /**
   * The one thing a checker must never do. A word boundary sits happily after
   * the dot in `block.settings.question`, so every block setting was read as
   * a section setting that does not exist, and a correct file lit up amber.
   */
  check("a file with nothing wrong with it is marked with nothing", undeclaredNames(FILE).length === 0)
  check("and every section the theme ships is clean under it", (() => {
    const dir = join(root, "themes/default/sections")
    const bad = readdirSync(dir)
      .filter((f) => f.endsWith(".storelib"))
      .filter((f) => undeclaredNames(readFileSync(join(dir, f), "utf8")).length > 0)
    return bad.length === 0
  })())

  check("the caret's token is explained", (() => {
    const d = documentationAt(FILE, FILE.indexOf("settings.heading") + 3)
    return d?.title === "settings.heading" && /text/.test(d.detail) && /Questions/.test(d.detail)
  })())
  check("and so is a filter", documentationAt("{{ a | upcase }}", 12)?.title === "| upcase")

  // The popup, in the editor itself.
  check("the list is drawn at the caret, over a measured character", /const \[charBox, setCharBox\] = useState/.test(codePage) && /probe\.getBoundingClientRect\(\)\.width \/ 50/.test(codePage) && /caretPoint\.col \* charBox\.w/.test(codePage))
  check("arrows move it, Enter and Tab take it, Escape drops it", /e\.key === "ArrowDown"/.test(codePage) && /e\.key === "Enter" \|\| e\.key === "Tab"/.test(codePage) && /e\.key === "Escape"/.test(codePage))
  check("and it can be asked for", /e\.key === " " && \(e\.ctrlKey \|\| e\.metaKey\)/.test(codePage))
  check("picking one with the mouse works, which needs mousedown", /onMouseDown=\{e => \{ e\.preventDefault\(\); applyCompletion/.test(codePage), "the textarea blurs on click, and the popup would be gone before the click landed")
  check("an undeclared name marks its line without claiming the file failed", /data-warning-line=/.test(codePage) && /hasWarning \? "text-amber-500"/.test(codePage))
  check("it is read from this file's schema and nothing else", /export function schemaOfSource/.test(complete) && /catch \{\s*\n\s*return empty/.test(complete))
}

// ===========================================================================
section("Nothing typed into this editor is lost without somebody choosing it")
// ===========================================================================
{
  const codePage = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
  const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8")

  /**
   * Clicking another file in the tree used to discard everything typed into
   * the current one. The code said so: "in production you'd show a confirm
   * dialog; for now just save silently" — and it did neither.
   */
  check("switching files keeps the edit rather than dropping it", /setDrafts\(prev => \(\{ \.\.\.prev, \[selectedFile\.path\]: \{ content: fileContent, saved: originalContent \} \}\)\)/.test(codePage))
  check("and switching back puts it in front of you again", /const held = drafts\[node\.path\]/.test(codePage) && /setFileContent\(held\.content\)/.test(codePage))
  check("there is no confirm dialog, because there is nothing to decide", !/window\.confirm/.test(codePage))

  check("an edit outlives the tab it was typed in", /window\.localStorage\.setItem\(draftKey/.test(codePage) && /const draftKey = `wb:code-drafts:\$\{installId\}`/.test(codePage))
  check("and is offered on the way back in rather than applied", /setRecovered\(\{ path: selectedFile\.path, content: held\.content \}\)/.test(codePage) && /Restore them/.test(codePage) && /Discard them/.test(codePage))
  check("a full or blocked store does not stop the editing", (codePage.match(/catch \{\s*\n\s*\/\* a full or blocked store/g) ?? []).length === 1)
  check("saving clears the recovery copy, because it has done its job", /setDrafts\(prev => \{ const n = \{ \.\.\.prev \}; delete n\[selectedFile\.path\]; return n \}\)/.test(codePage))
  /**
   * The line that keeps this honest: the recovery copy is in this browser and
   * nowhere else, and only Save puts anything on the account — where it is
   * compiled first.
   */
  check("and nothing reaches the account without compiling first", route.indexOf("compileSection(content") < route.indexOf("const saved = await saveDraft("))

  // Two tabs, one file.
  check("a save carries what this editor loaded", /base_updated_at: savedAt \?\? undefined/.test(codePage) && /base_updated_at: z\.string\(\)\.optional\(\)/.test(route))
  check("and the server refuses one that would overwrite a newer file", /current\.updated_at !== parsed\.data\.base_updated_at/.test(route) && /status: 409/.test(route))
  check("the refusal carries the other version, so neither is lost", /conflict: \{ updated_at: current\.updated_at, content: current\.content \}/.test(route) && /setConflict\(\{ path: selectedFile\.path/.test(codePage))
  check("and whoever is here chooses between them", /Show theirs/.test(codePage) && /Keep mine and save/.test(codePage))
  check("an older client that sends no version still saves", /if \(parsed\.data\.base_updated_at\) \{/.test(route))
}

// ===========================================================================
section("The code editor on a phone")
// ===========================================================================

{
  const page = readFileSync(join(root, "app/website-builder/code/[installId]/page.tsx"), "utf8")
  const pane = readFileSync(join(root, "components/website-builder/preview-mode-switch.tsx"), "utf8")
  const css = readFileSync(join(root, "app/globals.css"), "utf8")

  /**
   * ONE LIGHT-AND-DARK SWITCH, WHICHEVER BAR IT IS ON.
   *
   * Framed on a phone, the builder's bar carries one and this page carried
   * another, eight millimetres apart, doing the same thing. The frame says
   * what it is showing and the page does not repeat it; standalone, nothing
   * says anything and the page keeps its own.
   */
  check(
    "the frame tells the editor which controls it is already showing",
    /storelib:code-chrome/.test(pane) && /themeToggle: fullScreenRef\.current/.test(pane),
  )
  check(
    "and tells it again after a reload, since opening a file changes the frame's src",
    // The page inside announces its theme as it mounts; the answer rides back
    // on that, so nothing has to track which document is in the frame.
    /storelib:code-theme"\) return[\s\S]{0,900}sendChrome\(\)/.test(pane),
  )
  check(
    "and the editor drops its own switch rather than showing a second one",
    /frameChrome\.themeToggle[\s\S]{0,20}\?[\s\S]{0,20}\[\]/.test(page),
    "the theme action is not conditional on the frame",
  )
  check(
    "there is exactly one place the editor's own switch is built",
    (page.match(/toggleCodeTheme,?\s*$/gm) ?? []).length === 1,
  )

  /**
   * THE ROW THAT DID NOT FIT. Files, the name, nine icons and Save need
   * about 480px; a phone has 390. Flexbox puts the overflow past the right
   * edge, and Save was the last thing in the row.
   */
  check(
    "on a narrow screen the icons are a menu, so Save keeps its place in the bar",
    /narrow \? \(\s*<CodeActionMenu actions=\{actions\} \/>/.test(page) && /function CodeActionMenu/.test(page),
  )
  check(
    "and the menu is fixed, since the column it sits in clips what it contains",
    /id="wb-code-more"[\s\S]{0,200}className="fixed/.test(page),
  )

  /**
   * The guard's last branch cancels every vertical touchmove on a document
   * that cannot scroll, and this page locks its document. That is the code
   * not scrolling, the selection handle that cannot be dragged, and the file
   * list that freezes.
   */
  check(
    "the editor opts out of the bounce guard, like the builder screen it is framed in",
    /data-wb-no-bounce-guard=""/.test(page),
  )
  check(
    "the keyboard takes the bottom of the editor box rather than covering the file",
    /marginBottom: keyboardInset/.test(page),
  )
  check(
    "a long press still offers Select All, Copy and Paste",
    /-webkit-touch-callout: default/.test(css) && /\.wb-code textarea/.test(css) && /select-text/.test(page),
  )
  check(
    "and a double tap selects a word instead of zooming the file",
    /\.wb-code \{\s*touch-action: manipulation;/.test(css),
  )
  /**
   * THE FREEZE ON THE WAY BACK. The editor is an iframe with a text field in
   * it, and closing the pane hides the frame without blurring what is focused
   * inside it. iOS keeps the keyboard's offset on its own scroll view, over a
   * builder whose document is locked and cannot scroll it back, and the
   * canvas reads as frozen.
   */
  check(
    "closing the code pane blurs what the keyboard was over",
    /if \(visible\) return/.test(pane) && /contentDocument\?\.activeElement/.test(pane) && /window\.scrollTo\(0, 0\)/.test(pane),
  )
  const builder = readFileSync(join(root, "app/website-builder/editor/[installId]/page.tsx"), "utf8")
  check(
    "and coming back to the app clears a lock whose owner is gone",
    // The builder never locks the document inline, so an inline lock at that
    // moment belongs to something that did not clean up after itself.
    /document\.addEventListener\("visibilitychange", revive\)/.test(builder) &&
      /removeProperty\("pointer-events"\)/.test(builder) &&
      /data-state="open"/.test(builder),
  )

  check(
    "the editor scrolls both ways, and a flick at the end stays in it",
    /\[touch-action:pan-x_pan-y\]/.test(page) && /overscroll-contain/.test(page),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
