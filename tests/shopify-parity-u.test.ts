/**
 * ===========================================================================
 *  SHOPIFY PARITY, U ROUND: SETTINGS, SETTING TYPES AND PAGES
 * ===========================================================================
 * What the builder gained to stand next to Shopify's theme editor, held to
 * what it does rather than to what it says:
 *
 *   the new setting types validate, and each resolves to what a template
 *   reads (collection_picker, collection_list, liquid as html, number with
 *   a unit, font_picker from the theme's list)
 *
 *   the collection pickers read ONE creator's published collections and
 *   nobody else's, whatever id a setting holds
 *
 *   the new theme settings compile to custom properties and rules, only
 *   once set, scoped to the page root; custom CSS is scoped and cleaned
 *
 *   the new sections and pages render: the collections page, a Featured
 *   collection, Page content on every page a creator adds, badges, the
 *   currency code, the cart type
 *
 *   npx tsx tests/shopify-parity-u.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { CONTROLS, controlFor, resolveControlType, SHOPIFY_TYPE_ALIASES, UNSUPPORTED_TYPES } from "@/lib/storelib-theme/controls/registry"
import { validateSectionSchema } from "@/lib/storelib-theme/schema/validate"
import { resolveOne, themeGlobals } from "@/lib/storelib-theme/resolve"
import { compileSection } from "@/lib/storelib-theme/storelib/compile"
import { renderSection } from "@/lib/storelib-theme/render"
import { cleanCustomCss } from "@/lib/storelib-theme/custom-css"
import { DYNAMIC_SOURCES, fillSources } from "@/lib/storelib-theme/dynamic"
import type { CompiledSection, StorefrontCollection } from "@/lib/storelib-theme/types"
import { THEME_ROOT_ATTRIBUTE, parityVars, themeCartType, themeCustomCss, themeStylesheet, themeVars } from "@/lib/website-builder/theme-css"
import { THEME_SETTINGS_GROUPS } from "@/lib/website-builder/theme-settings-schema"
import { collectionsPageSections, customPageSections } from "@/lib/website-builder/shop-page"
import { BUILT_IN_PAGE_KEYS, GENERATED_PAGE_KEYS, RESERVED_PAGE_KEYS, pageKeyFromSegment } from "@/lib/website-builder/site-pages"
import { pageGroupOf } from "@/lib/website-builder/page-groups"
import { pageWantsCollections, storefrontData, dynamicContext } from "@/lib/website-builder/storefront-data"
import { OFFERED_FAMILIES, fontStylesheetHref, sectionFamilies } from "@/lib/website-builder/font-link"
import { ADDABLE_SECTIONS, SECTION_SCHEMAS } from "@/lib/website-builder/section-schemas"
import { DEFAULT_THEME_SOURCES } from "../themes/default/sources.generated"
import { PAGE_META, type SectionInstance, type ThemeSettingsValues } from "@/lib/website-builder/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail: unknown = "") {
  if (ok) { passed++; console.log(`  ok    ${name}`) }
  else { failed++; failures.push(name); console.log(`  FAIL  ${name}${detail !== "" ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`) }
}
const section = (t: string) => console.log(`\n${t}`)
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* `server-only` is an empty module outside a bundler; under tsx, say so before the server module loads. */
declare const require: (((id: string) => unknown) & { resolve: (s: string) => string; cache: Record<string, unknown> }) | undefined
if (typeof require === "function") {
  try {
    const p = require.resolve("server-only")
    require.cache[p] = { id: p, filename: p, loaded: true, exports: {} }
  } catch { /* not installed: the import below says so */ }
}

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const COL_A1 = "aaaaaaaa-0000-4000-8000-000000000001"
const COL_A2 = "aaaaaaaa-0000-4000-8000-000000000002"
const COL_A_HIDDEN = "aaaaaaaa-0000-4000-8000-000000000003"
const COL_B = "bbbbbbbb-0000-4000-8000-000000000001"

