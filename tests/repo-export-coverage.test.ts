/**
 * ===========================================================================
 *  NOTHING THE BUILDER SHOWS IS MISSING FROM THE REPOSITORY
 * ===========================================================================
 * Every part of the builder is enumerated here with the same functions the
 * builder draws it with, and each one is looked for in what Storelib writes
 * to GitHub (lib/github-sync/layout.ts themeFiles, through repoFilesFor, the
 * exact files a Push sends):
 *
 *   pages             the page list, each page's sections in order, with
 *                     their settings and blocks at every depth, the header
 *                     and footer groups
 *   sections          everything Add section offers, and every type a page
 *                     uses
 *   blocks            every block Add block can offer (themeBlockCatalog,
 *                     the builder's own catalog)
 *   theme settings    every control Theme settings draws (themeSettingsGroupsFor
 *                     for a Storelib theme; compatThemeGroups for an imported
 *                     one), defined in the repository and with its value
 *   platform settings Storelib's own groups, in config/storelib_settings_schema.json
 *   menus             the store's menus, as Navigation shows them
 *   colour schemes    every scheme the scheme picker lists
 *
 * Then the same list for the MCP tools: each part has a tool that reads it
 * and one that changes it.
 */
import JSZip from "jszip"

import { repoFilesFor } from "@/lib/github-sync/sync"
import { PLATFORM_SETTINGS_PATH, type ThemeSnapshot } from "@/lib/github-sync/layout"
import { referenceSchemas } from "@/lib/github-sync/snapshot"
import { compatThemeGroups, readPanel, COMPAT_PANEL_PATH } from "@/lib/storelib-theme/platform-settings"
import { builtInSettingsSchema, themeSettingsGroupsFor } from "@/lib/storelib-theme/theme-config"
import { themeColorSchemes } from "@/lib/storelib-theme/color-schemes"
import { themeBlockCatalog, schemasFromSources } from "@/lib/website-builder/storelib-schemas"
import { SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { splitGroups } from "@/lib/storelib-theme/section-groups"
import { isCompatSource } from "@/lib/storelib-theme/compat/theme"
import { convertShopifyTheme } from "@/lib/storelib-theme/shopify/convert"
import { MEMORY_TOOLS, PROJECT_TOOLS, TOOLS } from "@/lib/agent-access/mcp"
import { PAGE_OP_NAMES } from "@/lib/agent-access/page-ops"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? ` :: ${typeof detail === "string" ? detail : JSON.stringify(detail)?.slice(0, 600)}` : ""}`)
  }
}

type O = Record<string, any>
const DEFAULT = DEFAULT_THEME_SOURCES as Record<string, string>
const PRESENTATIONAL = new Set(["header", "paragraph", "divider"])

function exported(snap: ThemeSnapshot) {
  const files = repoFilesFor(snap, { branch: "main", root_path: "" }).files
  const at = new Map(files.map((f) => [f.path, f]))
  const json = (p: string): any => {
    const f = at.get(p)
    return f?.text ? JSON.parse(f.text) : null
  }
  return { paths: new Set(at.keys()), json, text: (p: string) => at.get(p)?.text ?? "" }
}

/** A page's sections as the repository holds them: the header, footer and overlay group files, then the template's. */
function sectionsInRepo(ex: ReturnType<typeof exported>, key: string): O[] {
  const out: O[] = []
  for (const file of ["sections/header-group.json", `templates/${key}.json`, "sections/footer-group.json", "sections/overlay-group.json"]) {
    const t = ex.json(file)
    if (!t) continue
    for (const id of t.order ?? []) out.push({ id, ...t.sections[id] })
  }
  return out
}

/** Every block in a section the builder's tree shows, by path, with its type and settings. */
function blockPaths(blocks: unknown, above = ""): Map<string, O> {
  const out = new Map<string, O>()
  const list: O[] = Array.isArray(blocks) ? (blocks as O[]) : blocks && typeof blocks === "object" ? Object.entries(blocks as O).map(([id, b]) => ({ id, ...b })) : []
  for (const b of list) {
    const path = `${above}${b.id}`
    out.set(path, { type: b.type, settings: b.settings ?? {} })
    for (const [p, v] of blockPaths(b.blocks, `${path}/`)) out.set(p, v)
  }
  return out
}
/** The repository's page shape keeps blocks keyed, with block_order; read it as the builder's tree. */
function repoBlockPaths(section: O, above = ""): Map<string, O> {
  const out = new Map<string, O>()
  const blocks = section.blocks ?? {}
  const order: string[] = section.block_order ?? Object.keys(blocks)
  for (const id of new Set([...order, ...Object.keys(blocks)])) {
    const b = blocks[id]
    if (!b) continue
    const path = `${above}${id}`
    out.set(path, { type: b.type, settings: b.settings ?? {} })
    for (const [p, v] of repoBlockPaths(b, `${path}/`)) out.set(p, v)
  }
  return out
}

const valueAt = (values: O, id: string) => id.split("::").reduce<any>((cur, k) => (cur && typeof cur === "object" ? cur[k] : undefined), values)

function checkPages(snap: ThemeSnapshot, ex: ReturnType<typeof exported>) {
  check("every page in the builder's page list has its template file", snap.pages.every((p) => ex.paths.has(`templates/${p.page_key}.json`)), snap.pages.map((p) => p.page_key).filter((k) => !ex.paths.has(`templates/${k}.json`)))
  const missing: string[] = []
  for (const page of snap.pages) {
    const shown = page.sections as O[]
    const repo = sectionsInRepo(ex, page.page_key)
    const groups = splitGroups(shown as never)
    const own = groups.template as O[]
    const repoIds = repo.map((s) => s.id)
    for (const s of [...groups.header, ...own, ...groups.footer, ...groups.overlay] as O[]) {
      const r = repo.find((x) => x.id === s.id)
      if (!r) {
        missing.push(`${page.page_key}: section ${s.id}`)
        continue
      }
      if (r.type !== s.type) missing.push(`${page.page_key}: ${s.id} is ${r.type}, not ${s.type}`)
      for (const [k, v] of Object.entries(s.settings ?? {})) if (JSON.stringify(r.settings?.[k]) !== JSON.stringify(v)) missing.push(`${page.page_key}: ${s.id}.${k}`)
      const want = blockPaths(s.blocks)
      const have = repoBlockPaths(r)
      for (const [p, b] of want) {
        const got = have.get(p)
        if (!got || got.type !== b.type) missing.push(`${page.page_key}: ${s.id} block ${p}`)
        else for (const [k, v] of Object.entries(b.settings)) if (JSON.stringify(got.settings[k]) !== JSON.stringify(v)) missing.push(`${page.page_key}: ${s.id} block ${p}.${k}`)
      }
    }
    const order = own.map((s) => s.id)
    if (order.join() !== repoIds.filter((id) => order.includes(id)).join()) missing.push(`${page.page_key}: order`)
  }
  check("  every section on every page, in order, with its settings and its blocks at every depth", missing.length === 0, missing)
}

async function main() {
  console.log("\nA Storelib theme")
  {
    const badge = DEFAULT["blocks/text.storelib"]
    const promo = DEFAULT["sections/cta_simple.storelib"].replace(/"type": "cta_simple"/, '"type": "my_promo"').replace(/"name": "Simple CTA"/, '"name": "My promo"')
    const files: Record<string, string> = {
      "sections/my_promo.storelib": promo,
      "blocks/badge.storelib": badge,
      "config/settings_schema.json": JSON.stringify([
        { name: "Layout", id: "layout", settings: [{ type: "range", id: "page_width", label: "Max page width", min: 900, max: 1800, step: 20, unit: "px", default: 1400 }] },
        { name: "Extras", settings: [{ type: "checkbox", id: "show_stamp", label: "Show stamp", default: true }, { type: "text", id: "stamp_text", label: "Stamp" }] },
      ]),
    }
    const settings = {
      brand_name: "Astrid",
      stamp_text: "Since 1999",
      menus: { main: { title: "Main", links: [{ title: "Shop", url: "/shop", links: [{ title: "New", url: "/new" }] }] } },
      color_schemes: { dark: { background: "#101010" }, mine: { name: "Mine", background: "#fafafa", text: "#111111" } },
      default_color_scheme: "light",
    }
    const pages = [
      {
        page_key: "home",
        sections: [
          { id: "header", type: "header", name: "Header", settings: { menu: "main" } },
          { id: "hero-1", type: "hero", name: "Hero", settings: { heading: "Hello" } },
          {
            id: "grp-1",
            type: "blocks_section",
            name: "Blocks",
            settings: {},
            blocks: [{ id: "g1", type: "group", settings: {}, blocks: [{ id: "h1", type: "heading", settings: { text: "Inside" } }, { id: "b1", type: "badge", settings: { text: "New" } }] }],
          },
          { id: "promo-1", type: "my_promo", name: "My promo", settings: { heading: "Buy" } },
          { id: "footer", type: "footer", name: "Footer", settings: {} },
        ],
      },
      { page_key: "about", sections: [{ id: "header", type: "header", settings: {} }, { id: "rt", type: "rich_text", settings: {} }, { id: "footer", type: "footer", settings: {} }] },
    ]
    const snap: ThemeSnapshot = { name: "Astrid", compat: false, settings, pages, files, defaults: { ...DEFAULT }, referenceSchemas: referenceSchemas(), settingsSchema: builtInSettingsSchema() }
    const ex = exported(snap)

    checkPages(snap, ex)

    /* Add section: the builder's library, the built-ins and this site's own. */
    const addable = [...Object.keys(SECTION_SCHEMAS), ...Object.keys(schemasFromSources(files))]
    const noFile = addable.filter((t) => !ex.paths.has(`sections/${t}.storelib`) && !ex.paths.has(`sections/${t}.json`))
    check(`every section Add section can offer (${addable.length}) is in sections/, as a file or a schema to read`, noFile.length === 0, noFile)

    /* Add block: the catalog the editor builds (app/(storelib)/website-builder/editor/[installId]/page.tsx blockCatalog). */
    const sources = { ...DEFAULT, ...files }
    const catalog = themeBlockCatalog(sources, { builtIn: !isCompatSource(sources["layout/theme.storelib"]) })
    const noBlock = Object.keys(catalog).filter((t) => !ex.paths.has(`blocks/${t}.storelib`))
    check(`every block Add block can offer (${Object.keys(catalog).length}), this site's own too, is in blocks/`, noBlock.length === 0 && "badge" in catalog, noBlock)

    /* Theme settings: the groups the sidebar draws from the theme's file over Storelib's. */
    const groups = themeSettingsGroupsFor(files["config/settings_schema.json"])
    const values = ex.json("config/settings.json")
    const schemaIds = new Set<string>((ex.json("config/settings_schema.json") ?? []).flatMap((g: O) => (g.settings ?? []).map((s: O) => s.id)))
    const platformIds = new Set<string>((ex.json(PLATFORM_SETTINGS_PATH)?.panels ?? []).flatMap((p: O) => p.settings.map((s: O) => s.id)))
    const fields = groups.flatMap((g) => g.fields.filter((f) => !PRESENTATIONAL.has(f.type)))
    const undefinedHere = fields.filter((f) => !schemaIds.has(f.id) && !platformIds.has(f.id)).map((f) => f.id)
    check(`every control Theme settings draws (${fields.length}) is defined in config/settings_schema.json or ${PLATFORM_SETTINGS_PATH}`, undefinedHere.length === 0, undefinedHere)
    const noValue = fields.filter((f) => (f.default !== undefined || (settings as O)[f.id] !== undefined) && values[f.id] === undefined).map((f) => f.id)
    check("  and every one with a value or a default has it in config/settings.json", noValue.length === 0, noValue)
    check("  the theme's own setting with its value, and its own default", values.stamp_text === "Since 1999" && values.show_stamp === true)

    check("the menus Navigation shows, nested links included, are in config/settings.json", JSON.stringify(values.menus) === JSON.stringify(settings.menus))
    const schemes = Object.keys(themeColorSchemes(settings))
    const builtIn = ex.json(PLATFORM_SETTINGS_PATH)?.color_schemes?.built_in ?? {}
    const noScheme = schemes.filter((k) => !(k in (values.color_schemes ?? {})) && !(k in builtIn))
    check(`every colour scheme the picker lists (${schemes.join(", ")}) is in the repository`, noScheme.length === 0 && values.color_schemes.mine.background === "#fafafa" && values.default_color_scheme === "light", noScheme)
  }

  console.log("\nAn imported theme")
  {
    const zip = new JSZip()
    zip.file("layout/theme.liquid", "<html><body>{{ content_for_layout }}</body></html>")
    zip.file(
      "sections/hero.liquid",
      '<div>{{ section.settings.heading }}{% content_for "blocks" %}</div>\n{% schema %}\n{"name":"Hero","settings":[{"type":"text","id":"heading","label":"Heading","default":"Hi"}],"blocks":[{"type":"@theme"}],"presets":[{"name":"Hero"}]}\n{% endschema %}',
    )
    zip.file("blocks/card.liquid", '<div class="card">{{ block.settings.title }}{% content_for "blocks" %}</div>\n{% schema %}\n{"name":"Card","settings":[{"type":"text","id":"title","label":"Title"}],"blocks":[{"type":"@theme"}],"presets":[{"name":"Card"}]}\n{% endschema %}')
    zip.file("blocks/_price.liquid", '<span>{{ block.settings.amount }}</span>\n{% schema %}\n{"name":"Price","settings":[{"type":"text","id":"amount","label":"Amount"}]}\n{% endschema %}')
    zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header group", sections: { h: { type: "hero", settings: { heading: "Top" } } }, order: ["h"] }))
    zip.file(
      "templates/index.json",
      JSON.stringify({ sections: { s1: { type: "hero", settings: { heading: "Welcome" }, blocks: { c1: { type: "card", settings: { title: "One" }, blocks: { c2: { type: "card", settings: { title: "Inner" } } }, block_order: ["c2"] } }, block_order: ["c1"] } }, order: ["s1"] }),
    )
    zip.file(
      "config/settings_schema.json",
      JSON.stringify([
        { name: "theme_info", theme_name: "Mini", theme_version: "1.0.0" },
        { name: "Colors", settings: [{ type: "color_scheme_group", id: "color_schemes", definition: [{ type: "color", id: "background", label: "Background", default: "#FFFFFF" }, { type: "color", id: "text", label: "Text", default: "#000000" }] }, { type: "color", id: "accent", label: "Accent", default: "#ff0000" }] },
        { name: "Layout", settings: [{ type: "range", id: "page_width", label: "Page width", min: 1000, max: 1600, step: 100, unit: "px", default: 1200 }] },
      ]),
    )
    zip.file("config/settings_data.json", JSON.stringify({ current: { accent: "#123456", color_schemes: { "scheme-1": { settings: { background: "#fefefe", text: "#111111" } }, "scheme-2": { settings: { background: "#000000", text: "#ffffff" } } } } }))
    const converted = await convertShopifyTheme(zip)
    if (converted.ok === false) throw new Error(converted.error)
    const t = converted.theme
    const settings = { ...t.settings, menus: { main: { title: "Main", links: [{ title: "Shop", url: "/shop" }] } } }
    const snap: ThemeSnapshot = { name: "Mini", compat: true, settings, pages: t.pages, files: t.files, defaults: {} }
    const ex = exported(snap)

    checkPages(snap, ex)

    /* Add section in an imported theme: the theme's own sections (customSectionSchemas over its files). */
    const own = Object.keys(schemasFromSources(t.files))
    check(`every one of the theme's sections (${own.join(", ")}) is in sections/`, own.length > 0 && own.every((s) => ex.paths.has(`sections/${s}.storelib`)))
    const catalog = themeBlockCatalog(t.files, { builtIn: !isCompatSource(t.files["layout/theme.storelib"]) })
    /* Changed on purpose (round reviews-1023): Add block also offers Storelib Reviews' app blocks where the theme takes "@app"; they are Storelib's, kept on the page by their address, and have no file to export. */
    const fileBlocks = Object.keys(catalog).filter((b) => !b.startsWith("shopify://apps/"))
    check(`every block Add block can offer (${fileBlocks.join(", ")}), private ones too, is in blocks/`, fileBlocks.length === 2 && fileBlocks.every((b) => ex.paths.has(`blocks/${b}.storelib`)))

    /* Theme settings: the theme's panel, then Storelib's group, as the builder lists them. */
    const groups = compatThemeGroups(readPanel(t.files[COMPAT_PANEL_PATH]))
    const listed = ex.json(COMPAT_PANEL_PATH) as O[]
    const values = ex.json("config/settings.json").shopify as O
    const fields = groups.flatMap((g) => g.settings.filter((f) => !PRESENTATIONAL.has(f.type)))
    const listedIds = new Set(listed.flatMap((g) => g.settings.map((s: O) => s.id)))
    const platformIds = new Set<string>((ex.json(PLATFORM_SETTINGS_PATH)?.panels ?? []).flatMap((p: O) => p.settings.map((s: O) => s.id)))
    check(`the Theme settings list (${groups.map((g) => g.name).join(", ")}) is the exported panel's, group by group`, JSON.stringify(groups.map((g) => g.name)) === JSON.stringify(listed.map((g) => g.name)))
    const notDefined = fields.filter((f) => !listedIds.has(f.id) || (f.id.startsWith("storelib_") && !platformIds.has(f.id))).map((f) => f.id)
    check(`every control it draws (${fields.length}) is in shopify/config/settings_panel.json, and each of Storelib's in ${PLATFORM_SETTINGS_PATH}`, notDefined.length === 0, notDefined)
    /*
      A value is in config/settings.json. A default not chosen is there too for
      Storelib's settings; for the theme's own it is where the theme declares
      it, in its shopify/config/settings_schema.json, as on any store.
    */
    const themeDefaults = new Map<string, unknown>((ex.json("shopify/config/settings_schema.json") as O[]).flatMap((g) => (g.settings ?? []).map((s: O) => [s.id, s.default] as [string, unknown])))
    const noValue = fields
      .filter((f) => f.default !== undefined || valueAt(settings.shopify as O, f.id) !== undefined)
      .filter((f) => valueAt(values, f.id) === undefined && (f.id.startsWith("storelib_") || themeDefaults.get(f.id) === undefined))
      .map((f) => f.id)
    check("  and every one with a value or a default has it in config/settings.json (or, the theme's own, in its settings_schema.json), colour scheme colours included", noValue.length === 0 && fields.some((f) => f.id.includes("::")), noValue)
    check("  Storelib's own with every default written out", fields.filter((f) => f.id.startsWith("storelib_")).every((f) => valueAt(values, f.id) !== undefined))
    check("the colour schemes the picker lists are in config/settings.json", values.color_schemes?.["scheme-2"]?.settings?.background === "#000000")
    check("the menus are in config/settings.json", ex.json("config/settings.json").menus?.main?.links?.[0]?.title === "Shop")
  }

  console.log("\nThe same parts over MCP")
  {
    const names = new Set<string>([...TOOLS, ...PROJECT_TOOLS, ...MEMORY_TOOLS].map((t) => t.name))
    const has = (...n: string[]) => n.every((x) => names.has(x))
    check("pages: read one, read the list, make one, change one", has("storelib_read_project", "storelib_read_page", "storelib_create_page", "storelib_create_safe_patch") && PAGE_OP_NAMES.includes("add_section" as never))
    check("sections: list, read, compile, write", has("storelib_list_files", "storelib_read_file", "storelib_compile", "storelib_write_section", "storelib_create_section", "storelib_edit_section"))
    check("blocks: added, moved and changed on a page, inside a group too", ["add_block", "update_block", "move_block", "remove_block"].every((o) => PAGE_OP_NAMES.includes(o as never)))
    const styles = PROJECT_TOOLS.find((t) => t.name === "storelib_update_styles")!.description
    check("theme settings, Storelib's own, menus and colour schemes: update_styles says it takes them", /theme's settings/.test(styles) && /storelib_\*/.test(styles) && /menus/.test(styles) && /colour schemes/.test(styles))
    const project = PROJECT_TOOLS.find((t) => t.name === "storelib_read_project")!.description
    check("  and read_project says where each part of Theme settings is", /Theme settings/.test(project) && /theme blocks/.test(project))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
