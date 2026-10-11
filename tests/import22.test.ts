/**
 * ===========================================================================
 *  SHOPIFY IMPORTS, CHECKED AGAINST WHAT SHOPIFY DRAWS
 * ===========================================================================
 * Round 22's accuracy pass. Dawn 15.4, Dawn 2.0, Horizon and Skeleton were
 * imported and every template drawn through the compatible profile; each
 * line here is a difference from Shopify that the pass found and fixed,
 * written as the theme writes it and checked against Shopify's output.
 *
 *   MONEY ON A WORKED OUT PRICE   `price | times: 0.8 | money` and
 *                      `divided_by: 4.0 | money` printed nothing (a float
 *                      was not read as cents); below zero the sign sat
 *                      after the currency sign ($-10.50)
 *   WEIGHTS            weight_with_unit printed grams as kilograms
 *   IFCHANGED          {% ifchanged %} drew its body every time
 *   OPTIONS BY NAME    options_by_name['Size'] found nothing: Shopify takes
 *                      the name in any case
 *   THE SHOP           shop.url was blank; a currency had no symbol
 *   THE THEME'S LANGUAGE  a theme whose default locale is not English
 *                      (de.default.json) printed made up English for `| t`
 *   THE PAGE TITLE     current_tags was an empty list, which Liquid reads as
 *                      something: Dawn's <title> said `tagged ""` on every page
 *   THE DESCRIPTION    page_description was "" (also something): an empty
 *                      <meta name="description">, never the product's words
 *   FORMS              the id and class Shopify gives a form with none
 *                      (product_form_<id>, shopify-product-form, contact_form,
 *                      customer_login); a newsletter form posts to
 *                      /contact#<its id> and the answer keeps that #
 *   THE PASSWORD PAGE  templates/password.json's "layout": "password" was
 *                      not read: the page drew in theme.liquid with the
 *                      shop's header and footer
 *   THE IMPORT REPORT  a Shopify app's blocks on a page and its app embeds
 *                      were left out without a word
 */
import JSZip from "jszip"
import { Ctx, renderString } from "../lib/storelib-theme/compat/runtime"
import { compatFilter } from "../lib/storelib-theme/compat/filters"
import { parseCompat } from "../lib/storelib-theme/compat/parser"
import { CompatTheme, wrapCompatTemplate } from "../lib/storelib-theme/compat/theme"
import { themeOfInstall } from "../lib/storelib-theme/compat/page"
import { answer, type SiteData } from "../lib/storelib-theme/compat/site"
import { convertShopifyTheme } from "../lib/storelib-theme/shopify/convert"

let passed = 0
let failed = 0
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; console.log(`  FAIL  ${label}${detail !== undefined ? `\n        ${JSON.stringify(detail).slice(0, 500)}` : ""}`) }
}

const product = {
  id: "00000000-0000-4000-8000-000000000001",
  settings: {
    title: "Shirt", price: "$40.00", compare_price: "$60.00", image: "https://img.test/p.png", images: ["https://img.test/p.png"],
    url: "/products/shirt", slug: "shirt", kind: "physical", available: true, description: "<p>Washed <b>linen</b>, cut loose.</p>",
    variants: [{ id: "v1", name: "Small", price: "", compare_price: "", available: true }, { id: "v2", name: "Large", price: "$55.00", compare_price: "", available: true }],
    options: [{ name: "Size", values: ["Small", "Large"] }],
  },
}

