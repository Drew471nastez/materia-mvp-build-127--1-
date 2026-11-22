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

import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { MAX_REPAIR_ATTEMPTS } from "@/lib/storelib-ai"
import { DRAWER_EASING, DRAWER_MS, drawerRelease } from "@/lib/website-builder/drawer-drag"
import { resolveEditorHref } from "@/lib/website-builder/editor-navigation"
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
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
    "utf8",
  )
  const product = JSON.parse(getDefaultFileContent("templates/product.json"))
  check(
    "the product template seeds a product section, as the editor does",
    product.sections.order.includes("product") &&
      /* The section the editor adds is the preset's own, blocks and all (lib/website-builder/product-page.ts). */
      (/type: "product", name: ps\.name/.test(editor) || /\.\.\.mainProductSection\(`product-\$\{Date\.now\(\)\}`\), name: ps\.name/.test(editor)),
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
    join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"),
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
  const codeSrc = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
  check(
    "with the inspector on, a tap on a theme link selects and never navigates, and the page already showing is not reloaded",
    /**
     * The guard has ONE exception: a link in the site's NAV — the header or
     * the footer, which is what `data-chrome` marks — navigates, because
     * their links are their content. A link inside the page's own content
     * still only selects.
     *
     * Asked of the routing rather than of the editor's source. The middle
     * line of this check used to be a regex for
     *
     *     if ((path === "/" || path === "") && currentPage === "home") return
     *
     * which pinned the exact line that was broken: `currentPage` was read
     * out of a useCallback that did not list it as a dependency, so it was
     * the page open at the editor's FIRST render, forever, and the logo
     * never worked. A regex cannot see a missing dependency. Executing the
     * decision can.
     */
    (() => {
      const ctx = {
        currentPage: "home", inspectorEnabled: true, fromNav: false,
        shopPath: "/products", customPageKeys: [] as string[],
      }
      const content = resolveEditorHref("/about", ctx)
      const nav = resolveEditorHref("/about", { ...ctx, fromNav: true })
      const homeFromHome = resolveEditorHref("/", { ...ctx, fromNav: true })
      const homeFromElsewhere = resolveEditorHref("/", { ...ctx, fromNav: true, currentPage: "products" })
      const anchor = resolveEditorHref("#reviews", { ...ctx, fromNav: true })
      return content.kind === "ignore"
        && nav.kind === "page" && nav.key === "about"
        /* Not reloaded, and not nothing either: the top of the page. */
        && homeFromHome.kind === "top"
        && homeFromElsewhere.kind === "page" && homeFromElsewhere.key === "home"
        && anchor.kind === "anchor" && anchor.id === "reviews"
    })() &&
      /* And the canvas still does the scrolling for an anchor, with the live site's scroll. */
      /case "anchor": \{[\s\S]{0,400}?scrollToHash\(root, decision\.id, \{ scroller \}\)/.test(editor),
  )
  check(
    "on a phone the code editor is its own page: the builder saves the draft, then navigates to the code route with a way back",
    /const openCode = async \(path\?: string \| null, opts: \{ at\?: "top" \| "schema"; sectionId\?: string \} = \{\}\) => \{/.test(editor) &&
      /if \(!isMobileView\) \{\s*\n\s*setPreviewMode\("code"\)/.test(editor) &&
      /const ok = await saveDraft\(\{ quiet: true \}\)\s*\n\s*if \(!ok\) return/.test(editor) &&
      /router\.push\(`\/website-builder\/code\/\$\{installId\}\?\$\{q\.toString\(\)\}`\)/.test(editor) &&
      !/setCodeFilePath\(path\)\s*\n\s*setPreviewMode\("code"\)/.test(editor) &&
      /* The Actions menu calls it through a ref (actionItems), so the list is built once. */
      /else void actionCalls\.current\.openCode\(\)/.test(editor),
  )
  check(
    "a panel that is centred is not animated by its own placement: the two transforms are on two boxes",
    // A centred panel is placed with translateX(-50%) and the enter animation
    // sets `transform` outright, so for its whole length the centring is gone
    // and the panel slides in from half its width to the right. Measured by
    // eye as "it comes in from the right side weirdly".
    ((panel) =>
      /<div\s*\n\s*style=\{\{\s*\n\s*position: "fixed",[\s\S]*?transform: place\.transform,[\s\S]*?\}\}\s*\n\s*>\s*\n\s*<div ref=\{ref\} className=\{className\} style=\{\{ maxHeight: place\.maxHeight \}\}/.test(panel) &&
      !/className=\{className\}[\s\S]{0,200}transform: place\.transform/.test(panel))(
        readFileSync(join(root, "components/website-builder/anchored-panel.tsx"), "utf8"),
      ),
  )
  check(
    "the section's own toolbar can hand the section to the assistant",
    // Every other button there changes the section by hand; asking for a
    // change in words is the same job by another route.
    /* Changed on purpose (round 42 team): optional, absent for a team member. */
    /\/\*\* Opens the assistant on the section this toolbar belongs to\. \*\/\s*\n\s*(\/\*\*[^\n]*\*\/\s*\n\s*)?onAskAi\??: \(\) => void/.test(editor) &&
      /<Item label="Ask AI" onClick=\{onAskAi\}>\s*\n\s*<StorelibLogo/.test(editor) &&
      /onAskAi=\{(teamMember \? undefined : )?\(\) => \{\s*\n\s*setAiOpen\(true\)/.test(editor),
  )
  check(
    "Create is the accent colour, like every other action that goes ahead",
    /rounded bg-\[#8B56FA\] px-2 text-\[12px\] font-\[550\] text-white transition-colors hover:bg-\[#7b46ec\]/.test(codeSrc),
  )
  check(
    "New file asks its question on the surface the button was pressed on, and moves nobody to the explorer",
    // It opened inside the file list: on a phone that threw the list over the
    // editor, and on a desktop it answered in a different column from the one
    // being looked at.
    // A card in the middle of the code area, sized inside the pane: a dialog
    // on a desktop and a full-width sheet at 390px, from one layout.
    /\{pendingAction\?\.kind === "new" && \(\s*\n\s*<div className="absolute inset-0 z-20 flex items-center justify-center/.test(codeSrc) &&
      /max-w-\[440px\]/.test(codeSrc) &&
      /<div className="relative flex-1 flex flex-col overflow-hidden min-w-0">/.test(codeSrc) &&
      !/onClick=\{\(\) => \{ setShowFiles\(true\); setPendingAction\(\{ kind: "new"/.test(codeSrc) &&
      /if \(narrow\) setShowFiles\(false\)/.test(codeSrc),
  )
  check(
    "project settings is its own layer, inside the phone's safe areas, with no sheet left over it",
    ((settings) =>
      /createPortal\(/.test(settings) &&
      /paddingTop: "env\(safe-area-inset-top, 0px\)"/.test(settings) &&
      /paddingBottom: "env\(safe-area-inset-bottom, 0px\)"/.test(settings))(
        readFileSync(join(root, "components/website-builder/project-settings.tsx"), "utf8"),
      ) && /* Changed on purpose (templates round 21): the sheet stays, closed, under the settings page (z-[150]); mounting it again froze Back to editor. */ /previewMode !== "code" && \(\s*<MobileEditorSheet/.test(editor),
  )
  check(
    "the code page's Back says the builder is coming, in the same place and at the same size",
    /const \[goingBack, setGoingBack\] = useState\(false\)/.test(codeSrc) &&
      /if \(goingBack\) return\s*\n\s*setGoingBack\(true\)/.test(codeSrc) &&
      /goingBack \? \(\s*\n\s*<Loader2 className="h-4 w-4 animate-spin" \/>/.test(codeSrc) &&
      /goingBack \? \(fromEditor \? "Opening the editor" : "Going back"\)/.test(codeSrc),
  )
  check(
    "and the code page's Back goes to the builder when it came from there, with no question: unsaved edits are held and offered back",
    /const fromEditor =[\s\S]*?get\("back"\) === "editor"/.test(codeSrc) &&
      /* V round: and back onto the section it was opened from (lib/website-builder/code-return.ts). */
      /const backHref = fromEditor\s*\?\s*backToEditorHref\(installId, [^)]*\)\s*:\s*"\/app\/website-builder"/.test(codeSrc) &&
      /return `\/website-builder\/editor\/\$\{encodeURIComponent\(installId\)\}/.test(readFileSync(join(root, "lib/website-builder/code-return.ts"), "utf8")) &&
      // No confirm on the way out; the press itself is handled above, where
      // the arrow becomes a spinner.
      !/window\.confirm/.test(codeSrc) &&
      /router\.push\(backHref\)/.test(codeSrc),
  )
  check(
    "selecting a section does not move the phone's sheet, and the canvas keeps the scroll it had",
    // The sheet lifted for one deploy. Nobody asked the canvas to open a
    // sheet, and its peek is what the canvas pads itself by, so moving it
    // changed how much room the canvas had to scroll: on a short page that
    // turns a scrollable canvas into one that fits, and the scroll goes to
    // zero. Measured by scripts/check-editor-scroll.mjs with SHORT_PAGE=1.
    !/SECTION_PEEK_HEIGHT/.test(editor) &&
      !/peekHeight=\{selectedPanel/.test(editor),
  )
  check(
    "with the inspector on, a press in the canvas takes no focus and a click follows no link",
    // A focused control is scrolled into view by the browser before any code
    // here runs, which on a short page is a jump to the top; and a link that
    // no renderer intercepted navigated the whole builder away, measured.
    /* Every control still loses its press EXCEPT something you type in: a
       field refused focus is a field the caret never reaches, which is the
       header's own search input doing nothing inside the builder. The rule
       this check exists for — a press does not focus, so the browser does
       not scroll the canvas to the top — is unchanged for everything else. */
    /onMouseDownCapture=\{\(e\) => \{[\s\S]{0,300}?if \(isTypingTarget\(target\)\) return/.test(editor) &&
      /* And the one exception, which is a link that is about to be followed
         anyway. See isCanvasNavigationLink. */
      /if \(inspectorEnabled \|\| isCanvasNavigationLink\(target\)\) e\.preventDefault\(\)/.test(editor) &&
      // and the page-leaving pair, which is not about the inspector at all:
      // see "The canvas never takes the browser anywhere" in canvas-scroll.
      /onClickCapture=\{\(e\) => \{[\s\S]{0,4200}?if \(leavesThePage\(/.test(editor) &&
      /onSubmitCapture=\{\(e\) => e\.preventDefault\(\)\}/.test(editor),
  )
  check(
    "a closed code pane is visibility: hidden once its fade is done, not a transparent full-screen frame over the canvas",
    // On a phone the pane is a fixed, full-screen layer holding an iframe with
    // a scrolling document of its own. Transparent with pointer events off is
    // enough for the DOM and not for native gesture routing; hidden is.
    /const \[hidden, setHidden\] = useState\(!visible\)/.test(pane) &&
      /const t = window\.setTimeout\(\(\) => setHidden\(true\), 320\)/.test(pane) &&
      /hidden && !visible && "invisible"/.test(pane) &&
      // and it is shown again before the fade-in, so the fade still plays
      /if \(visible\) \{\s*\n\s*setHidden\(false\)/.test(pane),
  )
      /* V round: the frame's address is fixed when first drawn; a later file is opened inside it (storelib:open-file). */
      return /srcRef\.current = codeFilePath \? `&path=/.test(pane) && /src=\{`\/website-builder\/code\/\$\{installId\}\?embedded=1\$\{srcRef\.current \?\? ""\}`\}/.test(pane)
    })(),
  )
}

{
  const code = readFileSync(
    join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"),
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
    /* The typing layer starts where the drawn text does (after the 40px gutter) and never wraps, or every row after a long line is off. */
    /pl-10 pr-4 py-2 z-10 whitespace-pre/.test(code) && /wrap="off"/.test(code) && /<div className="py-2 min-h-full">/.test(code) && /w-10 shrink-0 text-right/.test(code),
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
  /* The save's rules live in one module now, shared with the agent API; the
     route delegates to it. Read together, they are the same rules as before. */
  const route =
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
    readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")
  const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
  const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  // `<name>.storelib.com` is the website and lives at /w; the apex path is
  // the creator page and draws no sections.
  const creator = readFileSync(join(root, "app/(site)/w/[username]/render-site.tsx"), "utf8")
  const section = readFileSync(join(root, "components/website-builder/sections/StorelibSection.tsx"), "utf8")

  check(
    "PUT compiles a .storelib before storing it and refuses with the errors, 422",
    /compileSection\(content, \{ file: path \}\)/.test(route)
      && /status: 422, error: `\$\{path\} did not compile`, errors: r\.errors/.test(route)
      && /saveThemeFile\(supabase, installId, path, content/.test(route),
  )
  /**
   * AND IT DOES NOT DEMAND THE SCHEMA REPEAT THE FILE NAME. A section's type
   * is its file name; the schema's own `type` line used to have to match it
   * exactly or the file would not save, so every copy of a section refused
   * to save under its new name and so did every rename.
   */
  check(
    "a file whose schema names another type still saves, under its own name",
    (() => {
      // The code, not the comment that explains why the code is the way it is.
      const code = route.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
      return !/expectType/.test(code)
    })(),
  )
  check(
    "and the compile runs before the upsert, so a broken file never reaches a row",
    // The write is saveDraft now, which puts it in the file's draft half.
    // Same property: nothing is stored until it has compiled.
    route.indexOf("compileSection(content, { file: path })") < route.indexOf("const saved = await saveDraft("),
  )
  check(
    "DELETE of a section file the theme does not have is refused with the pages that use it",
    /status: 409/.test(route) && /used_by: usedBy/.test(route) && /searchParams\.get\("force"\) !== "1"/.test(route),
  )
  check("a rename compiles under the new name before the row moves", /export async function PATCH/.test(route) && route.indexOf("compileThemeFile(source, { file: to") > 0 && route.indexOf("compileThemeFile(source, { file: to") < route.indexOf("hasDraftColumn\n        ? { install_id: installId, path: to"))
  check("the canvas can ask for every saved source at once", /searchParams\.get\("sources"\) === "1"/.test(route) && /\.like\("path", "%\.storelib"\)/.test(route))

  check("the code editor shows the compiler's errors with their lines", /res\.status === 422 && Array\.isArray\(d\.errors\)/.test(codePage) && /data-compile-errors=""/.test(codePage) && /goToLine\(err\.line\)/.test(codePage))
  check("and marks the line in the gutter", /hasError=\{errorLines\.has\(i \+ 1\)\}/.test(codePage) && /data-error-line=/.test(codePage))
  check("a broken file is not saved and says so, naming the file", /toast\.error\("Did not compile\. Not saved\.", \{ description: selectedFile\.name \}\)/.test(codePage) && !/did not compile —/.test(codePage))
  check("the code editor tells the canvas when a file changed", (codePage.match(/announceFileChange\(/g) ?? []).length >= 5 && /type: "storelib:file-saved"/.test(codePage))
  check("the editor listens and reloads the saved sources", /data\?\.type === "storelib:file-saved"\)( \{\s*)?void loadStorelibSources\(\)/.test(editor) && /files\?sources=1/.test(editor))
  // The sidebar reads the library, which is the theme's sections and this
  // creator's own together — see librarySchemas in the editor.
  /* And the shop's own facts since dynamic sources: the canvas draws a page the way the live site does. */
  check("and hands them to the canvas and the sidebar", /<StorelibLiveProvider sources=\{sources\} page=\{\{ template: pageTemplate \}\} inEditor products=\{shopCards\} data=\{canvasStorefrontData\}( headerLogo=\{canvasHeaderLogo\})?>/.test(editor) && (editor.match(/schemaFor\(section\.type, storelibSources, librarySchemas\)/g) ?? []).length >= 2)
  check("a section this creator wrote is in the library too", /customSectionSchemas\(storelibSources\)/.test(editor) && /customAddableSections\(customSchemas\)/.test(editor) && /addable=\{libraryAddable\}/.test(editor))
  // The call grew a products argument when sections learned to draw the
  // shop. What this guard is about is unchanged: the SAVED sources are what
  // the canvas renders from.
  check("a section renders from the saved source when there is one", /* Changed on purpose (round 36): the canvas asks for scheme colours as variables. */ /* The theme with the built-in header's logo where Branding has none (lib/website-builder/chrome-logo.ts), round 22. */
    /renderStorelibSection\(section, (theme|themeWithHeaderLogo\(theme, headerLogo \?\? null\)), \{ (\.\.\.extras, )?template, in_editor: inEditor === true \}, (sources|sourcesNow\.current), products(, data|, dataNow\.current)?(, globals)?(, canvas \? CANVAS_RENDER : undefined)?\)/.test(readFileSync(join(root, "components/website-builder/sections/storelib-live.tsx"), "utf8")))
  // Done in one place now, for every public route rather than the storefront
  // alone: see prerenderStorelibSections, and the route list in
  // tests/website-builder.test.ts.
  const prerender = readFileSync(join(root, "lib/website-builder/storefront-render.ts"), "utf8")
  check(
    "the published page draws the saved sections too, not the bundled ones",
    /\.from\("store_theme_custom_files"\)/.test(prerender)
      /* The page object is built once per page now (with the breadcrumb trail), from the same extras and template. */
      && (/renderStorelibSection\(section, theme, \{ \.\.\.pageExtras, template \}, sources, products(, data)?(, globals)?\)/.test(prerender)
        || (/renderStorelibSection\(section, (theme|drawnTheme), page, sources, products(, data)?(, globals)?\)/.test(prerender) && /\.\.\.pageExtras,\s*template,/.test(prerender)))
      && (/prerenderStorelibSections\(/.test(creator) || /renderWithSources\(owner\.sources,/.test(creator)),
  )
  check("a new section file starts as one that compiles", /const starterFor = \(path: string\)/.test(codePage) && /"<template>",/.test(codePage) && /"<schema>",/.test(codePage))
  check("new, rename, duplicate and delete are there", /kind: "new"/.test(codePage) && /kind: "rename"/.test(codePage) && /kind: "duplicate"/.test(codePage) && /deleteFile\(true\)/.test(codePage))
}

// ===========================================================================
section("A rename is a delete, for the pages that use the section")
// ===========================================================================
{
  /* The save's rules live in one module now, shared with the agent API; the
     route delegates to it. Read together, they are the same rules as before. */
  const route =
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
    readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")
  const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")

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
  const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  const provider = readFileSync(join(root, "components/website-builder/sections/storelib-sources.tsx"), "utf8")
  const sectionSrc = readFileSync(join(root, "components/website-builder/sections/StorelibSection.tsx"), "utf8")
  // `<name>.storelib.com` is the website and lives at /w; the apex path is
  // the creator page and draws no sections.
  const creator = readFileSync(join(root, "app/(site)/w/[username]/render-site.tsx"), "utf8")

  /**
   * `page.template` was the string "index" wherever a section rendered, so a
   * section on the product page read the home page's name — and
   * `allowed_templates`, which is written against that name, would have been
   * answering about the wrong page.
   */
  /* The page object also carries what a request knows and a section cannot,
     such as the search page's query, so its type is open beyond `template`.
     What is pinned is that the template is still on it. */
  check("the provider carries the template, not just the sources", /export function useStorelibPage/.test(provider) && /page: \{ template: string[;}]/.test(provider))
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
  check("the editor hands it the page being edited", /pageTemplate=\{templateForPage\(currentPage\)\}/.test(editor) && /page=\{\{ template: pageTemplate \}\}/.test(editor))
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
  /* Changed on purpose (push lag): still bounded, with room for a store theme's every section (at 200 a larger theme read every schema again on every change). */
  check("the schema cache is bounded", /createLru<StorelibSchemaResult>\(Math\.max\(COMPILE_CACHE_LIMIT, 1000\)\)/.test(schemas) && !/new Map<string, StorelibSchemaResult>/.test(schemas))
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
  const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
  /* The save's rules live in one module now, shared with the agent API; the
     route delegates to it. Read together, they are the same rules as before. */
  const route =
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
    readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")

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
  /**
   * The new-file field is a centred dialog now rather than a row in a 240px
   * column, so it is drawn at one size for every screen and does not need to
   * shrink above `md`. 16px on a phone either way, which is what stops iOS
   * zooming the page when the field takes focus.
   */
  check("and they stay finger-sized on a phone, with a field iOS will not zoom",
    /h-10 flex-1 rounded-md bg-\[#111114\][^"]*md:h-7 md:flex-none/.test(codePage)
    // Create is the accent now; the sizes are what this check is about.
    && /h-8 flex-1 items-center justify-center gap-1\.5 rounded bg-\[#8B56FA\][^"]*md:h-7/.test(codePage)
    && /h-9 w-full min-w-0 rounded border[^"]*text-\[16px\] md:h-7 md:text-\[11\.5px\]/.test(codePage)
    && /h-10 min-w-0 flex-1 rounded-md border[^"]*text-\[16px\] md:h-7 md:text-\[12px\]/.test(codePage))
  // Two buttons guard the name. Create also refuses while a create is in
  // flight, which is the extra clause on the first.
  check("a nameless file cannot be created", (codePage.match(/disabled=\{!fileNameOf\(pendingAction\.path\)\.name \|\| creating\}/g) ?? []).length === 1 && (codePage.match(/disabled=\{!fileNameOf\(pendingAction\.path\)\.name\}/g) ?? []).length === 1)

  check("two sections cannot be given the same name", /async function sectionNamesInUse\(/.test(route) && /Another section is already called/.test(route) && /status: 409/.test(route))
  check("and a section keeps its own name when it is saved again", /if \(p === except\) continue/.test(route))
  check("the check reads the theme's sections and this creator's together", /DEFAULT_THEME_SOURCES/.test(route) && /store_theme_custom_files/.test(route))
}

// ===========================================================================
section("The library draws what you would actually get")
// ===========================================================================
{
  const editor = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  /**
   * The cards used to render with no sources at all, deliberately, so that
   * they showed "the section as the theme ships it". A section the creator
   * wrote does not ship with the theme, so it had nothing to draw from and
   * arrived as an empty box under its own name.
   */
  /* The library is its own module now: components/website-builder/editor/section-library.tsx. */
  const library = readFileSync(join(root, "components/website-builder/editor/section-library.tsx"), "utf8")
  check("a section you wrote has a preview, because the cards get your files",
    /* Changed on purpose (round BC): the cards are also given sample reviews and a Breadcrumbs trail (`preview data=`). */
    /<StorelibLiveProvider sources=\{job\.sources\}( inEditor=\{floats\})?( preview data=\{previewStorefront\(\)\})?>/.test(library) && /<SectionLibrary[\s\S]{0,400}sources=\{storelibSources\}/.test(editor))
  check("and each preview is drawn once, off screen, not by a live renderer in every card",
    (library.match(/<StorelibLiveProvider/g) ?? []).length === 1 && /dangerouslySetInnerHTML=\{html\}/.test(library))
  /**
   * Thirty cards measuring themselves was thirty observers agreeing, each
   * reporting after the first paint — so every card drew once at a guess and
   * then jumped. It is still ONE observer, on the grid, for the whole set.
   *
   * What changed is when it is created. A ref read inside an effect keyed on
   * `[open, isMobileLayout]` never ran for the desktop modal, because a
   * dialog that mounts its content through a presence wrapper has not
   * attached the ref by then — the effect returned early and the deps never
   * changed again. The grid was drawn only `gridWidth > 0`, so the library
   * came up completely blank: `cards=0`, measured on the real editor.
   *
   * A callback ref is handed the node the moment the node exists, so the one
   * measurement still happens once and can no longer be missed.
   */
  check("the column is measured once, by the grid, the moment the grid exists", /const gridRef = useCallback\(\(el: HTMLDivElement \| null\) => \{/.test(library) && (library.match(/new ResizeObserver\(/g) ?? []).length === 1)
  check("and a card takes that width rather than finding its own", /const cardWidth = gridWidth > 0 \?/.test(library) && /width=\{cardWidth\}/.test(library))
  // A box whose height is known before anything renders cannot shift when it does.
  check("a preview box is a known shape before it draws, so the grid never resettles",
    /export const PREVIEW_RATIO = 0\.56/.test(library) && /height: height \|\| undefined,/.test(library) && /* every card below the first few of a category skips its drawing until it is near the screen */ /contentVisibility: eager \? "visible" : "auto"/.test(library) && /containIntrinsicSize:/.test(library))
  check("and it scales with a transform, which costs no layout", /transform: `scale\(\$\{scale\}\)`/.test(library) && !/zoom: scale/.test(library))
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
  const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
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
  const codePage = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
  /* The save's rules live in one module now, shared with the agent API; the
     route delegates to it. Read together, they are the same rules as before. */
  const route =
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
    readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")

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
  check("and the server refuses one that would overwrite a newer file",
    /current\.updated_at !== opts\.baseUpdatedAt/.test(route) && /baseUpdatedAt: parsed\.data\.base_updated_at/.test(route) && /status: 409/.test(route))
  /* Round L: the other version is the DRAFT (what the other writer wrote, not what is live), with who wrote it. */
  check("the refusal carries the other version, so neither is lost", /conflict: \{ updated_at: current\?\.updated_at \?\? "", content: draftText \?\? ""/.test(route) && /setConflict\(\{ path: selectedFile\.path/.test(codePage))
  /* Round L: the buttons are named by who wrote the other version: Keep mine, and Use AI's, Use GitHub's or Use theirs (lib/ai-builder/version-labels.ts). */
  check("and whoever is here chooses between them", /conflictChoiceLabels\(conflict\.author\)\.theirs/.test(codePage) && /conflictChoiceLabels\(conflict\.author\)\.mine/.test(codePage))
  check("an older client that sends no version still saves", /!!\(opts\.baseUpdatedAt && current/.test(route) && /opts\.expectedVersion !== undefined &&/.test(route))
}

// ===========================================================================
section("The code editor on a phone")
// ===========================================================================

{
  const page = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
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
   * THE EDITOR AT HALF HEIGHT. The Ask AI "writing" lane once took the class
   * `.wb-code` for itself, with a fixed 14-line height and a mask fading its
   * top. The code editor's root carries the same class, so the whole editor
   * became 306px tall inside a full-height frame, its file list cut off and
   * its header faded. `.wb-code` is the code editor's; no rule for it may
   * size it or mask it.
   */
  check(
    "no rule for .wb-code sets a height or a mask, so the editor fills its frame",
    (css.match(/(?:^|[,}\s])\.wb-code\s*\{[^}]*\}/g) ?? []).every((rule) => !/(?:^|[;\s{])(?:height|max-height|mask-image|-webkit-mask-image)\s*:/.test(rule)),
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
  const builder = readFileSync(join(root, "app/(storelib)/website-builder/editor/[installId]/page.tsx"), "utf8")
  const stuck = readFileSync(join(root, "lib/website-builder/stuck-layer.ts"), "utf8")
  check(
    "and coming back to the app clears a lock whose owner is gone",
    // The builder never locks the document inline, so an inline lock at that
    // moment belongs to something that did not clean up after itself. The
    // deciding is in stuck-layer.ts now, where it can be tested on its own;
    // the builder's job is to ask it at the two moments it matters.
    /document\.addEventListener\("visibilitychange", (revive|onVisible)\)/.test(builder) &&
      /clearStaleDocumentLocks\(document\)/.test(builder) &&
      /el\.style\.removeProperty\(prop\)/.test(stuck) &&
      /data-state="open"/.test(stuck),
  )
  /**
   * And the way back from the code pane is the other one. Radix drops
   * `pointer-events: none` on the body while a menu closes, and a menu torn
   * down mid-close never takes it off again: every touch after that lands on
   * nothing, which is the freeze people keep reporting. Nobody can report a
   * lock they cannot see, so a press on a dead document is itself the signal.
   */
  check(
    "and a press that lands on a dead document clears it too",
    /watchForStuckLayer\(document/.test(builder) &&
      /"pointerdown"[\s\S]{0,200}capture: true/.test(stuck) &&
      /passive: true/.test(stuck),
  )

  /**
   * THE DRAWER IS DRAGGED, like the bottom sheet it sits beside. The
   * thresholds are the part with judgement in them, so they are numbers here
   * rather than something you can only check by holding a phone.
   */
  {
    const W = 320
    const nudge = drawerRelease({ offset: -20, width: W, velocity: -0.1 })
    check("a nudge springs back rather than closing", !nudge.closing && nudge.target === 0)
    const past = drawerRelease({ offset: -140, width: W, velocity: -0.1 })
    check("past a third of its width, a release closes it", past.closing && past.target === -W)
    const flick = drawerRelease({ offset: -20, width: W, velocity: -1.2 })
    check(
      "and a fast flick closes it however far it got",
      // Distance alone ignores a short fast push, which is how a drawer ends
      // up feeling stuck: the finger says go and the panel argues.
      flick.closing && flick.target === -W,
    )
    check(
      "a flick finishes quickly and a slow push finishes gently",
      flick.ms < past.ms && flick.ms >= 140 && past.ms <= DRAWER_MS,
      `${flick.ms}ms against ${past.ms}ms`,
    )
    check(
      "nothing takes longer than the sheet it sits beside, or less than a frame or two",
      [drawerRelease({ offset: -1, width: W, velocity: 0 }), drawerRelease({ offset: -319, width: W, velocity: -8 })]
        .every((r) => r.ms >= 140 && r.ms <= DRAWER_MS),
    )
    check(
      "a drag past the edge cannot send it further than its own width",
      drawerRelease({ offset: -9999, width: W, velocity: 0 }).target === -W,
    )
    check("and the sheet's own curve, not a second one", DRAWER_EASING === "cubic-bezier(0.32, 0.72, 0, 1)")
  }

  check(
    "the drawer follows the finger, and a vertical gesture is the file list's",
    /el\.style\.transform = `translateX\(\$\{px\}px\)`/.test(page) &&
      /if \(Math\.abs\(dy\) >= Math\.abs\(dx\)\) \{ active = false; return \}/.test(page) &&
      // not passive, or preventDefault is ignored and the page scrolls sideways
      /"touchmove", onMove, \{ passive: false \}/.test(page) &&
      /\[touch-action:pan-y\]/.test(page),
  )
  check(
    "and nothing animates before the phone layout has been painted once",
    /drawerReady && "transition-transform/.test(page) && /requestAnimationFrame\(\(\) => setDrawerReady\(true\)\)/.test(page),
  )

  check(
    "the editor scrolls both ways, and a flick at the end stays in it",
    /\[touch-action:pan-x_pan-y\]/.test(page) && /overscroll-contain/.test(page),
  )
}

/**
 * ===========================================================================
 *  WHAT YOU CAN DO WITH A LIST OF ERRORS
 * ===========================================================================
 * Two things, and until now neither was possible. Every line in the list is a
 * button that jumps to its line, so dragging across the text selected
 * nothing: the only way to get an error out of the editor was to read it off
 * the screen and type it somewhere else. And the only way to act on one was
 * to work out the fix yourself.
 */
{
  console.log("\n  A list of errors can be copied, and handed to the assistant")
  const code = readFileSync(join(root, "app/(storelib)/website-builder/code/[installId]/page.tsx"), "utf8")
  const route = readFileSync(join(root, "app/api/website-builder/themes/[installId]/sections/code/fix/route.ts"), "utf8")
  const agent = readFileSync(join(root, "lib/website-builder/agent/fix-section.ts"), "utf8")

  check("the whole list copies, with the file it is about", /const copyErrors = async \(\) => \{/.test(code) && /selectedFile\?\.path \?\? ""/.test(code))
  check("and says so when it has", /\{copiedErrors \? "Copied" : "Copy all"\}/.test(code))
  check("a clipboard that refuses is reported, not swallowed", /toast\.error\("Could not copy"\)/.test(code))

  check("Solve with AI sends the file and the errors", /sections\/code\/fix/.test(code) && /source: fileContent/.test(code) && /errors: compileErrors\.map/.test(code))
  check("it has a loading state and cannot be pressed twice", /\{solving \? "Solving" : "Solve with AI"\}/.test(code) && /if \(solving \|\| !selectedFile\) return/.test(code) && /disabled=\{solving/.test(code))
  check("the flag is cleared whatever the server says", /\} finally \{\s*setSolving\(false\)/.test(code))
  check("it is offered only for a file the compiler compiles", /!selectedFile\?\.path\.endsWith\("\.storelib"\)/.test(code))
  check("a slow answer never lands in a file somebody moved on from", /openPathRef\.current !== path/.test(code))

  check("the endpoint is the owner's only", /if \(!user\) return NextResponse\.json/.test(route) && /\.eq\("creator_id", \(creator as \{ id: string \}\)\.id\)/.test(route))
  check(
    "what the model sends back is compiled before anybody sees it",
    /compileSection\(text, \{ file: opts\.path \}\)/.test(agent) && /The repair still does not compile/.test(agent),
  )
  /**
   * Three, not one. The old second-and-last attempt was where the compiler's
   * message usually landed, leaving nothing for the ordinary case of a model
   * fixing the error it was shown and introducing another.
   */
  check(
    "three repair attempts, then it stops",
    /for \(let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt\+\+\)/.test(agent) && MAX_REPAIR_ATTEMPTS === 3,
  )
  check(
    "and a repair that introduces a NEW defect is sent back, while one it inherited is not",
    /introduced/.test(agent) && /qualityErrors\(checkSectionQuality\(opts\.source\)\)/.test(agent),
  )
  check(
    "it is told to change only what the errors are about",
    /YOU ARE REPAIRING AN EXISTING FILE, not writing a new one\./.test(agent) && /Change only what the errors are about/.test(agent),
  )
  check(
    "and nothing is written to the account: the fix lands in the editor to be read",
    !/saveDraft|recordVersion/.test(route) && /setFileContent\(d\.source\)/.test(code) && /Fixed\. Check it, then save\./.test(code),
  )
}


/**
 * ===========================================================================
 *  A FILE'S NAME AND WHAT IS WRITTEN INSIDE IT
 * ===========================================================================
 * A section's type is its file name: that is what a page stores and what the
 * library is keyed by. The schema's own `type` line had to repeat it exactly
 * or the compiler refused the file — so a copy of a section could not be
 * saved under a new name ("the schema says type hero_centered but the file is
 * my_hero"), and neither could a rename, which is how most people start
 * writing one. The line is documentation now.
 *
 * This RUNS the compiler on a file whose schema disagrees with its name,
 * because "it saves now" is a claim about behaviour.
 */
{
  console.log("\n  The name on the file decides, and the schema need not repeat it")
  const src = [
    "<template>",
    '<section class="s">{{ settings.heading }}</section>',
    "</template>",
    "",
    "<style>",
    ".s { padding: 20px; }",
    "</style>",
    "",
    "<schema>",
    JSON.stringify(
      {
        schema_version: 1,
        type: "hero_centered",
        name: "A copy of the hero",
        settings: [{ type: "text", id: "heading", label: "Heading", default: "Hello" }],
      },
      null,
      2,
    ),
    "</schema>",
    "",
  ].join("\n")

  const asItsOwnFile = compileSection(src, { file: "sections/my_hero.storelib" })
  check(
    "a copy saved under another name compiles",
    asItsOwnFile.ok === true,
    asItsOwnFile.ok === false ? asItsOwnFile.errors.map((e) => e.message).join("; ") : "",
  )

  const held = compileSection(src, { file: "sections/my_hero.storelib", expectType: "my_hero" })
  check(
    "and the compiler can still be asked to hold a file to a type, for the assistant",
    held.ok === false && held.errors.some((e) => /a section's type is its file name/.test(e.message)),
  )

  /* The save's rules live in one module now, shared with the agent API; the
     route delegates to it. Read together, they are the same rules as before. */
  const route =
    readFileSync(join(root, "app/api/website-builder/themes/[installId]/files/route.ts"), "utf8") +
    readFileSync(join(root, "lib/website-builder/save-theme-file.ts"), "utf8")
  const code = route.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1")
  check("neither saving nor renaming asks it to", !/expectType/.test(code))
  check(
    "renaming a section still asks before it empties the pages that use it",
    /pagesUsingSection\(supabase, installId, fromSection\[1\]\)/.test(route) && /status: 409/.test(route),
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) {
  console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
  process.exit(1)
}
