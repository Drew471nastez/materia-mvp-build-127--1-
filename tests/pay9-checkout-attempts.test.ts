/**
 * PAY-9: ONE ORDER, ONE PAYMENTINTENT, HOWEVER OFTEN PAY IS PRESSED
 *
 * Over the journey harness (tests/_journey: the real stripe-session route, an
 * in-memory PostgREST built from the repository's SQL, a Stripe world that
 * honours idempotency keys). With run-now part 352 (checkout_attempts):
 *
 *   same        two presses with the same attempt id and order: ONE PaymentIntent,
 *               the same receipt token, the order made once when paid
 *   changed     a changed tip (amount) under the same attempt id: a new PaymentIntent
 *   other buyer the same attempt id from another email: a new one, other tokens
 *   no id       a request without an attempt id: a new PaymentIntent each time, as before
 *   missing     without the table: answered as before (a PaymentIntent per request, no error)
 *   mismatch    Stripe refuses the key (parameters differ): a new attempt, never an error
 *   canceled    the attempt's PaymentIntent was canceled: a new one
 *   wallet      the app's wallet sheet: the same Checkout Session for the same order
 *   unit        tokens never come from the attempt id; the hash ignores the tokens only
 *   sql         part 352 is service role only (RLS on, no policy, nothing granted)
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { Journey } from "./_journey/harness"
import { instantOrderBody } from "../lib/onepage/product-block"
import { attemptIdFrom, isIdempotencyMismatch, orderHash, resetCheckoutAttemptsCache } from "../lib/checkout/checkout-attempts"
import { attemptIdOf, newCheckoutAttemptId } from "../lib/checkout/attempt-id"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)

let ip = 10
/** Each group from its own address, so the payment rate limit (10 in 10 minutes) never decides a check here. */
const from = () => ({ "x-forwarded-for": `203.0.113.${ip++}` })

