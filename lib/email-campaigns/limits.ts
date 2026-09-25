/**
 * How many campaign emails a creator's plan sends in a calendar month. The
 * numbers the billing and upgrade pages already promise
 * (components/app/billing/billing-page-client.tsx): 500, 2,000 and 5,000.
 *
 * A plan that is not active (cancelled, unpaid) reads as Free, the same rule
 * the fee calculator applies (lib/billing/fee-calculator.ts).
 */
export type EmailPlan = "free" | "growth" | "pro"

export const MONTHLY_EMAILS: Record<EmailPlan, number> = {
  free: 500,
  growth: 2000,
  pro: 5000,
}

const ACTIVE = new Set(["active", "trialing", "past_due"])

export function emailPlanOf(planId: unknown, status: unknown): EmailPlan {
  if (typeof status === "string" && status && !ACTIVE.has(status.toLowerCase())) return "free"
  const id = typeof planId === "string" ? planId.toLowerCase().trim() : ""
  if (id === "growth") return "growth"
  if (id === "pro" || id === "professional") return "pro"
  return "free"
}

export function monthlyLimit(planId: unknown, status: unknown): number {
  return MONTHLY_EMAILS[emailPlanOf(planId, status)]
}

/** The first instant of this calendar month, in UTC. */
export function monthStart(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

/**
 * Whether a send of `count` fits, and the words when it does not. `used`
 * counts every address already queued or sent this month.
 */
export function fitsPlan(count: number, used: number, limit: number): { ok: true } | { ok: false; left: number; message: string } {
  const left = Math.max(0, limit - used)
  if (count <= left) return { ok: true }
  const n = (v: number) => v.toLocaleString("en-US")
  return {
    ok: false,
    left,
    message:
      left === 0
        ? `Your plan's ${n(limit)} emails for this month are used. Sending starts again on the 1st, or upgrade for more.`
        : `This would send ${n(count)} emails and your plan has ${n(left)} left this month. Pick a smaller audience or upgrade.`,
  }
}
