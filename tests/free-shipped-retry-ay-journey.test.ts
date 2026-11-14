/**
 * ROUND AY, THROUGH THE REAL ROUTES (tests/_journey, strict)
 * A cart with a shipped item that a 100% code makes free, pressed again after
 * its answer was lost: one order, one receipt email, the one use code used
 * once, the stock held once. Through /api/physical/checkout and the website's
 * checkout (app/api/checkout/site, free). Before round AY the same key again
 * was refused ("This order has already been paid") and the page then sent a
 * new key, which placed a second order.
 */
import "./_journey/env"
import { Journey } from "./_journey/harness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}

async function main() {
  const j = await Journey.start()
  const seller = await j.signUp("mug-ay@example.com", { name: "Mia Mug" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mia-ay" } })
  const creator = j.rows("creators")[0]
  const creatorId = creator.id as string
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mia Mugs", supportEmail: "hello@mia.example", defaultCountry: "US" } })
  await j.call("POST /api/physical/onboarding", { as: seller, body: { model: "self" } })
  const locId = j.rows("inventory_locations")[0].id as string
  await j.call(`PATCH /api/physical/locations/${locId}`, { as: seller, body: { name: "Studio", kind: "home", addressLine1: "1 Main St", city: "Austin", region: "TX", postalCode: "78701", country: "US" } })
  const profileId = j.rows("shipping_profiles")[0].id as string
  await j.call("POST /api/physical/shipping/zones", { as: seller, body: { profileId, countries: ["US"], name: "United States" } })
  const zone = j.rows("shipping_zones").find((z) => (z.countries ?? []).includes("US"))
  await j.call("POST /api/physical/shipping/rates", { as: seller, body: { zoneId: zone?.id, kind: "flat", name: "Free post", priceCents: 0, minDays: 2, maxDays: 5 } })
  const [product] = j.db.insert("products", { creator_id: creatorId, type: "physical", title: "Blue Mug", slug: "blue-mug", description: "<p>Mug</p>", status: "published", price_cents: 2000, thumbnail_url: "https://cdn.example.com/m.jpg", pay_what_you_want: false }, {})
  const productId = product.id as string
  await j.call(`PUT /api/physical/products/${productId}`, { as: seller, body: { variants: [{ options: [], priceCents: 2000, sku: "MUG", weightGrams: 300, stock: { [locId]: 5 } }], requiresShipping: true, weightGrams: 300, taxable: false, trackInventory: true, fulfillmentLocationId: locId } })
  const variantId = j.rows("product_variants").find((v) => v.product_id === productId)?.id as string
  const committed = () => Number(j.rows("inventory_levels").find((l) => l.variant_id === variantId && l.location_id === locId)?.committed ?? 0)
  const code = async (name: string) => {
    const made = await j.call("POST /api/coupons", { as: seller, body: { code: name, discount_type: "percentage", discount_value: 100, usage_limit: 1 } })
    check(`a 100% code ${name} for one use`, made.status === 200 || made.status === 201, { status: made.status, body: made.json })
  }
  const used = (name: string) => j.rows("coupons").find((c) => c.code === name)?.usage_count
  const paidFor = (email: string) => j.rows("commerce_checkouts").filter((c) => c.buyer_email === email && c.status === "paid")
  const cart = [{ productId, variantId: null, quantity: 1 }]
  const address = (name: string) => ({ name, line1: "5 Oak Ave", city: "Austin", region: "TX", postalCode: "78702", country: "US", phone: "+1 512 555 0100" })
  const quote = await j.call("POST /api/physical/checkout/quote", { body: { items: cart, shopId: creatorId, country: "US", postalCode: "78702" } })
  const optionId = (quote.json?.delivery?.options ?? []).find((o: any) => o.name === "Free post")?.id

  console.log("\n1. /api/physical/checkout: a free shipped cart, pressed again with the same key")
  await code("MUGFREE")
  const press = { shopId: creatorId, items: cart, couponCode: "MUGFREE", email: "ann@example.com", name: "Ann Lee", address: address("Ann Lee"), deliveryOptionId: optionId, clientKey: "free-ship-key-ann-1" }
  const p1 = await j.call("POST /api/physical/checkout", { body: press })
  await j.cron()
  const annMails = j.net.to("ann@example.com").length
  check("the first press places one free order", p1.status === 200 && p1.json?.free === true && paidFor("ann@example.com").length === 1, { status: p1.status, body: p1.json, rows: paidFor("ann@example.com").length })
  const p2 = await j.call("POST /api/physical/checkout", { body: press })
  await j.cron()
  check("the same press again answers with that order, not a refusal", p2.status === 200 && p2.json?.free === true && p2.json?.url === p1.json?.url, { status: p2.status, body: p2.json })
  check("  one order, one receipt email, the code used once, one unit held", paidFor("ann@example.com").length === 1 && j.net.to("ann@example.com").length === annMails && used("MUGFREE") === 1 && committed() === 1, { orders: paidFor("ann@example.com").length, mails: [annMails, j.net.to("ann@example.com").length], used: used("MUGFREE"), committed: committed() })
  const eve = await j.call("POST /api/physical/checkout", { body: { ...press, email: "eve@example.com", name: "Eve", address: address("Eve"), clientKey: "free-ship-key-eve-1" } })
  check("somebody else's press still finds the code used up", eve.status !== 200 && paidFor("eve@example.com").length === 0, { status: eve.status, body: eve.json })

  console.log("\n2. The website's checkout (free): the same press after a lost answer")
  j.db.insert("store_theme_installs", { creator_id: creatorId, status: "published", published_at: new Date().toISOString(), sort_order: 0, name: "Mia" }, {})
  const host = "mia-ay.storelib.com"
  const headers = { "x-forwarded-for": "198.51.100.61", origin: `https://${host}` }
  await code("SITEMUG")
  const site = { action: "free", items: cart, couponCode: "SITEMUG", email: "bo@example.com", firstName: "Bo", lastName: "Reed", agreedToTerms: true, address: address("Bo Reed"), phone: "+1 512 555 0100", deliveryOptionId: optionId, clientKey: "site-free-key-bo-1", attemptId: "4b3a2c1d-0e9f-4a8b-9c7d-6e5f4a3b2c1d" }
  const s1 = await j.call("POST /api/checkout/site", { host, headers, body: site })
  await j.cron()
  const boMails = j.net.to("bo@example.com").length
  check("the first press places it", s1.status === 200 && typeof s1.json?.thanks === "string" && paidFor("bo@example.com").length === 1, { status: s1.status, body: s1.json })
  const s2 = await j.call("POST /api/checkout/site", { host, headers, body: site })
  await j.cron()
  check("the same press again: its thank you page, one order, the code once, one more unit held", s2.status === 200 && s2.json?.thanks === s1.json?.thanks && paidFor("bo@example.com").length === 1 && used("SITEMUG") === 1 && committed() === 2 && j.net.to("bo@example.com").length === boMails, { status: s2.status, body: s2.json, orders: paidFor("bo@example.com").length, used: used("SITEMUG"), committed: committed() })

  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
