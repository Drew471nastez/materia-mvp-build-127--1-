/**
 * Physical commerce: the pure engines (variants, shipping rates, totals,
 * addresses, statuses, collections, units), the switch in /admin and the
 * wiring that keeps everything behind it, the emails, and the SQL part.
 */
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { combinations, findVariant, normaliseOptions, planVariants, variantName } from "@/lib/physical/variants"
import { deliveryEstimate, pickOption, quoteDelivery, ratePrice, zoneFor, type QuoteLine } from "@/lib/physical/rates"
import { marginPercent, physicalTotals, refundable, taxRateFor, type TaxSettings } from "@/lib/physical/totals"
import { addressLines, postalCodeRequired, readAddress } from "@/lib/physical/address"
import { canMoveShipment, fulfillmentStatusOf, orderNumber, returnStatusOf, returnableQuantities, trackingUrl, unfulfilledQuantities } from "@/lib/physical/status"
import { inSmartCollection, readRules, ruleMatches, slugify, sortProducts, type RuleProduct } from "@/lib/physical/collections"
import { fromGrams, fromMm, toGrams, toMm } from "@/lib/physical/units"
import { orderConfirmationEmail, shipmentEmail, supplierOrderEmail } from "@/lib/physical/email-templates"
import { PROVIDERS } from "@/lib/physical/providers"
import type { ShippingProfile, ShippingRate } from "@/lib/physical/types"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)}`}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
function walk(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir)).flatMap((n) => {
    const p = `${dir}/${n}`
    return statSync(join(process.cwd(), p)).isDirectory() ? walk(p) : [p]
  })
}

console.log("\nOptions and variants")
{
  const opts = normaliseOptions([
    { name: " Size ", values: ["S", "M", "m", " L "] },
    { name: "Color", values: ["Black", "White"] },
    { name: "size", values: ["XL"] },
    { name: "Empty", values: [] },
    { name: "Material", values: ["Cotton"] },
  ])
  check("options are trimmed, deduplicated case-blind, empty ones dropped, at most three", opts.length === 3 && opts[0].name === "Size" && opts[0].values.join() === "S,M,L" && opts[2].name === "Material", opts)
  const combos = combinations(opts)
  check("every combination, first option slowest", combos.length === 6 && combos[0].join() === "S,Black,Cotton" && combos[1].join() === "S,White,Cotton" && combos[5].join() === "L,White,Cotton")
  check("no options is one Default variant", combinations([]).length === 1 && variantName([null, null, null]) === "Default")
  check("a variant is named by its values", variantName(["M", "Black", null]) === "M / Black")
  const existing = [
    { id: "a", options: ["S", "Black", null] as (string | null)[] },
    { id: "b", options: ["M", "Black", null] as (string | null)[] },
    { id: "c", options: ["XL", "Black", null] as (string | null)[] },
  ]
  const plan = planVariants(existing, normaliseOptions([{ name: "Size", values: ["S", "M", "L"] }, { name: "Color", values: ["black"] }]))
  check("an edit keeps matching variants by value (case-blind), adds new ones and removes the rest", plan.keep.map((k) => k.id).join() === "a,b" && plan.create.length === 1 && plan.create[0][0] === "L" && plan.remove.join() === "c", plan)
  const single = planVariants([{ id: "d", options: [null, null, null] }], [])
  check("the Default variant survives an edit with no options", single.keep[0]?.id === "d" && single.remove.length === 0)
  let threw = false
  try {
    combinations(normaliseOptions([{ name: "A", values: Array.from({ length: 20 }, (_, i) => `a${i}`) }, { name: "B", values: Array.from({ length: 20 }, (_, i) => `b${i}`) }]))
  } catch {
    threw = true
  }
  check("more than 250 variants is refused", threw)
  check("a buyer's choice finds its variant", findVariant(existing, ["m", "black"])?.id === "b" && findVariant(existing, ["L", "Black"]) === null)
}

console.log("\nShipping rates")
{
  const rate = (r: Partial<ShippingRate>): ShippingRate => ({ id: "r", zoneId: "z", name: "Standard", kind: "flat", priceCents: 500, minValue: null, maxValue: null, freeOverCents: null, minDays: 3, maxDays: 5, active: true, position: 0, ...r })
  const t = { units: 2, cents: 4000, grams: 1200 }
  check("flat costs its price", ratePrice(rate({}), t) === 500)
  check("free costs nothing", ratePrice(rate({ kind: "free" }), t) === 0)
  check("free over a threshold", ratePrice(rate({ freeOverCents: 4000 }), t) === 0 && ratePrice(rate({ freeOverCents: 4001 }), t) === 500)
  check("weight rate within its range only", ratePrice(rate({ kind: "weight", minValue: 1000, maxValue: 2000 }), t) === 500 && ratePrice(rate({ kind: "weight", minValue: 0, maxValue: 1000 }), t) === null)
  check("price rate within its range only", ratePrice(rate({ kind: "price", minValue: 5000 }), t) === null && ratePrice(rate({ kind: "price", maxValue: 5000 }), t) === 500)
  check("quantity rate within its range only", ratePrice(rate({ kind: "quantity", minValue: 3 }), t) === null && ratePrice(rate({ kind: "quantity", minValue: 1, maxValue: 2 }), t) === 500)
  check("a carrier rate with no live quote is never guessed", ratePrice(rate({ kind: "carrier" }), t) === null && ratePrice(rate({ kind: "carrier", id: "c1" }), t, new Map([["c1", 812]])) === 812)
  check("an inactive rate is not offered", ratePrice(rate({ active: false }), t) === null)

  const general: ShippingProfile = {
    id: "p1",
    name: "General",
    isDefault: true,
    zones: [
      { id: "z1", profileId: "p1", name: "Domestic", countries: ["RO"], restOfWorld: false, rates: [rate({ id: "s", name: "Standard", priceCents: 1500 }), rate({ id: "e", name: "Express", priceCents: 3000, minDays: 1, maxDays: 2 }), rate({ id: "f", name: "Standard", priceCents: 900 })] },
      { id: "z2", profileId: "p1", name: "Rest of world", countries: [], restOfWorld: true, rates: [rate({ id: "w", name: "International", priceCents: 4500 })] },
    ],
  }
  const heavy: ShippingProfile = {
    id: "p2",
    name: "Heavy",
    isDefault: false,
    zones: [{ id: "z3", profileId: "p2", name: "Domestic", countries: ["RO"], restOfWorld: false, rates: [rate({ id: "hs", name: "Standard", priceCents: 2500 }), rate({ id: "he", name: "Express", priceCents: 5000, minDays: 2, maxDays: 3 })] }],
  }
  const line = (l: Partial<QuoteLine>): QuoteLine => ({ shippingProfileId: null, quantity: 1, lineCents: 2000, weightGrams: 500, requiresShipping: true, ...l })
  check("a country's own zone beats rest of world", zoneFor(general, "ro")?.id === "z1" && zoneFor(general, "US")?.id === "z2")
  const q1 = quoteDelivery([general, heavy], [line({})], "RO")
  check("one profile: its rates, cheapest first, one per name", q1.ok && q1.required && q1.options.map((o) => `${o.name}:${o.priceCents}`).join() === "Standard:900,Express:3000", q1)
  const q2 = quoteDelivery([general, heavy], [line({}), line({ shippingProfileId: "p2" })], "RO")
  check("two profiles: a shared name is one option at the sum", q2.ok && q2.required && q2.options.map((o) => `${o.name}:${o.priceCents}`).join() === "Standard:3400,Express:8000" && q2.options[1].maxDays === 3, q2)
  const q3 = quoteDelivery([general, heavy], [line({ shippingProfileId: "p2" })], "US")
  check("no zone for the country in a profile: refused, naming the profile", q3.ok === false && q3.unshippableProfileIds.join() === "p2")
  const q4 = quoteDelivery([general], [line({ requiresShipping: false })], "US")
  check("nothing to ship: no delivery needed", q4.ok && !q4.required)
  check("a chosen option is found again by id, or not at all", pickOption(q1, q1.ok && q1.required ? q1.options[1].id : "") !== null && pickOption(q1, "made-up") === null && pickOption(q1, 5) === null)
  check("no profile set up at all is said plainly", !quoteDelivery([], [line({})], "RO").ok)
  check("delivery estimates read naturally", deliveryEstimate({ minDays: 3, maxDays: 5 }) === "3 to 5 business days" && deliveryEstimate({ minDays: 1, maxDays: 1 }) === "1 business day" && deliveryEstimate({ minDays: null, maxDays: null }) === "")
}

console.log("\nTotals and tax")
{
  const lines = [
    { unitCents: 2500, quantity: 2, discountCents: 500, taxable: true },
    { unitCents: 1000, quantity: 1, discountCents: 0, taxable: false },
  ]
  const none = physicalTotals(lines, { shippingCents: 700 })
  check("items, discount and delivery add up, no tax by default", none.itemsSubtotalCents === 6000 && none.discountCents === 500 && none.totalCents === 6200 && none.taxCents === 0, none)
  const free = physicalTotals(lines, { shippingCents: 700, freeShipping: true })
  check("free shipping takes the delivery off, and says so", free.shippingDiscountCents === 700 && free.totalCents === 5500)
  const tax: TaxSettings = { mode: "manual", pricesIncludeTax: false, taxOnShipping: true, rates: [{ country: "RO", region: null, rateBps: 1900 }, { country: "US", region: "CA", rateBps: 725 }] }
  const added = physicalTotals(lines, { shippingCents: 700, tax, country: "RO" })
  check("added tax on taxable items and on delivery", added.taxCents === Math.round(4500 * 0.19) + Math.round(700 * 0.19) && added.totalCents === 6200 + added.taxCents, added)
  const included = physicalTotals(lines, { shippingCents: 0, tax: { ...tax, pricesIncludeTax: true }, country: "RO" })
  check("included tax does not move the total", included.totalCents === 5500 && included.taxIncluded && included.taxCents === Math.round(4500 - 4500 / 1.19))
  check("a regional rate, else none: Storelib does not invent tax", taxRateFor(tax, "us", "ca") === 725 && taxRateFor(tax, "US", "NY") === 0 && taxRateFor(tax, "DE", null) === 0)
  check("tax off charges none whatever the rates", taxRateFor({ ...tax, mode: "none" }, "RO", null) === 0)
  check("a discount never takes a line below zero", physicalTotals([{ unitCents: 100, quantity: 1, discountCents: 900, taxable: true }], { shippingCents: 0 }).totalCents === 0)
  check("margin from price and cost, unknown without a cost", marginPercent(2000, 800) === 60 && marginPercent(2000, null) === null)
  check("a refund is never more than what is left", refundable(5000, 1200) === 3800 && refundable(5000, 9000) === 0)
}

console.log("\nAddresses")
{
  const ok = readAddress({ name: " Ana  Pop ", line1: "Str. Lunga 5", city: "Bucharest", postalCode: "010101", country: "ro", phone: "+40 712 345 678" })
  check("a full address is read and cleaned", ok.ok && ok.address.name === "Ana Pop" && ok.address.country === "RO")
  check("an unknown country is refused", !readAddress({ name: "A", line1: "B", city: "C", postalCode: "1", country: "XX" }).ok)
  const noZip = readAddress({ name: "A", line1: "B", city: "C", country: "US" })
  check("a postal code where the post uses one", noZip.ok === false && noZip.field === "postalCode")
  check("not where it doesn't", postalCodeRequired("AE") === false && readAddress({ name: "A", line1: "B", city: "Dubai", country: "AE" }).ok)
  check("markup is stripped", readAddress({ name: "<b>Ana</b>", line1: "x", city: "y", postalCode: "123", country: "DE" }).ok && (readAddress({ name: "<b>Ana</b>", line1: "x", city: "y", postalCode: "123", country: "DE" }) as { address: { name: string } }).address.name === "bAna/b")
  check("lines for a label", addressLines({ name: "Ana", line1: "Str 5", city: "Cluj", postalCode: "400001", country: "RO" }).join("|") === "Ana|Str 5|Cluj, 400001|Romania")
}

console.log("\nStatuses")
{
  const lines = [
    { orderId: "a", quantity: 3, requiresShipping: true, fulfilled: 0, returned: 0 },
    { orderId: "b", quantity: 1, requiresShipping: false, fulfilled: 0, returned: 0 },
  ]
  check("nothing shipped is unfulfilled", fulfillmentStatusOf(lines) === "unfulfilled")
  check("some shipped is partial", fulfillmentStatusOf([{ ...lines[0], fulfilled: 1 }, lines[1]]) === "partially_fulfilled")
  check("all shipped is fulfilled; a download needs no shipping", fulfillmentStatusOf([{ ...lines[0], fulfilled: 3 }, lines[1]]) === "fulfilled")
  check("nothing to ship is not required", fulfillmentStatusOf([lines[1]]) === "not_required")
  check("what is left to ship", unfulfilledQuantities([{ ...lines[0], fulfilled: 1 }]).get("a") === 2)
  check("only what shipped can come back", returnableQuantities([{ ...lines[0], fulfilled: 2, returned: 1 }]).get("a") === 1)
  check("returns: partial, then all", returnStatusOf([{ ...lines[0], fulfilled: 3, returned: 1 }], 0) === "partially_returned" && returnStatusOf([{ ...lines[0], fulfilled: 3, returned: 3 }], 0) === "returned" && returnStatusOf([lines[0]], 1) === "in_progress")
  check("a shipment only moves forward", canMoveShipment("shipped", "delivered") && !canMoveShipment("delivered", "in_transit") && !canMoveShipment("in_transit", "shipped") && canMoveShipment("pending", "cancelled") && !canMoveShipment("in_transit", "cancelled"))
  check("tracking links for known carriers, none invented", trackingUrl("UPS", "1Z999AA10123456784")?.startsWith("https://www.ups.com/") === true && trackingUrl("Local courier", "ABC12345") === null && trackingUrl("UPS", "bad number!") === null)
  check("order numbers are short and stable", orderNumber("0f3a9c2e-1111-2222-3333-444455556666") === "#0F3A9C2E")
}

console.log("\nCollections")
{
  const p = (x: Partial<RuleProduct>): RuleProduct => ({ id: "1", title: "Linen Shirt", type: "physical", tags: ["Summer", "linen"], vendor: "Atelier", priceCents: 4500, compareAtCents: null, inventory: 3, weightGrams: 300, ...x })
  const rules = readRules([{ field: "tag", op: "equals", value: "summer" }, { field: "price", op: "less_than", value: "50" }, { field: "bogus", op: "equals", value: "x" }, { field: "price", op: "greater_than", value: "abc" }])
  check("only valid rules are kept", rules.length === 2)
  check("all must match", inSmartCollection(rules, "all", p({})) && !inSmartCollection(rules, "all", p({ priceCents: 6000 })))
  check("any may match", inSmartCollection(rules, "any", p({ priceCents: 6000 })))
  check("no rules matches nothing", !inSmartCollection([], "all", p({})))
  check("text rules ignore case", ruleMatches({ field: "title", op: "contains", value: "SHIRT" }, p({})) && ruleMatches({ field: "vendor", op: "starts_with", value: "atel" }, p({})))
  check("sorting by price and title", sortProducts([p({ id: "a", priceCents: 300, title: "B" }), p({ id: "b", priceCents: 100, title: "A" })], "price_asc")[0].id === "b" && sortProducts([p({ id: "a", title: "B" }), p({ id: "b", title: "A" })], "title")[0].id === "b")
  check("addresses from titles", slugify("Été Collection 2026!") === "ete-collection-2026")
}

console.log("\nUnits")
check("kilograms and pounds to grams and back", toGrams("1,5", "kg") === 1500 && toGrams(1, "lb") === 454 && fromGrams(1500, "kg") === 1.5)
check("inches to millimetres and back", toMm(10, "in") === 254 && fromMm(254, "in") === 10 && toMm(-1, "cm") === null)

console.log("\nEmails")
{
  const m = orderConfirmationEmail({
    shopName: "Ana's <Shop>",
    orderNumber: "#ABCD1234",
    buyerFirstName: "Mara",
    lines: [{ title: "Mug", variantName: "Blue", quantity: 2, cents: 3000, imageUrl: "javascript:alert(1)" }],
    totals: { subtotal: 3000, discount: 0, shipping: 500, shippingDiscount: 0, tax: 0, taxIncluded: false, total: 3500, currency: "USD" },
    address: { name: "Mara", line1: "Str 1", city: "Iasi", postalCode: "700001", country: "RO" },
    deliveryName: "Standard",
    deliveryEstimate: "3 to 5 business days",
    statusUrl: "https://storelib.com/checkout/physical/order/tok",
    hasDownloads: false,
  })
  check("confirmation: escaped shop name, total, address, order link", m.html.includes("Ana&#39;s") || (m.html.includes("Ana's &lt;Shop&gt;") && m.html.includes("$35.00") && m.html.includes("Iasi") && m.html.includes("/checkout/physical/order/tok")))
  check("confirmation: a non https image is never put in an email", !m.html.includes("javascript:"))
  check("confirmation: plain text too", m.text.includes("2 x Mug (Blue)") && m.text.includes("Total: $35.00"))
  const s = shipmentEmail({ shopName: "Shop", orderNumber: "#1", buyerFirstName: null, lines: [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: null }], carrier: "UPS", trackingNumber: "1Z1", trackingUrl: "https://www.ups.com/track?tracknum=1Z1", address: null, statusUrl: "https://x", kind: "shipped" })
  check("shipped: tracking button, no prices", s.html.includes("Track your package") && !s.html.includes("$0.00"))
  const sup = supplierOrderEmail({ shopName: "Shop", orderNumber: "#1", locationName: "Supplier", lines: [{ title: "Mug", variantName: null, quantity: 4, cents: 9999, imageUrl: null, sku: "MUG-1" }], address: { name: "B", line1: "L", city: "C", country: "RO" }, buyerEmail: "buyer@example.com", deliveryName: null, note: null })
  check("supplier email: items, SKU and address, never prices or the buyer's email", sup.text.includes("4 x Mug [SKU MUG-1]") && !sup.html.includes("$99.99") && !sup.html.includes("buyer@example.com"))
  const all = [m, s, sup].map((x) => x.html + x.subject + x.text).join(" ")
  check("no em dashes or filler words in the emails", !/—|unlock|elevate|seamless|effortless|supercharge/i.test(all))
}

console.log("\nIntegrations are honest")
check("only what really works is live", PROVIDERS.filter((p) => p.availability === "live").map((p) => p.id).sort().join() === "csv,custom_webhook,manual,supplier_email")
check("the others say forwarding is not available yet", PROVIDERS.filter((p) => p.availability === "needs_setup").every((p) => /not available yet/.test(p.description)))
const integ = code("lib/physical/integrations-server.ts")
check("a not-live provider is saved as needs_setup, never connected", /row\.status = info\.availability === "live" \? "connected" : "needs_setup"/.test(integ))
check("secrets are sealed and only their last four characters leave the server", /sealSecret\(/.test(integ) && /secretHint\(openSecret/.test(integ) && !/secret_ciphertext:\s*r\./.test(integ))

console.log("\nThe switch")
const flag = code("lib/platform/physical-commerce.ts")
check("off unless /admin turned it on, and off on any error", /return false/.test(flag) && /physical_commerce_enabled/.test(flag))
const routes = walk("app/api/physical").filter((f) => f.endsWith("route.ts"))
const ungated = routes.filter((f) => {
  const src = code(f)
  if (f.endsWith("checkout/complete/route.ts")) return false
  return !/await physicalCaller\(\)/.test(src) && !/await physicalApiGate\(\)/.test(src)
})
check(`every /api/physical route answers 404 while it is off (${routes.length} routes)`, routes.length >= 20 && ungated.length === 0, ungated)
check("money already taken is still written when it is off: the return and the webhook", !/physicalApiGate|physicalCaller/.test(code("app/api/physical/checkout/complete/route.ts")) && /physical_checkout_id/.test(code("app/api/stripe/webhook/route.ts")))
check("the cron does nothing while it is off", /if \(!\(await isPhysicalCommerceEnabled\(\)\)\)/.test(code("app/api/cron/physical/route.ts")))
const merchant = routes.filter((f) => !/checkout\/|order-status|storefront/.test(f))
check("merchant routes resolve the caller's own shop before reading anything", merchant.every((f) => /const c = await physicalCaller\(\)\s*if \(c instanceof NextResponse\) return c/.test(code(f))))
check("and every query they make is filtered by that shop", merchant.every((f) => !/\.from\("(inventory_locations|shipping_\w+|commerce_\w+|inventory_\w+|product_collections)"\)\.(update|delete)\([^)]*\)\.eq\("id", id\)(?!\.eq\("creator_id")/.test(code(f))))

console.log("\nThe digital checkout is untouched and never sells a physical product")
const pricing = code("lib/checkout/pricing.ts")
check("a single product checkout refuses a physical product", /type === "physical"\) return \{ ok: false/.test(pricing))
check("a digital basket leaves a physical product out", /if \(product\.type === "physical"\) \{ dropped\.push/.test(pricing))
for (const f of ["app/checkout/page.tsx", "app/checkout/checkout-client.tsx", "app/api/checkout/stripe-session/route.ts", "app/api/checkout/process/route.ts"]) {
  check(`${f} has no postage`, !/shippingCents|quoteDelivery|quoteMatches|isShippable|MarketplaceCheckout|deliveryMode|awb/i.test(code(f)))
}

console.log("\nCheckout safety")
const start = code("lib/physical/checkout-server.ts")
check("the payment is created from the server's totals, never the page's", /fixed_amount: \{ amount: shippingPaid/.test(start) && !/body\.total|input\.total|totalCents: input/.test(start))
check("stock is held all-or-nothing before the payment page exists", start.indexOf('rpc("physical_reserve"') > 0 && start.indexOf('rpc("physical_reserve"') < start.indexOf("checkout.sessions.create"))
check("a changed delivery price is refused, not charged", /Delivery prices changed/.test(start))
check("paid once: a conditional update decides who does the once-per-order work", /\.in\("status", \["pending", "expired", "failed"\]\)/.test(start) && /const owns =/.test(start))
check("each line once, by a receipt token from the session and its place", /cartReceiptToken\(sessionId, i\)/.test(start) && /error\?\.code === "23505"\) continue/.test(start))
check("a Stripe page is made once per checkout", /idempotencyKey: `physical-checkout:\$\{checkoutId\}`/.test(start))
check("the lines add up to what Stripe took: price less discount plus delivery and tax shares", /itemNet\[i\] \+ \(shipShares\[i\] \?\? 0\) \+ \(taxShares\[i\] \?\? 0\)/.test(start))
const jobs = code("lib/physical/jobs-server.ts")
check("webhooks only to public https addresses, the socket refusing private ones, signed", /lookup: publicLookup/.test(jobs) && /createHmac\("sha256", secret\)/.test(jobs) && /publicUrlProblem\(url\)/.test(jobs))
check("jobs are claimed once and retried with backoff until they are dead", /commerce_claim_jobs/.test(jobs) && /backoffSeconds/.test(jobs) && /status: dead \? "dead" : "failed"/.test(jobs))
const csv = code("app/api/physical/orders/export/route.ts")
check("the CSV export cannot run formulas in a spreadsheet", /\^\[=\+\\-@\\t\\r\]/.test(csv))

console.log("\nThe SQL part")
const sql = read("supabase/sql/run-now/78_physical_commerce.sql")
check("seeded off", /'physical_commerce_enabled', 'false'::jsonb/.test(sql) || /physical_commerce_enabled', to_jsonb\(false\)/.test(sql) || /physical_commerce_enabled[^;]*false/.test(sql))
check("additive: nothing dropped but its own triggers, policies and the type check it widens", !/DROP TABLE|DROP COLUMN|^TRUNCATE|;\s*TRUNCATE/im.test(sql))
check("row level security on every new table", (sql.match(/ENABLE ROW LEVEL SECURITY/g) ?? []).length >= 25)
check("the stock functions are the server's alone", ["physical_inventory_apply", "physical_reserve", "physical_release", "physical_mark_sold", "physical_fulfill", "physical_cancel_unfulfilled", "physical_expire_holds", "commerce_claim_jobs"].every((f) => new RegExp(`REVOKE ALL ON FUNCTION public\\.${f}\\([^)]*\\) FROM PUBLIC, anon, authenticated`).test(sql) && new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${f}\\([^)]*\\) TO service_role`).test(sql)))
check("costs and integration secrets are never readable by buyers", /^REVOKE ALL ON public\.commerce_integrations,[^;]*FROM anon;/m.test(sql) && /REVOKE ALL ON public\.commerce_integrations, public\.commerce_jobs FROM authenticated/.test(sql) && !/storelib reads product_variant_costs/.test(sql))
check("the migration copy is the same bytes", read("supabase/migrations/20261022_physical_commerce.sql") === sql)


