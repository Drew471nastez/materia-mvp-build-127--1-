/**
 * The compatible profile of the template language (lib/storelib-theme/compat):
 * the engine that draws an imported Shopify theme, and the site handler that
 * answers its visitors.
 *
 *   semantics    Liquid's own rules, to the character: whitespace control,
 *                truthiness, scope (render isolated, include shared),
 *                forloop, filters with floats, ranges, raw, comments
 *   objects      a Storelib product as a theme reads one: variants in cents,
 *                options with values, the variant that option values name
 *   the page     closest.product on a product page, a static block hidden,
 *                Shopify's CDN taken out with a note, window.Shopify written
 *   the site     the cart endpoints a theme's scripts call (/cart/add.js,
 *                /cart/change, /cart.js), the section rendering API, a
 *                product's JSON, a script's request answered with JSON
 */
import { Ctx, renderString } from "../lib/storelib-theme/compat/runtime"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { parseCompat } from "../lib/storelib-theme/compat/parser"
import { productObject } from "../lib/storelib-theme/compat/objects"
import { withoutShopifyCdn, shopifyBootstrap, STANDARD_EVENTS_MODULE } from "../lib/storelib-theme/compat/shims"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { drawPage } from "../lib/storelib-theme/compat/page"
import { facet } from "../lib/storelib-theme/compat/facets"
import { sealSite, siteSealed } from "../lib/storelib-theme/compat/site-seal"
import { answer, readCartCookie, writeCartCookie, variantForOptionValues, type SiteData } from "../lib/storelib-theme/compat/site"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 400)}` : ""}`) }
}

