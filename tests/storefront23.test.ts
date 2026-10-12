/**
 * Round 23, W23: physical commerce on the storefront, end to end.
 *
 *   IMPORTED THEMES   tests/fixtures/shopify-posture through the import's own
 *                     converter, with its product and cart sections written
 *                     the way Dawn writes them (variants, compare at, the
 *                     inventory line, quantity max, pickup availability, a
 *                     cart with quantities, Remove and a note). The live
 *                     site's own handler (lib/storelib-theme/compat/site.ts)
 *                     answers every request:
 *                       the product page: prices, Sold out per option, "Low
 *                       stock: 3 left", the quantity's max, pickup
 *                       cart/add: over the stock or over Limit sales is a
 *                       422 and nothing is added; a sold out option too
 *                       cart/change and update: a quantity over what is left
 *                       comes down to it; 0 removes; the note is kept
 *                       checkout: the right lines and the note, on this host
 *                       Website settings › Commerce: the free shipping banner
 *                       with this cart's amount, the return line in the cart
 *   STORELIB THEMES   the product section's Delivery and pickup block, its
 *                     data read from the shop's rates and locations
 *                     (lib/physical/storefront-facts.ts) with a fake
 *                     database, and the cart page's note to the checkout
 *   THE BUILDER       the product page's product read again when the builder
 *                     comes back into view
 *   DOMAINS           the Storelib address sends a page visit to the
 *                     website's live primary domain, and nothing else
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import JSZip from "jszip"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type CartEntry, type CartStock, type SiteData, type SiteResponse } from "../lib/storelib-theme/compat/site"
import { compatMenus } from "../lib/storelib-theme/compat/menus"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { commerceMarkup, withBodyStart } from "../lib/storelib-theme/compat/site-commerce-markup"
import { CART_NOTE_MAX, cartNote, readSiteCheckoutParams, siteCheckoutHref } from "../lib/checkout/site-checkout"
import { deliveryLine, pickupLine } from "../lib/physical/delivery-lines"
import { productDelivery, shopFacts } from "../lib/physical/storefront-facts"
import { physicalStock } from "../lib/physical/storefront-stock"
import { domainAddress, sendsToDomain } from "../lib/custom-domains/subdomain-redirect"
import { freeShippingLine, returnsLine } from "../lib/website-builder/site-commerce"
import { untt } from "./i18n-source"

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
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

/* ── The fixture, with a product and a cart section written as Dawn's ───── */

const PRODUCT_SECTION = `<div class="main-product product-info">
  <h1 class="product__title">{{ product.title }}</h1>
  {%- assign v = product.selected_or_first_available_variant -%}
  <div class="price">{%- if v.compare_at_price > v.price -%}<s class="price__compare">{{ v.compare_at_price | money }}</s>{%- endif -%}<span class="price__current">{{ v.price | money }}</span></div>
  <select class="variant-select" name="id">{%- for variant in product.variants -%}<option value="{{ variant.id }}"{% if variant.id == v.id %} selected{% endif %}{% unless variant.available %} disabled{% endunless %}>{{ variant.title }}{% unless variant.available %} - Sold out{% endunless %}</option>{%- endfor -%}</select>
  {%- if v.inventory_management == 'shopify' and v.inventory_quantity <= 10 and v.inventory_quantity > 0 -%}<p class="product__inventory">Low stock: {{ v.inventory_quantity }} left</p>{%- elsif v.available -%}<p class="product__inventory">In stock</p>{%- else -%}<p class="product__inventory">Out of stock</p>{%- endif -%}
  <form action="/cart/add" method="post" class="product-form"><input type="hidden" name="id" value="{{ v.id }}"><input class="quantity__input" type="number" name="quantity" value="1" min="{{ v.quantity_rule.min }}"{% if v.quantity_rule.max != null %} max="{{ v.quantity_rule.max }}"{% endif %}><button type="submit" name="add"{% unless v.available %} disabled{% endunless %}>{% if v.available %}Add to cart{% else %}Sold out{% endif %}</button></form>
  {%- assign pick = v.store_availabilities | where: 'available', true -%}{%- if pick.size > 0 -%}<div class="pickup-availability"><p>Pickup available at <span class="pickup__place">{{ pick[0].location.name }}</span></p><small>{{ pick[0].pick_up_time }}</small></div>{%- endif -%}
</div>
{% schema %}
{ "name": "Product information", "settings": [] }
{% endschema %}`

