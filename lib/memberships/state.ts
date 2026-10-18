/**
 * ===========================================================================
 *  A MEMBERSHIP'S STATE, AND WHAT IT LETS A MEMBER SEE
 * ===========================================================================
 * Every decision about a membership is made here, from plain values, so the
 * webhook, the checkout, the library, the creator's members list and the
 * tests all answer the same way. Nothing here reads a database or Stripe.
 *
 * THE STATUSES. Stripe has eight subscription statuses; a member needs five
 * words and one of them is ours, not Stripe's:
 *
 *   incomplete  the first payment (or the card for a trial) is not in yet.
 *               No access. A trial Stripe calls "trialing" before its card is
 *               saved is still incomplete here, so leaving the checkout
 *               half way never opens anything.
 *   trialing    a free trial with a card saved.
 *   active      paid for this period.
 *   past_due    a renewal failed and Stripe is retrying. Access continues
 *               for PAST_DUE_GRACE_DAYS with a banner to fix the card.
 *   canceled    the member cancelled and the period they paid for is still
 *               running (Stripe: active or trialing with cancel_at_period_end).
 *               Access until current_period_end, and Resume undoes it.
 *   expired     over: Stripe ended it, the first payment never came
 *               (incomplete_expired), or Stripe gave up retrying (unpaid).
 *
 * ACCESS is grantsAccess below, and the database has the same rule in
 * public.membership_grants_access (supabase/sql/run-now/75_memberships.sql),
 * which row level security on members' posts uses. tests/memberships.test.ts
 * holds the two to the same table of cases.
 *
 * Browser safe: the library and the creator's screens format with it too.
 */
import { PLAN_CURRENCY } from "@/lib/money/product-currency"


export const MEMBERSHIP_STATUSES = ["incomplete", "trialing", "active", "past_due", "canceled", "expired"] as const
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number]
export type BillingInterval = "month" | "year"

/** How long a member whose renewal failed keeps access while Stripe retries. The SQL rule says 7 days too. */
export const PAST_DUE_GRACE_DAYS = 7
const DAY_MS = 86_400_000

/** How long before a renewal the reminder goes: a week for a year, three days for a month. */
export function reminderLeadDays(interval: BillingInterval): number {
  return interval === "year" ? 7 : 3
}

export interface AccessFields {
  status: string
  current_period_end: string | null
  past_due_since: string | null
}

function ms(value: string | null | undefined): number | null {
  if (!value) return null
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : null
}

/** Whether a membership lets its member read posts and use what it includes, now. */
export function grantsAccess(m: AccessFields, now: number = Date.now()): boolean {
  switch (m.status) {
    case "active":
    case "trialing":
      return true
    case "canceled": {
      const end = ms(m.current_period_end)
      return end !== null && end > now
    }
    case "past_due": {
      const since = ms(m.past_due_since)
      return since === null || since > now - PAST_DUE_GRACE_DAYS * DAY_MS
    }
    default:
      return false
  }
}

/** When a past due member's access stops, or null when it is not past due. */
export function graceEndsAt(m: AccessFields): string | null {
  if (m.status !== "past_due") return null
  const since = ms(m.past_due_since)
  return since === null ? null : new Date(since + PAST_DUE_GRACE_DAYS * DAY_MS).toISOString()
}

/* ── From Stripe ────────────────────────────────────────────────────────── */

/**
 * The parts of a Stripe subscription this reads. Loose on purpose: the
 * webhook's payload and a retrieved subscription are the same shape, and the
 * API version this SDK pins (2025-11-17.clover) moved the period onto the
 * items, so both places are read.
 */
export interface SubscriptionLike {
  id: string
  status: string
  customer: string | { id: string } | null
  cancel_at_period_end?: boolean | null
  cancel_at?: number | null
  canceled_at?: number | null
  ended_at?: number | null
  trial_end?: number | null
  current_period_start?: number | null
  current_period_end?: number | null
  default_payment_method?: string | { id?: string; card?: { brand?: string | null; last4?: string | null } | null } | null
  pending_setup_intent?: string | { id?: string; status?: string } | null
  metadata?: Record<string, string> | null
  items?: {
    data?: Array<{
      current_period_start?: number | null
      current_period_end?: number | null
      price?: { id?: string; unit_amount?: number | null; currency?: string | null; recurring?: { interval?: string | null } | null } | null
    }>
  } | null
}

/** A subscription the membership checkout made, as opposed to a creator's Storelib plan. */
export function isMembershipSubscription(sub: { metadata?: Record<string, string> | null } | null | undefined): boolean {
  return sub?.metadata?.kind === "membership"
}

const iso = (seconds: number | null | undefined): string | null =>
  typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null

