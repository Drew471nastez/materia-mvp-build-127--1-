import { readFileSync } from "node:fs"
import {
  AGREEMENT_URL,
  detailsIssues,
  detailsPlan,
  dobParts,
  idNumberCopy,
  maskDobTyping,
  normalizeDobInput,
  normalPhone,
  requirementLabel,
  unknownRequirements,
} from "@/lib/payments/stripe/details-fields"

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

const fresh = [
  "business_profile.mcc",
  "business_profile.url",
  "external_account",
  "individual.address.city",
  "individual.address.line1",
  "individual.address.postal_code",
  "individual.dob.day",
  "individual.dob.month",
  "individual.dob.year",
  "individual.email",
  "individual.first_name",
  "individual.last_name",
  "individual.phone",
  "individual.id_number",
  "individual.political_exposure",
  "tos_acceptance.date",
  "tos_acceptance.ip",
]
const plan = detailsPlan(fresh, "individual")
check("a new individual is asked everything in Storelib", ["dob", "address", "phone", "idNumber", "pep", "tos"].every((f) => plan.fields.includes(f as never)))
check("names, email and business profile are never asked again", !plan.other)
check("no document until Stripe asks", plan.document === null)
check("the state is asked only when due", !plan.fields.includes("state") && detailsPlan(["individual.address.state"], "individual").fields.includes("state"))
check("ssn last 4 when the full number is not due", detailsPlan(["individual.ssn_last_4"], "individual").fields.join() === "ssnLast4")
check("an ID photo when Stripe asks", detailsPlan(["individual.verification.document"], "individual").document === "identity")
check("proof of address when Stripe asks", detailsPlan(["individual.verification.additional_document"], "individual").document === "address_proof")
check("an unknown requirement falls back", detailsPlan(["individual.relationship.title"], "individual").other)
check("a legal name still missing is asked, not skipped", plan.fields.includes("name") && !detailsPlan(["individual.dob.day"], "individual").fields.includes("name"))
check("statement descriptors are set by the server", !detailsPlan(["settings.payments.statement_descriptor", "settings.card_payments.statement_descriptor_prefix"], "individual").other)
const company = detailsPlan(
  [
    "company.name",
    "company.address.city",
    "company.address.line1",
    "company.address.postal_code",
    "company.address.state",
    "company.phone",
    "company.tax_id",
    "company.owners_provided",
    "company.directors_provided",
    "representative.first_name",
    "representative.last_name",
    "representative.email",
    "representative.dob.day",
    "representative.address.line1",
    "representative.phone",
    "representative.relationship.title",
    "representative.relationship.executive",
    "owners.first_name",
    "directors.last_name",
    "business_profile.url",
    "tos_acceptance.date",
    "external_account",
  ],
  "business",
)
check("a business is asked in Storelib, company and representative", !company.other && ["companyName", "companyAddress", "companyState", "companyPhone", "taxId", "name", "title", "dob", "address", "phone", "owners", "tos"].every((f) => company.fields.includes(f as never)))
check("a person created on a business reads as its representative", detailsPlan(["person_1AbC.dob.day", "person_1AbC.verification.document"], "business").fields.join() === "dob" && detailsPlan(["person_1AbC.verification.document"], "business").document === "identity")
check("a company document when Stripe asks", detailsPlan(["company.verification.document"], "business").document === "company")
check("a business with only the agreement stays native", detailsPlan(["tos_acceptance.date", "external_account"], "business").fields.join() === "tos")
check("what Storelib cannot ask is named, not coded", unknownRequirements(["individual.verification.proof_of_liveness"], "individual").length === 1 && requirementLabel("individual.verification.proof_of_liveness") === "A quick selfie check")
check("company fields are checked", !!detailsIssues({ taxId: "12" }, ["taxId"], "US").taxId && !detailsIssues({ taxId: "12-3456789" }, ["taxId"], "US").taxId && !!detailsIssues({}, ["owners"], "US").owners)
check("the bank alone asks nothing here", detailsPlan(["external_account"], "individual").fields.length === 0 && !detailsPlan(["external_account"], "individual").other)

