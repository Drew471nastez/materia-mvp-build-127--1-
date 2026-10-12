/**
 * ===========================================================================
 *  ROUND 25: ONE TRUTH PER PRODUCT PAGE, EVERY PICKER READS IT
 * ===========================================================================
 * The owner's screenshots: a product page with M chosen under "Size: S"
 * and L and XL crossed out (90.png), and a sticky add to cart whose select
 * offered L while the product form said L could not be bought (91.png).
 *
 *   SHOPIFY'S ANSWERS   product.options_with_values as Shopify gives them
 *                       (a value's availability given the values chosen
 *                       before it, the variant it makes with the others,
 *                       selected_value the value itself, numeric ids), a
 *                       choice no variant has, product | json in Shopify's
 *                       shape, stock said as Shopify says it
 *   ONE TRUTH           the page's facts (lib/storelib-theme/compat/
 *                       product-facts*.ts) read by productSectionData for
 *                       the live site and the canvas alike, merged into
 *                       the one card every picker reads
 *   THE FIXTURE         tests/fixtures/shopify-posture's product page with a
 *                       picker and a sticky bar, served by the live site's
 *                       own handler: the label, the sticky select, the
 *                       section drawn again on a choice, /variants/<id>
 *   NO VENDOR NAMES     the served page, the helper scripts' addresses, the
 *                       import's words, the code editor's folder
 *   STORELIB THEMES     the product section follows and writes ?variant=
 *
 * The same, in a browser, picker by picker, against Dawn, Horizon and the
 * fixture: scripts/check-variants25.ts.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall, withoutVendorTraces } from "../lib/storelib-theme/compat/page"
import { answer, type CartEntry, type SiteData, type SiteResponse } from "../lib/storelib-theme/compat/site"
import { productObject, shopifyJson } from "../lib/storelib-theme/compat/objects"
import { quantityStop, withPageFacts, type PageFacts } from "../lib/storelib-theme/compat/product-facts"
import { pageFactsFor } from "../lib/storelib-theme/compat/product-facts-server"
import { shopifyGlobalAsset, shopifyGlobalAssetUrl, SHOPIFY_GLOBAL_ASSETS } from "../lib/storelib-theme/compat/shopify-global-assets"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { buildThemeFileTree, shownPath } from "../lib/website-builder/theme-file-tree"
import { productIdForPath } from "../lib/store/compat-page-tags"
import { toCard } from "../lib/website-builder/shop-products"
import { GET as helperScript } from "../app/api/site-theme/helpers/[name]/route"
import { CANVAS_HEAD } from "../lib/storelib-theme/compat/canvas-bridge"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 600)}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
type O = Record<string, unknown>

/* ── The shop: the owner's tee in four sizes, and a shirt in three colours by two sizes ── */

const SLEEVE = "00000000-0000-4000-8000-0000000000a1"
const S = "10000000-0000-4000-8000-0000000000a1"
const M = "10000000-0000-4000-8000-0000000000a2"
const L = "10000000-0000-4000-8000-0000000000a3"
const XL = "10000000-0000-4000-8000-0000000000a4"
const SHIRT = "00000000-0000-4000-8000-0000000000b1"
const BK_S = "20000000-0000-4000-8000-0000000000b1"
const BK_M = "20000000-0000-4000-8000-0000000000b2"
const SD_S = "20000000-0000-4000-8000-0000000000b3"
const SD_M = "20000000-0000-4000-8000-0000000000b4"
const OC_S = "20000000-0000-4000-8000-0000000000b5"

function sleeve() {
  return {
    id: SLEEVE,
    settings: {
      title: "Black Sleeve", slug: "black-sleeve", url: "/products/black-sleeve", price: "$35.00", compare_price: "", image: "https://img.test/front.png", images: ["https://img.test/front.png", "https://img.test/back.png"],
      kind: "physical", available: true, low_stock_at: 5,
      options: [{ name: "Size", values: ["S", "M", "L", "XL"] }],
      variants: [
        { id: S, name: "S", options: ["S", null, null], price: "$35.00", compare_price: "", available: true, sku: "BS-S" },
        { id: M, name: "M", options: ["M", null, null], price: "$35.00", compare_price: "", available: true, left: 3, max: 3, sku: "BS-M" },
        { id: L, name: "L", options: ["L", null, null], price: "$38.00", compare_price: "$45.00", available: true, sku: "BS-L" },
        { id: XL, name: "XL", options: ["XL", null, null], price: "$38.00", compare_price: "", available: false, sku: "BS-XL" },
      ],
    },
  }
}

