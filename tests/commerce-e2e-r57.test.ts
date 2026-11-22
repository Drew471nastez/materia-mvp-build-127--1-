/**
 * ===========================================================================
 *  ROUND 57 (e1): A BUYER ON A MATERIA WEBSITE, FROM THE PRODUCT PAGE TO A PAID ORDER
 * ===========================================================================
 * The owner: "ensure all ecommerce ... and shipping zones, all working the
 * best with Storelib, end to end verified and working 100%, ready for
 * people to start ecommerce."
 *
 * One euro store in Germany over the journey harness (tests/_journey: the
 * in-memory PostgREST with the database functions, a Stripe world whose
 * webhooks are signed and delivered to the real webhook route, Mailgun's
 * mailbox). Its website is the Clothing template, which is Materia
 * (theme-packages/materia, imported by the converter Add uses), published,
 * and every page and cart call goes through the real site route
 * (app/api/site-theme/site/[username]/[[...path]]) the way the proxy hands it
 * on: sealed, with the visitor's market and country headers and the cart
 * cookie the route itself wrote last time. Nothing calls answer() directly.
 *
 * What the seller sets in /app is saved through the real routes: zones and
 * rates (Settings > Shipping), a product with two options, variant prices,
 * a compare at price, stock and a limit per order (the product editor),
 * VAT (Settings > Taxes), a code (Discounts), euros for Switzerland in CHF
 * (Markets). What the buyer is charged is read back from Stripe's side of
 * the stub and from the order rows, and held to what the seller set:
 *
 *   A  a tee in sizes and colours to Germany (flat, free over 60 EUR) and to
 *      France (weight based), VAT on top
 *   B  a download: no address, no shipping, the library entry
 *   C  a mixed cart: the download and the tee in one payment
 *   D  free shipping from 60 EUR
 *   E  the US, outside every zone: refused before any payment
 *   F  a 10% code from the theme's cart
 *   G  a visitor in Switzerland: CHF on the product page, the cart, the
 *      quote and the charge
 *   H  the last tee bought by two buyers at once: one wins, no oversell; a
 *      failed card and an expired hold give the stock back
 *
 * COMMERCE_R57_SERVE=1 keeps the store answering over HTTP at the end, for
 * scripts/check-commerce-e2e-r57.mjs to drive the real Materia pages in
 * Chromium (it prints "SERVING <port>").
 *
 * Run: node scripts/run-push-tests.mjs (in STRICT_SUITES)
 */
import "./_journey/env"
import { Journey, type Person, type Answer } from "./_journey/harness"
import { importTemplate } from "../scripts/theme-templates/site"

let passed = 0
let failed = 0
const fails: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    fails.push(name)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 1200)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/&#8364;|&euro;/g, "€").replace(/\s+/g, " ")

const USERNAME = "nord-goods"
const HOST = `${USERNAME}.storelib.com`
const CHF_PER_EUR = 0.94
const GBP_PER_EUR = 0.85

/** A browser on the website: its cookies, its country, its market (as the proxy names it). */
interface Visitor {
  jar: Map<string, string>
  ip: string
  country: string
  market: string | null
}

