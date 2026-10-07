/**
 * Theme settings › Breadcrumbs: a bar under the header on every page but the
 * home page, never twice (lib/website-builder/theme-breadcrumbs.ts).
 *
 *   npx tsx tests/theme-breadcrumbs.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { THEME_BREADCRUMBS_ID, breadcrumbsOn, pageHasBreadcrumbs, withThemeBreadcrumbs } from "@/lib/website-builder/theme-breadcrumbs"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import type { SectionInstance } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

const sec = (id: string, type: string, extra: Partial<SectionInstance> = {}): SectionInstance => ({ id, type, name: type, settings: {}, blocks: [], ...extra })
const page = [
  sec("a", "announcement_bar", { group: "header" }),
  sec("h", "header"),
  sec("s", "search", { settings: { color_scheme: "black" } }),
  sec("f", "footer"),
]

const placed = withThemeBreadcrumbs(page, {}, "page.search")
check("on by default, placed straight under the Header group", placed.map((s) => s.id).join() === `a,h,${THEME_BREADCRUMBS_ID},s,f`, placed.map((s) => s.id))
check("  drawn on the colours of what it sits on", placed[2].settings.color_scheme === "black")
check("  and not in the Header group itself", placed[2].group === undefined)
check("the page's own list is not changed", page.length === 4)
check("never on the home page", withThemeBreadcrumbs(page, {}, "index") === page)
check("switched off in Theme settings, never", withThemeBreadcrumbs(page, { breadcrumbs_enabled: false }, "page.search") === page && !breadcrumbsOn({ breadcrumbs_enabled: false }) && breadcrumbsOn({}))
check("the separator and alignment come from Theme settings, unknown values fall back",
  withThemeBreadcrumbs(page, { breadcrumbs_separator: "chevron", breadcrumbs_align: "center" }, "page")[2].settings.separator === "chevron" &&
  withThemeBreadcrumbs(page, { breadcrumbs_separator: "<b>", breadcrumbs_align: "nope" }, "page")[2].settings.align === "left")

const product = [sec("h", "header"), sec("p", "product", { blocks: [{ id: "b1", type: "breadcrumbs", settings: {} }] as never }), sec("f", "footer")]
check("a product section with its own Breadcrumbs block keeps it, no second bar", withThemeBreadcrumbs(product, {}, "product") === product && pageHasBreadcrumbs(product))
const hiddenBlock = [sec("h", "header"), sec("p", "product", { blocks: [{ id: "b1", type: "breadcrumbs", hidden: true, settings: {} }] as never })]
check("  a hidden one does not count", withThemeBreadcrumbs(hiddenBlock, {}, "product").some((s) => s.id === THEME_BREADCRUMBS_ID))
const ownSection = [sec("h", "header"), sec("b", "breadcrumbs"), sec("x", "rich_text")]
check("a page with a Breadcrumbs section of its own gets no second bar", withThemeBreadcrumbs(ownSection, {}, "page") === ownSection)
check("placing twice places once", withThemeBreadcrumbs(placed, {}, "page.search") === placed)

/* Breadcrumbs are a part of Layout now, under their own heading (tests/settings-cleanup.test.ts). */
const layout = THEME_SETTINGS_GROUPS.find((g) => g.id === "layout")
const crumbs = (layout?.fields ?? []).filter((f) => f.id.startsWith("breadcrumbs_")).map((f) => f.id).join()
check("Theme settings › Layout › Breadcrumbs: show, the separator, the style and the home icon", crumbs === "breadcrumbs_enabled,breadcrumbs_separator,breadcrumbs_style,breadcrumbs_home_icon" && (layout?.fields ?? []).some((f) => f.type === "header" && f.label === "Breadcrumbs"))
check("every storefront page gets it through dressPage", /withDynamicSources\(withThemeBreadcrumbs\(searchListsTheShop\(sections\), site\.themeSettings, template\)/.test(read("lib/website-builder/published-site.ts")))
const editor = read("app/website-builder/editor/[installId]/page.tsx")
check("the editor's canvas draws it too, and a click on it opens its setting", /withThemeBreadcrumbs\(\s*withDynamicSources\(searchListsTheShop\(canvasSections\),/.test(editor) && /sectionId === THEME_BREADCRUMBS_ID[\s\S]{0,300}setExpandedSettings\("layout"\)/.test(editor))

console.log(`\n${passed} passed, ${failed} failed\n`)
if (failed) process.exit(1)