console.log("\nLiquid's rules\n")
{
  const snippets: Record<string, string> = { card: "[{{ p }}|{{ x }}|{{ forloop.index }}]", inc: "{% assign leaked = 'yes' %}" }
  const env = { snippet: (n: string) => (snippets[n] ? parseCompat(snippets[n]) : null), filter: compatFilter }
  const r = (src: string, g: Record<string, unknown> = {}) => renderString(src, new Ctx(g, env))
  const cases: [string, string, string, Record<string, unknown>?][] = [
    ["assign with a filter", "{% assign a = 'x' | upcase %}{{ a }}", "X"],
    ["- trims white space on its side", "{%- if true -%}  yes  {%- endif -%}!", "yes!"],
    ["break and continue", "{% for i in (1..5) %}{% if i == 3 %}{% continue %}{% endif %}{% if i == 5 %}{% break %}{% endif %}{{ i }}{% endfor %}", "124"],
    ["limit, offset and forloop.last", "{% for i in list limit: 2 offset: 1 %}{{ i }}{{ forloop.last }}{% endfor %}", "bfalsectrue", { list: ["a", "b", "c", "d"] }],
    ["case with , and or", "{% case x %}{% when 1, 2 %}low{% when 3 or 4 %}mid{% else %}high{% endcase %}", "mid", { x: 4 }],
    ["unless", "{% unless x %}no{% else %}yes{% endunless %}", "no", { x: false }],
    ["capture", "{% capture c %}{{ 'a' }}-{{ 2 | plus: 3 }}{% endcapture %}{{ c }}", "a-5"],
    ["only nil and false are false; blank and empty", "{% if '' %}t{% endif %}{% if '' == blank %}b{% endif %}{% if list == empty %}e{% endif %}", "tbe", { list: [] }],
    ["integer and float division", "{{ 10 | divided_by: 4 }} {{ 10.0 | divided_by: 4 }} {{ 7 | modulo: 3 }}", "2 2.5 1"],
    ["map and join", "{{ products | map: 'title' | join: ', ' }}", "A, B", { products: [{ title: "A" }, { title: "B" }] }],
    ["where", "{{ products | where: 'available' | size }}", "1", { products: [{ available: true }, { available: false }] }],
    ["render is isolated; for with as", "{% render 'card', p: 1, x: y %}{% render 'card' for list as p %}", "[1|2|]", { y: 2, list: [] }],
    ["include shares the caller's scope", "{% include 'inc' %}{{ leaked }}", "yes"],
    ["render does not leak", "{% render 'inc' %}{{ leaked }}", ""],
    ["cycle", "{% cycle 'a','b' %}{% cycle 'a','b' %}{% cycle 'a','b' %}", "aba"],
    ["increment and decrement", "{% increment n %}{% increment n %}{% decrement m %}", "01-1"],
    ["money, in cents", "{{ 2599 | money }}", "$25.99"],
    ["handleize", "{{ 'Hello World' | handleize }}", "hello-world"],
    ["colour filters", "{{ '#ff0000' | color_to_rgb }} {{ '#000000' | color_modify: 'alpha', 0.5 }}", "rgb(255, 0, 0) rgba(0, 0, 0, 0.5)"],
    ["{% liquid %} and echo", "{% liquid\n assign z = 3\n if z > 2\n echo 'big'\n endif\n%}", "big"],
    ["comments nest", "{% comment %}x{% comment %}y{% endcomment %}z{% endcomment %}ok", "ok"],
    ["raw", "{% raw %}{{ x }}{% endraw %}", "{{ x }}"],
    ["size, first, last", "{{ s.size }} {{ list.first }} {{ list.last }}", "3 a d", { s: "abc", list: ["a", "b", "c", "d"] }],
    ["for over a map gives its values", "{% for x in h %}{{ x.n }};{% endfor %}", "1;2;", { h: { a: { n: 1 }, b: { n: 2 } } }],
    ["square brackets, by name and by variable", "{{ settings['title'] }} {{ settings[key] }}", "T T", { settings: { title: "T" }, key: "title" }],
    ["and/or from the right", "{% if a and b or c %}y{% else %}n{% endif %}", "n", { a: false, b: true, c: false }],
    ["split keeps empty parts", "{{ 'a,b,,c' | split: ',' | size }}", "4"],
    ["default, allow_false", "{{ nil | default: 'd' }} {{ false | default: 'd', allow_false: true }}", "d false"],
    ["tablerow", "{% tablerow i in (1..3) cols: 2 %}{{ i }}{% endtablerow %}", '<tr class="row1">\n<td class="col1">1</td><td class="col2">2</td></tr>\n<tr class="row2"><td class="col1">3</td></tr>\n'],
    ["style", "{% style %}.x{color:{{ c }}}{% endstyle %}", "<style data-shopify>.x{color:red}</style>", { c: "red" }],
    ["forloop.parentloop", "{% for p in list %}{% for q in list %}{{ forloop.parentloop.index }}{% endfor %}{% endfor %}", "1122", { list: [1, 2] }],
    ["json", "{{ x | json }}", '{"a":[1,"b"]}', { x: { a: [1, "b"] } }],
    ["a comment's apostrophe in {% liquid %} does not end anything", "{% liquid\n # it's fine\n echo 'ok'\n%}", "ok"],
    ["unit price with its measurement", "{{ 400 | unit_price_with_measurement: m }}", "$4.00/100g", { m: { reference_value: 100, reference_unit: "g" } }],
    ["a gift card code in fours", "{{ 'abcd1234efgh' | format_code }}", "abcd 1234 efgh"],
    ["a dash in a setting's name", "{{ s.padding-top }}", "8", { s: { "padding-top": 8 } }],
  ]
  for (const [label, src, want, g] of cases) {
    let got: string
    try { got = r(src, g) } catch (e) { got = `THROW ${(e as Error).message}` }
    check(label, got === want, { got, want })
  }
}

console.log("\nA Storelib product, as a theme reads one\n")
const card = (i: number) => ({
  id: `p${i}`,
  settings: {
    title: `Shirt ${i}`, price: "$40.00", compare_price: "$50.00", image: "https://img.test/a.png", images: ["https://img.test/a.png"], url: `/products/shirt-${i}`, slug: `shirt-${i}`, kind: "physical", available: true,
    variants: [{ id: `v${i}s`, name: "Small", price: "", available: true }, { id: `v${i}l`, name: "Large", price: "$55.00", available: true }],
    options: [{ name: "Size", values: ["Small", "Large"] }],
  },
})
{
  const p = productObject(card(1))
  const variants = p.variants as Record<string, unknown>[]
  check("prices are in cents, as Shopify's are", p.price === 4000 && variants[1].price === 5500 && p.compare_at_price === 5000)
  check("options with values, each with an id", ((p.options_with_values as Record<string, unknown>[])[0].values as Record<string, unknown>[]).map((v) => v.id).join() === "0-0,0-1")
  check("the first available option is selected", (p.selected_or_first_available_variant as Record<string, unknown>).id === "v1s")
  check("option values name a variant (?option_values=0-1 is Large)", variantForOptionValues(card(1), "0-1") === "v1l")
  check("standard_event_data describes the product and its option", JSON.parse(String(compatFilter("standard_event_data")!(p, ["view"], {}, new Ctx({}, {} as never)))).product.selectedVariant.id === "v1s")
}

