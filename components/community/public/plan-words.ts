/**
 * The words and numbers a community's plans are sold with: the card's price,
 * its button, the trial's end and the next charge. Pure, so the Select your
 * plan page, the community's checkout, the sales page and the tests all read
 * the same lines (round AF). Nothing here loads Stripe.
 */
import { money as moneyOf } from "@/lib/memberships/state"
import type { JoinOption } from "./types"

export type PlanInterval = "month" | "year"

/* ── Pure: words and numbers, the same on every surface ─────────────────── */

/** The intervals a paid plan can be bought on, monthly first. */
export function planIntervals(o: Pick<JoinOption, "checkout" | "monthlyCents" | "yearlyCents">): PlanInterval[] {
  const c = o.checkout
  return [c?.month && o.monthlyCents ? "month" : null, c?.year && o.yearlyCents ? "year" : null].filter(Boolean) as PlanInterval[]
}

/** The price a card leads with: the monthly one where there is one. */
export function cardPrice(o: JoinOption): { amount: string; per: string | null } {
  if (o.kind === "free") return { amount: "Free", per: null }
  if (o.billing === "recurring") {
    if (o.monthlyCents) return { amount: moneyOf(o.monthlyCents, o.currency), per: "/month" }
    if (o.yearlyCents) return { amount: moneyOf(o.yearlyCents, o.currency), per: "/year" }
  }
  if (o.priceCents) return { amount: moneyOf(o.priceCents, o.currency), per: null }
  return { amount: o.priceLine || "", per: null }
}

/** A plan card's button: "Join free", "Start 7-day free trial", "Join $24/month", "Join $249". */
export function planButton(o: JoinOption, trialDays = o.trialDays ?? 0): string {
  if (o.kind === "free") return "Join free"
  if (trialDays > 0) return `Start ${trialDays}-day free trial`
  const p = cardPrice(o)
  return `Join ${p.amount}${p.per ?? ""}`
}

/** "Oct 24, 2026": when a trial that starts today ends. */
export function trialEnds(days: number, from = Date.now()): string {
  return new Date(from + days * 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** "Nov 17, 2026": the next charge of a plan paid today, a calendar month or year on. */
export function nextCharge(per: PlanInterval, from = new Date()): string {
  const d = new Date(from)
  /* Clamped to the month's last day, as Stripe bills it: Jan 31 renews Feb 28 (or 29), never Mar 3. */
  const day = d.getDate()
  d.setDate(1)
  if (per === "year") d.setFullYear(d.getFullYear() + 1)
  else d.setMonth(d.getMonth() + 1)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

/** Several plans, as one line: "Free" when one is free, else the cheapest, "From $9/month". */
export function plansPrice(plans: JoinOption[]): { amount: string; per: string | null } | null {
  if (plans.length < 2) return null
  if (plans.some((p) => p.kind === "free")) return { amount: "Free", per: `or ${plans.length - 1} paid ${plans.length - 1 === 1 ? "plan" : "plans"}` }
  const monthly = (p: JoinOption) => p.monthlyCents ?? (p.yearlyCents ? p.yearlyCents / 12 : p.priceCents ?? Infinity)
  const cheapest = [...plans].sort((a, b) => monthly(a) - monthly(b))[0]
  const c = cardPrice(cheapest)
  return { amount: `From ${c.amount}`, per: c.per }
}
