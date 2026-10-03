import {
  beatOfStatus,
  getStorelibPaymentsStatus,
  setupStepOf,
  STATUS_PILL,
  statusFactsOf,
  type StorelibPaymentsStatus,
} from "@/lib/payments/stripe/status"

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

/* Shapes as Stripe returns them on a connected account (requirements, future_requirements, capabilities). */
type Acct = Parameters<typeof statusFactsOf>[0]
function account(over: Partial<NonNullable<Acct>> & { due?: string[]; past?: string[]; pending?: string[]; reason?: string | null; deadline?: number | null; future?: string[] } = {}): Acct {
  const { due = [], past = [], pending = [], reason = null, deadline = null, future = [], ...rest } = over
  return {
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    /* As Stripe reports them: an account it lets take charges has its capabilities active. */
    capabilities: rest.charges_enabled ? { card_payments: "active", transfers: "active" } : { card_payments: "inactive", transfers: "inactive" },
    requirements: { currently_due: due, past_due: past, pending_verification: pending, disabled_reason: reason, current_deadline: deadline },
    future_requirements: { currently_due: future, past_due: [] },
    ...rest,
  }
}
const bank = [{ status: "new" }]
const status = (a: Acct, banks: Array<{ status?: string | null }> = [], extra: { everActive?: boolean; lastPayoutFailed?: boolean } = {}) =>
  getStorelibPaymentsStatus(statusFactsOf(a, banks, extra))

const all: StorelibPaymentsStatus[] = ["NOT_STARTED", "INCOMPLETE", "VERIFYING", "ACTION_REQUIRED", "BANK_REQUIRED", "ACTIVE", "RESTRICTED", "PAYOUT_FAILED", "SUSPENDED"]
const seen = new Set<StorelibPaymentsStatus>()
const is = (name: string, got: ReturnType<typeof status>, want: StorelibPaymentsStatus) => {
  seen.add(got.status)
  check(`${name} is ${want}`, got.status === want)
  return got
}

is("no connected account", status(null), "NOT_STARTED")

/* A fresh account right after the Account step: Stripe lists what it still needs. */
const fresh = is(
  "a new individual account",
  status(account({ due: ["business_profile.url", "external_account", "individual.dob.day", "individual.address.line1", "individual.id_number", "tos_acceptance.date"], reason: "requirements.past_due" })),
  "INCOMPLETE",
)
check("a new account continues setup in the embedded form", fresh.action === "onboarding" && fresh.actionLabel === "Continue setup")

const checking = is(
  "everything sent, Stripe checking the ID",
  status(account({ details_submitted: true, pending: ["individual.verification.document"], reason: "requirements.pending_verification" }), bank),
  "VERIFYING",
)
check("checking asks nothing of the creator", checking.action === null && checking.title === "Verification in progress" && checking.line === "We're checking your information. No action is needed right now.")

const idDue = is(
  "Stripe asks for an ID photo after submit",
  status(account({ details_submitted: true, due: ["individual.verification.document"] }), bank),
  "ACTION_REQUIRED",
)
check("an ID ask reads as verify your identity", idDue.title === "Verify your identity" && idDue.action === "onboarding")

const ownersDue = is(
  "a company missing its owners",
  status(account({ details_submitted: true, business_type: "company", due: ["company.owners_provided", "company.tax_id"] } as never), bank),
  "ACTION_REQUIRED",
)
check("owners are asked in Stripe's form, not by Storelib", ownersDue.action === "onboarding" && ownersDue.title === "More information needed")

is("only the bank left", status(account({ details_submitted: true, due: ["external_account"], capabilities: { card_payments: "active", transfers: "inactive" } })), "BANK_REQUIRED")
is("no bank on file and nothing else due", status(account({ details_submitted: true, charges_enabled: true })), "BANK_REQUIRED")
check("the bank step is Bank", setupStepOf("BANK_REQUIRED") === 2 && beatOfStatus("BANK_REQUIRED") === "bank")

const active = is(
  "charges and payouts on, bank on file",
  status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { card_payments: "active", transfers: "active" } }), bank),
  "ACTIVE",
)
check("active has nothing to do", active.action === null && active.canCharge)
check("a bank collected in onboarding completes Bank on its own", setupStepOf(active.status) !== 2 && beatOfStatus(active.status) === "done")

