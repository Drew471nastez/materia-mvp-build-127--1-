/**
 * ===========================================================================
 *  WHAT A BUYER PAYS IS THE SERVER'S TO DECIDE, AND AN ORDER HAPPENS ONCE
 * ===========================================================================
 * The checkout audit found money leaking in both directions: a negative tip
 * took money off, a pay-what-you-want product sent without an amount cost
 * nothing, a discount the page showed was never charged, `%` matched any
 * coupon, anyone could use up a coupon, a free variant unlocked the paid
 * ones, and a buyer who closed the tab after paying had no order at all.
 * Each is pinned here, by running the pricing itself where it is pure and
 * by reading the routes where it is not.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { baseFor, priceOrder, totalsOf, wholeCents, MAX_TIP_CENTS } from "../lib/checkout/pricing"
import { checkCoupon, discountFor, escapeLike, normaliseCode, type CouponRow } from "../lib/checkout/coupons"
import { businessFromMetadata, businessToMetadata, checkBusiness, EMPTY_BUSINESS } from "../lib/checkout/business"
import { fullyRefunded } from "../lib/orders/refund-state"
import { cartFingerprint, cartReceiptToken } from "../lib/checkout/cart-tokens"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${label}`)
  } else {
    failed++
    failures.push(label + (detail ? ` — ${detail}` : ""))
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

/* A database with one product, one variant and one coupon, answering the
   chained calls priceOrder makes. */
const PRODUCT = "11111111-1111-4111-8111-111111111111"
function fakeDb(opts: { product?: Record<string, unknown>; variant?: Record<string, unknown> | null; coupon?: Partial<CouponRow> | null }) {
  const rows: Record<string, Record<string, unknown> | null> = {
    products: { id: PRODUCT, title: "Kit", slug: "kit", type: "digital", status: "published", price_cents: 2000, thumbnail_url: null, creator_id: "c1", ...(opts.product ?? {}) },
    product_variants: opts.variant ?? null,
    coupons: opts.coupon ? ({ id: "cp1", code: "SAVE", creator_id: "c1", discount_type: "percentage", discount_value: 10, starts_at: null, expires_at: null, usage_limit: null, usage_count: 0, product_ids: null, is_active: true, ...opts.coupon } as Record<string, unknown>) : null,
  }
  return {
    from(table: string) {
      const q: Record<string, unknown> = {}
      const chain = {
        select: () => chain,
        eq: () => chain,
        ilike: (_c: string, v: string) => {
          q.ilike = v
          return chain
        },
        limit: () => chain,
        maybeSingle: async () => ({ data: rows[table], error: null }),
      }
      return chain
    },
  }
}

