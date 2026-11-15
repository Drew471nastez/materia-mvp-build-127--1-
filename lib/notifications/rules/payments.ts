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
 *   verification_unfinished  setup was begun and the identity check was never
 *                            finished, so payments cannot turn on. Whether
 *                            anything is published or not: the account is
 *                            half open, and the one thing left is the ID
 *   payout_failed            a payout the bank sent back, until a later one
 *                            goes through
 *   dispute_opened           a dispute Stripe has not closed yet
 *   payouts_not_connected    something paid is published and checkout
 *                            cannot take a card: Stripe never connected,
 *                            connected but onboarding left unfinished, or
 *                            finished and still not switched on
 *   pro_payment_failed       the card on the Pro plan was declined, so every
 *                            sale is charged Free plan fees until it is paid
 *
 * GETTING PAID BEFORE THERE IS ANYTHING TO SELL. Home's banner leads with
 * "Connect Stripe to get paid" whenever Stripe is not connected
 * (lib/home/announcements.ts, "payouts"), and the panel draws the same thing
 * as its own "Set up payments" to-do, which cannot be put away
 * (lib/notifications/unread-state.ts STAYS_UNTIL_DONE). That is a next step
 * while nothing is for sale. The moment a paid product is published it is a
 * stop: buyers reach checkout and it refuses them ("This shop cannot take
 * payments yet"). That is payouts_not_connected, critical, and while it is
 * open the to-do steps aside for it (COVERS_PAYMENT_SETUP).
 */
import { ageDays, money, productName, shortDate } from "../format"
import type { CreatorFacts, Finding, ProductFacts, Rule, StripeAccountFacts } from "../types"

const PAYMENTS = "/app/settings/payments"
const PAYOUTS = "/app/payouts"

export const stripeRestricted: Rule = {
  kind: "stripe_restricted",
  category: "critical",
  priority: 100,
  version: 1,
  needs: ["creator", "sales"],
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
    if (charges !== false && payouts !== false) return []
    /* Stripe is still checking a new account: nothing to do but wait. */
    if (s.stripeAccount?.disabledReason === "requirements.pending_verification") return []
    /* Off on an account that never sold is Stripe finishing its checks after
       onboarding, which "Set up payments" covers; off on one that sold is a
       stop. Stripe's own reason, from a webhook, is enough either way. */
    const sold = s.sales ? s.sales.times.length > 0 || s.sales.truncated : undefined
    if (!s.stripeAccount?.disabledReason) {
      if (sold === undefined) return undefined
      if (!sold) return []
    }
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
          message: "Sales still come in, but nothing reaches your bank until Stripe has what it needs.",
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
    /* Still setting up: Stripe lists everything as due until then, and the panel's own "Set up payments" says it. */
    if (s.creator?.detailsSubmitted !== true) return []
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

/**
 * SETUP BEGUN, IDENTITY NEVER FINISHED. A creator who entered their details,
 * reached Stripe's identity step and stopped has an account that can take
 * nothing: no charges, no payouts. The emails for it go out on day 2 and day
 * 7 (lib/notify/workflows/unfinished), and this is the same thing in the
 * app, so it is on the bell and the panel rather than only in an inbox.
 *
 * It does not wait for a published product (payouts_not_connected is the one
 * that does), because the work is the same either way and finding out on the
 * day of a first sale is finding out too late. It waits a day: people stop
 * to find a passport and come back on their own.
 */
export const verificationUnfinished: Rule = {
  kind: "verification_unfinished",
  category: "critical",
  priority: 94,
  version: 1,
  needs: ["creator"],
  cooldownDays: 3,
  ttlDays: 60,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const c = s.creator
    if (!c) return undefined
    if (!c.stripeAccountId) return []
    /* Finished, or Stripe is checking what was sent: nothing for the creator to do. */
    if (c.detailsSubmitted === true) return []
    if (s.stripeAccount?.disabledReason === "requirements.pending_verification") return []
    if (canTakePayments(c, s.stripeAccount)) return []
    /* The first day belongs to the person: most finish it themselves. The account's own age is the closest date the rules hold. */
    if (ageDays(c.createdAt, s.now) < 1) return []
    return [
      {
        subject: "identity",
        title: "Verify your identity to get paid",
        message: "You started setting up payments and the identity check is not finished. Until it is, buyers cannot check out and nothing can reach your bank.",
        pushTitle: "Finish verifying your identity",
        href: PAYOUTS,
        area: "Payments",
      },
    ]
  },
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
        title: money(p.amountCents, p.currency) ? `A payout of ${money(p.amountCents, p.currency)} failed` : "A payout failed",
        message: `${why} Update your bank details, then cash out again.`,
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
        title: money(d.amountCents, d.currency) ? `A buyer disputed a ${money(d.amountCents, d.currency)} payment` : "A buyer disputed a payment",
        message: "Your share of the sale is held while the buyer's bank decides. Storelib answers the bank; add your evidence on Payouts.",
        pushTitle: "A buyer opened a dispute",
        href: PAYOUTS,
        area: "Payouts",
      }))
  },
}