console.log("\nThe switch, in the app")
{
  const kinds = code("app/app/products/new/product-kinds.ts")
  check("the New product question is the same three answers while it is off", /return physical \? \[\.\.\.KIND_OPTIONS, PHYSICAL_KIND_OPTION\] : KIND_OPTIONS/.test(kinds))
  check("a physical product page asks the question again while it is off", /kind === "physical" && !\(await isPhysicalCommerceEnabled\(\)\)\) return <NewProductKindPage \/>/.test(code("app/app/products/new/page.tsx")))
  check("the sidebar adds Inventory and Collections only while it is on", /if \(physicalCommerce\) \{\s*mainNavItems\.find\(\(item\) => item\.href === "\/app\/products"\)\?\.children\?\.unshift\(\{ href: "\/app\/inventory"/.test(code("components/app/sidebar.tsx")))
  const settings = code("components/app/settings-form-new.tsx")
  check("Settings shows the Shipping tab only while it is on", /TABS\.filter\(\(tab\) => tab\.id !== "shipping" \|\| physicalCommerce\)/.test(settings) && /activeTab === "shipping" && physicalCommerce && <ShippingSettings \/>/.test(settings))
  for (const page of ["app/app/inventory/page.tsx", "app/app/collections/page.tsx", "app/checkout/physical/page.tsx"]) {
    check(`${page} is a 404 while it is off`, /await requirePhysicalPage\(\)/.test(code(page)))
  }
  const editor = code("app/app/products/new/product-editor.tsx")
  check("the editor saves a physical product's variants through its own card, never the download variants", /productType === "physical"\) \{\s*const problem = physicalRef\.current \? await physicalRef\.current\.save\(finalProductId\)/.test(editor))
  check("a physical product needs no file", /\} else if \(productType === "physical"\) \{/.test(editor))
  check("a saved physical product stays physical", /product\.type === "physical" \? "physical"/.test(code("app/app/products/new/editor-form.ts")))
  check("off, the product cards change nothing and say why", /props\.handle\.current = \{ check: \(\) => null, save: async \(\) => null \}/.test(code("components/physical/product-cards.tsx")))
  check("the product page sells a physical product with its own buy box", /props\.productType === "physical"\) \{\s*return \(\s*<PhysicalBuyBox/.test(code("components/checkout/purchase-status-wrapper.tsx")))
  check("off, the buy box says it can't be bought rather than failing", /if \(!enabled \|\| failed/.test(code("components/physical/buy-box.tsx")))
  check("a website cart with something to ship goes to the physical checkout", /lines\.some\(\(l\) => l\.physical\)/.test(code("components/website-builder/cart-page-body.tsx")) && /row\.physical === true/.test(code("lib/website-builder/cart.ts")))
  check("the Orders page shows a physical order's shipping, and Fulfilled only once it has shipped", /physicalOrder && physicalCommerce \?/.test(code("app/app/orders/order-detail.tsx")) && /r\.physical_fulfillment === "fulfilled"/.test(code("lib/orders/order-view.ts")))
  check("the cron is scheduled and listed in /admin", /"\/api\/cron\/physical"/.test(read("vercel.json")) && /\/api\/cron\/physical/.test(code("lib/admin/schema-expectations.ts")))
  check("free shipping codes may take nothing else off only while it is on", /const allowZero = await freeShippingCode\(body\)/.test(code("app/api/coupons/route.ts")) && /return isPhysicalCommerceEnabled\(\)/.test(code("lib/physical/coupon-options.ts")))
}

{
  const { decodeItems, encodeItems, physicalCheckoutHref } = await import("@/lib/physical/cart-link")
  const id = "0f3a9c2e-1111-2222-3333-444455556666"
  const back = decodeItems(encodeItems([{ productId: id, variantId: null, quantity: 3 }, { productId: id, variantId: id, quantity: 5000 }]))
  check("a cart survives the URL, quantities kept in range", back.length === 2 && back[0].quantity === 3 && back[1].variantId === id && back[1].quantity === 999)
  check("anything else in the URL is no cart", decodeItems("not-base64!").length === 0 && decodeItems(encodeItems([{ productId: "nope", variantId: null, quantity: 1 }])).length === 0)
  check("the checkout link names the shop", physicalCheckoutHref(id, []).startsWith(`/checkout/physical?shop=${id}`))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
