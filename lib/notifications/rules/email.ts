/**
 * ===========================================================================
 *  EMAIL: SENDING THAT IS AT RISK, SENDS THAT FAILED, A LIST GOING QUIET
 * ===========================================================================
 *   email_bounce_rate      critical: 5% or more of the last 30 days'
 *                          campaign messages bounced or were marked spam,
 *                          over at least 100 sent. Mail providers start
 *                          refusing a sender around there.
 *   campaign_failed        a problem: a scheduled campaign that failed, or
 *                          reached only part of its list, in the last two
 *                          weeks. Resolved when it is sent again.
 *   subscribers_not_emailed  an opportunity: 25 or more subscribers and
 *                          nothing sent to them in 30 days.
 *   checkout_reminder_off  an opportunity: three or more people who agreed
 *                          to emails left checkout this week, and the
 *                          checkout reminder is not on.
 */
import { ageDays, clip, plural, weekKey, monthKey } from "../format"
import type { Finding, Rule } from "../types"

/** The share of messages that bounce or complain at which a sender is at risk. */
export const BOUNCE_LIMIT = 0.05
/** Fewer messages than this say nothing reliable about a list. */
export const BOUNCE_MIN_SENT = 100
export const QUIET_LIST_MIN = 25
export const QUIET_DAYS = 30
export const RECOVERABLE_MIN = 3

export const emailBounceRate: Rule = {
  kind: "email_bounce_rate",
  category: "critical",
  priority: 80,
  version: 1,
  needs: ["emailHealth"],
  cooldownDays: 3,
  ttlDays: 30,
  resolveWhenGone: true,
  push: true,
  evaluate(s) {
    const h = s.emailHealth
    if (!h) return undefined
    if (h.wentOut < BOUNCE_MIN_SENT) return []
    const rate = (h.bounced + h.complained) / h.wentOut
    if (rate < BOUNCE_LIMIT) return []
    const pct = Math.round(rate * 1000) / 10
    return [
      {
        subject: "list",
        period: weekKey(s.now),
        title: `${pct}% of your recent emails bounced`,
        message: "Mail providers start blocking a sender above 5%. Addresses that bounced are off your list now. If you imported contacts, check that list before your next email.",
        pushTitle: "Too many of your emails bounced",
        href: "/app/emails?tab=subscribers",
        area: "Emails",
        data: { sent: h.wentOut, bounced: h.bounced, complained: h.complained },
      },
    ]
  },
}

export const campaignFailed: Rule = {
  kind: "campaign_failed",
  category: "problem",
  priority: 70,
  version: 1,
  needs: ["campaigns"],
  cooldownDays: 0,
  ttlDays: 14,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.failedCampaigns) return undefined
    return s.failedCampaigns
      .filter((c) => ageDays(c.scheduledAt ?? c.createdAt, s.now) <= 14)
      .map((c): Finding => {
        const name = `“${clip(c.subject || "Your email", 44)}”`
        const partly = c.status === "partially_failed"
        return {
          subject: c.id,
          period: "",
          title: partly ? `${name} reached only part of your list` : `${name} did not send`,
          message: partly ? "Some addresses were not sent to. Open it to see which, and send to the rest." : "Nobody on your list got it. Open it to see why and send it again.",
          href: `/app/emails?email=${encodeURIComponent(c.id)}`,
          area: "Emails",
        }
      })
  },
}

export const subscribersNotEmailed: Rule = {
  kind: "subscribers_not_emailed",
  category: "opportunity",
  priority: 40,
  version: 1,
  needs: ["creator", "subscribers", "campaigns"],
  cooldownDays: 30,
  ttlDays: 14,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    if (!s.subscribers || s.lastCampaignSentAt === undefined || !s.creator) return undefined
    const n = s.subscribers.count
    if (n < QUIET_LIST_MIN) return []
    /* A new account has had no time to write to anyone yet. */
    if (ageDays(s.creator.createdAt, s.now) < QUIET_DAYS) return []
    const since = ageDays(s.lastCampaignSentAt, s.now)
    if (since < QUIET_DAYS) return []
    const never = s.lastCampaignSentAt === null
    return [
      {
        subject: "list",
        period: monthKey(s.now),
        title: never ? `${plural(n, "subscriber", "subscribers")} and no email sent yet` : `${plural(n, "subscriber", "subscribers")} have not heard from you in ${Math.floor(since)} days`,
        message: "A short note about what is new is often enough to bring buyers back.",
        href: "/app/emails/new",
        area: "Emails",
        data: { subscribers: n },
      },
    ]
  },
}

export const checkoutReminderOff: Rule = {
  kind: "checkout_reminder_off",
  category: "opportunity",
  priority: 55,
  version: 1,
  needs: ["recovery"],
  cooldownDays: 14,
  ttlDays: 7,
  resolveWhenGone: true,
  push: false,
  evaluate(s) {
    const r = s.recovery
    if (!r) return undefined
    if (r.reminderOn || r.recoverable < RECOVERABLE_MIN) return []
    return [
      {
        subject: "checkout",
        period: weekKey(s.now),
        title: `${r.recoverable} buyers left checkout this week`,
        message: "They agreed to hear from you, so a checkout reminder can bring them back an hour later. It is off.",
        href: r.flowId ? `/app/emails/flow/${encodeURIComponent(r.flowId)}` : "/app/emails/flow/new",
        area: "Checkout",
        data: { recoverable: r.recoverable },
      },
    ]
  },
}
