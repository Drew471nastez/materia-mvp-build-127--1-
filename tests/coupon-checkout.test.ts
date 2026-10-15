/**
 * ===========================================================================
 *  A CODE AT CHECKOUT, FROM APPLY TO THE COUNT AFTER PAYING
 * ===========================================================================
 * The path a code takes, run where it is pure and read where it is not:
 *
 *   Apply           /api/coupons/validate prices the product on the server
 *                   (priceOrder) and answers what the code takes off;
 *   Pay             /api/checkout/stripe-session prices it again, the same
 *                   way, and puts the coupon on the PaymentIntent;
 *   a free order    /api/checkout/process, when the code takes it to $0;
 *   the count       one use, counted by the server when the order is made
 *                   (lib/checkout/fulfil-payment.ts, for the browser and the
 *                   Stripe webhook alike, and the free route), never twice.
 *
 * The database here answers the chained calls the code makes and honours
 * their filters (creator, active, a case-insensitive LIKE with its escapes),
 * so a code of another creator, a switched off code and a wildcard are
 * refused by the query they go through, not by a stand-in that returns one
 * row whatever it is asked.
 */
import { readFileSync } from "node:fs"
import { checkCoupon, discountFor, findCoupon, recordCouponUse, validateCoupon, type CouponRow } from "@/lib/checkout/coupons"
import { MIN_CHARGE_CENTS, priceOrder, totalsOf } from "@/lib/checkout/pricing"
import { stripComments } from "./_source"
import { SHOP_CURRENCY, shopMoneyIn } from "@/lib/store/shop-money"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   ${JSON.stringify(detail)}`}`)
  }
}
const code = (p: string) => stripComments(readFileSync(p, "utf8"))

const PRODUCT = "11111111-1111-4111-8111-111111111111"
const OTHER = "22222222-2222-4222-8222-222222222222"
const VARIANT = "33333333-3333-4333-8333-333333333333"

type Row = Record<string, unknown>