const CART_SECTION = `<div class="page-width main-cart">
  <h1>Your cart</h1>
  {%- if cart.item_count == 0 -%}<p class="cart__empty">Your cart is empty</p>{%- else -%}
  <form action="/cart" method="post" id="cart">
  {%- for item in cart.items -%}<div class="cart-item"><span class="cart-item__name">{{ item.product.title }}</span><span class="cart-item__variant">{{ item.variant.title }}</span><span class="cart-item__price">{{ item.final_line_price | money }}</span><input class="cart-item__qty" type="number" name="updates[]" value="{{ item.quantity }}" min="0"><a class="cart-item__remove" href="{{ item.url_to_remove }}">Remove</a></div>{%- endfor -%}
  <textarea name="note" class="cart__note">{{ cart.note }}</textarea>
  <p class="totals">Subtotal <span class="totals__value">{{ cart.total_price | money }}</span></p>
  <button type="submit" name="checkout" class="cart__checkout">Check out</button>
  </form>{%- endif -%}
</div>
{% schema %}
{ "name": "Main cart", "settings": [] }
{% endschema %}`

async function fixtureZip(): Promise<JSZip> {
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
  zip.file("sections/main-product-info.liquid", PRODUCT_SECTION)
  zip.file("sections/main-cart.liquid", CART_SECTION)
  return zip
}

const PID = "00000000-0000-4000-8000-000000000001"
const SMALL = "10000000-0000-4000-8000-000000000001"
const LARGE = "10000000-0000-4000-8000-000000000002"
const MEDIUM = "10000000-0000-4000-8000-000000000003"
const DIGITAL = "00000000-0000-4000-8000-000000000009"

/** A shirt that ships in three sizes: Small has 3 left, Medium plenty, Large sold out. And a download. */
function cards() {
  const variants = [
    { id: SMALL, name: "Small", price: "$49.00", compare_price: "$69.00", available: true },
    { id: MEDIUM, name: "Medium", price: "$49.00", compare_price: "$69.00", available: true },
    { id: LARGE, name: "Large", price: "$52.00", available: false },
  ]
  return [
    { id: PID, settings: { title: "Posture shirt", slug: "posture-shirt", url: "/products/posture-shirt", price: "$49.00", compare_price: "$69.00", image: "", images: [], kind: "physical", available: true, description: "", variants, options: [{ name: "Size", values: ["Small", "Medium", "Large"] }] } },
    { id: DIGITAL, settings: { title: "Stretch guide", slug: "stretch-guide", url: "/products/stretch-guide", price: "$9.00", image: "", images: [], kind: "digital", available: true, description: "", variants: [], options: [] } },
  ]
}

/** What the live site's loader hands the theme for this product's page (lib/website-builder/compat-site.ts compatStock and productDelivery). */
function productPageCard() {
  const c = cards()[0]
  return {
    ...c,
    settings: {
      ...c.settings,
      low_stock_at: 5,
      variants: (c.settings.variants as Record<string, unknown>[]).map((v) =>
        v.id === SMALL ? { ...v, left: 3, max: 3, pickup: [{ name: "Main Street", city: "Lisbon", ready: "Usually ready in 24 hours" }] } : v.id === MEDIUM ? { ...v, left: null, max: 4 } : { ...v, left: null, max: 0 },
      ),
    },
  }
}

const STOCK: CartStock = { variants: { [SMALL]: 3, [MEDIUM]: 4, [LARGE]: 0 }, perOrder: 4 }

async function siteOf(extra: Partial<SiteData> = {}): Promise<SiteData> {
  const r = await convertShopifyTheme(await fixtureZip())
  if (!r.ok) throw new Error("the fixture theme did not convert")
  const t = r.theme
  const theme = themeOfInstall(t.files, t.settings, { assetUrl: (n) => `/a/${encodeURIComponent(n)}`, assetText: (n) => t.files[`shopify/assets/${n}`] ?? null })
  const pages = Object.fromEntries(t.pages.map((p) => [p.page_key, p.sections])) as SiteData["pages"]
  const products = cards()
  return {
    creatorId: "c",
    theme,
    pages,
    products: products as never,
    collections: [{ id: "c-all", title: "Shirts", handle: "shirts", description: "", image: "", url: "/collections/shirts", products: products as never, products_count: 2 }] as never,
    menus: compatMenus({ "main-menu": { title: "Main", links: [{ title: "Shirts", url: "/collections/shirts" }] } } as never, Object.keys(pages)),
    shop: { name: "Posturex", currency: "USD", moneyFormat: "${{amount}}", policies: [{ handle: "refund-policy", title: "Refund policy", body: "<p>Thirty days.</p>" }] },
    host: "posturex.storelib.com",
    product: async (handle) => (handle === "posture-shirt" ? (productPageCard() as never) : null),
    stock: async (productId) => (productId === PID ? STOCK : null),
    ...extra,
  }
}

