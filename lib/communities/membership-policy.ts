/**
 * ===========================================================================
 *  A PAID MEMBERSHIP'S RULES: REFUNDS, CONTACT, CANCELLING, THE LAW
 * ===========================================================================
 * Round 13, worker M (asks 39 to 43). Pure and browser safe: the owner's
 * Settings (worker A), the member's Membership page, the checkout and the
 * routes read the same rules from here.
 *
 *   REFUND POLICY   plain text the owner writes (at most 2000 characters),
 *                   shown at checkout and on the member's Membership page.
 *   CONTACT EMAIL   an address the owner may give for community messages,
 *                   and may choose to show in public. The contact form never
 *                   shows any address: messages go through Storelib.
 *   CANCELLING      the same six reasons as leaving (lib/communities/
 *                   leave-reasons.ts), optional; the subscription stops at
 *                   the end of the period paid for.
 *   MONEY           in the community's currency, written the way the buyer's
 *                   own locale writes money.
 *   EU WITHDRAWAL   a buyer in the EU, the EEA or the UK has 14 days to
 *                   withdraw from an online purchase, unless they ask for
 *                   digital access to start at once and acknowledge that the
 *                   right ends when it does. Checkout asks for that in the
 *                   words below, where it applies (or where the country is
 *                   not known).
 *
 * The A <-> M contract (ARCH13 "Contracts"): REFUND_POLICY_MAX,
 * cleanRefundPolicy, cleanContactEmail. Part 101 adds the columns.
 */
import { LEAVE_NOTE_MAX, LEAVE_REASONS, LEAVE_REASON_SHORT, parseLeaveReason, type LeaveReason } from "./leave-reasons"

/* ── The owner's settings ─────────────────────────────────────────────── */

/** The longest refund policy kept (part 101's CHECK). */
export const REFUND_POLICY_MAX = 2000

/**
 * A refund policy as it is kept: control characters out, line ends made
 * plain, at most one blank line in a row, trimmed and cut at the limit.
 * Null when nothing is left, which means "no policy".
 */
export function cleanRefundPolicy(v: unknown): string | null {
  if (typeof v !== "string") return null
  const text = v
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REFUND_POLICY_MAX)
    .trim()
  return text || null
}

