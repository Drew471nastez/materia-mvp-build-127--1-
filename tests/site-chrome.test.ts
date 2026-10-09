/**
 * ===========================================================================
 *  ONE HEADER, ONE FOOTER, AND A SECTION'S OWN COLOURS, RUN RATHER THAN READ
 * ===========================================================================
 * The owner's report: an AI asked to redo a site's header wrote a new section
 * called Header and put it in the page body, under the real one, without the
 * cart drawer, the search or a working menu. And a section could not offer a
 * colour of its own, because the panel hid every colour setting.
 *
 * A header file under any name but sections/header.storelib is saved. Those
 * two reserved filenames are refused so they do not shadow the built-in
 * sections. A header that is already there (an imported theme, a site saved
 * before) is kept and placed in the Header group as the one header, with the
 * built-in hidden (tests/section-groups.test.ts drives that).
 *
 * Each check below drives the code that decides, with the inputs a real
 * session sends:
 *
 *   lib/storelib-theme/chrome.ts         what counts as a header or footer
 *   lib/website-builder/save-theme-file  the door every save goes through
 *   lib/storelib-ai/integration.ts       what an agent is told on a refusal
 *   lib/storelib-theme/package.ts        a theme coming back from ChatGPT
 *   lib/storelib-theme/render.ts         `"default": "scheme.accent"`
 *   components/.../sections-list.tsx     the Header / Page / Footer list
 */
import { readFileSync } from "node:fs"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"