const later = is(
  "active, and Stripe asks for more with a deadline",
  status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true, due: ["individual.id_number"], deadline: 1_900_000_000 }), bank, { everActive: true }),
  "ACTION_REQUIRED",
)
check("later asks keep payments active and say so", later.title === "More information needed" && later.line === "Update your payout details to keep your account active." && later.actionLabel === "Update details")
check("the deadline is passed on as a date", later.deadline === new Date(1_900_000_000 * 1000).toISOString())

const future = is(
  "active, Stripe will ask for more one day",
  status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true, future: ["individual.verification.additional_document"] }), bank, { everActive: true }),
  "ACTIVE",
)
check("future requirements do not nag", future.upcoming && future.action === null)

const restricted = is(
  "past due after being active",
  status(account({ details_submitted: true, past: ["individual.verification.document"], reason: "requirements.past_due" }), bank, { everActive: true }),
  "RESTRICTED",
)
check("restore copy for a paused account", restricted.title === "Payouts are temporarily paused" && restricted.line === "Complete the requested verification to resume payouts." && restricted.actionLabel === "Fix now")

is("past due before ever being active", status(account({ details_submitted: true, past: ["individual.address.line1"], reason: "requirements.past_due" }), bank), "RESTRICTED")

const failedBank = is("Stripe marked the bank errored", status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: false }), [{ status: "errored" }]), "PAYOUT_FAILED")
check("a failed bank opens the bank change", failedBank.action === "change_bank" && failedBank.actionLabel === "Update payout account")
is("the last payout failed", status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true }), bank, { lastPayoutFailed: true }), "PAYOUT_FAILED")

const closed = is("rejected by Stripe", status(account({ details_submitted: true, reason: "rejected.fraud" }), bank), "SUSPENDED")
check("a closed account points to support, not a form", closed.action === "support")
is(
  "paused by the platform while charges are still on",
  status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true, reason: "platform_paused" }), bank),
  "ACTIVE",
)
is("paused by the platform with charges off", status(account({ details_submitted: true, charges_enabled: false, reason: "platform_paused" }), bank), "SUSPENDED")

is("a capability still pending", status(account({ details_submitted: true, charges_enabled: true, capabilities: { card_payments: "active", transfers: "pending" } }), bank), "VERIFYING")
is("something off with nothing to ask", status(account({ details_submitted: true, reason: "other" }), bank), "RESTRICTED")

check("waiting items are not asked again", status(account({ details_submitted: true, due: ["individual.verification.document"], pending: ["individual.verification.document"] }), bank).status === "VERIFYING")
check("Storelib form state can never make an account active", status(account({ details_submitted: true, due: [] }), bank).status !== "ACTIVE")

check("every status is reachable", all.every((s) => seen.has(s)))

/* Storelib's charge model: a destination charge needs the seller's transfers capability, not card_payments. */
is(
  "a recipient account (transfers only) with transfers active",
  status(account({ details_submitted: true, charges_enabled: false, payouts_enabled: true, capabilities: { transfers: "active" } }), bank, { everActive: true }),
  "ACTIVE",
)
is(
  "charges on but the transfers capability not active",
  status(account({ details_submitted: true, charges_enabled: true, payouts_enabled: true, capabilities: { card_payments: "active", transfers: "inactive" } }), bank),
  "RESTRICTED",
)

check("every status has a pill", all.every((s) => typeof STATUS_PILL[s]?.label === "string"))
const copy = all.map((s) => JSON.stringify(STATUS_PILL[s]))
const views = [fresh, checking, idDue, ownersDue, active, later, restricted, failedBank, closed]
check(
  "no Stripe field names reach the creator",
  ![...copy, ...views.map((v) => `${v.title} ${v.line} ${v.actionLabel ?? ""}`)].some((t) => /currently_due|past_due|external_account|requirement|capabilit|disabled_reason|acct_|stripe/i.test(t)),
)
check("no country is special-cased", !/"RO"|Romania|"US"/.test(require("node:fs").readFileSync("lib/payments/stripe/status.ts", "utf8")))

console.log(`\n${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
