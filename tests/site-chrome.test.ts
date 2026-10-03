/**
 * ===========================================================================
 *  ONE HEADER, ONE FOOTER, AND A SECTION'S OWN COLOURS, RUN RATHER THAN READ
 * ===========================================================================
 * The owner's report: an AI asked to redo a site's header wrote a new section
 * called Header and put it in the page body, under the real one, without the
 * cart drawer, the search or a working menu. And a section could not offer a
 * colour of its own, because the panel hid every colour setting.
 *
 * Each check below drives the code that decides, with the inputs a real
 * session sends:
 *
 *   lib/storelib-theme/chrome.ts         what counts as a header or footer
 *   lib/website-builder/save-theme-file  the door every save goes through
 *   lib/storelib-ai/integration.ts       what an agent is told on a refusal
 *   lib/storelib-theme/package.ts        a theme coming back from ChatGPT
 *   lib/storelib-theme/render.ts         `"default": "scheme.accent"`
 *   components/.../sections-list.tsx     the Header / Template / Footer list
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
    ["Top bar", "header"], ["Custom Footer", "footer"], ["Footer v2", "footer"],
  ] as const) {
    check(`"${name}" is a ${role}`, chromeRoleOf({ schema: { name } }) === role)
  }
  for (const name of ["Page header", "Collection header", "Announcement bar", "Hero", "Mega menu", "Page links"]) {
    check(`"${name}" is a section like any other`, chromeRoleOf({ schema: { name } }) === null)
  }
  check("a schema that says group: header is one", chromeRoleOf({ schema: { name: "Brand", group: "header" } }) === "header")
  check("and Shopify's enabled_on groups", chromeRoleOf({ schema: { name: "X", enabled_on: { groups: ["footer"] } } }) === "footer")
  check("an outermost <header> holding a <nav> and named for it",
    chromeRoleOf({ schema: { name: "Brand nav" }, template: "<header><nav><a href='/'>a</a></nav></header>" }) === "header")
  check("but a <header> around a heading is a heading",
    chromeRoleOf({ schema: { name: "Intro" }, template: "<header class='x'><h1>Title</h1></header>" }) === null)

  console.log("\nThe save door refuses one, for everybody")
  const untouched = { from: () => { throw new Error("the database was reached") } }
  const asHeader = await saveThemeFile(untouched, "install-1", "sections/site_header.storelib", renamed("site_header", "Site header"))
  check("a section file named Site header is refused, before the database", asHeader.ok === false && asHeader.status === 422, asHeader)
  check("and the refusal says what to change instead",
    asHeader.ok === false && /one header/.test(asHeader.error) && /nav_link/.test(asHeader.error) && /sticky/.test(asHeader.error))
  const atHeaderPath = await saveThemeFile(untouched, "install-1", "sections/header.storelib", renamed("header", "Brand strip"))
  check("so is any file at sections/header.storelib, whatever it calls itself", atHeaderPath.ok === false && atHeaderPath.status === 422)
  const footer = await saveThemeFile(untouched, "install-1", "sections/site_footer.storelib", renamed("site_footer", "Site footer"))
  check("and a footer", footer.ok === false && /one footer/.test(footer.ok === false ? footer.error : ""))

  console.log("\nAn agent is told, first and alone")
  const findings = checkSectionIntegration(renamed("navbar", "Navbar"))
  check("the integration check names it and nothing else", findings.length === 1 && findings[0].id === "integration-chrome" && findings[0].severity === "error", findings.map((f) => f.id))
  check("the builder's AI is told the same", /THERE IS ONE HEADER AND ONE FOOTER/.test(read("lib/website-builder/agent/loop.ts")))
  check("and so is every agent over MCP", /There is ONE header and ONE footer/.test(read("lib/agent-rules/index.ts")))
  const chromeTopic = ALL_TOPICS.find((t) => t.id === "site-chrome")
  check("the AI's reference for the header is retrieved by a header request", !!chromeTopic && chromeTopic.triggers.test("make my header sticky like this screenshot"))
  const headerIds = new Set((SECTION_SCHEMAS.header.fields ?? []).map((f) => f.id))
  const footerIds = new Set((SECTION_SCHEMAS.footer.fields ?? []).map((f) => f.id))
  const named = [...(chromeTopic?.text ?? "").matchAll(/\b([a-z]+(?:_[a-z0-9]+)+)\b/g)].map((m) => m[1]).filter((id) => !["nav_link", "link_type", "parent_id", "footer_column", "footer_link"].includes(id))
  const unknown = named.filter((id) => !headerIds.has(id) && !footerIds.has(id))
  check("and every setting it names is one the header or footer really has", named.length > 15 && unknown.length === 0, unknown)

  console.log("\nA theme back from ChatGPT keeps the site's own header")
  const pkgFiles: Record<string, string> = {
    "config/settings.json": "{}\n",
    "sections/site_header.storelib": renamed("site_header", "Site header"),
    "sections/promo.storelib": renamed("promo", "Promo strip"),
    "templates/index.json": JSON.stringify({
      sections: {
        h: { type: "header", settings: {} },
        sh: { type: "site_header", settings: {} },
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
    const t = JSON.parse(pkg.value.files["templates/index.json"])
    check("its header file is left out", !("sections/site_header.storelib" in pkg.value.files))
    check("and so is its use on the page, while the real header, the footer and the other section stay", t.order.join(",") === "h,p,f", t.order)
    check("and the import says so", (pkg.warnings ?? []).some((w) => /site_header\.storelib is a header/.test(w.message)))
    check("a section that is not a header is kept", "sections/promo.storelib" in pkg.value.files)
  }

  console.log("\nAdd Section does not offer one saved before")
  const custom = { site_header: { ...SECTION_SCHEMAS.header, type: "site_header", name: "Site header", presets: [{ name: "x" }] }, promo: { type: "promo", name: "Promo", fields: [], presets: [{ name: "x" }] } }
  check("an old header-like section is not offered for a page body", customAddableSections(custom as never).join(",") === "promo")

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
  check("Insert shop data has no tooltip", !/TooltipContent/.test(dynamicField) && /h-\[22px\] w-\[22px\]/.test(dynamicField))

  console.log("\nThe Sections panel: Header, Template, Footer")
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
      dnd: { sensors: [], modifiers: [], draggingId: null, onDragStart: noop, onDragOver: noop, onDragCancel: noop, onDragEnd: noop },
    }),
  )
  const groups = [...html.matchAll(/data-section-group="([a-z]+)"/g)].map((m) => m[1])
  check("three groups, in order", groups.join(",") === "header,template,footer", groups)
  check("Add section under the header and at the end of the page, nowhere else", (html.match(/data-add-section=""/g) ?? []).length === 2)
  const headerGroup = html.slice(html.indexOf('data-section-group="header"'), html.indexOf('data-section-group="template"'))
  const templateGroup = html.slice(html.indexOf('data-section-group="template"'), html.indexOf('data-section-group="footer"'))
  check("the header row is in the Header group, and only there", /data-section-row="h"/.test(headerGroup) && !/data-section-row="h"/.test(templateGroup))
  check("the page's own sections are in the Template group", /data-section-row="a"/.test(templateGroup) && /data-section-row="b"/.test(templateGroup))
  check("a body row has Hide, Delete and a menu", /aria-label="Hide Hero"/.test(templateGroup) && /aria-label="Delete Hero"/.test(templateGroup) && /aria-label="More for Hero"/.test(templateGroup))
  check("the header has no Delete and no menu", !/Delete Header/.test(headerGroup) && !/More for Header/.test(headerGroup))
  const eye = templateGroup.match(/<button[^>]*aria-label="Show FAQ"[^>]*>/)?.[0] ?? ""
  check("a hidden row keeps its eye in view, to bring it back", /class="[^"]*\bflex\b/.test(eye) && !/class="[^"]*\bhidden\b/.test(eye), eye)
  const bin = templateGroup.match(/<button[^>]*aria-label="Delete Hero"[^>]*>/)?.[0] ?? ""
  check("and Delete waits for the pointer taking no room, so a touch on the name cannot reach it", /class="[^"]*\bhidden group-hover\/row:flex\b/.test(bin), bin)
  check("a row is 32px on a computer", /data-section-row="a"[^>]*class="[^"]*\bh-8\b/.test(html))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) { console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`); process.exit(1) }
}

void main()
