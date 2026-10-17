/**
 * The Change plan sheet's words (round AG): what the member reads before confirming, and the button. Pure, so the tests
 * read them without loading Stripe.
 */
import { formatDay, formatMoney } from "@/lib/communities/membership-policy"
import type { ChangeKind, PlanInterval } from "@/lib/communities/plan-change"

export interface PlanPreview {
  kind: ChangeKind
  toName: string
  interval: PlanInterval
  amountCents: number
  currency: string
  dueNowCents: number
  creditCents: number
  nextChargeAt: string | null
  trialing: boolean
}

/** What the member reads before confirming, from the preview's numbers. */
export function previewSentence(p: PlanPreview, locale = "en-US"): string {
  const m = (c: number) => formatMoney(c, p.currency, locale)
  const per = p.interval === "year" ? "year" : "month"
  const then = `${m(p.amountCents)}/${per}${p.nextChargeAt ? ` from ${formatDay(p.nextChargeAt, locale)}` : ""}`
  if (p.trialing) return `Your free trial carries on. Nothing is charged today, then ${then}.`
  const credit = p.creditCents > 0 ? ` ${m(p.creditCents)} for the time you have not used comes off your next bill.` : ""
  if (p.dueNowCents > 0) return `You pay ${m(p.dueNowCents)} today, the difference for the rest of this period.${credit} Then ${then}.`
  return `Nothing to pay today.${credit} Then ${then}.`
}

export function confirmLabel(kind: ChangeKind, name: string, interval: PlanInterval): string {
  if (kind === "upgrade") return `Upgrade to ${name}`
  if (kind === "interval") return interval === "year" ? "Switch to annual" : "Switch to monthly"
  return `Switch to ${name}`
}
