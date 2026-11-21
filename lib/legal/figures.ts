/**
 * ===========================================================================
 *  THE NUMBERS THE LEGAL DOCUMENTS QUOTE, READ FROM THE CODE THAT CHARGES THEM
 * ===========================================================================
 * The Terms of service, the Privacy policy and the Refund policy
 * (components/legal) quote plan prices, fee rates, the small order line,
 * payout countries, email limits and grace periods. Every one of them comes
 * from here, and every one here comes from the table the product itself
 * charges or enforces by:
 *
 *   plan prices        lib/billing/plans (PRO_PRICE_CENTS, SCALE_PRICE_CENTS)
 *   fee rates          lib/billing/fee-calculator, from lib/payments/fees
 *   small order line   lib/payments/fees/currency-rules (USD)
 *   payout countries   lib/marketing/facts PAYOUTS
 *   campaign emails    lib/email-campaigns/limits
 *   AI edits           lib/sites/plan
 *   membership grace   lib/memberships/state
 *   EU withdrawal      lib/communities/membership-policy
 *
 * So a price or a rate that changes in the product changes in the documents
 * on the next deploy, and tests/legal-documents.test.ts fails if a document
 * types one in by hand.
 *
 * Pure and client safe: the documents are also drawn in a OnePage's sheet.
 */
import { cardRateLabel, fixedFeeLabel, smallOrderRateFor, type StorelibProductKind } from "@/lib/billing/fee-calculator"
import { ratePercentLabel } from "@/lib/payments/fees/config"
import { CURRENCY_FEE_RULES } from "@/lib/payments/fees/currency-rules"
import { OFFERED_PLAN_IDS, PRO_PRICE_CENTS, SCALE_PRICE_CENTS, formatPlanPrice, planDisplayName, type OfferedPlanId } from "@/lib/billing/plans"
import { MONTHLY_EMAILS } from "@/lib/email-campaigns/limits"
import { siteLimits, type SitePlan } from "@/lib/sites/plan"
import { PAYOUTS } from "@/lib/marketing/facts"
import { PAST_DUE_GRACE_DAYS } from "@/lib/memberships/state"
import { WITHDRAWAL_WAIVER } from "@/lib/communities/membership-policy"
import { PLATFORM_STATEMENT_DESCRIPTOR } from "@/lib/payments/platform-descriptor"

/** "$4.00": orders at or above it pay the plan's rate and the fixed fee; under it, the small order rate alone. */
export const SMALL_ORDER_LINE = `$${(CURRENCY_FEE_RULES.USD.microThresholdMinor / 100).toFixed(2)}`

/** "$0.25": the fixed part of the fee, in US dollars. */
export const FIXED_FEE = fixedFeeLabel()

/** What a plan costs a month, as the pricing page says it: "$0", "$14", "$99". */
export function planPrice(id: OfferedPlanId): string {
  if (id === "growth") return formatPlanPrice(PRO_PRICE_CENTS)
  if (id === "pro") return formatPlanPrice(SCALE_PRICE_CENTS)
  return formatPlanPrice(0)
}

export interface FeeRow {
  id: OfferedPlanId
  /** "Free", "Grow", "Pro". */
  name: string
  /** "$0", "$14 a month". */
  price: string
  digital: string
  physical: string
  smallDigital: string
  smallPhysical: string
}

const small = (id: string, kind: StorelibProductKind) => ratePercentLabel(smallOrderRateFor(id, kind))

/** One row per plan on sale, in the order the pricing page shows them. */
export function feeRows(): FeeRow[] {
  return OFFERED_PLAN_IDS.map((id) => ({
    id,
    name: planDisplayName(id),
    price: id === "free" ? planPrice(id) : `${planPrice(id)} a month`,
    digital: cardRateLabel(id, "digital"),
    physical: cardRateLabel(id, "physical"),
    smallDigital: small(id, "digital"),
    smallPhysical: small(id, "physical"),
  }))
}

/** "Grow ($14 a month) and Pro ($99 a month)": the paid plans, named with their prices. */
export function paidPlansSentence(): string {
  const paid = OFFERED_PLAN_IDS.filter((id) => id !== "free").map((id) => `${planDisplayName(id)} (${planPrice(id)} a month)`)
  return paid.length > 1 ? `${paid.slice(0, -1).join(", ")} and ${paid[paid.length - 1]}` : paid[0] ?? ""
}

/** "Free 500, Grow 2,000, Pro 5,000": campaign emails a calendar month, by plan. */
export function emailLimitsSentence(): string {
  return OFFERED_PLAN_IDS.map((id) => `${planDisplayName(id)} ${MONTHLY_EMAILS[id].toLocaleString("en-US")}`).join(", ")
}

/** "Free 200, Grow 500, Pro 1,000": AI edits a month, by plan. */
export function aiEditsSentence(): string {
  return OFFERED_PLAN_IDS.map((id) => `${planDisplayName(id)} ${siteLimits(id as SitePlan).aiEditsPerMonth.toLocaleString("en-US")}`).join(", ")
}

/** "the US, the UK, the EEA, Canada and Switzerland". */
export const PAYOUT_REGIONS = PAYOUTS.regions

/** Days a membership whose renewal failed keeps access while the card is retried. */
export const MEMBERSHIP_GRACE_DAYS = PAST_DUE_GRACE_DAYS

/** The words a buyer in the EU, the EEA or the UK ticks at a community membership's checkout. */
export const MEMBERSHIP_WAIVER_WORDS = WITHDRAWAL_WAIVER

/** "STORELIB": the start of the line a buyer's bank statement shows. */
export const STATEMENT_PREFIX = PLATFORM_STATEMENT_DESCRIPTOR

/** The date all three documents took effect and were last changed. */
export const LEGAL_EFFECTIVE = "2026-11-20"

/**
 * DETAILS ONLY STORELIB'S OWNER CAN SUPPLY. Each is null until it is known,
 * and while it is null the legal pages leave out the sentence or row that
 * needs it (never a bracket, never an empty line). Fill a field in here and
 * that line appears on the page.
 */
export const LEGAL_DETAILS: {
  /** Storelib Inc.'s registered address, one line. */
  registeredAddress: string | null
  /** The company registration number. */
  companyNumber: string | null
  /** The DMCA designated agent: name and postal address, as registered with the US Copyright Office. */
  dmcaAgent: string | null
  /** The address of Storelib's data processing agreement for creators. */
  dpaUrl: string | null
  /** The data protection officer: name or role and contact. */
  dpo: string | null
  /** The EU and UK representative under GDPR article 27. */
  euRepresentative: string | null
  /** Days of notice before a higher plan price applies. */
  priceChangeNoticeDays: number | null
  /** Days of notice before a material change to the terms or fees. */
  termsChangeNoticeDays: number | null
  /** How long support requests are kept, in plain words ("2 years"). */
  supportRetention: string | null
  /** How long backups are kept, in plain words ("30 days"). */
  backupRetention: string | null
} = {
  registeredAddress: null,
  companyNumber: null,
  dmcaAgent: null,
  dpaUrl: null,
  dpo: null,
  euRepresentative: null,
  priceChangeNoticeDays: null,
  termsChangeNoticeDays: null,
  supportRetention: null,
  backupRetention: null,
}

/** "30 days' notice" when a number is set, else "reasonable advance notice". */
export function noticeWords(days: number | null): string {
  return days ? `${days} days' notice` : "reasonable advance notice"
}