/** A collection as the server hands one to a page. */
function collection(id: string, title: string, extra: Partial<StorefrontCollection> = {}): StorefrontCollection {
  return {
    id,
    title,
    handle: title.toLowerCase().replace(/\s+/g, "-"),
    description: `${title} things`,
    image: "https://cdn.test/c.jpg",
    url: `/collections/${title.toLowerCase().replace(/\s+/g, "-")}`,
    products_count: 2,
    products: [
      { id: "p1", type: "product", settings: { title: "Linen apron", price: "$48.00", compare_price: "$60.00", image: "https://cdn.test/a.jpg", url: "/products/linen-apron", tag: "" } },
      { id: "p2", type: "product", settings: { title: "Oak board", price: "$30.00", compare_price: "", image: "", url: "/products/oak-board", tag: "Sold out" } },
    ],
    ...extra,
  }
}

/**
 * A database holding two creators' collections and products, that applies
 * the filters a query asks for and records them, so the test can see both
 * what came back and what was asked.
 */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = {
    product_collections: [
      { id: COL_A1, creator_id: A, title: "Kitchen", slug: "kitchen", description: "<p>For the <b>kitchen</b></p>", image_url: null, kind: "manual", rules: [], match: "all", sort: "manual", published: true, created_at: "2026-01-01" },
      { id: COL_A2, creator_id: A, title: "Under 40", slug: "under-40", description: "", image_url: "https://cdn.test/u40.jpg", kind: "smart", rules: [{ field: "price", op: "less_than", value: "40" }], match: "all", sort: "price_asc", published: true, created_at: "2026-01-02" },
      { id: COL_A_HIDDEN, creator_id: A, title: "Drafts", slug: "drafts", description: "", image_url: null, kind: "manual", rules: [], match: "all", sort: "manual", published: false, created_at: "2026-01-03" },
      { id: COL_B, creator_id: B, title: "Somebody else", slug: "else", description: "", image_url: null, kind: "manual", rules: [], match: "all", sort: "manual", published: true, created_at: "2026-01-01" },
    ],
    product_collection_items: [
      { collection_id: COL_A1, product_id: "pa1", position: 1 },
      { collection_id: COL_A1, product_id: "pa2", position: 0 },
      { collection_id: COL_A1, product_id: "pa-draft", position: 2 },
      { collection_id: COL_A1, product_id: "pb1", position: 3 },
      { collection_id: COL_B, product_id: "pb1", position: 0 },
    ],
    products: [
      { id: "pa1", creator_id: A, title: "Linen apron", slug: "linen-apron", price_cents: 4800, compare_at_cents: 6000, thumbnail_url: "https://cdn.test/a.jpg", status: "published", type: "physical", tags: [] },
      { id: "pa2", creator_id: A, title: "Oak board", slug: "oak-board", price_cents: 3000, thumbnail_url: "https://cdn.test/b.jpg", status: "published", type: "physical", tags: [] },
      { id: "pa-draft", creator_id: A, title: "Unfinished", slug: "unfinished", price_cents: 1000, status: "draft", type: "physical", tags: [] },
      { id: "pb1", creator_id: B, title: "Not yours", slug: "not-yours", price_cents: 500, status: "published", type: "physical", tags: [] },
    ],
  }
  const asked: { table: string; eq: [string, unknown][] }[] = []
  const from = (table: string) => {
    const filters: ((r: Record<string, unknown>) => boolean)[] = []
    const record = { table, eq: [] as [string, unknown][] }
    asked.push(record)
    let limitN = Infinity
    const q: Record<string, unknown> = {}
    const run = () => Promise.resolve({ data: (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, limitN), error: null })
    Object.assign(q, {
      select: () => q,
      eq: (col: string, val: unknown) => { record.eq.push([col, val]); filters.push((r) => r[col] === val); return q },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return q },
      order: () => q,
      limit: (n: number) => { limitN = n; return q },
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => run().then(res, rej),
    })
    return q
  }
  return { db: { from }, asked }
}

function compiled(type: string): CompiledSection {
  const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
  if (r.ok !== true) throw new Error(`${type} did not compile: ${JSON.stringify(r.errors)}`)
  return r.value
}

const shipped = Object.fromEntries(THEME_SETTINGS_GROUPS.flatMap((g) => g.fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default]))) as Record<string, unknown>

