/**
 * ===========================================================================
 *  ROUND 58 (f5): EVERY KIND OF OFFER, FROM THE MODAL TO THE CHARGE
 * ===========================================================================
 * The owner: "make the backend smart and 100% working ... walk every offer
 * type end to end ... never trust a client-sent price."
 *
 * One dollar store over the journey harness (tests/_journey: the in-memory
 * PostgREST built from the repository's SQL, a Stripe world whose webhooks
 * are signed and delivered to the real webhook route). Every offer is made
 * the way the new modal makes it (app/(storelib)/app/offers/offer-draft.ts
 * bodyOf, the body the modal sends) and saved through the real route,
 * POST /api/store/offers. Then each is followed to where a buyer meets it:
 *
 *   BUNDLE          a mug and a cap, 20% off the set
 *   UPSELL          socks offered when a tee is in the cart, $3 off, shown
 *                   at checkout too (an order bump)
 *   BOGO            the tee: buy 2 get 1 free
 *   VOLUME          the tee: buy 4, 15% off each
 *   DOWNLOADS       an ebook and a guide, 50% off together (the creator
 *                   page's and OnePage's product page go to this basket)
 *   FREE SHIPPING   a candle and the mug: the order ships free
 *
 * Surfaces: GET /api/offers (what the creator's product page, OnePage's and
 * Storelib's own product section draw), the Materia website's product page,
 * /cart.js and cart page through the real site route, the website's own
 * checkout (quote, Stripe's PaymentIntent, the order lines), the download
 * basket (priceCart, as /api/checkout/cart and /api/checkout/site price it),
 * and what /app/offers counts as sold. Numbers a browser sends (a price, a
 * discount) are sent on purpose and must change nothing.
 *
 * Run: node scripts/run-push-tests.mjs (or the r57 runner on this file)
 */
import "./_journey/env"
import { Journey, type Answer } from "./_journey/harness"
import { importTemplate } from "../scripts/theme-templates/site"
import { bodyOf, draftOf, type Draft } from "../app/(storelib)/app/offers/offer-draft"
import type { OfferKind } from "../lib/offers/offers"

let passed = 0
let failed = 0
const fails: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else {
    failed++
    fails.push(name)
  }
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 1400)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const words = (html: string) => html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ")

const USERNAME = "honey-house"
const HOST = `${USERNAME}.storelib.com`

interface Visitor {
  jar: Map<string, string>
  ip: string
}

/** What the modal sends for a kind, from its own draft (offer-draft draftOf, then the fields a person changes, then bodyOf). */
function modalBody(kind: OfferKind, patch: Partial<Draft>) {
  return { ...bodyOf({ ...draftOf(null, kind, "USD"), ...patch }, "USD"), formCurrency: "USD" }
}

