/**
 * ===========================================================================
 *  ROUND AW, TRACK F: THE SAME THING DONE TWICE MOVES MONEY, MAIL AND STOCK ONCE
 * ===========================================================================
 *   REFUND AGAIN   a partial refund pressed again after its answer was lost
 *                  (or from a tab opened before it) was a second refund: the
 *                  key moves on once a refund has gone through. The page now
 *                  sends the figure it showed, and the server refuses when the
 *                  order moved on (lib/orders/refund-state). Here: the rule,
 *                  and a community's refund (the real function) against a
 *                  Stripe that keeps idempotency. The creator's Orders route is
 *                  driven for real in tests/double-actions-aw-journey.test.ts.
 *   CLAIM AGAIN    a free claim sent again wrote a second order. The page
 *                  names its press; the same press is the same order
 *                  (lib/checkout/free-claim): two sends at once against a
 *                  table with the unique receipt token. The routes themselves:
 *                  the journey suite.
 *   COPY HELD      a paid order's losing writer kept a limited product's copy
 *                  for ten minutes after the winner let it go
 *                  (lib/checkout/fulfil-payment), the two writers run against a
 *                  fake that orders them the way production can.
 */
import { readFileSync } from "node:fs"
import { fakeDb } from "./_fake-db"
import { REFUND_CHANGED, refundChangedMessage, refundEchoStale } from "@/lib/orders/refund-state"
import { refundCommunityPayment, resetLifecycleReady, type RefundDeps, type RefundLike } from "@/lib/communities/server/membership-lifecycle"
import { claimedOrder, freeClaimToken, isClaimRace } from "@/lib/checkout/free-claim"
import { fulfilPaidCheckout } from "@/lib/checkout/fulfil-payment"
import type { PaidCheckout } from "@/lib/payments/checkout"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 600)}`}`)
  }
}
const read = (p: string) => readFileSync(p, "utf8")
/* Comments out (none of these files has a slash-star inside a string), so a check reads code, not the prose about it. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
const BANNED = /unlock|elevate|seamless|powerful|effortlessly|supercharge|transform|—/i

async function main() {
  /* A secret to derive tokens with, as production has (RECEIPT_TOKEN_SECRET, else the service key). */
  process.env.RECEIPT_TOKEN_SECRET = process.env.RECEIPT_TOKEN_SECRET || "receipt-aw-suite"

  /* ── 1. The figure the refund dialog read ────────────────────────────── */
  console.log("\n1. The figure a refund dialog read, echoed back (lib/orders/refund-state)")
  check("no figure (a page from before) is not a change: the refund goes as it did", !refundEchoStale(undefined, 1500) && !refundEchoStale(null, 1500) && !refundEchoStale("", 1500))
  check("the figure the order still holds goes through", !refundEchoStale(1500, 1500) && !refundEchoStale("1500", 1500))
  check("a figure the order has moved past is refused", refundEchoStale(2000, 1500) && refundEchoStale(0, 1500) && refundEchoStale(1500, 0))
  check("a figure that is not a whole amount is never a yes to send money back", refundEchoStale(15.5, 1500) && refundEchoStale("15.00", 1500) && refundEchoStale(-1, 0) && refundEchoStale({}, 1500) && refundEchoStale(Number.NaN, 1500))
  const said = refundChangedMessage(500, (c) => `$${(c / 100).toFixed(2)}`)
  check("the seller is told what went back already and that nothing more did", /\$5\.00 of this order has already been refunded/.test(said) && /nothing more was sent back/.test(said), said)
  check("  in plain words, no em dash", !BANNED.test(said) && !BANNED.test(refundChangedMessage(0, () => "")))

  /* ── 2. A community's payments, through the real function ─────────────── */
  console.log("\n2. A community payment refunded again after \"No connection\": one refund (lib/communities/server/membership-lifecycle)")
  {
    const C = "00000000-0000-4000-8000-0000000000c1"
    const CREATOR = "00000000-0000-4000-8000-0000000000e1"
    const OWNER = "00000000-0000-4000-8000-0000000000a9"
    const P = "00000000-0000-4000-8000-0000000000f1"
    const O = "00000000-0000-4000-8000-0000000000b1"
    const tables: Record<string, Record<string, any>[]> = {
      communities: [{ id: C, name: "Clay Studio", slug: "clay-studio", owner_user_id: OWNER, creator_id: CREATOR }],
      products: [{ id: P, type: "membership", title: "Clay Studio", creator_id: CREATOR, community_id: C }],
      orders: [{ id: O, product_id: P, buyer_id: null, buyer_email: "ana@example.com", buyer_first_name: "Ana", amount_cents: 1900, currency: "usd", status: "completed", stripe_payment_intent_id: "pi_c1", receipt_token: "rcpt_c1", created_at: new Date().toISOString() }],
      creators: [{ id: CREATOR, user_id: OWNER, username: "mara" }],
      profiles: [{ id: OWNER, display_name: "Mara Stone" }],
      membership_invoices: [],
      memberships: [],
      entitlements: [],
      community_access_products: [],
      community_audit_log: [],
      community_cancellations: [],
      community_refunds: [],
    }
    const db = fakeDb(tables, { unique: { community_refunds: [["stripe_refund_id"]] } })
    resetLifecycleReady()
    /* Stripe with its idempotency: the same key answers the same refund. */
    const byKey = new Map<string, RefundLike>()
    const made: RefundLike[] = []
    const mails: string[] = []
    const deps: RefundDeps = {
      createRefund: async (_params, key) => {
        const kept = byKey.get(key)
        if (kept) return { ...kept }
        const r: RefundLike = { id: `re_c${made.length + 1}`, status: "succeeded", currency: "usd", metadata: {} }
        byKey.set(key, r)
        made.push(r)
        return { ...r }
      },
      retrieveRefund: async (id) => ({ ...(made.find((r) => r.id === id) as RefundLike) }),
      updateRefund: async () => undefined,
      afterRefund: async () => undefined,
      endSubscription: async () => undefined,
      emit: async () => undefined,
      sendMail: async (m) => {
        mails.push(m.to)
        return { success: true }
      },
      baseUrl: () => "https://storelib.com",
    }
    const input = { communityId: C, communityName: "Clay Studio", creatorId: CREATOR, actorUserId: OWNER, orderId: O, amountCents: 500, refundableCents: 1900 }
    const a = await refundCommunityPayment(db as never, input, deps)
    check("the first press refunds 5.00", a.ok === true && a.value.amountCents === 500 && made.length === 1 && tables.orders[0].refund_amount_cents === 500, a)
    /* Its answer never reached the dialog ("No connection. Check it and try again."), and the owner presses again. */
    const b = await refundCommunityPayment(db as never, input, deps)
    check("the same press again: no second refund, no second email", made.length === 1 && mails.length === 1, { made: made.length, mails: mails.length })
    check("  refused (409) with what the payment holds now", b.ok === false && b.status === 409 && b.error === REFUND_CHANGED && b.detail?.refundableCents === 1400 && b.detail?.refundedCents === 500, b)
    check("  in the owner's words", b.ok === false && /of this order has already been refunded/.test(b.message) && !BANNED.test(b.message), b)
    const c = await refundCommunityPayment(db as never, { ...input, refundableCents: 1400 }, deps)
    check("on the figure the dialog now shows, a second refund goes through", c.ok === true && made.length === 2 && tables.orders[0].refund_amount_cents === 1000, c)
    const d = await refundCommunityPayment(db as never, { ...input, refundableCents: undefined }, deps)
    check("a dialog from before this round (no figure) refunds as it did", d.ok === true && made.length === 3, d)
  }

  /* ── 3. A free claim sent again ──────────────────────────────────────── */
  console.log("\n3. A free claim's token for one press (lib/checkout/free-claim)")
  const ATTEMPT = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
  const t = freeClaimToken(ATTEMPT, { productId: "p-1", variantId: null, email: "Ana@Example.com " })
  check("the same press names the same token, whatever the address's case or spaces", typeof t === "string" && t.length >= 24 && t === freeClaimToken(ATTEMPT, { productId: "p-1", variantId: "", email: "ana@example.com" }))
  check("another press, product, option or address is another order", new Set([t, freeClaimToken("f".repeat(32), { productId: "p-1", email: "ana@example.com" }), freeClaimToken(ATTEMPT, { productId: "p-2", email: "ana@example.com" }), freeClaimToken(ATTEMPT, { productId: "p-1", variantId: "v-1", email: "ana@example.com" }), freeClaimToken(ATTEMPT, { productId: "p-1", email: "bo@example.com" })]).size === 5)
  check("no attempt (a page from before), or not one a page makes: no token, a fresh one as before", freeClaimToken(undefined, { productId: "p-1", email: "a@b.co" }) === null && freeClaimToken("short", { productId: "p-1", email: "a@b.co" }) === null && freeClaimToken("x y z ".repeat(5), { productId: "p-1", email: "a@b.co" }) === null)
  {
    /* Two sends of one press at the same moment, against the orders table's unique receipt token: the routes' own steps, in their order. */
    const db = fakeDb({ orders: [] }, { unique: { orders: [["receipt_token"]] } })
    const send = async () => {
      const token = freeClaimToken(ATTEMPT, { productId: "p-1", email: "ana@example.com" })
      const earlier = await claimedOrder(db as never, token, "p-1")
      if (earlier) return earlier.id
      const made = await db.from("orders").insert({ product_id: "p-1", receipt_token: token, buyer_email: "ana@example.com", amount_cents: 0 }).select().single()
      if (made.error && isClaimRace(made.error)) return (await claimedOrder(db as never, token, "p-1"))?.id ?? null
      return (made.data as { id?: string } | null)?.id ?? null
    }
    const [x, y] = await Promise.all([send(), send()])
    check("two sends at once: one order, and both answer it", db.tables.orders.length === 1 && !!x && x === y, { orders: db.tables.orders.length, x, y })
    const z = await send()
    check("a send after both: the same order", z === x && db.tables.orders.length === 1)
    check("an order of another product is never handed back for this one", (await claimedOrder(db as never, freeClaimToken(ATTEMPT, { productId: "p-1", email: "ana@example.com" }), "p-9")) === null)
    const broken = fakeDb({}, { failWith: { orders: { code: "57014", message: "statement timeout" } } })
    check("an order that could not be read is no order (the claim goes on, never a crash)", (await claimedOrder(broken as never, "tok", "p-1")) === null)
  }

  /* ── 4. A limited copy, held by the writer that lost ─────────────────── */
  console.log("\n4. A paid order's second writer lets its copy go (lib/checkout/fulfil-payment)")
  {
    const PRODUCT = "p-lim"
    const paid: PaidCheckout = {
      provider: "stripe",
      paymentId: "pi_lim",
      amountMinor: 900,
      currency: "usd",
      metadata: { product_id: PRODUCT, creator_id: "c-lim", receipt_token: "rt_lim", buyer_email: "hal@example.com", buyer_first_name: "Hal", product_title: "Last Copies", platform_fee_cents: "50", sale_holder: "e:hal" },
      receiptEmail: "hal@example.com",
      createdSeconds: Math.floor(Date.now() / 1000),
      facts: { paymentMethod: "card", cardBrand: "visa", cardLast4: "4242", paypalEmail: null, applicationFeeCents: 50, transferId: null, destinationPaymentId: null, chargeId: null },
    }
    const db = fakeDb(
      { orders: [], order_followups: [], products: [{ id: PRODUCT, title: "Last Copies", creator_id: "c-lim", sales_limit: 10 }], creators: [{ id: "c-lim", user_id: "u-lim" }], customers: [], entitlements: [], seller_ledger: [], ledger_events: [], analytics_events: [], profiles: [] },
      { unique: { orders: [["receipt_token"]], order_followups: [["order_id", "step"]] } },
    )
    /* hold_product_sale and release_product_sale as the database keeps them: one place per product and holder. */
    const holds = new Set<string>()
    const rpc = async (fn: string, a: Record<string, unknown>) => {
      if (fn === "hold_product_sale") holds.add(`${a.p_product}|${a.p_holder}`)
      if (fn === "release_product_sale") holds.delete(`${a.p_product}|${a.p_holder}`)
      return { data: fn === "hold_product_sale" ? true : null, error: null }
    }
    const winnerDb = { ...db, rpc }
    /* The second writer (the buyer's page, a moment behind the webhook) found no order, then waits at its read of the limit while the first writes, lets its place go and answers. */
    let open: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (open = resolve))
    let gated = false
    const loserDb = {
      ...winnerDb,
      from: (table: string) => {
        const b = db.from(table)
        if (table === "products" && !gated) {
          gated = true
          const then = b.then.bind(b)
          b.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => gate.then(() => then(resolve, reject))
        }
        return b
      },
    }
    const quiet = { baseUrl: "https://storelib.com", defer: () => undefined }
    const second = fulfilPaidCheckout(loserDb as never, paid, quiet)
    await new Promise((resolve) => setTimeout(resolve, 20))
    const firstWriter = await fulfilPaidCheckout(winnerDb as never, paid, quiet)
    check("the first writer makes the order and lets its place go", firstWriter.ok === true && firstWriter.created === true && holds.size === 0, { firstWriter, holds: [...holds] })
    open()
    const loser = await second
    check("the second writer answers the first one's order", loser.ok === true && loser.created === false && db.tables.orders.length === 1, loser)
    check("  and leaves no place held under the limit (the order counts the copy)", holds.size === 0, [...holds])
  }

  /* ── 5. Where it is wired ────────────────────────────────────────────── */
  console.log("\n5. Where it is wired")
  const route = code("app/api/stripe/refund/route.ts")
  check("the refund route checks the dialog's figure before Stripe is asked", route.indexOf("refundEchoStale(body.refundable, maxRefundCents)") > route.indexOf("const maxRefundCents") && route.indexOf("refundEchoStale(body.refundable, maxRefundCents)") < route.indexOf("stripe.refunds.create("))
  check("  and answers 409 with the order's figures", /code: REFUND_CHANGED, refundableCents: maxRefundCents, refundedCents: alreadyRefunded \},\s*\{ status: 409 \}/.test(route))
  check("  its key is unchanged, so the admin's refund still meets it", /idempotencyKey: `storelib-refund:\$\{orderId\}:\$\{alreadyRefunded\}:\$\{refundAmountCents\}`/.test(route))
  const orders = code("app/(storelib)/app/orders/orders-client.tsx")
  check("Orders sends what the dialog showed as left", /refundable: refundableCents\(action\.line\)/.test(orders))
  check("  and a refused press shows the order as it now is", /data\?\.code === REFUND_CHANGED[\s\S]{0,160}patchRows\(\[action\.line\.id\], \{ status: "refunded", refund_amount_cents: data\.refundedCents \}\)/.test(orders))
  const life = code("lib/communities/server/membership-lifecycle.ts")
  check("a community refund checks the figure before Stripe is asked", life.indexOf("refundEchoStale(input.refundableCents, left)") > 0 && life.indexOf("refundEchoStale(input.refundableCents, left)") < life.indexOf("deps.createRefund("))
  const communityRoute = code("app/api/app/community/[id]/refunds/route.ts")
  check("  its route passes the figure and answers what the payment holds", /refundableCents: body\.refundableCents/.test(communityRoute) && /\.\.\.\(done\.detail \?\? \{\}\)/.test(communityRoute))
  const dialog = code("components/community/membership/refund-dialog.tsx")
  check("  and its dialog sends what it shows, and shows what the payment holds after a refusal", /refundableCents: max,/.test(dialog) && /a\?\.code === REFUND_CHANGED/.test(dialog) && /setShown\(\{ \.\.\.p, refundableCents: a\.refundableCents/.test(dialog))
  const proc = code("app/api/checkout/process/route.ts")
  check("the free checkout finds this press's order before the price, a code's place or a copy", proc.indexOf("freeClaimToken(body.attemptId") > 0 && proc.indexOf("freeClaimToken(body.attemptId") < proc.indexOf("priceOrder(") && proc.indexOf("if (claimed) return claimedAnswer(cookieStore, claimed)") < proc.indexOf("holdCouponUse("))
  check("  writes under this press's token, else a fresh one as before", /const receiptToken = claimToken \?\? generateReceiptToken\(\)/.test(proc))
  check("  and two sends at once meet at the unique token, the loser's holds given back", proc.indexOf("isClaimRace(orderError)") > 0 && proc.indexOf("isClaimRace(orderError)") < proc.indexOf("const minimal") && /if \(raced\) \{\s*if \(holder\) await releaseCouponHold\(admin, coupon\?\.id, holder\)\s*if \(saleHolder\) await releaseSale\(admin, product\.id, saleHolder\)\s*return claimedAnswer/.test(proc))
  const qfree = code("app/api/checkout/quick-free/route.ts")
  check("the OnePage's free claim the same way", qfree.indexOf("freeClaimToken(body.attempt_id") > 0 && qfree.indexOf("freeClaimToken(body.attempt_id") < qfree.indexOf('from("products")') && /const receiptToken = claimToken \?\? generateReceiptToken\(\)/.test(qfree) && qfree.indexOf("isClaimRace(orderError)") > 0)
  check("the checkout page and the instant checkout send their attempt id with a free order", /"\/api\/checkout\/process", \{ \.\.\.body, attemptId: attemptIdOf\(attemptRef\) \}/.test(code("app/(storelib)/checkout/checkout-client.tsx")) && /"\/api\/checkout\/process", \{ \.\.\.order\(true\), attemptId: attemptIdOf\(attemptRef\) \}/.test(code("components/checkout/instant-checkout.tsx")))
  const onepage = code("components/onepage/public-onepage.tsx")
  check("the OnePage sends one per opening of its sheet", /attempt_id: attemptIdOf\(quickClaimAttempt\)/.test(onepage) && /quickClaimAttempt\.current = null\s*setQuickCheckoutModalOpen\(true\)/.test(onepage))
  const fulfil = code("lib/checkout/fulfil-payment.ts")
  const racedAt = fulfil.indexOf("const raced = await existingOrder")
  check("the paid order's second writer lets its copy go before it answers", racedAt > 0 && /if \(raced\) \{\s*await releaseSale\(admin, productId, saleHolder\)\s*return \{ ok: true, created: false/.test(fulfil.slice(racedAt)))
  const runner = read("scripts/run-push-tests.mjs")
  check("both suites are in the push run, the journey one strict", runner.indexOf('"tests/double-actions-aw.test.ts"') > 0 && runner.indexOf('"tests/double-actions-aw.test.ts"') < runner.indexOf("const STRICT_SUITES") && runner.indexOf('"tests/double-actions-aw-journey.test.ts"') > runner.indexOf("const STRICT_SUITES"))

  console.log(`\n${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