console.log("\nShopify's servers stay out of the page\n")
{
  const notes: string[] = []
  const out = withoutShopifyCdn(`<script type="importmap">{"imports":{"@shopify/events":"https://cdn.shopify.com/storefront/standard-events.js"}}</script><script src="https://cdn.shopify.com/shopifycloud/x.js"></script><link rel="stylesheet" href="https://cdn.shopify.com/y.css"><script src="/own.js"></script>`, (u) => notes.push(u))
  check("the storefront events module is Storelib's own, carried in the page", out.includes("data:text/javascript") && !out.includes("standard-events.js"))
  check("any other script or stylesheet from Shopify is taken out", !out.includes("shopifycloud") && !out.includes("y.css") && out.includes("/own.js"))
  check("and each is named, not dropped without a word", notes.length === 2, notes)
  check("the events module has the classes a theme imports", ["ProductSelectEvent", "CartLinesUpdateEvent", "createCartFromAjaxResponse", "createViewEventElement", "SearchUpdateEvent"].every((n) => STANDARD_EVENTS_MODULE.includes(n)))
  check("window.Shopify is written with design mode", /"designMode":true/.test(shopifyBootstrap({ shopName: "S", currency: "USD", designMode: true })))
}

/* A small theme: a layout, a product section that reads closest.product through a static block, a cart section. */
const files: Record<string, string> = {
  "layout/theme.storelib": wrapCompatTemplate(`<html><head>{{ content_for_header }}<script src="https://cdn.shopify.com/s/trekkie.js"></script></head><body>{% sections 'header-group' %}<main>{{ content_for_layout }}</main></body></html>`),
  "sections/main-product.storelib": `${wrapCompatTemplate(`<div class="p">{% content_for 'block', type: 'price', id: 'price' %}{% content_for 'block', type: 'price', id: 'gone' %}</div>`)}\n\n<schema>\n${JSON.stringify({ type: "main-product", name: "Product", settings: [], shopify: { name: "Product", settings: [{ type: "range", id: "padding-top", min: 0, max: 40, default: 4 }] } })}\n</schema>\n`,
  "blocks/price.storelib": `${wrapCompatTemplate(`<b data-block-id="{{ block.id }}">{{ closest.product.title }} {{ closest.product.price | money }}</b>`)}\n\n<schema>\n${JSON.stringify({ name: "Price", settings: [] })}\n</schema>\n`,
  "sections/cart-count.storelib": `${wrapCompatTemplate(`<span class="count">{{ cart.item_count }}</span>`)}\n\n<schema>\n${JSON.stringify({ type: "cart-count", name: "Cart", settings: [] })}\n</schema>\n`,
  "sections/hero.storelib": `${wrapCompatTemplate(`<h1 style="padding-top:{{ section.settings.padding-top }}px">{{ section.settings.heading }}</h1>`)}\n\n<schema>\n${JSON.stringify({ type: "hero", name: "Hero", settings: [], shopify: { name: "Hero", settings: [{ type: "text", id: "heading", default: "Hi" }, { type: "range", id: "padding-top", min: 0, max: 40, default: 4 }] } })}\n</schema>\n`,
}
const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}` })
const products = [card(1), card(2)]
const base = { designMode: false, products, collections: [], menus: {}, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}" } }

console.log("\nThe page\n")
{
  const productPage = drawPage(theme, { ...base, template: "product", path: "/products/shirt-1", product: card(1) }, [
    { id: "cc", type: "cart-count", group: "header" },
    { id: "main", type: "main-product", blocks: [{ id: "gone", type: "price", static: true, hidden: true }] },
  ], { scripts: true })
  check("a section on a product page reads the page's product as closest.product", productPage.html.includes("Shirt 1 $40.00"))
  check("a static block that is hidden is not drawn", (productPage.html.match(/data-block-id="gone"/g) ?? []).length === 0 && productPage.html.includes('data-block-id="price"'))
  check("the header group is the page row's own", productPage.html.includes('id="shopify-section-cc"') && productPage.html.includes('class="count">0<'))
  check("Shopify's own scripts are out of the layout, and noted", !productPage.html.includes("trekkie") && [...theme.diagnostics].some((d) => d.includes("trekkie")))
  check("content_for_header writes window.Shopify", productPage.html.includes("data-storelib-shopify"))
  const hero = drawPage(theme, { ...base, template: "index", path: "/" }, [{ id: "h", type: "hero", settings: { heading: "Linen", padding_top: 12 } }], { scripts: false })
  check("a setting stored by the builder's id (padding_top) reaches the theme's (padding-top)", hero.html.includes("padding-top:12px") && hero.html.includes(">Linen<"))
  const defaults = drawPage(theme, { ...base, template: "index", path: "/" }, [{ id: "h", type: "hero", settings: {} }], { scripts: false })
  check("a setting with no value draws the theme's default", defaults.html.includes("padding-top:4px") && defaults.html.includes(">Hi<"))
  const missing = drawPage(theme, { ...base, template: "index", path: "/" }, [{ id: "x", type: "nope" }], { scripts: false })
  check("a section the theme does not have is an error for that section, not the page", (missing.errors.x ?? []).length === 1 && missing.html.includes("<main>"))
}

console.log("\nFilters, from the products themselves\n")
{
  const shirts = [card(1), card(2), { ...card(3), settings: { ...card(3).settings, price: "$70.00", available: false, category: "Coats" } }]
  const all = facet(shirts, new URLSearchParams(), "/collections/all")
  const labels = all.filters.map((f) => f.label)
  check("availability, price, each option and the product type", labels.join() === "Availability,Price,Size,Product type", labels)
  const size = all.filters.find((f) => f.label === "Size") as { values: { value: string; count: number; url_to_add: string }[] }
  check("each value says how many it would leave, and the address that adds it", size.values.map((v) => `${v.value}:${v.count}`).join() === "Small:3,Large:3" && size.values[1].url_to_add === "/collections/all?filter.v.option.size=Large")
  check("in stock only", facet(shirts, new URLSearchParams("filter.v.availability=1"), "/c").products.length === 2)
  check("a price range, in the shop's units", facet(shirts, new URLSearchParams("filter.v.price.gte=50"), "/c").products.map((p) => p.id).join() === "p3")
  check("two filters together leave what both allow", facet(shirts, new URLSearchParams("filter.v.availability=1&filter.p.product_type=Coats"), "/c").products.length === 0)
  const on = facet(shirts, new URLSearchParams("filter.p.product_type=Coats&page=2"), "/c").filters.find((f) => f.label === "Product type") as { active_values: { value: string; url_to_remove: string }[] }
  check("an active value, with the address that takes it away, back to the first page", on.active_values[0]?.value === "Coats" && on.active_values[0].url_to_remove === "/c")
}

async function sealChecks() {
  console.log("\nOnly the proxy sends a visitor to an imported theme's site\n")
  process.env.SUPABASE_SERVICE_ROLE_KEY ||= "test-service-role-key-for-the-seal-only"
  const seal = await sealSite("maralind", "maralind.storelib.com")
  check("a seal the proxy made is accepted for that name on that host", await siteSealed(seal, "maralind", "maralind.storelib.com"))
  check("not on storelib.com, where the session is", !(await siteSealed(seal, "maralind", "storelib.com")))
  check("not for another creator's name", !(await siteSealed(seal, "oskar", "maralind.storelib.com")))
  check("not without one", !(await siteSealed(null, "maralind", "maralind.storelib.com")))
  check("not once it is old", !(await siteSealed(await sealSite("maralind", "maralind.storelib.com", Date.now() - 120_000), "maralind", "maralind.storelib.com")))
  check("not one made up", !(await siteSealed(`${(Date.now() + 30_000).toString(36)}.AAAA`, "maralind", "maralind.storelib.com")))
}

console.log("\nThe site's cart, as a theme's scripts call it\n")
;(async () => {
  const pages = {
    home: [{ id: "cc", type: "cart-count", group: "header" }, { id: "h", type: "hero", settings: {} }],
    product: [{ id: "cc", type: "cart-count", group: "header" }, { id: "main", type: "main-product" }],
  }
  const site: SiteData = { creatorId: "c", theme, pages, products, collections: [], menus: {}, shop: base.shop, host: "shop.test" }
  const call = (method: string, path: string, body: Record<string, unknown> | null, cart: ReturnType<typeof readCartCookie>["cart"], ajax = false) => {
    const [p, q] = path.split("?")
    return answer(site, { method, path: p, query: new URLSearchParams(q ?? ""), body, cart, ajax })
  }
  const added = await call("POST", "/cart/add.js", { id: "v1l", quantity: 2, sections: "cc" }, [])
  const line = JSON.parse(String(added.body))
  check("/cart/add.js adds the option asked for", added.status === 200 && line.variant_id === "v1l" && line.quantity === 2 && line.price === 5500, line)
  check("  and hands back the sections it was asked to draw, with the new count", typeof line.sections?.cc === "string" && line.sections.cc.includes('class="count">2<'))
  const cart = added.cart!
  const again = await call("POST", "/cart/add.js", { id: "v1l", quantity: 1 }, cart)
  check("the same option again adds to its line", again.cart?.length === 1 && again.cart[0].q === 3)
  const changed = await call("POST", "/cart/change", { line: 1, quantity: 1 }, again.cart!, true)
  check("/cart/change from a script answers with the cart as JSON", changed.type.includes("json") && JSON.parse(String(changed.body)).item_count === 1)
  const form = await call("POST", "/cart/change", { line: 1, quantity: 0 }, again.cart!, false)
  check("the same from a plain form goes back to the cart page", form.status === 303 && form.cart?.length === 0)
  const sold = await call("POST", "/cart/add.js", { id: "nope" }, [])
  check("an option the shop does not have is refused with Shopify's error shape", sold.status === 404 && typeof JSON.parse(String(sold.body)).description === "string")
  const json = await call("GET", "/cart.js", null, cart)
  check("/cart.js describes the cart", JSON.parse(String(json.body)).items[0].product_title === "Shirt 1")
  const cookie = readCartCookie(writeCartCookie(cart, "gift"))
  check("the cart's cookie reads back as it was written", cookie.cart.length === 1 && cookie.cart[0].v === "v1l" && cookie.note === "gift")
  check("a cookie that is not a cart is an empty cart", readCartCookie("%7Bnope").cart.length === 0)
  const section = await call("GET", "/products/shirt-2?section_id=main", null, [])
  check("?section_id draws that section of that page", String(section.body).startsWith('<div id="shopify-section-main"') && String(section.body).includes("Shirt 2"))
  const many = await call("GET", "/?sections=cc,h", null, cart)
  const drawn = JSON.parse(String(many.body))
  check("?sections draws several, as JSON", !!drawn.cc && drawn.cc.includes('class="count">2<') && drawn.h.includes("<h1"), drawn)
  const productJson = await call("GET", "/products/shirt-1.js", null, [])
  check("/products/<handle>.js is the product as data", JSON.parse(String(productJson.body)).variants.length === 2)
  const variant = await call("GET", "/products/shirt-1?option_values=0-1", null, [])
  check("a product page with option values selects that option", String(variant.body).includes("Shirt 1"))
  const lost = await call("GET", "/nowhere", null, [])
  check("an address the site does not have is a 404", lost.status === 404)
  const checkout = await call("POST", "/cart", { checkout: "1" }, cart)
  check("checkout goes to Storelib's own basket checkout with the lines", String(checkout.body).includes("/api/checkout/cart") && String(checkout.body).includes('"productId":"p1"'))

  await sealChecks()

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})()