/**
 * Whether checkout would take a card for this creator, asked the way
 * app/api/checkout/cart and stripe-session ask it: a Stripe account, card
 * payments and payouts not off, and onboarding "connected". A webhook's
 * account wins over the stored switches. Where the onboarding status was
 * not read (an older snapshot), both switches on is enough, as
 * lib/home/progress paymentsReadyFrom counts it.
 */
export function canTakePayments(c: CreatorFacts, account?: StripeAccountFacts): boolean {
  if (!c.stripeAccountId || !c.stripeAccountId.startsWith("acct_")) return false
  const charges = account ? account.chargesEnabled : c.chargesEnabled
  const payouts = account ? account.payoutsEnabled : c.payoutsEnabled
  if (charges === false || payouts === false) return false
  if (c.onboardingStatus !== undefined) return c.onboardingStatus === "connected"
  return charges === true && payouts === true
}

/** A product a buyer pays for, so it needs Stripe. A price that was not read counts as paid. */
export function isPaidProduct(p: Pick<ProductFacts, "priceCents" | "payWhatYouWant">): boolean {
  if (p.payWhatYouWant === true) return true
  return typeof p.priceCents !== "number" || p.priceCents > 0
}

export const payoutsNotConnected: Rule = {
  kind: "payouts_not_connected",
  category: "critical",
  priority: 98,
  version: 1,
  needs: ["creator", "products", "sales"],
  cooldownDays: 1,
  ttlDays: 90,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const c = s.creator
    if (!c || !s.products) return undefined
    const selling = s.products.filter((p) => p.status === "published" && isPaidProduct(p))
    /* Nothing for sale that needs a card: the panel's own "Set up payments" to-do says it. */
    if (selling.length === 0) return []
    if (canTakePayments(c, s.stripeAccount)) return []
    const live = selling.length === 1 ? `${productName(selling[0].title)} is live` : `Your ${selling.length} products are live`
    /* Each stage its own subject: finishing onboarding is news after connecting was said. */
    if (!c.stripeAccountId) {
      return [
        {
          subject: "connect",
          title: "Connect Stripe to get paid",
          message: `${live}, but buyers cannot check out until Stripe is connected.`,
          href: PAYMENTS,
          area: "Payments",
          data: { live: selling.length },
        },
      ]
    }
    if (c.detailsSubmitted !== true) {
      return [
        {
          subject: "finish",
          title: "Finish setting up Stripe to get paid",
          message: `You started connecting Stripe and did not finish. ${live}, but buyers cannot check out until you do.`,
          href: PAYMENTS,
          area: "Payments",
          data: { live: selling.length },
        },
      ]
    }
    /* The details are in and Stripe has not switched payments on. Stripe
       checking them is a wait of minutes with nothing to do. Switched off on
       an account that sold is stripe_restricted's to say ("Buyers cannot pay
       you right now"): one notification about it is enough. */
    if (s.stripeAccount?.disabledReason === "requirements.pending_verification") return []
    const restricted = stripeRestricted.evaluate(s)
    if (restricted === undefined) return undefined
    if (restricted.length > 0) return []
    return [
      {
        subject: "review",
        title: "Stripe has not turned on payments yet",
        message: `${live}, but buyers cannot check out until it does. Open Payments to see if Stripe needs anything else.`,
        href: PAYMENTS,
        area: "Payments",
        data: { live: selling.length },
      },
    ]
  },
}

/** A Pro plan: anything but Free (lib/billing/plans; "growth" is the one sold, "pro" the older id). */
const onPaidPlan = (plan: string | null | undefined) => !!plan && plan.toLowerCase().trim() !== "free"
/** Stripe's states for a subscription whose last invoice was not paid. */
const UNPAID_STATUSES = new Set(["past_due", "unpaid"])

/**
 * The Pro plan's card was declined (invoice.payment_failed sets
 * subscription_status "past_due"). lib/billing/fee-calculator only honours a
 * paid plan while it is active or trialing, so from that moment every sale
 * pays Free plan fees: money the creator does not get. Resolved when the
 * status is active again, or the plan goes back to Free.
 */
export const proPaymentFailed: Rule = {
  kind: "pro_payment_failed",
  category: "critical",
  priority: 88,
  version: 1,
  needs: ["creator"],
  cooldownDays: 1,
  ttlDays: 45,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const c = s.creator
    if (!c || c.subscriptionStatus === undefined || c.subscriptionPlan === undefined) return undefined
    if (!onPaidPlan(c.subscriptionPlan) || !UNPAID_STATUSES.has(String(c.subscriptionStatus ?? ""))) return []
    return [
      {
        subject: "subscription",
        title: "Your plan payment did not go through",
        message: "Update your card in Billing. Until it is paid, your sales are charged Free plan fees.",
        href: "/app/settings/billing",
        area: "Billing",
      },
    ]
  },
}
