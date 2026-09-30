/**
 * Storelib Payments on Stripe Connect: the facts the card and checkout read,
 * and the live wiring around them (webhook secrets, the CSP Stripe's embedded
 * forms need, the amounts Stripe returns, the Payouts page).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { paymentUxStateOf, stripeCheckoutReady, stripeRowReady, stripeStageOf, type StripeCreatorSnapshot } from "@/lib/payments/stripe/facts"

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}`)
  }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")
/* Code only: comments may name what the code no longer does. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

const empty: StripeCreatorSnapshot = {
  accountId: null,
  chargesEnabled: false,
  payoutsEnabled: false,
  detailsSubmitted: false,
  disabledReason: null,
  currentlyDue: [],
  pastDue: [],
  pendingVerification: [],
  hasExternalAccount: false,
  accountKind: null,
}

const active: StripeCreatorSnapshot = {
  ...empty,
  accountId: "acct_test",
  chargesEnabled: true,
  payoutsEnabled: true,
  detailsSubmitted: true,
  hasExternalAccount: true,
}

console.log("\nStages")
check("not configured without account", stripeStageOf(empty) === "set_up")
check("checkout closed without account", !stripeCheckoutReady(empty))
check("active when capabilities on", stripeCheckoutReady(active) && stripeStageOf(active) === "active")
check("ux active", paymentUxStateOf(active) === "PAYMENTS_ACTIVE")
check("action when past due", paymentUxStateOf({ ...active, pastDue: ["individual.verification.document"] }) === "ACTION_REQUIRED")
check("an account whose form is unfinished is 'verify', not in review", stripeStageOf({ ...empty, accountId: "acct_x" }) === "verify")
check("details sent, Stripe checking: review", stripeStageOf({ ...empty, accountId: "acct_x", detailsSubmitted: true, pendingVerification: ["individual.id_number"] }) === "review")
check("a disabled account is paused", stripeStageOf({ ...active, disabledReason: "rejected.fraud" }) === "paused")

console.log("\nCheckout's gate is never stricter than the one live sellers passed before")
check("connected, flags on, details never written: still sells", stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, payouts_enabled: true, details_submitted: false }))
check("connected with the flags never written: still sells", stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: null, payouts_enabled: null }))
check("charges switched off: does not sell", !stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: false, payouts_enabled: true }))
check("payouts switched off: does not sell", !stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, payouts_enabled: false }))
check("synced all on, status word stale: sells", stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "pending", charges_enabled: true, payouts_enabled: true, details_submitted: true }))
check("pending and not all on: does not sell", !stripeRowReady({ stripe_account_id: "acct_1", stripe_onboarding_status: "pending", charges_enabled: true, payouts_enabled: true, details_submitted: false }))
check("no account: does not sell", !stripeRowReady({ stripe_account_id: null, stripe_onboarding_status: "connected", charges_enabled: true, payouts_enabled: true }))
check("checkout and Payouts read the same gate", /return stripeRowReady\(row\)/.test(code("lib/payments/service.ts")) && /checkoutReadyForCreator\(creator\.id\)/.test(code("app/api/checkout/stripe-session/route.ts")))

console.log("\nWebhooks: both secrets")
const hook = code("app/api/stripe/webhook/route.ts")
check("the main endpoint checks the platform and the Connect secret, always", /const secretsToTry = \[mainSecret, connectSecret\]\.filter\(Boolean\)/.test(hook))
check("the main endpoint no longer ignores connected-account events", !/ignored: true/.test(hook.slice(hook.indexOf("async function handleStripeEvent"))))
check("account events are re-read from Stripe on either endpoint", /handleConnectAccountEvent\(event\)/.test(hook) && /handleConnectAccountEvent\(event\)/.test(code("app/api/stripe/webhook/connect/route.ts")))
check("the Connect endpoint verifies with its own secret", /constructEvent\(body, sig, secret\)/.test(code("app/api/stripe/webhook/connect/route.ts")) && /STRIPE_CONNECT_WEBHOOK_SECRET/.test(code("app/api/stripe/webhook/connect/route.ts")))
check("both endpoints share one record of handled events", /stripeEventHandled/.test(hook) && /stripeEventHandled/.test(code("app/api/stripe/webhook/connect/route.ts")))

console.log("\nStripe's amounts and accounts")
const connect = code("lib/payments/stripe/connect.ts")
check("balances and payouts are kept in Stripe's cents, not multiplied again", !/toMinor\(/.test(connect) && /availableMinor \+= b\.amount/.test(connect) && /amountMinor: p\.amount/.test(connect))
check("a network error never replaces a creator's account with a new one", /if \(!accountIsGone\(error\)\)/.test(connect) && /resource_missing/.test(connect))
check("the account is read once per sync", /enforceManualPayouts\(accountId, account\)/.test(connect))

console.log("\nStripe's embedded forms can load")
for (const [file, text] of [["lib/security/csp.ts", read("lib/security/csp.ts")], ["vercel.json", read("vercel.json")]] as const) {
  const flat = text.replace(/\s+/g, " ")
  const directive = (name: string) => flat.slice(flat.indexOf(name), flat.indexOf(name) + 900)
  check(`${file}: connect-js.stripe.com in script-src`, /connect-js\.stripe\.com/.test(file === "vercel.json" ? flat.match(/script-src[^;]*/)?.[0] ?? "" : directive('"script-src"').split("]]")[0]))
  check(`${file}: connect-js.stripe.com in frame-src`, /connect-js\.stripe\.com/.test(file === "vercel.json" ? flat.match(/frame-src[^;]*/)?.[0] ?? "" : directive('"frame-src"').split("]]")[0]))
}
const embedded = code("components/app/settings/stripe-connect-embedded.tsx")
check("overlays, if set, is a value Stripe takes", !/overlays:/.test(embedded) || /overlays: "(dialog|drawer)"/.test(embedded))

console.log("\nPayouts keeps Cash out")
const payouts = code("app/app/payouts/payouts-client.tsx")
check("no simple view in place of the dashboard", !/PayoutsSimpleView|NEXT_PUBLIC_PAYOUTS_LEGACY/.test(payouts))
check("until setup is finished, the page is setup alone: no Export, stats or sales", /if \(!paymentsReady\) \{\s*return \(\s*<div aria-label="Set up payouts"/.test(payouts) && !/const hasMoney =/.test(payouts))
check("after setup the dashboard, with the setup panel only when the bank or details are being changed", /\{manageRequest > 0 \? <StorelibPaymentsInline panelOnly manageRequest=\{manageRequest\} \/> : null\}/.test(payouts))
check("while the account is not ready, the card carries setup and the setup notices stand down", /if \(paymentsReady\) \{\s*if \(accountStatus && !accountStatus\.details_submitted\)/.test(payouts))
check("bank changes open in the card on the page, not a Stripe tab", !/account-link/.test(payouts) && /<PayoutMethodCard onManage=\{\(\) => setManageRequest\(\(n\) => n \+ 1\)\} \/>/.test(payouts))
const card = code("components/app/settings/storelib-payments-settings.tsx")
check("the card redraws the page when the account turns ready", /if \(wasOpen\.current === false && data\.checkoutOpen\) router\.refresh\(\)/.test(card))
check("once active, the bank and details can be changed from the card", /openPanel\("bank"\)/.test(card) && /openPanel\("details"\)/.test(card))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