/** Whether a trial's card has been saved: a pending setup intent that has not succeeded means not yet. */
function trialCardMissing(sub: SubscriptionLike): boolean {
  if (sub.default_payment_method) return false
  const pending = sub.pending_setup_intent
  if (!pending) return false
  return typeof pending === "string" || pending.status !== "succeeded"
}

/** Our status for a Stripe subscription. */
export function statusFromStripe(sub: SubscriptionLike): MembershipStatus {
  const cancelling = sub.cancel_at_period_end === true || (typeof sub.cancel_at === "number" && sub.cancel_at > 0)
  switch (sub.status) {
    case "incomplete":
      return "incomplete"
    case "trialing":
      if (trialCardMissing(sub)) return "incomplete"
      return cancelling ? "canceled" : "trialing"
    case "active":
      return cancelling ? "canceled" : "active"
    case "past_due":
      return "past_due"
    default:
      /* canceled, incomplete_expired, unpaid, paused: over. A paid unpaid invoice brings it back through the next sync. */
      return "expired"
  }
}

export interface MembershipFields {
  status: MembershipStatus
  stripe_status: string
  stripe_customer_id: string | null
  stripe_price_id: string | null
  billing_interval: BillingInterval
  amount_cents: number
  currency: string
  trial_end: string | null
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  canceled_at: string | null
  ended_at: string | null
  past_due_since: string | null
  started_at: string | null
  card_brand: string | null
  card_last4: string | null
}

export interface PreviousFields {
  status?: string | null
  past_due_since?: string | null
  started_at?: string | null
  card_brand?: string | null
  card_last4?: string | null
}

/**
 * The row a subscription means now. `prev` keeps what only history knows:
 * when a past due spell began (so the grace is counted from the first
 * failure, not the latest retry) and when the member first got access.
 */
export function fieldsFromSubscription(sub: SubscriptionLike, prev: PreviousFields | null, now: number = Date.now()): MembershipFields {
  const status = statusFromStripe(sub)
  const item = sub.items?.data?.[0]
  const price = item?.price
  const interval: BillingInterval = price?.recurring?.interval === "year" ? "year" : "month"
  const periodStart = item?.current_period_start ?? sub.current_period_start ?? null
  /* A scheduled cancellation ends at cancel_at when Stripe gives one, which is the period end for cancel_at_period_end. */
  const periodEnd = item?.current_period_end ?? sub.current_period_end ?? null
  const pm = sub.default_payment_method && typeof sub.default_payment_method === "object" ? sub.default_payment_method : null
  const nowIso = new Date(now).toISOString()
  const pastDueSince = status === "past_due" ? (prev?.status === "past_due" && prev.past_due_since ? prev.past_due_since : nowIso) : null
  const fields: MembershipFields = {
    status,
    stripe_status: sub.status,
    stripe_customer_id: typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_price_id: price?.id ?? null,
    billing_interval: interval,
    amount_cents: typeof price?.unit_amount === "number" ? price.unit_amount : 0,
    /* A plan is priced in dollars (lib/money/product-currency PLAN_CURRENCY): its price says so; the constant only names that rule. */
    currency: (price?.currency || PLAN_CURRENCY).toLowerCase(),
    trial_end: iso(sub.trial_end),
    current_period_start: iso(periodStart),
    current_period_end: status === "canceled" && typeof sub.cancel_at === "number" && sub.cancel_at > 0 ? iso(sub.cancel_at) : iso(periodEnd),
    cancel_at_period_end: status === "canceled",
    canceled_at: iso(sub.canceled_at),
    ended_at: iso(sub.ended_at),
    past_due_since: pastDueSince,
    started_at: prev?.started_at ?? null,
    card_brand: pm?.card?.brand ?? prev?.card_brand ?? null,
    card_last4: pm?.card?.last4 ?? prev?.card_last4 ?? null,
  }
  if (!fields.started_at && grantsAccess(fields, now)) fields.started_at = nowIso
  return fields
}

/* ── What changed ───────────────────────────────────────────────────────── */

export type Transition = "started" | "cancel_scheduled" | "resumed" | "ended" | "access_on" | "access_off"

/**
 * What a change from `prev` to `next` means, for the notifications and for
 * the products a membership includes. Pure: the same pair always says the
 * same, so a webhook delivered twice says it twice and the keys downstream
 * (notify's event keys, entitlements by membership) keep it to once.
 */
export function transitions(prev: (AccessFields & { started_at?: string | null }) | null, next: AccessFields & { started_at?: string | null }, now: number = Date.now()): Transition[] {
  const out: Transition[] = []
  const had = prev ? grantsAccess(prev, now) : false
  const has = grantsAccess(next, now)
  if (!prev?.started_at && next.started_at) out.push("started")
  if (next.status === "canceled" && prev?.status !== "canceled" && prev?.status !== "expired") out.push("cancel_scheduled")
  if (prev?.status === "canceled" && (next.status === "active" || next.status === "trialing")) out.push("resumed")
  if (next.status === "expired" && prev && prev.status !== "expired" && (prev.started_at || next.started_at)) out.push("ended")
  if (!had && has) out.push("access_on")
  if (had && !has) out.push("access_off")
  return out
}

