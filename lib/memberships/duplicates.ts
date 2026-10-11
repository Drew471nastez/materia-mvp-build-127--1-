/**
 * ===========================================================================
 *  A SECOND MEMBERSHIP OF THE SAME THING, SETTLED AFTER PAYMENT
 * ===========================================================================
 * The checkout (app/api/memberships/checkout) used to answer a guest "You
 * are already a member" for whatever email they typed, so anybody could
 * learn whether an address belonged to a creator's members. It no longer
 * looks a guest up by email before payment. A signed in member is still sent
 * to Manage before they pay (app/checkout/page.tsx, and the route refuses).
 *
 * So a guest who is already a member, under the same email, can start a
 * second subscription of the same membership. It is settled here, on the
 * server, the moment the second one gets access (lib/memberships/sync, the
 * one place every path goes through: the checkout's confirm, the webhook,
 * the scheduled job):
 *
 *   which      of two memberships of one product held by one buyer (the
 *              same account, or the same email), the one that got access
 *              LATER is the duplicate; a tie goes by id. Both sides of a race
 *              therefore pick the same one, and the original is never touched
 *   what       the duplicate's subscription is marked (`duplicate_of`) and
 *              cancelled at once, its first payment refunded in full with
 *              the creator's share reversed (one refund, by its own
 *              idempotency key), and its row written as Stripe has it, with
 *              none of a new member's effects (no welcome, no library rows)
 *   who hears  the buyer, by email, at the address on the membership: "You
 *              were already a member, this payment is refunded, manage it
 *              here". Only the call that did the cancelling sends it
 *   the page   the checkout's confirm answers as it does for any member, so
 *              the screen shows nothing a stranger could learn from
 *
 * Paying for it is the only way to reach this, and it is refunded, so it is
 * not a way to ask about an address either: the answer goes to the address.
 */
import type Stripe from "stripe"
import { grantsAccess, fieldsFromSubscription } from "./state"
import { MEMBERSHIP_COLUMNS, siteUrl, type Db, type MembershipRow } from "./server"

type Row = Pick<MembershipRow, "id" | "product_id" | "buyer_id" | "buyer_email" | "status" | "current_period_end" | "past_due_since" | "started_at" | "created_at">

const at = (iso: string | null | undefined): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY
}

/** Whether these two are the same buyer: the same account, or the same address. */
export function sameBuyer(a: Pick<Row, "buyer_id" | "buyer_email">, b: Pick<Row, "buyer_id" | "buyer_email">): boolean {
  if (a.buyer_id && b.buyer_id && a.buyer_id === b.buyer_id) return true
  const ea = (a.buyer_email || "").trim().toLowerCase()
  const eb = (b.buyer_email || "").trim().toLowerCase()
  return !!ea && ea === eb && !ea.endsWith("@storelib.invalid")
}

/**
 * The membership `row` duplicates, or null. Pure. The original is another
 * membership of the same product, of the same buyer, with access now, that
 * got access first (by started_at, then created_at, then id).
 */
export function originalOf(row: Row, others: readonly Row[], now: number = Date.now()): Row | null {
  if (!row.product_id || !grantsAccess(row, now)) return null
  const key = (r: Row) => [at(r.started_at), at(r.created_at), r.id] as const
  const before = (a: Row, b: Row) => {
    const [x, y] = [key(a), key(b)]
    return x[0] !== y[0] ? x[0] < y[0] : x[1] !== y[1] ? x[1] < y[1] : x[2] < y[2]
  }
  const firsts = others.filter((o) => o.id !== row.id && o.product_id === row.product_id && sameBuyer(o, row) && grantsAccess(o, now) && before(o, row))
  firsts.sort((a, b) => (before(a, b) ? -1 : 1))
  return firsts[0] ?? null
}