function shirt() {
  return {
    id: SHIRT,
    settings: {
      title: "Linen shirt", slug: "linen-shirt", url: "/products/linen-shirt", price: "$40.00", compare_price: "", image: "https://img.test/main.png", images: ["https://img.test/main.png"],
      kind: "physical", available: true, low_stock_at: 5,
      options: [{ name: "Color", values: ["Black", "Sand", "Ocean"] }, { name: "Size", values: ["S", "M"] }],
      variants: [
        { id: BK_S, name: "Black / S", options: ["Black", "S", null], price: "$40.00", compare_price: "", available: true, image: "https://img.test/black.png", sku: "LS-BK-S" },
        { id: BK_M, name: "Black / M", options: ["Black", "M", null], price: "$42.00", compare_price: "", available: false, image: "https://img.test/black.png" },
        { id: SD_S, name: "Sand / S", options: ["Sand", "S", null], price: "$40.00", compare_price: "$50.00", available: true, image: "https://img.test/sand.png" },
        { id: SD_M, name: "Sand / M", options: ["Sand", "M", null], price: "$42.00", compare_price: "", available: true, left: 2, max: 2, image: "https://img.test/sand.png" },
        { id: OC_S, name: "Ocean / S", options: ["Ocean", "S", null], price: "$40.00", compare_price: "", available: false, image: "https://img.test/ocean.png" },
      ],
    },
  }
}

const values = (p: O, pos: number) => (((p.options_with_values as O[])[pos].values as O[]) ?? [])
const avail = (p: O, pos: number) => values(p, pos).map((v) => `${v.name}${v.available ? "" : "x"}`).join(" ")

async function fixtureSite(): Promise<SiteData> {
  const dir = join(process.cwd(), "tests", "fixtures", "shopify-posture")
  const zip = new JSZip()
  const walk = (d: string) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else zip.file(relative(dir, p), readFileSync(p))
    }
  }
  walk(dir)
  /* The fixture's product page with its picker and sticky bar (templates/product.variants.json), as the product template. */
  zip.file("templates/product.json", readFileSync(join(dir, "templates", "product.variants.json")))
  const r = await convertShopifyTheme(zip)
  /* Read through casts: the push runner compiles without strict, where `ok` does not narrow. */
  if (!r.ok) throw new Error((r as { error: string }).error)
  const t = (r as { theme: Extract<typeof r, { ok: true }>["theme"] }).theme
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  return { creatorId: "c", theme, pages, products: [sleeve(), shirt()] as never, collections: [], menus: {}, shop: { name: "Solara", currency: "USD", moneyFormat: "${{amount}}" }, host: "solara.test" }
}

async function get(site: SiteData, path: string, cart: CartEntry[] = []): Promise<SiteResponse> {
  const [p, q] = path.split("?")
  return answer(site, { method: "GET", path: p, query: new URLSearchParams(q ?? ""), body: null, cart })
}

/* ── A fake database for the server reader ─────────────────────────────── */

type Row = Record<string, unknown>
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let cap = Infinity
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).slice(0, cap)
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
        in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain),
        order: () => chain,
        limit: (n: number) => ((cap = n), chain),
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        single: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (ok: (v: { data: Row[]; error: null }) => unknown, no?: (e: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(ok, no),
      }
      return chain
    },
  }
}

