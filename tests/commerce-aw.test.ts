/**
 * ===========================================================================
 *  ROUND AW: WHAT THE COMMERCE AUDIT FOUND, HELD IN PLACE
 * ===========================================================================
 * Pure functions run as they are; the rest is read from the source, the way
 * the suites around it pin a route.
 *
 *   refunds      a refund that settles late runs everything charge.refunded
 *                does; the Refund button restates a shipping order itself;
 *                one refund email per press; a duplicate purchase keeps its
 *                library entry; a part refund never reads as a full one
 *   receipts     an email that did not go is a failed step, tried again
 *   payments     a paid basket is never dropped because Stripe could not be
 *                read once; Cash out's lock is undone when Stripe is down
 *   memberships  a Stripe customer is reused only for the signed in member's
 *                own row; an address finds a guest's membership only when
 *                the account proved it; members' files are not downloads
 *   catalogue    another store's collection can't be rewritten; a plan is
 *                never sold through the basket; a course is one copy
 *   fulfilment   one hold per option and place; the loser of the paid race
 *                is not told "failed"; a cancelled order is not sent to a
 *                partner; "keep it" returns restock nothing; packing slips
 *   integrations ShipStation's numbered hosts; cards that say what is true
 *   analytics    a cash order tells its purchase
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { sent } from "@/lib/checkout/followups"
import { mergeHolds } from "@/lib/physical/checkout-server"
import { isShipStationResource } from "@/lib/integrations/shipping/shipstation"
import { appStatesFrom, type AppFacts } from "@/lib/integrations/storelib-apps"
import { customerToReuse } from "@/lib/memberships/billing"
import { paidElsewhere } from "@/lib/stripe/refund-sync"
import { saveCollection } from "@/lib/physical/collections-server"
import { refundEmailSettleMs } from "@/lib/physical/jobs-server"
import { orderCancelledEmail, returnEmail } from "@/lib/physical/email-templates"
import { FakeSupabase } from "./fake-supabase"

process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "test-service-role-key-for-commerce-aw-0123456789"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 600)}`}`)
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

async function main() {
  console.log("\nRefunds\n")
  {
    const hook = read("app/api/stripe/webhook/route.ts")
    const settled = hook.slice(hook.indexOf('event.type === "refund.updated"'), hook.indexOf("PAYOUT EVENTS"))
    check("refund.updated and charge.refunded both run the one settle", (settled.match(/await settleChargeRefund\(charge\)/g) ?? []).length === 2)
    const fn = hook.slice(hook.indexOf("async function settleChargeRefund"), hook.indexOf("async function handlePOST"))
    check("  which writes the lines, then restates the physical order", fn.indexOf("syncChargeRefund(supabaseAdmin") > 0 && fn.indexOf("syncChargeRefund(supabaseAdmin") < fn.indexOf("syncCheckoutRefunds(supabaseAdmin"))
    const route = read("app/api/stripe/refund/route.ts")
    check("the Refund button restates a shipping order on the server, after the line is written", /restateCheckoutRefunds\(admin, \[String\(order\.checkout_id\)\], "creator"\)/.test(route) && route.indexOf("refund_amount_cents: refundedTotal") < route.indexOf("restateCheckoutRefunds(admin"))

    const db = new FakeSupabase()
    db.table("orders", {}, [
      { id: "o1", buyer_id: "b", product_id: "p", variant_id: null, status: "refunded" },
      { id: "o2", buyer_id: "b", product_id: "p", variant_id: null, status: "completed" },
      { id: "o3", buyer_id: "b", product_id: "q", variant_id: "v", status: "completed" },
    ])
    check("bought twice, one refunded: the other paid order keeps the library entry", (await paidElsewhere(db as never, { id: "o1", buyer_id: "b", product_id: "p", variant_id: null })) === true)
    check("  the only order of its product and option does not", (await paidElsewhere(db as never, { id: "o3", buyer_id: "b", product_id: "q", variant_id: "v" })) === false && (await paidElsewhere(db as never, { id: "o1", buyer_id: null, product_id: "p", variant_id: null })) === false)
    const sync = read("lib/stripe/refund-sync.ts")
    check("  asked before every revoke: the event, the Refund button and the admin refund", /if \(await paidElsewhere\(db, row\)\) return/.test(sync) && /!\(await paidElsewhere\(admin, order\)\)/.test(route) && /paidElsewhere\(admin, \{ id: o\.id/.test(read("app/api/admin/orders/refund/route.ts")))

    const jobs = read("lib/physical/jobs-server.ts")
    check("a refund email waits for the press to finish (20 s unless set; the runner sets 0)", process.env.STORELIB_REFUND_EMAIL_SETTLE_MS === "0" && refundEmailSettleMs() === 0)
    const was = process.env.STORELIB_REFUND_EMAIL_SETTLE_MS
    delete process.env.STORELIB_REFUND_EMAIL_SETTLE_MS
    check("  twenty seconds by default, never more than two minutes", refundEmailSettleMs() === 20_000 && ((process.env.STORELIB_REFUND_EMAIL_SETTLE_MS = "999999999"), refundEmailSettleMs()) === 120_000)
    process.env.STORELIB_REFUND_EMAIL_SETTLE_MS = was
    check("  one whose total was passed says nothing, and the one that goes names all since the last told", /if \(Math\.max\(0, Number\(co\.refunded_cents \?\? 0\)\) > mine\) return/.test(jobs) && /if \(mine > told\) p = \{ \.\.\.p, amountCents: mine - told \}/.test(jobs))
  }

  console.log("\nReceipts that did not go\n")
  {
    let threw = ""
    try {
      sent({ success: false, error: "Mailgun 503" }, "The buyer's receipt")
    } catch (e) {
      threw = (e as Error).message
    }
    check("a send that failed throws, so its step is recorded failed and tried again", /The buyer's receipt not sent: Mailgun 503/.test(threw))
    check("  one that went, or was switched off by the seller, does not", sent({ success: true }, "x").success === true && sent({ success: true, skipped: true } as { success: boolean; skipped: boolean }, "x").skipped === true)
    check("  used by the single product, the basket and the shipping order", /if \(!mailed\.buyerSuccess \|\| !mailed\.sellerSuccess\) throw/.test(read("lib/checkout/fulfil-payment.ts")) && (read("lib/checkout/fulfil-cart-session.ts").match(/sent\(\n\s+await send/g) ?? []).length === 2 && /sent\(\n\s+await sendSellerNotificationEmail/.test(read("lib/physical/checkout-server.ts")))
  }

  console.log("\nPayments\n")
  {
    const cart = read("lib/checkout/fulfil-cart-session.ts")
    const ship = read("lib/physical/checkout-server.ts")
    const classify = /if \(code === 404 \|\| \(e as \{ type\?: string \}\)\?\.type === "StripeInvalidRequestError"\) return \{ ok: false, status: 404, reason: "not_found" \}\n\s+return \{ ok: false, status: 503, reason: "failed" \}/g
    check("Stripe unreadable is a 503 (the webhook is sent again), only a missing session a 404: basket", (cart.match(classify) ?? []).length === 2)
    check("  and the shipping order's session and intent", (ship.match(classify) ?? []).length === 2)
    check("  a checkout row that could not be read is a 503 too", /if \(readError\) return \{ ok: false, status: 503, reason: "failed" \}/.test(ship))
    const cash = read("app/api/stripe/cashout/route.ts")
    const lock = cash.indexOf(".gte(\"available_amount\", minCashout)")
    const guarded = cash.indexOf("stripeBalance = await stripe.balance.retrieve")
    check("Cash out: Stripe's balance read after the lock is guarded, and the lock undone when it fails", lock > 0 && guarded > lock && /catch \(balanceErr\) \{[\s\S]{0,400}available_amount: cashoutWalletMinor/.test(cash) && /Nothing was paid out/.test(cash))
  }

  console.log("\nMemberships\n")
  {
    const db = new FakeSupabase()
    db.table("memberships", {}, [{ id: "m1", buyer_email: "v@x.com", buyer_id: "victim", stripe_customer_id: "cus_V", created_at: "2026-01-01T00:00:00Z" }])
    check("a Stripe customer is reused for the signed in member's own row", (await customerToReuse(db as never, { userId: "victim" })) === "cus_V")
    check("  never for a guest, nor for another account typing that address", (await customerToReuse(db as never, { userId: null })) === null && (await customerToReuse(db as never, { userId: "attacker" })) === null)
    check("  and the lookup takes no email at all", !/\.eq\("buyer_email", buyer\.email\)/.test(read("lib/memberships/billing.ts")))
    const viewer = read("lib/memberships/viewer.ts")
    check("an address finds a guest's membership only when this account proved it", /currentEmailIsVerified\(db, user\)/.test(viewer) && /return proven \? viewer : \{ \.\.\.viewer, emailConfirmed: false \}/.test(viewer) && /return provenViewer\(viewerOf\(/.test(viewer))
    check("  on the library pages, the product page and the checkout too", ["lib/library/library-memberships.ts", "lib/memberships/product-page.ts", "app/(storelib)/account/library/memberships/[id]/page.tsx", "app/(storelib)/account/library/memberships/page.tsx", "app/api/memberships/checkout/route.ts"].every((f) => /provenViewer\(/.test(read(f))))
    check("members' files are not handed out by the one time download door", /type === "membership" && !isCreator\) return \{ \.\.\.NOT_FOUND, asset \}/.test(read("lib/receipts/download-access.ts")))
  }

  console.log("\nCatalogue\n")
  {
    const db = new FakeSupabase()
    db.table("product_collections", {}, [{ id: "c-a", creator_id: "store-a", title: "Theirs", handle: "theirs" }])
    db.table("product_collection_items", {}, [{ collection_id: "c-a", product_id: "p1", position: 0 }, { collection_id: "c-a", product_id: "p2", position: 1 }])
    db.table("products", {}, [{ id: "mine", creator_id: "store-b" }])
    const r = await saveCollection(db as never, "store-b", "c-a", { title: "x", kind: "manual", productIds: ["mine"] })
    check("another store's collection is not found, and its products stay as they were", r.ok === false && /could not be found/.test((r as { error: string }).error) && db.rows("product_collection_items").length === 2 && db.rows("product_collection_items").every((i) => i.product_id !== "mine") && db.rows("product_collections")[0].title === "Theirs", { r, items: db.rows("product_collection_items") })
    const pricing = read("lib/checkout/pricing.ts")
    check("a membership or a community plan is never sold through the basket", /product\.type === "membership" \|\| product\.type === "community"\) \{ dropped\.push/.test(pricing))
    check("a once per customer code still counts an order that was partly refunded", /\.in\("status", \["paid", "partially_refunded"\]\)/.test(read("lib/physical/checkout-pricing-server.ts")))
    const preset = read("lib/website-builder/theme-registry.ts")
    const product = preset.slice(preset.indexOf("const product: SectionInstance[] = ["), preset.indexOf("const product: SectionInstance[] = [") + 1800)
    check("a new store's product page promises no refund and prints no reviews it never received", !/full refund|testimonials\(/.test(product))
  }

  console.log("\nFulfilment\n")
  {
    const merged = mergeHolds([
      { variant_id: "v1", location_id: "l1", quantity: 1 },
      { variant_id: "v1", location_id: "l1", quantity: 1 },
      { variant_id: "v2", location_id: "l1", quantity: 3 },
      { variant_id: "v1", location_id: "l2", quantity: 2 },
    ])
    check("the same option on two lines is one hold of both (it was refused as a repeat)", merged.length === 3 && merged.find((h) => h.variant_id === "v1" && h.location_id === "l1")?.quantity === 2 && merged.find((h) => h.variant_id === "v2")?.quantity === 3 && merged.find((h) => h.location_id === "l2")?.quantity === 2, merged)
    const ship = read("lib/physical/checkout-server.ts")
    check("  and that is what is sent to the database", /p_lines: merged, p_expires/.test(ship))
    check("the loser of the paid race reads the row again before answering failed", /if \(!owns && co\.status !== "paid"\) \{[\s\S]{0,700}nowRow\?\.status !== "paid"/.test(ship))
    const jobs = read("lib/physical/jobs-server.ts")
    check("a cancelled order is not emailed to a supplier nor posted as order.paid", /function notToShip/.test(jobs) && /if \(notToShip\(co\)\) return/.test(jobs) && /=== "order\.paid" && notToShip\(co\)\) return/.test(jobs))
    const orders = read("lib/physical/orders-server.ts")
    check("\"keep it\" returns restock nothing and close without a parcel", /restock: method !== "no_return_needed" &&/.test(orders) && /keep && r\.status === "approved" && to === "completed"/.test(orders) && /const want = !keep &&/.test(orders))
    const keep = returnEmail({ shopName: "S", orderNumber: "1001", status: "approved", note: null, refundedCents: 0, currency: "USD", statusUrl: "https://storelib.com/o", returnAddress: null, keep: true })
    const back = returnEmail({ shopName: "S", orderNumber: "1001", status: "approved", note: null, refundedCents: 0, currency: "USD", statusUrl: "https://storelib.com/o", returnAddress: ["Stockroom", "5 Shop Lane"] })
    check("  and its email says so, with no address to send to", /keep the items/.test(keep.text) && !/Send it to|send them back/i.test(keep.text) && /send them back to the address below/.test(back.text) && /5 Shop Lane/.test(back.text), keep.text)
    const refused = orderCancelledEmail({ shopName: "S", orderNumber: "1001", buyerFirstName: "Ana", nothingPaid: true, refused: true, reason: null, refundedCents: 0, totalCents: 4500, currency: "USD", lines: [], statusUrl: "https://storelib.com/o" })
    check("a parcel refused at the door: no \"won't be shipped\", no talk of a refund, no return to pack", /not accepted on delivery/.test(refused.text) && /Nothing was charged/.test(refused.text) && !/won't be shipped|refund/i.test(refused.text) && /notifyBuyer: false \}\)/.test(orders), refused.text)
    check("a checkout's company reaches every email's address", /typeof a\.company === "string" && a\.company\.trim\(\) \? \{ company: a\.company\.trim\(\) \}/.test(jobs))
    check("a declined card is not mailed about after the buyer paid on a fresh try", /paidSince/.test(jobs) && /\.gte\("created_at", co\.created_at/.test(jobs))
    const pile = read("app/api/physical/orders/packing-slips/route.ts")
    const one = read("app/api/physical/orders/[id]/packing-slip/route.ts")
    check("the pile leaves out an order with nothing left to pack", /const left = order\.lines\.some\(\(l\) => l\.requiresShipping && l\.quantity - l\.fulfilled > 0\)/.test(pile) && /\|\| !left\) continue/.test(pile))
    check("a slip numbers its parcel among the live ones, and another order's shipment is not found", /liveShipments\.findIndex/.test(one) && /total: liveShipments\.length \|\| 1/.test(one) && /!order\.shipments\.some\(\(s\) => s\.id === shipmentId\)\) return new NextResponse\("Not found", \{ status: 404/.test(one))
    check("a corrected tracking number starts from no carrier state", /tracking_error: null, tracking_status: null \}/.test(read("lib/physical/tracking/accounts-server.ts")))
    check("a ShipStation shipment naming only shipped items ships nothing more", /const items = \(s\.items \?\? \[\]\)\.length \? listed :/.test(read("lib/integrations/shipping/shipstation-server.ts")))
    check("a carrier price is kept under the postcode however it was typed", /toUpperCase\(\)\.replace\(\/\[\\s-\]\/g, ""\)/.test(read("lib/integrations/shipping/checkout-rates-server.ts")))
  }

  console.log("\nIntegrations\n")
  {
    check("ShipStation's numbered hosts are its own; anything else is not", isShipStationResource("https://ssapi.shipstation.com/shipments?batchId=1") && isShipStationResource("https://ssapi6.shipstation.com/shipments?batchId=1") && isShipStationResource("https://ssapi11.shipstation.com/x") && !isShipStationResource("https://ssapi6.shipstation.com.evil.example/x") && !isShipStationResource("https://evilssapi.shipstation.com/x") && !isShipStationResource("http://ssapi6.shipstation.com/x") && !isShipStationResource("https://user:pw@ssapi6.shipstation.com/x") && !isShipStationResource("https://ssapi6.shipstation.com:8443/x"))
    const unknown = { paymentsReady: null, shippingRates: null, pickupOrLocal: null, taxRegions: null, reviewsOn: null, emailMarketing: null, domainLive: null, coupons: null, activeOffers: null, abandonedRecovery: null, requireAccount: null, moreMarkets: null, codeConnected: null } as AppFacts
    check("Courier tracking reads On only while parcels are followed", appStatesFrom({ ...unknown, trackingOn: true })["courier-tracking"] === "on" && appStatesFrom({ ...unknown, trackingOn: false })["courier-tracking"] === "setup" && appStatesFrom(unknown)["courier-tracking"] === null)
    check("the label apps' card says an address goes to them at checkout for a carrier calculated rate", /Carrier calculated rate asks \$\{name\} for a price at checkout/.test(read("lib/integrations/catalog.ts")))
  }

  console.log("\nAnalytics\n")
  {
    const ship = read("lib/physical/checkout-server.ts")
    check("an order placed in cash opens its page as just placed, so the store's tags hear the purchase", (ship.match(/\/checkout\/physical\/order\/\$\{encodeURIComponent\([^)]*\)\}\?paid=1`/g) ?? []).length === 6) // Changed on purpose (round AY): two more, the free order a retried key finds (freeOrderOfKey)
  }

  console.log(`\n${passed} passed, ${failed} failed\n`)
  if (failed) process.exit(1)
}

void main().catch((e) => {
  console.error(e)
  process.exit(1)
})
