/**
 * Round Y: themes from before Online Store 2.0 (Timber, Debut, Brooklyn...)
 * get Shopify's own helper scripts from Storelib, and a theme's forms are
 * read one way everywhere.
 *
 *   npx tsx tests/round-y.test.ts
 */
import { runInNewContext } from "node:vm"
import { compatFilter } from "@/lib/storelib-theme/compat/filters"
import { SHOPIFY_GLOBAL_ASSETS, shopifyGlobalAsset, shopifyGlobalAssetUrl } from "@/lib/storelib-theme/compat/shopify-global-assets"
import { formFields } from "@/lib/storelib-theme/compat/form-fields"
import { GET } from "@/app/api/site-theme/shopify/[name]/route"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}

/* A page with no DOM to speak of: enough for the scripts' logic, not their dropdowns (the theme probe draws those). */
function load(names: string[], search = "") {
  const window: Record<string, unknown> = { location: { search, href: `https://shop.test/products/a${search}` }, history: {}, addEventListener() {} }
  const ctx = { window, location: window.location, history: window.history, document: {}, URL, alert() {}, Image: function () {} }
  ;(ctx as Record<string, unknown>).Shopify = undefined
  for (const n of names) runInNewContext(shopifyGlobalAsset(n)!, Object.assign(ctx, { window }))
  return window.Shopify as Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function main() {
  console.log("\nShopify's helper scripts, Storelib's own")
  check("the four a classic theme asks for", ["option_selection.js", "api.jquery.js", "shopify_common.js", "customer_area.js"].every((n) => SHOPIFY_GLOBAL_ASSETS.includes(n)))
  for (const n of SHOPIFY_GLOBAL_ASSETS) {
    let ok = true
    try {
      new Function(shopifyGlobalAsset(n)!)
    } catch {
      ok = false
    }
    check(`${n} is plain script that parses`, ok)
  }
  const ctx = { registers: { compat: { assetUrl: (n: string) => `/theme/${n}` } } }
  const filter = (name: string, v: string) => (compatFilter(name) as unknown as (v: unknown, a: unknown[], k: object, c: unknown) => unknown)(v, [], {}, ctx)
  check("asked for by shopify_asset_url, served from Storelib's own address", filter("shopify_asset_url", "option_selection.js") === "/api/site-theme/shopify/option_selection.js")
  check("global_asset_url too", filter("global_asset_url", "api.jquery.js") === "/api/site-theme/shopify/api.jquery.js")
  check("a theme's own file by those filters is still the theme's", filter("shopify_asset_url", "theme.js") === "/theme/theme.js")
  check("any other name stays the theme's own", shopifyGlobalAssetUrl("theme.js") === null)
  check("nothing points at Shopify's servers", SHOPIFY_GLOBAL_ASSETS.every((n) => !/shopify(cdn)?\.com|cdn\.shopify/.test(shopifyGlobalAsset(n)!)))

  const ok = await GET(new Request("https://x.test/api/site-theme/shopify/option_selection.js"), { params: Promise.resolve({ name: "option_selection.js" }) })
  const missing = await GET(new Request("https://x.test/api/site-theme/shopify/x.js"), { params: Promise.resolve({ name: "x.js" }) })
  check("the route answers with the script, cached, readable from the builder's frame", ok.status === 200 && /javascript/.test(ok.headers.get("content-type") ?? "") && /max-age=86400/.test(ok.headers.get("cache-control") ?? "") && ok.headers.get("access-control-allow-origin") === "*")
  check("and 404 for anything else", missing.status === 404)

  console.log("\nMoney, as Shopify writes it")
  const S = load(["option_selection.js"])
  check("{{amount}}", S.formatMoney(4500, "${{amount}}") === "$45.00")
  check("{{amount_no_decimals}}", S.formatMoney(450000, "${{amount_no_decimals}}") === "$4,500")
  check("{{amount_with_comma_separator}}", S.formatMoney(123456, "{{amount_with_comma_separator}} €") === "1.234,56 €")
  check("cents as a string", S.formatMoney("4500", "${{amount}}") === "$45.00")

  console.log("\nA product's variants")
  const p = new S.Product({ options: ["Size", "Colour"], variants: [{ id: 1, options: ["S", "Red"], price: 4500 }, { id: 2, options: ["L", "Red"], price: 6000 }, { id: 3, option1: "L", option2: "Blue", price: 6000 }] })
  check("its option names", JSON.stringify(p.optionNames()) === '["Size","Colour"]')
  check("each option's values, once", JSON.stringify(p.optionValues(0)) === '["S","L"]' && JSON.stringify(p.optionValues(1)) === '["Red","Blue"]')
  check("the variant for a choice", p.getVariant(["L", "Red"])?.id === 2 && p.getVariant(["L", "Blue"])?.id === 3 && p.getVariant(["S", "Blue"]) === null)
  check("a variant by id", p.getVariantById("3")?.id === 3)
  check("options given as objects, as product.options_with_values", JSON.stringify(new S.Product({ options: [{ name: "Size" }], variants: [] }).optionNames()) === '["Size"]')
  check("a picture's size, on Storelib's pictures", S.Image.getSizedImageUrl("https://x.test/a.jpg", "480x") === "https://x.test/a.jpg?width=480" && S.Image.getSizedImageUrl("https://x.test/a.jpg", "large") === "https://x.test/a.jpg?width=480")

  console.log("\nShopify.queryParams and the cart's own money")
  const C = load(["shopify_common.js"], "?q=linen+shirt&sort_by=price")
  check("the address's query, read once", C.queryParams.q === "linen shirt" && C.queryParams.sort_by === "price")
  const A = load(["api.jquery.js"])
  check("api.jquery.js brings its own formatMoney when option_selection.js is not there", typeof A.formatMoney === "function" && A.formatMoney(100, "${{amount}}") === "$1.00")
  check("and every cart call a jQuery theme makes", ["addItem", "addItemFromForm", "getCart", "getProduct", "changeItem", "removeItem", "clear", "updateCartFromForm", "updateCartAttributes", "updateCartNote", "onCartUpdate", "onItemAdded", "onError"].every((k) => typeof A[k] === "function"))
  const both = load(["option_selection.js", "api.jquery.js"])
  check("loaded together, the one formatMoney is kept", typeof both.formatMoney === "function" && typeof both.OptionSelectors === "function")

  console.log("\nA theme's form, read one way")
  const f = formFields([["updates[]", "2"], ["updates[]", "1"], ["items[0][id]", "v1"], ["items[0][quantity]", "3"], ["updates[abc]", "4"], ["note", "hi"]])
  check("updates[] by line order", JSON.stringify(f.updates) === '["2","1"]')
  check("items[0][id] as items", JSON.stringify(f.items) === '[{"id":"v1","quantity":"3"}]')
  check("updates[key] kept by its name, for the cart to read by key", f["updates[abc]"] === "4" && f.note === "hi")

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
