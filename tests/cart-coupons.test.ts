/**
 * ===========================================================================
 *  A DISCOUNT CODE ON A BASKET, AND A USE LIMIT TWO BUYERS CANNOT PASS
 * ===========================================================================
 * The basket on a creator's website takes a code now, priced on the server
 * line by line (lib/checkout/pricing priceCart, over lib/checkout/coupons
 * checkCouponLines, which the single product checkout is one line of):
 *
 *   which lines     the code's own creator's products, inside its list;
 *   percentage      per line, rounded as a single product rounds;
 *   fixed           spread over those lines by the largest remainder,
 *                   never more than they cost, adding up to the cent;
 *   to Stripe       whole cents per unit, the basket's metadata carrying
 *                   each line's share, the use counted once;
 *   to $0           the free route, never a card.
 *
 * And a use limit is held from Pay to the order (lib/checkout/coupon-holds,
 * run-now part 31), so the last use goes to one buyer.
 */
import { readFileSync } from "node:fs"
import { checkCoupon, checkCouponLines, discountFor, lineDiscounts, recordCouponUse, type CouponRow } from "@/lib/checkout/coupons"
import { priceCart } from "@/lib/checkout/pricing"
import { CART_DISCOUNTS_KEY, apportionFee, chargeUnits, lineTotalCents, packItems, packedTotalCents, unpackItems, type PackedItem } from "@/lib/checkout/cart-items"
import { holdCouponUse, holderForEmail, isHolder, needsHold, newHolder, releaseCouponHold } from "@/lib/checkout/coupon-holds"
import { stripComments } from "./_source"

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
const read = (p: string) => readFileSync(p, "utf8")
const code = (p: string) => stripComments(read(p))
const sum = (a: number[]) => a.reduce((n, x) => n + x, 0)

const uuid = (n: number) => `${String(n).padStart(8, "0")}-1111-4111-8111-111111111111`
const A = uuid(1)
const B = uuid(2)
const C = uuid(3)
const D = uuid(4)
const V = uuid(9)
const NOW = new Date("2026-09-25T12:00:00Z")

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

type Row = Record<string, unknown>

/** Tables answering select/eq/in/ilike/limit/maybeSingle and a plain await, with PostgREST's ilike escapes. */
function fakeDb(tables: Record<string, Row[]>) {
  const like = (value: string, pattern: string) => {
    let re = ""
    for (let i = 0; i < pattern.length; i++) {
      const c = pattern[i]
      if (c === "\\" && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      else if (c === "%" || c === "*") re += ".*"
      else if (c === "_") re += "."
      else re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    }
    return new RegExp(`^${re}$`, "i").test(value)
  }
  const reads: string[] = []
  return {
    reads,
    from(table: string) {
      reads.push(table)
      const filters: ((r: Row) => boolean)[] = []
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)))
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
        in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
        ilike: (col: string, p: string) => (filters.push((r) => typeof r[col] === "string" && like(r[col] as string, p)), chain),
        limit: () => chain,
        maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => resolve({ data: rows(), error: null }),
      }
      return chain
    },
  }
}

const product = (id: string, creator: string, price: number, over: Row = {}): Row => ({
  id,
  title: `P${id.slice(7, 8)}`,
  slug: `p${id.slice(7, 8)}`,
  price_cents: price,
  pay_what_you_want: false,
  pwyw_min_price_cents: null,
  thumbnail_url: null,
  type: "digital",
  status: "published",
  creator_id: creator,
  ...over,
})