/** A LIKE pattern, as PostgREST and Postgres read it with `\` as the escape, matched without case. */
function like(value: string, pattern: string): boolean {
  let re = ""
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    /* PostgREST reads * as % in a like filter, to spare the address an escape. */
    else if (c === "%" || c === "*") re += ".*"
    else if (c === "_") re += "."
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`, "i").test(value)
}

/** Tables of rows, answering select/eq/ilike/limit/maybeSingle, update/eq and rpc as supabase-js does. */
function fakeDb(tables: Record<string, Row[]>, opts: { rpc?: "ok" | "missing" | "throws" } = {}) {
  const calls: { rpc: number; updates: Row[] } = { rpc: 0, updates: [] }
  const db = {
    calls,
    rpc: async (fn: string, args: Row) => {
      calls.rpc++
      if (opts.rpc === "throws") throw new Error("network")
      if (opts.rpc === "missing" || fn !== "increment_coupon_usage") return { error: { code: "PGRST202" } }
      const row = (tables.coupons ?? []).find((r) => r.id === args.coupon_id)
      if (row) row.usage_count = Number(row.usage_count ?? 0) + 1
      return { error: null }
    },
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = []
      let patch: Row | null = null
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain = {
        select: () => chain,
        eq: (col: string, v: unknown) => {
          filters.push((r) => r[col] === v)
          if (patch) {
            for (const r of rows()) Object.assign(r, patch)
            calls.updates.push(patch)
          }
          return chain
        },
        ilike: (col: string, pattern: string) => {
          filters.push((r) => typeof r[col] === "string" && like(r[col] as string, pattern))
          return chain
        },
        limit: () => chain,
        update: (values: Row) => {
          patch = values
          return chain
        },
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
      }
      return chain
    },
  }
  return db
}

const coupon = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: "cp1",
  code: "SAVE20",
  creator_id: "c1",
  discount_type: "percentage",
  discount_value: 20,
  starts_at: null,
  expires_at: null,
  usage_limit: null,
  usage_count: 0,
  product_ids: null,
  is_active: true,
  min_purchase_cents: null,
  ...over,
})
const product = (over: Row = {}): Row => ({ id: PRODUCT, title: "Presets", slug: "presets", type: "digital", status: "published", price_cents: 2999, thumbnail_url: null, creator_id: "c1", ...over })
const store = (coupons: CouponRow[], products: Row[] = [product()], variants: Row[] = []) =>
  fakeDb({ coupons: coupons as unknown as Row[], products, product_variants: variants })

async function main() {
  console.log("\nWhat a code takes off")
  const pct = (v: number | string, price: number) => discountFor({ discount_type: "percentage", discount_value: v }, price)
  const fix = (v: number | string, price: number) => discountFor({ discount_type: "fixed", discount_value: v }, price)
  check("20% of $29.99 is $6.00 (599.8 rounds to the nearest cent)", pct(20, 2999) === 600, pct(20, 2999))
  check("15% of $9.99 is $1.50", pct(15, 999) === 150)
  check("33.33% of $1.00 is $0.33", pct(33.33, 100) === 33)
  check("12.5% of $0.99 is $0.12 (12.375)", pct(12.5, 99) === 12)
  check("100% is the whole price", pct(100, 2999) === 2999)
  check("a value read from the database as text counts the same", pct("20", 2999) === 600 && fix("5.50", 2000) === 550)
  check("$5.50 off is 550 cents", fix(5.5, 2000) === 550)
  check("a fixed amount above the price takes the price, not more", fix(50, 2999) === 2999)
  check("nothing comes off a free product, a zero, a negative or a broken value", pct(20, 0) === 0 && pct(0, 1000) === 0 && fix(-5, 1000) === 0 && pct("abc", 1000) === 0)
  check("the total: price less the discount, plus the tip", totalsOf(2999, 600, 200).totalCents === 2599)
  check("a discount never makes a total negative, even with a tip", totalsOf(1000, 5000, 300).totalCents === 300)

  console.log("\nWhat a code must pass")
  const now = new Date("2026-09-25T12:00:00Z")
  const ok = (c: CouponRow, price = 2999, productId = PRODUCT) => checkCoupon(c, { productId, priceCents: price, now })
  const why = (r: ReturnType<typeof checkCoupon>) => (r.ok ? "ok" : (r as { error: string }).error)
  check("an active code with no rules passes, with its discount and label", (() => {
    const r = ok(coupon())
    return r.ok && r.discountCents === 600 && r.label === "20%"
  })())
  check("switched off: not valid", why(ok(coupon({ is_active: false }))) === "That code is not valid.")
  check("not found: not valid", why(checkCoupon(null, { productId: PRODUCT, priceCents: 2999, now })) === "That code is not valid.")
  check("starting in a minute: not active yet", why(ok(coupon({ starts_at: "2026-09-25T12:01:00Z" }))) === "That code is not active yet.")
  check("started this instant: works", ok(coupon({ starts_at: "2026-09-25T12:00:00Z" })).ok)
  check("ending this instant: still works", ok(coupon({ expires_at: "2026-09-25T12:00:00Z" })).ok)
  check("ended a second ago: expired", why(ok(coupon({ expires_at: "2026-09-25T11:59:59Z" }))) === "That code has expired.")
  check("99 of 100 uses: works", ok(coupon({ usage_limit: 100, usage_count: 99 })).ok)
  check("100 of 100 uses: used up", why(ok(coupon({ usage_limit: 100, usage_count: 100 }))) === "That code has been used up.")
  check("a count the database left empty is 0", ok(coupon({ usage_limit: 1, usage_count: null })).ok)
  check("for this product: works", ok(coupon({ product_ids: [OTHER, PRODUCT] })).ok)
  check("for another product only: refused", why(ok(coupon({ product_ids: [OTHER] }))) === "That code does not apply to this product.")
  check("an empty product list means every product", ok(coupon({ product_ids: [] })).ok)
  check("a minimum of exactly the price: works", ok(coupon({ min_purchase_cents: 2999 })).ok)
  check("a cent under the minimum: refused, saying the amount", why(ok(coupon({ min_purchase_cents: 3000 }))) === `That code needs an order of at least ${shopMoneyIn(3000, SHOP_CURRENCY)}.`)
  check("a code that takes nothing off this price: refused", why(ok(coupon(), 0)) === "That code takes nothing off this price.")

  console.log("\nFinding the code")
  const db = store([coupon(), coupon({ id: "cp2", code: "OTHER", creator_id: "c2" }), coupon({ id: "cp3", code: "PAUSED", is_active: false }), coupon({ id: "cp4", code: "A_B" })])
  check("typed in any case", (await findCoupon(db, "c1", "save20"))?.id === "cp1")
  check("another creator's code is not found", (await findCoupon(db, "c1", "OTHER")) === null)
  check("a switched off code is not found", (await findCoupon(db, "c1", "PAUSED")) === null)
  check("% is not a wildcard", (await findCoupon(db, "c1", "%")) === null && (await findCoupon(db, "c1", "SAVE%")) === null)
  check("_ is not a wildcard", (await findCoupon(db, "c1", "A_B"))?.id === "cp4" && (await findCoupon(db, "c1", "AXB")) === null)
  check("* (PostgREST's other wildcard) matches nothing that is not the code itself", (await findCoupon(db, "c1", "*")) === null)
  check("spaces around a code are forgiven", (await validateCoupon(db, { creatorId: "c1", productId: PRODUCT, code: "  save20 ", priceCents: 2999 })).ok)
  check("a code that is not a string, or empty, is not valid", !(await validateCoupon(db, { creatorId: "c1", productId: PRODUCT, code: 42, priceCents: 2999 })).ok && !(await validateCoupon(db, { creatorId: "c1", productId: PRODUCT, code: "", priceCents: 2999 })).ok)

  console.log("\nThe whole order, as Apply and Pay both price it")
  {
    const r = await priceOrder(store([coupon()]), { productId: PRODUCT, couponCode: "save20", tipCents: 200 })
    check("20% off $29.99 with a $2 tip is $25.99", r.ok === true && r.totals.baseCents === 2999 && r.totals.discountCents === 600 && r.totals.tipCents === 200 && r.totals.totalCents === 2599, r.ok ? r.totals : r)
    check("and the coupon rides along for the PaymentIntent", r.ok === true && r.coupon?.id === "cp1" && r.couponLabel === "20%")
  }
  {
    const variants = [{ id: VARIANT, product_id: PRODUCT, name: "Pro", price_cents: 5000, pay_what_you_want: false, pwyw_min_price_cents: null }]
    const r = await priceOrder(store([coupon({ discount_type: "fixed", discount_value: 7.5 })], [product()], variants), { productId: PRODUCT, variantId: VARIANT, couponCode: "SAVE20" })
    check("on an option, the option's price is what the code comes off: $50 less $7.50", r.ok === true && r.totals.totalCents === 4250, r.ok ? r.totals : r)
  }
  {
    const pwyw = product({ price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 1000 })
    const r = await priceOrder(store([coupon({ min_purchase_cents: 2000 })], [pwyw]), { productId: PRODUCT, customPriceCents: 2500, couponCode: "SAVE20" })
    check("pay what you want: the buyer's amount is the price, 20% of $25", r.ok === true && r.totals.discountCents === 500 && r.totals.totalCents === 2000, r.ok ? r.totals : r)
    const low = await priceOrder(store([coupon({ min_purchase_cents: 2000 })], [pwyw]), { productId: PRODUCT, customPriceCents: 1500, couponCode: "SAVE20" })
    check("and the minimum order is measured against that amount", low.ok === false && low.error === `That code needs an order of at least ${shopMoneyIn(2000, SHOP_CURRENCY)}.`, low)
  }
  {
    const r = await priceOrder(store([coupon({ discount_value: 100 })]), { productId: PRODUCT, couponCode: "SAVE20" })
    check("100% off makes the order free: the free route takes it, not a card", r.ok === true && r.totals.totalCents === 0)
    const tip = await priceOrder(store([coupon({ discount_value: 100 })]), { productId: PRODUCT, couponCode: "SAVE20", tipCents: 30 })
    check("with a tip under Stripe's smallest charge, the card route refuses it", tip.ok === true && tip.totals.totalCents > 0 && tip.totals.totalCents < MIN_CHARGE_CENTS)
  }
  {
    const r = await priceOrder(store([coupon({ expires_at: "2000-01-01T00:00:00Z" })]), { productId: PRODUCT, couponCode: "SAVE20" })
    check("a code that expired after Apply is refused at Pay, and nothing is charged", r.ok === false && r.status === 400 && r.error === "That code has expired.", r)
  }
  {
    const r = await priceOrder(store([coupon({ creator_id: "c2" })]), { productId: PRODUCT, couponCode: "SAVE20" })
    check("a code is looked up under the product's own creator", r.ok === false, r)
  }
  {
    const r = await priceOrder(store([coupon()]), { productId: PRODUCT, couponCode: "   " })
    check("an empty code is no code: full price", r.ok === true && r.coupon === null && r.totals.totalCents === 2999)
  }

  console.log("\nCounting a use")
  {
    const c = coupon({ usage_count: 4 })
    const withRpc = store([c])
    await recordCouponUse(withRpc, "cp1")
    check("in one statement, by the database function", withRpc.calls.rpc === 1 && c.usage_count === 5, c.usage_count)
    const c2 = coupon({ usage_count: 4 })
    const noRpc = fakeDb({ coupons: [c2 as unknown as Row] }, { rpc: "missing" })
    await recordCouponUse(noRpc, "cp1")
    check("before the function exists, a read and a write", c2.usage_count === 5 && noRpc.calls.updates.length === 1, c2.usage_count)
    let threw = false
    try {
      await recordCouponUse(fakeDb({ coupons: [] }, { rpc: "throws" }), "cp1")
    } catch {
      threw = true
    }
    check("and it never fails the order it belongs to", !threw)
    const none = store([coupon()])
    await recordCouponUse(none, "")
    await recordCouponUse(none, null)
    check("no coupon, nothing counted", none.calls.rpc === 0)
  }

  console.log("\nThe routes, read")
  const validate = code("app/api/coupons/validate/route.ts")
  const session = code("app/api/checkout/stripe-session/route.ts")
  const free = code("app/api/checkout/process/route.ts")
  const fulfil = code("lib/checkout/fulfil-payment.ts")
  const webhook = code("app/api/stripe/webhook/route.ts")
  check("Apply prices on the server and never hands out the coupon's id", /priceOrder\(createAdminClient\(\)/.test(validate) && !/coupon\.id|priced\.coupon\.id/.test(validate))
  check("Pay prices with the same function and charges its total", /priceOrder\(\s*admin,/.test(session) && /amount: chargeCents,/.test(session) && /const chargeCents = tax \? tax\.totalCents : totals\.totalCents/.test(session) && /couponCode: body\.couponCode/.test(session))
  check("the coupon, the code and the discount go on the PaymentIntent", /coupon_id: coupon\?\.id \|\| ""/.test(session) && /coupon_code: coupon\?\.code \|\| ""/.test(session) && /discount_cents: String\(totals\.discountCents\)/.test(session))
  check("a total of $0 is refused by the card route", /if \(totals\.totalCents <= 0\)/.test(session))
  check("the free route takes only a total of $0 and counts the use once", /if \(totals\.totalCents !== 0\)/.test(free) && (free.match(/recordCouponUse\(/g) ?? []).length === 1)
  {
    const insert = fulfil.indexOf('.from("orders").insert(row)')
    const found = fulfil.indexOf("if (found) {")
    /* Changed on purpose: the use now also names the place the payment held
       under the code's limit (m.coupon_holder, lib/checkout/coupon-holds.ts),
       so the order turns that place into the use. Still once, still after the insert. */
    const count = fulfil.indexOf('if (m.coupon_id) await step("coupon use", () => recordCouponUse(admin, m.coupon_id, m.coupon_holder))')
    check("after paying, the use is counted once: only by whoever made the order, after the insert", insert > 0 && found > 0 && found < insert && count > insert && (fulfil.match(/recordCouponUse\(/g) ?? []).length === 1)
  }
  check("the webhook makes the order from a paid checkout, the same way", /fulfilPaymentIntent\(supabaseAdmin, pi\.id/.test(webhook))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed > 0) {
    console.log(`\nFailed:\n${failures.map((f) => `  - ${f}`).join("\n")}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
