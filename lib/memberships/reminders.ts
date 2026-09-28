import "server-only"

/**
 * ===========================================================================
 *  WHAT THE SCHEDULED JOB DOES FOR MEMBERSHIPS
 * ===========================================================================
 * /api/cron/memberships, every fifteen minutes:
 *
 *   RENEWAL REMINDERS. A member renewing in the next few days (three for a
 *   month, seven for a year: state.ts reminderLeadDays) is told once for
 *   that period. The key is the membership and the period end, so a run
 *   every fifteen minutes still sends one, and the next period gets its own.
 *   A trial ending is a renewal too: its first payment.
 *
 *   HALF STARTED CHECKOUTS. A membership that never got past its first
 *   payment is left by Stripe to expire after a day. A free trial whose card
 *   was never saved would instead run to its end, so after a day it is
 *   cancelled here, and the row follows.
 *
 *   ACCESS THAT RAN OUT. Access is decided when it is read (grantsAccess), so
 *   nothing needs to run for a page to be right. The products a membership
 *   included are library rows, though, and those are taken back here for a
 *   member whose past due grace has passed while Stripe is still retrying.
 *
 *   UPDATE EMAILS still waiting (lib/memberships/update-email.ts).
 */
import { stripe } from "@/lib/stripe"
import { grantsAccess, reminderLeadDays } from "./state"
import { notice, revokeIncluded, syncSubscription } from "./sync"
import { sendPendingPostEmails } from "./update-email"
import { MEMBERSHIP_COLUMNS, tableMissing, type Db, type MembershipRow } from "./server"

const DAY_MS = 86_400_000

export interface MembershipJobSummary {
  available: boolean
  reminders: number
  abandoned: number
  graceEnded: number
  emails: { sent: number; skipped: number; failed: number; left: boolean }
}

export async function runMembershipJobs(admin: Db, opts: { now?: number; budgetMs: number }): Promise<MembershipJobSummary> {
  const now = opts.now ?? Date.now()
  const started = Date.now()
  const summary: MembershipJobSummary = { available: true, reminders: 0, abandoned: 0, graceEnded: 0, emails: { sent: 0, skipped: 0, failed: 0, left: false } }

  /* Renewing soon: up to a week ahead covers both leads; each row is checked against its own. */
  const { data: renewing, error } = await admin
    .from("memberships")
    .select(MEMBERSHIP_COLUMNS)
    .in("status", ["active", "trialing"])
    .eq("cancel_at_period_end", false)
    .gt("current_period_end", new Date(now).toISOString())
    .lte("current_period_end", new Date(now + 7 * DAY_MS).toISOString())
    .limit(2000)
  if (tableMissing(error)) return { ...summary, available: false }
  for (const row of (renewing as MembershipRow[] | null) ?? []) {
    const end = Date.parse(row.current_period_end || "")
    if (!Number.isFinite(end) || end - now > reminderLeadDays(row.billing_interval) * DAY_MS) continue
    await notice(admin, row, "membership.renewal_upcoming", `membership:${row.id}:renewal:${row.current_period_end}`, { periodEnd: row.current_period_end })
    summary.reminders++
  }

  /* A day old and still waiting for its first payment or card. */
  const { data: stale } = await admin
    .from("memberships")
    .select("id, stripe_subscription_id")
    .eq("status", "incomplete")
    .lt("created_at", new Date(now - DAY_MS).toISOString())
    .limit(100)
  for (const row of (stale as { id: string; stripe_subscription_id: string }[] | null) ?? []) {
    if (Date.now() - started > opts.budgetMs / 2) break
    try {
      const sub = await stripe.subscriptions.retrieve(row.stripe_subscription_id)
      if (sub.status === "trialing" || sub.status === "incomplete") await stripe.subscriptions.cancel(sub.id)
      await syncSubscription(admin, row.stripe_subscription_id)
      summary.abandoned++
    } catch (e) {
      console.warn("[memberships] a half started checkout was not closed:", e instanceof Error ? e.message : e)
    }
  }

  /* Past due beyond the grace, or cancelled with the period over and Stripe's end not in yet: what the membership included leaves the library. */
  const [{ data: pastDue }, { data: lapsed }] = await Promise.all([
    admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("status", "past_due").lt("past_due_since", new Date(now - 7 * DAY_MS).toISOString()).limit(500),
    admin.from("memberships").select(MEMBERSHIP_COLUMNS).eq("status", "canceled").lt("current_period_end", new Date(now).toISOString()).limit(500),
  ])
  for (const row of [...((pastDue as MembershipRow[] | null) ?? []), ...((lapsed as MembershipRow[] | null) ?? [])]) {
    if (grantsAccess(row, now)) continue
    try {
      await revokeIncluded(admin, row.id)
      summary.graceEnded++
    } catch {
      /* the next run tries again */
    }
  }

  const left = Math.max(5_000, opts.budgetMs - (Date.now() - started))
  summary.emails = await sendPendingPostEmails(admin, { budgetMs: left })
  return summary
}