const now = new Date(Date.UTC(2026, 0, 15))
check("a real date parses", JSON.stringify(dobParts("1990-02-28", now)) === JSON.stringify({ day: 28, month: 2, year: 1990 }))
check("typed digits become ISO", maskDobTyping("19900502") === "1990-05-02" && normalizeDobInput("19900502", now) === "1990-05-02")
check("slashes normalize to ISO", normalizeDobInput("28/02/1990", now) === "1990-02-28" && normalizeDobInput("05/02/1990", now) === "1990-02-05")
check("an impossible date does not", dobParts("1990-02-30", now) === null && dobParts("28/02/1990", now) === null && normalizeDobInput("1990-02-30", now) === null)
check("a future date does not", dobParts("2030-01-01", now) === null)
check("under 18 is refused", detailsIssues({ dob: "2010-01-01" }, ["dob"], "RO", now).dob === "You must be 18 or older to get paid.")
check("18 today is fine", !detailsIssues({ dob: "2008-01-15" }, ["dob"], "RO", now).dob)
check("phones need a country code", !!detailsIssues({ phone: "0712 345 678" }, ["phone"], "RO").phone && !detailsIssues({ phone: "+40 712 345 678" }, ["phone"], "RO").phone)
check("00 becomes +", normalPhone("0040 712-345-678") === "+40712345678")
check("a US SSN is 9 digits", !!detailsIssues({ idNumber: "1234" }, ["idNumber"], "US").idNumber && !detailsIssues({ idNumber: "123-45-6789" }, ["idNumber"], "US").idNumber)
check("a Romanian CNP is 13 digits", !!detailsIssues({ idNumber: "123" }, ["idNumber"], "RO").idNumber && !detailsIssues({ idNumber: "1900228123456" }, ["idNumber"], "RO").idNumber)
check("a US ZIP is checked", !!detailsIssues({ line1: "1 Main St", city: "Austin", postalCode: "7870" }, ["address"], "US").postalCode)
check("the PEP question needs an answer", !!detailsIssues({ pep: "" }, ["pep"], "RO").pep && !detailsIssues({ pep: "none" }, ["pep"], "RO").pep)
check("the agreement is required", !!detailsIssues({}, ["tos"], "RO").tos && !detailsIssues({ tos: true }, ["tos"], "RO").tos)
check("ID copy is local and short", idNumberCopy("US").label === "Social Security number" && idNumberCopy("RO").label === "CNP" && idNumberCopy("DE").tip.length < 90)
check("agreement links are Stripe's", AGREEMENT_URL.full.endsWith("/legal/full") && AGREEMENT_URL.recipient.endsWith("/legal/recipient"))

const verification = readFileSync("lib/payments/stripe/verification.ts", "utf8")
const overview = readFileSync("lib/payments/stripe/overview.ts", "utf8")
const route = readFileSync("app/api/payments/[action]/route.ts", "utf8")
const flow = readFileSync("components/app/settings/payments-setup-flow.tsx", "utf8")
check("forms that could sign in to Stripe are prepared first", /purpose === "onboarding" \|\| purpose === "management"\) await prepareStorelibAccount/.test(overview))
check("a Stripe-hosted account never opens a Stripe form", /if \(!runsInStorelib\(account\)\)[\s\S]{0,200}throw new PaymentsProblem\(NOT_IN_STORELIB, 409\)/.test(verification))
check("ID photos go to Stripe's Files API on the creator's account", /stripe\.files\.create\([\s\S]*identity_document[\s\S]*\{ stripeAccount: account\.id \}/.test(verification))
check("ID photos are never written to storage", !/storage\.from|writeFile|console\.[a-z]+\([^)]*file\.name/.test(verification))
check("the agreement records the date, IP and browser", /tos_acceptance = \{ date: Math\.floor\(Date\.now\(\) \/ 1000\), ip: consent\.ip, user_agent/.test(verification))
check("identity values are not logged", !/console\.[a-z]+\([^)]*(input\.|idNumber|dob|phone)/.test(verification))
check("the upload is read as multipart before any JSON", /action === "document" \? await request\.formData\(\)/.test(route))
check("verify calls prepare, not a Stripe page", flow.includes('post<Overview>("prepare"') && !/account_links|accountLinks|window\.open|connect\.stripe\.com/.test(flow))
check("the phone gets a full screen subpage with a back icon", /data-payments-setup-panel="subpage"/.test(flow) && /ChevronLeft/.test(flow) && !/BottomSheet/.test(flow))
check("fields have tips", (flow.match(/tip=/g) ?? []).length >= 8 && /export function InfoTip/.test(flow))
check("the upload goes as form data, not JSON", /fetch\("\/api\/payments\/document", \{ method: "POST", body/.test(flow))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
