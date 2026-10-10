/**
 * Round W: buyers' cases about orders (lib/support/cases, SQL part 117),
 * physical receipts that open the order page, and the store's identity on
 * what buyers get (part 118).
 *
 *   npx tsx tests/round-w.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { CASE_REASONS, readNewCase, reasonsFor, statusAfterMessage, caseLink } from "@/lib/support/cases"
import { orderCancelledEmail, refundEmail, returnEmail, shipmentEmail } from "@/lib/physical/email-templates"
import { CUSTOMER_EMAILS, previewCustomerEmail } from "@/lib/emails/customer-catalog"
import { quoteDelivery } from "@/lib/physical/rates"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWhose turn a case is")
check("a buyer's message puts it with the store", statusAfterMessage("buyer", { status: "buyer", escalated: false }) === "store")
check("the store's reply puts it with the buyer", statusAfterMessage("store", { status: "store", escalated: false }) === "buyer")
check("once Storelib is in, anyone's message puts it with Storelib", statusAfterMessage("buyer", { status: "buyer", escalated: true }) === "storelib" && statusAfterMessage("store", { status: "store", escalated: true }) === "storelib")
check("Storelib's reply goes to the buyer unless it says the store", statusAfterMessage("storelib", { status: "storelib", escalated: true }) === "buyer" && statusAfterMessage("storelib", { status: "storelib", escalated: true }, { to: "store" }) === "store")
check("an internal note changes nothing", statusAfterMessage("storelib", { status: "storelib", escalated: true }, { internal: true }) === "storelib")

console.log("\nWhat a buyer can say")
check("a parcel can arrive damaged; a download can't", reasonsFor("physical").includes("damaged") && !reasonsFor("digital").includes("damaged"))
check("a download can't be opened; a parcel has nothing to open", reasonsFor("digital").includes("access") && !reasonsFor("physical").includes("access"))
check("every reason the page offers is one the database takes", [...reasonsFor("physical"), ...reasonsFor("digital")].every((r) => CASE_REASONS.includes(r)))
const sql = read("supabase/sql/run-now/117_order_cases.sql")
check("and the database's list is the same one", CASE_REASONS.every((r) => sql.includes(`'${r}'`)))
check("a reason the order can't have is refused", readNewCase({ reason: "damaged", message: "it is broken, see photos" }, "digital").ok === false)
check("a message too short to help with is refused", readNewCase({ reason: "damaged", message: "bad" }, "physical").ok === false)
check("a proper one is taken", readNewCase({ reason: "not_arrived", message: "Ordered two weeks ago, nothing yet." }, "physical").ok === true)
check("the buyer's link carries the case and its key, nothing else", caseLink("https://storelib.com/", "abc", "k e y") === "https://storelib.com/order-help/abc?k=k%20e%20y")

console.log("\nWired")
const server = read("lib/support/cases-server.ts")
check("the buyer's email and name come from the order, never the request", /buyer_email: order\.buyerEmail/.test(server) && !/body\.email|input\.email/.test(server))
check("only the link's hash is stored, and the link is derived (the same in every email)", /access_hash: hash\(secret\)/.test(server) && /orderCaseSecret/.test(server))
check("an order's open case is joined, not doubled", /neq\("status", "resolved"\)/.test(server))
check("Storelib hears when it is asked in, and the store's emails reply to the buyer", /emailStorelib/.test(server) && /replyTo: from === "buyer" \? row\.buyer_email/.test(server))
const routes = read("tests/admin-key-routes.test.ts")
check("the buyer's two routes are public on purpose, and say why", /"order-help\/route\.ts"/.test(routes) && /"order-help\/\[id\]\/route\.ts"/.test(routes))
check("the store answers from Support › From buyers", /BuyerCaseThread/.test(read("app/app/support/support-client.tsx")))
check("Storelib answers from Resolution center › Buyer cases", /<BuyerCases onCount/.test(read("app/admin/resolution/resolution-center.tsx")))
check("the admin is told which SQL part is missing", /Run SQL part 114/.test(read("app/api/admin/support/route.ts")) && /SQL part 117/.test(read("app/api/admin/cases/route.ts")))
check("buyers get help from the order page and the receipt", /<OrderHelp kind="physical"/.test(read("app/checkout/physical/order/[token]/order-status-view.tsx")) && /<OrderHelp kind="digital"/.test(read("app/receipt/[token]/receipt-view.tsx")))
check("/order-help is a platform path on every host", /"\/order-help"\]/.test(read("proxy.ts")))

console.log("\nA thing that ships has no download receipt")
const receiptPage = read("app/receipt/[token]/page.tsx")
check("a receipt link for a physical item opens its order page", /physicalOrderPageFor\(admin, token\)/.test(receiptPage) && /redirect\(orderPage\)/.test(receiptPage))
const po = read("lib/receipts/physical-order.ts")
check("found by the Stripe session, or by the fingerprint a free order keeps", /stripe_session_id/.test(po) && /session_fingerprint/.test(po))

console.log("\nThe store signs what buyers get")
const id = read("lib/store/identity-server.ts")
check("logo: Store details, else the website's, else the photo", id.indexOf('"store"') < id.indexOf('"website"') && id.indexOf('"website"') < id.indexOf('"profile"'))
check("email: Store details, else support email, else the owner's, never a relay", /contact_email/.test(id) && /support_email/.test(id) && /\\\+slb-/.test(id))
check("SQL part 118 adds the logo and contact email", /logo_url/.test(read("supabase/sql/run-now/118_store_identity.sql")) && /contact_email/.test(read("supabase/sql/run-now/118_store_identity.sql")))

console.log("\nEmails a buyer gets, signed by the store")
{
  const brand = { logoUrl: "https://cdn.example.com/logo.png", email: "hi@shop.ro", phone: "+40 712 345 678", websiteUrl: "https://shop.ro", helpUrl: "https://storelib.com/checkout/physical/order/t#get-help" }
  const line = [{ title: "Mug", variantName: null, quantity: 1, cents: 0, imageUrl: null }]
  const base = { shopName: "Shop", orderNumber: "#1", buyerFirstName: "Ana", lines: line, carrier: "DHL", trackingNumber: "JD01", trackingUrl: "https://www.dhl.com/track?id=JD01", address: { line1: "Str 1", city: "Cluj", country: "RO" }, statusUrl: "https://x" }
  const shipped = shipmentEmail({ ...base, kind: "shipped", brand })
  check("the store's logo on top", shipped.html.includes('src="https://cdn.example.com/logo.png"'))
  check("its address, phone and website in the footer", /mailto:hi@shop\.ro/.test(shipped.html) && /tel:\+40712345678/.test(shipped.html) && /shop\.ro<\/a>/.test(shipped.html))
  check("Get help goes to the order page's help form", /#get-help/.test(shipped.html) && /Get help with this order/.test(shipped.text))
  check("where the parcel is: four steps, on its way lit", /On its way/.test(shipped.html) && /Out for delivery/.test(shipped.html))
  check("a logo that isn't https is never drawn", !/<img[^>]+javascript/.test(shipmentEmail({ ...base, kind: "shipped", brand: { logoUrl: "javascript:x" } }).html))
  check("part of an order says the rest follows", /The rest follow/.test(shipmentEmail({ ...base, kind: "shipped", partial: true }).html))
  check("a changed tracking number has its own subject", /New tracking number/.test(shipmentEmail({ ...base, kind: "tracking" }).subject))
  check("a cancelled order says the refund", /refunded/.test(orderCancelledEmail({ shopName: "Shop", orderNumber: "#1", buyerFirstName: null, reason: null, refundedCents: 500, totalCents: 500, currency: "EUR", lines: line, statusUrl: "https://x" }).html))
  check("a refund says how much this time", /This refund/.test(refundEmail({ shopName: "Shop", orderNumber: "#1", buyerFirstName: null, amountCents: 200, refundedCents: 200, totalCents: 500, currency: "EUR", paymentLabel: null, statusUrl: "https://x" }).html))
  const approved = returnEmail({ shopName: "Shop", orderNumber: "#1", status: "approved", note: null, refundedCents: 0, currency: "EUR", statusUrl: "https://x", returnAddress: ["Shop", "Str 1"] })
  check("an approved return says where to send it", /Send it to/.test(approved.html))
  check("every email in Settings › Customer emails previews", CUSTOMER_EMAILS.every((e) => !!previewCustomerEmail(e.id, { name: "Shop" })))
  const job = read("lib/physical/jobs-server.ts")
  check("the sender signs with the store's identity", /storeIdentity\(db, co\.creator_id\)/.test(job) && /brand/.test(job))
  const orders = read("lib/physical/orders-server.ts")
  check("cancelling emails the buyer; a refund does, once per total", /queueCancelledEmail\(db, checkoutId, creatorId\)/.test(orders) && (orders.match(/queueRefundEmail\(/g) ?? []).length >= 2 && /email:refund:\$\{checkoutId\}:\$\{refundedCents\}/.test(job))
  check("no em dashes or filler words", !/—|unlock|elevate|seamless|effortless|supercharge/i.test(shipped.html + approved.html))
}

console.log("\nThe box counts toward a weight based rate")
{
  const rate = { id: "r1", zoneId: "z", name: "Standard", kind: "weight", priceCents: 0, minValue: null, maxValue: null, tiers: [{ from: 0, priceCents: 500 }, { from: 1000, priceCents: 900 }], freeOverCents: null, minDays: null, maxDays: null, active: true, position: 0 }
  const profiles = [{ id: "p", name: "General", isDefault: true, zones: [{ id: "z", profileId: "p", name: "World", restOfWorld: true, countries: [], regions: [], rates: [rate] }] }]
  const lines = [{ shippingProfileId: null, quantity: 1, lineCents: 2000, weightGrams: 900, requiresShipping: true }]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = (g: number) => quoteDelivery(profiles as any, lines, "RO", undefined, { packageGrams: g })
  const price = (r: ReturnType<typeof q>) => (r.ok && r.options[0] ? r.options[0].priceCents : -1)
  check("900 g of items alone is in the first tier", price(q(0)) === 500, price(q(0)))
  check("with a 200 g box it's 1.1 kg, the next tier", price(q(200)) === 900, price(q(200)))
  check("checkout reads the default package's weight", /defaultPackageGrams\(db, priced\.creatorId\)/.test(read("lib/physical/checkout-pricing-server.ts")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