async function main() {
  console.log("\nShopify's answers: the owner's tee (90.png, 91.png)\n")
  {
    const p = productObject(sleeve(), { selectedVariantId: M })
    const size = (p.options_with_values as O[])[0]
    check("with M chosen, the option's selected_value is M, the value itself (it prints as M)", (size.selected_value as O).name === "M" && String((size.selected_value as O)["__liquid_output__"]) === "M")
    check("  and M is the one value marked selected", values(p, 0).filter((v) => v.selected).map((v) => v.name).join() === "M")
    check("L sells, XL is sold out: only XL reads unavailable", avail(p, 0) === "S M L XLx", avail(p, 0))
    check("every variant the sticky bar lists says the same: L available, XL not", (p.variants as O[]).map((v) => `${v.title}${v.available ? "" : "x"}`).join(" ") === "S M L XLx")
    check("option value ids are numbers, as Shopify's", values(p, 0).every((v) => typeof v.id === "number"), values(p, 0).map((v) => v.id))
    const m = (p.variants as O[]).find((v) => v.id === M)!
    check("M with 3 left, at or under the store's line of 5: counted, Only 3 left", m.inventory_management === "shopify" && m.inventory_quantity === 3 && (m.quantity_rule as O).max === 3)
    const s = (p.variants as O[]).find((v) => v.id === S)!
    check("S with plenty: no count said, no stop on the quantity", s.inventory_management === null && (s.quantity_rule as O).max === null && (s.inventory_quantity as number) > 5)
    const xl = (p.variants as O[]).find((v) => v.id === XL)!
    check("XL sold out: quantity 0, and its quantity picker is not stopped at 0", xl.available === false && xl.inventory_quantity === 0 && (xl.quantity_rule as O).max === null)
    const l = (p.variants as O[]).find((v) => v.id === L)!
    check("L: its own price, compare at price and SKU", l.price === 3800 && l.compare_at_price === 4500 && l.sku === "BS-L" && l.public_title === "L")
    check("a variant without its own photo answers none, as Shopify does", l.featured_media === null && l.featured_image === null)
    check("the product's compare at range is its variants'", p.compare_at_price_max === 4500)
    const plain = productObject(sleeve())
    check("arriving with no ?variant=: the first that sells, and selected_variant is none", (plain.selected_or_first_available_variant as O).id === S && plain.selected_variant === null)
    const soldOutAsked = productObject(sleeve(), { selectedVariantId: XL })
    check("?variant= of a sold out one: that one, as Shopify opens it", (soldOutAsked.selected_or_first_available_variant as O).id === XL && (values(soldOutAsked, 0).find((v) => v.selected) as O).name === "XL")
  }

  console.log("\nShopify's answers: two options, one combination not made\n")
  {
    const p = productObject(shirt())
    check("Black/S chosen: Black, Sand sell; Ocean has nothing that sells", avail(p, 0) === "Black Sand Oceanx", avail(p, 0))
    check("  Size given Black: S sells, M (Black/M sold out) does not, as Shopify reads it top down", avail(p, 1) === "S Mx", avail(p, 1))
    const sizeM = values(p, 1).find((v) => v.name === "M")!
    check("  a value's variant is the one it makes with the other values chosen: M is Black/M", (sizeM.variant as O).id === BK_M)
    const ocean = values(p, 0).find((v) => v.name === "Ocean")!
    check("  Ocean's variant with S chosen is Ocean/S", (ocean.variant as O).id === OC_S)
    const sand = productObject(shirt(), { selectedVariantId: SD_S })
    check("Sand/S chosen: both sizes of Sand sell", avail(sand, 1) === "S M", avail(sand, 1))
    const none = productObject(shirt(), { selectedValues: ["Ocean", "M"] })
    check("Ocean in M, which was never made: the values stay chosen, and there is no variant", values(none, 0).find((v) => v.selected)?.name === "Ocean" && values(none, 1).find((v) => v.selected)?.name === "M" && none.selected_or_first_available_variant === null && none.selected_variant === null)
    check("  M's variant with Ocean is none", values(none, 1).find((v) => v.name === "M")?.variant === null)
    const black = values(p, 0).find((v) => v.name === "Black")!
    check("a colour swatch is its colour", (black.swatch as O)?.color !== null && /^#/.test(String(((black.swatch as O).color as O)["__liquid_output__"])))
    check("a colour without a colour name shows its variant's photo", ((ocean.swatch as O)?.image as O)?.src === "https://img.test/ocean.png")
    check("a variant's photo is its featured media", ((p.variants as O[])[0].featured_media as O).src === "https://img.test/black.png")
    check("the editor's option values are read, not guessed from the name", (productObject({ id: "x", settings: { ...shirt().settings, variants: [{ id: "v", name: "Charcoal tone, small", options: ["Black", "S", null], price: "$1.00", available: true }] } }).variants as O[])[0].option1 === "Black")
  }

  console.log("\nproduct | json and variant | json, as Shopify writes them\n")
  {
    const p = productObject(shirt(), { selectedVariantId: SD_M })
    const json = JSON.parse((compatFilter("json") as unknown as (v: unknown) => string)(p)) as O
    check("images are addresses and featured_image is one", Array.isArray(json.images) && typeof (json.images as unknown[])[0] === "string" && json.featured_image === "https://img.test/main.png")
    check("options are the names", JSON.stringify(json.options) === '["Color","Size"]')
    const v = (json.variants as O[]).find((x) => x.id === SD_M)!
    check("a variant has its public_title, options, price, available and quantity_rule", v.public_title === "Sand / M" && JSON.stringify(v.options) === '["Sand","M"]' && v.price === 4200 && v.available === true && (v.quantity_rule as O).max === 2)
    check("  its featured_media has a preview_image, and nothing loops back to the product", ((v.featured_media as O)?.preview_image as O)?.src === "https://img.test/sand.png" && !("product" in v) && !("options_with_values" in json))
    check("media have their preview_image and type", (json.media as O[]).every((m) => m.media_type === "image" && typeof (m.preview_image as O).src === "string"))
    const one = JSON.parse((compatFilter("json") as unknown as (v: unknown) => string)(p.selected_or_first_available_variant)) as O
    check("selected_or_first_available_variant | json is the same record", one.id === SD_M && one.public_title === "Sand / M" && !("product" in one))
    check("shopifyJson gives it to the Ajax answers too", (shopifyJson((p.variants as O[])[0]) as O).id === BK_S)
    const solo = productObject({ id: "solo", settings: { title: "Mug", slug: "mug", price: "$12.00", kind: "physical", available: true, variants: [{ id: "only", name: "Default", price: "$12.00", available: true }] } })
    check("a product without options (one Default variant) is the default variant, bought by its own id", solo.has_only_default_variant === true && (solo.variants as O[])[0].id === "only" && (solo.variants as O[])[0].title === "Default Title" && JSON.stringify(solo.options) === '["Title"]')
  }

  console.log("\nOne truth: the page's facts, merged into the card every picker reads\n")
  {
    const facts: PageFacts = {
      variants: [
        { id: S, options: ["S", null, null], soldOut: false, left: null, maxQuantity: 999, sku: "BS-S" },
        { id: M, options: ["M", null, null], soldOut: false, left: 3, maxQuantity: 3 },
        { id: L, options: ["L", null, null], soldOut: true, left: null, maxQuantity: 0, pickup: [{ name: "Main Street", city: "Lisbon" }] },
      ],
      perOrder: 2,
      lowAt: 4,
      showLeft: true,
    }
    const card = withPageFacts(sleeve(), facts)
    const vs = card.settings.variants as O[]
    check("a variant the facts no longer have (archived, switched off) is not offered", vs.map((v) => v.id).join() === [S, M, L].join())
    check("sold out follows the facts, not the list copy", vs.find((v) => v.id === L)!.available === false && vs.find((v) => v.id === L)!.checkout_url === "")
    check("the most one order may take: Limit sales, or the last few, never the whole stock", vs.find((v) => v.id === S)!.max === 2 && vs.find((v) => v.id === M)!.max === 2 && vs.find((v) => v.id === L)!.max === null)
    check("the store's low stock line is the card's", card.settings.low_stock_at === 4)
    check("SKU and pickup come along", vs.find((v) => v.id === S)!.sku === "BS-S" && Array.isArray(vs.find((v) => v.id === L)!.pickup))
    const hidden = withPageFacts(sleeve(), { ...facts, showLeft: false })
    check("Show stock left off: no count, and the last few are no stop either", (hidden.settings.variants as O[]).every((v) => !("left" in v)) && (hidden.settings.variants as O[]).find((v) => v.id === M)!.max === 2)
    check("quantityStop: few left without Limit sales stops at what is left", quantityStop({ soldOut: false, left: 3, maxQuantity: 3 }, null, true) === 3 && quantityStop({ soldOut: false, left: null, maxQuantity: 40 }, null, true) === null)
    const p = productObject(withPageFacts(sleeve(), facts), { selectedVariantId: M })
    check("so the theme's picker and the sticky bar's list agree: L reads sold out in both", avail(p, 0) === "S M Lx" && (p.variants as O[]).find((v) => v.id === L)!.available === false)
    check("a download sold out by its sales limit, with no variants, sells nothing", withPageFacts({ id: "d", settings: { title: "Guide", variants: [], available: true } }, { variants: [], perOrder: null, lowAt: null, showLeft: true, productLeft: 0 }).settings.available === false)

    /* The server reader, on a fake database: the live site and the builder's canvas both call it. */
    const tables: Record<string, Row[]> = {
      products: [{ id: SLEEVE, creator_id: "c1", type: "physical", status: "published", price_cents: 3500, track_inventory: true, continue_selling: false, low_stock_threshold: null, max_per_order: 2, inventory_count: null }],
      product_variants: [
        { id: S, product_id: SLEEVE, name: "S", option1: "S", price_cents: 3500, active: true, track_inventory: true, inventory_policy: "deny", sku: "BS-S", position: 1 },
        { id: M, product_id: SLEEVE, name: "M", option1: "M", price_cents: 3500, active: true, track_inventory: true, inventory_policy: "continue", sku: "BS-M", position: 2 },
        { id: L, product_id: SLEEVE, name: "Archived L", option1: "L", price_cents: 3800, active: true, track_inventory: true, inventory_policy: "deny", position: 3 },
        { id: XL, product_id: SLEEVE, name: "XL", option1: "XL", price_cents: 3800, active: true, track_inventory: true, inventory_policy: "deny", position: 4 },
      ],
      product_options: [{ product_id: SLEEVE, name: "Size", values: ["S", "M", "L", "XL"], position: 1 }],
      commerce_settings: [{ creator_id: "c1", low_stock_default: 5 }],
      inventory_locations: [{ id: "loc", creator_id: "c1", active: true, fulfills_orders: true }],
      inventory_levels: [{ variant_id: S, location_id: "loc", available: 40 }, { variant_id: M, location_id: "loc", available: 0 }, { variant_id: XL, location_id: "loc", available: 0 }],
    }
    const read = await pageFactsFor(fakeDb(tables), "c1", SLEEVE, true)
    check("the reader: the variants on sale, an archived one left out", read !== null && read.variants.map((v) => v.id).join() === [S, M, XL].join(), read?.variants.map((v) => v.id))
    check("  each with the editor's option values and SKU", read?.variants[0].options?.[0] === "S" && read?.variants[0].sku === "BS-S")
    check("  XL with none left is sold out; M with none left keeps selling (Continue selling)", read?.variants.find((v) => v.id === XL)?.soldOut === true && read?.variants.find((v) => v.id === M)?.soldOut === false && read?.variants.find((v) => v.id === M)?.keepsSelling === true)
    check("  Limit sales and the store's low stock line", read?.perOrder === 2 && read?.lowAt === 5)
    const elsewhere = await pageFactsFor(fakeDb(tables), "someone-else", SLEEVE, true)
    check("  another creator's product is not read", elsewhere === null)
  }

  console.log("\nThe fixture's product page, served by the live site's handler\n")
  {
    const site = await fixtureSite()
    const page = String((await get(site, `/products/black-sleeve?variant=${M}`)).body)
    check("?variant=M: the label says Size: M", /Size: <span data-selected-value>M<\/span>/.test(page), page.match(/Size: <span[^>]*>[^<]*/)?.[0])
    check("  M is the checked button, L is not crossed out, XL is", /value="M" class="product-option__input"[^>]*checked/.test(page) && /value="L" class="product-option__input"[^>]*>/.test(page) && /value="XL" class="product-option__input is-unavailable"/.test(page))
    check("  the sticky bar's select has M chosen and XL, and only XL, disabled", new RegExp(`<option value="${M}" selected>M - \\$35\\.00`).test(page) && new RegExp(`<option value="${XL}" disabled>`).test(page) && !new RegExp(`<option value="${L}"[^>]*disabled`).test(page))
    check("  Only 3 left, the form buys M and its SKU is shown", /Only 3 left/.test(page) && new RegExp(`name="id" value="${M}"`).test(page) && /SKU: BS-M/.test(page))
    const json = JSON.parse(page.match(/<script type="application\/json" data-product-json>([\s\S]*?)<\/script>/)![1]) as O
    check("  the page's product JSON is Shopify's shape", typeof (json.images as unknown[])[0] === "string" && (json.variants as O[]).every((v) => "public_title" in v))
    const ocean = productObject(shirt())
    const ids = (pos: number, name: string) => values(ocean, pos).find((v) => v.name === name)!.id
    const section = String((await get(site, `/products/linen-shirt?section_id=main&option_values=${ids(0, "Ocean")},${ids(1, "M")}`)).body)
    check("a section drawn again for Ocean in M (never made): Ocean and M stay chosen, nothing to buy", /value="Ocean" class="product-option__input[^"]*"[^>]*checked/.test(section) && /value="M" class="product-option__input[^"]*"[^>]*checked/.test(section) && /name="id" value=""/.test(section) && /class="product-form__add" disabled/.test(section))
    const sand = String((await get(site, `/products/linen-shirt?section_id=main&option_values=${ids(0, "Sand")},${ids(1, "M")}`)).body)
    check("  Sand in M: that variant, its price, 2 left", new RegExp(`name="id" value="${SD_M}"`).test(sand) && /\$42\.00/.test(sand) && /Only 2 left/.test(sand) && /Color: <span data-selected-value>Sand<\/span>/.test(sand))
    const byVariant = await get(site, `/variants/${SD_S}?section_id=main`)
    check("/variants/<id> answers the product's section on that variant", byVariant.status === 200 && new RegExp(`name="id" value="${SD_S}"`).test(String(byVariant.body)))
    const js = JSON.parse(String((await get(site, "/products/linen-shirt.js")).body)) as O
    check("/products/<handle>.js gives each variant as variant | json does", (js.variants as O[]).every((v) => "public_title" in v && "quantity_rule" in v))
    const cart = JSON.parse(String((await get(site, "/cart.js", [{ k: SD_M, p: SHIRT, v: SD_M, q: 1 }])).body)) as O
    const line = (cart.items as O[])[0]
    check("the cart shows the chosen colour's photo", String(line.image).includes("sand.png"), line.image)
    check("no Shopify or Liquid named in a comment, a generator or a warmed connection on the page", !/<!--[^>]*(shopify|liquid)/i.test(page) && !/<meta[^>]*generator[^>]*shopify/i.test(page) && !/rel="preconnect"[^>]*shopify/i.test(page))
  }

  console.log("\nNo vendor names a buyer or a creator reads\n")
  {
    const html = `<html><head><link rel="preconnect" href="https://fonts.shopifycdn.com" crossorigin><meta name="generator" content="Shopify"><style>/* keep in sync with header.liquid */.a{color:red}/* plain note */</style></head><body><!-- BEGIN app block: shopify://apps/x --><div class="shopify-section">x</div><!--storelib-preview-section--><script>
  // Shopify needs this
  var u = "https://cdn.shopify.com/x"; // a line that is code stays
  /* from snippets/x.liquid */
  window.Shopify = window.Shopify || {};
</script><script type="application/json">{"note":"<!-- shopify -->"}</script></body></html>`
    const out = withoutVendorTraces(html)
    check("an HTML comment naming Shopify goes; Storelib's own marker stays", !out.includes("BEGIN app block") && out.includes("<!--storelib-preview-section-->"))
    check("a stylesheet's note naming a .liquid file goes, its other notes and rules stay", !out.includes("header.liquid") && out.includes("/* plain note */") && out.includes(".a{color:red}"))
    check("a script's whole-line notes naming Shopify go; its code and strings stay", !out.includes("// Shopify needs this") && !out.includes("snippets/x.liquid") && out.includes('var u = "https://cdn.shopify.com/x"; // a line that is code stays') && out.includes("window.Shopify = window.Shopify || {};"))
    check("a warmed connection to Shopify's host and a generator tag naming it go", !out.includes("shopifycdn") && !/generator/.test(out))
    check("the theme's class names and data scripts are untouched", out.includes('class="shopify-section"') && out.includes('{"note":"<!-- shopify -->"}'))
    check("an older theme's helper scripts are served under Storelib's names", shopifyGlobalAssetUrl("shopify_common.js") === "/api/site-theme/helpers/common.js" && shopifyGlobalAssetUrl("option_selection.js") === "/api/site-theme/helpers/option-selection.js")
    check("  every one of them, and by either name", SHOPIFY_GLOBAL_ASSETS.every((n) => !/shopify/i.test(shopifyGlobalAssetUrl(n) ?? "x") && shopifyGlobalAsset(n) === shopifyGlobalAsset(shopifyGlobalAssetUrl(n)!.split("/").pop()!)))
    const served = await helperScript(new Request("https://x.test/api/site-theme/helpers/common.js"), { params: Promise.resolve({ name: "common.js" }) })
    check("  and the route answers them", served.status === 200 && /javascript/.test(served.headers.get("content-type") ?? ""))
    check("the page's own head script is named for Storelib", read("lib/storelib-theme/compat/shims.ts").includes("<script data-storelib-head>") && !read("lib/storelib-theme/compat/shims.ts").includes("data-storelib-shopify"))
    const tree = buildThemeFileTree(["shopify/sections/header.liquid", "shopify/import-report.json"])
    const folder = tree.find((n) => n.path === "shopify")
    check("the code editor shows an imported theme's own files under original/", folder?.name === "original")
    check("  and every path a creator reads there says original/; the stored path is kept", shownPath("shopify/sections/header.liquid") === "original/sections/header.liquid" && shownPath("shopify/") === "original/" && shownPath("sections/shopify/x.json") === "sections/shopify/x.json" && shownPath("shopifyish/x") === "shopifyish/x")
    const editor = read("app/website-builder/code/[installId]/page.tsx")
    check("  the rename and duplicate field shows the folder as original/ and writes the stored one back", /\{shownPath\(dir\)\}/.test(editor) && /onChange\(`\$\{dir\}\$\{asFileName\(e\.target\.value\)\}\$\{ext\}`\)/.test(editor))
    check("  the breadcrumb and the editor's messages too", /shownPath\(selectedFile\.path\)\.split\("\/"\)/.test(editor) && /You moved off \$\{shownPath\(path\)\}/.test(editor) && /\$\{shownPath\(to\)\} already exists/.test(editor))
    const files = read("app/api/website-builder/themes/[installId]/files/route.ts")
    check("  and the files route's refusals", /\$\{shownPath\(from\)\} is not a saved file/.test(files) && /\$\{shownPath\(to\)\} did not compile/.test(files) && /\$\{shownPath\(from\)\} is used by/.test(files))
    check("the import's answer points at original/import-report.json", read("app/api/website-builder/themes/import/route.ts").includes("original/import-report.json") && !read("app/api/website-builder/themes/import/route.ts").includes("code editor, shopify/"))
    /* The tags' product id comes from the lists already held: the page's full product read runs once. */
    const listed = { products: [{ id: "p1", settings: { slug: "linen-shirt", title: "Linen shirt" } }], pickable: [{ id: "p2", settings: { slug: "hidden-one", title: "Hidden one" } }] }
    check("the page's product for its tags is found without reading it again", productIdForPath(listed, "/products/linen-shirt") === "p1" && productIdForPath(listed, "/collections/all/products/linen-shirt/") === "p1" && productIdForPath(listed, "/products/hidden-one") === "p2" && productIdForPath(listed, "/products/p1") === "p1" && productIdForPath(listed, "/products/nope") === null && productIdForPath(listed, "/cart") === null)
    const siteRoute = read("app/api/site-theme/site/[username]/[[...path]]/route.ts")
    check("  the live route asks the lists, never site.product, for it", /productIdForPath\(found\.site, sitePath\)/.test(siteRoute) && !/found\.site\.product\(/.test(siteRoute))
    const empty = new JSZip()
    empty.file("sections/x.liquid", "<p>x</p>")
    empty.file("config/settings_schema.json", "[]")
    const refused = await convertShopifyTheme(empty)
    const why = refused.ok === false ? (refused as { error: string }).error : ""
    check("a theme the import refuses is told without Shopify or Liquid", refused.ok === false && !/shopify|liquid/i.test(why), why)
    const convert = read("lib/storelib-theme/shopify/convert.ts")
    const said = [...convert.matchAll(/(?:report\.(?:note|skip)\([^,]+,|error: )\s*(`[^`]*`|"[^"]*")/g)].map((m) => m[1])
    check("no import message names Shopify or Liquid", said.length > 20 && said.every((x) => !/shopify|liquid/i.test(x.replace(/\$\{[^}]*\}/g, ""))), said.filter((x) => /shopify|liquid/i.test(x.replace(/\$\{[^}]*\}/g, ""))))
  }

  console.log("\nBuy it now, the canvas and Storelib's own product section\n")
  {
    const shims = read("lib/storelib-theme/compat/shims.ts")
    check("Buy it now follows the form's Add to cart, and a press on it while off does nothing", /var sync=function\(\)\{document\.querySelectorAll\("\[data-storelib-buy-now\]"\)/.test(shims) && /if\(b\.disabled\)\{e\.preventDefault\(\);return\}/.test(shims))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("the canvas reads the page's facts as the live site does, and answers a section drawn again with them", /\/api\/website-builder\/products\?id=\$\{encodeURIComponent\(card\.id\)\}&facts=1/.test(canvas) && /product: async \(handle\) => \{\s*const p = current\.product/.test(canvas))
    check("in the canvas's frame, an address the browser refuses to write no longer stops the theme's script halfway", /\["pushState","replaceState"\]\.forEach\(function\(k\)\{var f=history\[k\];[^]*?catch\(e\)\{try\{return f\.call\(this,s,t\)\}/.test(CANVAS_HEAD))
    const route = read("app/api/website-builder/products/route.ts")
    check("  the builder's route gives them for the creator's own product only", /searchParams\.get\("facts"\) === "1"/.test(route) && route.indexOf('.eq("creator_id", creator.id)') < route.indexOf("pageFactsFor("))
    const loader = read("lib/website-builder/compat-site.ts")
    check("the live site reads them for every product page", /pageFactsFor\(admin, creator\.creatorId, card\.id/.test(loader) && /withPageFacts\(card, pageFacts\)/.test(loader))
    const section = read("components/website-builder/sections/renderers/ProductSection.tsx")
    check("Storelib's product section opens on ?variant= and writes each choice back, never in the builder", /new URLSearchParams\(window\.location\.search\)\.get\("variant"\)/.test(section) && /window\.history\.replaceState\(window\.history\.state, "", url\.toString\(\)\)/.test(section) && /if \(inEditor \|\| sample \|\| urlRead\.current\) return/.test(section))
    const list = toCard({ id: "p1", title: "T", slug: "t", type: "physical", price_cents: 100 } as never, [
      { id: "a", product_id: "p1", name: "S", price_cents: 100, option1: "S", position: 1 },
      { id: "b", product_id: "p1", name: "Archived M", price_cents: 100, option1: "M", position: 2 },
      { id: "c", product_id: "p1", name: "L", price_cents: 100, option1: "L", active: false, position: 3 },
    ] as never)
    check("the shop's list copy offers no archived or switched off variant, and carries option values", list.settings.variants.map((v) => v.id).join() === "a" && JSON.stringify(list.settings.variants[0].options) === '["S",null,null]')
  }

  console.log("\nCopy\n")
  {
    const files = [
      "lib/storelib-theme/compat/product-facts.ts",
      "lib/storelib-theme/compat/product-facts-server.ts",
      "lib/storelib-theme/compat/objects.ts",
      "lib/storelib-theme/compat/page.ts",
      "app/api/site-theme/helpers/[name]/route.ts",
      "tests/fixtures/shopify-posture/sections/main-product-variants.liquid",
      "tests/fixtures/shopify-posture/sections/sticky-atc.liquid",
      "tests/fixtures/shopify-posture/assets/product-variants.js",
      "scripts/check-variants25.ts",
      "tests/variants25.test.ts",
    ]
    const banned = new RegExp(`\\b(${["unl" + "ock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b|${String.fromCharCode(0x2014)}`, "i")
    for (const f of files) check(`${f}: no em dashes and none of the banned words`, !banned.test(read(f)), read(f).match(banned)?.[0])
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