export const CONTACT_EMAIL_MAX = 254
const EMAIL = /^[^\s@<>"',;:()[\]\\]{1,64}@[^\s@<>"',;:()[\]\\]{1,190}\.[a-z]{2,24}$/i

/** A contact address as it is kept: trimmed, lower case, a plain address. Null when empty or not an address. */
export function cleanContactEmail(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = v.trim().toLowerCase()
  if (!t || t.length > CONTACT_EMAIL_MAX || !EMAIL.test(t)) return null
  return t
}

/** What Settings says under the field: null when it is fine or empty. */
export function contactEmailProblem(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null
  return cleanContactEmail(v) ? null : "Enter a full email address, like help@yourname.com."
}

/* ── Cancelling ───────────────────────────────────────────────────────── */

/** The same six answers leaving offers, so the owner reads one set of reasons. */
export const CANCEL_REASONS = LEAVE_REASONS
export type CancelReason = LeaveReason
export const CANCEL_NOTE_MAX = LEAVE_NOTE_MAX
export const CANCEL_REASON_SHORT = LEAVE_REASON_SHORT

/** { reason?, note? } from a cancel request: a known reason and a tidy note, or null for none. */
export function parseCancelReason(body: unknown): { reason: CancelReason; note: string | null } | null {
  return parseLeaveReason(body)
}

/* ── Contacting the owner ─────────────────────────────────────────────── */

export const CONTACT_SUBJECT_MAX = 120
export const CONTACT_MESSAGE_MIN = 10
export const CONTACT_MESSAGE_MAX = 2000

/**
 * How often a member may write to the owner: per member and community, and
 * per member across every community. rateLimit counts these (it lets a
 * request through when its table cannot be read); the messages table of part
 * 101 counts the day a second time, so a member can never send more than
 * CONTACT_DAILY_CAP a day to one community.
 */
export const CONTACT_RATE = [
  { limit: 3, seconds: 3600 },
  { limit: 5, seconds: 86400 },
] as const
export const CONTACT_RATE_ANY = [{ limit: 10, seconds: 86400 }] as const
export const CONTACT_DAILY_CAP = 5

function oneLine(v: string): string {
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\r\n\t\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim()
}

/** The subject and message a member wrote, tidied, or what to fix. */
export function cleanContactMessage(body: unknown): { ok: true; subject: string; message: string } | { ok: false; error: string } {
  const b = (body && typeof body === "object" ? body : {}) as { subject?: unknown; message?: unknown }
  const subject = oneLine(typeof b.subject === "string" ? b.subject : "")
  const message = (typeof b.message === "string" ? b.message : "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
  if (!subject) return { ok: false, error: "Add a subject." }
  if (subject.length > CONTACT_SUBJECT_MAX) return { ok: false, error: `Keep the subject under ${CONTACT_SUBJECT_MAX} characters.` }
  if (message.length < CONTACT_MESSAGE_MIN) return { ok: false, error: "Write a little more so the owner can help." }
  if (message.length > CONTACT_MESSAGE_MAX) return { ok: false, error: `Keep it under ${CONTACT_MESSAGE_MAX.toLocaleString("en-US")} characters.` }
  return { ok: true, subject, message }
}

/* ── Money ────────────────────────────────────────────────────────────── */

/** A BCP 47 tag Intl accepts, from an Accept-Language header or navigator.language; "en-US" otherwise. */
export function buyerLocale(value: string | null | undefined): string {
  const first = (value || "").split(",")[0]?.split(";")[0]?.trim() ?? ""
  if (!first || first === "*") return "en-US"
  try {
    return Intl.getCanonicalLocales(first)[0] || "en-US"
  } catch {
    return "en-US"
  }
}

/**
 * An amount in its own currency, in the buyer's way of writing money:
 * "$19", "19,00 €" for de-DE, "€19.50" for en-IE. Whole amounts drop the
 * cents, as every other membership price on Storelib does.
 */
export function formatMoney(cents: number, currency = "usd", locale = "en-US"): string {
  const code = (currency || "usd").toUpperCase()
  const value = (Number.isFinite(cents) ? cents : 0) / 100
  const whole = Math.round(value * 100) % 100 === 0
  const opts: Intl.NumberFormatOptions = { style: "currency", currency: code, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }
  try {
    return new Intl.NumberFormat(locale, opts).format(value).replace(/[  ]/g, " ")
  } catch {
    try {
      return new Intl.NumberFormat("en-US", opts).format(value)
    } catch {
      return `${value.toFixed(whole ? 0 : 2)} ${code}`
    }
  }
}

/** "Oct 31, 2026" in the reader's locale; the empty string for no date. */
export function formatDay(iso: string | null | undefined, locale = "en-US"): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return ""
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(t)
  } catch {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(t)
  }
}

/** What a cancelled member reads, on the page and in the email: "Your membership ends on Oct 31, 2026. No further charges." */
export function membershipEndsLine(endsAt: string | null | undefined, locale = "en-US"): string {
  const day = formatDay(endsAt, locale)
  return day ? `Your membership ends on ${day}. No further charges.` : "Your membership is cancelled. No further charges."
}

/* ── Refunds ──────────────────────────────────────────────────────────── */

export const REFUND_REASON_MAX = 500

/** What can still go back on a payment: what was paid less what went back before. */
export function refundableCents(order: { amount_cents?: number | null; refund_amount_cents?: number | null; status?: string | null }): number {
  const paid = Math.max(0, Math.round(Number(order.amount_cents) || 0))
  if (order.status !== "completed" && order.status !== "refunded") return 0
  const before = order.status === "refunded" ? Math.max(0, Math.round(Number(order.refund_amount_cents) || 0)) : 0
  return Math.max(0, paid - before)
}