/* ── Fees ───────────────────────────────────────────────────────────────── */

/**
 * THE PLATFORM FEE AS A PERCENTAGE. A one time checkout takes an exact
 * application fee in cents (lib/billing/fee-calculator: the plan's percent,
 * plus 25 cents from $4 in USD). A subscription takes `application_fee_percent`,
 * which Stripe applies to every invoice and allows to two decimal places, so
 * the same fee is expressed as that percent of the price. Stripe rounds the
 * result to the cent, so the fee charged is within half a cent per $100 of
 * the exact one; each renewal is then set to the exact figure while its
 * invoice is still a draft (lib/memberships/webhook.ts, invoice.created).
 */
export function feePercentFor(amountCents: number, feeCents: number): number {
  if (!Number.isFinite(amountCents) || amountCents <= 0) return 0
  const pct = Math.round((Math.max(0, feeCents) / amountCents) * 10_000) / 100
  return Math.min(100, Math.max(0, pct))
}

/** What Stripe charges as the fee for a percent: the percent of the amount, rounded to the cent. */
export function feeFromPercent(amountCents: number, percent: number): number {
  return Math.round((amountCents * percent) / 100)
}

/* ── Words ──────────────────────────────────────────────────────────────── */

export function money(cents: number, currency: string = PLAN_CURRENCY): string {
  const code = (currency || PLAN_CURRENCY).toUpperCase()
  const whole = cents % 100 === 0
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100)
  } catch {
    return `$${(cents / 100).toFixed(whole ? 0 : 2)}`
  }
}

/** "$9/month", "$90/year". */
export function pricePer(cents: number, interval: BillingInterval, currency = "usd"): string {
  return `${money(cents, currency)}/${interval === "year" ? "year" : "month"}`
}

/** What a yearly price saves against twelve monthly ones, as a whole percent, or 0. */
export function yearlySaving(monthlyCents: number | null, yearlyCents: number | null): number {
  if (!monthlyCents || !yearlyCents) return 0
  const full = monthlyCents * 12
  if (yearlyCents >= full) return 0
  return Math.floor(((full - yearlyCents) / full) * 100)
}

export function shortDate(value: string | null | undefined): string {
  const t = ms(value)
  if (t === null) return ""
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
}

export type Tone = "good" | "warn" | "bad" | "quiet"

export interface StatusView {
  /** One or two words, beside the dot. */
  label: string
  tone: Tone
  /** The line under it: what happens next, with a date and an amount where there is one. */
  line: string
}

export interface ViewFields extends AccessFields {
  billing_interval: string
  amount_cents: number
  currency: string
  trial_end: string | null
}

/** How the buyer's library and the creator's members list say where a membership stands. */
export function describeStatus(m: ViewFields, now: number = Date.now()): StatusView {
  const interval: BillingInterval = m.billing_interval === "year" ? "year" : "month"
  const price = m.amount_cents > 0 ? pricePer(m.amount_cents, interval, m.currency) : ""
  const end = shortDate(m.current_period_end)
  switch (m.status) {
    case "active":
      return { label: "Active", tone: "good", line: end ? `Renews ${end}${m.amount_cents > 0 ? ` for ${money(m.amount_cents, m.currency)}` : ""}` : "Active" }
    case "trialing":
      return { label: "Free trial", tone: "good", line: `Trial ends ${shortDate(m.trial_end || m.current_period_end)}${price ? `, then ${price}` : ""}` }
    case "past_due": {
      const until = shortDate(graceEndsAt(m))
      return { label: "Payment failed", tone: "bad", line: grantsAccess(m, now) && until ? `Update your card by ${until} to keep access` : "Update your card to get access back" }
    }
    case "canceled":
      return grantsAccess(m, now)
        ? { label: "Cancelled", tone: "warn", line: end ? `Access until ${end}` : "Access until the end of the period" }
        : { label: "Ended", tone: "quiet", line: end ? `Last day ${end}` : "" }
    case "incomplete":
      return { label: "Not started", tone: "quiet", line: "The first payment did not go through" }
    default:
      return { label: "Ended", tone: "quiet", line: end ? `Last day ${end}` : "" }
  }
}

/** Members who count toward a creator's recurring revenue: paying now, not cancelled. */
export function monthlyValue(m: { status: string; billing_interval: string; amount_cents: number }): number {
  if (m.status !== "active" && m.status !== "past_due") return 0
  return m.billing_interval === "year" ? Math.round(m.amount_cents / 12) : m.amount_cents
}
