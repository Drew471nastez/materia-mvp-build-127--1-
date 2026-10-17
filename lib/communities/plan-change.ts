/**
 * ===========================================================================
 *  CHANGING PLAN: THE RULES (round AF)
 * ===========================================================================
 * A member moves between a community's plans, or between monthly and annual
 * on the same plan, from their Membership page. Pure, so the route, the
 * sheet and the tests read the same rules:
 *
 *   upgrade     more per month than now: the difference for the rest of the
 *               period is charged at once (Stripe's always_invoice), and the
 *               new plan starts now.
 *   downgrade   less per month: the new plan starts now and the unused part
 *               of the old one is a credit on the next invoice
 *               (create_prorations). Nothing is refunded to the card.
 *   interval    monthly to annual or back: Stripe starts a new billing period
 *               today, so it is invoiced now with the unused time credited
 *               (always_invoice either way).
 *   trial       during a free trial nothing is charged or credited; the
 *               trial keeps its end date and the new price applies after it.
 *
 * The amounts the member sees come from Stripe's own invoice preview, never
 * from arithmetic here.
 */

export type PlanInterval = "month" | "year"
export type ChangeKind = "upgrade" | "downgrade" | "interval" | "same"
export type Proration = "always_invoice" | "create_prorations" | "none"

/** What a plan costs per month, so a yearly and a monthly price compare. */
export function perMonth(amountCents: number, interval: PlanInterval): number {
  return interval === "year" ? amountCents / 12 : amountCents
}

export function changeKind(from: { productId: string; amountCents: number; interval: PlanInterval }, to: { productId: string; amountCents: number; interval: PlanInterval }): ChangeKind {
  if (from.productId === to.productId && from.interval === to.interval) return "same"
  if (from.interval !== to.interval) return "interval"
  return perMonth(to.amountCents, to.interval) > perMonth(from.amountCents, from.interval) ? "upgrade" : "downgrade"
}

export function prorationFor(kind: ChangeKind, trialing: boolean): Proration {
  if (trialing || kind === "same") return "none"
  return kind === "downgrade" ? "create_prorations" : "always_invoice"
}

/** Statuses a plan can be changed from: paying or trialing, and not already set to end. */
export function canChangePlan(m: { status: string; cancel_at_period_end?: boolean | null } | null | undefined): boolean {
  return !!m && (m.status === "active" || m.status === "trialing") && m.cancel_at_period_end !== true
}

/** Stripe's preview line: a proration line, whichever API version wrote it. */
type PreviewLine = { amount?: number | null; proration?: boolean | null; parent?: { subscription_item_details?: { proration?: boolean | null } | null } | null }
export function isProrationLine(l: PreviewLine): boolean {
  return l.proration === true || l.parent?.subscription_item_details?.proration === true
}

/**
 * From Stripe's preview: what is paid now, and what is left as credit.
 * always_invoice: the preview is the invoice made now.
 * create_prorations: the preview is the next invoice; its proration lines
 * are the credit (or the extra) it carries.
 */
export function previewAmounts(proration: Proration, preview: { amount_due?: number | null; total?: number | null; lines?: { data?: PreviewLine[] } | null }): { dueNowCents: number; creditCents: number } {
  if (proration === "none") return { dueNowCents: 0, creditCents: 0 }
  if (proration === "always_invoice") {
    return { dueNowCents: Math.max(0, preview.amount_due ?? 0), creditCents: Math.max(0, -(preview.total ?? 0)) }
  }
  const net = (preview.lines?.data ?? []).filter(isProrationLine).reduce((s, l) => s + (l.amount ?? 0), 0)
  return { dueNowCents: 0, creditCents: Math.max(0, -net) }
}

/** When the new price is next charged: after the trial, a new period from today, or the current period's end. */
export function nextChargeAt(kind: ChangeKind, interval: PlanInterval, m: { status: string; trial_end?: string | null; current_period_end?: string | null }, now = new Date()): string | null {
  if (m.status === "trialing") return m.trial_end ?? m.current_period_end ?? null
  if (kind === "interval") {
    const d = new Date(now)
    const day = d.getDate()
    d.setDate(1)
    if (interval === "year") d.setFullYear(d.getFullYear() + 1)
    else d.setMonth(d.getMonth() + 1)
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
    return d.toISOString()
  }
  return m.current_period_end ?? null
}

/** Per product: paying now, on a free trial now, trials that have ended, and of those the ones paying now. */
export function subscriberCounts(rows: { product_id: string; status: string; trial_end: string | null }[], now = Date.now()): Map<string, { paying: number; trialing: number; trialsEnded: number; trialsConverted: number }> {
  const out = new Map<string, { paying: number; trialing: number; trialsEnded: number; trialsConverted: number }>()
  for (const r of rows) {
    const c = out.get(r.product_id) ?? { paying: 0, trialing: 0, trialsEnded: 0, trialsConverted: 0 }
    const paying = r.status === "active" || r.status === "past_due"
    if (r.status === "trialing") c.trialing++
    else if (paying) c.paying++
    const ended = !!r.trial_end && Date.parse(r.trial_end) <= now && r.status !== "trialing"
    if (ended) {
      c.trialsEnded++
      if (paying) c.trialsConverted++
    }
    out.set(r.product_id, c)
  }
  return out
}