function themeWith(files: Record<string, string>, shop: Record<string, unknown> = {}) {
  const theme = new CompatTheme(files, {}, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const ctx = theme.pageContext({ template: "product", path: "/products/shirt", designMode: false, products: [product as never], collections: [], menus: {}, product: product as never, shop: { name: "Shop", currency: "USD", moneyFormat: "${{amount}}", ...shop } as never, host: "shop.test" })
  return (src: string) => renderString(src, ctx)
}

async function site(zip: JSZip) {
  const r = await convertShopifyTheme(zip, { fallbackName: "t" })
  if (!r.ok) throw new Error(r.error)
  const theme = themeOfInstall(r.theme.files, r.theme.settings, { assetUrl: (n) => `/a/${n}`, assetText: () => null })
  const pages = Object.fromEntries(r.theme.pages.map((p) => [p.page_key, p.sections]))
  const data = { creatorId: "c", theme, pages, products: [product], collections: [], menus: {}, shop: { name: "Linen & Co", currency: "USD", moneyFormat: "${{amount}}" }, host: "shop.test" } as unknown as SiteData
  const get = async (path: string) => String((await answer(data, { method: "GET", path, query: new URLSearchParams(), body: null, cart: [] })).body)
  return { report: r.report, get }
}
const schema = (o: object) => `{% schema %}${JSON.stringify(o)}{% endschema %}`

async function main() {
  console.log("\nMoney on a price the theme worked out\n")
  {
    const r = themeWith({})
    check("price | times: 0.8 | money", r("{{ product.price | times: 0.8 | money }}") === "$32.00", r("{{ product.price | times: 0.8 | money }}"))
    check("an installment, price | divided_by: 4.0 | money", r("{{ product.price | divided_by: 4.0 | money }}") === "$10.00", r("{{ product.price | divided_by: 4.0 | money }}"))
    check("a float of cents rounds to the cent", r("{{ 1050.6 | money }}") === "$10.51")
    check("below zero the sign goes first: -$10.50", r("{{ -1050 | money }}") === "-$10.50" && r("{{ -1050 | money_with_currency }}") === "-$10.50 USD", r("{{ -1050 | money }}"))
    check("a whole price is unchanged", r("{{ 123456 | money }}|{{ 1000 | money_without_trailing_zeros }}") === "$1,234.56|$10")
  }

  console.log("\nWeights are grams, written in the unit asked for\n")
  {
    const r = themeWith({})
    check("1000 g is 1 kg", r("{{ 1000 | weight_with_unit }}") === "1 kg", r("{{ 1000 | weight_with_unit }}"))
    check("1500 g in kg, 500 g in g, 907 g in lb", r("{{ 1500 | weight_with_unit: 'kg' }}|{{ 500 | weight_with_unit: 'g' }}|{{ 907 | weight_with_unit: 'lb' }}") === "1.5 kg|500 g|2 lb", r("{{ 1500 | weight_with_unit: 'kg' }}|{{ 500 | weight_with_unit: 'g' }}|{{ 907 | weight_with_unit: 'lb' }}"))
  }

  console.log("\nPictures and search engines\n")
  {
    const r = themeWith({})
    const tag = r("{{ product.featured_image | image_url: width: 800 | image_tag }}")
    check("image_url | image_tag writes the picture's own alt, as on Shopify", /alt="Shirt"/.test(tag), tag)
    check("the theme's alt wins", /alt="X"/.test(r("{{ product.featured_image | image_url: width: 800 | image_tag: alt: 'X' }}")))
    check("an address with no picture behind it has an empty alt", /alt=""/.test(r("{{ 'https://img.test/z.png' | image_tag }}")))
    const sd = r("{{ product | structured_data }}")
    let parsed: Record<string, unknown> | null = null
    try { parsed = JSON.parse(sd) } catch { parsed = null }
    const offers = (parsed?.offers ?? []) as Record<string, unknown>[]
    check("product | structured_data is JSON-LD Product (Dawn and Horizon print it in ld+json)", parsed?.["@type"] === "Product" && parsed?.name === "Shirt" && parsed?.url === "https://shop.test/products/shirt", sd)
    check("an Offer per variant: price, currency, stock, address", offers.length === 2 && offers[0].price === "40.00" && offers[1].price === "55.00" && offers[0].priceCurrency === "USD" && offers[0].availability === "http://schema.org/InStock" && offers[1].url === "https://shop.test/products/shirt?variant=v2", offers)
    check("the description as plain words", parsed?.description === "Washed linen, cut loose.", parsed?.description)
    check("anything else is still JSON", r("{{ shop | structured_data }}") === "{}")
  }

  console.log("\n{% ifchanged %}\n")
  {
    const env = { snippet: () => null, filter: compatFilter }
    const out = renderString("{% assign l = 'a,a,b,b,a' | split: ',' %}{% for i in l %}{% ifchanged %}{{ i }}{% endifchanged %}{% endfor %}", new Ctx({}, env))
    check("draws only when its output changes", out === "aba", out)
    check("it is a tag the profile knows, not an unknown one", parseCompat("{% ifchanged %}x{% endifchanged %}").unknown.length === 0)
  }

  console.log("\nThe product, the shop and the currency\n")
  {
    const r = themeWith({})
    check("options_by_name['Size'], as Dawn's older swatches write it", r("{{ product.options_by_name['Size'].values | join: '/' }}") === "Small/Large", r("{{ product.options_by_name['Size'].values | join: '/' }}"))
    check("and ['size'] and ['SIZE']", r("{{ product.options_by_name['size'].name }}{{ product.options_by_name['SIZE'].name }}") === "SizeSize")
    check("a name the product has not is nothing", r("[{{ product.options_by_name['Colour'] }}]") === "[]")
    check("shop.url and shop.secure_url are the site's address", r("{{ shop.url }}|{{ shop.secure_url }}") === "https://shop.test|https://shop.test", r("{{ shop.url }}"))
    check("cart.currency.symbol and the country's currency symbol", r("{{ cart.currency.symbol }}|{{ localization.country.currency.symbol }}") === "$|$")
    const eur = themeWith({}, { currency: "EUR", moneyFormat: "€{{amount_with_comma_separator}}" })
    check("a euro shop's symbol is €", eur("{{ localization.country.currency.symbol }}|{{ shop.enabled_currencies.first.symbol }}") === "€|€", eur("{{ localization.country.currency.symbol }}"))
  }

  console.log("\nA theme whose own language is not English\n")
  {
    const r = themeWith({
      "locales/de.default.json": JSON.stringify({ products: { add: "In den Warenkorb", items: { one: "{{ count }} Artikel", other: "{{ count }} Artikel insgesamt" } } }),
      "locales/en.json": JSON.stringify({ products: { add: "Add to cart" } }),
    })
    check("| t reads de.default.json", r("{{ 'products.add' | t }}") === "In den Warenkorb", r("{{ 'products.add' | t }}"))
    check("with its plural forms", r("{{ 'products.items' | t: count: 1 }}|{{ 'products.items' | t: count: 3 }}") === "1 Artikel|3 Artikel insgesamt")
    check("and request.locale says de, for <html lang>", r("{{ request.locale.iso_code }}") === "de")
    const en = themeWith({ "locales/en.default.json": JSON.stringify({ a: "English" }), "locales/de.json": JSON.stringify({ a: "Deutsch" }) })
    check("an English default is still read first", en("{{ 'a' | t }}|{{ request.locale.iso_code }}") === "English|en")
  }

  console.log("\nDawn's <title> and <meta name=\"description\">\n")
  {
    /* layout/theme.liquid of Dawn 15.4, as written. */
    const title = `{{ page_title }}{%- if current_tags %}{% assign current_tags_joined = current_tags | join: ', ' %} &ndash; tagged "{{ current_tags_joined }}"{% endif -%}{%- if current_page != 1 %} &ndash; Page {{ current_page }}{% endif -%}{%- unless page_title contains shop.name %} &ndash; {{ shop.name }}{% endunless -%}`
    const meta = `{% if page_description %}<meta name="description" content="{{ page_description | escape }}">{% endif %}`
    const r = themeWith({})
    check("no ` – tagged \"\"` when no tag narrows the page", r(title) === "Shirt &ndash; Shop", r(title))
    check("a product's description, as plain words, is its page_description", r(meta) === `<meta name="description" content="Washed linen, cut loose.">`, r(meta))
    const theme = new CompatTheme({}, {}, { assetUrl: () => null })
    const ctx = theme.pageContext({ template: "cart", path: "/cart", designMode: false, products: [], collections: [], menus: {}, shop: { name: "Shop" } })
    check("a page with nothing to say writes no empty description tag", renderString(meta, ctx) === "", renderString(meta, ctx))
  }

  console.log("\nForms as Shopify writes them\n")
  {
    const r = themeWith({})
    const productForm = r("{% form 'product', product %}{% endform %}")
    check("a product form with no id or class: product_form_<id>, shopify-product-form", productForm.includes(`id="product_form_${product.id}"`) && productForm.includes(`class="shopify-product-form"`), productForm)
    check("the same id on every draw (a section drawn again finds its form)", productForm === r("{% form 'product', product %}{% endform %}"))
    const own = r("{% form 'product', product, id: 'F', class: 'form' %}{% endform %}")
    check("the theme's own id and class win", own.includes(`id="F"`) && own.includes(`class="form"`) && !own.includes("shopify-product-form"), own)
    check("customer_login and create_customer", r("{% form 'customer_login' %}{% endform %}").includes(`id="customer_login"`) && r("{% form 'create_customer' %}{% endform %}").includes(`id="create_customer"`))
    const news = r("{% form 'customer', id: 'ContactFooter', class: 'footer__newsletter' %}{% endform %}")
    check("Dawn's newsletter posts to /contact#ContactFooter", news.includes(`action="/contact#ContactFooter"`) && news.includes(`id="ContactFooter"`), news)
    check("a contact form with no id is contact_form, class contact-form", /action="\/contact#contact_form" id="contact_form"[^>]*class="contact-form"/.test(r("{% form 'contact' %}{% endform %}")), r("{% form 'contact' %}{% endform %}"))
    const theme = new CompatTheme({}, {}, { assetUrl: () => null })
    const data = { creatorId: "c", theme, pages: {}, products: [], collections: [], menus: {}, shop: { name: "S" }, host: "x" } as unknown as SiteData
    const back = await answer(data, { method: "POST", path: "/contact", query: new URLSearchParams(), body: { form_type: "customer", "contact[email]": "a@b.test" }, cart: [], referer: "/pages/about", submit: async () => ({ ok: true, status: 200 }) })
    check("the answer has no # of its own, so the browser keeps the form's", back.headers?.Location === "/pages/about?customer_posted=true", back.headers?.Location)
  }

  console.log("\nThe import: the password page's own layout, and nothing left out without a word\n")
  {
    const zip = new JSZip()
    zip.file("layout/theme.liquid", `<html><body class="theme">{% sections 'header-group' %}<main>{{ content_for_layout }}</main>{% sections 'footer-group' %}</body></html>`)
    zip.file("layout/password.liquid", `<html><body class="password">{{ content_for_layout }}</body></html>`)
    zip.file("config/settings_schema.json", JSON.stringify([{ name: "theme_info", theme_name: "T" }]))
    zip.file("config/settings_data.json", JSON.stringify({ current: { blocks: {
      "1": { type: "shopify://apps/klaviyo/blocks/klaviyo_onsite_embed/2632fe16", disabled: false, settings: {} },
      "2": { type: "shopify://apps/old/blocks/off/1", disabled: true, settings: {} },
    } } }))
    zip.file("sections/hero.liquid", `<div class="hero">{% for block in section.blocks %}{% case block.type %}{% when '@app' %}{% render block %}{% else %}<b>{{ block.type }}</b>{% endcase %}{% endfor %}</div>` + schema({ name: "Hero", blocks: [{ type: "@app" }, { type: "item", name: "Item" }] }))
    zip.file("sections/top.liquid", `<header>The shop's header</header>` + schema({ name: "Top" }))
    zip.file("sections/header-group.json", JSON.stringify({ type: "header", name: "Header", sections: { t: { type: "top" } }, order: ["t"] }))
    zip.file("templates/index.json", JSON.stringify({ sections: { a: { type: "hero", blocks: {
      b: { type: "item" },
      u: { type: "shopify://apps/some-upsell/blocks/upsell/abc" },
      r: { type: "shopify://apps/judge-me-reviews/blocks/preview_badge/61cc" },
    }, block_order: ["b", "u", "r"] } }, order: ["a"] }))
    zip.file("templates/password.json", JSON.stringify({ layout: "password", sections: { m: { type: "hero" } }, order: ["m"] }))
    const { report, get } = await site(zip)
    const notes = report.notes.map((n) => `${n.file}: ${n.message}`)
    check("an app block on a page is named in the report, with its app", notes.some((n) => n.startsWith("templates/index.json:") && n.includes("some-upsell (upsell)") && n.includes("draw nothing")), notes)
    check("a review app's block is said to be drawn by Storelib Reviews", notes.some((n) => n.startsWith("templates/index.json:") && n.includes("judge-me-reviews (preview_badge)") && n.includes("Storelib Reviews")), notes)
    check("an app embed switched on is named; one switched off is not", notes.some((n) => n.startsWith("config/settings_data.json:") && n.includes("klaviyo (klaviyo_onsite_embed)")) && !notes.some((n) => n.includes("old (off)")), notes)
    const home = await get("/")
    check("the home page draws in theme.liquid, with the header", home.includes(`class="theme"`) && home.includes("The shop's header"))
    const password = await get("/password")
    check("the password page draws in layout/password.liquid", password.includes(`<body class="password">`), password.slice(0, 300))
    check("with no header of the shop, as on Shopify", !password.includes("The shop's header") && password.includes(`class="hero"`))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