import { chromeRoleOf } from "@/lib/storelib-theme/chrome"
import { buildPackage, compileSection, readPackage, renderSection, validateSectionSchema } from "@/lib/storelib-theme"
import { parseStorelib } from "@/lib/storelib-theme/storelib/parse"
import { checkSectionIntegration } from "@/lib/storelib-ai/integration"
import { saveThemeFile } from "@/lib/website-builder/save-theme-file"
import { customAddableSections } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_COLOR_SCHEMES } from "@/lib/storelib-theme/color-schemes"
import { ALL_TOPICS } from "@/lib/storelib-ai/knowledge"
import { SectionsList } from "@/components/website-builder/editor/sections-list"
import { groupOf, kindLookup, splitGroups } from "@/lib/storelib-theme/section-groups"
import { pagesFromPackageFiles } from "@/lib/website-builder/theme-pages"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` (${JSON.stringify(detail).slice(0, 300)})` : ""}`) }
}
const read = (p: string) => readFileSync(p, "utf8")

/** A library section with its schema's name and type changed: a real, compiling file. */
function renamed(type: string, name: string): string {
  const src = DEFAULT_THEME_SOURCES["sections/cta_simple.storelib"]
  return src.replace(/"type":\s*"cta_simple"/, `"type": "${type}"`).replace(/"name":\s*"[^"]*"/, `"name": "${name}"`)
}

async function main() {
  console.log("\nWhat is a header or a footer")
  const flagged: string[] = []
  for (const [type, schema] of Object.entries(SECTION_SCHEMAS)) {
    const path = `sections/${type}.storelib`
    const src = DEFAULT_THEME_SOURCES[path]
    const parsed = src ? parseStorelib(src, path) : null
    if (chromeRoleOf({ schema: schema as unknown as Record<string, unknown>, type, template: parsed && parsed.ok ? parsed.value.template.text : undefined })) flagged.push(type)
  }
  check("of every section the theme ships, only the header and the footer themselves", flagged.sort().join(",") === "footer,header", flagged)
  for (const [name, role] of [
    ["Header", "header"], ["Site header", "header"], ["LD 02 — Header", "header"], ["Navbar", "header"], ["navigation_bar", "header"],
    ["Custom Footer", "footer"], ["Footer v2", "footer"],
  ] as const) {
    check(`"${name}" is a ${role}`, chromeRoleOf({ schema: { name } }) === role)
  }
  /* Round 25: a top strip, a menu bar and a mega menu are sections of their own, not the header in disguise. */
  for (const name of ["Page header", "Collection header", "Announcement bar", "Hero", "Mega menu", "Page links", "Top bar", "Menu bar", "Navigation menu", "Mega menu bar"]) {
    check(`"${name}" is a section like any other`, chromeRoleOf({ schema: { name } }) === null)
  }
  check("a schema that says group: header is one", chromeRoleOf({ schema: { name: "Brand", group: "header" } }) === "header")
  /* enabled_on says where a section may go, not what it is: an announcement bar sits in the header group. Only `kind` says it IS one, and then it is not refused. */
  check("Shopify's enabled_on groups place a section, they do not make it a header", chromeRoleOf({ schema: { name: "X", enabled_on: { groups: ["footer"] } } }) === null)
  check("but enabled_on on a footer by name is still a footer", chromeRoleOf({ schema: { name: "Footer", enabled_on: { groups: ["footer"] } } }) === "footer")
  check("and a section that declares kind is the creator's own, never refused", chromeRoleOf({ schema: { name: "Footer", kind: "footer" } }) === null)
  check("an outermost <header> holding a <nav> and named for it",
    chromeRoleOf({ schema: { name: "Brand nav" }, template: "<header><nav><a href='/'>a</a></nav></header>" }) === "header")
  check("a <nav> named for a menu is a menu, not the header (a mega menu, a sidebar's links)",
    chromeRoleOf({ schema: { name: "Mega menu" }, template: "<nav><ul><li><a href='/'>a</a></li></ul></nav>" }) === null && chromeRoleOf({ schema: { name: "Sidebar menu" }, template: "<nav><a href='/'>a</a></nav>" }) === null)
  check("but a <header> around a heading is a heading",
    chromeRoleOf({ schema: { name: "Intro" }, template: "<header class='x'><h1>Title</h1></header>" }) === null)

  console.log("\nThe save door reserves the built-in filenames, and saves a header of your own")
  const untouched = { from: () => { throw new Error("the database was reached") } }
  let customThrew = ""
  try {
    await saveThemeFile(untouched, "install-1", "sections/site_header.storelib", renamed("site_header", "Site header"))
  } catch (e) {
    customThrew = e instanceof Error ? e.message : String(e)
  }
  check("a section file named Site header is not refused as chrome; it reaches the database", /database was reached/.test(customThrew), customThrew)
  const atHeaderPath = await saveThemeFile(untouched, "install-1", "sections/header.storelib", renamed("header", "Brand strip"))
  check("sections/header.storelib is reserved, before the database", atHeaderPath.ok === false && atHeaderPath.status === 422)
  check("and the message says to use another name and keep the live values",
    atHeaderPath.ok === false && /sections\/<name>/.test(atHeaderPath.error) && /link_list/.test(atHeaderPath.error) && /data-storelib-cart/.test(atHeaderPath.error))
  const footer = await saveThemeFile(untouched, "install-1", "sections/footer.storelib", renamed("footer", "Site footer"))
  check("and sections/footer.storelib", footer.ok === false && footer.status === 422 && /link_list/.test(footer.ok === false ? footer.error : ""))

  console.log("\nAn agent is told to design it and keep the live values")
  const findings = checkSectionIntegration(renamed("navbar", "Navbar"))
  check("a navbar is not refused for being a header", !findings.some((f) => f.id === "integration-chrome" || f.severity === "error"), findings.map((f) => `${f.id}:${f.severity}`))
  check("the builder's AI is told design is free", /HEADER AND FOOTER ARE DESIGNED FREELY/.test(read("lib/website-builder/agent/loop.ts")))
  check("and so is every agent over MCP", /Design it freely/.test(read("lib/agent-rules/index.ts")))
  const chromeTopic = ALL_TOPICS.find((t) => t.id === "site-chrome")
  check("the AI's reference for the header is retrieved by a header request", !!chromeTopic && chromeTopic.triggers.test("make my header sticky like this screenshot"))
  const topic = chromeTopic?.text ?? ""
  check("and it names the live hooks, not a ban on writing one", /link_list/.test(topic) && /theme\.logo/.test(topic) && /data-storelib-cart/.test(topic) && /data-storelib-search/.test(topic) && /data-storelib-menu/.test(topic) && /checkout_url/.test(topic) && !/NEVER write/.test(topic) && !/refused on save/.test(topic))

  console.log("\nA theme back from ChatGPT keeps its header file, and draws one header")
  const pkgFiles: Record<string, string> = {
    "config/settings.json": "{}\n",
    "sections/site_header.storelib": renamed("site_header", "Site header"),
    "sections/promo.storelib": renamed("promo", "Promo strip"),
    "templates/index.json": JSON.stringify({
      sections: {
        h: { type: "header", settings: {} },
        /* The AI put its work in it: the header the creator meant. */
        sh: { type: "site_header", settings: { heading: "Brand" } },
        p: { type: "promo", settings: {} },
        f: { type: "footer", settings: {} },
      },
      order: ["h", "sh", "p", "f"],
    }),
  }
  const bytes = await buildPackage({ theme: { name: "Back from ChatGPT", version: "1.0.0", engine: { min: 1 } } as never, files: pkgFiles, assets: {} })
  const pkg = await readPackage(bytes, { knownTypes: ["header", "footer"] })
  check("the package is read, not refused", pkg.ok === true, pkg.ok === false ? pkg.errors : undefined)
  if (pkg.ok === true) {
    check("its header file is kept", "sections/site_header.storelib" in pkg.value.files)
    const kinds = kindLookup(pkg.value.files, SECTION_SCHEMAS as never)
    const page = pagesFromPackageFiles(pkg.value.files, kinds).find((p) => p.page_key === "index")?.sections ?? []
    const drawnHeaders = page.filter((s) => !s.hidden && groupOf(s) === "header" && (s.type === "header" || kinds(s.type) === "header"))
    check("and on the page it is the one header, in the Header group", drawnHeaders.map((s) => s.id).join(",") === "sh", page.map((s) => `${s.id}:${groupOf(s)}${s.hidden ? ":hidden" : ""}`))
    check("the built-in header is kept, hidden", page.some((s) => s.id === "h" && s.hidden === true))
    check("the other section and the footer stay where they were", splitGroups(page).template.map((s) => s.id).join(",") === "p" && splitGroups(page).footer.map((s) => s.id).join(",") === "f")
    check("a section that is not a header is kept", "sections/promo.storelib" in pkg.value.files)
  }

  console.log("\nAdd Section offers a header file in the Header group, never for a page body")
  const custom = { site_header: { ...SECTION_SCHEMAS.header, type: "site_header", name: "Site header", presets: [{ name: "x" }] }, promo: { type: "promo", name: "Promo", fields: [], presets: [{ name: "x" }] } }
  check("an old header-like section is not offered for a page body", customAddableSections(custom as never).join(",") === "promo")
  const editorSrc = read("app/website-builder/editor/[installId]/page.tsx")
  check("the page's own Add section leaves headers out; the Header group's lists the creator's own",
    /return g\.includes\("template"\) \|\| \(g\.includes\("header"\) && !kindOfType\(t\)\)/.test(editorSrc) && /kindOfType\(t\) === own\)/.test(editorSrc))

  console.log("\nA section's own colour follows its scheme until somebody picks one")
  const colourSrc = `<template>
