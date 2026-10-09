/**
 * ===========================================================================
 *  A PRODUCT PAGE ON A CREATOR'S WEBSITE, FROM THE PICTURES TO CHECKOUT
 * ===========================================================================
 * The main product section is blocks now (themes/default/sections/
 * product.json), reads the product it is about on the server (lib/products/
 * product-section-data.ts) and works out the rest with plain functions
 * (lib/products/product-page-model.ts). This suite holds those rules:
 *
 *   pictures         each once: the main picture is also the gallery's first
 *   variants         a choice of values is one variant, and shows its picture
 *   pay what you     a named amount is checked against the product's own
 *   want             minimum and the ceiling, on the page and on the server,
 *                    and reaches checkout and the basket
 *   the cart line    carries the product, the variant, the quantity and the
 *                    amount; checkout prices it again
 *   breadcrumbs      Home > Shop > the product, Home > the page
 *   filters          the address is the state: read, written, applied, counted
 *   old sections     a product section saved before blocks draws what its
 *                    switches said, and nothing stored is removed
 */
import { readFileSync } from "node:fs"
import {
  amountToCents,
  buyNowHref,
  cartLineFor,
  checkPwyw,
  choose,
  imageIndexForVariant,
  imageKey,
  initialChoice,
  isColorOption,
  lowStock,
  pickerOptions,
  priceFacts,
  productImages,
  purchasable,
  suggestedAmounts,
  swatchColor,
  uniqueImages,
  valueAvailable,
  variantFor,
  PWYW_MAX_CENTS,
  type ProductSectionData,
  type ProductVariantData,
} from "@/lib/products/product-page-model"
import { applyCatalogQuery, catalogFilters, catalogPage, parseCatalogQuery, serializeCatalogQuery, cardPriceCents } from "@/lib/products/catalog-filters"
import { breadcrumbTrail } from "@/lib/products/breadcrumbs"
import { productSectionData, descriptionHtml } from "@/lib/products/product-section-data"
import { addLine, checkoutItems, parseCart, serializeCart } from "@/lib/website-builder/cart"
import { baseFor, priceCart, MAX_PWYW_CENTS } from "@/lib/checkout/pricing"
import { isLegacyProductSection, legacyProductBlocks, mainProductSection, withProductBlocks } from "@/lib/website-builder/product-page"
import { toCard } from "@/lib/website-builder/shop-products"
import { productMatchesQuery } from "@/lib/website-builder/shop-page"
import { renderStorelibSection } from "@/lib/website-builder/storelib-runtime"
import { DEFAULT_THEME_SOURCES } from "@/themes/default/sources.generated"
import { stripComments } from "./_source"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))

const uuid = (n: number) => `${String(n).padStart(8, "0")}-2222-4222-8222-222222222222`
const P = uuid(1)
const Q = uuid(2)

type Row = Record<string, unknown>

/** Tables answering select/eq/in/order/limit/maybeSingle and a plain await. */
function fakeDb(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}

const variant = (over: Partial<ProductVariantData>): ProductVariantData => ({
  id: "v",
  name: "Option",
  options: [null, null, null],
  price_cents: 2000,
  compare_at_cents: null,
  image_url: null,
  available: true,
  left: null,
  max_quantity: 99,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  pwyw_suggested_price_cents: null,
  ...over,
})

const base = (over: Partial<ProductSectionData> = {}): ProductSectionData => ({
  id: P,
  title: "Field tee",
  slug: "field-tee",
  type: "physical",
  description: "",
  price_cents: 2000,
  compare_at_cents: null,
  thumbnail_url: "https://cdn.test/a.jpg",
  gallery_urls: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
  ...over,
})