async function main() {
  const j = await Journey.start()
  j.world.strictIdempotency = true

  section("1. A store with payments on and a download")
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const creator = j.rows("creators")[0]
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const pack = newProduct(j, creator.id as string, { title: "Tech House Pack", priceCents: 2000 })
  const order = (email: string, extra: Record<string, unknown> = {}) => ({ ...instantOrderBody({ productId: pack, email, name: "Bea Buyer" }, false), ...extra })
  const press = (body: Record<string, unknown>, headers = from()) => j.call("POST /api/checkout/stripe-session", { body, headers })

  section("2. Pressed twice with the same attempt: one PaymentIntent")
  const attempt = newCheckoutAttemptId()
  const before = j.world.intents.size
  const first = await press(order("bea@example.com", { attemptId: attempt }))
  const second = await press(order("bea@example.com", { attemptId: attempt }))
  check("both presses answer a payment form", first.status === 200 && second.status === 200 && !!first.json?.clientSecret && !!second.json?.clientSecret, { first: first.json, second: second.json })
  check("the same PaymentIntent both times", !!first.json?.paymentIntentId && first.json.paymentIntentId === second.json?.paymentIntentId, { first: first.json?.paymentIntentId, second: second.json?.paymentIntentId })
  check("  and Stripe made only one", j.world.intents.size === before + 1, { made: j.world.intents.size - before })
  const rows = j.rows("checkout_attempts")
  check("one attempt row, with the PaymentIntent written on it", rows.length === 1 && rows[0].payment_intent_id === first.json?.paymentIntentId, rows.map((r) => ({ pi: r.payment_intent_id })))
  const pi = j.world.intents.get(first.json?.paymentIntentId)
  check("the PaymentIntent carries the row's receipt token and fingerprint", !!pi && pi.metadata.receipt_token === rows[0].receipt_token && pi.metadata.session_fingerprint === rows[0].session_fingerprint && pi.metadata.access_token === rows[0].access_token, pi?.metadata)
  check("  never anything made from the attempt id", !!pi && !String(pi.metadata.receipt_token).includes(attempt) && !String(pi.metadata.access_token).includes(attempt) && !JSON.stringify(rows[0]).includes(attempt), null)

  section("3. A changed order under the same attempt: a new PaymentIntent")
  const tipped = await press(order("bea@example.com", { attemptId: attempt, tipCents: 500 }))
  check("a tip added: answered, a different PaymentIntent", tipped.status === 200 && !!tipped.json?.paymentIntentId && tipped.json.paymentIntentId !== first.json?.paymentIntentId, tipped.json)
  check("  for the new amount", j.world.intents.get(tipped.json?.paymentIntentId)?.amount === 2500, j.world.intents.get(tipped.json?.paymentIntentId)?.amount)
  check("  with its own tokens", j.world.intents.get(tipped.json?.paymentIntentId)?.metadata.receipt_token !== pi?.metadata.receipt_token)
  const back = await press(order("bea@example.com", { attemptId: attempt }))
  check("back to the first order: the first PaymentIntent again", back.json?.paymentIntentId === first.json?.paymentIntentId, back.json)

  section("4. The same attempt id from another buyer: another PaymentIntent, other tokens")
  const other = await press(order("cal@example.com", { attemptId: attempt }))
  const otherPi = j.world.intents.get(other.json?.paymentIntentId)
  check("another PaymentIntent", other.status === 200 && other.json?.paymentIntentId !== first.json?.paymentIntentId, other.json)
  check("  with another receipt token", !!otherPi && otherPi.metadata.receipt_token !== pi?.metadata.receipt_token, otherPi?.metadata)

  section("5. No attempt id (an older page): every request its own, as before")
  const n0 = j.world.intents.size
  const plainA = await press(order("dan@example.com"))
  const plainB = await press(order("dan@example.com"))
  check("two requests, two PaymentIntents", plainA.status === 200 && plainB.status === 200 && plainA.json?.paymentIntentId !== plainB.json?.paymentIntentId && j.world.intents.size === n0 + 2, { a: plainA.json, b: plainB.json })
  check("  a junk attempt id is no attempt", attemptIdFrom("x") === null && attemptIdFrom("<script>alert(1)</script>") === null && attemptIdFrom(newCheckoutAttemptId()) !== null)

  section("6. Paid: the order is made once, from the one PaymentIntent")
  j.world.payIntent(first.json.paymentIntentId)
  const confirmed = await j.call("POST /api/checkout/confirm-payment", { body: { paymentIntentId: first.json.paymentIntentId, clientSecret: second.json.clientSecret } })
  check("confirm-payment makes the order and answers its receipt", confirmed.status === 200 && typeof confirmed.json?.receiptToken === "string", { status: confirmed.status, body: confirmed.json })
  check("  one order for Bea, 20.00", j.rows("orders").filter((o) => o.buyer_email === "bea@example.com").length === 1 && j.rows("orders").find((o) => o.buyer_email === "bea@example.com")?.amount_cents === 2000)

  section("7. Stripe refuses the key (its parameters no longer match): a new attempt, not an error")
  const mAttempt = newCheckoutAttemptId()
  const m1 = await press(order("eve@example.com", { attemptId: mAttempt }))
  const row = j.rows("checkout_attempts").find((r) => r.payment_intent_id === m1.json?.paymentIntentId)
  /* Stripe holds other parameters under this attempt's key (as if an earlier request had reached it with another body): the same press now meets "Keys for idempotent requests can only be used with the same parameters". */
  const heldKeys = [...j.world.idem.entries()].filter(([, made]) => made.id === m1.json?.paymentIntentId).map(([k]) => k)
  for (const k of heldKeys) j.world.idemParams.set(k, JSON.stringify({ amount: 1, currency: "usd" }))
  const refusedBefore = j.world.calls.filter((c) => c.method === "paymentIntents.create").length
  const m2 = await press(order("eve@example.com", { attemptId: mAttempt }))
  check("Stripe was asked under the held key and refused it (then asked again)", heldKeys.length === 1 && j.world.calls.filter((c) => c.method === "paymentIntents.create").length - refusedBefore === 2, { heldKeys, creates: j.world.calls.filter((c) => c.method === "paymentIntents.create").length - refusedBefore })
  check("answered with a payment form", m2.status === 200 && !!m2.json?.clientSecret, { status: m2.status, body: m2.json })
  check("  a new PaymentIntent, made under a new attempt", !!row && !!m2.json?.paymentIntentId && m2.json.paymentIntentId !== m1.json?.paymentIntentId && !j.rows("checkout_attempts").some((r) => r.id === row?.id), { m1: m1.json?.paymentIntentId, m2: m2.json?.paymentIntentId, row: row?.id, rows: j.rows("checkout_attempts").map((r) => [r.id, r.payment_intent_id]) })
  check("  isIdempotencyMismatch reads Stripe's refusal", isIdempotencyMismatch({ type: "StripeIdempotencyError" }) && isIdempotencyMismatch({ rawType: "idempotency_error" }) && !isIdempotencyMismatch({ type: "StripeCardError" }))
  const m3 = await press(order("eve@example.com", { attemptId: mAttempt }))
  check("  and the next press is that new PaymentIntent again", m3.json?.paymentIntentId === m2.json?.paymentIntentId, m3.json)

  section("8. The attempt's PaymentIntent was canceled: a new one")
  const cAttempt = newCheckoutAttemptId()
  const c1 = await press(order("fay@example.com", { attemptId: cAttempt }))
  j.world.intents.get(c1.json?.paymentIntentId)!.status = "canceled"
  const c2 = await press(order("fay@example.com", { attemptId: cAttempt }))
  check("a new PaymentIntent that can be paid", c2.status === 200 && c2.json?.paymentIntentId !== c1.json?.paymentIntentId && j.world.intents.get(c2.json?.paymentIntentId)?.status === "requires_payment_method", c2.json)

  section("9. The app's wallet sheet: the same Checkout Session for the same order")
  const wAttempt = newCheckoutAttemptId()
  const s0 = j.world.sessions.size
  const w1 = await press(order("gus@example.com", { attemptId: wAttempt, walletSheet: true }))
  const w2 = await press(order("gus@example.com", { attemptId: wAttempt, walletSheet: true }))
  check("one Checkout Session, the same id twice", w1.status === 200 && !!w1.json?.sessionId && w1.json.sessionId === w2.json?.sessionId && j.world.sessions.size === s0 + 1, { w1: w1.json, w2: w2.json })

  section("10. Without the table (part 352 not run): answered exactly as before")
  const n1 = j.world.intents.size
  const rowsBefore = j.rows("checkout_attempts").length
  j.db.model.delete("checkout_attempts")
  resetCheckoutAttemptsCache()
  const issues = j.db.schemaIssues.length
  const gAttempt = newCheckoutAttemptId()
  const g1 = await press(order("hal@example.com", { attemptId: gAttempt }))
  const g2 = await press(order("hal@example.com", { attemptId: gAttempt }))
  check("both answered with a payment form", g1.status === 200 && g2.status === 200 && !!g1.json?.clientSecret && !!g2.json?.clientSecret, { g1: g1.json, g2: g2.json })
  check("  a PaymentIntent per request, as before the part", g1.json?.paymentIntentId !== g2.json?.paymentIntentId && j.world.intents.size === n1 + 2)
  const g1pi = j.world.intents.get(g1.json?.paymentIntentId)
  check("  with fresh tokens on each", !!g1pi?.metadata.receipt_token && g1pi.metadata.receipt_token !== j.world.intents.get(g2.json?.paymentIntentId)?.metadata.receipt_token && !!g1pi.metadata.agreed_at)
  check("  the table was asked once, then left alone on this instance", j.db.schemaIssues.length - issues === 1 && j.db.schemaIssues.slice(issues).every((i) => i.table === "checkout_attempts"), j.db.schemaIssues.slice(issues))
  check("  nothing written anywhere for it", j.rows("checkout_attempts").length === rowsBefore)

  section("11. The order hash: the tokens left out, everything charged kept in")
  const base = { amount: 2000, currency: "usd", metadata: { product_id: "p", receipt_token: "a", session_fingerprint: "b", access_token: "c", agreed_at: "d", tip_cents: "0" } }
  const sameOrder = { ...base, metadata: { ...base.metadata, receipt_token: "x", session_fingerprint: "y", access_token: "z", agreed_at: "w" } }
  check("other tokens, the same hash", orderHash("intent", base) === orderHash("intent", sameOrder))
  check("another amount, another hash", orderHash("intent", base) !== orderHash("intent", { ...base, amount: 2500 }))
  check("another currency, another hash", orderHash("intent", base) !== orderHash("intent", { ...base, currency: "eur" }))
  check("another choice, another hash", orderHash("intent", base) !== orderHash("intent", { ...base, metadata: { ...base.metadata, tip_cents: "500" } }))
  check("signed in or not, another hash", orderHash("intent", base) !== orderHash("intent", { ...base, metadata: { ...base.metadata, access_token: "" } }))
  check("card form and wallet sheet apart", orderHash("intent", base) !== orderHash("wallet", base))
  const holder = { current: null as string | null }
  check("the page's id is made once and kept", attemptIdOf(holder) === attemptIdOf(holder) && !!holder.current && attemptIdOf({ current: null }) !== holder.current)

  section("12. Part 352 is for the service role only")
  const sql = readFileSync("supabase/sql/run-now/352_checkout_attempts.sql", "utf8")
  check("row level security on", /ALTER TABLE public\.checkout_attempts ENABLE ROW LEVEL SECURITY/.test(sql))
  check("no policy for anyone", !/CREATE POLICY/i.test(sql))
  check("nothing for anon or authenticated", /REVOKE ALL ON public\.checkout_attempts FROM PUBLIC, anon, authenticated/.test(sql) && !/^GRANT[^;]*(anon|authenticated)/im.test(sql))
  check("only adds (no drop, no alter of another table)", !/\bDROP\b/i.test(sql) && !/ALTER TABLE (?!public\.checkout_attempts)/i.test(sql))

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with a server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

function newProduct(j: Journey, creatorId: string, p: { title: string; priceCents: number }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const [row] = j.db.insert("products", { creator_id: creatorId, type: "digital", title: p.title, slug, description: `<p>${p.title}</p>`, status: "published", archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
