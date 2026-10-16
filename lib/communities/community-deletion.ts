/**
 * ===========================================================================
 *  DELETING A COMMUNITY THAT MEMBERS PAY FOR (round 33), THE RULES
 * ===========================================================================
 * The owner: deleting a community that still has paying members was refused
 * with "Archive it instead". Now it goes the way Skool, Circle and Patreon do
 * it, and these are the rules both the server (./server/community-deletion)
 * and the dialog (components/community/creator/delete-community) read:
 *
 *   NOBODY PAYS    typed name, deleted at once, as before.
 *   PERIOD END     the default. New joins stop at once (the community is
 *                  archived: read only, off sale), every renewing membership
 *                  is set to cancel at the end of the time it paid for, each
 *                  member is emailed once, and the community is deleted when
 *                  the last paid period ends. Undo is possible until then.
 *   NOW            every membership ends today, each member gets back the
 *                  unused part of their last payment (prorated to the
 *                  second, rounded down to the cent, never more than is left
 *                  to refund), and the community is deleted as soon as every
 *                  membership is done. Not undoable: the money went back.
 *
 * Pure and browser safe.
 */
import { grantsAccess } from "@/lib/memberships/state"

export const DELETION_MODES = ["period_end", "now"] as const
export type DeletionMode = (typeof DELETION_MODES)[number]

export function isDeletionMode(v: unknown): v is DeletionMode {
  return v === "period_end" || v === "now"
}

/** What the dialog is told before it asks. */
export interface DeletionPlanView {
  /** Part 202 has run, so a paid community can be scheduled. */
  ready: boolean
  /** Memberships that still give access because somebody paid. */
  paying: number
  /** When the last of them runs out, or null when nobody pays. */
  lastPaidUntil: string | null
  /** About what a deletion now refunds in all, in the currency below. */
  refundEstimateCents: number
  currency: string
  scheduled: ScheduledDeletionView | null
}

export interface ScheduledDeletionView {
  mode: DeletionMode
  deleteAt: string
  requestedAt: string
  /** Memberships stopped so far, of all the deletion has to stop. */
  stopped: number
  total: number
  /** Memberships that could not be stopped yet; the job run tries again. */
  failing: number
  canUndo: boolean
}

/** The fields of a membership the rules read. */
export interface PaidTime {
  status: string
  current_period_end: string | null
  past_due_since?: string | null
}

/** Whether this membership still lets its member in: the memberships engine's own rule (lib/memberships/state grantsAccess). */
export function stillPaid(m: PaidTime, now: number = Date.now()): boolean {
  return grantsAccess({ status: m.status, current_period_end: m.current_period_end, past_due_since: m.past_due_since ?? null }, now)
}

/** A membership Stripe will charge again unless it is told not to. */
export function renews(m: PaidTime & { cancel_at_period_end?: boolean | null }): boolean {
  return (m.status === "active" || m.status === "trialing" || m.status === "past_due") && m.cancel_at_period_end !== true
}

/**
 * When a period end deletion happens: when the last paid period ends, and
 * never before now. A membership with no end on record counts as now.
 */
export function deletionDate(memberships: readonly PaidTime[], now: number = Date.now()): string {
  let last = now
  for (const m of memberships) {
    if (!stillPaid(m, now)) continue
    const end = m.current_period_end ? Date.parse(m.current_period_end) : NaN
    if (Number.isFinite(end) && end > last) last = end
  }
  return new Date(last).toISOString()
}

/**
 * The unused part of a payment, in cents: what was paid, times the share of
 * its period still to come, rounded down; never more than is still
 * refundable and never below nothing. A payment with no period on record
 * refunds nothing here (the owner can still refund it from Orders).
 */
export function proratedRefundCents(a: { paidCents: number; refundableCents: number; periodStart: string | null; periodEnd: string | null; now?: number }): number {
  const now = a.now ?? Date.now()
  const start = a.periodStart ? Date.parse(a.periodStart) : NaN
  const end = a.periodEnd ? Date.parse(a.periodEnd) : NaN
  const paid = Math.max(0, Math.round(Number(a.paidCents) || 0))
  const left = Math.max(0, Math.round(Number(a.refundableCents) || 0))
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || paid === 0 || left === 0) return 0
  if (now >= end) return 0
  const share = Math.min(1, (end - Math.max(now, start)) / (end - start))
  return Math.max(0, Math.min(left, Math.floor(paid * share)))
}

/** Whether a scheduled deletion can still be taken back. */
export function canUndoDeletion(d: { state: string; mode: string; delete_at: string }, now: number = Date.now()): boolean {
  return d.state === "scheduled" && d.mode === "period_end" && Date.parse(d.delete_at) > now
}

/** The idempotency key of a deletion's refund: one per community, membership, payment and amount, whichever run sends it. */
export function deletionRefundKey(communityId: string, membershipId: string, orderId: string, cents: number): string {
  return `storelib-community-close:${communityId}:${membershipId}:${orderId}:${cents}`.slice(0, 255)
}

/** A date the member reads in an email, in English (the member side is English), as UTC. */
export function emailDate(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN
  if (!Number.isFinite(t)) return "the end of your current period"
  return new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })
}
