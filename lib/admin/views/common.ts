import { fullyRefunded } from "@/lib/orders/refund-state"

import type { StripeState } from "../types"

/**
 * Small pieces every admin view shares, pure so the suite can run them.
 */

export type CreatorEmbed = { id?: string | null; slug?: string | null; username?: string | null; display_name?: string | null } | null | undefined

/** A creator as a list shows it: a handle to search by, a name to read. */
export function creatorRef(c: CreatorEmbed): { id: string; handle: string; name: string } | null {
  if (!c || !c.id) return null
  const handle = c.slug || c.username || ""
  return { id: c.id, handle, name: c.display_name || handle || c.id.slice(0, 8) }
}

/**
 * Where a creator stands with Stripe Connect, from the columns the Connect
 * webhook keeps up to date. "ready" is the only state in which a buyer can
 * pay them and they can be paid.
 */
export function stripeState(c: {
  stripe_account_id?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
}): StripeState {
  if (!c.stripe_account_id) return "none"
  if (c.charges_enabled && c.payouts_enabled) return "ready"
  if (c.details_submitted) return "restricted"
  return "pending"
}

/** An embedded row PostgREST may give as an object or a one-item array. */
export function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null
  return v ?? null
}

/** What can still be refunded through Stripe, in cents. */
export function refundableCents(o: { status?: string | null; amount_cents?: number | null; refund_amount_cents?: number | null; stripe_payment_intent_id?: string | null }): number {
  if (!o.stripe_payment_intent_id) return 0
  if (o.status !== "completed" && o.status !== "refunded") return 0
  /* The same rule as the creator's own refund (lib/orders/refund-state.ts):
     a refunded row with no partial amount recorded was refunded in full. */
  if (fullyRefunded(o)) return 0
  const already = o.status === "refunded" ? Math.max(0, o.refund_amount_cents ?? 0) : 0
  return Math.max(0, (o.amount_cents ?? 0) - already)
}