async function main() {
  const j = await Journey.start()
  const { sealSite, SITE_SEAL_HEADER } = await import("@/lib/storelib-theme/compat/site-seal")
  const { SITE_MARKET_HEADER, SITE_COUNTRY_HEADER } = await import("@/lib/markets/site-name")
  const { readSiteCheckoutParams } = await import("@/lib/checkout/site-checkout")

  const visitor = (ip: string, country: string, market: string | null = null): Visitor => ({ jar: new Map(), ip, country, market })
  /* A request to the website, as the proxy rewrites it: sealed for this name and host, the visitor's market and country named. */
  const site = async (v: Visitor, method: string, path: string, body?: Record<string, unknown> | string, extra: Record<string, string> = {}): Promise<Answer> => {
    const seal = await sealSite(USERNAME, HOST)
    const headers: Record<string, string> = { [SITE_SEAL_HEADER]: seal ?? "", "x-forwarded-for": v.ip, "x-vercel-ip-country": v.country, [SITE_COUNTRY_HEADER]: v.country, origin: `https://${HOST}`, referer: `https://${HOST}/`, ...extra }
    if (v.market) headers[SITE_MARKET_HEADER] = v.market
    const raw = typeof body === "string" ? body : undefined
    if (raw) headers["content-type"] = headers["content-type"] ?? "application/x-www-form-urlencoded"
    const r = await j.call(`${method} /api/site-theme/site/${USERNAME}${path}`, { host: HOST, headers, cookies: Object.fromEntries(v.jar), body: raw ? undefined : body, raw })
    /* The browser keeps what the answer set (the cart cookie the route wrote). */
    const set = ((r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []) as string[]
    for (const c of set) {
      const [pair] = c.split(";")
      const at = pair.indexOf("=")
      const name = pair.slice(0, at).trim()
      const value = pair.slice(at + 1)
      if (/Max-Age=0/i.test(c) || value === "") v.jar.delete(name)
      else v.jar.set(name, value)
    }
    return r
  }
  const ajax = { "x-requested-with": "XMLHttpRequest", accept: "application/json" }
  /* The website's own checkout, on the website's host, as app/(storelib)/checkout/site/site-checkout.tsx calls it. */
  const checkout = (v: Visitor, body: Record<string, unknown>) =>
    j.call("POST /api/checkout/site", { host: HOST, headers: { "x-forwarded-for": v.ip, "x-vercel-ip-country": v.country, origin: `https://${HOST}` }, cookies: Object.fromEntries(v.jar), body })

  payWith = async (v, b) => {
    const body: Record<string, unknown> = { action: "intent", items: b.items, email: b.email, firstName: b.first, lastName: b.last, agreedToTerms: true, clientKey: b.key, paymentMethods: ["card"] }
    if (b.address) Object.assign(body, { address: b.address, deliveryOptionId: b.option ?? null })
    if (b.code) body.couponCode = b.code
    const intentAnswer = await checkout(v, body)
    const pi = intentAnswer.json?.paymentIntentId as string | undefined
    const find = () => j.rows("commerce_checkouts").find((x) => x.client_key === b.key) ?? null
    if (!pi) return { intentAnswer, co: find(), lines: [], intent: null, confirm: null }
    if (b.fail) {
      const intent = j.world.intents.get(pi)
      return { intentAnswer, co: find(), lines: [], intent, confirm: null }
    }
    const paid = j.world.payIntent(pi)
    const confirm = await checkout(v, { action: "confirm", paymentIntentId: pi, clientSecret: j.world.intents.get(pi)!.client_secret, wholeCart: true })
    await j.webhook("payment_intent.succeeded", paid.intent)
    const co = find()
    return { intentAnswer, co, lines: co ? j.rows("orders").filter((o) => o.checkout_id === co.id) : j.rows("orders").filter((o) => o.stripe_payment_intent_id === pi), intent: j.world.intents.get(pi), confirm }
  }
  const pay = (v: Visitor, b: Buy) => payWith(v, b)

  section("1. The seller: a euro store in Germany, payments on")
  const seller = await j.signUp("nora@nord.example", { name: "Nora Nord" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: USERNAME } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Nord Goods", supportEmail: "hello@nord.example", defaultCountry: "DE" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "DE", businessName: "Nord Goods GmbH" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  await j.call("POST /api/settings/payments", { as: seller, body: { defaultCurrency: "EUR" } })
  const cur = await j.call("PUT /api/store/currency", { as: seller, body: { country: "DE", currency: "EUR", key: "nord-eur-1" } })
  check("the store sells in EUR and takes payments", cur.status === 200 && cur.json?.currency === "EUR" && j.rows("creators")[0].charges_enabled === true, cur.json)


  section("2. Settings > Shipping: Germany flat with free over 60 EUR, France and Italy by weight, Switzerland flat, nowhere else")
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const loc = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${loc}`, { as: seller, body: { name: "Lager", kind: "home", addressLine1: "Hafenstr. 3", city: "Hamburg", postalCode: "20457", country: "DE" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  const zDe = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["DE"], name: "Germany" } })
  const zEu = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["FR", "IT"], name: "France and Italy" } })
  const zCh = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["CH"], name: "Switzerland" } })
  const zone = (c: string) => j.rows("shipping_zones").find((z) => (z.countries ?? []).includes(c))?.id
  const rates = [
    await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone("DE"), kind: "flat", name: "Standard", priceCents: 490, minDays: 1, maxDays: 3 } }),
    await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone("DE"), kind: "free", name: "Free shipping", minValue: 6000, minDays: 2, maxDays: 4 } }),
    await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone("FR"), kind: "weight", name: "Colissimo", tiers: [{ from: 0, priceCents: 790 }, { from: 1000, priceCents: 1490 }], minDays: 3, maxDays: 6 } }),
    await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone("CH"), kind: "flat", name: "Post CH", priceCents: 1500, minDays: 3, maxDays: 7 } }),
  ]
  check("three zones and four rates saved as typed", [zDe, zEu, zCh, ...rates].every((r) => r.status === 200) && j.rows("shipping_rates").length === 4 && j.rows("shipping_rates").find((r) => r.name === "Colissimo")?.tiers?.length === 2, [zDe, zEu, zCh, ...rates].map((r) => [r.status, r.json?.error]))

  section("3. Settings > Taxes: VAT added at checkout, Germany 19%, France 20%, on shipping and on downloads")
  const tx = await j.call("PUT /api/store/taxes", { as: seller, body: { enabled: true, included: false, onShipping: true, digital: true } })
  const vDe = await j.call("POST /api/store/taxes/regions", { as: seller, body: { country: "DE", rate: 19, name: "MwSt" } })
  const vFr = await j.call("POST /api/store/taxes/regions", { as: seller, body: { country: "FR", rate: 20, name: "TVA" } })
  check("taxes saved", tx.status === 200 && vDe.status === 200 && vFr.status === 200, [tx.json, vDe.json, vFr.json])

  section("4. Products: a tee in sizes and colours, a heavy blanket that keeps selling, a download")
  const tee = newProduct(j, creator.id, { type: "physical", title: "Organic Tee", priceCents: 2900 })
  const teeSave = await j.call(`PUT /api/physical/products/${tee}`, {
    as: seller,
    body: {
      options: [
        { name: "Size", values: ["S", "M", "L"] },
        { name: "Colour", values: ["Black", "Sand"] },
      ],
      variants: [
        { options: ["S", "Black"], priceCents: 2900, compareAtCents: 3900, sku: "TEE-S-BLK", weightGrams: 250, stock: { [loc]: 5 } },
        { options: ["M", "Black"], priceCents: 2900, compareAtCents: 3900, sku: "TEE-M-BLK", weightGrams: 250, stock: { [loc]: 6 } },
        { options: ["L", "Black"], priceCents: 3200, compareAtCents: 3900, sku: "TEE-L-BLK", weightGrams: 280, stock: { [loc]: 1 } },
        { options: ["S", "Sand"], priceCents: 2900, sku: "TEE-S-SND", weightGrams: 250, stock: { [loc]: 0 } },
        { options: ["M", "Sand"], priceCents: 2900, sku: "TEE-M-SND", weightGrams: 250, stock: { [loc]: 2 } },
        { options: ["L", "Sand"], priceCents: 3200, sku: "TEE-L-SND", weightGrams: 280, stock: { [loc]: 10 } },
      ],
      requiresShipping: true,
      weightGrams: 250,
      taxable: true,
      trackInventory: true,
      lowStockThreshold: 3,
      fulfillmentLocationId: loc,
      maxPerOrder: 4,
    },
  })
  const tv = (size: string, colour: string) => j.rows("product_variants").find((v) => v.product_id === tee && v.option1 === size && v.option2 === colour)!
  const level = (size: string, colour: string) => j.rows("inventory_levels").find((l) => l.variant_id === tv(size, colour)?.id && l.location_id === loc) ?? { on_hand: 0, committed: 0 }
  check("the tee: six variants, L costs 32 EUR, Black at 39 EUR before, Sand S at 0, at most 4 per order", teeSave.status === 200 && j.rows("product_variants").filter((v) => v.product_id === tee).length === 6 && tv("L", "Black").price_cents === 3200 && tv("S", "Black").compare_at_price_cents === 3900 && level("S", "Sand").on_hand === 0 && j.rows("products").find((p) => p.id === tee)?.max_per_order === 4, { status: teeSave.status, body: teeSave.json })
  const blanket = newProduct(j, creator.id, { type: "physical", title: "Wool Blanket", priceCents: 8900 })
  const blanketSave = await j.call(`PUT /api/physical/products/${blanket}`, { as: seller, body: { variants: [{ options: [], priceCents: 8900, sku: "BLANKET", weightGrams: 1800, stock: { [loc]: 0 } }], requiresShipping: true, weightGrams: 1800, taxable: true, trackInventory: true, continueSelling: true, fulfillmentLocationId: loc } })
  check("the blanket: 1.8 kg, none on hand, keeps selling", blanketSave.status === 200 && j.rows("products").find((p) => p.id === blanket)?.continue_selling === true, blanketSave.json)
  const book = newProduct(j, creator.id, { type: "digital", title: "Pattern Book", priceCents: 1200 })

  section("5. The website: Materia's Clothing template, published")
  const t = await importTemplate("materia/clothing")
  const [install] = j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Clothing" }, {})
  j.db.insert("store_theme_settings", { install_id: install.id, settings: t.theme.settings }, {})
  j.db.insert("store_theme_custom_files", Object.entries(t.files).map(([path, content]) => ({ install_id: install.id, path, content })), {})
  j.db.insert("store_theme_pages", t.theme.pages.map((p) => ({ install_id: install.id, page_key: p.page_key, sections: p.sections })), {})
  const ada = visitor("198.51.100.10", "DE")
  const pdp = await site(ada, "GET", "/products/organic-tee")
  const html = String(pdp.json ?? "")
  if (process.env.R57_DUMP) (await import("node:fs")).writeFileSync(process.env.R57_DUMP + "/pdp.html", html)
  check("the tee's page answers on the website", pdp.status === 200 && /Organic Tee/.test(html), { status: pdp.status, head: html.slice(0, 300) })
  const text = words(html)
  /* The markup on one line, as the regexes below read it. */
  const flat = html.replace(/\s+/g, " ")
  check("  the price is the first variant's, 29 EUR, with 39 EUR struck through", /price--special">\s*€29\.00/.test(html) && /compare-price[^>]*>€39\.00/.test(html), text.match(/Organic Tee.{0,160}/)?.[0])
  check("  sizes and colours as Materia's buttons and swatches, Sand marked unavailable with S chosen (none on hand)", /name="Size" value="S"[^>]*checked/.test(flat) && /name="Colour" value="Black"[^>]*checked/.test(flat) && /name="Colour" value="Sand"[^>]*class="option-disabled/.test(flat) && /data-swatch-type="color_swatches"/.test(flat), flat.match(/name="Colour".{0,400}/)?.[0])
  check("  the form adds S Black, the first variant with stock", new RegExp(`name="id" value="${tv("S", "Black").id}"`).test(flat), { form: flat.match(/name="id"[^>]*>/)?.[0], sBlack: tv("S", "Black").id })
  const pjs = await site(ada, "GET", "/products/organic-tee.js", undefined, ajax)
  const pj = typeof pjs.json === "string" ? JSON.parse(pjs.json) : pjs.json
  const pv = (size: string, colour: string) => (pj?.variants ?? []).find((v: any) => v.option1 === size && v.option2 === colour)
  check("/products/organic-tee.js, what Materia's script switches variants by: prices in cents, compare at, availability, 4 per order", pjs.status === 200 && pv("L", "Black")?.price === 3200 && pv("S", "Black")?.compare_at_price === 3900 && pv("S", "Sand")?.available === false && pv("M", "Sand")?.available === true && pv("S", "Black")?.quantity_rule?.max === 4 && pv("L", "Black")?.quantity_rule?.max === 1 && pj?.price_min === 2900 && pj?.price_max === 3200, { keys: Object.keys(pj ?? {}), min: pj?.price_min, max: pj?.price_max, v: pj?.variants?.map((v: any) => [v.title, v.price, v.compare_at_price, v.available, v.quantity_rule?.max]) })
  const blanketJs = await site(ada, "GET", "/products/wool-blanket.js", undefined, ajax)
  const bj = typeof blanketJs.json === "string" ? JSON.parse(blanketJs.json) : blanketJs.json
  check("  the blanket with none on hand but Continue selling is available", bj?.variants?.[0]?.available === true, bj?.variants)
  const bookJs = await site(ada, "GET", "/products/pattern-book.js", undefined, ajax)
  const bk = typeof bookJs.json === "string" ? JSON.parse(bookJs.json) : bookJs.json
  check("  the download is available and needs no shipping", bk?.variants?.[0]?.available === true && bk?.variants?.[0]?.requires_shipping === false, bk?.variants)

  section("6. The cart: add, change, remove, refused, kept in the browser's cookie")
  const cartOf = async (v: Visitor) => {
    const r = await site(v, "GET", "/cart.js", undefined, ajax)
    return typeof r.json === "string" ? JSON.parse(r.json) : r.json
  }
  const add = (v: Visitor, id: string, quantity: number) => site(v, "POST", "/cart/add.js", { id, quantity }, ajax)
  const a1 = await add(ada, tv("M", "Black").id, 2)
  const a2 = await add(ada, tv("L", "Sand").id, 1)
  let cart = await cartOf(ada)
  check("two M Black and one L Sand: 2 x 29 + 32 = 90 EUR, three items, read back from the cookie", a1.status === 200 && a2.status === 200 && cart?.item_count === 3 && cart?.total_price === 9000 && cart?.currency === "EUR" && ada.jar.has("sl_theme_cart"), { a1: a1.status, a2: [a2.status, a2.json], cart: cart && { n: cart.item_count, t: cart.total_price, c: cart.currency } })
  const soldOut = await add(ada, tv("S", "Sand").id, 1)
  const over = await add(ada, tv("M", "Black").id, 3)
  const lastOne = await add(ada, tv("L", "Black").id, 2)
  cart = await cartOf(ada)
  check("  S Sand refused (sold out), three more M Black refused (4 per order), two L Black refused (1 left)", soldOut.status === 422 && over.status === 422 && lastOne.status === 422 && cart?.item_count === 3, { soldOut: [soldOut.status, soldOut.json], over: [over.status, over.json], lastOne: [lastOne.status, lastOne.json], n: cart?.item_count })
  const lineKey = (cart?.items ?? []).find((i: any) => i.variant_id === tv("L", "Sand").id)?.key
  const ch = await site(ada, "POST", "/cart/change.js", { id: lineKey, quantity: 2 }, ajax)
  cart = await cartOf(ada)
  check("  /cart/change.js: L Sand to two, 2 x 29 + 2 x 32 = 122 EUR", ch.status === 200 && cart?.item_count === 4 && cart?.total_price === 12200, { ch: ch.status, cart: cart && [cart.item_count, cart.total_price] })
  await site(ada, "POST", "/cart/change.js", { id: lineKey, quantity: 3 }, ajax)
  cart = await cartOf(ada)
  check("  to three: held at two, the tee's 4 per order counts every size and colour", cart?.item_count === 4 && cart?.total_price === 12200, cart && [cart.item_count, cart.total_price])
  const rm = await site(ada, "POST", "/cart/change.js", { id: lineKey, quantity: 0 }, ajax)
  cart = await cartOf(ada)
  check("  and to none: the line is gone, 58 EUR left", rm.status === 200 && cart?.items?.length === 1 && cart?.total_price === 5800, { rm: rm.status, cart: cart && [cart.items?.length, cart.total_price] })
  const page2 = await site(ada, "GET", "/cart")
  check("  the cart page draws the line from the same cookie", page2.status === 200 && /Organic Tee/.test(String(page2.json)) && /Size: M Colour: Black/.test(words(String(page2.json))) && /€58\.00/.test(words(String(page2.json))), words(String(page2.json)).match(/Organic Tee.{0,200}/)?.[0])

  /*
    No PayPal badge on the cart or the product page (round 57): Storelib's checkout takes cards, Apple Pay and
    Google Pay only, and Materia showed PayPal by default in the cart drawer, the cart page and the product page.
  */
  const cartHtml = String(page2.json).replace(/\s+/g, " ")
  if (process.env.R57_DUMP) (await import("node:fs")).writeFileSync(process.env.R57_DUMP + "/cart.html", String(page2.json))
  /* A PayPal mark that shows: its title or label, once the cart's badges switched off (`hidden`) are taken out. */
  const paypalShown = (h: string) => /<title>PayPal<\/title>|aria-label="PayPal"/.test(h.replace(/<span class="lcs-badge" data-lcs-badge="\w+" hidden>.*?<\/span>/g, ""))
  check("  no PayPal badge in Materia's cart or on the product page: the checkout cannot take it", !paypalShown(cartHtml) && !paypalShown(flat), { cart: cartHtml.match(/.{0,200}paypal.{0,200}/i)?.[0], pdp: flat.match(/.{0,200}paypal.{0,200}/i)?.[0] })
  const est = await site(ada, "GET", "/cart/shipping_rates.json?shipping_address%5Bcountry%5D=Germany&shipping_address%5Bzip%5D=20095", undefined, ajax)
  const estJson = typeof est.json === "string" ? JSON.parse(est.json) : est.json
  check("  Materia's Estimate shipping for Germany: Standard at 4.90, the checkout's own rate", est.status === 200 && (estJson?.shipping_rates ?? []).map((r: any) => `${r.name}:${r.price}`).join(",") === "Standard:4.90", { status: est.status, body: estJson })
  const estUs = await site(ada, "GET", "/cart/shipping_rates.json?shipping_address%5Bcountry%5D=United%20States&shipping_address%5Bzip%5D=10001", undefined, ajax)
  const estUsJson = typeof estUs.json === "string" ? JSON.parse(estUs.json) : estUs.json
  check("  and for the US: no rate, said as Shopify says it", (estUs.status === 422 || estUs.status === 200) && (estUsJson?.shipping_rates ?? []).length === 0, { status: estUs.status, body: estUsJson })

  section("A. Two M Black tees to Germany: Standard 4.90 EUR, VAT 19% on top")
  const go = await site(ada, "POST", "/cart", "updates%5B%5D=2&checkout=")
  const to = new URL(go.location ?? "/", `https://${HOST}`)
  const params = readSiteCheckoutParams(to.searchParams)
  check("Check out on the theme's cart goes to the website's own checkout on this host, with the line", (go.status === 302 || go.status === 303) && to.host === HOST && to.pathname === "/checkout" && params.items.length === 1 && params.items[0].variantId === tv("M", "Black").id && params.items[0].quantity === 2, { status: go.status, to: to.toString(), items: params.items })
  const items = params.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity }))
  const qa = await checkout(ada, { action: "quote", items, country: "DE", postalCode: "20095", city: "Hamburg" })
  const de = qa.json?.totals
  check("the quote: 58 EUR, Standard 4.90 EUR (free starts at 60), VAT 19% of 62.90 = 11.95 EUR, 74.85 EUR", qa.status === 200 && qa.json?.currency === "EUR" && (qa.json?.delivery?.options ?? []).map((o: any) => `${o.name}:${o.priceCents}`).join(",") === "Standard:490" && de?.itemsSubtotalCents === 5800 && de?.shippingCents === 490 && de?.taxCents === 1195 && de?.totalCents === 7485, { delivery: qa.json?.delivery, totals: de })
  const orderA = await pay(ada, { items, email: "ada@example.com", first: "Ada", last: "Achter", address: { line1: "Mönckebergstr. 7", city: "Hamburg", postalCode: "20095", country: "DE" }, key: "r57-a-ada-0001", option: qa.json?.delivery?.selectedId })
  /* What was charged, what the order says, and the stock: the same numbers. */
  const charged = (r: { intent: any }) => ({ amount: r.intent?.amount, currency: r.intent?.currency, to: r.intent?.transfer_data?.destination })
  const totalsOf = (co: any) => co && { sub: co.items_subtotal_cents, disc: co.discount_cents, ship: co.shipping_cents, shipDisc: co.shipping_discount_cents, tax: co.tax_cents, total: co.total_cents, cur: co.currency, status: co.status, rate: co.shipping_rate?.name, tax_country: co.shipping_rate?.tax_country }
  check("paid: Stripe charged 74.85 EUR to the seller's account, the order says the same", orderA.intent?.amount === 7485 && orderA.intent?.currency === "eur" && orderA.intent?.transfer_data?.destination === acct && JSON.stringify(totalsOf(orderA.co)) === JSON.stringify({ sub: 5800, disc: 0, ship: 490, shipDisc: 0, tax: 1195, total: 7485, cur: "EUR", status: "paid", rate: "Standard", tax_country: "DE" }), { charged: charged(orderA), co: totalsOf(orderA.co), intent: orderA.intentAnswer.json })
  check("  one order line: two M Black at 29 EUR, its SKU, the address in Hamburg", orderA.lines.length === 1 && orderA.lines[0].variant_id === tv("M", "Black").id && orderA.lines[0].quantity === 2 && orderA.lines[0].unit_price_cents === 2900 && orderA.lines[0].amount_cents === 7485 && orderA.co?.lines?.[0]?.sku === "TEE-M-BLK" && orderA.co?.shipping_address?.city === "Hamburg" && orderA.co?.shipping_address?.country === "DE", orderA.lines.map((o) => [o.variant_id, o.quantity, o.unit_price_cents, o.amount_cents]))
  check("  the stock: two of six M Black committed once, the hold sold", level("M", "Black").on_hand === 6 && level("M", "Black").committed === 2 && j.rows("inventory_reservations").filter((r) => r.checkout_id === orderA.co?.id).map((r) => `${r.status}:${r.quantity}`).join(",") === "sold:2", { level: level("M", "Black"), res: j.rows("inventory_reservations").filter((r) => r.checkout_id === orderA.co?.id) })
  check("  the thanks page is on the website, and the theme's cart is emptied", typeof orderA.confirm?.json?.thanks === "string" && orderA.confirm.json.thanks.startsWith("/checkout/thanks/") && /sl_theme_cart=;/.test(String(orderA.confirm?.headers.get("set-cookie") ?? "")), { thanks: orderA.confirm?.json?.thanks, cookie: orderA.confirm?.headers.get("set-cookie") })
  const sellerOrder = await j.call(`GET /api/physical/orders/${orderA.co?.id}`, { as: seller })
  const so = sellerOrder.json?.order
  if (process.env.R57_DUMP) (await import("node:fs")).writeFileSync(process.env.R57_DUMP + "/seller-order.json", JSON.stringify(so, null, 1))
  check("  the seller's order in /app says 58, 4.90, 11.95, 74.85 EUR and Standard", sellerOrder.status === 200 && JSON.stringify(so).includes("7485") && JSON.stringify(so).includes("1195"), { status: sellerOrder.status, keys: Object.keys(so ?? {}).slice(0, 60) })
  const replayed = await j.webhook("payment_intent.succeeded", orderA.intent)
  check("  Stripe sending the webhook again changes nothing: one order line, two committed", replayed.status === 200 && j.rows("orders").filter((o) => o.checkout_id === orderA.co?.id).length === 1 && level("M", "Black").committed === 2, { status: replayed.status, lines: j.rows("orders").filter((o) => o.checkout_id === orderA.co?.id).length, level: level("M", "Black") })

  section("A2. To France, by weight: an L Sand tee and the blanket (2.08 kg), VAT 20%")
  const bea = visitor("198.51.100.20", "FR")
  const blanketVariant = j.rows("product_variants").find((v) => v.product_id === blanket)!.id as string
  await add(bea, tv("L", "Sand").id, 1)
  await add(bea, blanketVariant, 1)
  const handoff = async (v: Visitor) => readSiteCheckoutParams(new URL((await site(v, "POST", "/cart", "checkout=")).location ?? "/", `https://${HOST}`).searchParams)
  const beaItems = (await handoff(bea)).items
  const qb = await checkout(bea, { action: "quote", items: beaItems, country: "FR", postalCode: "75001", city: "Paris" })
  const fr = qb.json?.totals
  check("the quote: 32 + 89 EUR, Colissimo 14.90 EUR (over 1 kg), VAT 20% of 135.90 = 27.18 EUR, 163.08 EUR", qb.status === 200 && (qb.json?.delivery?.options ?? []).map((o: any) => `${o.name}:${o.priceCents}`).join(",") === "Colissimo:1490" && fr?.itemsSubtotalCents === 12100 && fr?.shippingCents === 1490 && fr?.taxCents === 2718 && fr?.totalCents === 16308, { delivery: qb.json?.delivery, totals: fr, issues: qb.json?.stockIssues, items: beaItems })
  const orderB = await pay(bea, { items: beaItems, email: "bea@example.fr", first: "Bea", last: "Blanc", address: { line1: "1 rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" }, key: "r57-a2-bea-0001", option: qb.json?.delivery?.selectedId })
  const blanketLevel = () => j.rows("inventory_levels").find((l) => l.variant_id === blanketVariant) ?? { on_hand: 0, committed: 0 }
  check("  paid 163.08 EUR; the blanket sold with none on hand (Continue selling), one committed", orderB.intent?.amount === 16308 && orderB.co?.status === "paid" && orderB.co?.tax_cents === 2718 && orderB.co?.shipping_rate?.tax_country === "FR" && orderB.lines.length === 2 && blanketLevel().committed === 1, { charged: charged(orderB), co: totalsOf(orderB.co), err: orderB.intentAnswer.json?.error, blanket: blanketLevel() })

  section("B. A download alone: no address, no delivery, VAT on it")
  const bookVariant = (j.rows("product_variants").find((v) => v.product_id === book)?.id as string | undefined) ?? book
  const cleo = visitor("198.51.100.30", "DE")
  await add(cleo, bookVariant, 1)
  const cleoItems = (await handoff(cleo)).items
  const qc = await checkout(cleo, { action: "quote", items: cleoItems, country: "DE" })
  check("the quote: 12 EUR, nothing to deliver, VAT 19% = 2.28 EUR, 14.28 EUR", qc.status === 200 && qc.json?.requiresShipping === false && (qc.json?.totals?.shippingCents ?? 0) === 0 && qc.json?.totals?.taxCents === 228 && qc.json?.totals?.totalCents === 1428, { kind: qc.json?.kind, ship: qc.json?.requiresShipping, totals: qc.json?.totals, err: qc.json?.error, items: cleoItems })
  const orderC = await pay(cleo, { items: cleoItems, email: "cleo@example.com", first: "Cleo", last: "Cramer", address: null, key: "r57-b-cleo-0001" })
  const cleoLines = j.rows("orders").filter((o) => o.buyer_email === "cleo@example.com")
  check("  paid 14.28 EUR, one order for the book with its tax, no shipping", orderC.intent?.amount === 1428 && cleoLines.length === 1 && cleoLines[0].product_id === book && cleoLines[0].amount_cents === 1428 && Number(cleoLines[0].tax_cents ?? 0) === 228 && !Number(cleoLines[0].shipping_cents ?? 0) && cleoLines[0].status === "completed", { charged: charged(orderC), err: orderC.intentAnswer.json, lines: cleoLines.map((o) => [o.product_id === book, o.amount_cents, o.tax_cents, o.shipping_cents, o.status]) })

  section("C. A mixed cart: an S Black tee and the book, one payment")
  const dan = visitor("198.51.100.40", "DE")
  await add(dan, tv("S", "Black").id, 1)
  await add(dan, bookVariant, 1)
  const danItems = (await handoff(dan)).items
  const qd = await checkout(dan, { action: "quote", items: danItems, country: "DE", postalCode: "10115", city: "Berlin" })
  check("the quote: 29 + 12 EUR, Standard 4.90 EUR, VAT 19% of 45.90 = 8.72 EUR, 54.62 EUR", qd.status === 200 && qd.json?.totals?.itemsSubtotalCents === 4100 && qd.json?.totals?.shippingCents === 490 && qd.json?.totals?.taxCents === 872 && qd.json?.totals?.totalCents === 5462, { totals: qd.json?.totals, err: qd.json?.error })
  const orderD = await pay(dan, { items: danItems, email: "dan@example.com", first: "Dan", last: "Dorn", address: { line1: "Unter den Linden 1", city: "Berlin", postalCode: "10115", country: "DE" }, key: "r57-c-dan-0001", option: qd.json?.delivery?.selectedId })
  const danLines = j.rows("orders").filter((o) => o.checkout_id === orderD.co?.id)
  check("  paid 54.62 EUR once; two lines (the tee shipped, the book a download); their tax adds to 8.72", orderD.intent?.amount === 5462 && orderD.co?.total_cents === 5462 && danLines.length === 2 && danLines.some((o) => o.product_id === book && o.requires_shipping === false) && danLines.some((o) => o.product_id === tee && o.requires_shipping === true) && danLines.reduce((n, o) => n + Number(o.tax_cents ?? 0), 0) === 872, { charged: charged(orderD), co: totalsOf(orderD.co), lines: danLines.map((o) => [o.product_id === book ? "book" : "tee", o.amount_cents, o.tax_cents, o.shipping_cents, o.requires_shipping]) })

  section("D. Free shipping from 60 EUR: two L Sand tees")
  const eve = visitor("198.51.100.50", "DE")
  await add(eve, tv("L", "Sand").id, 2)
  const eveItems = (await handoff(eve)).items
  const qe = await checkout(eve, { action: "quote", items: eveItems, country: "DE", postalCode: "80331", city: "München" })
  const freeOpt = (qe.json?.delivery?.options ?? []).find((o: any) => o.priceCents === 0)
  check("the quote: 64 EUR offers Free shipping at 0 beside Standard", qe.status === 200 && !!freeOpt && freeOpt.name === "Free shipping" && (qe.json?.delivery?.options ?? []).some((o: any) => o.name === "Standard" && o.priceCents === 490), qe.json?.delivery)
  const qe2 = await checkout(eve, { action: "quote", items: eveItems, country: "DE", postalCode: "80331", city: "München", deliveryOptionId: freeOpt?.id })
  const orderE = await pay(eve, { items: eveItems, email: "eve@example.com", first: "Eve", last: "Engel", address: { line1: "Marienplatz 1", city: "München", postalCode: "80331", country: "DE" }, key: "r57-d-eve-0001", option: freeOpt?.id })
  check("  chosen: 64 EUR, shipping 0, VAT 12.16 EUR, paid 76.16 EUR", qe2.json?.totals?.shippingCents === 0 && qe2.json?.totals?.totalCents === 7616 && orderE.intent?.amount === 7616 && orderE.co?.shipping_cents === 0 && orderE.co?.shipping_rate?.name === "Free shipping", { q: qe2.json?.totals, charged: charged(orderE), co: totalsOf(orderE.co) })

  section("E. The US, outside every zone")
  const gus = visitor("203.0.113.60", "US")
  await add(gus, tv("S", "Black").id, 1)
  const gusItems = (await handoff(gus)).items
  const qg = await checkout(gus, { action: "quote", items: gusItems, country: "US", postalCode: "10001", region: "NY", city: "New York" })
  check("the quote says it does not ship there and offers nothing", qg.status === 200 && qg.json?.delivery?.ok === false && (qg.json?.delivery?.options ?? []).length === 0 && Array.isArray(qg.json?.shipsTo) && !qg.json.shipsTo.includes("US"), qg.json?.delivery)
  const intentsBefore = j.world.intents.size
  const holdsBefore = j.rows("inventory_reservations").length
  const gusPay = await checkout(gus, { action: "intent", items: gusItems, email: "gus@example.com", firstName: "Gus", lastName: "Gray", agreedToTerms: true, clientKey: "r57-e-gus-0001", paymentMethods: ["card"], address: { line1: "1 Broadway", city: "New York", postalCode: "10001", region: "NY", country: "US" }, deliveryOptionId: j.rows("shipping_rates").find((r) => r.name === "Standard")?.id, shownTotal: { cents: 3451, currency: "EUR" } })
  check("  Pay is refused before Stripe: no PaymentIntent, no stock held", gusPay.status >= 400 && gusPay.status < 500 && j.world.intents.size === intentsBefore && j.rows("inventory_reservations").length === holdsBefore, { status: gusPay.status, body: gusPay.json, intents: j.world.intents.size - intentsBefore })

  section("F. A 10% code typed in Materia's cart")
  const code = await j.call("POST /api/coupons", { as: seller, body: { code: "NORD10", discount_type: "percentage", discount_value: 10 } })
  check("Discounts: NORD10, 10% off, saved", code.status === 200 || code.status === 201, code.json)
  const fay = visitor("198.51.100.70", "DE")
  await add(fay, tv("L", "Sand").id, 2)
  const typed = await site(fay, "POST", "/cart/update.js", { discount: "NORD10" }, ajax)
  const fayCart = await cartOf(fay)
  check("/cart/update.js takes the code: 64 EUR less 6.40 EUR is 57.60 EUR in the cart", typed.status === 200 && fayCart?.total_price === 5760 && (fayCart?.discount_codes ?? []).some((d: any) => d.code === "NORD10" && d.applicable === true), { status: typed.status, total: fayCart?.total_price, codes: fayCart?.discount_codes })
  const fayParams = await handoff(fay)
  check("  Check out carries the code to the website's checkout", fayParams.couponCode === "NORD10", fayParams)
  const qf = await checkout(fay, { action: "quote", items: fayParams.items, couponCode: fayParams.couponCode, country: "DE", postalCode: "50667", city: "Köln" })
  const ff = qf.json?.totals
  check("  the quote: 6.40 EUR off, 57.60 EUR is under 60 so no free shipping, Standard 4.90, VAT 19% per part (10.94 on 57.60, 0.93 on 4.90) = 11.87 EUR, 74.37 EUR", qf.status === 200 && ff?.discountCents === 640 && (qf.json?.delivery?.options ?? []).map((o: any) => `${o.name}:${o.priceCents}`).join(",") === "Standard:490" && ff?.taxCents === 1187 && ff?.totalCents === 7437, { delivery: qf.json?.delivery, totals: ff, coupon: qf.json?.coupon, err: qf.json?.couponError })
  const orderF = await pay(fay, { items: fayParams.items, code: "NORD10", email: "fay@example.com", first: "Fay", last: "Fink", address: { line1: "Domkloster 4", city: "Köln", postalCode: "50667", country: "DE" }, key: "r57-f-fay-0001", option: qf.json?.delivery?.selectedId })
  check("  paid 74.37 EUR; the order keeps the code and 6.40 EUR off", orderF.intent?.amount === 7437 && orderF.co?.discount_cents === 640 && orderF.co?.coupon_code === "NORD10" && orderF.co?.total_cents === 7437, { charged: charged(orderF), co: totalsOf(orderF.co), code: orderF.co?.coupon_code, err: orderF.intentAnswer.json })

  section("G. Other currencies: a visitor in the UK shown and charged in GBP; one in Switzerland shown CHF")
  const zGb = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["GB"], name: "United Kingdom" } })
  const rGb = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone("GB"), kind: "flat", name: "Royal Mail", priceCents: 1200, minDays: 3, maxDays: 6 } })
  const today = new Date().toISOString().slice(0, 10)
  j.db.insert("fx_rates", { as_of: today, base: "EUR", rates: { CHF: CHF_PER_EUR, USD: 1.08, GBP: GBP_PER_EUR }, source: "ecb", fetched_at: new Date().toISOString() }, {})
  const m0 = await j.call("GET /api/store/markets", { as: seller })
  const home = (m0.json?.localization?.markets ?? []).find((m: any) => m.primary)
  const put = await j.call("PUT /api/store/markets", { as: seller, body: { localization: { ...m0.json?.localization, markets: [{ ...home, countries: ["DE"] }, { id: "uk", name: "United Kingdom", countries: ["GB"], currency: "GBP", language: null, active: true, primary: false, rounding: "none", adjustBps: 0 }, { id: "ch", name: "Switzerland", countries: ["CH"], currency: "CHF", language: null, active: true, primary: false, rounding: "none", adjustBps: 0 }] } } })
  check("Markets: the UK in GBP and Switzerland in CHF saved, a UK zone with Royal Mail at 12 EUR", zGb.status === 200 && rGb.status === 200 && put.status === 200 && (put.json?.localization?.markets ?? []).filter((m: any) => m.currency === "GBP" || m.currency === "CHF").length === 2, { status: put.status, body: put.json })
  const ian = visitor("198.51.100.80", "GB", "uk")
  const ukPage = await site(ian, "GET", "/products/organic-tee")
  const ukFlat = String(ukPage.json ?? "").replace(/\s+/g, " ")
  /* 29 EUR at 0.85 is 24.65 GBP; 39 EUR is 33.15 GBP; 32 EUR is 27.20 GBP. */
  check("the tee's page in GBP: 24.65 with 33.15 struck through", ukPage.status === 200 && /price--special">\s*£24\.65/.test(ukFlat) && /compare-price[^>]*>£33\.15/.test(ukFlat), ukFlat.match(/price--special.{0,200}/)?.[0])
  const ukJs = await site(ian, "GET", "/products/organic-tee.js", undefined, ajax)
  const uj = typeof ukJs.json === "string" ? JSON.parse(ukJs.json) : ukJs.json
  check("  its .js in pence too, so Materia's script shows the page's prices on a variant change", (uj?.variants ?? []).find((v: any) => v.option1 === "L" && v.option2 === "Black")?.price === 2720, (uj?.variants ?? []).map((v: any) => [v.title, v.price]))
  await add(ian, tv("S", "Black").id, 1)
  const ianCart = await cartOf(ian)
  check("  the cart in GBP: 24.65", ianCart?.currency === "GBP" && ianCart?.total_price === 2465, ianCart && { cur: ianCart.currency, total: ianCart.total_price })
  const ianItems = (await handoff(ian)).items
  const qi = await checkout(ian, { action: "quote", items: ianItems, country: "GB", postalCode: "SW1A 1AA", city: "London" })
  check("  the quote in GBP: 24.65 + Royal Mail 10.20, no VAT set for the UK, 34.85 GBP", qi.status === 200 && qi.json?.currency === "GBP" && qi.json?.totals?.itemsSubtotalCents === 2465 && qi.json?.totals?.shippingCents === 1020 && qi.json?.totals?.taxCents === 0 && qi.json?.totals?.totalCents === 3485, { cur: qi.json?.currency, totals: qi.json?.totals, delivery: qi.json?.delivery })
  const orderG = await pay(ian, { items: ianItems, email: "ian@example.co.uk", first: "Ian", last: "Irving", address: { line1: "10 Downing St", city: "London", postalCode: "SW1A 2AA", country: "GB" }, key: "r57-g-ian-0001", option: qi.json?.delivery?.selectedId })
  check("  Stripe charged 34.85 GBP, and the order is in GBP with the same numbers", orderG.intent?.amount === 3485 && orderG.intent?.currency === "gbp" && orderG.co?.currency === "GBP" && orderG.co?.total_cents === 3485 && orderG.co?.shipping_cents === 1020, { charged: charged(orderG), co: totalsOf(orderG.co), err: orderG.intentAnswer.json })
  const hans = visitor("198.51.100.81", "CH", "ch")
  const chFlat = String((await site(hans, "GET", "/products/organic-tee")).json ?? "").replace(/\s+/g, " ")
  check("a visitor in Switzerland sees CHF 27.26 (29 EUR at 0.94) on the page", /price--special">\s*(CHF\s?27\.26|27\.26\s?CHF)/.test(chFlat), chFlat.match(/price--special.{0,200}/)?.[0])
  await add(hans, tv("S", "Black").id, 1)
  const qh = await checkout(hans, { action: "quote", items: (await handoff(hans)).items, country: "CH", postalCode: "8001", city: "Zürich" })
  /* Storelib has no fee rule for CHF (lib/payments/fees/currency-rules.ts), so the checkout charges the store's own currency and says so (lib/markets/checkout-charge.ts). */
  check("  CHF has no fee rule, so the checkout quotes and charges the store's own 29 + 15 EUR, never a CHF figure it cannot take", qh.status === 200 && qh.json?.currency === "EUR" && qh.json?.totals?.totalCents === 4400, { cur: qh.json?.currency, totals: qh.json?.totals })

  section("H. Stock: the last L Black bought twice at once, a declined card, an expired hold")
  const ivy = visitor("198.51.100.90", "DE")
  const jon = visitor("198.51.100.91", "DE")
  await add(ivy, tv("L", "Black").id, 1)
  await add(jon, tv("L", "Black").id, 1)
  const ivyItems = (await handoff(ivy)).items
  const jonItems = (await handoff(jon)).items
  const at = { line1: "Königsallee 1", city: "Düsseldorf", postalCode: "40212", country: "DE" }
  const std = j.rows("shipping_rates").find((r) => r.name === "Standard")?.id as string
  const [ri, rj] = await Promise.all([
    checkout(ivy, { action: "intent", items: ivyItems, email: "ivy@example.com", firstName: "Ivy", lastName: "Iser", agreedToTerms: true, clientKey: "r57-h-ivy-0001", paymentMethods: ["card"], address: at, deliveryOptionId: std, shownTotal: { cents: 4391, currency: "EUR" } }),
    checkout(jon, { action: "intent", items: jonItems, email: "jon@example.com", firstName: "Jon", lastName: "Jahn", agreedToTerms: true, clientKey: "r57-h-jon-0001", paymentMethods: ["card"], address: at, deliveryOptionId: std, shownTotal: { cents: 4391, currency: "EUR" } }),
  ])
  const won = [ri, rj].filter((r) => r.status === 200 && r.json?.paymentIntentId)
  check("two buyers press Pay for the last one together: one gets a payment, the other is told it sold out", won.length === 1 && [ri, rj].some((r) => r.status >= 400 && r.status < 500), [ri, rj].map((r) => [r.status, r.json?.error ?? r.json?.paymentIntentId]))
  check("  one held, never two: committed 1 of 1", level("L", "Black").committed === 1 && level("L", "Black").on_hand === 1, level("L", "Black"))
  const winner = won[0] === ri ? ivy : jon
  const winnerKey = won[0] === ri ? "r57-h-ivy-0001" : "r57-h-jon-0001"
  const pi = won[0]?.json?.paymentIntentId as string
  if (pi) {
    const failedPi = j.world.intents.get(pi)!
    const declined = await j.webhook("payment_intent.payment_failed", { ...failedPi, status: "requires_payment_method", last_payment_error: { code: "card_declined", decline_code: "insufficient_funds", message: "Your card has insufficient funds." } })
    check("  the winner's card is declined: the stock stays held for them to try another card", declined.status === 200 && level("L", "Black").committed === 1, { status: declined.status, level: level("L", "Black") })
    const co = j.rows("commerce_checkouts").find((x) => x.client_key === winnerKey)!
    for (const r of j.rows("inventory_reservations").filter((r) => r.checkout_id === co.id)) r.expires_at = new Date(Date.now() - 60_000).toISOString()
    co.expires_at = new Date(Date.now() - 60_000).toISOString()
    await j.cron()
    check("  they never pay: the hold lapses, the cron gives it back (committed 0), the checkout is not paid", level("L", "Black").committed === 0 && level("L", "Black").on_hand === 1 && j.rows("commerce_checkouts").find((x) => x.id === co.id)?.status !== "paid", { level: level("L", "Black"), status: j.rows("commerce_checkouts").find((x) => x.id === co.id)?.status, res: j.rows("inventory_reservations").filter((r) => r.checkout_id === co.id).map((r) => r.status) })
    await j.webhook("payment_intent.canceled", { ...failedPi, status: "canceled" })
    check("  Stripe cancelling the payment after that gives nothing back twice", level("L", "Black").committed === 0 && level("L", "Black").on_hand === 1, level("L", "Black"))
    const again = await pay(winner === ivy ? jon : ivy, { items: winner === ivy ? jonItems : ivyItems, email: "late@example.com", first: "Lea", last: "Late", address: at, key: "r57-h-late-0001", option: std })
    check("  the one who was told it sold out can now buy it: paid, committed 1 of 1", again.co?.status === "paid" && level("L", "Black").committed === 1, { co: totalsOf(again.co), err: again.intentAnswer.json, level: level("L", "Black") })
    const gone = await add(visitor("198.51.100.92", "DE"), tv("L", "Black").id, 1)
    check("  and Materia's cart now refuses L Black (sold out)", gone.status === 422, { status: gone.status, body: gone.json })
  }

  section("S. The seller changes a rate in /app: the next buyer pays the new one")
  const stdRate = j.rows("shipping_rates").find((r) => r.name === "Standard")!
  const edited = await j.call(`PATCH /api/physical/shipping/rates/${stdRate.id}`, { as: seller, body: { kind: "flat", name: "Standard", priceCents: 590, minDays: 1, maxDays: 3 } })
  const kim = visitor("198.51.100.95", "DE")
  await add(kim, tv("M", "Sand").id, 1)
  const kimItems = (await handoff(kim)).items
  const qk = await checkout(kim, { action: "quote", items: kimItems, country: "DE", postalCode: "20095" })
  check("Standard moved to 5.90 EUR in Settings > Shipping: the website's checkout quotes 5.90 EUR", edited.status === 200 && (qk.json?.delivery?.options ?? []).some((o: any) => o.name === "Standard" && o.priceCents === 590), { edit: [edited.status, edited.json], delivery: qk.json?.delivery })
  const kimPay = await pay(kim, { items: kimItems, email: "kim@example.com", first: "Kim", last: "Kurz", address: { line1: "Jungfernstieg 1", city: "Hamburg", postalCode: "20095", country: "DE" }, key: "r57-s-kim-0001", option: stdRate.id })
  /* 29 + 5.90 = 34.90, VAT 19% per part: 5.51 + 1.12 = 6.63, 41.53. */
  check("  and is charged it: 29 + 5.90 EUR + 6.63 EUR VAT = 41.53 EUR", kimPay.intent?.amount === 4153 && kimPay.co?.shipping_cents === 590 && kimPay.co?.total_cents === 4153, { charged: charged(kimPay), co: totalsOf(kimPay.co), err: kimPay.intentAnswer.json })
  const freeRate = j.rows("shipping_rates").find((r) => r.name === "Free shipping")!
  const removed = await j.call(`DELETE /api/physical/shipping/rates/${freeRate.id}`, { as: seller })
  const lou = visitor("198.51.100.96", "DE")
  await add(lou, tv("L", "Sand").id, 2)
  const louItems = (await handoff(lou)).items
  const ql = await checkout(lou, { action: "quote", items: louItems, country: "DE", postalCode: "20095" })
  check("Free shipping deleted: 64 EUR to Germany is offered Standard only", removed.status === 200 && (ql.json?.delivery?.options ?? []).map((o: any) => o.name).join(",") === "Standard", { removed: removed.status, delivery: ql.json?.delivery })
  const zoneFr = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("FR"))!
  const moved = await j.call(`PATCH /api/physical/shipping/zones/${zoneFr.id}`, { as: seller, body: { countries: ["IT"], name: "Italy" } })
  const quoteFr = await checkout(lou, { action: "quote", items: louItems, country: "FR", postalCode: "75001" })
  const quoteIt = await checkout(lou, { action: "quote", items: louItems, country: "IT", postalCode: "00100" })
  const intentFr = await checkout(lou, { action: "intent", items: louItems, email: "lou@example.com", firstName: "Lou", lastName: "Lenz", agreedToTerms: true, clientKey: "r57-s-lou-fr-01", paymentMethods: ["card"], address: { line1: "2 rue de Rivoli", city: "Paris", postalCode: "75001", country: "FR" }, deliveryOptionId: j.rows("shipping_rates").find((r) => r.name === "Colissimo")?.id, shownTotal: { cents: 9000, currency: "EUR" } })
  check("France taken out of its zone: no delivery to France, Italy still Colissimo, and Pay to Paris refused with the old rate's id", moved.status === 200 && quoteFr.json?.delivery?.ok === false && (quoteIt.json?.delivery?.options ?? []).some((o: any) => o.name === "Colissimo") && intentFr.status >= 400 && intentFr.status < 500 && !intentFr.json?.paymentIntentId, { moved: [moved.status, moved.json?.error], fr: quoteFr.json?.delivery, it: quoteIt.json?.delivery, intent: [intentFr.status, intentFr.json] })

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  check("no after() work threw", j.afterErrors.length === 0, j.afterErrors)
  if (fails.length) console.log("\nFailed:\n  " + fails.join("\n  "))
  console.log(`\n${passed} passed, ${failed} failed`)
  if (process.env.COMMERCE_R57_SERVE) await serve(j, site, visitor, { tee, sBlack: tv("S", "Black").id, mBlack: tv("M", "Black").id, lSand: tv("L", "Sand").id })
  if (failed) process.exit(1)
}