function likeExact(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

/** The buyer's other memberships of this product, by account and by address. */
export async function otherMemberships(admin: Db, row: Row): Promise<Row[]> {
  if (!row.product_id) return []
  const reads: Promise<Row[]>[] = []
  const email = (row.buyer_email || "").trim().toLowerCase()
  if (email && !email.endsWith("@storelib.invalid")) {
    reads.push(Promise.resolve(admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", row.product_id).ilike("buyer_email", likeExact(email)).limit(20)).then((r: { data?: Row[] | null }) => r?.data ?? []))
  }
  if (row.buyer_id) {
    reads.push(Promise.resolve(admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("product_id", row.product_id).eq("buyer_id", row.buyer_id).limit(20)).then((r: { data?: Row[] | null }) => r?.data ?? []))
  }
  const seen = new Map<string, Row>()
  for (const r of (await Promise.all(reads)).flat()) seen.set(r.id, r)
  return [...seen.values()]
}

export interface DuplicateDeps {
  /** Puts `duplicate_of` on the subscription, then cancels it now. True when this call cancelled it. */
  cancel: (subscriptionId: string, originalId: string) => Promise<boolean>
  /** Refunds the subscription's first payment in full, once (an idempotency key of its own). */
  refundFirstPayment: (sub: Stripe.Subscription) => Promise<void>
  retrieve: (subscriptionId: string) => Promise<Stripe.Subscription>
  /** Tells the buyer, at the membership's own address. */
  tell: (row: MembershipRow, original: Row) => Promise<void>
}

/**
 * Settles `row` as a duplicate of `original`: cancelled, refunded, the
 * buyer told, the row written as Stripe has it now, with no member effects.
 * Returns the row as written.
 */
export async function settleDuplicate(admin: Db, sub: Stripe.Subscription, row: MembershipRow, original: Row, deps: DuplicateDeps, now: number = Date.now()): Promise<MembershipRow> {
  let cancelledHere = false
  try {
    cancelledHere = await deps.cancel(sub.id, original.id)
  } catch (e) {
    console.error(`[memberships] duplicate ${row.id} not cancelled:`, e instanceof Error ? e.message : e)
  }
  try {
    await deps.refundFirstPayment(sub)
  } catch (e) {
    console.error(`[memberships] duplicate ${row.id} not refunded:`, e instanceof Error ? e.message : e)
  }
  let latest: Stripe.Subscription = sub
  try {
    latest = await deps.retrieve(sub.id)
  } catch {
    /* the row keeps what it had; the webhook brings it up to date */
  }
  const fields = fieldsFromSubscription(latest as never, row, now)
  const { data } = await admin
    .from("memberships")
    .update({ ...fields, synced_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() })
    .eq("id", row.id)
    .select(MEMBERSHIP_COLUMNS)
    .single()
  const written = (data as MembershipRow | null) ?? row
  if (cancelledHere) {
    try {
      await deps.tell(written, original)
    } catch (e) {
      console.error(`[memberships] duplicate ${row.id}: the buyer was not emailed:`, e instanceof Error ? e.message : e)
    }
  }
  return written
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)

/** The email: plain and short, to the membership's own address. */
export function duplicateEmail(row: Pick<MembershipRow, "title">, manageUrl: string): { subject: string; html: string; text: string } {
  const title = (row.title || "this membership").slice(0, 120)
  const subject = `You're already a member of ${title}`
  const text = `You're already a member of ${title}, so we cancelled the new membership you just started and refunded its payment in full. Nothing else changes: your membership carries on as before.\n\nManage your membership: ${manageUrl}\n\nThe refund shows on your statement in 5 to 10 days.`
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;font-size:15px;line-height:1.55;color:#1a1a2e;max-width:520px"><p style="margin:0 0 12px">You're already a member of <strong>${escape(title)}</strong>, so we cancelled the new membership you just started and refunded its payment in full. Nothing else changes: your membership carries on as before.</p><p style="margin:0 0 16px"><a href="${escape(manageUrl)}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:9px;font-weight:600">Manage your membership</a></p><p style="margin:0;color:#6b7280;font-size:13px">The refund shows on your statement in 5 to 10 days.</p></div>`
  return { subject, html, text }
}

/** The live dependencies: Stripe and the mailer. */
export function defaultDuplicateDeps(): DuplicateDeps {
  return {
    cancel: async (subscriptionId, originalId) => {
      const { stripe } = await import("@/lib/stripe")
      const current = await stripe.subscriptions.retrieve(subscriptionId)
      if (current.status === "canceled" || current.status === "incomplete_expired") return false
      await stripe.subscriptions.update(subscriptionId, { metadata: { ...(current.metadata ?? {}), duplicate_of: originalId } })
      try {
        await stripe.subscriptions.cancel(subscriptionId, { prorate: false })
        return true
      } catch (e) {
        /* Cancelled a moment ago by the other path (the webhook and the confirm race): theirs told the buyer. */
        const again = await stripe.subscriptions.retrieve(subscriptionId).catch(() => null)
        if (again?.status === "canceled") return false
        throw e
      }
    },
    refundFirstPayment: async (sub) => {
      const { stripe } = await import("@/lib/stripe")
      const invoiceId = typeof sub.latest_invoice === "string" ? sub.latest_invoice : sub.latest_invoice?.id
      if (!invoiceId) return
      const payments = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 10 })
      const paid = payments.data.find((p) => p.status === "paid" && p.payment?.type === "payment_intent")
      const pi = paid?.payment?.payment_intent
      const id = typeof pi === "string" ? pi : pi?.id
      if (!id) return /* a trial: nothing was charged */
      await stripe.refunds.create(
        { payment_intent: id, reason: "duplicate", reverse_transfer: true, refund_application_fee: true, metadata: { membership_duplicate_of: sub.metadata?.duplicate_of ?? "", subscription_id: sub.id } },
        { idempotencyKey: `membership-duplicate:${sub.id}` },
      )
    },
    retrieve: async (subscriptionId) => {
      const { retrieveSubscription } = await import("./sync")
      return retrieveSubscription(subscriptionId)
    },
    tell: async (row, original) => {
      if (!row.buyer_email || row.buyer_email.endsWith("@storelib.invalid")) return
      const { sendEmail } = await import("@/lib/mail")
      const mail = duplicateEmail(row, siteUrl(`/account/library/memberships/${encodeURIComponent(original.id)}`))
      await sendEmail({ to: row.buyer_email, subject: mail.subject, html: mail.html, text: mail.text })
    },
  }
}