type Ask = { cart: CartEntry[]; note: string }
async function ask(site: SiteData, state: Ask, method: string, path: string, body: Record<string, unknown> | null = null, ajax = false): Promise<SiteResponse> {
  const [p, q] = path.split("?")
  const r = await answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body, cart: state.cart, note: state.note, ajax })
  if (r.cart) state.cart = r.cart
  if (typeof r.note === "string") state.note = r.note
  return r
}
const text = (r: SiteResponse) => String(r.body)
const location = (r: SiteResponse) => r.headers?.Location ?? ""

/* ── A fake database for the server readers ─────────────────────────────── */

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

const CREATOR = "c0000000-0000-4000-8000-000000000001"
const LOC_MAIN = "l0000000-0000-4000-8000-000000000001"
const LOC_PORTO = "l0000000-0000-4000-8000-000000000002"
const LOC_STORE = "l0000000-0000-4000-8000-000000000003"
function shopTables(): Record<string, Row[]> {
  return {
    products: [{ id: PID, creator_id: CREATOR, type: "physical", status: "published", price_cents: 4900, track_inventory: true, continue_selling: false, shipping_profile_id: null, weight_grams: 300, requires_shipping: true, fulfillment_method: "self", low_stock_threshold: null, max_per_order: 2 }],
    product_variants: [
      { id: SMALL, product_id: PID, name: "Small", active: true, track_inventory: true, inventory_policy: "deny", price_cents: 4900, weight_grams: 300 },
      { id: LARGE, product_id: PID, name: "Large", active: true, track_inventory: true, inventory_policy: "deny", price_cents: 5200, weight_grams: 320 },
    ],
    commerce_settings: [{ creator_id: CREATOR, returns_enabled: true, return_window_days: 30, default_location_id: LOC_MAIN, low_stock_default: 5 }],
    store_settings: [{ creator_id: CREATOR, default_country: "PT" }],
    inventory_locations: [
      { id: LOC_MAIN, creator_id: CREATOR, name: "Main Street", city: "Lisbon", country: "PT", active: true, fulfills_orders: true, pickup_enabled: true, pickup_ready: "24h" },
      { id: LOC_PORTO, creator_id: CREATOR, name: "Porto shop", city: "Porto", country: "PT", active: true, fulfills_orders: true, pickup_enabled: true, pickup_ready: "2h" },
      { id: LOC_STORE, creator_id: CREATOR, name: "Warehouse", city: "Braga", country: "PT", active: true, fulfills_orders: true, pickup_enabled: false, pickup_ready: "24h" },
    ],
    inventory_levels: [
      { variant_id: SMALL, location_id: LOC_MAIN, available: 3 },
      { variant_id: SMALL, location_id: LOC_PORTO, available: 0 },
      { variant_id: SMALL, location_id: LOC_STORE, available: 9 },
      { variant_id: LARGE, location_id: LOC_STORE, available: 4 },
    ],
    shipping_profiles: [{ id: "p1", creator_id: CREATOR, name: "General", is_default: true }],
    shipping_zones: [{ id: "z1", creator_id: CREATOR, profile_id: "p1", name: "Portugal", countries: ["PT"], regions: [], rest_of_world: false }],
    shipping_rates: [
      { id: "r1", creator_id: CREATOR, zone_id: "z1", name: "Standard", kind: "flat", price_cents: 499, min_days: 3, max_days: 5, free_over_cents: 7500, active: true, position: 0 },
      { id: "r2", creator_id: CREATOR, zone_id: "z1", name: "Express", kind: "flat", price_cents: 1299, min_days: 1, max_days: 1, active: true, position: 1 },
    ],
  }
}