/**
 * THE STORE OVER HTTP, for scripts/check-commerce-e2e-r57.mjs: every request
 * a browser makes to http://localhost:<port> goes to the website as the proxy
 * hands it on (the same `site` call the suite uses), with the browser's own
 * cookies. x-r57-country names where the browser is (GB is the UK market).
 * The theme's files go to the assets route. /checkout is answered with the
 * address it was asked at, so the script can read what Check out sent.
 */
async function serve(j: Journey, site: (v: Visitor, method: string, path: string, body?: Record<string, unknown> | string, extra?: Record<string, string>) => Promise<Answer>, visitor: (ip: string, country: string, market?: string | null) => Visitor, facts: Record<string, string>) {
  const { createServer } = await import("node:http")
  const server = createServer(async (req, res) => {
    try {
      const url = req.url ?? "/"
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const raw = Buffer.concat(chunks).toString("utf8")
      if (url.startsWith("/__facts")) {
        res.writeHead(200, { "content-type": "application/json" })
        return res.end(JSON.stringify(facts))
      }
      if (url.startsWith("/checkout")) {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
        return res.end(`<!doctype html><title>Checkout</title><pre id="asked">${url.replace(/</g, "&lt;")}</pre>`)
      }
      if (/^\/(?:__media|_next|cdn)\//.test(url) || url.includes("cdn.example.com")) {
        res.writeHead(404)
        return res.end()
      }
      const country = String(req.headers["x-r57-country"] ?? "DE")
      const v = visitor(String(req.headers["x-forwarded-for"] ?? "198.51.100.200"), country, country === "GB" ? "uk" : null)
      for (const part of String(req.headers.cookie ?? "").split(/;\s*/)) {
        const at = part.indexOf("=")
        if (at > 0) v.jar.set(part.slice(0, at), part.slice(at + 1))
      }
      const extra: Record<string, string> = {}
      for (const h of ["x-requested-with", "accept", "content-type"]) if (req.headers[h]) extra[h] = String(req.headers[h])
      let answer: Answer
      if (url.startsWith("/api/site-theme/assets/")) answer = await j.call(`GET ${url}`, { host: HOST })
      else answer = await site(v, String(req.method), url, raw ? raw : undefined, extra)
      const headers: Record<string, string | string[]> = {}
      answer.headers.forEach((value, key) => {
        if (key !== "set-cookie" && key !== "content-length" && key !== "content-encoding") headers[key] = value
      })
      const cookies = (answer.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
      /* Secure cookies are kept by Chromium on localhost; the Domain is the website's, so it is dropped here. */
      if (cookies.length) headers["set-cookie"] = cookies.map((c) => c.replace(/;\s*Domain=[^;]*/i, ""))
      const body = typeof answer.json === "string" ? answer.json : answer.json === null ? "" : JSON.stringify(answer.json)
      res.writeHead(answer.status, headers)
      res.end(body)
    } catch (e) {
      res.writeHead(500, { "content-type": "text/plain" })
      res.end(String(e instanceof Error ? e.stack : e))
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  console.log(`SERVING ${typeof address === "object" && address ? address.port : 0}`)
  await new Promise(() => {})
}

/** Pay on the website's checkout as its page does: intent with the address, Stripe's card confirm, the page's confirm and Stripe's webhook. */
interface Buy {
  items: { productId: string; variantId: string | null; quantity: number }[]
  email: string
  first: string
  last: string
  address: Record<string, string> | null
  key: string
  option?: string | null
  code?: string
  fail?: boolean
}
let payWith: (v: Visitor, b: Buy) => Promise<{ intentAnswer: Answer; co: any; lines: any[]; intent: any; confirm: Answer | null }>

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}, made in Hamburg.</p>`, status: "published", price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