async function main() {
  const j = await Journey.start()
  const { sealSite, SITE_SEAL_HEADER } = await import("@/lib/storelib-theme/compat/site-seal")
  const { SITE_COUNTRY_HEADER } = await import("@/lib/markets/site-name")
  const { readSiteCheckoutParams } = await import("@/lib/checkout/site-checkout")

  const site = async (v: Visitor, method: string, path: string, body?: Record<string, unknown> | string, extra: Record<string, string> = {}): Promise<Answer> => {
    const seal = await sealSite(USERNAME, HOST)
    const headers: Record<string, string> = { [SITE_SEAL_HEADER]: seal ?? "", "x-forwarded-for": v.ip, "x-vercel-ip-country": "US", [SITE_COUNTRY_HEADER]: "US", origin: `https://${HOST}`, referer: `https://${HOST}/`, ...extra }
    const raw = typeof body === "string" ? body : undefined
    if (raw) headers["content-type"] = headers["content-type"] ?? "application/x-www-form-urlencoded"
    const r = await j.call(`${method} /api/site-theme/site/${USERNAME}${path}`, { host: HOST, headers, cookies: Object.fromEntries(v.jar), body: raw ? undefined : body, raw })
    for (const c of ((r.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []) as string[]) {
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
  const json = (r: Answer) => (typeof r.json === "string" ? JSON.parse(r.json) : r.json)
  const checkout = (v: Visitor, body: Record<string, unknown>) => j.call("POST /api/checkout/site", { host: HOST, headers: { "x-forwarded-for": v.ip, "x-vercel-ip-country": "US", origin: `https://${HOST}` }, cookies: Object.fromEntries(v.jar), body })

  section("1. The seller: a dollar store in the US, payments on, one shipping rate")
  const seller = await j.signUp("hana@honey.example", { name: "Hana Honey" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: USERNAME } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Honey House", supportEmail: "hello@honey.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "business", country: "US", businessName: "Honey House LLC" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  check("payments are on", j.rows("creators")[0].charges_enabled === true)
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const loc = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${loc}`, { as: seller, body: { name: "Barn", kind: "home", addressLine1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  const zone = await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["US"], name: "United States" } })
  const rate = await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone.json?.zone?.id ?? j.rows("shipping_zones")[0].id, kind: "flat", name: "Standard", priceCents: 500, minDays: 2, maxDays: 5 } })
  check("shipping: the US at a flat $5.00", zone.status === 200 && rate.status === 200, [zone.json, rate.json])

  section("2. Products: a tee, a mug, a cap, socks, a candle (shipped) and an ebook and a guide (downloads)")
  const insert = (p: { type: string; title: string; priceCents: number }) => {
    const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const [row] = j.db.insert("products", { creator_id: creator.id, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", price_cents: p.priceCents, thumbnail_url: null, pay_what_you_want: false }, {})
    return row.id as string
  }
  const shipped = async (title: string, priceCents: number) => {
    const id = insert({ type: "physical", title, priceCents })
    const r = await j.call(`PUT /api/physical/products/${id}`, { as: seller, body: { variants: [{ options: [], priceCents, sku: title.toUpperCase(), weightGrams: 200, stock: { [loc]: 40 } }], requiresShipping: true, weightGrams: 200, taxable: true, trackInventory: true, fulfillmentLocationId: loc } })
    if (r.status !== 200) throw new Error(`${title}: ${JSON.stringify(r.json)}`)
    return { id, variant: j.rows("product_variants").find((v) => v.product_id === id)!.id as string }
  }
  const tee = await shipped("Bee Tee", 3000)
  const mug = await shipped("Honey Mug", 2000)
  const cap = await shipped("Bee Cap", 1500)
  const socks = await shipped("Bee Socks", 1000)
  const candle = await shipped("Wax Candle", 1200)
  const ebook = insert({ type: "digital", title: "Bee Book", priceCents: 1200 })
  const guide = insert({ type: "digital", title: "Hive Guide", priceCents: 800 })
  check("seven products, the shipped ones with stock", j.rows("products").length === 7 && j.rows("product_variants").length >= 5)

  section("3. /app/offers: each kind made the way the modal makes it, saved and checked on the server")
  const save = (body: Record<string, unknown>, as = seller) => j.call("POST /api/store/offers", { as, body })
  const bundle = await save(modalBody("bundle", { title: "Mug and cap", productIds: [mug.id, cap.id], discountType: "percent", amount: "20" }))
  const upsell = await save(modalBody("checkout", { title: "Add socks", productIds: [socks.id], condition: "products", triggerIds: [tee.id], discountType: "fixed", amount: "3.00" }))
  const bogo = await save(modalBody("quantity_break", { title: "Buy more tees", productIds: [tee.id], tiers: [
    { quantity: "2", freeQuantity: "1", discountType: "none", value: "", label: "", badge: "Most popular" },
    { quantity: "4", freeQuantity: "0", discountType: "percent", value: "15", label: "", badge: "" },
  ] }))
  const books = await save(modalBody("bundle", { title: "Read both", productIds: [ebook, guide], discountType: "percent", amount: "50" }))
  const ship = await save(modalBody("bundle", { title: "Candle and mug ship free", productIds: [candle.id, mug.id], discountType: "free_shipping", amount: "" }))
  const all = [bundle, upsell, bogo, books, ship]
  check("five offers saved through POST /api/store/offers (bundle, upsell, quantity break, download bundle, free shipping)", all.every((r) => r.status === 200 && typeof r.json?.offer?.id === "string"), all.map((r) => [r.status, r.json?.error]))
  const rows = j.rows("store_offers")
  check("  stored as sent: the upsell's $3.00 as 300 cents, its trigger, every place", rows.find((r) => r.title === "Add socks")?.discount_value === 300 && rows.find((r) => r.title === "Add socks")?.trigger_product_ids?.[0] === tee.id && (rows.find((r) => r.title === "Add socks")?.placements ?? []).join() === "product,cart,checkout", rows.find((r) => r.title === "Add socks"))
  const tiers = rows.find((r) => r.kind === "quantity_break")?.tiers ?? []
  check("  the quantity break's two tiers, each given its own words when the label was left empty", tiers.length === 2 && tiers[0].label === "Buy 2 get 1 free" && tiers[0].badge === "Most popular" && tiers[1].discountValue === 15 && /Buy 4/.test(tiers[1].label), tiers)
  check("  each write is the seller's own store, and logged as their activity", rows.every((r) => r.creator_id === creator.id) && j.rows("store_activity_log").filter((a) => a.action === "offer.added").length >= 5, j.rows("store_activity_log").map((a) => a.action))

  const refused = [
    ["a bundle of one product", modalBody("bundle", { productIds: [mug.id] })],
    ["95% off", modalBody("bundle", { productIds: [mug.id, cap.id], amount: "95" })],
    ["an upsell with no product", modalBody("checkout", { productIds: [] })],
    ["a quantity break whose second tier is smaller", modalBody("quantity_break", { productIds: [tee.id], tiers: [{ quantity: "3", freeQuantity: "1", discountType: "none", value: "", label: "", badge: "" }, { quantity: "2", freeQuantity: "1", discountType: "none", value: "", label: "", badge: "" }] })],
    ["another store's product", modalBody("bundle", { productIds: [mug.id, "f0000000-0000-4000-8000-0000000000ff"] })],
    ["an end before the start", { ...modalBody("bundle", { productIds: [mug.id, cap.id] }), startsAt: "2027-02-01T00:00:00Z", endsAt: "2027-01-01T00:00:00Z" }],
  ] as const
  for (const [what, body] of refused) {
    const before = j.rows("store_offers").length
    const r = await save(body as Record<string, unknown>)
    check(`  refused, with a reason a seller can act on: ${what}`, r.status === 400 && typeof r.json?.error === "string" && j.rows("store_offers").length === before, [r.status, r.json])
  }
  const stranger = await j.signUp("eve@example.com")
  const theirs = await save(modalBody("bundle", { title: "Not mine", productIds: [mug.id, cap.id] }), stranger)
  const nobody = await j.call("POST /api/store/offers", { body: modalBody("bundle", { productIds: [mug.id, cap.id] }) })
  check("  someone without this store, or signed out, cannot write its offers", theirs.status >= 400 && nobody.status >= 400 && !j.rows("store_offers").some((r) => r.title === "Not mine"), [theirs.status, nobody.status])

  /* Edited the way the modal edits: PUT with the id, everything sent again. */
  const bogoId = bogo.json.offer.id as string
  const off = await j.call("PUT /api/store/offers", { as: seller, body: { ...bogo.json.offer, active: false, formCurrency: "USD" } })
  const on = await j.call("PUT /api/store/offers", { as: seller, body: { ...bogo.json.offer, active: true, formCurrency: "USD" } })
  check("  turned off and on again (the modal's Active, the list's Turn off)", off.status === 200 && off.json?.offer?.active === false && on.status === 200 && j.rows("store_offers").find((r) => r.id === bogoId)?.active === true, [off.json, on.json])
  const wrongCurrency = await j.call("PUT /api/store/offers", { as: seller, body: { ...upsell.json.offer, formCurrency: "EUR" } })
  check("  a save typed in another currency than the store's now is refused, not written over", wrongCurrency.status === 409, wrongCurrency.json)

  section("4. Try it in a cart (/api/store/offers/try): the seller's own preview, priced by the checkout's arithmetic")
  const tried = await j.call("POST /api/store/offers/try", { as: seller, body: { offer: modalBody("quantity_break", { productIds: [tee.id] }), items: [{ productId: tee.id, quantity: 3 }] } })
  check("three tees under the starter tiers (2+1 free): $90.00 less $30.00", tried.status === 200 && tried.json?.totalCents === 6000 && tried.json?.savedCents === 3000, tried.json)

  section("5. What product pages read (GET /api/offers): the creator's page, OnePage, Storelib's product section")
  const teeOffers = await j.call(`GET /api/offers?product=${tee.id}`)
  const qb = teeOffers.json?.quantityBreaks?.[0]
  check("the tee: its tiers priced at $30.00 (3 for $60.00, 4 for $102.00)", teeOffers.status === 200 && qb?.tiers?.[0]?.totalCents === 6000 && qb?.tiers?.[1]?.totalCents === 10200, teeOffers.json)
  check("  and the upsell it triggers (socks for $7.00)", (teeOffers.json?.checkoutOffers ?? []).some((o: any) => o.product?.id === socks.id && o.offerPriceCents === 700), teeOffers.json?.checkoutOffers)
  const mugOffers = await j.call(`GET /api/offers?product=${mug.id}`)
  check("the mug: its bundle at $28.00 instead of $35.00, and the free shipping one", (mugOffers.json?.bundles ?? []).some((b: any) => b.title === "Mug and cap" && b.priceCents === 2800 && b.fullCents === 3500) && (mugOffers.json?.bundles ?? []).some((b: any) => b.title === "Candle and mug ship free"), mugOffers.json?.bundles)
  const bookOffers = await j.call(`GET /api/offers?product=${ebook}`)
  check("the ebook (a download on the creator's page): Read both at $10.00 instead of $20.00", (bookOffers.json?.bundles ?? []).some((b: any) => b.priceCents === 1000 && b.fullCents === 2000), bookOffers.json)
  check("  nothing of the store's settings leaks to a buyer", !/creator_id|maxPerOrder|minSubtotal|combinesWithCodes|triggerIds/.test(JSON.stringify([teeOffers.json, mugOffers.json])))

  section("6. The Materia website: product page, cart, cart page")
  const t = await importTemplate("materia/clothing")
  const [install] = j.db.insert("store_theme_installs", { creator_id: creator.id, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Clothing" }, {})
  j.db.insert("store_theme_settings", { install_id: install.id, settings: t.theme.settings }, {})
  j.db.insert("store_theme_custom_files", Object.entries(t.files).map(([path, content]) => ({ install_id: install.id, path, content })), {})
  j.db.insert("store_theme_pages", t.theme.pages.map((p) => ({ install_id: install.id, page_key: p.page_key, sections: p.sections })), {})
  const ana: Visitor = { jar: new Map(), ip: "198.51.100.58" }
  const pdp = await site(ana, "GET", "/products/bee-tee")
  const pdpHtml = String(pdp.json ?? "")
  if (process.env.R58_DUMP) (await import("node:fs")).writeFileSync(`${process.env.R58_DUMP}/pdp.html`, pdpHtml)
  check("the tee's page answers on the website", pdp.status === 200 && /Bee Tee/.test(pdpHtml), pdp.status)
  const flatPdp = pdpHtml.replace(/\s+/g, " ")
  check("  draws the tiers on the first paint: Buy 2 get 1 free, $60.00 instead of $90.00", /po-tier__label">Buy 2 get 1 free</.test(flatPdp) && /po-tier__total">\$60\.00</.test(flatPdp) && /po-tier__compare">\$90\.00</.test(flatPdp), flatPdp.match(/.{0,200}po-tier__label.{0,300}/)?.[0])
  /* Round 58: the Clothing template's product section has no Upsell block; the buttons' snippet draws the store's upsell under them (theme-packages/materia/base/snippets/buy-buttons.liquid). */
  check("  and the upsell made in /app/offers, with no Upsell block in the section (it showed nowhere before round 58)", /<storelib-product-offers[^>]*data-kind="upsell_pro"/.test(flatPdp) && /Bee Socks · \$3\.00 off/.test(words(flatPdp)), flatPdp.match(/data-kind="upsell_pro".{0,200}/)?.[0])
  const mugPage = String((await site(ana, "GET", "/products/honey-mug")).json ?? "").replace(/\s+/g, " ")
  check("  the mug's page: its two bundles, with no Bundle block in the section", /<storelib-product-offers[^>]*data-kind="bundle"/.test(mugPage) && /Mug and cap/.test(mugPage), mugPage.match(/data-kind="bundle".{0,300}/)?.[0])

  const add = (v: Visitor, id: string, quantity: number, properties?: Record<string, string>) => site(v, "POST", "/cart/add.js", { id, quantity, ...(properties ? { properties } : {}) }, ajax)
  await add(ana, tee.variant, 3)
  await add(ana, mug.variant, 1)
  await add(ana, cap.variant, 1)
  await add(ana, socks.variant, 1)
  const cart = json(await site(ana, "GET", "/cart.js", undefined, ajax))
  /* 3 tees $90 (one free: -$30), mug + cap $35 (-20%: -$7), socks $10 (-$3): $135 less $40. */
  check("/cart.js: $135.00 of goods less $40.00 by the offers, $95.00 (Shopify's automatic discounts: the subtotal is after them)", cart?.original_total_price === 13500 && cart?.items_subtotal_price === 9500 && cart?.total_discount === 4000 && cart?.total_price === 9500, cart && { sub: cart.items_subtotal_price, disc: cart.total_discount, total: cart.total_price, apps: cart.cart_level_discount_applications, lines: cart.items?.map((i: any) => [i.title, i.quantity, i.final_line_price, i.line_level_discount_allocations?.map((a: any) => a.amount)]) })
  const titles = JSON.stringify(cart?.items?.flatMap((i: any) => i.line_level_discount_allocations?.map((a: any) => a.discount_application?.title) ?? []) ?? [])
  check("  each saving by the offer's name", /Buy 2 get 1 free/.test(titles) && /Mug and cap/.test(titles) && /Add socks/.test(titles), titles)
  const cartPage = words(String((await site(ana, "GET", "/cart")).json ?? ""))
  check("  the cart page says $95.00", /\$95\.00/.test(cartPage), cartPage.match(/.{0,200}\$95.{0,40}/)?.[0] ?? cartPage.slice(0, 300))

  section("7. The website's checkout: quote, Stripe's charge, the order lines")
  const go = await site(ana, "POST", "/cart", "checkout=")
  const params = readSiteCheckoutParams(new URL(go.location ?? "/", `https://${HOST}`).searchParams)
  /* A browser that lies: a price of one cent and a discount of everything, on every line. */
  const items = params.items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? null, quantity: i.quantity, priceCents: 1, unitCents: 1, discountCents: 99999, offerPriceCents: 1 }))
  const where = { country: "US", region: "TX", postalCode: "78701", city: "Austin" }
  const quote = await checkout(ana, { action: "quote", items, ...where })
  const tot = quote.json?.totals
  check("the quote: $135.00, $40.00 off, $5.00 shipping, $100.00; the cent prices the browser sent are ignored", quote.status === 200 && tot?.itemsSubtotalCents === 13500 && tot?.discountCents === 4000 && tot?.shippingCents === 500 && tot?.totalCents === 10000, { status: quote.status, tot, err: quote.json?.error })
  const savings = JSON.stringify(quote.json?.offers ?? quote.json?.savings ?? quote.json?.totals)
  check("  the offers named in the quote", /Buy 2 get 1 free/.test(savings) && /Mug and cap/.test(savings) && /Add socks/.test(savings), savings.slice(0, 600))
  const intent = await checkout(ana, { action: "intent", items, ...where, address: { line1: "2 Oak St", ...where }, deliveryOptionId: quote.json?.delivery?.selectedId ?? null, email: "ana@example.com", firstName: "Ana", lastName: "Ash", agreedToTerms: true, clientKey: "r58-f5-ana-0001", paymentMethods: ["card"] })
  const pi = intent.json?.paymentIntentId as string | undefined
  check("Stripe is asked for $100.00 for the seller's account", !!pi && j.world.intents.get(pi!)?.amount === 10000 && j.world.intents.get(pi!)?.transfer_data?.destination === acct, { status: intent.status, json: intent.json, amount: pi && j.world.intents.get(pi)?.amount })
  if (pi) {
    const paid = j.world.payIntent(pi)
    await checkout(ana, { action: "confirm", paymentIntentId: pi, clientSecret: j.world.intents.get(pi)!.client_secret, wholeCart: true })
    await j.webhook("payment_intent.succeeded", paid.intent)
  }
  const co = j.rows("commerce_checkouts").find((x) => x.client_key === "r58-f5-ana-0001")
  const lines = co ? j.rows("orders").filter((o) => o.checkout_id === co.id) : []
  const lineOf = (pid: string) => lines.find((o) => o.product_id === pid)
  check("paid: the checkout says $135.00, $40.00 off, $5.00 shipping, $100.00", co?.status === "paid" && co?.items_subtotal_cents === 13500 && co?.discount_cents === 4000 && co?.total_cents === 10000, co && { status: co.status, sub: co.items_subtotal_cents, disc: co.discount_cents, total: co.total_cents })
  const offerOf = (pid: string) => (lineOf(pid)?.product_snapshot?.offers ?? []).map((o: any) => `${o.title}:${o.saved_cents}`).join(",")
  check("  every order line keeps the offer that saved on it, by name and amount (what the receipt, emails and /app read)", offerOf(tee.id) === "Buy 2 get 1 free:3000" && offerOf(mug.id) === "Mug and cap:400" && offerOf(cap.id) === "Mug and cap:300" && offerOf(socks.id) === "Add socks:300", { tee: offerOf(tee.id), mug: offerOf(mug.id), cap: offerOf(cap.id), socks: offerOf(socks.id) })

  section("8. Free shipping: the candle and the mug")
  const ben: Visitor = { jar: new Map(), ip: "198.51.100.59" }
  const fq = await checkout(ben, { action: "quote", items: [{ productId: candle.id, variantId: candle.variant, quantity: 1 }, { productId: mug.id, variantId: mug.variant, quantity: 1 }], ...where })
  check("shipping comes off: $32.00 of goods, $0.00 to ship, $32.00", fq.status === 200 && fq.json?.totals?.itemsSubtotalCents === 3200 && (fq.json?.totals?.shippingCents ?? 0) - (fq.json?.totals?.shippingDiscountCents ?? 0) === 0 && fq.json?.totals?.totalCents === 3200, fq.json?.totals ?? fq.json)
  const fq1 = await checkout(ben, { action: "quote", items: [{ productId: candle.id, variantId: candle.variant, quantity: 1 }], ...where })
  check("  the candle alone pays its $5.00", fq1.json?.totals?.totalCents === 1700, fq1.json?.totals)

  section("9. Downloads: the basket the creator's page and OnePage go to")
  const { priceCart } = await import("@/lib/checkout/pricing")
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const basket = await priceCart(createAdminClient(), { items: [{ productId: ebook, quantity: 1, priceCents: 1, discountCents: 99999 } as never, { productId: guide, quantity: 1 }], handOff: false })
  const b = basket.ok === true ? (basket as unknown as { totalCents: number; offerCents: number; lines: { item: { offers?: { title: string; savedCents: number }[] } }[] }) : null
  check("priceCart: $20.00 of downloads, $10.00 off by Read both, $10.00; the cent price sent is ignored", b?.totalCents === 1000 && b?.offerCents === 1000 && b?.lines[0]?.item.offers?.[0]?.title === "Read both", basket)
  const dq = await checkout({ jar: new Map(), ip: "198.51.100.60" }, { action: "quote", items: [{ productId: ebook, variantId: null, quantity: 1 }, { productId: guide, variantId: null, quantity: 1 }], country: "US" })
  check("  the same on the website's checkout: $10.00, nothing to ship", dq.status === 200 && dq.json?.totals?.totalCents === 1000 && dq.json?.requiresShipping === false, dq.json?.totals ?? dq.json)

  section("10. /app/offers: what each offer sold, from the paid order lines")
  const area = await j.call("GET /api/store/offers", { as: seller })
  const sold = area.json?.sold ?? {}
  check("the quantity break 3 units, the bundle 2, the upsell 1", sold[bogoId] === 3 && sold[bundle.json.offer.id] === 2 && sold[upsell.json.offer.id] === 1, sold)

  section("10b. The rules a seller sets: the order bump at checkout, the limit per order, places, dates, codes")
  const q = (items: { productId: string; variantId: string | null; quantity: number }[], extra: Record<string, unknown> = {}) => checkout({ jar: new Map(), ip: "198.51.100.62" }, { action: "quote", items, ...where, ...extra })
  const teeOnly = await q([{ productId: tee.id, variantId: tee.variant, quantity: 1 }])
  check("a tee alone at checkout: the socks offered to add, at $7.00 (the order bump)", (teeOnly.json?.suggestions ?? []).some((s: any) => s.offerId === upsell.json.offer.id && s.offerPriceCents === 700), teeOnly.json?.suggestions)
  const twoSocks = await q([{ productId: tee.id, variantId: tee.variant, quantity: 1 }, { productId: socks.id, variantId: socks.variant, quantity: 2 }])
  check("  two socks added: one is discounted (one per order unless the seller says more)", twoSocks.json?.totals?.discountCents === 300, twoSocks.json?.totals)
  const socksOnly = await q([{ productId: socks.id, variantId: socks.variant, quantity: 1 }])
  check("  socks without a tee: full price, the condition is the server's", (socksOnly.json?.totals?.discountCents ?? 0) === 0, socksOnly.json?.totals)
  /* Shown in the cart only: the product page and the checkout stop offering it; the charge still applies once it is in the cart. */
  const upsellId = upsell.json.offer.id as string
  await j.call("PUT /api/store/offers", { as: seller, body: { ...upsell.json.offer, placements: ["cart"], formCurrency: "USD" } })
  const teeNow = await j.call(`GET /api/offers?product=${tee.id}`)
  const teeOnly2 = await q([{ productId: tee.id, variantId: tee.variant, quantity: 1 }])
  check("  an upsell shown in the cart only is no longer offered on the product page or at checkout", !(teeNow.json?.checkoutOffers ?? []).some((o: any) => o.offerId === upsellId) && !(teeOnly2.json?.suggestions ?? []).some((s: any) => s.offerId === upsellId), [teeNow.json?.checkoutOffers, teeOnly2.json?.suggestions])
  await j.call("PUT /api/store/offers", { as: seller, body: { ...upsell.json.offer, startsAt: "2099-01-01T00:00:00.000Z", formCurrency: "USD" } })
  const later = await q([{ productId: tee.id, variantId: tee.variant, quantity: 1 }, { productId: socks.id, variantId: socks.variant, quantity: 1 }])
  check("  one that starts in 2099 takes nothing off today", (later.json?.totals?.discountCents ?? 0) === 0, later.json?.totals)
  await j.call("PUT /api/store/offers", { as: seller, body: { ...upsell.json.offer, formCurrency: "USD" } })
  const coupon = await j.call("POST /api/coupons", { as: seller, body: { code: "HIVE10", discount_type: "percentage", discount_value: 10 } })
  const withCode = await q([{ productId: mug.id, variantId: mug.variant, quantity: 1 }, { productId: cap.id, variantId: cap.variant, quantity: 1 }], { couponCode: "HIVE10" })
  check("  a code on top of the bundle: 20% off the set, then 10% of what is left ($7.00 + $2.80)", coupon.status < 300 && withCode.json?.totals?.discountCents === 980, [coupon.status, withCode.json?.totals, withCode.json?.error])
  await j.call("PUT /api/store/offers", { as: seller, body: { ...bundle.json.offer, combinesWithCodes: false, formCurrency: "USD" } })
  const better = await q([{ productId: mug.id, variantId: mug.variant, quantity: 1 }, { productId: cap.id, variantId: cap.variant, quantity: 1 }], { couponCode: "HIVE10" })
  check("  the bundle set to not combine: the buyer keeps whichever saves more (the bundle's $7.00), and is told why the code was refused", better.json?.totals?.discountCents === 700 && /can't be used with Mug and cap/.test(String(better.json?.couponError)), [better.status, better.json?.totals, better.json?.couponError])
  await j.call("PUT /api/store/offers", { as: seller, body: { ...bundle.json.offer, formCurrency: "USD" } })

  if (process.env.OFFERS_R58_SERVE) await serve(j, site, { tee: tee.id, teeVariant: tee.variant, mug: mug.id, cap: cap.id, socks: socks.id, socksVariant: socks.variant })

  section("11. Delete: it stops applying at once")
  const del = await j.call("DELETE /api/store/offers", { as: seller, body: { id: bogoId, title: "Buy more tees" } })
  const after = await checkout({ jar: new Map(), ip: "198.51.100.61" }, { action: "quote", items: [{ productId: tee.id, variantId: tee.variant, quantity: 3 }], ...where })
  check("deleted, three tees cost $90.00 again", del.status === 200 && after.json?.totals?.itemsSubtotalCents === 9000 && (after.json?.totals?.discountCents ?? 0) === 0, [del.json, after.json?.totals])

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(fails.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
  process.exit(0)
}

/**
 * THE STORE OVER HTTP, for scripts/check-offers-r58.mjs: every request a
 * browser makes to http://localhost:<port> goes to the website through the
 * real site route (the same `site` call the suite uses) with the browser's
 * own cookies, as tests/commerce-e2e-r57.test.ts serves its store.
 */
async function serve(j: Journey, site: (v: Visitor, method: string, path: string, body?: Record<string, unknown> | string, extra?: Record<string, string>) => Promise<Answer>, facts: Record<string, string>) {
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
      if (/^\/(?:__media|_next|cdn)\//.test(url)) {
        res.writeHead(404)
        return res.end()
      }
      const v: Visitor = { jar: new Map(), ip: String(req.headers["x-forwarded-for"] ?? "198.51.100.200") }
      for (const part of String(req.headers.cookie ?? "").split(/;\s*/)) {
        const at = part.indexOf("=")
        if (at > 0) v.jar.set(part.slice(0, at), part.slice(at + 1))
      }
      const extra: Record<string, string> = {}
      for (const h of ["x-requested-with", "accept", "content-type"]) if (req.headers[h]) extra[h] = String(req.headers[h])
      const answer = url.startsWith("/api/site-theme/assets/") ? await j.call(`GET ${url}`, { host: HOST }) : await site(v, String(req.method), url, raw ? raw : undefined, extra)
      const headers: Record<string, string | string[]> = {}
      answer.headers.forEach((value, key) => {
        if (key !== "set-cookie" && key !== "content-length" && key !== "content-encoding") headers[key] = value
      })
      const cookies = (answer.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
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

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
