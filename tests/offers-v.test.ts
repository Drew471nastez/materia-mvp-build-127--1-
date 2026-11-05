/**
 * Round V: upsells and bundles, end to end (lib/offers, SQL parts 116 and 213).
 *
 *   ELIGIBILITY   each kind: a complete bundle, a checkout offer by any
 *                 order, by products, by collections, by an order minimum;
 *                 where it shows (product page, cart, checkout); its dates
 *   PRICE MATH    bundle percent and fixed, a checkout offer's percent and
 *                 fixed, the limit per order, pay what you want never
 *                 discounted, free shipping, never below zero
 *   CODES         a code on what's left; an offer that doesn't combine:
 *                 whichever saves more, the code refused with the reason
 *   THE BASKET    priceCart from a database: the offer in the lines, the
 *                 total, a code with it, two stores apart
 *   THE STORE     every modal setting is a stored field and a rule; saving
 *                 is the owner's own products and collections only; part
 *                 213 not run yet degrades with a plain message
 *   WIRING        the product page, the website block, the cart drawer and
 *                 page, both checkouts, the /app page and the SQL
 *
 *   npx tsx tests/offers-v.test.ts          (server-only parts need the runner,
 *   OFFERS_PLAIN=1 npx tsx ...              or this to skip them by name)
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  applyOffers,
  bundleCompletions,
  bundlePrice,
  bundlesWith,
  discountLabel,
  offerLive,
  offerState,
  offerUnitPrice,
  placementsOf,
  readOffer,
  stackWithCode,
  suggestionsFor,
  triggered,
  upsellsFor,
  type Offer,
} from "@/lib/offers/offers"
import { loadOffers, offerLinesFor, offerOf } from "@/lib/offers/offers-read"
import { priceCart } from "@/lib/checkout/pricing"
import { bodyOf, draftOf, problemsOf } from "@/app/(storelib)/app/offers/offer-draft"
import { withOffersBlock, OFFERS_ADDED, AUTO_OFFERS_ID } from "@/lib/website-builder/product-page"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail).slice(0, 400)}`}`)
}
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

const uuid = (n: number) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`
const A = uuid(1)
const B = uuid(2)
const C = uuid(3)
const D = uuid(4)
const E = uuid(5)
const COLL = uuid(70)
const NOW = new Date("2026-10-17T12:00:00Z")
const offer = (o: Partial<Offer>): Offer => ({ id: "o1", kind: "bundle", title: "Buy it together", productIds: [A, B], triggerIds: [], discountType: "percent", discountValue: 10, active: true, ...o })
const upsell = (o: Partial<Offer> = {}): Offer => offer({ id: "u1", kind: "checkout", title: "Add a jar", productIds: [C], discountType: "percent", discountValue: 50, ...o })
const line = (productId: string, unitCents: number, quantity = 1, extra: Record<string, unknown> = {}) => ({ productId, unitCents, quantity, ...extra })
const sum = (a: number[]) => a.reduce((n, x) => n + x, 0)

type Row = Record<string, unknown>

/** Tables answering the chains the offers code and the basket's pricing use, with every write recorded and filtered as PostgREST would. */
function fakeDb(tables: Record<string, Row[]>, opts: { no213?: boolean } = {}) {
  const writes: { table: string; op: string; row?: Row; filters: string[] }[] = []
  const NEW = ["trigger_collection_ids", "placements", "starts_at", "ends_at", "combines_with_codes", "max_per_order", "min_subtotal_cents"]
  const db = {
    writes,
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      const said: string[] = []
      let op: "select" | "update" | "insert" | "delete" = "select"
      let payload: Row | null = null
      let columns = "*"
      let head = false
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const missing = () => (opts.no213 && table === "store_offers" ? NEW.find((c) => columns.includes(c) || (payload ? c in payload : false)) : undefined)
      const answer = () => {
        const gone = missing()
        if (gone) return { data: null, error: { code: "42703", message: `column store_offers.${gone} does not exist` }, count: null }
        if (op === "insert") {
          const row = { id: uuid(900 + (tables[table]?.length ?? 0)), created_at: NOW.toISOString(), ...payload } as Row
          ;(tables[table] ??= []).push(row)
          writes.push({ table, op, row, filters: said })
          return { data: row, error: null }
        }
        const hit = rows()
        if (op === "update") {
          for (const r of hit) Object.assign(r, payload)
          writes.push({ table, op, row: payload ?? undefined, filters: said })
        }
        if (op === "delete") {
          tables[table] = (tables[table] ?? []).filter((r) => !hit.includes(r))
          writes.push({ table, op, filters: said })
        }
        return { data: hit, error: null, count: head ? hit.length : null }
      }
      const chain: Record<string, unknown> = {
        select: (cols?: string, o?: { head?: boolean }) => ((columns = cols ?? "*"), (head = !!o?.head), chain),
        update: (row: Row) => ((op = "update"), (payload = row), chain),
        insert: (row: Row) => ((op = "insert"), (payload = row), chain),
        delete: () => ((op = "delete"), chain),
        eq: (col: string, v: unknown) => (said.push(`${col}=${v}`), filters.push((r) => r[col] === v), chain),
        neq: (col: string, v: unknown) => (filters.push((r) => r[col] !== v), chain),
        in: (col: string, vs: unknown[]) => (said.push(`${col} in`), filters.push((r) => vs.includes(r[col])), chain),
        ilike: (col: string, p: string) => (filters.push((r) => typeof r[col] === "string" && (r[col] as string).toLowerCase() === p.toLowerCase()), chain),
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => {
          const a = answer()
          return { ...a, data: Array.isArray(a.data) ? (a.data[0] ?? null) : a.data }
        },
        single: async () => {
          const a = answer()
          return { ...a, data: Array.isArray(a.data) ? (a.data[0] ?? null) : a.data }
        },
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      }
      return chain
    },
  }
  return db
}

