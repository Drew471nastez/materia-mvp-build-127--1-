/**
 * ONE RULE FOR "MAY CHECKOUT TAKE MONEY FOR THIS SELLER"
 *
 * lib/payments/stripe/readiness.ts is the only answer, and these pin the two
 * things it is easy to get wrong:
 *
 *   THE CHARGE MODEL. A Storelib sale is a destination charge, so the
 *   seller's account has to be able to RECEIVE a transfer. A seller in
 *   another country than the platform gets a transfers-only account whose
 *   charges_enabled Stripe reports false for good: every gate written
 *   against charges_enabled blocked them forever.
 *
 *   PROGRESSIVE VERIFICATION. What Home says, and so what the seller is
 *   asked for, comes from what Stripe wants NOW. eventually_due never
 *   reaches the seller.
 */
import { readFileSync } from "node:fs"
import {
  BUYER_UNAVAILABLE,
  accountTurnedOff,
  canAcceptPayments,
  homePaymentsState,
  rowCanAcceptPayments,
  sellerFactsOfAccount,
  type SellerAccountFacts,
} from "@/lib/payments/stripe/readiness"

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    console.log(`  FAIL  ${name}${detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`)
  }
}

const ready: SellerAccountFacts = {
  accountId: "acct_1",
  detailsSubmitted: true,
  chargesEnabled: true,
  payoutsEnabled: true,
  transfersStatus: "active",
  pastDue: [],
  disabledReason: null,
}
const f = (over: Partial<SellerAccountFacts> = {}): SellerAccountFacts => ({ ...ready, ...over })

console.log("\nStorelib's charge model: the seller's account must be able to receive the transfer")
check("everything on: sells", canAcceptPayments(f()))
check("a recipient account (transfers active, charges off for good): sells", canAcceptPayments(f({ chargesEnabled: false })))
check("transfers pending: does not sell yet", !canAcceptPayments(f({ transfersStatus: "pending" })))
check("transfers inactive, charges on: does not sell", !canAcceptPayments(f({ transfersStatus: "inactive" })))
check("no capabilities reported: charges_enabled stands in, as it always did", canAcceptPayments(f({ transfersStatus: null })) && !canAcceptPayments(f({ transfersStatus: null, chargesEnabled: false })))
check("payouts off: does not sell, whatever Stripe lets it charge", !canAcceptPayments(f({ payoutsEnabled: false })))
check("details not submitted: does not sell", !canAcceptPayments(f({ detailsSubmitted: false })))
check("something past due: does not sell", !canAcceptPayments(f({ pastDue: ["individual.verification.document"] })))
check("no account at all: does not sell", !canAcceptPayments(f({ accountId: null })) && !canAcceptPayments(f({ accountId: "cus_1" })))

console.log("\nStripe turned the account off")
check("rejected is off", accountTurnedOff("rejected.fraud") && !canAcceptPayments(f({ disabledReason: "rejected.fraud" })))
check("the platform paused is off", accountTurnedOff("platform_paused"))
check("something merely due is not off", !accountTurnedOff("requirements.currently_due") && !accountTurnedOff(null))
check("  and a seller with something due still sells while Stripe lets them", canAcceptPayments(f({ disabledReason: "requirements.currently_due" })))

