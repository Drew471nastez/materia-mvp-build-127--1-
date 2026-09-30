import { readFileSync } from "node:fs"
import { paymentsSetupErrorMessage } from "@/lib/payments/stripe/setup-errors"
import {
  bankFormat,
  bankIssues,
  bankTokenFields,
  ibanValid,
  type BankInput,
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

const formats: Record<string, string> = { RO: "iban", DE: "iban", FR: "iban", US: "us", GB: "gb", AU: "au", CA: "ca", NZ: "nz", JP: "other", AQ: "other" }
for (const [country, format] of Object.entries(formats)) {
  check(`${country} bank form is ${format}`, bankFormat(country) === format)
}
check("a real Romanian IBAN passes the checksum", ibanValid("RO49AAAA1B31007593840000"))
check("a mistyped IBAN fails the checksum", !ibanValid("RO49AAAA1B31007593840001"))
const roBank: BankInput = { format: "iban", holder: "Andrei Radu", iban: "RO49 AAAA 1B31 0075 9384 0000", ibanConfirm: "RO49AAAA1B31007593840000", owns: true }
check("a Romanian IBAN account is ready", Object.keys(bankIssues(roBank, "RO")).length === 0)
check("an IBAN from another country is refused", bankIssues({ ...roBank, iban: "DE89370400440532013000", ibanConfirm: "DE89370400440532013000" }, "RO").iban === "Use an IBAN from your country.")
check("IBANs that differ are refused", bankIssues({ ...roBank, ibanConfirm: "RO49AAAA1B31007593840001" }, "RO").ibanConfirm === "The IBANs do not match.")
check("the account must be confirmed as theirs", bankIssues({ ...roBank, owns: false }, "RO").owns !== undefined)
const usBank: BankInput = { format: "us", holder: "Ada Lovelace", routing: "110000000", account: "000123456789", accountConfirm: "000123456789", owns: true }
check("a US account needs routing and account", Object.keys(bankIssues(usBank, "US")).length === 0 && bankIssues({ ...usBank, routing: "12" }, "US").routing !== undefined)
check("a US token has routing and account", JSON.stringify(bankTokenFields(usBank)) === JSON.stringify({ account_number: "000123456789", routing_number: "110000000" }))
check("a Canadian token joins transit and institution", bankTokenFields({ format: "ca", holder: "A B", account: "1234567", transit: "11000", institution: "000", owns: true }).routing_number === "11000-000")
check("an IBAN token carries the IBAN only", JSON.stringify(bankTokenFields(roBank)) === JSON.stringify({ account_number: "RO49AAAA1B31007593840000" }))

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
  beatFromRequirements({ ...open, detailsSubmitted: true, hasBank: true, pendingVerification: ["individual.verification.document"] }) === "review",
)
check(
  "details in review with no bank yet goes to the bank",
  beatFromRequirements({ ...open, detailsSubmitted: true, pendingVerification: ["individual.verification.document"] }) === "bank",
)
check(
  "only the bank left, before Stripe marks the details sent, is the bank step",
  beatFromRequirements({ ...open, currentlyDue: ["external_account"] }) === "bank",
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
const flow = readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8")
const embedded = readFileSync("components/app/settings/stripe-connect-embedded.tsx", "utf8")
const connect = readFileSync("lib/payments/stripe/connect.ts", "utf8")
check("the card holds no bank or identity fields", !/iban|routing|accountNumber|passport/i.test(ui))
check("bank numbers become a Stripe token in the browser; only the token is sent", /createToken\("bank_account"/.test(flow) && /post<Overview>\("bank", \{ token: token\.id \}\)/.test(flow))
check("the server takes a bank token and never a number", /\^btok_/.test(connect) && /external_account: token/.test(connect))
check("setup calls begin", flow.includes('"begin"'))
check("verification stays in the page", flow.includes("DetailsForm") && !/purpose="stripe_onboarding"|StripeConnectEmbedded/.test(flow) && !/window\.open|dashboard\.stripe/i.test(flow + ui))
check("steps are the three short ones", /\["Account", "Verify", "Bank"\]/.test(flow))
check("new accounts are run by Storelib, with no Stripe dashboard", /requirement_collection: "application"/.test(connect) && /stripe_dashboard: \{ type: "none" \}/.test(connect))
check("those accounts' embedded forms never open Stripe's sign-in window", /disable_stripe_user_authentication: true/.test(connect) && /external_account_collection: false/.test(connect))
check("an unfinished Express account is replaced, not duplicated", /storelibOnly: true/.test(connect) && /stripe\.accounts\.del\(replacing\)/.test(connect))
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
