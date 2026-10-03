/**
 * ONCE A WEEK UNTIL PAYOUTS ARE SET UP (lib/notify/payout-weekly.ts), and the
 * simpler setup form: no business question.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { dayOf, paymentsComplete, wantsPayoutNudge, PAYOUT_NUDGES } from "@/lib/notify/payout-weekly"
import { unfinished } from "@/lib/notify/workflows/unfinished"
import { REGISTRY } from "@/lib/notify/registry"
import { renderEmail } from "@/lib/notify/templates"
import { bankFormat, detailIssues, ibanValid, idNumberName, needsOf } from "@/lib/payments/stripe/own-form-rules"
import { frameQuality, hintFor } from "@/lib/payments/id-frame-quality"

let passed = 0
let failed = 0
const failures: string[] = []
function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) { passed++; console.log(`  ok    ${label}`) }
  else { failed++; failures.push(label); console.log(`  FAIL  ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`) }
}
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8")

console.log("\nWho the weekly email is for")
const none = new Set<string>()
check("never connected: yes", wantsPayoutNudge({ id: "c1", user_id: "u1" }, none))
check("started and unfinished: yes", wantsPayoutNudge({ id: "c1", user_id: "u1", stripe_account_id: "x", details_submitted: true, charges_enabled: false, payouts_enabled: false }, none))
check("connected: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", stripe_onboarding_status: "connected" }, none))
check("everything switched on: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", charges_enabled: true, payouts_enabled: true, details_submitted: true }, none))
check("ready on Airwallex: no", !wantsPayoutNudge({ id: "c1", user_id: "u1" }, new Set(["c1"])))
check("a deleted account: no", !wantsPayoutNudge({ id: "c1", user_id: "u1", deleted_at: "2026-01-01T00:00:00Z" }, none))
check("no person to write to: no", !wantsPayoutNudge({ id: "c1", user_id: null }, none))
check("complete reads like the send-time condition", paymentsComplete({ id: "c", user_id: "u", stripe_onboarding_status: "connected" }) && !paymentsComplete({ id: "c", user_id: "u", charges_enabled: true, payouts_enabled: true, details_submitted: false }))
check("every payout setup email counts as told this week", PAYOUT_NUDGES.includes("PAYOUT_SETUP_WEEKLY") && PAYOUT_NUDGES.includes("PAYOUT_SETUP_UNFINISHED_2"))

console.log("\nThe email")
const now = Date.parse("2026-10-03T10:00:00Z")
const event = { name: "payment_setup.weekly_check" as const, key: "payment_setup.weekly_check:c1:2026-10-03", userId: "u1", creatorId: "c1", entityType: "creator" as const, entityId: "c1", payload: { day: dayOf(now), started: false }, occurredAt: new Date(now).toISOString() }
const plan = unfinished(event, { now, userId: "u1", creatorId: "c1" })
const job = plan?.jobs[0]
check("the sweep's event plans one weekly email, sent at once", plan?.jobs.length === 1 && job?.type === "PAYOUT_SETUP_WEEKLY" && job.runAt === new Date(now).toISOString())
check("keyed by the creator and the day, so a sweep that runs twice sends once", job?.idempotencyKey === "PAYOUT_SETUP_WEEKLY:u:u1:c1:week_2026-10-03")
const again = unfinished(event, { now: now + 3600_000, userId: "u1", creatorId: "c1" })
check("the same day an hour later plans the same key", again?.jobs[0]?.idempotencyKey === job?.idempotencyKey)
const entry = REGISTRY.PAYOUT_SETUP_WEEKLY
check("lifecycle, with an unsubscribe, and never sent once payments are set up", entry.category === "lifecycle" && entry.requirement === "optional_product" && entry.condition === "payment_setup_incomplete")
const mail = renderEmail("PAYOUT_SETUP_WEEKLY", { started: false }, { baseUrl: "https://storelib.com" } as never)
const text = JSON.stringify(mail)
check("it says what setup takes, and links to it", /five minutes/.test(text) && /\/app\/settings\?tab=payments/.test(text))
check("no em dash, no business question in it", !/—/.test(text) && !/business/i.test(text))
check("the second reminder no longer says it is the last", !/last reminder about your payouts/.test(read("lib/notify/templates/catalog.ts")))
const cron = read("app/api/cron/notifications/route.ts")
check("the hourly cron sweeps before the worker sends", cron.indexOf("sweepPayoutReminders(") > 0 && cron.indexOf("sweepPayoutReminders(") < cron.indexOf("runNotificationWork("))

console.log("\nSetup is country, name, Stripe's ID check and the bank")
const flow = read("components/app/settings/payments-setup-flow.tsx")
check("no Selling as question", !/Selling as/.test(flow) && !/<Segmented/.test(flow))
check("a new account is an individual", /data\.kind === "business" \? "business" : "individual"/.test(flow))
const connect = read("lib/payments/stripe/connect.ts")
const begin = connect.slice(connect.indexOf("export async function beginStripeOnboarding"), connect.indexOf("export async function upsertRepresentative"))
check("begin keeps the full business profile, so Stripe never asks what the business does", /creatorBusinessProfile\(/.test(begin) && !/product_description: row\?\.bio/.test(begin))

console.log("\nStorelib's own form asks only what Stripe lists")
const ro = needsOf({ currently_due: ["individual.dob.day", "individual.address.line1", "individual.id_number", "tos_acceptance.date", "external_account", "business_profile.url", "individual.email"], eventually_due: ["individual.verification.document"] })
check("like Gumroad, setup asks only what is needed now: date of birth, address, CNP, agreement, bank", JSON.stringify(ro.fields) === JSON.stringify(["dob", "address", "idNumber"]) && ro.tos && ro.bank, ro)
check("  the ID photo Stripe will want later is not asked yet", !ro.fields.includes("document") && needsOf({ eventually_due: ["individual.verification.document"] }, "all").fields.includes("document"))
const later = needsOf({ currently_due: ["individual.verification.document"], errors: [{ code: "verification_document_not_readable", requirement: "individual.verification.document" }] })
check("when Stripe asks for it later, it is asked with Stripe's reason in plain words", later.fields[0] === "document" && /sharper photo/.test(later.problems[0] ?? ""), later)
const reg = needsOf({ currently_due: ["individual.registered_address.line1", "individual.nationality"] })
check("a registered address is the same address, and nationality is asked when listed", reg.registeredAddress && reg.fields.includes("address") && reg.fields.includes("nationality"))
check("  never the business profile or the email, which are Storelib's", ro.other.length === 0 && !ro.fields.some((f) => String(f).startsWith("business")))
const us = needsOf({ currently_due: ["individual.ssn_last_4", "individual.phone", "individual.address.state", "individual.address.city"] })
check("a US account: last four of the SSN, phone, address with a state", JSON.stringify(us.fields) === JSON.stringify(["address", "state", "phone", "ssnLast4"]), us)
const waiting = needsOf({ currently_due: [], pending_verification: ["individual.verification.document"] })
check("something Stripe is checking is not asked again", waiting.fields.length === 0 && waiting.checking)
check("an unknown requirement is not hidden", needsOf({ currently_due: ["individual.full_name_aliases"] }).other[0] === "individual.full_name_aliases")
check("the ID number is named as the country does", idNumberName("RO").label.startsWith("CNP") && idNumberName("US").label === "Social Security number" && idNumberName("ZZ").label === "Personal ID number")
check("IBAN in Romania and Germany, sort code in the UK, routing in the US", bankFormat("RO").kind === "iban" && bankFormat("DE").kind === "iban" && bankFormat("GB").routingLabel === "Sort code" && bankFormat("US").routingLabel === "Routing number")
check("a real IBAN passes its check", ibanValid("RO49 AAAA 1B31 0075 9384 0000", "RO") && ibanValid("DE89370400440532013000", "DE"))
check("one wrong digit is caught", !ibanValid("RO49 AAAA 1B31 0075 9384 0001", "RO"))
check("  and an IBAN from another country than the account's", !ibanValid("DE89370400440532013000", "RO"))
const today = new Date("2026-10-03T00:00:00Z")
check("under 18 cannot be paid out", !!detailIssues({ dob: { day: 4, month: 10, year: 2008 } }, ["dob"], { tos: false, now: today }).dob && !detailIssues({ dob: { day: 3, month: 10, year: 2008 } }, ["dob"], { tos: false, now: today }).dob)
check("a PO box is refused, as Stripe would", /PO box/.test(detailIssues({ address: { line1: "PO Box 12", city: "Bucharest", postalCode: "010101" } }, ["address"], { tos: false }).address ?? ""))
check("the agreement has to be ticked", !!detailIssues({}, [], { tos: true }).tos && !detailIssues({ acceptTos: true }, [], { tos: true }).tos)

console.log("\nThe CNP, or a photo of the ID, where Stripe allows either")
const alt = needsOf({ currently_due: ["individual.id_number", "individual.dob.day"], alternatives: [{ original_fields_due: ["individual.id_number"], alternative_fields_due: ["individual.verification.document"] }] })
check("Stripe's alternative puts the ID photo on the form as the other way", alt.fields.includes("document") && alt.offered.includes("document") && alt.either[0]?.original[0] === "idNumber", alt)
const dob = { day: 1, month: 1, year: 1990 }
check("with the photo given, no CNP is needed", !detailIssues({ dob }, alt.fields, { tos: false, either: alt.either, given: new Set(["document"]) }).idNumber)
check("without the photo, the CNP is still needed", !!detailIssues({ dob }, alt.fields, { tos: false, either: alt.either, given: new Set() }).idNumber)
check("a CNP typed with the photo is still checked", !!detailIssues({ dob, idNumber: "12" }, alt.fields, { tos: false, either: alt.either, given: new Set(["document"]) }).idNumber)
check("no alternative from Stripe, no shortcut: the number stays required", !!detailIssues({ dob }, needsOf({ currently_due: ["individual.id_number"] }).fields, { tos: false, either: [], given: new Set(["document"]) }).idNumber)

console.log("\nThe ID camera takes the photo only when Stripe could read it")
const w = 64, h = 40
const card = new Uint8Array(w * h).map((_, i) => ((i % w) % 6 < 3 ? 40 : 200))
const flat = new Uint8Array(w * h).fill(130)
const dark = new Uint8Array(w * h).map((_, i) => ((i % w) % 6 < 3 ? 5 : 40))
const glare = new Uint8Array(w * h).map((_, i) => (i < w * h * 0.2 ? 255 : (i % w) % 6 < 3 ? 40 : 200))
check("sharp, lit, steady text is ready", hintFor(frameQuality(card, w, h, card), 0) === "ready")
check("a blurred card is not taken", hintFor(frameQuality(flat, w, h, flat), 0) === "blur")
check("too dark is said, not taken", hintFor(frameQuality(dark, w, h, dark), 0) === "dark")
check("glare across the card is said, not taken", hintFor(frameQuality(glare, w, h, glare), 0) === "glare")
const moved = new Uint8Array(card).map((v) => 255 - v)
check("a hand still moving is not taken", hintFor(frameQuality(card, w, h, moved), 0) === "moving")

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) { for (const f of failures) console.log(`  - ${f}`); process.exit(1) }