async function main() {
  console.log("\nPrices and tips")
  check("a negative tip is refused, not subtracted", wholeCents(-500, 0, MAX_TIP_CENTS) === null)
  check("a tip sent as a string is a number, not concatenated", wholeCents("300", 0, MAX_TIP_CENTS) === 300)
  check("a fractional cent is refused", wholeCents(1.5, 0, MAX_TIP_CENTS) === null)
  check("a discount never goes past the price", totalsOf(1000, 5000, 0).totalCents === 0)
  {
    const r = await priceOrder(fakeDb({}), { productId: PRODUCT, tipCents: -2000 })
    check("the order route refuses a negative tip", r.ok === false)
  }

  console.log("\nPay what you want")
  const pwyw = { price_cents: 0, pay_what_you_want: true, pwyw_min_price_cents: 1500 }
  const noAmount = baseFor(pwyw, undefined)
  check("sent without an amount it costs the minimum, not nothing", noAmount.ok === true && noAmount.cents === 1500)
  check("below the minimum is refused", baseFor(pwyw, 100).ok === false)
  const more = baseFor(pwyw, 2500)
  check("above the minimum is the buyer's amount", more.ok === true && more.cents === 2500)
  {
    const r = await priceOrder(fakeDb({ product: pwyw }), { productId: PRODUCT })
    check("and the whole order prices it that way", r.ok === true && r.totals.totalCents === 1500)
  }

  console.log("\nCoupons")
  check("% is a character, not a wildcard", escapeLike("%") === "\\%" && escapeLike("A_B") === "A\\_B")
  check("an empty or huge code is not a code", normaliseCode("") === null && normaliseCode("x".repeat(65)) === null)
  check("a percentage over 100 takes the price and no more", discountFor({ discount_type: "percentage", discount_value: 250 }, 1000) === 1000)
  check("a fixed amount is in dollars", discountFor({ discount_type: "fixed", discount_value: 5 }, 2000) === 500)
  const base: CouponRow = { id: "c", code: "X", creator_id: "c1", discount_type: "fixed", discount_value: 5, starts_at: null, expires_at: null, usage_limit: 3, usage_count: 3, product_ids: null, is_active: true }
  check("a used-up code is refused", checkCoupon(base, { productId: PRODUCT, priceCents: 2000 }).ok === false)
  check("an expired code is refused", checkCoupon({ ...base, usage_count: 0, expires_at: "2000-01-01T00:00:00Z" }, { productId: PRODUCT, priceCents: 2000 }).ok === false)
  check("another product's code is refused", checkCoupon({ ...base, usage_count: 0, product_ids: ["other"] }, { productId: PRODUCT, priceCents: 2000 }).ok === false)
  check("a minimum order is kept", checkCoupon({ ...base, usage_count: 0, min_purchase_cents: 5000 }, { productId: PRODUCT, priceCents: 2000 }).ok === false)
  {
    const r = await priceOrder(fakeDb({ coupon: {} }), { productId: PRODUCT, couponCode: "save", tipCents: 100 })
    check("the server charges the discount it shows", r.ok === true && r.totals.discountCents === 200 && r.totals.totalCents === 1900)
  }
  check("no open endpoint counts a coupon's use", !existsSync("app/api/coupons/[id]/use/route.ts"))
  check("the Apply check no longer takes a price from the page", !/body\.price_cents|price_cents \}/.test(read("app/api/coupons/validate/route.ts")) && /priceOrder\(/.test(read("app/api/coupons/validate/route.ts")))

  console.log("\nBuying for a business")
  const good = { ...EMPTY_BUSINESS, company: "Ștefan Design SRL", taxId: "RO12345678", country: "RO", line1: "Str. Lipscani 10", city: "București", postalCode: "030031" }
  const ok = checkBusiness(good)
  check("a real company passes", ok.ok === true)
  check("markup is stripped from a company name", checkBusiness({ ...good, company: "<b>Acme</b>" }).ok === true && (checkBusiness({ ...good, company: "<b>Acme</b>" }) as { value: { company: string } }).value.company.includes("<") === false)
  check("an unknown country is refused", checkBusiness({ ...good, country: "ZZ" }).ok === false)
  check("a tax number is letters and digits", checkBusiness({ ...good, taxId: "DROP TABLE;" }).ok === false)
  {
    const de = { ...EMPTY_BUSINESS, company: "Acme GmbH", country: "DE", line1: "Friedrichstraße 43", city: "Berlin", postalCode: "10117" }
    const typed = checkBusiness({ ...de, taxId: "de 123 456 789" })
    check("a German VAT number is written as the tax office writes it", typed.ok === true && typed.value.taxId === "DE123456789")
    check("  with or without its letters", (checkBusiness({ ...de, taxId: "123456789" }) as { value?: { taxId: string } }).value?.taxId === "DE123456789")
    const short = checkBusiness({ ...de, taxId: "DE1234" })
    check("  one too short is refused, with what one looks like", short.ok === false && short.field === "taxId" && /DE123456789/.test(short.error))
    check("a Greek one is EL", (checkBusiness({ ...de, country: "GR", postalCode: "10431", taxId: "123456789" }) as { value?: { taxId: string } }).value?.taxId === "EL123456789")
    check("a US company's number is taken in any shape", checkBusiness({ ...de, country: "US", postalCode: "10118", taxId: "12-3456789" }).ok === true)
    check("the postcode is asked for where there is one", (checkBusiness({ ...de, postalCode: "" }) as { field?: string }).field === "postalCode")
    check("  and not in Hong Kong, which has none", checkBusiness({ ...de, country: "HK", postalCode: "" }).ok === true)
    check("  a US ZIP code is five digits", checkBusiness({ ...de, country: "US", postalCode: "1011" }).ok === false && checkBusiness({ ...de, country: "US", postalCode: "10118-1234" }).ok === true)
    check("the company and its country come before anything else is asked", (checkBusiness({ ...EMPTY_BUSINESS }) as { field?: string }).field === "company" && (checkBusiness({ ...EMPTY_BUSINESS, company: "Acme" }) as { field?: string }).field === "country")
  }
  if (ok.ok) {
    const meta = businessToMetadata(ok.value)
    check("every metadata value fits Stripe's 500 characters", Object.values(meta).every((v) => v.length <= 500))
    check("and it comes back as it went in", JSON.stringify(businessFromMetadata(meta)) === JSON.stringify(ok.value))
  }

  console.log("\nRefunds")
  check("a full refund is a refund", fullyRefunded({ status: "refunded", amount_cents: 1000, refund_amount_cents: 1000 }))
  check("a partial refund keeps the product", !fullyRefunded({ status: "refunded", amount_cents: 1000, refund_amount_cents: 300 }))
  check("a completed order is not refunded", !fullyRefunded({ status: "completed", amount_cents: 1000 }))

  console.log("\nOptions")
  {
    const r = await priceOrder(fakeDb({ variant: { id: "v1", product_id: PRODUCT } }), { productId: PRODUCT })
    check("a product with options cannot be bought without one", r.ok === false && /option/i.test((r as { error: string }).error))
  }

  console.log("\nBaskets written once")
  {
    process.env.RECEIPT_TOKEN_SECRET = "test-secret"
    const a = cartReceiptToken("cs_test_1", 0)
    check("a basket line's token is the same every time", a === cartReceiptToken("cs_test_1", 0))
    check("  and differs by line and by session", a !== cartReceiptToken("cs_test_1", 1) && a !== cartReceiptToken("cs_test_2", 0))
    check("  and is a receipt token's shape", /^[A-Za-z0-9_-]{32}$/.test(a))
    check("the session fingerprint is repeatable too", cartFingerprint("cs_test_1") === cartFingerprint("cs_test_1"))
    const complete = read("app/api/checkout/cart/complete/route.ts")
    check("the buyer's return and the webhook share one fulfilment", /fulfilCartSession\(/.test(complete) && /fulfilCartSession\(supabaseAdmin/.test(read("app/api/stripe/webhook/route.ts")))
    check("a line written by the other caller counts as there, not as a failure", /error\?\.code === "23505"\) return \{ status: "exists" \}/.test(read("lib/checkout/fulfil-cart-item.ts")))
    check("the cart is rate limited", /bucket: "payment"/.test(read("app/api/checkout/cart/route.ts")))
  }

  console.log("\nRefunds reach the seller")
  const refundRoute = read("app/api/stripe/refund/route.ts")
  check("a refund takes the money back from the seller", /reverse_transfer = true/.test(refundRoute))
  check("the Refund button and the webhook record a refund the same way", /syncChargeRefund\(admin, stripe, charge\)/.test(refundRoute) && /syncChargeRefund\(supabaseAdmin, stripe, charge\)/.test(read("app/api/stripe/webhook/route.ts")))
  check("a partly refunded order can be refunded again, up to what is left", /maxRefundCents = Math\.max\(0, \(order\.amount_cents \|\| 0\) - alreadyRefunded\)/.test(refundRoute))

  console.log("\nThe routes")
  const session = read("app/api/checkout/stripe-session/route.ts")
  check("the payment is priced by the server", /priceOrder\(/.test(session) && !/basePriceCents \+ \(tipCents/.test(session))
  check("  refuses without consent", /agreedToTerms !== true/.test(session))
  check("  is rate limited", /bucket: "payment"/.test(session))
  check("  records the discount, the code and the business on the payment", /discount_cents:/.test(session) && /coupon_code:/.test(session) && /businessToMetadata/.test(session))
  check("  no gift left anywhere in the checkout", !/is_gift|isGift/.test(session + read("app/checkout/checkout-client.tsx")))
  const free = read("app/api/checkout/process/route.ts")
  check("the free route is priced the same way and refuses any price", /priceOrder\(/.test(free) && /totals\.totalCents !== 0/.test(free))
  check("  and writes the variant on the order", /variant_id: variant\.id/.test(free))
  check("  and never leaks the database's error", !/details:|hint:|debug:/.test(free))
  const fulfil = read("lib/checkout/fulfil-payment.ts")
  check("a paid order reads latest_charge, not the removed charges", /expand: \["latest_charge"/.test(fulfil) && !/expand: \["charges"/.test(fulfil))
  check("the webhook makes the order when the browser does not", /fulfilPaymentIntent\(supabaseAdmin, pi\.id/.test(read("app/api/stripe/webhook/route.ts")))
  check("confirming needs the client secret, not only the id", /!paymentIntentId \|\| !clientSecret/.test(read("app/api/checkout/confirm-payment/route.ts")))
  check("the app's card path only confirms a checkout's own payment", /isCheckoutIntent\(current\)/.test(read("app/api/checkout/confirm-with-pm/route.ts")))
  check("downloads fail closed when the variant check errors", /variant check failed, refusing/.test(read("lib/receipts/download-access.ts")) && !/Fail-open/.test(read("app/api/download/[assetId]/route.ts")) && !/Fail-open/.test(read("lib/receipts/download-access.ts")))
  check("the dead payment routes are gone", ["route.ts", "complete/route.ts", "free/route.ts", "create-intent/route.ts", "complete-free/route.ts"].every((f) => !existsSync(`app/api/checkout/${f}`)))
  check("the invoice font is traced into the functions that draw it", /'\/api\/checkout\/invoice': \['\.\/lib\/checkout\/fonts\/\*\*'\]/.test(read("next.config.mjs")))

  check("a Stripe outage makes the webhook retry instead of dropping the order", /status: 503/.test(read("lib/checkout/fulfil-payment.ts")))
  check("an invoice that cannot be drawn never stops the order emails", /invoice for order \$\{order\.id\} could not be drawn/.test(read("lib/checkout/fulfil-payment.ts")))

  console.log("\nThe page")
  {
    const client = read("app/checkout/checkout-client.tsx")
    check("after paying, the payment goes in the address before the order is asked for", /url\.searchParams\.set\("payment_intent", paymentIntentId\)/.test(client))
    check("  and making the order is retried before giving up", /for \(const wait of \[0, 1500, 4000\]\)/.test(client))
    check("the $0.50 minimum is said before a wallet opens", /total < MIN_CHARGE_CENTS/.test(client))
    check("nothing is payable once paid", /busy=\{busy \|\| !!paid \|\| settled\}/.test(client) && /inert=\{!!paid\}/.test(client))
    check("Stripe.js waits until the app is known not to be the app", /useState<boolean \| null>\(null\)/.test(client))
  }
  const page = read("app/checkout/checkout-client.tsx")
  check("no 'Secured checkout by Stripe' line", !/Secured checkout by Stripe/.test(page))
  /* The tip was redrawn as one folded "Add a tip" line (the owner found the
     old heading, row of four and field too much to read on the way to
     paying); the creator it is for is still named, to a screen reader and on
     its choices, and the same None/$1/$3/$5/own amount are sent. */
  {
    const summary = read("app/checkout/parts/order-summary.tsx")
    check(
      /* Changed on purpose: the tip is folded again by default ("Add a tip should be collapsed as default"); the line still names the creator and the same amounts are sent. */
      "the tip and the code are kept (the tip folded under its Add a tip line, which names the creator)",
      />Add a tip<\/span>/.test(summary) && /<span className="text-\[#6b7280\]"> for \{creatorName\}<\/span>/.test(summary) && /const TIPS = \[0, 100, 300, 500\] as const/.test(summary) && /Enter discount code/.test(summary),
    )
  }
  check("Link, wallets and PayPal come from Stripe's own elements", /ExpressCheckoutElement/.test(read("app/checkout/parts/stripe-pay.tsx")) && /LinkAuthenticationElement/.test(read("app/checkout/parts/stripe-pay.tsx")))

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) {
    console.log(failures.map((f) => `  - ${f}`).join("\n"))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
