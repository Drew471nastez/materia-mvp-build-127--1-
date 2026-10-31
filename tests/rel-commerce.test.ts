/**
 * COMMERCE RELIABILITY: MONEY PATHS UNDER A FAILING STRIPE OR DATABASE
 *
 * Over the journey harness (tests/_journey: the real route handlers, an
 * in-memory PostgREST, a Stripe world). Nothing here reaches Stripe: each
 * failure is the fake's, installed for one call and taken off again.
 *
 *   1  a confirm that failed is not "nothing was charged" (HIGH-1): the
 *      intent is read again, its real status answered, "unknown" when Stripe
 *      still cannot say, and the same intent confirmed again charges once
 */
import "./_journey/env"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import Stripe from "stripe"
import { Journey } from "./_journey/harness"
import { instantOrderBody } from "../lib/onepage/product-block"
import { CHECKING_MESSAGE, rereadIntent, settledFrom } from "../lib/checkout/confirm-outcome"
import { confirmOutcomeUnknown, intentKey, nextPress, paidIntentInError, stripeJsOutcomeUnknown } from "../lib/checkout/pay-retry"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++
  else failed++
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n        ${JSON.stringify(detail)?.slice(0, 700)}`}`)
}
const section = (t: string) => console.log(`\n${t}\n`)
const code = (p: string) =>
  readFileSync(join(process.cwd(), p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
const NOTHING = /nothing was charged/i
/* The payment routes are rate limited per address: each call here comes from its own (documentation range) address. */
let ipSeq = 0
const fromNewAddress = () => ({ "x-forwarded-for": `198.51.100.${++ipSeq}` })

type Obj = Record<string, any>

async function main() {
  const j = await Journey.start()
  const s = j.stripe as any

  section("0. A store with payments on and a download")
  const seller = await j.signUp("maker@example.com", { name: "Mara Maker" })
  await j.call("POST /api/onboarding/finalize", { as: seller, body: { role: "creator", creatorSlug: "mara" } })
  const creator = j.rows("creators")[0]
  await j.call("PUT /api/store/settings", { as: seller, body: { storeName: "Mara Sounds", supportEmail: "hello@mara.example", defaultCountry: "US" } })
  await j.call("POST /api/payments/start", { as: seller, body: { agree: true, kind: "individual", country: "US" } })
  const acct = j.rows("creators")[0].stripe_account_id as string
  j.world.activate(acct)
  await j.webhook("account.updated", j.world.account(acct), { connect: true, account: acct })
  const pack = newProduct(j, creator.id as string, { type: "digital", title: "Tech House Pack", priceCents: 2000 })

  /* ── 1. HIGH-1 ─────────────────────────────────────────────────────── */
  section("1. A confirm that failed is not \"nothing was charged\" (HIGH-1)")
  const realRetrieve = s.paymentIntents.retrieve
  const connErr = () => new Stripe.errors.StripeConnectionError({ message: "An error occurred with our connection to Stripe. Request was retried 2 times.", type: "api_error" } as any)
  const cardErr = () => new Stripe.errors.StripeCardError({ message: "Your card was declined.", type: "card_error", code: "card_declined" } as any)
  const unexpected = (pi: Obj) =>
    Object.assign(new Stripe.errors.StripeInvalidRequestError({ message: "This PaymentIntent's payment_method could not be updated because it has a status of succeeded.", type: "invalid_request_error", code: "payment_intent_unexpected_state" } as any), { payment_intent: pi })
  /* Stripe's own rule: one PaymentIntent is charged once. A confirm of a paid one is refused with "unexpected state". */
  let confirmMode: "ok" | "charge-then-drop" | "drop" | "decline" = "ok"
  let charges = 0
  s.paymentIntents.confirm = async (pid: string) => {
    const pi = j.world.intents.get(pid)!
    if (pi.status === "succeeded") throw unexpected(pi)
    if (confirmMode === "decline") throw cardErr()
    if (confirmMode === "drop") throw connErr()
    j.world.payIntent(pid)
    charges++
    if (confirmMode === "charge-then-drop") throw connErr()
    return { ...pi }
  }
  const start = async (email: string) => {
    const started = await j.call("POST /api/checkout/stripe-session", { body: instantOrderBody({ productId: pack, email, name: "Bea Buyer" }, false) })
    return { id: started.json?.paymentIntentId as string, secret: started.json?.clientSecret as string, status: started.status }
  }
  const confirmPm = (pi: { id: string; secret: string }) => j.call("POST /api/checkout/confirm-with-pm", { headers: fromNewAddress(), body: { paymentIntentId: pi.id, clientSecret: pi.secret, paymentMethodId: "pm_cardvisa" } })

  const a = await start("ann@example.com")
  check("a checkout PaymentIntent to confirm", a.status === 200 && /^pi_/.test(a.id), a)
  confirmMode = "charge-then-drop"
  const r1 = await confirmPm(a)
  check("Stripe charged, then the connection dropped: answered paid (200 succeeded), read again", r1.status === 200 && r1.json?.status === "succeeded", { status: r1.status, body: r1.json })
  check("  and never \"nothing was charged\"", !NOTHING.test(JSON.stringify(r1.json)), r1.json)

  const b = await start("bob@example.com")
  charges = 0
  confirmMode = "charge-then-drop"
  s.paymentIntents.retrieve = async (pid: string, ...rest: unknown[]) => {
    /* The first read (the secret check) answers; the second look after the failed confirm does not. */
    if (j.world.intents.get(pid)?.status === "succeeded") throw connErr()
    return realRetrieve(pid, ...rest)
  }
  const r2 = await confirmPm(b)
  s.paymentIntents.retrieve = realRetrieve
  check("Stripe charged and could not be asked again: 503 { status: \"unknown\" }", r2.status === 503 && r2.json?.status === "unknown", { status: r2.status, body: r2.json })
  check("  with the checking words, never \"nothing was charged\"", r2.json?.error === CHECKING_MESSAGE && !NOTHING.test(JSON.stringify(r2.json)), r2.json)
  confirmMode = "ok"
  const r2b = await confirmPm(b)
  check("Pay again with the SAME intent (what the page now does): answered paid", r2b.status === 200 && r2b.json?.status === "succeeded", { status: r2b.status, body: r2b.json })
  check("  and the buyer was charged once, not twice", charges === 1, { charges })

  const c = await start("cal@example.com")
  confirmMode = "drop"
  const r3 = await confirmPm(c)
  check("a dropped confirm over an intent still requiring a payment method: unknown, not \"nothing was charged\" (a confirm may still be running)", r3.status === 503 && r3.json?.status === "unknown" && !NOTHING.test(JSON.stringify(r3.json)), { status: r3.status, body: r3.json })

  const d = await start("dee@example.com")
  confirmMode = "decline"
  const r4 = await confirmPm(d)
  check("a declined card keeps the bank's words (400)", r4.status === 400 && r4.json?.error === "Your card was declined.", { status: r4.status, body: r4.json })
  confirmMode = "ok"

  const e1 = await start("eve@example.com")
  const piE = j.world.intents.get(e1.id)!
  s.paymentIntents.confirm = async () => {
    Object.assign(piE, { status: "requires_action", next_action: { type: "redirect_to_url", redirect_to_url: { url: "https://hooks.stripe.com/3ds/x" } } })
    throw new Stripe.errors.StripeAPIError({ message: "Something went wrong on Stripe's end." } as any)
  }
  const r5 = await confirmPm(e1)
  check("a 5xx over an intent that now needs the bank's page: the page is sent there", r5.status === 200 && r5.json?.status === "requires_action" && r5.json?.actionUrl === "https://hooks.stripe.com/3ds/x", { status: r5.status, body: r5.json })

  section("1b. A membership's confirm in the app (HIGH-1)")
  const memberSecret = "pi_member1_secret_abc"
  const memberPi: Obj = { id: "pi_member1", object: "payment_intent", status: "requires_payment_method", client_secret: memberSecret }
  const memberSub = (): Obj => ({ id: "sub_member1", object: "subscription", status: "incomplete", customer: "cus_m", metadata: { kind: "membership" }, pending_setup_intent: null, latest_invoice: { id: "in_m", status: "open", confirmation_secret: { client_secret: memberSecret } } })
  const realSubRetrieve = s.subscriptions.retrieve
  s.subscriptions.retrieve = async () => memberSub()
  s.paymentIntents.retrieve = async (pid: string, ...rest: unknown[]) => (pid === "pi_member1" ? { ...memberPi } : realRetrieve(pid, ...rest))
  s.paymentIntents.confirm = async () => {
    throw connErr()
  }
  const m1 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership confirm dropped, intent not settled: 503 unknown, never \"nothing was charged\"", m1.status === 503 && m1.json?.status === "unknown" && !NOTHING.test(JSON.stringify(m1.json)), { status: m1.status, body: m1.json })
  s.paymentIntents.confirm = async () => {
    throw cardErr()
  }
  const m2 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership card declined: 402 with the bank's words", m2.status === 402 && m2.json?.error === "Your card was declined.", { status: m2.status, body: m2.json })
  s.paymentIntents.confirm = async () => {
    Object.assign(memberPi, { status: "requires_action", next_action: { redirect_to_url: { url: "https://hooks.stripe.com/3ds/m" } } })
    throw connErr()
  }
  const m3 = await j.call("POST /api/memberships/confirm", { headers: fromNewAddress(), body: { subscriptionId: "sub_member1", clientSecret: memberSecret, paymentMethodId: "pm_cardvisa" } })
  check("membership confirm dropped over an intent needing the bank: its page", m3.status === 200 && m3.json?.status === "requires_action" && m3.json?.actionUrl === "https://hooks.stripe.com/3ds/m", { status: m3.status, body: m3.json })
  s.subscriptions.retrieve = realSubRetrieve
  s.paymentIntents.retrieve = realRetrieve
  delete s.paymentIntents.confirm
  /* The two 503s above were the point of the test, not faults. */
  j.serverErrors.splice(0, j.serverErrors.length, ...j.serverErrors.filter((x) => !/confirm-with-pm|memberships\/confirm/.test(x.route)))

  section("1c. The pages keep the intent while the answer is not sure (HIGH-1)")
  check("no answer, a 5xx, or \"unknown\" is not a sure answer", confirmOutcomeUnknown(null) && confirmOutcomeUnknown({ ok: false, status: 503, data: {} }) && confirmOutcomeUnknown({ ok: true, status: 200, data: { status: "unknown" } }))
  check("  a decline (4xx) and a success are", !confirmOutcomeUnknown({ ok: false, status: 400, data: { error: "Your card was declined." } }) && !confirmOutcomeUnknown({ ok: true, status: 200, data: { status: "succeeded" } }))
  const k1 = intentKey({ productId: "p", total: 2000, variantId: null })
  check("the same order reuses the held intent, another order checks it first, none held makes one", nextPress({ intent: 1, key: k1 }, k1) === "reuse" && nextPress({ intent: 1, key: k1 }, intentKey({ productId: "p", total: 2500, variantId: null })) === "check" && nextPress(null, k1) === "create")
  check("Stripe.js: connection and Stripe errors are not sure, a card error is", stripeJsOutcomeUnknown({ type: "api_connection_error" }) && stripeJsOutcomeUnknown({ type: "api_error" }) && stripeJsOutcomeUnknown({ type: "invalid_request_error", code: "payment_intent_unexpected_state" }) && !stripeJsOutcomeUnknown({ type: "card_error" }) && !stripeJsOutcomeUnknown({ type: "validation_error" }))
  check("  \"unexpected state\" over a succeeded intent reads as paid", paidIntentInError({ payment_intent: { id: "pi_1", status: "succeeded" } })?.id === "pi_1" && paidIntentInError({ payment_intent: { id: "pi_1", status: "requires_payment_method" } }) === null)
  check("the second look is bounded: a read that never answers is null", (await rereadIntent(() => new Promise(() => {}), 30)) === null)
  check("  only paid, the bank's page and cancelled are sure; anything else is unknown", settledFrom({ status: "requires_payment_method" }).kind === "unknown" && settledFrom({ status: "processing" }).kind === "paid" && settledFrom({ status: "canceled" }).kind === "canceled" && settledFrom(null).kind === "unknown")
  const client = code("app/checkout/checkout-client.tsx")
  const native = client.slice(client.indexOf("const payNative"), client.indexOf("const takeFree"))
  check("the app's Pay confirms a held intent again rather than making a new one", /nextPress\(heldIntent\.current/.test(native) && /press === "reuse" && heldIntent\.current \? heldIntent\.current\.intent : await createIntent\(\)/.test(native), native.slice(0, 300))
  check("  and a 5xx or \"unknown\" keeps the intent (not only a thrown request)", /confirmOutcomeUnknown\(confirmed\)/.test(native) && /heldIntent\.current = \{ intent, key \}/.test(native))
  const pay = code("app/checkout/parts/stripe-pay.tsx")
  check("the web card form and wallets confirm a held intent again", (pay.match(/await intentFor\(/g) ?? []).length === 2 && /settle\(intent, /.test(pay) && /stripeJsOutcomeUnknown\(error\)\) return checkoutMsg\(CHECKING_MESSAGE\)/.test(pay))
  const member = code("app/checkout/membership-checkout.tsx")
  check("the membership's Join in the app confirms a held subscription again", /held && held\.key === key/.test(member) && /unknown\?: boolean \}\)\.unknown\) heldJoin\.current = null/.test(member))
  for (const route of ["app/api/checkout/confirm-with-pm/route.ts", "app/api/memberships/confirm/route.ts"]) {
    const src = code(route)
    const katch = src.slice(src.lastIndexOf("} catch (err) {"))
    check(`${route}: the confirm's catch says "nothing was charged" only for a cancelled intent`, !/Nothing was charged\."/.test(katch.replace(/This payment was cancelled\. Nothing was charged\.[^"]*"/g, "")), katch.slice(0, 400))
  }

  console.log(`\n  server errors: ${JSON.stringify(j.serverErrors).slice(0, 600)}`)
  check("no route answered with an unexpected server error", j.serverErrors.length === 0, j.serverErrors)
  console.log(`\n${passed} passed, ${failed} failed\n`)
  process.exit(failed ? 1 : 0)
}

function newProduct(j: Journey, creatorId: string, p: { type: string; title: string; priceCents: number; status?: string }): string {
  const slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
  const status = p.status ?? "published"
  const [row] = j.db.insert("products", { creator_id: creatorId, type: p.type, title: p.title, slug, description: `<p>${p.title}</p>`, status, archived: false, price_cents: p.priceCents, thumbnail_url: "https://cdn.example.com/p.jpg", pay_what_you_want: false }, {})
  return row.id as string
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
