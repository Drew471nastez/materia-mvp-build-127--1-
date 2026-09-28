import "server-only"

/**
 * ===========================================================================
 *  WHAT EVERY MEMBERSHIP ROUTE ON THE SERVER SHARES
 * ===========================================================================
 * The rows as the tables hold them (supabase/sql/run-now/75_memberships.sql),
 * the one way to tell "the tables are not there yet" from any other failure,
 * the signed tokens a member's email links carry, and who a signed in person
 * is as a member: by their account, or by the confirmed email they paid with
 * before they had one.
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { baseUrl } from "@/lib/notify/urls"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = any

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface MembershipRow {
  id: string
  product_id: string | null
  creator_id: string | null
  buyer_id: string | null
  buyer_email: string
  buyer_name: string | null
  title: string | null
  stripe_subscription_id: string
  stripe_customer_id: string | null
  stripe_price_id: string | null
  billing_interval: "month" | "year"
  amount_cents: number
  currency: string
  status: string
  stripe_status: string | null
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
  email_updates: boolean
  created_at: string
  updated_at: string
}

export interface PlanRow {
  product_id: string
  creator_id: string
  monthly_price_cents: number | null
  yearly_price_cents: number | null
  trial_days: number
  benefits: string[]
  included_product_ids: string[]
  currency: string
  stripe_product_id?: string | null
  stripe_monthly_price_id?: string | null
  stripe_monthly_price_cents?: number | null
  stripe_yearly_price_id?: string | null
  stripe_yearly_price_cents?: number | null
}

export const MEMBERSHIP_COLUMNS =
  "id, product_id, creator_id, buyer_id, buyer_email, buyer_name, title, stripe_subscription_id, stripe_customer_id, stripe_price_id, billing_interval, amount_cents, currency, status, stripe_status, trial_end, current_period_start, current_period_end, cancel_at_period_end, canceled_at, ended_at, past_due_since, started_at, card_brand, card_last4, email_updates, created_at, updated_at"

export const PLAN_COLUMNS = "product_id, creator_id, monthly_price_cents, yearly_price_cents, trial_days, benefits, included_product_ids, currency"

/** Postgres and PostgREST saying the table is not there: part 75 has not run. */
export function tableMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST204" || error.code === "42703" || /does not exist|schema cache/i.test(error.message ?? "")
}

/** What a member or a creator reads when the tables are not there yet. The admin's Health view names the missing part. */
export const NOT_SET_UP = "Memberships are not set up on Storelib yet. Try again later."

export function siteUrl(path = ""): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`
}

/* ── Signed tokens ──────────────────────────────────────────────────────── */

function secret(): string {
  const s = process.env.MEMBERSHIP_LINK_SECRET || process.env.EMAIL_LINK_SECRET || process.env.NOTIFY_UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  if (!s) throw new Error("No secret to sign membership links with")
  return s
}

function mac(label: string, value: string): string {
  return createHmac("sha256", secret()).update(`storelib.membership.${label}.v1|${value}`).digest("base64url")
}

/** A token for one purpose and one id: `<id>.<mac>`. */
export function signToken(label: "unsubscribe" | "receipt", id: string): string {
  return `${id}.${mac(label, id).slice(0, 32)}`
}

export function verifyToken(label: "unsubscribe" | "receipt", token: unknown): string | null {
  if (typeof token !== "string" || token.length > 120) return null
  const dot = token.lastIndexOf(".")
  if (dot < 1) return null
  const id = token.slice(0, dot)
  const given = Buffer.from(token.slice(dot + 1))
  const want = Buffer.from(mac(label, id).slice(0, 32))
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null
  return id
}

/**
 * A receipt token for a membership payment's order, the same every time it
 * is asked for the same Stripe invoice and impossible to guess without the
 * secret. The orders table holds receipt_token UNIQUE, so two deliveries of
 * one invoice.paid racing each other make one order, as a one time
 * checkout's two paths do (lib/checkout/fulfil-payment.ts).
 */
export function receiptTokenFor(invoiceId: string): string {
  return `m${mac("receipt", invoiceId).replace(/[^A-Za-z0-9]/g, "").slice(0, 31)}`
}

export function unsubscribeUrl(membershipId: string): string {
  return siteUrl(`/api/memberships/unsubscribe?t=${encodeURIComponent(signToken("unsubscribe", membershipId))}`)
}

/* ── Who is a member ────────────────────────────────────────────────────── */

export interface Viewer {
  id: string
  email: string | null
  /** Only a confirmed address finds a membership bought before the account existed. */
  emailConfirmed: boolean
}

export function viewerOf(user: { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null } | null): Viewer | null {
  if (!user) return null
  return {
    id: user.id,
    email: user.email ? user.email.trim().toLowerCase() : null,
    emailConfirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
  }
}

/** The filter that finds a person's memberships: their account, or their confirmed email. */
export function ownerFilter(viewer: Viewer): string {
  const byEmail = viewer.email && viewer.emailConfirmed ? `,buyer_email.eq."${viewer.email.replace(/["\\,()]/g, "")}"` : ""
  return `buyer_id.eq.${viewer.id}${byEmail}`
}

export function belongsTo(row: Pick<MembershipRow, "buyer_id" | "buyer_email">, viewer: Viewer): boolean {
  if (row.buyer_id && row.buyer_id === viewer.id) return true
  return !row.buyer_id && !!viewer.email && viewer.emailConfirmed && row.buyer_email === viewer.email
}
