import { readFileSync } from "node:fs"
import { paymentsSetupErrorMessage } from "@/lib/payments/stripe/setup-errors"
import { parsePersonal, personalFields, personalIssues } from "@/lib/payments/stripe/onboarding-steps"
import { accountSessionComponents } from "@/lib/payments/stripe/session-components"

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

check("an individual is not asked for a company", personalFields("individual").join(",") === "firstName,lastName")
check("a business is asked for the business name", personalFields("business").join(",") === "businessName,firstName,lastName")

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

/* The exact Account Session components: one component per session, and only what that screen uses. */
const inStorelib = { external_account_collection: true, disable_stripe_user_authentication: true }
check(
  "onboarding enables account_onboarding only, bank in the form, no Stripe sign-in",
  JSON.stringify(accountSessionComponents("onboarding", true)) === JSON.stringify({ account_onboarding: { enabled: true, features: inStorelib } }),
)
check(
  "account details enable account_management only",
  JSON.stringify(accountSessionComponents("management", true)) === JSON.stringify({ account_management: { enabled: true, features: inStorelib } }),
)
check(
  "payouts never switch on money moves Storelib does not offer",
  JSON.stringify(accountSessionComponents("payouts", true)) ===
    JSON.stringify({ payouts: { enabled: true, features: { ...inStorelib, instant_payouts: false, standard_payouts: false, edit_payout_schedule: false } } }),
)
check("an older Stripe-run account gets no platform-only features", JSON.stringify(accountSessionComponents("onboarding", false)) === JSON.stringify({ account_onboarding: { enabled: true, features: {} } }))

const steps = readFileSync("lib/payments/stripe/onboarding-steps.ts", "utf8")
check("payout currency is not hardcoded", !/\b(EUR|RON|USD|GBP)\b/.test(steps))

const ui = readFileSync("components/app/settings/storelib-payments-settings.tsx", "utf8")
const flow = readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8")
const embedded = readFileSync("components/app/settings/stripe-connect-embedded.tsx", "utf8")
const connect = readFileSync("lib/payments/stripe/connect.ts", "utf8")
const route = readFileSync("app/api/payments/[action]/route.ts", "utf8")
const overview = readFileSync("lib/payments/stripe/overview.ts", "utf8")
check("the card holds no bank or identity fields", !/iban|routing|accountNumber|passport/i.test(ui))
check("Storelib has no bank or identity form of its own", !/iban|routing_number|createToken|date of birth|id_number|DetailsForm|DocumentForm/i.test(flow))
check("the server takes no bank numbers, ID fields or ID photos", !/case "(bank|details|document|profile)"/.test(route) && !/formData\(\)/.test(route))
check("setup calls begin, then Stripe's embedded onboarding", flow.includes('"begin"') && /purpose="stripe_onboarding"/.test(flow))
check("Verify asks only what is due now", /fields: "currently_due", futureRequirements: "omit"/.test(embedded) && !/eventually_due/.test(embedded + flow))
check("Verify is headed as the brief says", flow.includes("Verify your identity") && flow.includes("We need a few details to activate payments."))
check("the Account step's names are not asked again by Storelib", (flow.match(/autoComplete="given-name"/g) ?? []).length === 1)
check("a missing bank opens the bank requirement only", /requirements: \{ only: \["external_account"\] \}/.test(flow))
check("a bank on file shows its last four and a change button", /•••• \{bank\.last4\}/.test(flow) && flow.includes("Connected") && flow.includes("Change bank account") && /purpose="stripe_management"/.test(flow))
check("nothing opens a Stripe page or the Stripe dashboard", !/window\.open|dashboard\.stripe|account_links|accountLinks|connect\.stripe\.com\/(setup|express)/i.test(flow + ui + embedded))
check("steps are the three short ones", /\["Account", "Verify", "Bank"\]/.test(flow))
check("the step comes from Stripe's status, not the form", /setupStepOf\(/.test(flow) && /post<Overview>\("refresh"/.test(flow))
check("a failed load has a way on", embedded.includes("Couldn't load verification") && embedded.includes("Try again in a moment.") && embedded.includes(">\n          Try again"))
check("one loader, then Stripe's form fades in", /setOnLoaderStart/.test(embedded) && (embedded.match(/<WaitingArea/g) ?? []).length === 1)
check("desktop panel is about 760 wide, a little wider (840) only on a large desktop; phone stays full screen", /"max-w-\[min\(760px,calc\(100vw-40px\)\)\] xl:max-w-\[840px\]"/.test(flow) && !/(?:^|\s)(?:sm|md|lg):max-w-\[(?:8|9)\d\dpx\]/.test(flow) && /data-payments-setup-panel="subpage"/.test(flow) && /h-\[100dvh\]/.test(flow))
check("the keyboard fix hooks stay", /data-setup-footer=""/.test(flow) && /data-setup-scroll=""/.test(flow))
check("the phone app hands off to the browser", /isNativeApp\(\)/.test(flow) && /openExternal\(/.test(flow))
check("new accounts are run by Storelib, with no Stripe dashboard", /requirement_collection: "application"/.test(connect) && /stripe_dashboard: \{ type: "none" \}/.test(connect))
check("an unfinished Express account is replaced, not duplicated", /storelibOnly: true/.test(connect) && /stripe\.accounts\.del\(replacing\)/.test(connect))
check("sessions are made per view for the signed-in creator's own account", /stripe\.accountSessions\.create\(\{ account: row\.stripe_account_id, components \}\)/.test(connect) && !/stripe_account_id|accountId|account:/.test(embedded))
check("the embed uses the server key", embedded.includes("publishableKey") && !embedded.includes("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"))
check("session secrets are not stored or logged", !/localStorage|sessionStorage|console\./.test(embedded) && !/console\.[a-z]+\([^)]*client_secret/.test(connect))
check("the overview reads status from Stripe", /syncStripeAccountFull\(/.test(overview) && /paymentsStatus/.test(overview))

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