/**
 * The amount an owner asked to refund, in cents: omitted means everything
 * that is left. Refuses nothing, less than a cent, or more than is left.
 */
export function parseRefundAmount(input: unknown, maxCents: number): { ok: true; cents: number } | { ok: false; error: string } {
  if (maxCents <= 0) return { ok: false, error: "This payment has already been refunded in full." }
  if (input === undefined || input === null || input === "") return { ok: true, cents: maxCents }
  const n = typeof input === "number" ? input : Number(String(input).trim())
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return { ok: false, error: "Enter an amount to refund." }
  if (n > maxCents) return { ok: false, error: "That is more than is left on this payment." }
  return { ok: true, cents: n }
}

/** A refund reason as kept: one line, at most 500 characters, or null. */
export function cleanRefundReason(v: unknown): string | null {
  if (typeof v !== "string") return null
  const t = oneLine(v).slice(0, REFUND_REASON_MAX)
  return t || null
}

/* ── EU withdrawal ────────────────────────────────────────────────────── */

/** The EU, the rest of the EEA, and the UK (whose consumer rules keep the same 14 days). */
export const WITHDRAWAL_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO",
  "GB",
])

/** Whether checkout asks for the waiver: a country in the list, or a country nobody told us. */
export function withdrawalWaiverApplies(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(c) || c === "XX") return true
  return WITHDRAWAL_COUNTRIES.has(c)
}

/** The waiver, in the consent the buyer ticks. */
export const WITHDRAWAL_WAIVER = "I want access to start right away, and I understand that I lose my 14 day right of withdrawal once it does."

/** The same, as the receipt and the Membership page record it. */
export const WITHDRAWAL_WAIVER_RECORD = "You asked for access to start right away and acknowledged that the 14 day right of withdrawal ends once it does."

/* ── What the Membership page shows ───────────────────────────────────── */

export type MembershipStateWord = "active" | "trialing" | "past_due" | "canceled" | "expired" | "incomplete"

/**
 * A member's paid membership of one community, as the Membership page,
 * CancelMembership and the routes see it. Never an address, never a card
 * beyond its last four digits.
 */
export interface CommunityMembershipView {
  communityId: string
  communityName: string
  /** How the member is in: a subscription, a one time purchase, or free. */
  kind: "subscription" | "purchase" | "free" | "none"
  membershipId: string | null
  status: MembershipStateWord | null
  /** Whether the subscription still lets them in. */
  access: boolean
  amountCents: number
  currency: string
  interval: "month" | "year" | null
  /** When it renews, or when it ends once cancelled. */
  periodEnd: string | null
  cancelAtPeriodEnd: boolean
  canCancel: boolean
  canResume: boolean
  cardLast4: string | null
  /** Card and invoices live on the account's membership page (Stripe's portal). */
  manageUrl: string | null
  refundPolicy: string | null
  contact: { form: boolean; publicEmail: string | null; ownerName: string | null }
}

/** One line for the page under the price: when it renews or ends. */
export function membershipStatusLine(v: Pick<CommunityMembershipView, "kind" | "status" | "periodEnd" | "amountCents" | "currency" | "access">, locale = "en-US"): string {
  if (v.kind === "purchase") return "Paid once. Yours for as long as the community runs."
  if (v.kind === "free") return "Free membership."
  if (v.kind !== "subscription" || !v.status) return ""
  const day = formatDay(v.periodEnd, locale)
  switch (v.status) {
    case "active":
      return day ? `Renews on ${day} for ${formatMoney(v.amountCents, v.currency, locale)}.` : "Active."
    case "trialing":
      return day ? `Free trial until ${day}, then ${formatMoney(v.amountCents, v.currency, locale)}.` : "Free trial."
    case "past_due":
      return "Your last payment did not go through. Update your card to keep access."
    case "canceled":
      return v.access ? membershipEndsLine(v.periodEnd, locale) : "Your membership has ended."
    case "incomplete":
      return "Waiting for the first payment. You get access once it goes through."
    default:
      return "Your membership has ended."
  }
}