console.log("\nThe same facts, read off a Stripe account object")
check(
  "the transfers capability is taken from capabilities, not guessed",
  sellerFactsOfAccount({ id: "acct_1", charges_enabled: false, payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active" } }).transfersStatus === "active",
)
check("no capabilities: null, so charges_enabled decides", sellerFactsOfAccount({ id: "acct_1" }).transfersStatus === null)
check(
  "a live recipient account reads as ready",
  canAcceptPayments(sellerFactsOfAccount({ id: "acct_1", charges_enabled: false, payouts_enabled: true, details_submitted: true, capabilities: { transfers: "active" }, requirements: { past_due: [], disabled_reason: null } })),
)

console.log("\nCheckout's gate from the creators row (no Stripe call on a buyer's Pay)")
const row = (over: Record<string, unknown> = {}) => ({ stripe_account_id: "acct_1", stripe_onboarding_status: "connected", charges_enabled: true, payouts_enabled: true, details_submitted: true, ...over })
check("the sync's own answer wins when it is there", rowCanAcceptPayments(row({ can_accept_payments: true, charges_enabled: false })) && !rowCanAcceptPayments(row({ can_accept_payments: false })))
check("no account id: never", !rowCanAcceptPayments(row({ stripe_account_id: null })) && !rowCanAcceptPayments(null))
check("payouts switched off: never, whatever else says", !rowCanAcceptPayments(row({ payouts_enabled: false })))
/* "connected" is written from the rule above, so it already means transfers-aware yes. */
check("connected with charges off (a recipient account): sells", rowCanAcceptPayments(row({ charges_enabled: false })))
check("not connected and charges off: does not sell", !rowCanAcceptPayments(row({ stripe_onboarding_status: "pending", charges_enabled: false })))
check("a row from before the column existed still reads", rowCanAcceptPayments(row({ can_accept_payments: undefined })))
check("the account id not selected is not the same as no account", rowCanAcceptPayments({ stripe_onboarding_status: "connected", charges_enabled: true, payouts_enabled: true }))

console.log("\nWhat Home says, from the row alone")
const home = (over: Record<string, unknown> = {}) => homePaymentsState({ stripe_account_id: "acct_1", stripe_onboarding_status: "pending", charges_enabled: false, payouts_enabled: false, details_submitted: true, stripe_requirements: [], ...over })
check("nothing yet", homePaymentsState({ stripe_account_id: null }) === "not_started" && homePaymentsState(null) === "not_started")
check("ready", home({ can_accept_payments: true }) === "ready")
check("an account, setup unfinished", home({ details_submitted: false }) === "setup")
check("Stripe wants to SEE an ID", home({ stripe_requirements: ["individual.verification.document"] }) === "identity")
check("Stripe wants a detail typed in", home({ stripe_requirements: ["individual.address.line1"] }) === "info")
check("  an ID number is a detail, not a document", home({ stripe_requirements: ["individual.id_number"] }) === "info")
check("only the bank left", home({ stripe_requirements: ["external_account"] }) === "setup")
check("nothing left to ask, not ready yet: Stripe is checking", home() === "review")
check("was selling, and now something is due: paused", home({ stripe_connected_at: "2026-01-01T00:00:00.000Z", stripe_requirements: ["individual.verification.document"] }) === "paused")
check("was selling, nothing due, payouts off: paused", home({ stripe_connected_at: "2026-01-01T00:00:00.000Z", payouts_enabled: false }) === "paused")
check("was selling, nothing due, nothing off: Stripe is checking", home({ stripe_connected_at: "2026-01-01T00:00:00.000Z", payouts_enabled: true }) === "review")

console.log("\nProgressive: nothing a seller is asked for comes from eventually_due, except the ID check, which is the last step of setup")
const ownForm = readFileSync("lib/payments/stripe/own-form.ts", "utf8")
const identity = readFileSync("lib/payments/stripe/identity.ts", "utf8")
const rules = readFileSync("lib/payments/stripe/own-form-rules.ts", "utf8")
/* The owner, October 2026: details sent, "checking", then straight back to the form for the ID was a bounce. The ID check is asked once, at the end, whatever list Stripe keeps it on. */
check("the form reads one thing from eventually_due: the document, as the ID step", /eventually\.includes\("individual\.verification\.document"\)/.test(ownForm) && !/eventually\.(some|filter|map)\(/.test(ownForm))
check("  needsOf's \"now\" is past_due and currently_due only", /scope === "all" \? \(req\?\.eventually_due \?\? \[\]\) : \[\]/.test(rules))
check("Stripe's ID check may start as soon as Stripe lists the document, so the last step of setup is never refused", /eventually_due/.test(identity.split("function documentDue")[1]?.split("\n}")[0] ?? ""))

console.log("\nThe buyer is never told about the seller's verification")
check("the refusal says nothing about Stripe, KYC or verification", !/stripe|kyc|verif|ident|requirement/i.test(BUYER_UNAVAILABLE))
for (const file of ["app/api/checkout/cart/route.ts", "app/api/checkout/stripe-session/route.ts", "app/api/memberships/checkout/route.ts", "lib/physical/checkout-server.ts"]) {
  const text = readFileSync(file, "utf8")
  check(`${file.split("/").slice(-2).join("/")} refuses with the one neutral message`, /BUYER_UNAVAILABLE/.test(text) && !/cannot take payments yet|failed Stripe|not verified/i.test(text))
}

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
