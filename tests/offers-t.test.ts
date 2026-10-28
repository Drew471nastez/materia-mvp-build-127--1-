/**
 * Round T: upsells and bundles (lib/offers, SQL part 116). The arithmetic the
 * checkout charges by, and where it's wired in.
 *
 *   npx tsx tests/offers-t.test.ts
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { applyOffers, bundlePrice, bundlesWith, discountLabel, offerUnitPrice, readOffer, suggestionsFor, type Offer } from "@/lib/offers/offers"
import { untt } from "./i18n-source"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 300)}`}`)
}
const read = (p: string) => untt(readFileSync(join(process.cwd(), p), "utf8"), p)

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const C = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const offer = (o: Partial<Offer>): Offer => ({ id: "o1", kind: "bundle", title: "Buy it together", productIds: [A, B], triggerIds: [], discountType: "percent", discountValue: 10, active: true, ...o })
const line = (productId: string, unitCents: number, quantity = 1) => ({ productId, unitCents, quantity })

console.log("\nBundles")
let r = applyOffers([line(A, 2000), line(B, 3000)], [offer({})])
check("10% off each item of a complete set", r.discounts.join() === "200,300" && r.applied[0]?.savedCents === 500, r)
r = applyOffers([line(A, 2000, 2), line(B, 3000)], [offer({})])
check("two of one and one of the other is one set: one unit each", r.discounts.join() === "200,300", r)
r = applyOffers([line(A, 2000, 2), line(B, 3000, 2)], [offer({})])
check("two full sets, two units each", r.discounts.join() === "400,600", r)
r = applyOffers([line(A, 2000)], [offer({})])
check("half a bundle gets nothing", r.discounts.join() === "0" && r.applied.length === 0)
r = applyOffers([line(A, 2000), line(B, 3000)], [offer({ discountType: "fixed", discountValue: 500 })])
check("a fixed amount off the set, shared by price", r.discounts.join() === "200,300" && r.applied[0].savedCents === 500, r)
r = applyOffers([line(A, 2000), line(B, 3000)], [offer({ discountType: "fixed", discountValue: 99999 })])
check("never more than the set costs", r.discounts.join() === "2000,3000", r)
r = applyOffers([line(A, 2000), line(B, 3000)], [offer({ active: false }), offer({ discountType: "none", discountValue: 0 })])
check("an offer that's off, or has no discount, takes nothing", r.discounts.join() === "0,0" && r.applied.length === 0)
r = applyOffers([line(A, 2000), { productId: A, unitCents: 2500, quantity: 1 }, line(B, 3000)], [offer({})])
check("two options of one product in a bundle: the dearer one is in the set", r.discounts.join() === "0,250,300", r)

console.log("\nCheckout offers")
const upsell = offer({ id: "o2", kind: "checkout", title: "Add a jar", productIds: [C], discountType: "percent", discountValue: 50 })
r = applyOffers([line(A, 2000), line(C, 1000, 3)], [upsell])
check("one of it at the offer's price, when the cart has something else", r.discounts.join() === "0,500", r)
r = applyOffers([line(C, 1000)], [upsell])
check("on its own it's a normal sale", r.discounts.join() === "0")
const onlyWithD = { ...upsell, triggerIds: [D] }
check("with trigger products, only when one of them is in the cart", applyOffers([line(A, 2000), line(C, 1000)], [onlyWithD]).discounts.join() === "0,0" && applyOffers([line(D, 2000), line(C, 1000)], [onlyWithD]).discounts.join() === "0,500")
r = applyOffers([line(A, 2000), line(B, 3000)], [offer({}), { ...upsell, productIds: [B] }])
check("a unit already in a bundle isn't discounted again", r.discounts.join() === "200,300" && r.applied.length === 1, r)
r = applyOffers([line(A, 2000), line(C, 1000)], [{ ...upsell, discountType: "fixed", discountValue: 5000 }])
check("a fixed amount never takes the item below zero", r.discounts.join() === "0,1000", r)

console.log("\nWhat pages show")
check("suggested when it isn't in the cart and the cart qualifies", suggestionsFor([line(A, 2000)], [upsell]).length === 1 && suggestionsFor([line(A, 2000), line(C, 1000)], [upsell]).length === 0 && suggestionsFor([], [upsell]).length === 0)
check("a product's page shows the bundles it's in", bundlesWith(A, [offer({}), upsell]).length === 1 && bundlesWith(C, [offer({})]).length === 0)
check("the set's price for the page", JSON.stringify(bundlePrice({ discountType: "percent", discountValue: 10 }, [2000, 3000])) === '{"fullCents":5000,"priceCents":4500}' && bundlePrice({ discountType: "fixed", discountValue: 700 }, [2000, 3000]).priceCents === 4300)
check("one item's offer price", offerUnitPrice({ discountType: "percent", discountValue: 50 }, 1000) === 500 && offerUnitPrice({ discountType: "none", discountValue: 0 }, 1000) === 1000)
check("labels", discountLabel({ discountType: "percent", discountValue: 15 }) === "15% off" && discountLabel({ discountType: "fixed", discountValue: 500 }) === "$5.00 off" && discountLabel({ discountType: "none", discountValue: 0 }) === "No discount")

console.log("\nWhat a store can save")
check("a bundle needs 2 to 5 products", !readOffer({ kind: "bundle", title: "x", productIds: [A] }).ok && !readOffer({ kind: "bundle", title: "x", productIds: [A, B, C, D, A.replace("a", "e"), B.replace("b", "f")] }).ok)
check("a percent is 1 to 90", !readOffer({ kind: "bundle", title: "x", productIds: [A, B], discountType: "percent", discountValue: 95 }).ok)
const co = readOffer({ kind: "checkout", title: " Add a jar ", productIds: [C], triggerIds: [C, D, "not-an-id"], discountType: "fixed", discountValue: 500 })
check("a checkout offer never triggers itself, and only ids count", co.ok && co.offer.triggerIds.join() === D && co.offer.title === "Add a jar", co)
check("no name, no offer", !readOffer({ kind: "bundle", title: "  ", productIds: [A, B] }).ok)

console.log("\nWired in")
const pricing = read("lib/physical/checkout-pricing-server.ts")
/* Changed on purpose (round V): the lines go to applyOffers with their collections and pay what you want marks (offerLines). */
check("the checkout applies them on the server, to the cart it priced, before any code", /const \{ offers \} = await loadOffers\(db, creatorId, \{ activeOnly: true \}\)/.test(pricing) && /applyOffers\(offerLines, offers/.test(pricing) && pricing.indexOf("applyOffers(") < pricing.indexOf("const typed ="))
/* Changed on purpose (round V): the code comes off what's left through stackWithCode, which also keeps each offer's rule for codes (tests/offers-v.test.ts checks the arithmetic). */
check("a code applies to what's left, adding to the offer's discount", /stackWithCode\(offerLines, offers, \(remaining\) => \(\{ discounts: Number\(c\.discount_value\) > 0 \? lineDiscounts\(c, remaining, applies\)/.test(pricing) && /l\.discountCents = Math\.min\(l\.unitCents \* l\.quantity, stacked\.discounts\[i\] \+ discounts\[i\]\)/.test(pricing))
const quote = read("app/api/physical/checkout/quote/route.ts")
/* Changed on purpose (round V): a free shipping offer saves nothing off the items, so only offers that saved something are lines. */
check("the checkout page hears what it got and what it could add", /offers: priced\.offers\.filter\(\(o\) => o\.savedCents > 0\)\.map/.test(quote) && /suggestions: await suggestionCards/.test(quote))
/* Changed on purpose (round V): offers apply in the basket of downloads too, so the product page's are a store's whatever it sells. */
/* Changed on purpose (round AF): the route reads lib/offers/offers-public.ts, the one public read of a product's offers. */
check("bundles for a product page: a store's own, published, not behind the physical switch", !/physicalApiGate\(\)/.test(read("app/api/offers/bundles/route.ts")) && /productOffers\(/.test(read("app/api/offers/bundles/route.ts")) && /p\.status !== "published"/.test(read("lib/offers/offers-public.ts")))
const store = read("app/api/store/offers/route.ts")
/* Changed on purpose (round V): the owner check alone (shopCaller), as collections have it. */
check("a store edits its own, and it's in the activity log", /shopCaller\("marketing"\)/.test(store) /* Round 40: a team member reaches offers with Marketing. */ && /offer\.added/.test(store) && /saveOffer\(c\.db, c\.creatorId/.test(store))
check("every product an offer names must be the store's", /One of those products isn't in your store any more/.test(read("lib/offers/offers-server.ts")))
check("the product page and website product section show bundles", /<BundleOffers/.test(read("components/physical/buy-box.tsx")))
check("the checkout shows Add to your order", /<CheckoutSuggestions/.test(read("app/checkout/physical/physical-checkout.tsx")))
/* Changed on purpose (round V): for every store. */
check("Products has Upsells and bundles beside Coupons", /mainNavItems\.find\([\s\S]{0,200}\{ href: "\/app\/offers", label: "Upsells and bundles" \}/.test(read("components/app/sidebar.tsx")))
const sql = read("supabase/sql/run-now/116_store_offers.sql")
check("SQL: the migration is the same part, owner reads, only the server writes", sql === read("supabase/migrations/20261211_store_offers.sql") && /store_offers_owner_read/.test(sql) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.store_offers FROM PUBLIC, anon, authenticated/.test(sql))
check("SQL: the shapes are held by the database too", /cardinality\(product_ids\) BETWEEN 2 AND 5/.test(sql) && /discount_value BETWEEN 1 AND 90/.test(sql))
check("listed in the README and the check after", /116_store_offers\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p116_store_offers/.test(read("supabase/sql/run-now/99_check_after.sql")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
