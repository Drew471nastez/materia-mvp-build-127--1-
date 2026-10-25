/**
 * ===========================================================================
 *  THEME SETTINGS THAT REACH THE PAGE, AND A THEME WITHOUT WALLS, ROUND 25
 * ===========================================================================
 * The owner: "audit and connect all the theme settings, typography and
 * colour schemes, like Shopify", and "Storelib should not hardcode rules
 * into nav bars, sidebars, drawers, mega menus, product pages, collection
 * pages, search or filters: full freedom, like Shopify. The AI should build
 * a whole store, not compose the current sections."
 *
 * Each check is one finding of the round's audit, held where it was fixed.
 *
 * Run with:  npm run test:push
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { buttonRadiusStyle } from "@/components/website-builder/sections/_shared"
import { drawsTheProduct, newSectionSettings, renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { collectionSections } from "@/lib/website-builder/shop-page"
import { withMainProduct } from "@/lib/website-builder/product-page"
import { chromeRoleOf } from "@/lib/storelib-theme/chrome"
import { compileBlock, compileSection } from "@/lib/storelib-theme/storelib/compile"
import { themeAnimation } from "@/lib/website-builder/section-anchors"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { BUILT_IN_PAGE_KEYS, templateForPage } from "@/lib/website-builder/site-pages"
import { pageGroupOf } from "@/lib/website-builder/page-groups"
import { PAGE_META } from "@/lib/website-builder/types"
import type { SectionInstance, ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const theme = (t: Record<string, unknown>) => t as unknown as ThemeSettingsValues
const section = (type: string, settings: Record<string, unknown> = {}): SectionInstance => ({ id: `${type}-1`, type, name: type, settings, blocks: [] } as SectionInstance)

console.log("\nBUTTONS")
{
  const outline = themeStylesheet(theme({ button_style: "outline" }))
  check("Outline: the label and the border are the button's colour, never its text colour on nothing", /background:transparent;color:var\(--s-btn,currentColor\);border:1px solid var\(--s-btn,currentColor\)/.test(outline))
  check("Outline fills on hover", /:hover\{background:var\(--s-btn,currentColor\);color:var\(--s-btn-text,#fff\)/.test(outline))
  const ghost = themeStylesheet(theme({ button_style: "ghost" }))
  check("Ghost: the label in the button's colour too", /background:transparent;color:var\(--s-btn,currentColor\);border-color:transparent/.test(ghost))
  check("an AI's data-sl-button is a button to the theme", /\[data-section\] \[data-sl-button\]/.test(themeStylesheet(theme({}))))
  const r = buttonRadiusStyle(theme({ button_shape: "pill" }))
  check("the product page's buttons take Buttons › Shape, through the theme's variable", String(r.borderRadius).startsWith("var(--theme-button-radius, ") && String(r.borderRadius).includes(themeVars(theme({ button_shape: "pill" }))["--theme-button-radius"]))
  check("Buttons › Size reaches a section's buttons only once set", !("--sl-button-padding" in themeVars(theme({}))) && themeVars(theme({ button_size: "lg" }))["--sl-button-padding"] === "0.875rem 2rem")
  const founder = read("themes/default/sections/about_founder.storelib")
  check("and the sections read it, keeping their own size until then", /padding: var\(--sl-button-padding, 13px 24px\); font-size: var\(--sl-button-size, 15px\)/.test(founder))
}

console.log("\nTYPE")
{
  const css = themeStylesheet(theme({}))
  check("Typography › Body is every section's text unless it picks another style", /\[data-section\]\{[^}]*--section-text-size:var\(--section-body-size\)/.test(css))
  check("a heading follows its text style's font", /font-family: var\(--section-heading-font, var\(--theme-font-heading/.test(read("themes/default/sections/about_founder.storelib")))
  check("Typography › Caption reaches the eyebrow only once changed", !("--sl-caption-size" in themeVars(theme({}))) && themeVars(theme({ typography_styles: { caption: { size: { desktop: 13, mobile: 12 } } } }))["--sl-caption-size"] === "13px")
  check("a new hero starts on Heading 1", newSectionSettings("hero_centered", {}).heading_style === "h1")
  check("a new section whose heading is an h2 stays on the theme's default", newSectionSettings("features_grid", {}).heading_style === undefined)
  check("and a preset's own choice is kept", newSectionSettings("hero_centered", { heading_style: "h2" }).heading_style === "h2")
}

console.log("\nCOLOUR SCHEMES")
{
  const t = theme({ default_color_scheme: "dark" })
  const unsaved = renderStorelibSection(section("features_grid"), t)
  check("a section that never saved a scheme is on the theme's Default for new sections", unsaved.ok === true && /data-color-scheme="dark"/.test(unsaved.html))
  check("and its template's settings.color_scheme says so", unsaved.ok === true && /data-scheme="dark"/.test(unsaved.html))
  const saved = renderStorelibSection(section("features_grid", { color_scheme: "white" }), t)
  check("a scheme the section saved is kept", saved.ok === true && /data-color-scheme="white"/.test(saved.html))
  const banner = read("themes/default/sections/cta_banner.storelib")
  check("a banner's gradient starts from its scheme, not from two fixed darks", /"id": "gradient_from",\s*"label": "Gradient from",\s*"default": "scheme\.background"/.test(banner))
}

console.log("\nLAYOUT, MEDIA, CARDS, MOTION")
{
  check("Images and video › Corner radius reaches a section's own pictures once set", !("--sl-image-radius" in themeVars(theme({}))) && themeVars(theme({ image_border_radius: 20 }))["--sl-image-radius"] === "20px" && /var\(--sl-image-radius, var\(--s-radius\)\)/.test(read("themes/default/sections/text_image.storelib")))
  const wish = read("themes/default/sections/main_wishlist.storelib")
  check("a saved item is a product card with badges, like the shop's", /data-card="product"/.test(wish) && /data-card-media/.test(wish) && /data-badges/.test(wish))
  const field = THEME_SETTINGS_GROUPS.flatMap((g) => g.fields).find((f) => f.id === "animations_enabled")
  check("Animations shows off when nothing moves, and on means on", field?.default === false && themeAnimation({}) === "none" && themeAnimation({ animations_enabled: true }) !== "none")
  const product = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
  /* Changed on purpose (round 13): a fourth text box, the Personalization fields, takes the same corners. */
  check("the product page's text boxes take Text boxes' corners", (product.match(/var\(--theme-input-radius, \$\{ctx\.radius\}\)/g) ?? []).length === 4)
}