async function main() {
  // ═══════════════════════════════════════════════════════════════════════
  section("1. The new setting types validate")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const valid = (settings: unknown[]) => {
      const r = validateSectionSchema({ type: "t", name: "T", settings } as never)
      return r.ok === true
    }
    check("collection_picker is a control", !!CONTROLS.collection_picker && controlFor("collection_picker")?.component === "CollectionPicker")
    check("collection_list is a control", !!CONTROLS.collection_list && controlFor("collection_list")?.value === "reference_list")
    check("Shopify's collection is the collection picker", resolveControlType("collection") === "collection_picker" && SHOPIFY_TYPE_ALIASES.collection === "collection_picker")
    check("Shopify's liquid is html, cleaned and never run", resolveControlType("liquid") === "html")
    check("collection and liquid are no longer refused", !("collection" in UNSUPPORTED_TYPES) && !("collection_list" in UNSUPPORTED_TYPES) && !("liquid" in UNSUPPORTED_TYPES))
    check("blog, article and metaobject still are, with a reason", ["blog", "article", "metaobject"].every((t) => typeof UNSUPPORTED_TYPES[t] === "string" && UNSUPPORTED_TYPES[t].length > 10))
    check("a schema using all of them validates", valid([
      { type: "collection_picker", id: "c", label: "Collection" },
      { type: "collection_list", id: "cs", label: "Collections", limit: 6 },
      { type: "collection", id: "c2", label: "Shopify collection" },
      { type: "liquid", id: "l", label: "Custom liquid" },
      { type: "text_alignment", id: "a", label: "Align", default: "center" },
      { type: "number", id: "n", label: "Gap", unit: "px", default: 12 },
      { type: "font_picker", id: "f", label: "Font", default: "Lora" },
    ]))
    check("a collection_list limit past 24 is refused", !valid([{ type: "collection_list", id: "cs", label: "C", limit: 40 }]))
    check("a collection_list default must be a list of ids", !valid([{ type: "collection_list", id: "cs", label: "C", default: "kitchen" }]))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("2. Each resolves to what a template reads")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const collections = { [COL_A1]: collection(COL_A1, "Kitchen"), [COL_A2]: collection(COL_A2, "Under 40") }
    const picked = resolveOne({ type: "collection_picker", id: "c" } as never, COL_A1, { collections }) as { href: string; fields: Record<string, unknown> } & Record<string, unknown>
    check("a picked collection prints as its address", String(picked) === "/collections/kitchen", String(picked))
    const fields = (picked as unknown as { fields?: Record<string, unknown> }).fields ?? (picked as unknown as Record<string, unknown>)
    check("and carries its title, count and products", fields.title === "Kitchen" && fields.products_count === 2 && Array.isArray(fields.products), fields)
    check("an id the page was not handed is empty", resolveOne({ type: "collection_picker", id: "c" } as never, COL_B, { collections }) === "")
    check("so is a name that happens to be a key of every object", resolveOne({ type: "collection_picker", id: "c" } as never, "__proto__", { collections }) === "")
    const list = resolveOne({ type: "collection_list", id: "cs", limit: 1 } as never, [COL_B, COL_A2, COL_A1], { collections }) as { id: string; type: string; settings: Record<string, unknown> }[]
    check("a list keeps the creator's order, drops what is not theirs, and stops at its limit", list.length === 1 && list[0].id === COL_A2 && list[0].type === "collection" && list[0].settings.title === "Under 40", list)
    check("liquid resolves as html does", resolveOne({ type: "liquid", id: "l" } as never, "<p>Hi</p>") === "<p>Hi</p>")
    check("a number with a unit is a number", resolveOne({ type: "number", id: "n", unit: "px" } as never, "14") === 14)
    check("a font name that could end a declaration is refused", resolveOne({ type: "font_picker", id: "f", default: "Inter" } as never, "Lora;}body{x") === "Inter")
    check("the theme offers its own fonts to the picker", OFFERED_FAMILIES.has("Lora") && OFFERED_FAMILIES.has("Inter"))
    const href = fontStylesheetHref({}, sectionFamilies([{ settings: { heading_font: "Lora", font_x: "Comic Sans; } x" } }]))
    check("and a family a section picks is loaded on the page, nothing else", !!href && href.includes("family=Lora") && !href.includes("Comic"), href)
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("3. A collection picker reads one creator's published collections, and nobody else's")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const { siteCollections } = await import("@/lib/website-builder/storefront-collections-server")
    const { db, asked } = fakeDb()
    const visitor = await siteCollections(db, A)
    const ids = Object.keys(visitor.collections)
    check("a visitor gets the creator's published collections", ids.includes(COL_A1) && ids.includes(COL_A2), ids)
    check("never a hidden one", !ids.includes(COL_A_HIDDEN))
    check("never another creator's", !ids.includes(COL_B))
    const kitchen = visitor.collections[COL_A1]
    check("a manual collection's products are in its own order", kitchen.products.map((p) => p.id).join(",") === "pa2,pa1", kitchen.products.map((p) => p.id))
    check("without a draft product, or another creator's product listed in it", !kitchen.products.some((p) => p.id === "pa-draft" || p.id === "pb1") && kitchen.products_count === 2)
    check("a smart collection is its rules over the creator's own products", visitor.collections[COL_A2].products.map((p) => p.id).join(",") === "pa2", visitor.collections[COL_A2].products.map((p) => p.id))
    check("a description is words, never markup", kitchen.description === "For the kitchen", kitchen.description)
    check("a collection with no picture of its own shows its first product's", kitchen.image === "https://cdn.test/b.jpg", kitchen.image)
    check("and links to its own address", kitchen.url === "/collections/kitchen")
    const scoped = asked.filter((q) => q.table === "product_collections" || q.table === "products")
    check("every collection and product read is filtered by the creator", scoped.length > 0 && scoped.every((q) => q.eq.some(([c, v]) => c === "creator_id" && v === A)), scoped)

    const builder = await siteCollections(fakeDb().db, A, { published: false })
    check("the builder sees the hidden one as a choice, marked hidden", builder.choices.some((c) => c.id === COL_A_HIDDEN && c.published === false))
    check("but never draws it", !(COL_A_HIDDEN in builder.collections))
    check("a page naming another creator's collection by id gets nothing", Object.keys((await siteCollections(fakeDb().db, A, { ids: [COL_B] })).collections).length === 0)
    check("a creator id that is not one reads nothing", Object.keys((await siteCollections(fakeDb().db, "' or 1=1 --")).collections).length === 0)
    check("a read that throws is no collections, not a broken page", Object.keys((await siteCollections({ from: () => { throw new Error("no table") } }, A)).collections).length === 0)

    const route = read("app/api/website-builder/themes/[installId]/route.ts")
    check("the builder asks for the signed in creator's collections only", /creatorCollectionsForBuilder\(creator!\.id\)/.test(route) && /siteCollections\(createAdminClient\(\), creatorId, \{ published: false \}\)/.test(route))
    const site = read("lib/website-builder/published-site.ts")
    check("the live site asks for the site owner's, cached under that owner", /siteCollections\(createAdminClient\(\), site\.creatorId\)/.test(site) && /\["site-collections", site\.creatorId\]/.test(site))
    check("and only while collections are on", /isPhysicalCommerceEnabled/.test(site) && /isPhysicalCommerceEnabled/.test(route))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("4. The new theme settings compile to custom properties, once set")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const groups = THEME_SETTINGS_GROUPS.map((g) => g.id)
    check("Shopify's groups are in the panel", ["variant_pills", "inputs", "product_cards", "collection_cards", "content_containers", "media", "popups", "badges", "brand", "currency", "custom_css"].every((g) => groups.includes(g)), groups)
    check("in Shopify's order: after Animations, before the announcement bar", groups.indexOf("animations") < groups.indexOf("variant_pills") && groups.indexOf("brand") < groups.indexOf("announcement"))
    check("Image border radius moved to Media and is still one setting", THEME_SETTINGS_GROUPS.flatMap((g) => g.fields).filter((f) => f.id === "image_border_radius").length === 1 && THEME_SETTINGS_GROUPS.find((g) => g.id === "media")!.fields.some((f) => f.id === "image_border_radius"))

    const unset = themeVars({} as ThemeSettingsValues)
    check("a site that never opened them gets none of their properties", !Object.keys(unset).some((k) => /--theme-(input|pill|product-card|collection-card|container|media|popup|badge)/.test(k)))
    check("and none of their rules", !/data-card|data-badge|data-container|data-media|data-popup|data-variant-pill/.test(themeStylesheet({} as ThemeSettingsValues)))

    const set = { input_radius: 4, input_border_width: 2, input_border_opacity: 40, pill_radius: 0, product_card_style: "card", product_card_radius: 16, product_card_border: 1, product_card_shadow: "md", product_card_image_padding: 8, product_card_align: "center", collection_card_radius: 2, container_radius: 20, container_shadow: "lg", media_border: 2, popup_radius: 6, badge_position: "bottom_left", badge_radius: 4, badge_sale_bg: "#dc2626", badge_soldout_color: "#ffffff" } as unknown as ThemeSettingsValues
    const vars = themeVars(set)
    check("inputs", vars["--theme-input-radius"] === "4px" && vars["--theme-input-border-width"] === "2px" && vars["--theme-input-border-opacity"] === "40%", vars)
    check("variant pills", vars["--theme-pill-radius"] === "0px")
    check("product cards", vars["--theme-product-card-radius"] === "16px" && vars["--theme-product-card-border"] === "1px" && vars["--theme-product-card-image-padding"] === "8px" && /rgba/.test(vars["--theme-product-card-shadow"] ?? ""))
    check("collection cards apart from product cards", vars["--theme-collection-card-radius"] === "2px" && !("--theme-collection-card-border" in vars))
    check("containers, media, pop-ups", vars["--theme-container-radius"] === "20px" && /rgba/.test(vars["--theme-container-shadow"] ?? "") && vars["--theme-media-border"] === "2px" && vars["--theme-popup-radius"] === "6px")
    check("badges", vars["--theme-badge-bottom"] === "10px" && vars["--theme-badge-top"] === "auto" && vars["--theme-badge-radius"] === "4px" && vars["--theme-badge-sale-bg"] === "#dc2626" && vars["--theme-badge-soldout-color"] === "#ffffff")
    check("a value out of range is held to the range", parityVars({ input_radius: 900, product_card_border: -3 })["--theme-input-radius"] === "24px" && parityVars({ product_card_border: -3 })["--theme-product-card-border"] === "0px")
    check("a colour that is not a colour is not written", !("--theme-badge-sale-bg" in parityVars({ badge_sale_bg: "red;}body{display:none" })))

    const css = themeStylesheet(set)
    const root = `[${THEME_ROOT_ATTRIBUTE}]`
    const lines = css.split("\n").filter((l) => /data-card|data-badge|data-container|data-media|data-popup|data-variant-pill|input:not/.test(l))
    check("the rules exist for what was set", ['[data-card="product"]', "[data-container]", "[data-media]", "[data-popup]", "[data-badges]", "[data-variant-pill]", "input:not"].every((s) => css.includes(s)))
    /* Split a selector list on its top-level commas only: `:is(input,select)` is one selector. */
    const topLevel = (list: string) => {
      const out: string[] = []
      let depth = 0
      let start = 0
      for (let i = 0; i < list.length; i++) {
        if (list[i] === "(") depth++
        else if (list[i] === ")") depth--
        else if (list[i] === "," && depth === 0) { out.push(list.slice(start, i)); start = i + 1 }
      }
      return [...out, list.slice(start)]
    }
    const unscoped = lines.flatMap((l) => topLevel(l.split("{")[0])).filter((sel) => !sel.trim().startsWith(root))
    check("every selector starts at the page root, so nothing reaches the editor", unscoped.length === 0, unscoped.slice(0, 4))
    check("Card style frames the whole card; centred words are centred", /\[data-card="product"\]\{[^}]*background:color-mix/.test(css) && /\[data-card="product"\]\{text-align:center;\}/.test(css))
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("the product page's option pills take Variant pills once set, their own radius until then",
      /data-variant-pill=""/.test(blocks) && /borderRadius: `var\(--theme-pill-radius, \$\{ctx\.radius\}\)`/.test(blocks) && /borderWidth: "var\(--theme-pill-border-width, 1px\)"/.test(blocks))
    const search = DEFAULT_THEME_SOURCES["sections/search.storelib"]
    check("search results are product cards too", (search.match(/data-card="product"/g) ?? []).length >= 3 && /data-card-media/.test(search))
    check("the header's dropdown is a pop-up too, without the header changing", css.includes(`${root} [data-section] .theme-nav-dropdown`))
    check("each rule outweighs a section's own (0,2,0), so a chosen value is what shows", lines.every((l) => topLevel(l.split("{")[0]).every((sel) => sel.trim().startsWith(`${root} [data-section] `) || sel.trim() === `${root} [data-popup]`)))

    const g = themeGlobals({ brand_headline: "Poured in Leeds", brand_image: "https://cdn.test/brand.png", badge_sale_show: false, cart_type: "notification", currency_code_enabled: true }) as Record<string, any>
    check("a section reads Brand information as theme.brand", g.brand.headline === "Poured in Leeds" && g.brand.image === "https://cdn.test/brand.png" && g.brand.image_width === 100)
    check("and the badges, the cart type and the currency", g.badges.sale === false && g.badges.sale_text === "Sale" && g.cart.type === "notification" && g.currency.show_code === true)
    check("a cart type that is not one is the drawer", themeCartType({ cart_type: "popup" } as unknown as ThemeSettingsValues) === "drawer" && themeCartType({ cart_type: "page" } as unknown as ThemeSettingsValues) === "page")
    const brandSources = DYNAMIC_SOURCES.filter((s) => s.id.startsWith("shop.brand_")).map((s) => s.id)
    check("Brand information is insertable shop data", brandSources.join(",") === "shop.brand_headline,shop.brand_description,shop.brand_image", brandSources)
    const ctx = dynamicContext({ theme: { brand_headline: "Poured <in> Leeds" } })
    check("and fills a text setting, escaped where it lands", fillSources("{{ shop.brand_headline }}", "richtext", ctx) === "Poured &lt;in&gt; Leeds", fillSources("{{ shop.brand_headline }}", "richtext", ctx))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("5. Custom CSS is the creator's, kept to their page")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const scope = `[${THEME_ROOT_ATTRIBUTE}]`
    const ok = cleanCustomCss(".card__title{letter-spacing:.02em} h2, .x > p { color: #111 }", scope)
    check("every selector is put under the page root", ok.css === `${scope} .card__title{letter-spacing:.02em}\n${scope} h2,${scope} .x > p{color:#111}`, ok.css)
    check("html, body and :root mean the page root", cleanCustomCss("body{background:#000}", scope).css === `${scope}{background:#000}`)
    const breakout = cleanCustomCss("a{color:red}</style><script>alert(1)</script>", scope)
    check("nothing can close the <style> it is printed in", !breakout.css.includes("<") && breakout.dropped.some((d) => d.includes("<")), breakout)
    const bad = cleanCustomCss("@import url(https://evil.test/x.css); a{background:url(javascript:alert(1))} b{width:expression(alert(1))} c{behavior:url(x.htc)} d{background:url(http://plain.test/i.png)} e{background:url(https://cdn.test/i.png)} f{background:url(/own.png)}", scope)
    check("@import, script urls, expression(), behavior and plain http are left out", !/@import|javascript|expression|behavior|http:\/\//.test(bad.css), bad.css)
    check("https and the site's own paths stay", bad.css.includes("url(https://cdn.test/i.png)") && bad.css.includes("url(/own.png)"), bad.css)
    check("and the editor is told what was left out", bad.dropped.length >= 4, bad.dropped)
    check("backslash escapes cannot spell a blocked word", !cleanCustomCss("a{background:u\\72l(javascript:x)}", scope).css.includes("javascript"))
    const media = cleanCustomCss("@media (max-width: 600px) { .grid { gap: 8px } } @media print { .x { display:none } }", scope)
    check("a width query answers to the page, so the phone preview shows it", media.css.startsWith(`@container (max-width: 600px){${scope} .grid{gap:8px}}`), media.css)
    check("a query about something else stays a media query", media.css.includes(`@media print{${scope} .x{display:none}}`), media.css)
    check("viewport units are the page's", cleanCustomCss(".h{min-height:100vh}", scope).css.includes("var(--sl-vh"))
    check("a rule a declaration of it broke keeps its other declarations", cleanCustomCss("a{color:red;background:url(javascript:x);margin:0}", scope).css === `${scope} a{color:red;margin:0}`)
    check("unbalanced braces end the read rather than leaking", !cleanCustomCss("a{color:red", scope).css.includes("{color:red"))
    check("the theme draws the cleaned copy, never the typed one", themeCustomCss({ custom_css: "</style><b>x</b>" } as unknown as ThemeSettingsValues).includes("<") === false)
    const page = read("components/website-builder/theme/ThemePage.tsx")
    check("in its own <style>, after every section", /data-storelib-custom-css/.test(page) && page.indexOf("data-storelib-custom-css") > page.indexOf("footers.map"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("6. The new sections and pages render")
  // ═══════════════════════════════════════════════════════════════════════
  {
    for (const type of ["collections_grid", "collection_featured", "page_content"]) {
      const r = compileSection(DEFAULT_THEME_SOURCES[`sections/${type}.storelib`], { file: `sections/${type}.storelib` })
      check(`${type} compiles with no warnings`, r.ok === true && !r.warnings, r.ok === true ? r.warnings : r.errors)
      check(`${type} is in Add section`, ADDABLE_SECTIONS.includes(type) && !!SECTION_SCHEMAS[type])
    }
    const collections = { [COL_A1]: collection(COL_A1, "Kitchen"), [COL_A2]: collection(COL_A2, "Under 40") }
    const data = storefrontData({ dynamic: {}, collections })

    const grid = compiled("collections_grid")
    const all = renderSection({ compiled: grid, id: "g", instance: { type: grid.type, settings: { source: "all" } }, theme: {}, page: { template: "page.collections" }, data }).html
    check("Collection list draws every collection it was handed, as collection cards", all.includes("Kitchen") && all.includes("Under 40") && (all.match(/data-card="collection"/g) ?? []).length === 2, all.slice(0, 400))
    check("each linking to its own address, with its count", all.includes('href="/collections/kitchen"') && /2 products/.test(all))
    const chosen = renderSection({ compiled: grid, id: "g", instance: { type: grid.type, settings: { source: "chosen", chosen: [COL_A2, COL_B] } }, theme: {}, page: { template: "index" }, data }).html
    check("chosen, it draws only the chosen ones that are the creator's", chosen.includes("Under 40") && !chosen.includes("Kitchen") && (chosen.match(/data-card="collection"/g) ?? []).length === 1)
    const none = renderSection({ compiled: grid, id: "g", instance: { type: grid.type, settings: { source: "all" } }, theme: {}, page: { template: "page.collections" } }).html
    check("with no collections it says nothing to a visitor", !/data-card=/.test(none) && !/appear here/.test(none))
    const noneEditor = renderSection({ compiled: grid, id: "g", instance: { type: grid.type, settings: { source: "all" } }, theme: {}, page: { template: "page.collections", in_editor: true } }).html
    check("and tells the creator in the builder", /Your published collections appear here/.test(noneEditor))

    const feat = compiled("collection_featured")
    const f = renderSection({ compiled: feat, id: "f", instance: { type: feat.type, settings: { collection: COL_A1, product_count: 4 } }, theme: shipped, page: { template: "index" }, data }).html
    check("Featured collection draws the picked collection's products as product cards", f.includes("Linen apron") && f.includes("Oak board") && (f.match(/data-card="product"/g) ?? []).length === 2, f.slice(0, 600))
    check("headed with the collection's name until somebody types another", /<h2 class="s__h">Kitchen<\/h2>/.test(f))
    check("with a Sale badge on the discounted one and Sold out on the other", /data-badge="sale">Sale</.test(f) && /data-badge="soldout">Sold out</.test(f), f.match(/data-badge="[a-z]+">[^<]*/g))
    check("and a button to the whole collection", f.includes('href="/collections/kitchen"'))
    const notMine = renderSection({ compiled: feat, id: "f", instance: { type: feat.type, settings: { collection: COL_B } }, theme: {}, page: { template: "index" }, data }).html
    check("another creator's collection draws nothing", !/data-card/.test(notMine) && !/Somebody/.test(notMine))
    const noSale = renderSection({ compiled: feat, id: "f", instance: { type: feat.type, settings: { collection: COL_A1 } }, theme: { badge_sale_show: false }, page: { template: "index" }, data }).html
    check("Sale switched off in Badges is gone", !/data-badge="sale"/.test(noSale))
    const coded = renderSection({ compiled: feat, id: "f", instance: { type: feat.type, settings: { collection: COL_A1 } }, theme: { currency_code_enabled: true }, page: { template: "index" }, data }).html
    check("Show currency codes puts USD on every price", /\$48\.00 USD/.test(coded) && /\$60\.00 USD/.test(coded) && !/USD USD/.test(coded), coded.match(/\$[\d.]+[^<]*/g))
    check("and only when it is on", !/USD/.test(f))

    const grid2 = compiled("product_grid")
    const shopCards = [{ id: "p1", type: "product", settings: { title: "Tote", price: "$20.00", compare_price: "$25.00", image: "", url: "/products/tote", tag: "" } }]
    const pg = renderSection({ compiled: grid2, id: "p", instance: { type: grid2.type, settings: { source: "shop" } }, theme: shipped, page: { template: "index" }, products: shopCards }).html
    check("the Product Grid's cards are product cards, with a badge corner", /data-card="product"/.test(pg) && /data-card-media/.test(pg) && /data-badges/.test(pg) && /data-badge="sale">Sale</.test(pg))

    const content = compiled("page_content")
    const pc = renderSection({ compiled: content, id: "m", instance: { type: content.type, settings: { heading: "Size guide", content: "<p>Measure twice.</p>" } }, theme: {}, page: { template: "page.size-guide" } }).html
    check("Page content draws the title and the words", /<h1 class="s__h">Size guide<\/h1>/.test(pc) && pc.includes("<p>Measure twice.</p>"))

    const home: SectionInstance[] = [
      { id: "h", type: "header", name: "Header", settings: { color_scheme: "black" }, blocks: [], hidden: false },
      { id: "x", type: "hero_centered", name: "Hero", settings: {}, blocks: [], hidden: false },
      { id: "ft", type: "footer", name: "Footer", settings: {}, blocks: [], hidden: false },
    ]
    const page = collectionsPageSections(home)
    check("the collections page is the header, every collection, the footer", page.map((s) => s.type).join(",") === "header,collections_grid,footer" && page[1].settings.source === "all")
    check("on the header's scheme, so a dark site's page is dark", page[1].settings.color_scheme === "black")
    check("it wants the creator's collections", pageWantsCollections(page, (t) => SECTION_SCHEMAS[t], (t) => DEFAULT_THEME_SOURCES[`sections/${t}.storelib`]))
    check("a page with none of them does not read them", !pageWantsCollections(home, (t) => SECTION_SCHEMAS[t], (t) => DEFAULT_THEME_SOURCES[`sections/${t}.storelib`]))
    check("/collections is a page the site has, generated, under Shop", GENERATED_PAGE_KEYS.has("collections") && BUILT_IN_PAGE_KEYS.has("collections") && RESERVED_PAGE_KEYS.has("collections") && pageGroupOf("collections") === "shop" && PAGE_META.collections.label === "Collections")
    check("and nobody can make a page of their own by that name", pageKeyFromSegment("collections") === null)
    check("the builder generates it from the same function the live site uses",
      /collectionsPageSections\(homeSections\)/.test(read("app/api/website-builder/themes/[installId]/sections/route.ts")) &&
        /collectionsPageSections\(site\.pages\.home \?\? site\.sections\)/.test(read("app/(site)/w/[username]/collections/page.tsx")) &&
        /collectionsPageSections\(home\)/.test(read("app/(site)/w/[username]/preview/[token]/collections/page.tsx")))

    const added = customPageSections(home[0], home[2], "  Size guide  ", "page_content-1")
    check("a page a creator adds is the header, Page content with its title, the footer", added.map((s) => s.type).join(",") === "header,page_content,footer" && added[1].settings.heading === "Size guide")
    check("and the builder makes new pages with it", /customPageSections\(/.test(read("app/website-builder/editor/[installId]/page.tsx")))
    const notFound = read("lib/website-builder/shop-page.ts")
    check("the 404 page is still a section the creator arranges", /type: "not_found"/.test(notFound) && GENERATED_PAGE_KEYS.has("404"))
  }

  // ═══════════════════════════════════════════════════════════════════════
  section("7. Cart type does what it says")
  // ═══════════════════════════════════════════════════════════════════════
  {
    const cart = read("components/website-builder/site-cart.tsx")
    check("Page goes to /cart once the line is written, only on the live site", /cartType === "page" && shopId/.test(cart) && /goToCart\.current = false\s*\n\s*window\.location\.assign\("\/cart"\)/.test(cart))
    check("Notification shows what was added and stays", /cartType === "notification"\) setNotice\(line\)/.test(cart) && /role="status"/.test(read("components/website-builder/theme/cart-notice.tsx")))
    check("Drawer opens the drawer, as it always did", /else setOpen\(true\)/.test(cart))
    check("the page hands the cart its type", /cartType=\{themeCartType\(theme\)\}/.test(read("components/website-builder/theme/ThemePage.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log("\nFailed:")
    for (const f of failures) console.log(`  - ${f}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
