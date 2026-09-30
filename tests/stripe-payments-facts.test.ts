import { paymentUxStateOf, stripeCheckoutReady, stripeStageOf, type StripeCreatorSnapshot } from "@/lib/payments/stripe/facts"

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
}

check("not configured without account", stripeStageOf(empty) === "set_up")
check("checkout closed without account", !stripeCheckoutReady(empty))
check("active when capabilities on", stripeCheckoutReady(active))
check("ux active", paymentUxStateOf(active) === "PAYMENTS_ACTIVE")
check("action when past due", paymentUxStateOf({ ...active, pastDue: ["individual.verification.document"] }) === "ACTION_REQUIRED")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