async function main() {
  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nWhich lines a code comes off")
  function line(productId: string, creatorId: string, cents: number) {
    return { productId, creatorId, cents }
  }
  {
    const r = checkCouponLines(coupon(), [line(A, "c1", 1000), line(B, "c2", 2000), line(C, "c1", 3000)], { now: NOW })
    check("a basket of two creators: only the code's creator's lines, 20% of $10 and of $30", r.ok === true && r.discounts.join() === "200,0,600" && r.discountCents === 800, r)
  }
  {
    const r = checkCouponLines(coupon({ creator_id: "c2" }), [line(A, "c1", 1000), line(B, "c2", 2000)], { now: NOW })
    check("the other creator's code comes off the other creator's line only", r.ok === true && r.discounts.join() === "0,400", r)
  }
  {
    const r = checkCouponLines(coupon({ product_ids: [C] }), [line(A, "c1", 1000), line(C, "c1", 3000)], { now: NOW })
    check("a code for one product comes off that product only", r.ok === true && r.discounts.join() === "0,600", r)
  }
  {
    const r = checkCouponLines(coupon({ product_ids: [D] }), [line(A, "c1", 1000), line(C, "c1", 3000)], { now: NOW })
    check("a code for nothing in the basket is refused, saying so", r.ok === false && r.error === "That code does not apply to anything in your cart.", r)
  }
  {
    const r = checkCouponLines(coupon({ product_ids: [A] }), [line(A, "c2", 1000)], { now: NOW })
    check("its product id on another creator's line is still not its line", r.ok === false, r)
  }

  console.log("\nRounding, as a single product rounds")
  {
    const r = checkCouponLines(coupon({ discount_value: 15 }), [line(A, "c1", 999), line(B, "c1", 999), line(C, "c1", 999)], { now: NOW })
    check("15% of three $9.99 lines is $1.50 each (149.85 rounds up per line)", r.ok === true && r.discounts.join() === "150,150,150", r)
  }
  {
    const r = checkCouponLines(coupon({ discount_value: 12.5 }), [line(A, "c1", 99), line(B, "c1", 2999)], { now: NOW })
    check("12.5% of $0.99 is $0.12 and of $29.99 is $3.75, each on its own", r.ok === true && r.discounts.join() === "12,375", r)
  }
  {
    let same = true
    let seed = 7
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 2000 && same; i++) {
      const price = Math.floor(rnd() * 200000)
      const c = rnd() < 0.5 ? coupon({ discount_value: Math.round(rnd() * 10000) / 100 }) : coupon({ discount_type: "fixed", discount_value: Math.round(rnd() * 50000) / 100 })
      const one = checkCoupon(c, { productId: A, priceCents: price, now: NOW })
      const cart = checkCouponLines(c, [line(A, "c1", price)], { now: NOW })
      same = one.ok === cart.ok && (!one.ok || (cart.ok && one.discountCents === cart.discountCents && one.discountCents === discountFor(c, price)))
      if (!same) check("a basket of one line is priced as the single product", false, { price, c, one, cart })
    }
    check("2000 random codes and prices: a basket of one line takes off what the single product checkout takes", same)
  }

  console.log("\nA fixed amount, spread")
  {
    const r = checkCouponLines(coupon({ discount_type: "fixed", discount_value: 10 }), [line(A, "c1", 1000), line(B, "c1", 3000)], { now: NOW })
    check("$10 over $10 and $30 is $2.50 and $7.50", r.ok === true && r.discounts.join() === "250,750", r)
  }
  {
    const r = checkCouponLines(coupon({ discount_type: "fixed", discount_value: 1 }), [line(A, "c1", 1000), line(B, "c1", 1000), line(C, "c1", 1000)], { now: NOW })
    check("$1 over three equal lines is 34, 33, 33: the cent left over goes to one line and the parts add to $1", r.ok === true && sum(r.discounts) === 100 && r.discounts.join() === "34,33,33", r)
  }
  {
    const r = checkCouponLines(coupon({ discount_type: "fixed", discount_value: 500 }), [line(A, "c1", 1000), line(B, "c2", 3000), line(C, "c1", 2000)], { now: NOW })
    check("$500 off $30 of its lines takes those lines to $0 and leaves the other creator's line whole", r.ok === true && r.discounts.join() === "1000,0,2000", r)
  }
  {
    let ok = true
    let seed = 11
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648)
    for (let i = 0; i < 1000 && ok; i++) {
      const n = 1 + Math.floor(rnd() * 8)
      const cents = Array.from({ length: n }, () => Math.floor(rnd() * 20000))
      const applies = cents.map(() => rnd() < 0.7)
      const value = Math.round(rnd() * 40000) / 100
      const d = lineDiscounts({ discount_type: "fixed", discount_value: value }, cents, applies)
      const pool = sum(cents.filter((_, j) => applies[j]))
      ok = sum(d) === Math.min(Math.round(value * 100), pool) && d.every((x, j) => x >= 0 && x <= cents[j] && (applies[j] || x === 0))
      if (!ok) check("fixed spread", false, { cents, applies, value, d })
    }
    check("1000 random baskets: a fixed amount adds up to the cent, no line below $0, nothing off a line it does not apply to", ok)
  }

  console.log("\nLimits, dates and minimums, as for one product")
  const lines2 = [line(A, "c1", 1500), line(B, "c1", 1000)]
  const why = (r: ReturnType<typeof checkCouponLines>) => (r.ok ? "ok" : (r as { error: string }).error)
  check("used up: refused", why(checkCouponLines(coupon({ usage_limit: 5, usage_count: 5 }), lines2, { now: NOW })) === "That code has been used up.")
  check("one use left: works", checkCouponLines(coupon({ usage_limit: 5, usage_count: 4 }), lines2, { now: NOW }).ok)
  check("expired a second ago: refused", why(checkCouponLines(coupon({ expires_at: "2026-09-25T11:59:59Z" }), lines2, { now: NOW })) === "That code has expired.")
  check("not started: refused", why(checkCouponLines(coupon({ starts_at: "2026-09-26T00:00:00Z" }), lines2, { now: NOW })) === "That code is not active yet.")
  check("switched off: not valid", why(checkCouponLines(coupon({ is_active: false }), lines2, { now: NOW })) === "That code is not valid.")
  check("a minimum is met by the lines it applies to together ($25)", checkCouponLines(coupon({ min_purchase_cents: 2500 }), lines2, { now: NOW }).ok)
  check("and not by another creator's lines", why(checkCouponLines(coupon({ min_purchase_cents: 2500 }), [line(A, "c1", 1500), line(B, "c2", 5000)], { now: NOW })) === "That code needs an order of at least $25.00.")

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe basket, priced from the database")
  const shop = (coupons: CouponRow[], extra: Row[] = [], variants: Row[] = [], entitlements: Row[] = []) =>
    fakeDb({
      /* B carries a quantity: anything but a download does. Not "physical": a product that ships is never in this basket (lib/physical has its own checkout). */
      products: [product(A, "c1", 1000), product(B, "c1", 2999, { type: "course" }), product(C, "c2", 500), product(D, "c1", 0), ...extra],
      product_variants: variants,
      coupons: coupons as unknown as Row[],
      entitlements,
    })
  {
    const r = await priceCart(shop([coupon()]), { items: [{ productId: A }, { productId: B, quantity: 3 }], couponCode: "save20" })
    check(
      "$10 and three at $29.99, 20% off: 200 and 1799 (8997 × 20%), $87.97 less $19.99 = $79.98",
      r.ok === true && r.subtotalCents === 9997 && r.lines.map((l) => l.item.discountCents).join() === "200,1799" && r.discountCents === 1999 && r.totalCents === 7998,
      r.ok ? { sub: r.subtotalCents, d: r.lines.map((l) => l.item.discountCents), total: r.totalCents } : r,
    )
    check("and the coupon and its label ride along", r.ok === true && r.coupon?.id === "cp1" && r.couponLabel === "20%")
  }
  {
    const r = await priceCart(shop([coupon({ id: "cp2", creator_id: "c2" })]), { items: [{ productId: A }, { productId: C }], couponCode: "SAVE20" })
    check("a basket of two shops finds the code under the shop that has it, and takes it off that shop's line only", r.ok === true && r.coupon?.id === "cp2" && r.lines.map((l) => l.item.discountCents).join() === "0,100", r.ok ? r.lines.map((l) => l.item.discountCents) : r)
    check("and names both shops, for the route to refuse a basket that is not one payment", r.ok === true && r.creatorIds.sort().join() === "c1,c2")
  }
  {
    const r = await priceCart(shop([coupon({ creator_id: "c9" })]), { items: [{ productId: A }], couponCode: "SAVE20" })
    check("a code of a creator not in the basket is not valid", r.ok === false && r.error === "That code is not valid.", r)
  }
  {
    const r = await priceCart(shop([coupon({ expires_at: "2000-01-01T00:00:00Z" })]), { items: [{ productId: A }], couponCode: "SAVE20" })
    check("an expired code is refused with its reason and nothing is priced", r.ok === false && r.status === 400 && r.error === "That code has expired.", r)
  }
  {
    const r = await priceCart(shop([coupon({ usage_limit: 1, usage_count: 1 })]), { items: [{ productId: A }], couponCode: "SAVE20" })
    check("a used up code is refused", r.ok === false && r.error === "That code has been used up.", r)
  }
  {
    const r = await priceCart(shop([coupon()]), { items: [{ productId: A }], couponCode: "%" })
    check("% is not a wildcard in a basket either", r.ok === false, r)
  }
  {
    const r = await priceCart(shop([coupon({ discount_value: 100 })]), { items: [{ productId: A }, { productId: B }], couponCode: "SAVE20" })
    check("100% off the whole basket is a total of $0, for the free route", r.ok === true && r.totalCents === 0 && r.discountCents === 3999, r.ok ? r.totalCents : r)
  }
  {
    const E = "00000000-0000-4000-8000-0000000000e5"
    const r = await priceCart(shop([coupon()], [product(E, "c1", 4000, { type: "physical" })]), { items: [{ productId: A }, { productId: E, quantity: 2 }] })
    check("a physical product is left out of this basket and named: it ships, so it has its own checkout", r.ok === true && r.lines.length === 1 && r.totalCents === 1000 && r.dropped.length === 1, r)
  }
  {
    /* A code for the shipped product alone, on a cart that also holds a download: the physical checkout prices it, so it is not refused here. */
    const E = "00000000-0000-4000-8000-0000000000e5"
    const db = shop([coupon({ product_ids: [E] })], [product(E, "c1", 4000, { type: "physical" })])
    const r = await priceCart(db, { items: [{ productId: A }, { productId: E }], couponCode: "SAVE20" })
    check("a cart that ships is not refused for a code that fits only its shipped product", r.ok === true && r.ships.length === 2 && r.coupon === null && r.discountCents === 0, r)
    const off = await priceCart(db, { items: [{ productId: A }, { productId: E }], couponCode: "SAVE20", handOff: false })
    check("  while physical commerce is off nothing is handed over and the code is tried on what is left", off.ok === false && off.error === "That code does not apply to anything in your cart.", off)
    const validate = code("app/api/coupons/validate/route.ts")
    check("  and Apply says to add it on the next page before anything else about the code", validate.indexOf("cart.ships.length > 0") < validate.indexOf("if (!cart.coupon)") && /handOff/.test(validate))
  }
  {
    const r = await priceCart(shop([coupon()]), { items: [{ productId: A }, { productId: D }] })
    check("without a code: the free product is left out and named, the rest at full price", r.ok === true && r.coupon === null && r.totalCents === 1000 && r.dropped.join() === "P4", r)
  }
  {
    const r = await priceCart(shop([coupon()], [], [], [{ buyer_id: "u1", product_id: A }]), { items: [{ productId: A }], couponCode: "SAVE20", buyerId: "u1" })
    check("a basket of only what the buyer owns says that, not that the code applies to nothing", r.ok === true && r.lines.length === 0 && r.ownedAny, r)
  }
  {
    const variants = [{ id: V, product_id: B, name: "Big", price_cents: 5000, pay_what_you_want: false, pwyw_min_price_cents: null }]
    const r = await priceCart(shop([coupon({ discount_type: "fixed", discount_value: 5 })], [], variants), { items: [{ productId: B, variantId: V }], couponCode: "SAVE20" })
    check("an option is priced from itself and the code comes off that price", r.ok === true && r.lines[0].item.priceCents === 5000 && r.totalCents === 4500, r.ok ? r.totalCents : r)
  }
  {
    const r = await priceCart(shop([coupon()]), { items: [{ productId: A }], couponCode: "   " })
    check("an empty code is no code", r.ok === true && r.coupon === null && r.totalCents === 1000)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThrough Stripe and back")
  {
    const items: PackedItem[] = [
      { productId: A, variantId: null, quantity: 1, priceCents: 1000, discountCents: 200 },
      { productId: B, variantId: V, quantity: 3, priceCents: 1000, discountCents: 100 },
      { productId: C, variantId: null, quantity: 1, priceCents: 500 },
    ]
    const meta = packItems(items)
    const back = unpackItems(meta)
    check("each line's share of the code comes back with it", back.map((i) => i.discountCents ?? 0).join() === "200,100,0" && meta[CART_DISCOUNTS_KEY] === "200,100,0")
    check("and what the basket was charged is the lines less their shares", packedTotalCents(back) === 800 + 2900 + 500)
    const plain = packItems([{ productId: A, variantId: null, quantity: 1, priceCents: 1000 }])
    check("a basket without a code has no discount key, and reads as before", !(CART_DISCOUNTS_KEY in plain) && packedTotalCents(unpackItems(plain)) === 1000)
    const tampered = unpackItems({ ...packItems([{ productId: A, variantId: null, quantity: 1, priceCents: 1000 }]), [CART_DISCOUNTS_KEY]: "5000" })
    check("a share larger than its line is read as the whole line, never below $0", lineTotalCents(tampered[0]) === 0)
    const many = Array.from({ length: 50 }, (_, i) => ({ productId: uuid(100 + i), variantId: uuid(200 + i), quantity: 99, priceCents: 999999, discountCents: 9999999 }))
    const packed = packItems(many)
    check("fifty lines with seven digit shares fit Stripe's 500 characters a value", Object.values(packed).every((v) => v.length <= 500) && unpackItems(packed).length === 50)
  }
  {
    let ok = true
    for (let q = 1; q <= 12 && ok; q++) {
      for (let d = 0; d <= q * 1000 && ok; d += 37) {
        const item = { productId: A, variantId: null, quantity: q, priceCents: 1000, discountCents: d }
        const parts = chargeUnits(item)
        ok = sum(parts.map((p) => p.quantity * p.unitCents)) === lineTotalCents(item) && parts.every((p) => p.unitCents > 0 && p.quantity > 0)
        if (!ok) check("charge units", false, { q, d, parts })
      }
    }
    check("every quantity and share: Stripe's whole cent units add up to the line exactly, and none is $0", ok)
    const three = chargeUnits({ productId: A, variantId: null, quantity: 3, priceCents: 1000, discountCents: 100 })
    check("$30 less $1 over three units: one at $9.66 and two at $9.67", JSON.stringify(three) === JSON.stringify([{ quantity: 1, unitCents: 966 }, { quantity: 2, unitCents: 967 }]), three)
    check("a line a code made free is not sent to Stripe", chargeUnits({ productId: A, variantId: null, quantity: 1, priceCents: 1000, discountCents: 1000 }).length === 0)
  }
  {
    const fees = apportionFee(150, [800, 2900, 0])
    check("the platform fee is split over what each line was charged, and a free line carries none", sum(fees) === 150 && fees[2] === 0, fees)
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nA place under the limit")
  {
    const calls: string[] = []
    const db = (answer: unknown) => ({
      rpc: async (fn: string) => {
        calls.push(fn)
        if (answer === "throw") throw new Error("network")
        return answer as { data: unknown; error: unknown }
      },
    })
    check("room: yes", await holdCouponUse(db({ data: true, error: null }), "cp1", "h"))
    check("no room: no", (await holdCouponUse(db({ data: false, error: null }), "cp1", "h")) === false)
    check("before part 31 has run: yes, as before", await holdCouponUse(db({ data: null, error: { code: "PGRST202" } }), "cp1", "h"))
    check("the database out of reach: yes, as before", await holdCouponUse(db("throw"), "cp1", "h"))
    let threw = false
    try {
      await releaseCouponHold(db("throw"), "cp1", "h")
    } catch {
      threw = true
    }
    check("giving a place back never throws", !threw)
    check("only a code with a limit needs a place", needsHold(coupon({ usage_limit: 3 })) && !needsHold(coupon()) && !needsHold(null))
    check("an address is the same holder in any case, and is not stored as itself", holderForEmail("A@b.co ") === holderForEmail("a@b.co") && !holderForEmail("a@b.co").includes("b.co"))
    check("a browser's holder is random and only such a holder is taken from a cookie", newHolder() !== newHolder() && isHolder(newHolder()) && !isHolder("u:someone") && !isHolder("s:../../x"))
  }
  {
    const calls: { fn: string; args: Record<string, unknown> }[] = []
    const db = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push({ fn, args })
        return { error: null }
      },
      from: () => ({}),
    }
    await recordCouponUse(db, "cp1", "e:abc")
    check("the order turns its place into the use, in one call", calls.length === 1 && calls[0].fn === "use_coupon_hold" && calls[0].args.p_holder === "e:abc")
    const missing = { calls: [] as string[], rpc: async (fn: string) => (missing.calls.push(fn), fn === "use_coupon_hold" ? { error: { code: "PGRST202" } } : { error: null }), from: () => ({}) }
    await recordCouponUse(missing, "cp1", "e:abc")
    check("before part 31, the use is counted as it always was", missing.calls.join() === "use_coupon_hold,increment_coupon_usage")
  }

  /* ─────────────────────────────────────────────────────────────────── */
  console.log("\nThe routes, read")
  const cart = code("app/api/checkout/cart/route.ts")
  const fulfil = code("lib/checkout/fulfil-cart-session.ts")
  const validate = code("app/api/coupons/validate/route.ts")
  const session = code("app/api/checkout/stripe-session/route.ts")
  const free = code("app/api/checkout/process/route.ts")
  check("the basket prices with priceCart, sending the code, and charges the server's total", /priceCart\(admin, \{ items: body\.items, couponCode: body\.couponCode/.test(cart) && /unit_amount: part\.unitCents/.test(cart) && /chargeUnits\(l\.item\)/.test(cart))
  check("the basket's session carries the code, its discount and whose place it is", /coupon_id: coupon\.id/.test(cart) && /coupon_code: coupon\.code/.test(cart) && /discount_cents: String\(priced\.discountCents\)/.test(cart) && /coupon_holder: holder/.test(cart) && /packItems\(lines\.map\(\(l\) => l\.item\)\)/.test(cart))
  check("a basket still has to be one shop's", /priced\.creatorIds\.length !== 1/.test(code("lib/checkout/basket-decision.ts")) && /const decision = basketDecision\(priced\)/.test(cart) && /decision\.kind === "refuse"/.test(cart))
  check("a basket a code takes to $0 goes to the free route, never to Stripe", /if \(coupon && totalCents === 0\) return freeBasket\(/.test(cart) && /fulfilFreeCart\(c\.admin/.test(cart) && cart.indexOf("freeBasket(request") < cart.indexOf("stripe.checkout.sessions.create"))
  check("the free basket asks for a name, an address and the Terms, and is limited like a free product", /needsDetails: true/.test(cart) && /buyer\.agreedToTerms !== true/.test(cart) && /bucket: "claim"/.test(cart))
  check("under $0.50 but above $0 is refused, not charged", /totalCents < MIN_CHARGE_CENTS/.test(cart))
  check("a limited code holds a place before the Stripe page is made, and the page expires before the place", cart.indexOf("holdCouponUse(admin, coupon.id, holder)") > 0 && cart.indexOf("holdCouponUse(admin, coupon.id, holder)") < cart.indexOf("stripe.checkout.sessions.create") && /expires_at: Math\.floor\(Date\.now\(\) \/ 1000\) \+ HELD_SESSION_SECONDS/.test(cart))
  check("a basket's use is counted once: by whoever wrote its first line", /if \(s\.ownsBasket\) \{[\s\S]*if \(s\.couponId\) await step\("coupon use", \(\) => recordCouponUse\(admin, s\.couponId, s\.couponHolder\)\)/.test(fulfil) && (fulfil.match(/recordCouponUse\(/g) ?? []).length === 1)
  /* Three callers since round R4: a Checkout Session, a website checkout's PaymentIntent (fulfilCartPayment) and a free basket. Every order row is still written by that one writer's fulfilCartLine. */
  check("the paid and the free basket are written by the same function", (fulfil.match(/await writeBasket\(admin, ctx, /g) ?? []).length === 3 && /export async function fulfilCartPayment[\s\S]*?await writeBasket\(admin, ctx, items, /.test(fulfil) && !/from\("orders"\)\s*\.insert\(/.test(fulfil))
  check("a basket's lines record what they were charged, and the fee is split over that", /const amountCents = lineTotalCents\(line\)/.test(code("lib/checkout/fulfil-cart-item.ts")) && /apportionFee\(s\.feeTotal, items\.map\(lineTotalCents\)\)/.test(fulfil))
  check("Apply prices a basket with the same function as Check out, and never hands out the coupon's id", /priceCart\(createAdminClient\(\), \{ items: body\.items/.test(validate) && !/coupon\.id/.test(validate))
  check("the card checkout holds a place for the buyer's address before the PaymentIntent", session.indexOf("holdCouponUse(admin, coupon.id, holder)") > 0 && session.indexOf("holdCouponUse(admin, coupon.id, holder)") < session.indexOf("stripe.paymentIntents.create") && /holderForEmail\(email\)/.test(session))
  check("and gives it back when no PaymentIntent was made", /releaseCouponHold\(admin, coupon\?\.id, holder\)/.test(session))
  check("the free product checkout holds, uses and gives back the same way", /holdCouponUse\(admin, coupon\.id, holder\)/.test(free) && /recordCouponUse\(admin, coupon\.id, holder\)/.test(free) && /releaseCouponHold\(admin, coupon\?\.id, holder\)/.test(free))

  console.log("\nThe database function, read")
  const sql = read("supabase/sql/run-now/31_coupon_holds.sql")
  check("every line of part 31 is one whole statement", sql.trim().split("\n").slice(1).every((l) => /;\s*$/.test(l) || /^\/\*.*\*\/$/.test(l)))
  check("the code's row is locked before the places are counted", /FROM public\.coupons c WHERE c\.id = p_coupon_id FOR UPDATE;.*SELECT count\(\*\) INTO others/.test(sql))
  check("the holder's own place does not count against it", /h\.holder <> p_holder/.test(sql) && /IF used \+ others >= lim THEN RETURN false/.test(sql))
  check("expired places are cleared first", /DELETE FROM public\.coupon_holds h WHERE h\.coupon_id = p_coupon_id AND h\.expires_at < now\(\)/.test(sql))
  check("the use locks the code's row before it touches a place, the same order, so the two cannot deadlock", /BEGIN UPDATE public\.coupons SET usage_count = coalesce\(usage_count, 0\) \+ 1 WHERE id = p_coupon_id; DELETE FROM public\.coupon_holds/.test(sql))
  check("only the server can call them or read the table", (sql.match(/FROM anon, authenticated;/g) ?? []).length === 4 && (sql.match(/TO service_role;/g) ?? []).length === 4)
  check("listed in the README and in the check after", /\| `31_coupon_holds\.sql` \|/.test(read("supabase/sql/run-now/README.md")) && /as p31_coupon_holds/.test(read("supabase/sql/run-now/99_check_after.sql")))

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
