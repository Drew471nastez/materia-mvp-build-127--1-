import { readFileSync } from "node:fs"
import { paymentsSetupErrorMessage } from "@/lib/payments/stripe/setup-errors"
import {
  bankCollection,
  beatFromRequirements,
  creatorStatusLabel,
  parsePersonal,
  personalFields,
  personalIssues,
  type OnboardingBeat,
} from "@/lib/payments/stripe/onboarding-steps"

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

const open = {
  hasAccount: true,
  detailsSubmitted: false,
  hasBank: false,
  currentlyDue: [] as string[],
  pastDue: [] as string[],
  pendingVerification: [] as string[],
  chargesEnabled: false,
  payoutsEnabled: false,
}

check("an individual is not asked for a company", personalFields("individual").join(",") === "firstName,lastName")
check("a business is asked for the business name", personalFields("business").join(",") === "businessName,firstName,lastName")

for (const country of ["RO", "US", "GB", "DE", "JP", "AQ"]) {
  check(`${country} bank collection stays inside Stripe`, bankCollection() === "embedded")
}

const ro = parsePersonal({ kind: "individual", country: "ro", firstName: "Andrei", lastName: "Radu", businessName: "Ignored SRL" })
check("Romania individual keeps the person only", ro.ok === true && ro.ok && ro.value.country === "RO" && ro.value.businessName === null && ro.value.kind === "individual")
check(
  "Romania individual has no company issue",
  personalIssues({ kind: "individual", country: "RO", firstName: "Andrei", lastName: "Radu" }).businessName === undefined,
)

const roBusinessMissing = parsePersonal({ kind: "business", country: "RO", firstName: "Andrei", lastName: "Radu" })
check("Romania business requires the business name", roBusinessMissing.ok === false && roBusinessMissing.ok === false && roBusinessMissing.error === "Enter the business name.")
const roBusiness = parsePersonal({ kind: "business", country: "RO", firstName: "Andrei", lastName: "Radu", businessName: "Storelib SRL" })
check("Romania business accepts the business name", roBusiness.ok === true && roBusiness.ok && roBusiness.value.businessName === "Storelib SRL")

const us = parsePersonal({ kind: "individual", country: "US", firstName: "Ada", lastName: "Lovelace" })
check("US individual parses", us.ok === true && us.ok && us.value.country === "US")
const gb = parsePersonal({ kind: "individual", country: "gb", firstName: "Ada", lastName: "Lovelace" })
check("UK individual parses", gb.ok === true && gb.ok && gb.value.country === "GB")
const de = parsePersonal({ kind: "business", country: "DE", firstName: "Ada", lastName: "Lovelace", businessName: "Ada GmbH" })
check("EU business parses", de.ok === true && de.ok && de.value.country === "DE")

check("a country name is refused", parsePersonal({ kind: "individual", country: "Romania", firstName: "Ada", lastName: "Lovelace" }).ok === false)
const edge = parsePersonal({ kind: "individual", country: "AQ", firstName: "Ada", lastName: "Lovelace" })
check("an edge country is not given a special form", edge.ok === true)
check(
  "an unsupported country stays in plain language",
  paymentsSetupErrorMessage({ message: "The country AQ is not supported for this account" }) ===
    "Payments are not available for that country yet. Choose another country, or write to support@storelib.com.",
)

check("no account starts at personal info", beatFromRequirements({ ...open, hasAccount: false }) === "personal")
check(
  "an existing account resumes at verification",
  beatFromRequirements({ ...open, currentlyDue: ["individual.verification.document"] }) === "verification",
)
check(
  "a bank requirement is the bank step",
  beatFromRequirements({ ...open, detailsSubmitted: true, currentlyDue: ["external_account"] }) === "bank",
)
check(
  "US routing is still the bank step",
  beatFromRequirements({ ...open, detailsSubmitted: true, currentlyDue: ["external_account"] }) === "bank",
)
check(
  "documents in review are under review",
  beatFromRequirements({ ...open, detailsSubmitted: true, pendingVerification: ["individual.verification.document"] }) === "review",
)
check(
  "extra verification after submit is not finished",
  beatFromRequirements({ ...open, detailsSubmitted: true, hasBank: true, currentlyDue: ["individual.id_number"] }) === "verification",
)
const done: OnboardingBeat = beatFromRequirements({
  ...open,
  detailsSubmitted: true,
  hasBank: true,
  chargesEnabled: true,
  payoutsEnabled: true,
})
check("charges and payouts on is done", done === "done")
check(
  "a past-due item is not treated as done",
  beatFromRequirements({ ...open, detailsSubmitted: true, hasBank: true, chargesEnabled: true, payoutsEnabled: true, pastDue: ["individual.address.line1"] }) !== "done",
)

check("verify label", creatorStatusLabel("verification", false) === "Verify your details")
check("payout label", creatorStatusLabel("bank", false) === "Add payout account")
check("review label", creatorStatusLabel("review", false) === "Under review")
check("action label", creatorStatusLabel("verification", true) === "Action required")
check("active label", creatorStatusLabel("done", false) === "Payments active")
check("personal label stays human", creatorStatusLabel("personal", false) === "Action required")

const steps = readFileSync("lib/payments/stripe/onboarding-steps.ts", "utf8")
check("payout currency is not hardcoded", !/\b(EUR|RON|USD|GBP)\b/.test(steps))

const ui = readFileSync("components/app/settings/storelib-payments-settings.tsx", "utf8")
const embedded = readFileSync("components/app/settings/stripe-connect-embedded.tsx", "utf8")
const card = readFileSync("components/app/settings/storelib-payments-card.tsx", "utf8")
check("the form does not collect a bank number", !/iban|routing|accountNumber|passport/i.test(ui))
check("setup calls begin", ui.includes('"begin"'))
check("verification stays in the page", ui.includes("StripeConnectEmbedded") && !/window\.open|dashboard\.stripe/i.test(ui))
check("steps are the three short ones", /Personal info/.test(card) && /Verification/.test(card) && /Bank account/.test(card))
check("the embed uses the server key", embedded.includes("publishableKey") && !embedded.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"))
check("session secrets are not stored", !/localStorage|sessionStorage/.test(embedded))

const payouts = readFileSync("app/app/payouts/payouts-client.tsx", "utf8")
const payoutsPage = readFileSync("app/app/payouts/page.tsx", "utf8")
const accountLink = readFileSync("app/api/stripe/account-link/route.ts", "utf8")
const connectStart = readFileSync("app/api/stripe/connect/start/route.ts", "utf8")
check("payouts does not open an account link", !/\/api\/stripe\/account-link/.test(payouts) && !/Could not open Stripe/.test(payouts))
check("an unfinished payouts page is only the setup card", /if \(!paymentsReady\)/.test(payouts) && /paymentsReady \? \(/.test(payoutsPage))
check("the page does not request an Express dashboard link", !/createLoginLink/.test(payoutsPage))
check("account link routes do not call Stripe", !/accountLinks\.create/.test(accountLink) && !/accountLinks\.create/.test(connectStart))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
