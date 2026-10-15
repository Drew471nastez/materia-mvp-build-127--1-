/**
 * ===========================================================================
 *  ONCE A WEEK UNTIL PAYOUTS ARE SET UP
 * ===========================================================================
 * "Every 7 days send an email to users who have not set up payouts at all,
 * and send one now to everyone who has not got Stripe."
 *
 * The other payment reminders answer a moment (setup was started, a product
 * went live) and stop after two. This one answers a state: a creator whose
 * payments cannot take a card. Each sweep (the hourly /api/cron/notifications,
 * in its SWEEP_HOUR_UTC run only) finds those creators and emits payment_setup.weekly_check for each one
 * that has not had a payout setup email in the last seven days; the workflow
 * (workflows/unfinished.ts) turns that into PAYOUT_SETUP_WEEKLY, sent at once.
 *
 *   THE FIRST SWEEP IS "NOW". Nobody has had this email before, so the first
 *     run after it ships sends one to every creator who is not set up
 *     (unless a payout setup email already reached them this week), and then
 *     every seven days after that.
 *   NEVER AFTER IT IS DONE. The registry gives the type the
 *     payment_setup_incomplete condition, read again in the seconds before it
 *     sends, so somebody who finished setup between the sweep and the send
 *     gets nothing.
 *   ONE A DAY, AT MOST, OF ANY LIFECYCLE MAIL, and an unsubscribe link in each
 *     (registry: lifecycle, optional). A deleted account gets nothing.
 *   A SWEEP THAT RUNS TWICE SENDS ONCE. The event key is the creator and the
 *     day, and so is the job's idempotency key.
 */
import { emit } from "./outbox"
import type { AdminDb } from "./store"
import { rowCanAcceptPayments } from "@/lib/payments/stripe/readiness"

export const WEEK_MS = 7 * 24 * 3600 * 1000
const PAGE = 500
/** Payout setup emails of any kind that count as "told this week". */
export const PAYOUT_NUDGES = ["PAYOUT_SETUP_WEEKLY", "PAYOUT_SETUP_UNFINISHED", "PAYOUT_SETUP_UNFINISHED_2", "PAYMENT_SETUP_REMINDER", "PAYMENT_SETUP_REMINDER_2"] as const
/** A job in one of these states did not reach anybody, so it does not count. */
const NOT_SENT = new Set(["skipped", "failed", "cancelled", "expired"])

export interface CreatorPaymentRow {
  id: string
  user_id: string | null
  stripe_account_id?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  details_submitted?: boolean | null
  stripe_onboarding_status?: string | null
  deleted_at?: string | null
}

/** Payments that can take a card and pay out, the way payment_setup_incomplete reads them (conditions.ts). */
export function paymentsComplete(c: CreatorPaymentRow): boolean {
  return rowCanAcceptPayments(c)
}

/** Whether this creator is one the weekly email is for, before asking whether they were told this week. */
export function wantsPayoutNudge(c: CreatorPaymentRow, airwallexReady: Set<string>): boolean {
  if (!c.user_id || c.deleted_at) return false
  if (airwallexReady.has(c.id)) return false
  return !paymentsComplete(c)
}

/**
 * The one hour a day the hourly cron sweeps. It swept every hour, reading
 * every creator 24 times a day for an email that goes once a week. Once a
 * day keeps the weekly rhythm: "told this week" looks back seven days less
 * an hour, so the same run a week later sends again. Changed on purpose
 * (the owner: lower Vercel costs).
 */
export const SWEEP_HOUR_UTC = 15

export function isPayoutSweepHour(now: number): boolean {
  return new Date(now).getUTCHours() === SWEEP_HOUR_UTC
}

export function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

export interface WeeklySummary {
  available: boolean
  checked: number
  emitted: number
  toldThisWeek: number
}

/**
 * One sweep. `budgetMs` stops it taking new pages when time is short; the
 * next day's sweep carries on, and creators already emitted for today are
 * skipped by the event key.
 */
export async function sweepPayoutReminders(db: AdminDb, opts: { now?: number; budgetMs?: number } = {}): Promise<WeeklySummary> {
  const now = opts.now ?? Date.now()
  const stopAt = Date.now() + (opts.budgetMs ?? 10_000)
  const day = dayOf(now)
  const since = new Date(now - WEEK_MS + 3600 * 1000).toISOString()
  const summary: WeeklySummary = { available: true, checked: 0, emitted: 0, toldThisWeek: 0 }
  const columns = "id, user_id, stripe_account_id, charges_enabled, payouts_enabled, details_submitted, stripe_onboarding_status, deleted_at"

  for (let from = 0; Date.now() < stopAt; from += PAGE) {
    let page = await db.from("creators").select(columns).order("id", { ascending: true }).range(from, from + PAGE - 1)
    /* A database without one of these columns: read the whole row, as the condition does. */
    if (page.error) page = await db.from("creators").select("*").order("id", { ascending: true }).range(from, from + PAGE - 1)
    if (page.error) {
      summary.available = false
      break
    }
    const rows = (page.data as CreatorPaymentRow[] | null) ?? []
    if (!rows.length) break
    summary.checked += rows.length

    const ids = rows.map((r) => r.id)
    const [awx, jobs] = await Promise.all([
      db.from("payment_accounts").select("creator_id, provider_account_id, lifecycle_status, payout_beneficiary_id").eq("provider", "airwallex").in("creator_id", ids),
      db.from("notification_jobs").select("creator_id, state").in("type", PAYOUT_NUDGES as unknown as string[]).in("creator_id", ids).gte("created_at", since),
    ])
    if (jobs.error) {
      /* No notification engine yet (part 40): nothing can be sent, so nothing is planned. */
      summary.available = false
      break
    }
    const airwallexReady = new Set(
      ((awx.data as { creator_id: string; provider_account_id: string | null; lifecycle_status: string | null; payout_beneficiary_id: string | null }[] | null) ?? [])
        .filter((a) => !!a.provider_account_id && a.lifecycle_status === "ACTIVE" && !!a.payout_beneficiary_id)
        .map((a) => a.creator_id),
    )
    const told = new Set(((jobs.data as { creator_id: string; state: string }[] | null) ?? []).filter((j) => !NOT_SENT.has(j.state)).map((j) => j.creator_id))

    for (const c of rows) {
      if (!wantsPayoutNudge(c, airwallexReady)) continue
      if (told.has(c.id)) {
        summary.toldThisWeek++
        continue
      }
      const r = await emit(
        {
          name: "payment_setup.weekly_check",
          key: `payment_setup.weekly_check:${c.id}:${day}`,
          userId: c.user_id,
          creatorId: c.id,
          entityType: "creator",
          entityId: c.id,
          payload: { day, started: !!c.stripe_account_id },
        },
        { db, soon: false },
      )
      if (r.ok) summary.emitted++
    }
    if (rows.length < PAGE) break
  }
  return summary
}
