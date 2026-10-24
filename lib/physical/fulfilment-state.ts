/**
 * ===========================================================================
 *  WHAT AN ORDER'S TIMELINE SAYS ABOUT FULFILMENT: HOLDS AND PARTNERS
 * ===========================================================================
 * Read from the order's own events (commerce_order_events), so neither needs
 * a column of its own and an order from before reads as it always did.
 *
 *   hold      the shop held the order back (Shopify's Hold fulfillment):
 *             a reason, an optional note. While it holds, nothing on it is
 *             fulfilled, labelled or sent to a partner; a job that comes up
 *             meanwhile is written down (HELD_BACK) and sent on release.
 *   partner   per location that a partner fulfils from: sent (with what it
 *             costs, when the partner said), waiting on the hold, or not
 *             sent with the reason, which the order panel offers to send
 *             again.
 *
 * Pure: the order panel, the order route and the job queue all read it.
 */

export const HOLD = "fulfillment.hold"
export const HOLD_RELEASED = "fulfillment.hold_released"
/** A job that came up while the order was held: what to run once it is released. */
export const HELD_BACK = "fulfillment.held_back"
/** The shop asked a partner to send an order again (the panel's Send again). */
export const RESENT = "fulfillment.resent"
/** The partner cancelled its order because the shop cancelled in Storelib. */
export const PARTNER_CANCELLED = "fulfillment.partner_cancelled"

export const HOLD_REASONS = [
  { id: "out_of_stock", label: "Out of stock" },
  { id: "address", label: "Address to check" },
  { id: "fraud", label: "Possible fraud" },
  { id: "buyer", label: "Buyer asked to wait" },
  { id: "other", label: "Other" },
] as const

export type HoldReason = (typeof HOLD_REASONS)[number]["id"]

export function holdReason(value: unknown): HoldReason | null {
  return HOLD_REASONS.some((r) => r.id === value) ? (value as HoldReason) : null
}

export function holdReasonLabel(id: unknown): string {
  return HOLD_REASONS.find((r) => r.id === id)?.label ?? "Other"
}

interface TimelineEvent {
  id?: number
  kind: string
  createdAt: string
  message?: string
  detail?: Record<string, unknown> | null
}

export interface OrderHold {
  reason: HoldReason
  label: string
  note: string | null
  at: string
}

/** Newest first, ties by id: two entries written in the same millisecond still read in the order they were written. */
function newestFirst<T extends TimelineEvent>(events: readonly T[]): T[] {
  return [...events].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (b.id ?? 0) - (a.id ?? 0))
}

/** The hold on the order now, or null: the newest hold or release decides. */
export function holdOf(events: readonly TimelineEvent[]): OrderHold | null {
  const last = newestFirst(events.filter((e) => e.kind === HOLD || e.kind === HOLD_RELEASED))[0]
  if (!last || last.kind !== HOLD) return null
  const reason = holdReason(last.detail?.reason) ?? "other"
  const note = typeof last.detail?.note === "string" && last.detail.note.trim() ? last.detail.note.trim() : null
  return { reason, label: holdReasonLabel(reason), note, at: last.createdAt }
}

export type PartnerSend =
  | { state: "sent"; at: string; message: string; cost: { cents: number; currency: string } | null }
  | { state: "held"; at: string }
  | { state: "failed"; at: string; message: string }
  | { state: "resending"; at: string }
  | null

const FAILED = new Set(["fulfillment.manual_needed", "job.failed"])

/**
 * Where the order stands with the partner at one location, by the newest entry that names that location. Null when
 * nothing names it yet (just paid, the job about to run; or an order from before entries carried a location).
 */
export function partnerSendState(events: readonly TimelineEvent[], locationId: string | null): PartnerSend {
  if (!locationId) return null
  const mine = newestFirst(events.filter((e) => String(e.detail?.location_id ?? "") === locationId))
  for (const e of mine) {
    if (e.kind === "fulfillment.forwarded") {
      const cents = Number(e.detail?.cost_cents)
      const currency = typeof e.detail?.cost_currency === "string" ? e.detail.cost_currency : null
      return { state: "sent", at: e.createdAt, message: e.message ?? "", cost: Number.isFinite(cents) && cents > 0 && currency ? { cents, currency } : null }
    }
    if (e.kind === HELD_BACK) return { state: "held", at: e.createdAt }
    if (e.kind === RESENT) return { state: "resending", at: e.createdAt }
    if (FAILED.has(e.kind)) return { state: "failed", at: e.createdAt, message: e.message ?? "" }
  }
  return null
}

/** The jobs a hold keeps back: everything that hands the order to somebody else to send. */
export function heldBackJob(kind: string, payload: Record<string, unknown> | null | undefined): boolean {
  if (kind === "forward_fulfillment") return payload?.op !== "cancel"
  if (kind === "supplier_email") return true
  if (kind === "webhook_delivery") return (payload?.event ?? "order.paid") === "order.paid"
  if (kind === "shipstation_push") return (payload?.reason ?? "paid") === "paid"
  return false
}