async function main() {
  console.log("\nAn imported theme's product page (the fixture, Dawn's way)\n")
  {
    const site = await siteOf()
    const st: Ask = { cart: [], note: "" }
    const page = text(await ask(site, st, "GET", "/products/posture-shirt"))
    check("the product page answers with the product", /<h1 class="product__title">Posture shirt<\/h1>/.test(page), page.slice(0, 300))
    check("the price, and the compare at price struck through", /<s class="price__compare">\$69\.00<\/s><span class="price__current">\$49\.00<\/span>/.test(page))
    check("each option is listed, Large sold out and not choosable", /<option value="10000000-0000-4000-8000-000000000003">Medium<\/option>/.test(page) && /<option value="10000000-0000-4000-8000-000000000002" disabled>Large - Sold out<\/option>/.test(page))
    check("Small has 3 left: the theme's own low stock line says so", /Low stock: 3 left/.test(page))
    check("the quantity picker stops at what may be bought (stock, held to Limit sales)", /class="quantity__input"[^>]*max="3"/.test(page))
    check("pickup is said for the option a pickup point holds", /Pickup available at <span class="pickup__place">Main Street<\/span><\/p><small>Usually ready in 24 hours<\/small>/.test(page))
    const medium = text(await ask(site, st, "GET", `/products/posture-shirt?variant=${MEDIUM}`))
    check("a chosen option with plenty: In stock, no number, no pickup it is not at", /<p class="product__inventory">In stock<\/p>/.test(medium) && !/Pickup available/.test(medium) && /class="quantity__input"[^>]*max="4"/.test(medium))
    const large = text(await ask(site, st, "GET", `/products/posture-shirt?variant=${LARGE}`))
    check("the sold out option: Out of stock and a Sold out button that cannot be pressed", /Out of stock/.test(large) && /<button type="submit" name="add" disabled>Sold out<\/button>/.test(large))
    const collection = text(await ask(site, st, "GET", "/collections/shirts"))
    check("the collection lists the products", /Posture shirt/.test(collection) && /Stretch guide/.test(collection))
    const search = JSON.parse(text(await ask(site, st, "GET", "/search/suggest.json?q=posture")))
    check("search finds the product by its name", search.resources.results.products.some((p: { title: string }) => p.title === "Posture shirt"))
  }

  console.log("\nThe cart: add, change, remove, the note, and the checkout\n")
  {
    const site = await siteOf()
    const st: Ask = { cart: [], note: "" }
    const add2 = await ask(site, st, "POST", "/cart/add.js", { id: SMALL, quantity: 2 }, true)
    check("two of Small are added", add2.status === 200 && st.cart[0]?.q === 2 && st.cart[0]?.v === SMALL)
    const over = await ask(site, st, "POST", "/cart/add.js", { id: SMALL, quantity: 2 }, true)
    check("two more of Small, with 3 left, is refused (422) and nothing is added", over.status === 422 && /You can only add 1 more of Posture shirt/.test(text(over)) && st.cart[0].q === 2, text(over))
    const one = await ask(site, st, "POST", "/cart/add.js", { id: SMALL, quantity: 1 }, true)
    check("the last one is added", one.status === 200 && st.cart[0].q === 3)
    const none = await ask(site, st, "POST", "/cart/add.js", { id: SMALL, quantity: 1 }, true)
    check("then none more", none.status === 422 && /can't add more Posture shirt/.test(text(none)))
    const limit = await ask(site, st, "POST", "/cart/add.js", { id: MEDIUM, quantity: 2 }, true)
    check("Limit sales counts every option: 3 Small and 2 Medium is over 4 per order", limit.status === 422 && st.cart.length === 1, text(limit))
    const mediumOne = await ask(site, st, "POST", "/cart/add.js", { id: MEDIUM, quantity: 1 }, true)
    check("one Medium fits the limit", mediumOne.status === 200 && st.cart.length === 2)
    const sold = await ask(site, st, "POST", "/cart/add.js", { id: LARGE, quantity: 1 }, true)
    check("the sold out option is refused", sold.status === 422 && /Large is sold out/.test(text(sold)))
    const digital = await ask(site, st, "POST", "/cart/add.js", { id: DIGITAL, quantity: 1 }, true)
    check("a download with no limit is added as before", digital.status === 200 && st.cart.length === 3)

    const typed = await ask(site, st, "POST", "/cart/change.js", { line: 2, quantity: 9 }, true)
    const after = JSON.parse(text(typed))
    check("a quantity typed over what may be bought comes down to it (Medium: 4 per order less 3 Small)", typed.status === 200 && st.cart.find((e) => e.v === MEDIUM)?.q === 1 && after.items.find((i: { variant_id: string }) => i.variant_id === MEDIUM)?.quantity === 1, st.cart)

    const cartPage = text(await ask(site, st, "GET", "/cart"))
    check("the cart page lists each line with its option and line price", /<span class="cart-item__name">Posture shirt<\/span><span class="cart-item__variant">Small<\/span><span class="cart-item__price">\$147\.00<\/span>/.test(cartPage))
    check("the total is the lines'", /<span class="totals__value">\$205\.00<\/span>/.test(cartPage), cartPage.match(/totals__value">[^<]*/)?.[0])
    const removeHref = cartPage.match(/class="cart-item__remove" href="([^"]+)"/g)?.[2]?.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g, "&") ?? ""
    check("each line has a Remove link (url_to_remove)", /^\/cart\/change\?id=.+&quantity=0$/.test(removeHref), removeHref)
    const removed = await ask(site, st, "GET", removeHref)
    check("following it removes that line and opens the cart", removed.status === 303 && location(removed) === "/cart" && st.cart.length === 2 && !st.cart.some((e) => e.p === DIGITAL))

    const noted = await ask(site, st, "POST", "/cart/update.js", { note: "Gift wrap, please" }, true)
    check("the cart note is kept", noted.status === 200 && st.note === "Gift wrap, please" && JSON.parse(text(noted)).note === "Gift wrap, please")
    const zero = await ask(site, st, "POST", "/cart/update.js", { updates: [3, 0] }, true)
    check("an update to 0 removes a line", zero.status === 200 && st.cart.length === 1 && st.cart[0].v === SMALL)

    const go = await ask(site, st, "POST", "/cart", { "updates[]": "3", note: "Gift wrap, please", checkout: "" }, false)
    const to = new URL(location(go), "https://posturex.storelib.com")
    const params = readSiteCheckoutParams(to.searchParams)
    check("Check out goes to the website's own checkout on this host", go.status === 303 && to.pathname === "/checkout" && to.host === "posturex.storelib.com")
    check("with the right lines", params.items.length === 1 && params.items[0].productId === PID && params.items[0].variantId === SMALL && params.items[0].quantity === 3 && params.wholeCart, params.items)
    check("and the note, for the checkout's note to the shop", params.note === "Gift wrap, please")
    const buyNow = await ask(site, { cart: [{ k: SMALL, p: PID, v: SMALL, q: 3 }], note: "" }, "POST", "/cart/add", { id: MEDIUM, quantity: "1", checkout: "" }, false)
    const bn = readSiteCheckoutParams(new URL(location(buyNow), "https://x").searchParams)
    check("Buy it now is the item alone, whatever the cart holds", buyNow.status === 303 && bn.items.length === 1 && bn.items[0].variantId === MEDIUM && !bn.wholeCart)
  }

  console.log("\nWebsite settings › Commerce on an imported theme\n")
  {
    const st: Ask = { cart: [{ k: SMALL, p: PID, v: SMALL, q: 1 }], note: "" }
    const on = await siteOf({ commerce: { freeShippingFromCents: 7500, returnsLine: returnsLine({ enabled: true, windowDays: 30 }) } })
    const page = text(await ask(on, st, "GET", "/cart"))
    check("the banner is the first thing in the body, with this cart's amount", /<body[^>]*><div id="sl-free-shipping"[^>]*><span>Spend \$26\.00 more for free shipping<\/span>/.test(page), page.match(/<body[^>]*>.{0,200}/s)?.[0])
    check("its bar is drawn at the cart's share of the amount", /<b style="width:65%"><\/b>/.test(page))
    check("the returns line goes under the theme's own Check out", /Returns accepted within 30 days of delivery\./.test(page) && /button\[name=\\"checkout\\"\]|button\[name="checkout"\]/.test(page))
    check("and links the shop's refund policy", /\/policies\/refund-policy/.test(page) && /<h1>Refund policy<\/h1>/.test(text(await ask(on, st, "GET", "/policies/refund-policy"))))
    const full = text(await ask(on, { cart: [{ k: SMALL, p: PID, v: SMALL, q: 2 }], note: "" }, "GET", "/"))
    check("over the amount: You have earned free shipping", /You have earned free shipping/.test(full))
    const off = text(await ask(await siteOf(), st, "GET", "/cart"))
    check("with both off, nothing is added to the theme's page", !/sl-free-shipping|data-cart-returns|data-storelib-commerce/.test(off))
    check("the markup is empty with nothing to say", JSON.stringify(commerceMarkup({ freeShippingFromCents: null, returnsLine: null }, 0)) === JSON.stringify({ bodyStart: "", head: "", bodyEnd: "" }))
    check("free on every order says so", /Free shipping on every order/.test(commerceMarkup({ freeShippingFromCents: 0, returnsLine: null }, 0).bodyStart))
    check("withBodyStart keeps the body's attributes", withBodyStart(`<html><body class="x" id="y"><main></main></body></html>`, "<i></i>") === `<html><body class="x" id="y"><i></i><main></main></body></html>`)
    check("the banner says what Storelib's own themes say (site-commerce.ts)", freeShippingLine(4900, 7500)?.text === "Spend $26.00 more for free shipping")
    check("the loader reads the shop's facts only when one of them is on, and keeps the typed amount first",
      /onSite\.freeShippingBar \|\| onSite\.cartReturnsNote/.test(read("lib/website-builder/compat-site.ts")) && /onSite\.freeShippingAmount !== null \? Math\.round\(onSite\.freeShippingAmount \* 100\) : facts\.freeShippingFromCents/.test(read("lib/website-builder/compat-site.ts")))
  }

  console.log("\nThe product objects a theme reads\n")
  {
    const p = productObject(productPageCard() as never) as Record<string, unknown>
    const v = (p.variants as Record<string, unknown>[])
    const small = v.find((x) => x.id === SMALL) as Record<string, unknown>
    check("an option with few left is counted, with its number", small.inventory_management === "shopify" && small.inventory_quantity === 3)
    check("quantity_rule.max is the most one order may take", (small.quantity_rule as { max: number }).max === 3 && ((v.find((x) => x.id === MEDIUM) as Record<string, unknown>).quantity_rule as { max: number }).max === 4)
    check("store_availabilities name the pickup point and how soon", JSON.stringify((small.store_availabilities as Record<string, unknown>[])[0]?.pick_up_time) === '"Usually ready in 24 hours"' && ((small.store_availabilities as { location: { name: string } }[])[0].location.name === "Main Street"))
    const plain = productObject(cards()[0] as never) as Record<string, unknown>
    check("without the loader's stock, nothing is invented: no max, no pickup, plenty", ((plain.variants as Record<string, unknown>[])[0].quantity_rule as { max: unknown }).max === null && ((plain.variants as Record<string, unknown>[])[0].store_availabilities as unknown[]).length === 0)
    check("the product's compare at price, and available while one option is", plain.compare_at_price === 6900 && plain.available === true)
  }

  console.log("\nThe live loader reads stock with the product's id, so Limit sales holds\n")
  {
    const db = fakeDb(shopTables())
    const withId = await physicalStock(db, { id: PID, creator_id: CREATOR, track_inventory: true, continue_selling: false }, [{ id: SMALL, name: "Small", track_inventory: true, inventory_policy: "deny" }])
    const without = await physicalStock(db, { creator_id: CREATOR, track_inventory: true, continue_selling: false }, [{ id: SMALL, name: "Small", track_inventory: true, inventory_policy: "deny" }])
    check("12 held across the locations that ship, held to 2 per order with the id", withId.get(SMALL)?.maxQuantity === 2 && without.get(SMALL)?.maxQuantity === 12, [withId.get(SMALL), without.get(SMALL)])
    const loader = read("lib/website-builder/compat-site.ts")
    check("compat-site reads stock with the product's id, and the cart's room with Limit sales", /physicalStock\(admin, \{ creator_id: creatorId, \.\.\.\(product as Record<string, unknown>\), id: productId \}, list\)/.test(loader) && /orderLimits\(admin, \[card\.id\]\)/.test(loader))
    check("the stock is read even when the number is hidden; only `left` waits on the setting", /showLeft \? \{ left: s\.left \} : \{\}/.test(loader) && /compatStock\(admin, creator\.creatorId, card, siteCommerce/.test(loader))
    check("the cart's room is handed to the theme's site", /stock: physical \? \(productId\) => cartStock\(/.test(loader))
  }

  console.log("\nDelivery and pickup, from the shop's rates and locations\n")
  {
    const db = fakeDb(shopTables())
    const d = await productDelivery(db, CREATOR, PID)
    check("the cheapest delivery home, with how long it takes and where it turns free", d?.ship?.country === "PT" && d.ship.priceCents === 499 && d.ship.estimate === "3 to 5 business days" && d.ship.freeFromCents === 7500, d?.ship)
    check("pickup for Small at Main Street only: Porto has none, the warehouse does not hand over", d?.pickup[SMALL]?.length === 1 && d.pickup[SMALL][0].name === "Main Street" && d.pickup[SMALL][0].ready === "Usually ready in 24 hours")
    check("no pickup for Large: only the warehouse holds it", !d?.pickup[LARGE])
    check("the lines a product page says", deliveryLine(d!.ship, (c) => `$${(c / 100).toFixed(2)}`) === "Delivery $4.99 to Portugal, 3 to 5 business days" && pickupLine(d!.pickup[SMALL]) === "Pickup available at Main Street, Lisbon")
    check("free delivery, and several pickup points", deliveryLine({ country: "PT", priceCents: 0, estimate: "2 business days", freeFromCents: 0 }, String) === "Free delivery to Portugal, 2 business days" && pickupLine([{ name: "A", city: null, ready: "" }, { name: "B", city: null, ready: "" }]) === "Pickup available at A and 1 more place")
    const t = shopTables()
    t.products[0].fulfillment_method = "printful"
    check("a print on demand product is never offered for pickup", Object.keys((await productDelivery(fakeDb(t), CREATOR, PID))?.pickup ?? { x: 1 }).length === 0)
    const t2 = shopTables()
    t2.products[0].status = "draft"
    check("an unpublished product says nothing", (await productDelivery(fakeDb(t2), CREATOR, PID)) === null)
    const t3 = shopTables()
    t3.shipping_zones = [{ id: "z1", creator_id: CREATOR, profile_id: "p1", name: "Spain", countries: ["ES"], regions: [], rest_of_world: false }]
    check("no rate home: no delivery line, pickup still said", (await productDelivery(fakeDb(t3), CREATOR, PID))?.ship === null)
    const facts = await shopFacts(db, CREATOR)
    check("the shop's facts: returns and where shipping turns free", facts.returns?.enabled === true && facts.returns.windowDays === 30 && facts.freeShippingFromCents === 7500, facts)
    check("the storefront shop route answers with the same reader", /shopFacts\(createAdminClient\(\), creatorId\)/.test(read("app/api/physical/storefront/shop/route.ts")))
    check("the shipping line is the buy box's own rule (lib/physical/delivery-promise.ts), so every product page agrees", /deliveryPromise\(\{/.test(read("lib/physical/storefront-facts.ts")) && /Local delivery available near the shop/.test(read("components/website-builder/sections/renderers/product/product-blocks.tsx")))
    check("the product section's data carries delivery for what ships", /type === "physical" && row\.creator_id \? productDelivery\(db, row\.creator_id, row\.id\)/.test(read("lib/products/product-section-data.ts")))
  }

  console.log("\nThe Delivery and pickup block in Storelib's product section\n")
  {
    const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string }[] }[]; presets: { blocks: { id: string; type: string }[] }[] }
    const block = schema.blocks.find((b) => b.type === "delivery")
    check("the block is offered, with Delivery and Pickup switches", !!block && ["show_delivery", "show_pickup", "color", "margin_top", "margin_bottom"].every((id) => block!.fields.some((f) => f.id === id)))
    const preset = schema.presets[0].blocks.map((b) => b.type)
    check("a new product page has it, after the low stock line", preset.indexOf("delivery") === preset.indexOf("low_stock") + 1)
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    check("it is drawn, and follows the chosen option", /\n  delivery: Delivery,\n/.test(blocks) && /ctx\.variant\?\.id \?\? ctx\.product\.variants\?\.\[0\]\?\.id/.test(blocks) && /d\?\.pickup\?\.\[variantId\]/.test(blocks))
    check("the builder says where to set it up when the shop has neither", /Set up rates in Settings, Shipping and delivery, or pickup in Locations/.test(blocks))
  }

  console.log("\nStorelib's cart page: the note goes on to the checkout\n")
  {
    const href = siteCheckoutHref({ items: [{ productId: PID, variantId: SMALL, quantity: 2 }], back: "/cart", wholeCart: true, note: "  Leave it at the door\r\n " })
    const p = readSiteCheckoutParams(new URL(href, "https://x").searchParams)
    check("the note rides the checkout link, cleaned", p.note === "Leave it at the door" && p.items.length === 1 && p.items[0].quantity === 2)
    check("an empty note adds nothing", !/note=/.test(siteCheckoutHref({ items: [{ productId: PID, variantId: null, quantity: 1 }], note: "   " })))
    check("held to the checkout's own limit, control characters out", cartNote("a".repeat(5000))?.length === CART_NOTE_MAX && cartNote("a\u0000b") === "ab")
    const cart = read("components/website-builder/cart-page-body.tsx")
    check("the cart page asks for it when something ships, and hands it on", /data-cart-note=""/.test(cart) && /wholeCart: true, note \}\)/.test(cart))
    const checkout = read("app/checkout/site/site-checkout.tsx")
    check("the checkout starts its note with it, open", /React\.useState\(initialNote \?\? ""\)/.test(checkout) && /open=\{initialNote \? true : undefined\}/.test(checkout) && /initialNote=\{params\.note\}/.test(read("app/checkout/site/page.tsx")))
  }

  console.log("\nThe builder's canvas follows the product\n")
  {
    const editor = read("app/website-builder/editor/[installId]/page.tsx")
    check("the product page's product is read again when the builder comes back into view", /THE PRODUCT THE PRODUCT PAGE SHOWS, READ AGAIN/.test(editor) && /fetch\(`\/api\/website-builder\/products\?id=\$\{encodeURIComponent\(id\)\}`, \{ cache: "no-store" \}\)/.test(editor))
    check("only its _product_data changes, so nothing becomes unsaved", /return \{ \.\.\.sec, settings: \{ \.\.\.s, _product_data: fresh \} \}/.test(editor) && !/setIsDirty\(true\)[^\n]*_product_data: fresh/.test(editor))
    const canvas = read("components/website-builder/compat/compat-canvas.tsx")
    check("an imported theme's canvas reads the product page's stock and pickup from the storefront's route, again on coming back", /fetch\(`\/api\/physical\/storefront\/product\?productId=\$\{encodeURIComponent\(card\.id\)\}`/.test(canvas) && /document\.addEventListener\("visibilitychange", again\)/.test(canvas) && /withStock\(found, stock\.variants, showLeft\)/.test(canvas))
    check("  and shows Only N left only when Website settings › Commerce does", /const showLeft = siteCommerce\(settings\)\.showStockLeft/.test(canvas) && /\.\.\.\(showLeft \? \{ left: s\.left \} : \{\}\), max: s\.max, pickup: s\.pickup/.test(canvas))
    const route = read("app/api/physical/storefront/product/route.ts")
    check("the storefront's product route says each option's pickup points beside the buy box's delivery promise (F23)", /pickup: \(pickups as Record<string, unknown\[\]>\)\[v\.id\] \?\? \[\]/.test(route) && /productDelivery\(db, p\.creator_id, p\.id\)/.test(route) && /delivery: promise \? \{ \.\.\.promise, lines: deliveryPromiseLines\(promise\) \} : null/.test(route))
    check("and the route draws it the way the live page does", /productSectionData\(createAdminClient\(\), product as ProductSectionRow, \{ files: true \}\)/.test(read("app/api/website-builder/products/route.ts")))
  }

  console.log("\nDomains: the Storelib address sends visitors to the website's domain\n")
  {
    const page = (pathname: string, search = "", method = "GET", fetchDest: string | null = "document") => sendsToDomain({ method, pathname, search, fetchDest })
    check("a page visit is sent", page("/") && page("/products/posture-shirt", "?variant=1") && page("/collections/shirts") && page("/cart"))
    check("never the API, Next's files or a file", !page("/api/website-builder/subscribe") && !page("/api") && !page("/_next/static/x.js") && !page("/robots.txt") && !page("/sitemap.xml") && !page("/cart.js"))
    check("never a checkout, a receipt or a review link", !page("/checkout") && !page("/checkout/thanks/abc") && !page("/receipt/abc") && !page("/review/tok"))
    check("never a preview or a framed page", !page("/preview/tok") && !page("/", "?preview=tok") && !page("/wishlist", "?sl_embed=1") && !page("/", "", "GET", "iframe"))
    check("never a form post", !page("/cart", "", "POST") && !page("/contact", "", "POST"))
    check("the address keeps the path and the query", domainAddress("www.posturex.com", "/products/a", "?variant=2") === "https://www.posturex.com/products/a?variant=2" && domainAddress("www.posturex.com", "/", "") === "https://www.posturex.com/")
    const proxy = read("proxy.ts")
    check("the proxy asks only on a site's page, after the API and review pass through", /if \(pathname\.startsWith\("\/review\/"\)\) return NextResponse\.next\(\)\n\s*\/\*[^\n]*\*\/\n\s*if \(sendsToDomain\(/.test(proxy))
    check("only the primary website domain, live with HTTPS, and a temporary redirect", /\.eq\("purpose", "website"\)\s*\.eq\("is_primary", true\)\s*\.eq\("status", "active"\)/.test(proxy) && /row\.ssl_status !== "failed"/.test(proxy) && /NextResponse\.redirect\(domainAddress\(domain, pathname, search\), \{ status: 302 \}\)/.test(proxy))
    check("a read that fails keeps serving the Storelib address", /if \(failed\) return hit\?\.host \?\? null/.test(proxy) && /if \(error\) return hit\?\.host \?\? null/.test(proxy))
    const ws = read("components/website-builder/website-settings/domains.tsx")
    check("Website settings › Domains says where visitors end up", /Your website is at \$\{liveHost\}\. Its other addresses send visitors there\./.test(ws) && /Sent to \{liveHost\}/.test(ws) && /"Sends visitors to the primary address"/.test(ws))
    check("Settings › Domains' help says it too", /its storelib\.com address sends visitors there/.test(read("components/app/settings/domains-panel.tsx")))
    check("the Vercel calls stay server side and are never made by this suite", /^import "server-only"/m.test(read("lib/custom-domains/vercel.ts")) && !/custom-domains\/vercel/.test(read("tests/storefront23.test.ts").replace(/check\("the Vercel[^\n]*\n/, "")))
  }

  console.log("\nCopy\n")
  {
    const files = [
      "lib/storelib-theme/compat/site-commerce-markup.ts",
      "lib/physical/storefront-facts.ts",
      "lib/physical/delivery-lines.ts",
      "lib/custom-domains/subdomain-redirect.ts",
      "components/website-builder/website-settings/domains.tsx",
      "components/website-builder/cart-page-body.tsx",
      "tests/storefront23.test.ts",
    ]
    const banned = new RegExp(`\\b(${["unl" + "ock", "ele" + "vate", "seam" + "less", "power" + "ful", "effort" + "less(ly)?", "super" + "charge", "trans" + "form"].join("|")})\\b|${String.fromCharCode(0x2014)}`, "i")
    for (const f of files) check(`${f}: no em dashes and none of the banned words`, !banned.test(read(f)), read(f).match(banned)?.[0])
    const blocks = read("components/website-builder/sections/renderers/product/product-blocks.tsx")
    const block = blocks.slice(blocks.indexOf(" * DELIVERY AND PICKUP"), blocks.indexOf("/** The description as safe markup"))
    check("the Delivery and pickup block: no em dashes and none of the banned words", block.length > 500 && !banned.test(block))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
