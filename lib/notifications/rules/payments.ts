/**
 * ===========================================================================
 *  MONEY: WHAT STOPS A CREATOR BEING PAID
 * ===========================================================================
 * Critical, every one. They push, they are never held back by the daily
 * limit, and each resolves itself the moment it is fixed.
 *
 *   stripe_restricted        Stripe turned off card payments or payouts on
 *                            an account that had finished setting up
 *                            (creators row, kept by account.updated)
 *   stripe_requirements_due  Stripe wants more details, with a deadline,
 *                            before anything is off. Only an account.updated
 *                            webhook carries that, so the hourly run cannot
 *                            tell and leaves the row as the webhook left it
 *   payout_failed            a payout the bank sent back, until a later one
 *                            goes through
 *   dispute_opened           a dispute Stripe has not closed yet
 */
import { ageDays, money, shortDate } from "../format"
import type { Finding, Rule } from "../types"

const PAYMENTS = "/app/settings/payments"
const PAYOUTS = "/app/payouts"

export const stripeRestricted: Rule = {
  kind: "stripe_restricted",
  category: "critical",
  priority: 100,
  version: 1,
  needs: ["creator"],
  cooldownDays: 1,
  ttlDays: 90,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const c = s.creator
    if (!c) return undefined
    /* Not finished setting up is a next step (the panel's own "Set up payments"), not a problem. */
    if (!c.stripeAccountId || c.detailsSubmitted !== true) return []
    const charges = s.stripeAccount ? s.stripeAccount.chargesEnabled : c.chargesEnabled
    const payouts = s.stripeAccount ? s.stripeAccount.payoutsEnabled : c.payoutsEnabled
    if (charges === false) {
      return [
        {
          subject: "charges",
          title: "Buyers cannot pay you right now",
          message: "Stripe turned off card payments on your account. Open Payments to see what Stripe needs.",
          href: PAYMENTS,
          area: "Payments",
        },
      ]
    }
    if (payouts === false) {
      return [
        {
          subject: "payouts",
          title: "Stripe paused your payouts",
          message: "Sales still come in, but no money can reach your bank until Stripe has what it needs.",
          href: PAYMENTS,
          area: "Payouts",
        },
      ]
    }
    return []
  },
}

export const stripeRequirementsDue: Rule = {
  kind: "stripe_requirements_due",
  category: "critical",
  priority: 90,
  version: 1,
  needs: ["creator"],
  cooldownDays: 1,
  ttlDays: 30,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const a = s.stripeAccount
    if (!a) return undefined
    /* Already off: stripe_restricted says so, and one notification is enough. */
    if (!a.chargesEnabled || !a.payoutsEnabled) return []
    const due = [...a.pastDue, ...a.currentlyDue]
    if (due.length === 0) return []
    const zone = s.creator?.timeZone ?? null
    const by = a.currentDeadline ? shortDate(a.currentDeadline * 1000, zone) : null
    return [
      {
        subject: "requirements",
        title: by ? `Stripe needs more details by ${by}` : "Stripe needs more details",
        message: "Add them in Payments, or Stripe pauses your payouts.",
        pushTitle: "Stripe needs more details",
        href: PAYMENTS,
        area: "Payouts",
        data: { due: due.length, pastDue: a.pastDue.length > 0 },
      },
    ]
  },
}

/** What a payout's failure code means for the person, in their words. Stripe's own text is not shown. */
const FAILURE_WORDS: Record<string, string> = {
  account_closed: "The bank account is closed.",
  account_frozen: "The bank froze the account.",
  bank_account_restricted: "The bank account cannot take this payout.",
  bank_ownership_changed: "The bank account changed owner.",
  could_not_process: "The bank could not process it.",
  debit_not_authorized: "The bank refused it.",
  declined: "The bank declined it.",
  incorrect_account_holder_name: "The name on the bank account does not match.",
  incorrect_account_holder_type: "The bank account type does not match.",
  invalid_account_number: "The account number is not right.",
  invalid_currency: "The bank account cannot take this currency.",
  no_account: "The bank account does not exist.",
  unsupported_card: "The card cannot take payouts.",
}

export const payoutFailed: Rule = {
  kind: "payout_failed",
  category: "critical",
  priority: 95,
  version: 1,
  needs: ["payouts"],
  cooldownDays: 0,
  ttlDays: 14,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    if (!s.payouts) return undefined
    const out: Finding[] = []
    for (const p of s.payouts) {
      if (p.status !== "failed" || ageDays(p.createdAt, s.now) > 14) continue
      /* A later payout that went through, or is on its way, means it was fixed. */
      const later = s.payouts.some((q) => q.id !== p.id && Date.parse(q.createdAt) > Date.parse(p.createdAt) && (q.status === "paid" || q.status === "in_transit"))
      if (later) continue
      const why = (p.failureCode && FAILURE_WORDS[p.failureCode]) || "The bank sent it back."
      out.push({
        subject: p.id,
        period: "",
        title: `A payout of ${money(p.amountCents, p.currency)} failed`,
        message: `${why} The money is back in your balance. Check your bank details, then cash out again.`,
        pushTitle: "A payout failed",
        href: PAYOUTS,
        area: "Payouts",
      })
    }
    return out
  },
}

export const disputeOpened: Rule = {
  kind: "dispute_opened",
  category: "critical",
  priority: 92,
  version: 1,
  needs: ["disputes"],
  cooldownDays: 0,
  ttlDays: 90,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    if (!s.disputes) return undefined
    return s.disputes
      .filter((d) => !d.closed && ageDays(d.openedAt, s.now) <= 75)
      .map((d) => ({
        subject: d.id,
        period: "",
        title: `A buyer disputed a ${money(d.amountCents, d.currency)} payment`,
        message: "Stripe took the amount from your balance while the bank decides. You can send evidence through Stripe.",
        pushTitle: "A buyer opened a dispute",
        href: PAYOUTS,
        area: "Payouts",
      }))
  },
}
