/**
 * THE MOVE TO THE NEW STRIPE CONNECT PLATFORM, HELD IN PLACE.
 *
 * Each signing secret is good only for its own kind of event, checked with
 * real signatures from Stripe's own test helper. Both webhook routes skip an
 * event they have already handled. A creator's status comes from what Stripe
 * says (requirements, capabilities, the bank), never from an id existing. An
 * account the new platform cannot reach is let go so the creator can
 * reconnect, while a network blip changes nothing. Disconnect never deletes
 * an account with history, never runs on an active one without a
 * confirmation, and never runs while money is in it. Nothing sends an
 * account id, a secret key or Stripe's raw words to a browser.
 *
 * connect.ts is server only, so its rules are read from the source here;
 * the status mapper and the secret check are pure and run for real.
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import Stripe from "stripe"
import { verifyStripeEvent } from "@/lib/stripe/webhook-secrets"
import { getStorelibPaymentsStatus, statusFactsOf } from "@/lib/payments/stripe/status"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `  (${JSON.stringify(detail)})`}`)
  }
}
/* The push harness runs the compiled suite as an ES module, where __dirname does not exist; the repo root is the working directory. */
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

/* ── O, P: each secret signs only its own kind ─────────────────────────── */
console.log("\nWebhook secrets")
{
  const stripe = new Stripe("sk_test_dummy")
  /* Made up here, for the test: never a real secret. */
  const platform = "whsec_dummy_platform"
  const connect = "whsec_dummy_connect"
  const construct = (b: string, s: string, k: string) => stripe.webhooks.constructEvent(b, s, k)
  const sign = (payload: string, secret: string) => stripe.webhooks.generateTestHeaderString({ payload, secret })
  const platformEvent = JSON.stringify({ id: "evt_platform", object: "event", type: "payment_intent.succeeded", data: { object: {} } })
  const connectEvent = JSON.stringify({ id: "evt_connect", object: "event", type: "account.updated", account: "acct_test", data: { object: {} } })
  const both = { platform, connect }
  const why = (r: ReturnType<typeof verifyStripeEvent>) => ("reason" in r ? r.reason : null)

  const a = verifyStripeEvent(platformEvent, sign(platformEvent, platform), both, construct)
  check("a platform event signed with the platform secret is taken", "signedBy" in a && a.signedBy === "platform")
  const b = verifyStripeEvent(connectEvent, sign(connectEvent, connect), both, construct)
  check("a connected account event signed with the Connect secret is taken", "signedBy" in b && b.signedBy === "connect")
  const c = verifyStripeEvent(connectEvent, sign(connectEvent, platform), both, construct)
  check("a connected account event signed with the platform secret is refused", why(c) === "wrong_destination")
  const d = verifyStripeEvent(platformEvent, sign(platformEvent, connect), both, construct)
  check("a platform event signed with the Connect secret is refused", why(d) === "wrong_destination")
  const tampered = platformEvent.replace("payment_intent.succeeded", "charge.refunded")
  const e = verifyStripeEvent(tampered, sign(platformEvent, platform), both, construct)
  check("a body changed after signing is refused", why(e) === "invalid_signature")
  const f = verifyStripeEvent(platformEvent, "", both, construct)
  check("an unsigned event is refused", why(f) === "invalid_signature")
  const g = verifyStripeEvent(platformEvent, sign(platformEvent, "whsec_someone_else"), both, construct)
  check("a signature from any other secret is refused", why(g) === "invalid_signature")
  const h = verifyStripeEvent(platformEvent, sign(platformEvent, platform), { platform: " ", connect: null }, construct)
  check("no secret configured is its own answer, not a pass", why(h) === "no_secret")
  const i = verifyStripeEvent(connectEvent, sign(connectEvent, connect), { connect }, construct)
  check("the Connect route alone takes Connect events", "signedBy" in i && i.signedBy === "connect")
  const j = verifyStripeEvent(platformEvent, sign(platformEvent, connect), { connect }, construct)
  check("the Connect route refuses a platform event", !j.ok)

  const main = read("app/api/stripe/webhook/route.ts")
  const conn = read("app/api/stripe/webhook/connect/route.ts")
  check("both routes verify through the one check", /verifyStripeEvent\(/.test(main) && /verifyStripeEvent\(/.test(conn))
  check("the main route no longer tries both secrets in a loop", !/for \(const (secret|s) of/.test(main))
  check("the secrets are read on the server from the environment", /process\.env\.STRIPE_WEBHOOK_SECRET/.test(main) && /process\.env\.STRIPE_CONNECT_WEBHOOK_SECRET/.test(main + conn))

  /* Q: one event, one effect */
  check("the main route skips an event it has already handled, before acting", main.indexOf("stripeEventHandled(") > 0 && main.indexOf("stripeEventHandled(") < main.indexOf("await handleStripeEvent("))
  check("the Connect route skips an event it has already handled", /if \(await stripeEventHandled\(supabaseAdmin, event\.id\)\)/.test(conn))
  const accountEvents = read("lib/stripe/connect-webhook.ts")
  check("account.updated and payouts are handled", /event\.type === "account\.updated"/.test(accountEvents) && /handleConnectAccountEvent\(event\)/.test(conn) && /"payout\.paid"/.test(main) && /"payout\.failed"/.test(main) && /isConnectPayoutEvent/.test(conn))
}

/* ── Status from Stripe's facts, in Storelib's words ───────────────────── */
console.log("\nStatus")
{
  const acct = (over: Record<string, unknown> = {}) => ({
    charges_enabled: true, payouts_enabled: true, details_submitted: true,
    requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: null, current_deadline: null },
    future_requirements: { currently_due: [], past_due: [] },
    capabilities: { card_payments: "active", transfers: "active" },
    ...over,
  })
  const bank = [{ status: "verified" }]
  const s = (a: ReturnType<typeof acct> | null, b = bank, extra = {}) => getStorelibPaymentsStatus(statusFactsOf(a, b, extra))

  check("no account: Set up payments", s(null).status === "NOT_STARTED" && s(null).title === "Set up payments")
  check("a connection let go: Reconnect payments, and the history is safe", s(null, [], { reconnect: true }).title === "Reconnect payments" && /history are safe/.test(s(null, [], { reconnect: true }).line))
  check("charges and payouts on, a bank, nothing due: Payments active", s(acct()).status === "ACTIVE")
  check("an account id alone is never active", s(acct({ charges_enabled: false, payouts_enabled: false, details_submitted: false, capabilities: {} }), []).status !== "ACTIVE")
  check("charges on but payouts off is not active", s(acct({ payouts_enabled: false })).status !== "ACTIVE")
  check("no bank: Add your bank account", s(acct({ payouts_enabled: false }), []).status === "BANK_REQUIRED")
  check("Stripe still checking: Under review", s(acct({ charges_enabled: false, payouts_enabled: false, requirements: { currently_due: [], past_due: [], pending_verification: ["individual.verification.document"], disabled_reason: "requirements.pending_verification", current_deadline: null } })).status === "VERIFYING")
  check("identity still due: Verify your identity", s(acct({ charges_enabled: false, payouts_enabled: false, requirements: { currently_due: ["individual.verification.document"], past_due: [], pending_verification: [], disabled_reason: null, current_deadline: null } })).title === "Verify your identity")
  check("a failed payout: Payout failed", s(acct(), bank, { lastPayoutFailed: true }).status === "PAYOUT_FAILED")
  check("rejected by Stripe: turned off, with support", s(acct({ requirements: { currently_due: [], past_due: [], pending_verification: [], disabled_reason: "rejected.fraud", current_deadline: null } })).status === "SUSPENDED")
  const all = [s(null), s(acct()), s(acct({ payouts_enabled: false }), []), s(acct(), bank, { lastPayoutFailed: true })]
  check("no status line names an account, a requirement key or Stripe's codes", all.every((v) => !/acct_|req_|individual\.|requirements\.|_due/.test(`${v.title} ${v.line} ${v.actionLabel ?? ""}`)))
}

/* ── Old accounts, disconnect, and checkout ───────────────────────────── */
console.log("\nOld accounts and disconnect")
{
  const c = read("lib/payments/stripe/connect.ts")
  const gone = /export function accountIsGone[\s\S]*?\n\}/.exec(c)?.[0] ?? ""
  check("gone means Stripe refused the account (permission, missing, invalid), never a blip", /StripePermissionError/.test(gone) && /resource_missing/.test(gone) && /account_invalid/.test(gone) && !/StripeConnectionError|StripeAPIError|RateLimit|5\d\d/.test(gone))
  check("letting go clears the live link only for the account it saw (race safe)", /\.eq\("stripe_account_id", previousAccountId\)/.test(c))
  const release = /export async function releaseConnectedAccount[\s\S]*?\n\}/.exec(c)?.[0] ?? ""
  check("letting go keeps when payments were first connected", !/stripe_connected_at/.test(release.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")))
  check("letting go records the old account and why", /noteAccountReset\(/.test(release) || /stripe_previous_account_id/.test(c))
  const disc = /export async function disconnectStripeAccount[\s\S]*?\n\}/.exec(c)?.[0] ?? ""
  check("disconnect asks to confirm when the account was ever started", /Confirm to disconnect/.test(disc) && /options\.confirmed/.test(disc))
  check("disconnect refuses while money is in the account", /balance/.test(disc) && /Cash out your balance first/.test(disc))
  check("only an account that never started is deleted at Stripe", (disc.match(/accounts\.del\(/g) ?? []).length === 1)
  check("disconnect never touches orders, payouts or the ledger", !/from\("(orders|payouts|seller_ledger|ledger_events)"\)/.test(disc + release))
  check("the account to act on is the signed in creator's own row, never one the browser names", !/body\.(account|accountId|stripe_account_id)/.test(read("app/api/stripe/connect/disconnect/route.ts") + read("app/api/stripe/connect/status/route.ts") + read("app/api/payments/[action]/route.ts")))
  const statusBodies = [...read("app/api/stripe/connect/status/route.ts").matchAll(/NextResponse\.json\(\{([\s\S]*?)\}\)/g)].map((m) => m[1])
  check("the status route never sends the account id", statusBodies.length >= 2 && statusBodies.every((b) => !/^\s*(stripe_account_id|accountId|account)\s*[:,]/m.test(b) && !/: row\?\.stripe_account_id\s*[,}]/.test(b)))
  check("the status route wipes nothing on a blip", /stale: true/.test(read("app/api/stripe/connect/status/route.ts")) && !/update\(/.test(read("app/api/stripe/connect/status/route.ts")))

  const single = read("app/api/checkout/stripe-session/route.ts")
  const cart = read("app/api/checkout/cart/route.ts")
  check("checkout for one product waits for a ready account", /checkoutReadyForCreator\(creator\.id\)/.test(single))
  check("the cart waits for charges and payouts both said yes, not just not no", /charges_enabled !== true/.test(cart) && /payouts_enabled !== true/.test(cart))
  check("an account Stripe refuses at checkout is let go, with nothing charged", /releaseConnectedAccount\(/.test(single) && /releaseConnectedAccount\(/.test(cart) && /Nothing was charged/.test(single) && /Nothing was charged/.test(cart))
  check("the old withdraw route, a second way to pay out, is gone", !existsSync(join(root, "app/api/stripe/withdraw/route.ts")))
}

console.log("\nSecrets stay on the server")
{
  const client = ["components/app/settings/storelib-payments-settings.tsx", "components/app/settings/payments-setup-flow.tsx", "components/app/settings/stripe-connect-embedded.tsx"]
  for (const f of client) check(`${f} never reads a secret`, !/STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|STRIPE_CONNECT_WEBHOOK_SECRET/.test(read(f)))
  check("the embedded components load with a publishable key only, from the server", /publishableKey\.startsWith\("pk_"\)/.test(read("components/app/settings/stripe-connect-embedded.tsx")) && /process\.env\.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY/.test(read("lib/payments/stripe/connect.ts")))
  check("identity and documents are Stripe's own embedded form, not ours", /ConnectAccountOnboarding|account_onboarding|loadConnectAndInitialize/.test(read("components/app/settings/stripe-connect-embedded.tsx")))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