async function main() {
  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nEvery picture once")
  {
    const p = base()
    check("the main picture stored again as the gallery's first is drawn once", productImages(p).join() === "https://cdn.test/a.jpg,https://cdn.test/b.jpg", productImages(p))
    check("the same picture under another query string is the same picture", uniqueImages(["https://CDN.test/x.jpg?w=800", "https://cdn.test/x.jpg", "https://cdn.test/y.jpg#z"]).length === 2)
    check("and its key ignores the query and the host's case", imageKey("https://CDN.test/x.jpg?w=1") === imageKey("https://cdn.test/x.jpg"))
    check("an address a page cannot load is left out", uniqueImages(["javascript:alert(1)", "//evil.test/a.jpg", "", null, "/uploads/a.jpg"]).join() === "/uploads/a.jpg")
    const withVariantPic = base({ variants: [variant({ id: "v1", image_url: "https://cdn.test/c.jpg" }), variant({ id: "v2", image_url: "https://cdn.test/a.jpg?v=2" })] })
    check("a variant's own picture joins the list once, after the gallery", productImages(withVariantPic).join() === "https://cdn.test/a.jpg,https://cdn.test/b.jpg,https://cdn.test/c.jpg", productImages(withVariantPic))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nChoosing a variant chooses its picture")
  {
    const p = base({
      options: [{ name: "Colour", values: ["Black", "Sand"] }, { name: "Size", values: ["S", "M"] }],
      variants: [
        variant({ id: "bs", name: "Black / S", options: ["Black", "S", null], image_url: "https://cdn.test/black.jpg", available: false }),
        variant({ id: "bm", name: "Black / M", options: ["Black", "M", null], image_url: "https://cdn.test/black.jpg", price_cents: 2200 }),
        variant({ id: "ss", name: "Sand / S", options: ["Sand", "S", null], image_url: "https://cdn.test/sand.jpg", left: 2 }),
      ],
    })
    const images = productImages(p)
    const first = initialChoice(p)
    check("the page opens on the first variant that can be bought", first.join() === "Black,M", first)
    check("values name one variant", variantFor(p, ["Sand", "S"])?.id === "ss")
    check("and that variant's picture is where the media goes", imageIndexForVariant(images, variantFor(p, ["Sand", "S"])) === images.indexOf("https://cdn.test/sand.jpg") && images.includes("https://cdn.test/sand.jpg"))
    check("a variant with no picture of its own moves nothing", imageIndexForVariant(images, variant({ image_url: null })) === -1)
    const moved = choose(p, ["Black", "M"], 0, "Sand")
    check("picking a colour with no M moves to a variant that exists", moved.join() === "Sand,S", moved)
    check("a sold out value is shown as such", valueAvailable(p, ["Black", null], 1, "S") === false && valueAvailable(p, ["Black", null], 1, "M") === true)
    check("the price is the variant's", priceFacts(p, variantFor(p, ["Black", "M"])).priceCents === 2200)
    check("a sold out variant cannot be bought", purchasable(p, variantFor(p, ["Black", "S"])) === false)
    check("low stock shows at or under the threshold, never at none", lowStock(2, 5) && !lowStock(6, 5) && !lowStock(0, 5) && !lowStock(null, 5))
    const licences = base({ type: "digital", variants: [variant({ id: "pl", name: "Personal" }), variant({ id: "cl", name: "Commercial", price_cents: 4900 })] })
    check("a digital product's named variants are one option of names", JSON.stringify(pickerOptions(licences, "Licence")) === JSON.stringify([{ name: "Licence", values: ["Personal", "Commercial"] }]))
    check("and a name chooses that variant", variantFor(licences, ["Commercial"])?.id === "cl")
    check("a product without variants has no picker and is bought as itself", pickerOptions(base()).length === 0 && variantFor(base(), []) === null && purchasable(base(), null))
    check("a colour option is drawn as swatches, its values as colours", isColorOption("Colour") && isColorOption("color") && !isColorOption("Size") && swatchColor("Navy blue") === "#1f2a44" && swatchColor("#ABC") === "#abc" && swatchColor("Moonlight") === null)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nPay what you want: the amount, its limits, on the page and on the server")
  {
    const p = base({ type: "digital", pay_what_you_want: true, pwyw_min_price_cents: 500, pwyw_suggested_price_cents: 1200, price_cents: 0 })
    const f = priceFacts(p, null)
    check("the price shown is the minimum", f.payWhatYouWant && f.priceCents === 500 && f.minCents === 500 && f.suggestedCents === 1200, f)
    check("typed amounts read as cents", amountToCents("12") === 1200 && amountToCents("$12.5") === 1250 && amountToCents("1,200") === 120000 && amountToCents("abc") === null && amountToCents("1.234") === null)
    check("under the minimum is refused, with the minimum", checkPwyw(400, 500).ok === false && (checkPwyw(400, 500) as { error: string }).error === "The lowest price is $5.00.")
    check("over the ceiling is refused", checkPwyw(PWYW_MAX_CENTS + 1, 0).ok === false && PWYW_MAX_CENTS === MAX_PWYW_CENTS)
    check("the minimum itself is allowed", checkPwyw(500, 500).ok === true)
    check("suggested amounts: the block's own, never under the minimum", suggestedAmounts("3, 10, 25", 500, null).join() === "1000,2500")
    check("or the product's suggestion and two steps up", suggestedAmounts("", 500, 1200).join() === "1200,2400,3600")
    /* The server: baseFor is what every checkout prices with. */
    check("server: no amount is the minimum, never the stored price", (baseFor(p, undefined) as { cents: number }).cents === 500)
    check("server: an amount under the minimum is refused", baseFor(p, 499).ok === false)
    check("server: a fraction of a cent is refused", baseFor(p, 500.5).ok === false)
    check("server: over the ceiling is refused", baseFor(p, MAX_PWYW_CENTS + 1).ok === false)
    check("server: a product with its own price ignores any amount sent", (baseFor({ price_cents: 2000, pay_what_you_want: false }, 1) as { cents: number }).cents === 2000)

    const href = buyNowHref(p, null, 1500)
    check("Buy now carries the amount to checkout, with the product and src=website", /^\/checkout\?productId=/.test(href) && /customPrice=1500/.test(href) && /src=website/.test(href) && /from=%2Fproducts%2Ffield-tee/.test(href), href)
    check("and a product with a price never sends one", !/customPrice/.test(buyNowHref(base({ type: "digital" }), null, 1500)))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe basket: product, variant, quantity and amount, priced again on the server")
  {
    const p = base({ variants: [variant({ id: "bm", name: "Black / M", options: ["Black", "M", null], price_cents: 2200, image_url: "https://cdn.test/black.jpg" })] })
    const v = p.variants![0]
    const line = cartLineFor(p, v, 3, null)
    check("the line is the variant, its name, its price and its picture", line.variantId === "bm" && line.variantName === "Black / M" && line.priceCents === 2200 && line.thumbnailUrl === "https://cdn.test/black.jpg", line)
    check("a shipped product keeps its quantity and goes to the physical checkout", line.quantity === 3 && line.physical === true && line.digital === false)
    const d = base({ type: "digital", pay_what_you_want: true, pwyw_min_price_cents: 500, price_cents: 0 })
    const dl = cartLineFor(d, null, 4, 1500)
    check("a download is one, and carries the amount named", dl.quantity === 1 && dl.customPriceCents === 1500 && dl.priceCents === 1500 && dl.variantId === null, dl)
    check("a product without variants has no variant on its line", cartLineFor(base({ type: "digital" }), null, 1, null).variantId === null)
    const kept = parseCart(serializeCart(addLine([], dl)))
    check("the amount survives the browser's storage", kept[0]?.customPriceCents === 1500)
    check("a nonsense amount in storage is dropped, not trusted", parseCart(JSON.stringify([{ productId: P, customPriceCents: -5 }]))[0]?.customPriceCents === undefined)
    const items = checkoutItems([...kept, line])
    check("checkout is sent ids, quantities and the amount, never a price", items.length === 2 && items[0].customPriceCents === 1500 && !("priceCents" in items[0]) && items[1].variantId === "bm" && items[1].quantity === 3, items)

    const db = fakeDb({
      products: [
        { id: P, title: "Pack", slug: "pack", price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 500, thumbnail_url: null, type: "digital", status: "published", creator_id: "c1" },
        { id: Q, title: "Course", slug: "course", price_cents: 3000, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: null, type: "course", status: "published", creator_id: "c1" },
      ],
      product_variants: [{ id: "lic", product_id: Q, name: "Team", price_cents: 9000, pay_what_you_want: false, pwyw_min_price_cents: null, max_purchases: null }],
    })
    const priced = await priceCart(db, { items: [{ productId: P, variantId: null, quantity: 1, customPriceCents: 1500 }, { productId: Q, variantId: "lic", quantity: 2, customPriceCents: 1 }] })
    check(
      "the server charges the named amount, and the variant's own price whatever was sent",
      priced.ok === true && priced.lines[0].item.priceCents === 1500 && priced.lines[1].item.priceCents === 9000 && priced.lines[1].item.variantId === "lic" && priced.totalCents === 1500 + 9000 * 2,
      priced,
    )
    const low = await priceCart(db, { items: [{ productId: P, variantId: null, quantity: 1, customPriceCents: 100 }] })
    check("an amount under the minimum refuses the basket, saying why", low.ok === false && /lowest price is \$5\.00/.test(low.error), low)
    const none = await priceCart(db, { items: [{ productId: P, variantId: null, quantity: 1 }] })
    check("no amount is the minimum", none.ok === true && none.lines[0].item.priceCents === 500)
    const forged = await priceCart(db, { items: [{ productId: Q, variantId: "not-its-variant", quantity: 1 }] })
    check("a variant that is not the product's is left out, never charged", forged.ok === true && forged.lines.length === 0 && forged.dropped.length === 1)
    const route = code("app/api/checkout/cart/route.ts")
    check("the basket route prices with priceCart and nothing the browser sent as a price", /priceCart\(admin, \{ items: body\.items/.test(route) && !/priceCents/.test(route.replace(/unitCents|item\.priceCents|l\.item/g, "")))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe product the section draws, read on the server")
  {
    const db = fakeDb({
      product_variants: [
        { id: "v1", product_id: P, name: "Black / M", option1: "Black", option2: "M", option3: null, price_cents: 2200, compare_at_price_cents: 3000, image_url: "https://cdn.test/black.jpg", active: true, track_inventory: true, inventory_policy: "deny", position: 1 },
        { id: "v2", product_id: P, name: "Archived Sand / M", option1: "Sand", option2: "M", option3: null, price_cents: 2200, active: true, position: 2 },
        { id: "v3", product_id: P, name: "Sand / S", option1: "Sand", option2: "S", option3: null, price_cents: 2000, active: true, track_inventory: true, inventory_policy: "deny", position: 3 },
      ],
      product_options: [{ product_id: P, name: "Colour", values: ["Black", "Sand"], position: 1 }, { product_id: P, name: "Size", values: ["S", "M"], position: 2 }],
      inventory_locations: [{ id: "loc", creator_id: "c1", active: true, fulfills_orders: true }],
      inventory_levels: [{ variant_id: "v1", location_id: "loc", available: 3 }, { variant_id: "v3", location_id: "loc", available: 0 }],
    })
    const data = await productSectionData(db, {
      id: P,
      creator_id: "c1",
      title: "Field tee",
      slug: "field-tee",
      type: "physical",
      description: "<p>Heavy cotton.</p><script>alert(1)</script>",
      price_cents: 2000,
      thumbnail_url: "https://cdn.test/a.jpg",
      gallery_urls: ["https://cdn.test/a.jpg", "https://cdn.test/b.jpg"],
    })
    check("its variants, without the archived one", data.variants?.map((v) => v.id).join() === "v1,v3", data.variants)
    check("each with its option values and picture", JSON.stringify(data.variants?.[0].options) === JSON.stringify(["Black", "M", null]) && data.variants?.[0].image_url === "https://cdn.test/black.jpg")
    check("its options by name", data.options?.map((o) => o.name).join() === "Colour,Size")
    check("stock from the warehouse: few left said, none left sold out", data.variants?.[0].left === 3 && data.variants?.[0].available === true && data.variants?.[1].available === false, data.variants)
    check("a compare at price above the price is kept", data.variants?.[0].compare_at_cents === 3000)
    check("its pictures each once, the variant's own included", data.images?.join() === "https://cdn.test/a.jpg,https://cdn.test/b.jpg,https://cdn.test/black.jpg", data.images)
    check("its description cleaned for the page", data.description_html === "<p>Heavy cotton.</p>" || (!!data.description_html && !/script/i.test(data.description_html)), data.description_html)
    check("plain text becomes paragraphs, escaped", descriptionHtml("a < b\n\nnext") === "<p>a &lt; b</p><p>next</p>", descriptionHtml("a < b\n\nnext"))
    const plain = await productSectionData(fakeDb({}), { id: Q, type: "digital", title: "Pack", price_cents: 900, inventory_count: 40 })
    check("a product with no variants reads as itself, and plenty of stock says nothing", plain.variants?.length === 0 && plain.price_cents === 900 && plain.inventory_left === null)
    const few = await productSectionData(fakeDb({}), { id: Q, type: "digital", title: "Pack", price_cents: 900, inventory_count: 2 })
    check("and few is said", few.inventory_left === 2)
    const route = code("app/api/website-builder/products/route.ts")
    check("the builder's preview reads the product the same way, after checking it is the creator's", /\.eq\("creator_id", creator\.id\)/.test(route) && /productSectionData\(createAdminClient\(\)/.test(route))
    const live = code("components/website-builder/theme/render-product.tsx")
    check("and so does the live product page", /productSectionData\(admin,/.test(live) && /_product_data: productData/.test(live) && /withProductBlocks\(s\)/.test(live))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe section: blocks, and every block drawn")
  {
    const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string; type: string }[] }[]; fields: { id: string }[]; presets: { blocks: { type: string }[] }[] }
    const types = schema.blocks.map((b) => b.type)
    const want = ["title", "price", "variant_picker", "quantity", "buy_buttons", "pay_what_you_want", "description", "collapsible_tab", "low_stock", "badges", "text", "icon_with_text", "share", "wishlist", "divider", "custom_code", "breadcrumbs"]
    check("the blocks the owner asked for are all there", want.every((t) => types.includes(t)), want.filter((t) => !types.includes(t)))
    const drawn = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("and every one has a renderer", types.every((t) => new RegExp(`\\n  ${t}: `).test(drawn)), types.filter((t) => !new RegExp(`\\n  ${t}: `).test(drawn)))
    check("each has its own spacing", schema.blocks.every((b) => b.fields.some((f) => f.id === "margin_bottom")))
    check("a tab's content and custom code are the cleaner's settings (richtext, html)", schema.blocks.find((b) => b.type === "collapsible_tab")!.fields.some((f) => f.id === "content" && f.type === "richtext") && schema.blocks.find((b) => b.type === "custom_code")!.fields.some((f) => f.id === "html_content" && f.type === "html"))
    const ids = schema.fields.map((f) => f.id)
    check("media layout, width, phone, zoom and the sticky column are settings", ["multiple_images_layout", "image_width", "mobile_media", "image_click_action", "sticky_info", "media_ratio"].every((id) => ids.includes(id)))
    const made = mainProductSection()
    check("a new product section arrives with its blocks", (made.blocks?.length ?? 0) >= 10 && made.blocks!.some((b) => b.type === "buy_buttons"))
    const section = read("components/website-builder/sections/renderers/ProductSection.tsx")
    check("Buy now goes through the website's checkout link with the product's own address", /checkoutHrefWithOrigin\(buyNowHref\(product, variant, pwyw\.cents\)/.test(section))
    check("Add to cart fills the shop's cart, which opens it", /cart\.add\(line\)/.test(section))
    check("the wishlist block uses the site's wishlist", /useSiteWishlist\(\)/.test(section) && /wishlistStore\.toggle\(product\.id\)/.test(section))
    check("and the section reads its own Advanced colours", /sectionColors\(/.test(section))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nA product section saved before blocks")
  {
    const old = { id: "main-product", type: "product", name: "Product", settings: { show_wishlist: false, show_share_button: true, show_whats_included: true, image_width: "45%" }, blocks: [] }
    check("is recognised", isLegacyProductSection(old))
    const drawn = withProductBlocks(old)
    const types = drawn.blocks!.map((b) => b.type)
    check("draws what its switches said, in the old order", types[0] === "badges" && types.includes("share") && !types.includes("wishlist") && types.includes("files") && types.indexOf("title") < types.indexOf("buy_buttons"), types)
    check("with ids that do not change between draws", JSON.stringify(withProductBlocks(old).blocks!.map((b) => b.id)) === JSON.stringify(drawn.blocks!.map((b) => b.id)))
    check("keeps every stored setting", drawn.settings === old.settings)
    check("a section made since, with every block deleted, stays empty", !isLegacyProductSection({ type: "product", settings: { image_width: "55%" }, blocks: [] }))
    check("a section with blocks is left alone", withProductBlocks({ ...old, blocks: [{ id: "x", type: "title", settings: {} }] }).blocks!.length === 1)
    check("the old fake review line is gone", !/128 reviews/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")) && legacyProductBlocks({}).every((b) => b.type !== "reviews"))
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the builder shows the same blocks in the sidebar when the page opens", /loaded = loaded\.map\(\(s\) => withProductBlocks\(s\)\)/.test(editor))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nBreadcrumbs")
  {
    const product = breadcrumbTrail({ template: "product", product: { title: "Field tee" } })
    check("a product: Home > Shop > the product, the last not a link", JSON.stringify(product) === JSON.stringify([{ label: "Home", url: "/" }, { label: "Shop", url: "/products" }, { label: "Field tee", url: "" }]))
    check("the shop: Home > Shop", breadcrumbTrail({ template: "page.products" }).map((c) => c.label).join(">") === "Home>Shop")
    check("a page of the creator's: Home > its title", breadcrumbTrail({ template: "page.about", title: "About us" }).map((c) => c.label).join(">") === "Home>About us")
    check("search and cart by name", breadcrumbTrail({ template: "page.search" })[1].label === "Search" && breadcrumbTrail({ template: "page.cart" })[1].label === "Cart")
    check("the home page has none", breadcrumbTrail({ template: "index" }).length === 0)
    check("labels can be the creator's", breadcrumbTrail({ template: "product", product: { title: "X" }, homeLabel: "Start", shopLabel: "Store" }).map((c) => c.label).join() === "Start,Store,X")
    const out = renderStorelibSection(
      { id: "bc", type: "breadcrumbs", name: "Breadcrumbs", settings: { separator: "chevron", shop_label: "Store" }, blocks: [] },
      {} as never,
      { template: "product", breadcrumbs: product } as never,
      DEFAULT_THEME_SOURCES as never,
    )
    check("the section draws the page's trail, with the creator's shop label", out.ok === true && /<a class="bc__link" href="\/products">Store<\/a>/.test(out.html) && /aria-current="page">Field tee</.test(out.html) && /›/.test(out.html), out.ok ? out.html.slice(0, 400) : out)
    const render = read("lib/website-builder/storefront-render.ts")
    check("every page hands its sections the trail", /breadcrumbs: breadcrumbTrail\(/.test(render))
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nFilters: the address is the state")
  {
    const q = parseCatalogQuery(new URLSearchParams("q=tee&price_min=30&price_max=10&available=1&type=physical&type=physical&opt.Colour=Black&opt.colour=Sand&sort=price-desc&sort=bogus"))
    check("read from the address, the range put the right way round", q.priceMin === 10 && q.priceMax === 30 && q.available && q.types.join() === "physical" && q.sort === "price-desc", q)
    check("option names are case blind", (q.options.colour ?? []).join() === "Black,Sand" || (q.options.colour ?? []).join() === "Sand,Black", q.options)
    check("a bad sort and a bad price are ignored", parseCatalogQuery({ sort: "drop table", price_min: "ten" }).sort === "featured" && parseCatalogQuery({ price_min: "ten" }).priceMin === null)
    const again = parseCatalogQuery(new URLSearchParams(serializeCatalogQuery(q)))
    check("written back and read again, it is the same", JSON.stringify(again) === JSON.stringify(q), serializeCatalogQuery(q))
    check("an empty query writes nothing", serializeCatalogQuery(parseCatalogQuery({})) === "")

    const cards = [
      toCard({ id: P, title: "Field tee", slug: "tee", price_cents: 2500, compare_at_cents: null, thumbnail_url: null, status: "published", type: "physical" }, [], [{ product_id: P, name: "Colour", values: ["Black", "Sand"], position: 1 }]),
      toCard({ id: Q, title: "Preset pack", slug: "pack", price_cents: 1200, compare_at_cents: null, thumbnail_url: null, status: "published", type: "digital" }),
      toCard({ id: uuid(3), title: "Sold tee", slug: "sold", price_cents: 4000, compare_at_cents: null, thumbnail_url: null, status: "published", type: "physical", inventory_count: 0 }, [], [{ product_id: uuid(3), name: "Colour", values: ["Navy"], position: 1 }]),
    ]
    check("a card's price is read back as cents", cardPriceCents(cards[0]) === 2500 && cardPriceCents(cards[1]) === 1200)
    const sorted = applyCatalogQuery(cards, parseCatalogQuery({ sort: "price-asc" })).map((c) => c.settings.title)
    check("sorted by price", sorted.join() === "Preset pack,Field tee,Sold tee", sorted)
    const ranged = applyCatalogQuery(cards, parseCatalogQuery({ price_min: "20", price_max: "30" })).map((c) => c.settings.title)
    check("a price range", ranged.join() === "Field tee", ranged)
    check("in stock only", applyCatalogQuery(cards, parseCatalogQuery({ available: "1" })).length === 2)
    check("by type", applyCatalogQuery(cards, parseCatalogQuery({ type: "digital" })).map((c) => c.id).join() === Q)
    check("by an option value", applyCatalogQuery(cards, parseCatalogQuery({ "opt.colour": "sand" })).map((c) => c.id).join() === P)
    const f = catalogFilters(cards, parseCatalogQuery({ type: "physical" }), "/products", swatchColor, isColorOption)
    const typeGroup = f.groups.find((g) => g.param === "type")
    check("each value says how many it would leave, counting the other filters", typeGroup?.values.find((v) => v.value === "digital")?.count === 1 && f.count === 2 && f.total === 3, f.groups)
    check("availability is offered only when something is out of stock", f.groups.some((g) => g.param === "available"))
    check("a colour's values carry their swatch", f.groups.find((g) => g.param === "opt.colour")?.values.find((v) => v.value === "Navy")?.swatch === "#1f2a44")
    check("the chips each undo one filter, and Clear keeps the sort", f.chips.length === 1 && f.chips[0].url === "/products" && f.clear_url === "/products", f.chips)
    check("the count reads naturally", f.count_label === "2 products" && catalogFilters(cards.slice(0, 1), parseCatalogQuery({}), "/products").count_label === "1 product")
    const one = catalogFilters(cards.slice(1, 2), parseCatalogQuery({}), "/products")
    check("a shop of one kind and one price is not shown a wall of filters", one.groups.length === 0 && one.price.show === false)
    check("the search page's words match a card, not only a row", productMatchesQuery(cards[0], "field") && !productMatchesQuery(cards[1], "field"))
    const page = catalogPage(cards, { sort: "title-desc" }, "/search", { matchWords: false })
    check("one call gives the list and the form", page.listed[0].settings.title === "Sold tee" && page.filters.path === "/search")
    const out = renderStorelibSection(
      { id: "g", type: "product_grid", name: "Grid", settings: { source: "shop", show_filters: true }, blocks: [] },
      {} as never,
      { template: "page.products", filters: f } as never,
      DEFAULT_THEME_SOURCES as never,
      applyCatalogQuery(cards, parseCatalogQuery({ type: "physical" })) as never,
    )
    check("the shop grid draws a GET form the address can carry", out.ok === true && /<form class="cat__form" action="\/products" method="get" data-storelib-filters>/.test(out.html) && /name="opt\.colour" value="Black"/.test(out.html) && /name="type" value="physical" checked/.test(out.html), out.ok ? "" : out)
    const empty = renderStorelibSection(
      { id: "g", type: "product_grid", name: "Grid", settings: { source: "shop", show_filters: true }, blocks: [] },
      {} as never,
      { template: "page.products", filters: catalogFilters(cards, parseCatalogQuery({ price_min: "999" }), "/products") } as never,
      DEFAULT_THEME_SOURCES as never,
      [] as never,
    )
    check("nothing left says so, with the way back", empty.ok === true && /No products match these filters\./.test(empty.html) && /href="\/products">Clear all</.test(empty.html))
    const shop = code("app/(site)/w/[username]/products/page.tsx")
    const search = code("app/(site)/w/[username]/search/page.tsx")
    check("the shop and the search page filter from their address", /catalogPage\(catalogue\.length \? catalogue : products \?\? \[\], asked, "\/products"\)/.test(shop) && /catalogPage\(matches, asked, "\/search", \{ matchWords: false \}\)/.test(search))
    check("the page submits the form as a box is ticked, outside the builder", /form\[data-storelib-filters\]/.test(read("components/website-builder/sections/StorelibSection.tsx")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