const offerRow = (o: Partial<Row>): Row => ({ id: uuid(100), creator_id: "c1", kind: "bundle", title: "Buy it together", product_ids: [A, B], trigger_product_ids: [], discount_type: "percent", discount_value: 10, active: true, position: 0, trigger_collection_ids: [], placements: ["product", "cart", "checkout"], starts_at: null, ends_at: null, combines_with_codes: true, max_per_order: null, min_subtotal_cents: null, ...o })
const product = (id: string, creator: string, price: number, over: Row = {}): Row => ({ id, title: `P${id.slice(7, 8)}`, slug: `p${id.slice(7, 8)}`, price_cents: price, pay_what_you_want: false, pwyw_min_price_cents: null, thumbnail_url: null, type: "digital", status: "published", creator_id: creator, ...over })
const couponRow = (over: Row = {}): Row => ({ id: "cp1", code: "SAVE20", creator_id: "c1", discount_type: "percentage", discount_value: 20, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, min_purchase_cents: null, ...over })

async function main() {
  /* ─────────────────────────────── eligibility ─────────────────────────────── */
  console.log("\nEligibility: each kind, by its own rule")
  {
    check("bundle: a complete set qualifies, half a set doesn't", applyOffers([line(A, 2000), line(B, 3000)], [offer({})], { now: NOW }).applied.length === 1 && applyOffers([line(A, 2000)], [offer({})], { now: NOW }).applied.length === 0)
    check("upsell, any order: anything else in the cart triggers it, on its own it doesn't", triggered(upsell(), [line(A, 1), line(C, 1)]) && !triggered(upsell(), [line(C, 1)]))
    check("upsell, certain products: only one of them triggers it", triggered(upsell({ triggerIds: [D] }), [line(D, 1), line(C, 1)]) && !triggered(upsell({ triggerIds: [D] }), [line(A, 1), line(C, 1)]))
    const inColl = [line(E, 1000, 1, { collectionIds: [COLL] }), line(C, 1000)]
    check("upsell, a collection: a product from it triggers it", triggered(upsell({ triggerCollectionIds: [COLL] }), inColl) && !triggered(upsell({ triggerCollectionIds: [COLL] }), [line(A, 1000, 1, { collectionIds: [] }), line(C, 1000)]))
    check("upsell, a minimum: the rest of the cart has to be worth it", !triggered(upsell({ minSubtotalCents: 5000 }), [line(A, 4999), line(C, 1000)]) && triggered(upsell({ minSubtotalCents: 5000 }), [line(A, 2500, 2), line(C, 1000)]))
    const live = upsell({ placements: ["product"] })
    check("where it shows: an upsell only on product pages isn't suggested in the cart or the checkout", suggestionsFor([line(A, 1000)], [live], { placement: "cart", now: NOW }).length === 0 && suggestionsFor([line(A, 1000)], [live], { placement: "checkout", now: NOW }).length === 0 && upsellsFor(A, [], [live], { now: NOW }).length === 1)
    check("  and one in the cart only isn't on the product page", upsellsFor(A, [], [upsell({ placements: ["cart"] })], { now: NOW }).length === 0 && suggestionsFor([line(A, 1000)], [upsell({ placements: ["cart"] })], { placement: "cart", now: NOW }).length === 1)
    check("  a bundle is never added at the checkout: its places are product page and cart", placementsOf({ kind: "bundle", placements: ["checkout", "product"] }).join() === "product" && placementsOf({ kind: "bundle" }).join() === "product,cart")
    check("  a bundle hidden from product pages isn't on one", bundlesWith(A, [offer({ placements: ["cart"] })], { now: NOW }).length === 0 && bundlesWith(A, [offer({})], { now: NOW }).length === 1)
    check("  but it still applies at checkout wherever it shows", applyOffers([line(A, 2000), line(B, 3000)], [offer({ placements: ["cart"] })], { now: NOW }).discounts.join() === "200,300")
    check("in the cart, a bundle it holds part of asks for the rest", JSON.stringify(bundleCompletions([line(A, 2000)], [offer({})], { now: NOW }).map((c) => c.missing)) === JSON.stringify([[B]]) && bundleCompletions([line(A, 2000), line(B, 3000)], [offer({})], { now: NOW }).length === 0)
    check("upsell on a product page: triggered by this product, by its collection, or by any order; never itself", upsellsFor(D, [], [upsell({ triggerIds: [D] })], { now: NOW }).length === 1 && upsellsFor(E, [COLL], [upsell({ triggerCollectionIds: [COLL] })], { now: NOW }).length === 1 && upsellsFor(A, [], [upsell({ triggerIds: [D] })], { now: NOW }).length === 0 && upsellsFor(C, [], [upsell()], { now: NOW }).length === 0)
  }

  console.log("\nScheduling")
  {
    const later = upsell({ startsAt: "2026-10-18T00:00:00Z" })
    const over = upsell({ endsAt: "2026-10-17T11:59:59Z" })
    check("states: on, scheduled, ended, off", offerState(upsell(), NOW) === "active" && offerState(later, NOW) === "scheduled" && offerState(over, NOW) === "ended" && offerState(upsell({ active: false }), NOW) === "off")
    check("before its start it neither applies nor shows", applyOffers([line(A, 1000), line(C, 1000)], [later], { now: NOW }).applied.length === 0 && suggestionsFor([line(A, 1000)], [later], { now: NOW }).length === 0)
    check("from its end it neither applies nor shows", applyOffers([line(A, 1000), line(C, 1000)], [over], { now: NOW }).applied.length === 0 && bundlesWith(A, [offer({ endsAt: "2026-10-01T00:00:00Z" })], { now: NOW }).length === 0)
    check("between them it does", offerLive(upsell({ startsAt: "2026-10-01T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }), NOW) && applyOffers([line(A, 1000), line(C, 1000)], [upsell({ startsAt: "2026-10-01T00:00:00Z" })], { now: NOW }).discounts.join() === "0,500")
  }

  /* ─────────────────────────────── price math ─────────────────────────────── */
  console.log("\nPrice math, on the server's prices")
  {
    let r = applyOffers([line(A, 2000), line(B, 3000)], [offer({})], { now: NOW })
    check("bundle 10%: off every item of the set, 200 and 300", r.discounts.join() === "200,300" && r.applied[0].savedCents === 500, r)
    r = applyOffers([line(A, 2000), line(B, 3000)], [offer({ discountType: "fixed", discountValue: 1000 })], { now: NOW })
    check("bundle fixed $10: shared by price, 400 and 600", r.discounts.join() === "400,600", r)
    r = applyOffers([line(A, 2000, 3), line(B, 3000, 3)], [offer({ maxPerOrder: 2 })], { now: NOW })
    check("bundle limited to 2 sets per order: three sets in the cart, two discounted", r.discounts.join() === "400,600", r)
    r = applyOffers([line(A, 2000), line(C, 1000, 3)], [upsell()], { now: NOW })
    check("upsell 50%: one of it at the offer's price by default", r.discounts.join() === "0,500", r)
    r = applyOffers([line(A, 2000), line(C, 1000, 3)], [upsell({ maxPerOrder: 2 })], { now: NOW })
    check("upsell limited to 2 per order: two of three discounted", r.discounts.join() === "0,1000", r)
    r = applyOffers([line(A, 2000), line(C, 1000)], [upsell({ discountType: "fixed", discountValue: 300 })], { now: NOW })
    check("upsell fixed $3: off the item", r.discounts.join() === "0,300", r)
    r = applyOffers([line(A, 2000), line(C, 1000)], [upsell({ discountType: "fixed", discountValue: 99999 })], { now: NOW })
    check("never below zero", r.discounts.join() === "0,1000", r)
    r = applyOffers([line(A, 2000, 1, { payWhatYouWant: true }), line(B, 3000)], [offer({})], { now: NOW })
    check("pay what you want counts toward the set but isn't discounted", r.discounts.join() === "0,300", r)
    r = applyOffers([line(A, 2000, 1, { payWhatYouWant: true }), line(B, 3000)], [offer({ discountType: "fixed", discountValue: 500 })], { now: NOW })
    check("  a fixed amount goes on the rest of the set", r.discounts.join() === "0,500", r)
    r = applyOffers([line(A, 2000), line(C, 1000, 1, { payWhatYouWant: true })], [upsell()], { now: NOW })
    check("  an upsell of a pay what you want product takes nothing off it", r.discounts.join() === "0,0", r)
    r = applyOffers([line(A, 2000), line(B, 3000)], [offer({ discountType: "free_shipping", discountValue: 0 })], { now: NOW })
    check("free shipping: the order ships free, nothing off the items", r.freeShipping && r.discounts.join() === "0,0" && r.applied[0]?.freeShipping === true, r)
    check("  only once the set is complete", !applyOffers([line(A, 2000)], [offer({ discountType: "free_shipping", discountValue: 0 })], { now: NOW }).freeShipping)
    r = applyOffers([line(A, 2000), line(B, 3000)], [offer({}), upsell({ productIds: [B] })], { now: NOW })
    check("each unit is discounted once: a bundle's unit isn't an upsell's too", r.discounts.join() === "200,300" && r.applied.length === 1, r)
    check("the page's prices agree with the checkout's", bundlePrice({ discountType: "percent", discountValue: 10 }, [2000, 3000]).priceCents === 4500 && offerUnitPrice({ discountType: "percent", discountValue: 50 }, 1000) === 500)
    check("labels in the store's currency", discountLabel({ discountType: "fixed", discountValue: 500 }, (c) => `€${(c / 100).toFixed(2)}`) === "€5.00 off" && discountLabel({ discountType: "free_shipping", discountValue: 0 }) === "Free shipping")
  }

  /* ─────────────────────────────── codes ─────────────────────────────── */
  console.log("\nWith a discount code")
  {
    const twentyPercent = (rem: number[]) => ({ discounts: rem.map((c) => Math.round(c * 0.2)) })
    let s = stackWithCode([line(A, 2000), line(B, 3000)], [offer({})], twentyPercent, { now: NOW })
    check("combines: 10% off the set, then 20% off what's left (360 and 540)", s.error === null && s.discounts.join() === "200,300" && s.codeDiscounts.join() === "360,540", s)
    s = stackWithCode([line(A, 2000), line(B, 3000)], [offer({ combinesWithCodes: false })], twentyPercent, { now: NOW })
    check("doesn't combine, the code saves more (1000 > 500): the code alone", s.error === null && s.discounts.join() === "0,0" && s.codeDiscounts.join() === "400,600" && s.applied.length === 0, s)
    s = stackWithCode([line(A, 2000), line(B, 3000)], [offer({ combinesWithCodes: false, discountValue: 50 })], twentyPercent, { now: NOW })
    check("doesn't combine, the offer saves more (2500 > 1000): the code is refused with the reason", s.error !== null && /can't be used with Buy it together/.test(s.error) && s.discounts.join() === "1000,1500", s)
    s = stackWithCode([line(A, 2000), line(B, 3000)], [offer({})], () => ({ error: "That code is not valid." }), { now: NOW })
    check("a code that doesn't apply says why", s.error === "That code is not valid.")
    s = stackWithCode([line(A, 2000), line(B, 3000)], [offer({})], null, { now: NOW })
    check("no code: the offers alone", s.error === null && sum(s.codeDiscounts) === 0 && s.discounts.join() === "200,300")
  }

  /* ─────────────────────────────── the basket ─────────────────────────────── */
  console.log("\nThe basket, priced from the database (lib/checkout/pricing priceCart)")
  {
    const shop = (offers: Row[], coupons: Row[] = [], extra: Row[] = []) =>
      fakeDb({
        products: [product(A, "c1", 2000), product(B, "c1", 3000), product(C, "c1", 1000), product(D, "c2", 4000), ...extra],
        product_variants: [],
        entitlements: [],
        coupons,
        store_offers: offers,
        store_settings: [],
        product_collections: [{ id: COLL, creator_id: "c1", kind: "manual", rules: [], match: "all" }],
        product_collection_items: [{ collection_id: COLL, product_id: A }],
      })
    let r = await priceCart(shop([offerRow({})]), { items: [{ productId: A }, { productId: B }] })
    check("a bundle in the basket: 10% off each, total 4500", r.ok === true && r.lines.map((l) => l.item.discountCents).join() === "200,300" && r.totalCents === 4500 && r.offerCents === 500 && r.offers.length === 1, r)
    r = await priceCart(shop([offerRow({ kind: "checkout", product_ids: [C], discount_value: 50, trigger_collection_ids: [COLL] })]), { items: [{ productId: A }, { productId: C }] })
    check("an upsell triggered by a collection: half off it (the bump goes into the payment)", r.ok === true && r.lines.map((l) => l.item.discountCents).join() === "0,500" && r.totalCents === 2500, r)
    r = await priceCart(shop([offerRow({})], [couponRow()]), { items: [{ productId: A }, { productId: B }], couponCode: "save20" })
    check("with a code: the code on what's left, 4500 less 900 = 3600", r.ok === true && r.totalCents === 3600 && r.offerCents === 500 && r.discountCents === 1400 && r.coupon?.code === "SAVE20", r)
    r = await priceCart(shop([offerRow({ combines_with_codes: false, discount_value: 50 })], [couponRow()]), { items: [{ productId: A }, { productId: B }], couponCode: "save20" })
    check("an offer that saves more and doesn't combine refuses the code", r.ok === false && /can't be used with/.test((r as { error: string }).error), r)
    r = await priceCart(shop([offerRow({ starts_at: "2099-01-01T00:00:00Z" })]), { items: [{ productId: A }, { productId: B }] })
    check("a scheduled offer takes nothing off yet", r.ok === true && r.totalCents === 5000 && r.offers.length === 0, r)
    r = await priceCart(shop([offerRow({ active: false })]), { items: [{ productId: A }, { productId: B }] })
    check("an offer switched off takes nothing off", r.ok === true && r.totalCents === 5000)
    r = await priceCart(shop([offerRow({ product_ids: [A, D] })]), { items: [{ productId: A }, { productId: D }] })
    check("a store's bundle naming another store's product never discounts it", r.ok === true && r.discountCents === 0, r)
    r = await priceCart(shop([offerRow({})], [], [product(E, "c1", 1500, { pay_what_you_want: true, pwyw_min_price_cents: 1500, price_cents: 0 })]), { items: [{ productId: A }, { productId: B }] })
    check("prices are the database's, whatever the page said", r.ok === true && r.subtotalCents === 5000)
  }

  /* ─────────────────────────────── the store's own ─────────────────────────────── */
  console.log("\nEvery setting in the editor is a stored field and a rule")
  {
    const saved: Offer = { id: uuid(100), kind: "checkout", title: "Add a jar", productIds: [C], triggerIds: [], triggerCollectionIds: [COLL], discountType: "fixed", discountValue: 350, active: true, placements: ["cart", "checkout"], startsAt: "2026-10-20T09:00:00.000Z", endsAt: "2026-11-01T09:00:00.000Z", combinesWithCodes: false, maxPerOrder: 3, minSubtotalCents: 2500 }
    const draft = draftOf(saved, "checkout", "USD")
    const body = bodyOf(draft, "USD")
    const back = readOffer(body as unknown as Record<string, unknown>)
    const o = back.ok === true ? back.offer : null
    check("the form reads a saved offer back exactly (draftOf, bodyOf, readOffer)", !!o && o.title === saved.title && o.productIds.join() === C && o.discountType === "fixed" && o.discountValue === 350 && o.triggerCollectionIds!.join() === COLL && o.placements!.join() === "cart,checkout" && o.startsAt === saved.startsAt && o.endsAt === saved.endsAt && o.combinesWithCodes === false && o.maxPerOrder === 3 && o.minSubtotalCents === 2500 && o.active === true, { body, o })
    const row = offerRow({ kind: "checkout", product_ids: [C], trigger_collection_ids: [COLL], discount_type: "fixed", discount_value: 350, placements: ["cart", "checkout"], starts_at: saved.startsAt, ends_at: saved.endsAt, combines_with_codes: false, max_per_order: 3, min_subtotal_cents: 2500 })
    const fromRow = offerOf(row as never)
    check("and each column reads back into the same setting (offerOf)", fromRow.triggerCollectionIds!.join() === COLL && fromRow.placements!.join() === "cart,checkout" && fromRow.startsAt === saved.startsAt && fromRow.combinesWithCodes === false && fromRow.maxPerOrder === 3 && fromRow.minSubtotalCents === 2500)
    const editor = read("app/(storelib)/app/offers/offer-editor.tsx")
    const rules: [string, RegExp, boolean][] = [
      ["kind: bundle or upsell", /label=\{tt\("Kind of offer"\)\}/, applyOffers([line(A, 1000), line(B, 1000)], [offer({})]).applied.length === 1 && applyOffers([line(A, 1000), line(C, 1000)], [upsell()]).applied.length === 1],
      ["name buyers see", /id="offer-title"/, readOffer({ kind: "bundle", title: "  ", productIds: [A, B] }).ok === false],
      ["products", /name="offer-products"/, readOffer({ kind: "bundle", title: "x", productIds: [A] }).ok === false],
      ["trigger products", /name="offer-triggers"/, triggered(upsell({ triggerIds: [D] }), [line(D, 1), line(C, 1)])],
      ["trigger collections", /triggerCollectionIds: toggle\(d\.triggerCollectionIds/, triggered(upsell({ triggerCollectionIds: [COLL] }), [line(E, 1, 1, { collectionIds: [COLL] }), line(C, 1)])],
      ["order minimum", /id="offer-minimum"/, !triggered(upsell({ minSubtotalCents: 100 }), [line(A, 99), line(C, 1)])],
      ["discount type and amount", /label=\{tt\("Discount type"\)\}[\s\S]*id="offer-amount"/, applyOffers([line(A, 2000), line(C, 1000)], [upsell({ discountType: "fixed", discountValue: 300 })]).discounts[1] === 300],
      ["where it shows", /data-place=\{p\}/, suggestionsFor([line(A, 1)], [upsell({ placements: ["product"] })]).length === 0],
      ["starts and ends", /id="offer-start"[\s\S]*id="offer-end"/, offerState(upsell({ startsAt: "2099-01-01T00:00:00Z" })) === "scheduled"],
      ["limit per order", /id="offer-limit"/, applyOffers([line(A, 1), line(C, 100, 3)], [upsell({ maxPerOrder: 2 })]).discounts[1] === 100],
      ["codes can be used too", /title=\{tt\("Discount codes can be used too"\)\}/, stackWithCode([line(A, 2000), line(B, 3000)], [offer({ combinesWithCodes: false, discountValue: 50 })], (rem) => ({ discounts: rem.map(() => 1) })).error !== null],
      ["active", /title=\{tt\("Active"\)\}/, applyOffers([line(A, 1000), line(B, 1000)], [offer({ active: false })]).applied.length === 0 && applyOffers([line(A, 1000), line(B, 1000)], [offer({})]).applied.length === 1],
    ]
    for (const [name, inForm, rule] of rules) check(`  ${name}: in the form, and it changes what the checkout does`, inForm.test(editor) && rule, { inForm: inForm.test(editor), rule })
    const bad = problemsOf({ ...draftOf(null, "checkout", "USD"), title: "", condition: "products", amount: "95", placements: [], startsAt: "2026-11-02T10:00", endsAt: "2026-11-01T10:00", maxPerOrder: "500" }, "USD")
    check("plain messages for every field that's wrong, before anything is sent", !!bad.title && !!bad.products && !!bad.triggers && /1 to 90/.test(bad.amount ?? "") && !!bad.places && /after the start/.test(bad.dates ?? "") && /1 to 99/.test(bad.limit ?? ""), bad)
    check("a good draft has none", Object.keys(problemsOf({ ...draftOf(null, "bundle", "USD"), productIds: [A, B] }, "USD")).length === 0)
    check("the server holds the same rules (readOffer)", readOffer({ kind: "checkout", title: "x", productIds: [C], placements: [] }).ok === false && readOffer({ kind: "checkout", title: "x", productIds: [C], startsAt: "2026-11-02T00:00:00Z", endsAt: "2026-11-01T00:00:00Z" }).ok === false && readOffer({ kind: "checkout", title: "x", productIds: [C], maxPerOrder: 100 }).ok === false && readOffer({ kind: "checkout", title: "x", productIds: [C], discountType: "free_shipping", discountValue: 40 }).ok === true)
    check("an amount in a currency with no cents is whole units (JPY 500 is 500)", bodyOf({ ...draftOf(null, "bundle", "JPY"), discountType: "fixed", amount: "500" }, "JPY").discountValue === 500 && bodyOf({ ...draftOf(null, "bundle", "EUR"), discountType: "fixed", amount: "5,50" }, "EUR").discountValue === 550)
  }

  console.log("\nReading a store's offers")
  {
    const db = fakeDb({ store_offers: [offerRow({}), offerRow({ id: uuid(101), creator_id: "c2" }), offerRow({ id: uuid(102), kind: "nonsense" })] })
    const { offers, settings } = await loadOffers(db, "c1")
    check("only the store's own, and only rows that are offers", offers.length === 1 && offers[0].id === uuid(100) && settings === true, offers)
    const old = fakeDb({ store_offers: [offerRow({})] }, { no213: true })
    const before = await loadOffers(old, "c1")
    check("before part 230 runs: read without its columns, with their defaults, and said so", before.offers.length === 1 && before.settings === false && before.offers[0].placements!.join() === "product,cart" && before.offers[0].combinesWithCodes === true, before)
    const lines = await offerLinesFor(fakeDb({ product_collections: [{ id: COLL, creator_id: "c1", kind: "manual" }], product_collection_items: [{ collection_id: COLL, product_id: A }] }), "c1", [upsell({ triggerCollectionIds: [COLL] })], [line(A, 1), line(C, 1)])
    check("a cart's products get the trigger collections they're in", lines[0].collectionIds?.join() === COLL && (lines[1].collectionIds ?? []).length === 0, lines)
    const other = await offerLinesFor(fakeDb({ product_collections: [{ id: COLL, creator_id: "c2", kind: "manual" }], product_collection_items: [{ collection_id: COLL, product_id: A }] }), "c1", [upsell({ triggerCollectionIds: [COLL] })], [line(A, 1)])
    check("  never another store's collection", (other[0].collectionIds ?? []).length === 0)
  }

  /* ─────────────────────────────── server only: saving ─────────────────────────────── */
  console.log("\nSaving: the owner's own products and collections, and part 230 said plainly")
  let server: typeof import("@/lib/offers/offers-server") | null = null
  try {
    server = await import("@/lib/offers/offers-server")
  } catch (e) {
    if (process.env.OFFERS_PLAIN === "1") console.log("  skip  saving (server only; run in scripts/run-push-tests.mjs)")
    else check("lib/offers/offers-server imports in the runner", false, String(e))
  }
  if (server) {
    const base = readOffer({ kind: "bundle", title: "Set", productIds: [A, B], discountType: "percent", discountValue: 10 })
    const o = (base as { offer: Omit<Offer, "id"> }).offer
    const db = fakeDb({ products: [product(A, "c1", 1), product(B, "c1", 1), product(D, "c2", 1)], store_offers: [], product_collections: [{ id: COLL, creator_id: "c2" }] })
    const theirs = await server.saveOffer(db, "c1", null, { ...o, productIds: [A, D] })
    check("an offer naming another store's product is refused", theirs.ok === false && /isn't in your store/.test((theirs as { error: string }).error))
    const coll = await server.saveOffer(db, "c1", null, { ...o, kind: "checkout", productIds: [A], triggerCollectionIds: [COLL] })
    check("  and one naming another store's collection", coll.ok === false && /collections isn't in your store/.test((coll as { error: string }).error))
    const made = await server.saveOffer(db, "c1", null, { ...o, placements: ["cart"], maxPerOrder: 2, startsAt: "2026-10-20T00:00:00.000Z" })
    const row = db.writes.find((w) => w.op === "insert")?.row ?? {}
    check("a new one is written for this store, every setting in its column", made.ok === true && row.creator_id === "c1" && JSON.stringify(row.placements) === '["cart"]' && row.max_per_order === 2 && row.starts_at === "2026-10-20T00:00:00.000Z" && row.combines_with_codes === true, row)
    const id = made.ok === true ? made.offer.id : ""
    const hijack = await server.saveOffer(db, "c2", id, { ...o, productIds: [D, D] })
    check("another store can't change it by its id", hijack.ok === false)
    const upd = db.writes.filter((w) => w.op === "update")
    check("  every update and delete is filtered by the caller's creator id", upd.every((w) => w.filters.includes("creator_id=c2") || w.filters.includes("creator_id=c1")))
    const gone = await server.deleteOffer(db, "c2", id)
    check("  nor delete it", gone.ok === false && (await loadOffers(db, "c1")).offers.length === 1)
    await server.reorderOffers(db, "c1", [uuid(555), id])
    check("an order naming ids that aren't the store's moves only its own", db.writes.filter((w) => w.op === "update" && w.row && "position" in w.row).every((w) => w.filters.includes("creator_id=c1") && !w.filters.includes(`id=${uuid(555)}`)))
    const old = fakeDb({ products: [product(A, "c1", 1), product(B, "c1", 1)], store_offers: [] }, { no213: true })
    const plain = await server.saveOffer(old, "c1", null, o)
    check("before part 230: an offer with no new setting still saves", plain.ok === true, plain)
    const needs = await server.saveOffer(old, "c1", null, { ...o, endsAt: "2026-12-01T00:00:00.000Z" })
    check("  one with a date says to run part 230, in words", needs.ok === false && /SQL part 230/.test((needs as { error: string }).error) && (needs as { status: number }).status === 503)
    const stock = fakeDb({
      products: [product(A, "c1", 0, { type: "physical", track_inventory: true }), product(B, "c1", 3000)],
      product_variants: [{ id: uuid(60), product_id: A, name: "Small", price_cents: 2000, active: true, track_inventory: true, inventory_policy: "deny" }, { id: uuid(61), product_id: A, name: "Large", price_cents: 2200, active: true, track_inventory: true, inventory_policy: "deny" }],
      inventory_levels: [{ variant_id: uuid(60), available: 0 }, { variant_id: uuid(61), available: 4 }],
    })
    const cards = await server.offerProducts(stock, "c1", [A, B])
    check("inventory: an option out of stock isn't offered, the one in stock is", cards.get(A)?.variants.map((v) => v.name).join() === "Large" && cards.get(A)?.priceCents === 2200, [...cards.values()])
    const none = fakeDb({ products: [product(A, "c1", 0, { type: "physical" })], product_variants: [{ id: uuid(60), product_id: A, name: "Small", price_cents: 2000, active: true, track_inventory: true, inventory_policy: "deny" }], inventory_levels: [] })
    check("  a product with nothing in stock isn't offered at all, so its bundle isn't shown", !(await server.offerProducts(none, "c1", [A])).has(A))
    check("  another store's product is never a card", (await server.offerProducts(fakeDb({ products: [product(D, "c2", 1000)] }), "c1", [D])).size === 0)
  }

  /* ─────────────────────────────── the website block ─────────────────────────────── */
  console.log("\nThe product page's Bundles and upsells block")
  {
    const b = (type: string) => ({ id: `b-${type}`, type, settings: {} })
    const old = { id: "m", type: "product", name: "Product", settings: {}, blocks: [b("title"), b("price"), b("buy_buttons"), b("delivery"), b("description")] }
    const drawn = withOffersBlock(old as never)
    check("a product section saved before it existed draws it after delivery", drawn.blocks!.map((x) => x.type).join() === "title,price,buy_buttons,delivery,offers,description" && drawn.blocks![4].id === AUTO_OFFERS_ID && drawn.settings![OFFERS_ADDED] === true)
    check("removed by the creator, it stays removed", withOffersBlock({ ...old, settings: { [OFFERS_ADDED]: true } } as never).blocks!.every((x) => x.type !== "offers"))
    check("not a product section: untouched", withOffersBlock({ id: "h", type: "hero", settings: {}, blocks: [b("text")] } as never).blocks!.length === 1)
    const schema = JSON.parse(read("themes/default/sections/product.json")) as { blocks: { type: string; fields: { id: string; type: string }[] }[] }
    const def = schema.blocks.find((x) => x.type === "offers")
    const colours = (def?.fields ?? []).filter((f) => f.type === "color").map((f) => f.id)
    check("its schema: a colour for every element", ["heading_color", "text_color", "price_color", "border_color", "badge_background", "badge_text", "button_background", "button_text"].every((c) => colours.includes(c)), colours)
    const block = read("components/website-builder/sections/renderers/product/offers-block.tsx")
    check("  each colour painted on its element", ["s.heading_color", "s.text_color", "s.price_color", "s.border_color", "s.badge_background", "s.badge_text", "s.button_background", "s.button_text"].every((k) => block.includes(k)))
    check("  in the editor a sample shows so it can be styled; live it reads the product's offers", /ctx\.sample \? SAMPLE : live/.test(block) && /useProductOffers\(productId, !ctx\.sample\)/.test(block))
    check("  registered with the product blocks, and on the canvas, the live page and the sidebar", /offers: OffersBlock/.test(read("components/website-builder/sections/renderers/product/product-blocks.tsx")) && /withOffersBlock\(withDeliveryBlock\(withProductBlocks\(raw\)\)\)/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")) && /withOffersBlock\(withDeliveryBlock\(withProductBlocks\(s\)\)\)/.test(read("components/website-builder/theme/render-product.tsx")) && /loaded = loaded\.map\(\(s\) => withOffersBlock\(s\)\)/.test(read("app/(storelib)/website-builder/editor/[installId]/page.tsx")))
    check("  Add all to cart puts every line in the website's cart", /* Round 23: every line or none (addAllLines). */ /return cart\.addAll\(withAnswersLines\)/.test(read("components/website-builder/sections/renderers/ProductSection.tsx")))
  }

  /* ─────────────────────────────── wiring ─────────────────────────────── */
  console.log("\nWired in, server side")
  {
    const pricing = read("lib/physical/checkout-pricing-server.ts")
    check("the cart checkout: offers on its own prices, before any code, by each one's code rule", /applyOffers\(offerLines, offers, \{ now \}\)/.test(pricing) && /stackWithCode\(offerLines, offers,/.test(pricing) && pricing.indexOf("applyOffers(offerLines") < pricing.indexOf("const typed ="))
    check("  free shipping from an offer reaches the delivery", /freeShipping: fromOffers\.freeShipping/.test(pricing) && /freeShipping: freeShipping \|\| stacked\.freeShipping/.test(pricing))
    check("  suggestions only of offers shown at the checkout", /suggestionsFor\(offerLines, offers, \{ placement: "checkout", now \}\)/.test(pricing))
    const basket = read("lib/checkout/pricing.ts")
    check("the basket of downloads applies them too, each store's on its own lines", /loadOffers\(db, creatorId, \{ activeOnly: true \}\)/.test(basket) && /applyOffers\(offerLines, offers, \{ now \}\)/.test(basket) && /stackWithCode\(group\.lines, group\.offers/.test(basket))
    const cartRoute = read("app/api/checkout/cart/route.ts")
    check("  the Stripe page's coupon figure is the code's part only", /discount_cents: String\(priced\.discountCents - priced\.offerCents\)/.test(cartRoute))
    /* Changed on purpose (round AF): the route reads lib/offers/offers-public.ts, which GET /api/offers and the Liquid metafield read too. */
    const bundles = read("app/api/offers/bundles/route.ts") + read("lib/offers/offers-public.ts")
    check("the product page's offers: not behind the physical switch, only the store's own published products", !/physicalApiGate/.test(bundles) && /bundlesWith\(p\.id, offers, \{ now \}\)/.test(bundles) && /upsellsFor\(p\.id, mine, offers, \{ now \}\)/.test(bundles))
    const cartApi = read("app/api/offers/cart/route.ts")
    check("the cart's offers: the shop's own published products only, prices from the database", /\.eq\("creator_id", shopId\)\.eq\("status", "published"\)/.test(cartApi) && /baseFor\(v \?\? p, i\.customPriceCents\)/.test(cartApi) && /suggestionsFor\(lines, offers, \{ placement: "cart", now \}\)/.test(cartApi) && /rateLimit\(/.test(cartApi))
    const store = read("app/api/store/offers/route.ts")
    check("the store's edits: the owner (or their team) only, every write filtered by their creator id", /shopCaller\("marketing"(?:, \{ read: true \})?\)/.test(store) /* Round 40: a team member reaches offers with Marketing. */ && /saveOffer\(c\.db, c\.creatorId/.test(store) && /reorderOffers\(c\.db, c\.creatorId/.test(store) && /deleteOffer\(c\.db, c\.creatorId/.test(store))
    const site = read("lib/checkout/site-quote-server.ts")
    /* Changed on purpose (round BC): the shipped quote reads them beside the delivery, from the priced cart it narrowed (pc). */
    check("the website's own checkout suggests them, both for downloads and for what ships", /checkoutSuggestions\(db, creatorId,/.test(site) && /suggestionCards\(db, creatorId, (?:priced|pc)\.suggestions\)/.test(site))
  }

  console.log("\nWired in, on the page")
  {
    check("the cart drawer shows the savings and what to add", /useCartOffers\(lines, shopId, open && live && !scopedToPreview\)/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && /<CartOfferSuggestions/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")) && /<CartOfferSavings/.test(read("components/website-builder/sections/renderers/HeaderSection.tsx")))
    check("the cart page too, and the code's line is the code's part", /useCartOffers\(lines, shopId, ready\)/.test(read("components/website-builder/cart-page-body.tsx")) && /applied\.discountCents - applied\.offerCents/.test(read("components/website-builder/cart-page-body.tsx")))
    const siteCheckout = read("app/(storelib)/checkout/site/site-checkout.tsx")
    check("the website's checkout: Add to your order, into the order and the cart", /<CheckoutSuggestions suggestions=\{editable \? \(quote\.suggestions \?\? \[\]\) : \[\]\}/.test(siteCheckout) && /commitItems\(\[\.\.\.items\.filter/.test(siteCheckout))
    check("  and an offer isn't counted in the discount line as well as its own line", /* Merged with main: lib/checkout/summary-rows.ts takes the offers out of the code's line. */ /const rows = quote \? summaryRows\(quote\) : null/.test(siteCheckout) && /const discountCents = rows\?\.discount \?\? 0/.test(siteCheckout) && /let discount = whole - offerSum/.test(read("lib/checkout/summary-rows.ts")))
    check("the physical checkout keeps its Add to your order", /<CheckoutSuggestions/.test(read("app/(storelib)/checkout/physical/physical-checkout.tsx")))
    check("Storelib's product page keeps its bundles under the buy box", /<BundleOffers/.test(read("components/physical/buy-box.tsx")))
  }

  console.log("\nThe /app page")
  {
    const page = read("app/(storelib)/app/offers/page.tsx")
    /* Changed on purpose: no route loading boundary, like every /app page (tests/page-performance.test.ts): the page you are on stays while this one loads. */
    check("read on the server (no fetch after it lands), and no route loading boundary", /offersArea\(createAdminClient\(\), creator\.id as string\)/.test(page) && !existsSync(join(root, "app/(storelib)/app/offers/loading.tsx")) && !/requirePhysicalPage/.test(page))
    const client = read("app/(storelib)/app/offers/offers-client.tsx")
    check("the list: views with counts, a search, phone rows, a table, a menu per row", /role="tablist"/.test(client) && /data-offer-search=""/.test(client) && /md:hidden/.test(client) && /md:table/.test(client) && /<ResponsiveActionMenu/.test(client))
    check("no made up numbers: nothing about views, accepts or revenue", !/revenue|accepts|accepted|conversion|impressions/i.test(client.replace(/\/\*[\s\S]*?\*\//g, "")))
    /* Changed on purpose: the owner asked for an offer to open as a sub page, as an order does, not a dialog or a bottom sheet (tests/offers-subpages.test.ts). */
    check("the editor: a page of its own, Save with Ctrl or Cmd and S or Enter", !/<SheetDialog/.test(read("app/(storelib)/app/offers/offer-editor.tsx")) && /e\.metaKey \|\| e\.ctrlKey/.test(read("app/(storelib)/app/offers/offer-editor.tsx")) && existsSync(join(root, "app/(storelib)/app/offers/[id]/page.tsx")) && existsSync(join(root, "app/(storelib)/app/offers/new/page.tsx")))
    check("changes kept: leaving with edits asks first", /Discard changes\?/.test(read("app/(storelib)/app/offers/offer-editor.tsx")))
    check("in the menu for every store, beside Coupons", /mainNavItems\.find\(\(item\) => item\.href === "\/app\/products"\)\?\.children\?\.splice\([\s\S]{0,200}\{ href: "\/app\/offers", label: tt\("Upsells and bundles"\) \}/.test(read("components/app/sidebar.tsx")) && !/if \(physicalCommerce\) mainNavItems\.find\(\(item\) => item\.href === "\/app\/products"\)\?\.children\?\.splice\(/.test(read("components/app/sidebar.tsx")))
  }

  console.log("\nSQL part 230")
  {
    const sql = read("supabase/sql/run-now/230_store_offers_settings.sql")
    check("the migration is the same part", sql === read("supabase/migrations/20270201_v10_store_offers_settings.sql"))
    check("safe to run again: every column if not exists", (sql.match(/ADD COLUMN IF NOT EXISTS/g) ?? []).length === 7)
    check("free shipping is a discount type the database takes", /CHECK \(discount_type IN \('percent', 'fixed', 'free_shipping', 'none'\)\)/.test(sql))
    check("owner reads, only the server writes", /ENABLE ROW LEVEL SECURITY/.test(sql) && /c\.user_id = auth\.uid\(\)/.test(sql) && /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.store_offers FROM PUBLIC, anon, authenticated/.test(sql))
    check("existing offers keep what they did: shown everywhere, combining with codes", /placements text\[\] NOT NULL DEFAULT ARRAY\['product', 'cart', 'checkout'\]/.test(sql) && /combines_with_codes boolean NOT NULL DEFAULT true/.test(sql))
    check("listed in the README and the check after", /230_store_offers_settings\.sql/.test(read("supabase/sql/run-now/README.md")) && /as p230_store_offers_settings/.test(read("supabase/sql/run-now/99_check_after.sql")))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