<div class="r" data-scheme="{{ settings.color_scheme }}"><span class="r__stars" style="color: {{ settings.star_color }}">*</span>{% for block in blocks %}<i style="color: {{ block.settings.dot }}">.</i>{% endfor %}</div>
</template>

<style>
.r { display: block; }
</style>

<schema>
{
  "type": "rating",
  "name": "Rating",
  "settings": [
    { "type": "color_scheme", "id": "color_scheme", "label": "Scheme", "default": "white" },
    { "type": "color", "id": "star_color", "label": "Stars", "default": "scheme.accent" }
  ],
  "blocks": [{ "type": "item", "name": "Item", "settings": [{ "type": "color", "id": "dot", "label": "Dot", "default": "scheme.heading" }] }],
  "presets": [{ "name": "Rating" }]
}
</schema>
`
  const compiled = compileSection(colourSrc, { file: "sections/rating.storelib" })
  check("a colour whose default names a scheme colour compiles", compiled.ok === true, compiled.ok === false ? compiled.errors : undefined)
  if (compiled.ok === true) {
    const theme = {}
    const scheme = DEFAULT_COLOR_SCHEMES.dark
    const draw = (settings: Record<string, unknown>, blockSettings: Record<string, unknown> = {}) =>
      renderSection({ compiled: compiled.value, id: "s1", instance: { type: "rating", settings, blocks: { b1: { type: "item", settings: blockSettings } }, block_order: ["b1"] }, theme, page: { template: "index" } }).html
    const untouchedHtml = draw({ color_scheme: "dark" })
    check("untouched, it is the section's own accent", untouchedHtml.includes(`color: ${scheme.accent}`), untouchedHtml.slice(0, 400))
    check("and a block's colour follows the same scheme", untouchedHtml.includes(`color: ${scheme.heading}`))
    check("the name itself never reaches the page", !untouchedHtml.includes("scheme.accent") && !untouchedHtml.includes("scheme.heading"))
    const overridden = draw({ color_scheme: "dark", color_overrides: { accent: "#ff0066" } })
    check("Advanced colors reach it too, because it follows the section's resolved scheme", overridden.includes("color: #ff0066"))
    const picked = draw({ color_scheme: "dark", star_color: "#123456" })
    check("a colour the creator picked wins", picked.includes("color: #123456"))
  }
  const badDefault = validateSectionSchema({ schema_version: 1, type: "x", name: "X", settings: [{ type: "color", id: "c", label: "C", default: "scheme.nonsense" }] } as never)
  check("a default naming a colour no scheme has is refused", badDefault.ok === false)
  const goodDefault = validateSectionSchema({ schema_version: 1, type: "x", name: "X", settings: [{ type: "color", id: "c", label: "C", default: "scheme.primary_btn_bg" }] } as never)
  check("a legacy scheme name is accepted", goodDefault.ok === true, goodDefault.ok === false ? goodDefault.errors : undefined)

  console.log("\nThe panel shows a section's own colours, and nothing twice")
  const page = read("app/website-builder/editor/[installId]/page.tsx")
  check("colour settings are no longer filtered out wholesale", !/filter\(f => f\.type !== "color" && f\.type !== "color_scheme"/.test(page))
  check("only the older fields Advanced colors already edits are", /covered\.has\(f\.id\)/.test(page) && /LEGACY_OVERRIDE_FIELDS/.test(page))
  check("they are drawn as the same row Advanced colors uses", /<SectionColorSetting/.test(page))
  const design = read("components/website-builder/editor/design-panels.tsx")
  check("hover colours are rows, not behind a toggle of their own", !/<span>Hover colors<\/span>/.test(design) && !/hoverOpen/.test(design) && /\{parts\.map\(row\)\}/.test(design))
  const dynamicField = read("components/website-builder/editor/controls/dynamic-source-field.tsx")
  check("Insert shop data has no tooltip", !/TooltipContent/.test(dynamicField) && /h-\[18px\] w-\[18px\]/.test(dynamicField))

  console.log("\nThe Sections panel: Header, Page, Footer")
  const sections: SectionInstance[] = [
    { id: "h", type: "header", name: "Header", settings: {} },
    { id: "a", type: "hero", name: "Hero", settings: {} },
    { id: "b", type: "faq", name: "FAQ", settings: {}, hidden: true },
    { id: "f", type: "footer", name: "Footer", settings: {} },
  ]
  const noop = () => {}
  const html = renderToStaticMarkup(
    createElement(SectionsList, {
      sections,
      nameOf: (s: SectionInstance) => s.name,
      selectedId: null,
      onSelect: noop, onToggleHide: noop, onDuplicate: noop, onRemove: noop, onMove: noop, onAdd: noop,
      dnd: { onReorder: noop },
    }),
  )
  const groups = [...html.matchAll(/data-section-group="([a-z]+)"/g)].map((m) => m[1])
  check("three groups, in order", groups.join(",") === "header,template,footer", groups)
  /* "Template" was the theme editors' word; the owner asked for a better one. The group's data name stays. */
  /* The heading over each group: quiet, uppercase, on the rows' own left edge (tree-parts.tsx). */
  const groupLabels = [...html.matchAll(/<p class="[^"]*uppercase[^"]*">([^<]+)<\/p>/g)].map((m) => m[1])
  check("the groups read Header, Page and Footer, and nothing says Template", groupLabels.join(",") === "Header,Page,Footer" && !/>Template</.test(html), groupLabels)
  check("Add section in the Header group, at the end of the page and in the Footer group", (html.match(/data-add-section=""/g) ?? []).length === 3)
  const headerGroup = html.slice(html.indexOf('data-section-group="header"'), html.indexOf('data-section-group="template"'))
  const templateGroup = html.slice(html.indexOf('data-section-group="template"'), html.indexOf('data-section-group="footer"'))
  check("the header row is in the Header group, and only there", /data-section-row="h"/.test(headerGroup) && !/data-section-row="h"/.test(templateGroup))
  check("the page's own sections are in the Page group", /data-section-row="a"/.test(templateGroup) && /data-section-row="b"/.test(templateGroup))
  check("a body row has Hide, Delete and a menu", /aria-label="Hide Hero"/.test(templateGroup) && /aria-label="Delete Hero"/.test(templateGroup) && /aria-label="More for Hero"/.test(templateGroup))
  check("the header can be deleted from its menu, never from a bin under the pointer", !/aria-label="Delete Header"/.test(headerGroup) && /aria-label="More for Header"/.test(headerGroup))
  const eye = templateGroup.match(/<button[^>]*aria-label="Show FAQ"[^>]*>/)?.[0] ?? ""
  check("a hidden row keeps its eye in view, to bring it back", /class="[^"]*\bflex\b/.test(eye) && !/class="[^"]*\bhidden\b/.test(eye), eye)
  const bin = templateGroup.match(/<button[^>]*aria-label="Delete Hero"[^>]*>/)?.[0] ?? ""
  check("and Delete waits for the pointer taking no room, so a touch on the name cannot reach it", /class="[^"]*\bhidden group-hover\/row:flex\b/.test(bin), bin)
  check("a row is 32px on a computer", /data-section-row="a"[^>]*class="[^"]*\bh-8\b/.test(html))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