console.log("\nWHAT A TEMPLATE CAN READ")
{
  const src = (tpl: string) => `<template>\n<div>${tpl}</div>\n</template>\n<schema>\n{ "type": "x", "name": "X", "settings": [] }\n</schema>`
  const c = compileSection(src(`{{ collection.title }} {{ request.page_type }} {% if request.design_mode %}editing{% endif %}`), { file: "sections/x.storelib" }) as { ok: boolean; errors?: unknown }
  check("a section reads collection and request", c.ok === true, c.errors)
  const r = renderStorelibSection(section("x"), theme({}), { template: "collection", in_editor: true }, { "sections/x.storelib": src(`<p>{{ request.page_type }}|{{ request.design_mode }}|{{ collection.title }}</p>`) }, [], { collections: { c1: { id: "c1", title: "Summer", handle: "summer" } } } as never)
  check("request says where the page is, and the builder's Collection page draws a real collection", r.ok === true && /collection\|true\|Summer/.test(r.html), r.ok ? r.html.slice(0, 200) : r)
}

console.log("\nPAGES AS TEMPLATES")
{
  check("the Collection page is a template of the site", BUILT_IN_PAGE_KEYS.has("collection") && PAGE_META.collection.label === "Collection page" && pageGroupOf("collection") === "shop" && templateForPage("collection") === "collection")
  const home = [section("header"), section("footer")]
  const own = [section("header"), section("collection_sidebar"), section("footer")]
  check("a saved Collection page draws every collection", collectionSections(home, theme({}), { title: "Summer" }, own).map((s) => s.type).join(",") === "header,collection_sidebar,footer")
  check("unsaved, the shop's grid under the collection's name", collectionSections(home, theme({}), { title: "Summer" }).some((s) => s.settings?.heading === "Summer"))
  const sources = { "sections/my_product.storelib": `<template><h1>{{ product.title }}</h1></template>` }
  check("a product section of the creator's own is the product page's", drawsTheProduct("my_product", sources) && !drawsTheProduct("product_grid", {}))
  check("and the built-in one is not added under it", withMainProduct([section("header"), section("my_product"), section("footer")], (t) => drawsTheProduct(t, sources)).every((s) => s.type !== "product"))
  check("a page without one still gets it", withMainProduct([section("header"), section("footer")], () => false).some((s) => s.type === "product"))
}

console.log("\nNO WALLS ROUND A HEADER, A MENU OR A DRAWER")
{
  for (const name of ["Top bar", "Menu bar", "Navigation menu", "Mega menu", "Sidebar menu"]) {
    check(`"${name}" is a section of its own, never the header in disguise`, chromeRoleOf({ schema: { name } }) === null)
  }
  check("a header still says so", chromeRoleOf({ schema: { name: "Site header" } }) === "header")
  const block = (tag: string) => `<template>\n<p>{{ block.settings.x }}</p>\n</template>\n<style>\n</style>\n<schema>\n${JSON.stringify({ name: "B", tag, settings: [{ type: "text", id: "x", label: "X" }] })}\n</schema>\n`
  for (const tag of ["nav", "details", "dialog", "form"]) {
    const b = compileBlock(block(tag), { type: "b" }) as { ok: boolean; errors?: unknown }
    check(`a theme block can be a <${tag}>`, b.ok === true, b.errors)
  }
  const plan = read("lib/website-builder/agent/creative-plan.ts")
  check("the planner writes a section of its own wherever the design asks, a header included", /A built-in type is never the reason a design is ordinary/.test(plan) && /a header of your own \(written with "kind": "header"\)/.test(plan) && !/Never plan a header or footer section/.test(plan))
  const loop = read("lib/website-builder/agent/loop.ts")
  check("the build loop treats its own section as normal, not a last resort", /Your own section is normal, not a last resort/.test(loop) && /a cart drawer, a mega menu, a sidebar/.test(loop))
  check("\"code me a store\" may write its header", /e-\?commerce/.test(loop) && /\|store\|shop\|website\|site\|/.test(loop))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
