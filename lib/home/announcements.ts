/**
 * ===========================================================================
 *  WHAT HOME'S BANNER SAYS, AND WHEN
 * ===========================================================================
 * "The banner with the globe should present announcements that matter,
 * based on where the user is and what he has completed."
 *
 * Every announcement here is a rule: a condition on the creator's real
 * state, a priority, and what it says. The banner shows the ones whose
 * condition holds, most important first, at most five. Nothing is ever
 * shown because it is new on our side; each one is about this store:
 *
 *   100  payouts         Stripe is not connected, so checkout is closed
 *    95  first-product   nothing to sell yet
 *    85  first-sale      the first sale came in this week
 *    80  milestone       a round number of sales or money passed this week
 *    70  upgrade-saving  on Pro the last 30 days' fees and the $29 plan would
 *                        have cost at least $10 less than Free's fees did
 *    65  share           ready to sell and nothing sold: share the link
 *    60  website         products, and no website published
 *    50  automations     sales, and no automation that emails buyers
 *    45  newsletter      a website, and nobody on the list yet
 *    40  domain          Pro, a website, and no domain of its own
 *    25  domain-pro      Free, a website, no domain: the domain is a Pro thing
 *     5  pro-offer       Free, and nothing above applies
 *     1  all-set         Pro, and nothing above applies
 *
 * The state is read, never ticked by hand, from the facts Getting started
 * reads (lib/home/progress: homeProgress for the steps, nextSetupStep for
 * the one the card names next, the subscriber and automation counts), and
 * the orders Home already holds, kept live. fromFacts turns those into the
 * state below. A count that could not be read is null, and the rule that
 * needs it stays quiet rather than guess.
 *
 * The step Getting started names next leads, whatever its priority, so the
 * banner and the card never point at two different first things.
 *
 * Pure and client safe, so tests/home-announcements.test.ts runs every rule
 * against fixture states without a browser.
 */
import { groupOrders, isSale, type OrderRow } from "../orders/order-view"
import { moneyOf } from "../analytics/reports"
import { computeApplicationFee } from "../billing/fee-calculator"
import { PRO_PRICE_CENTS } from "../billing/plans"
import { homeProgress, nextSetupStep, type ProgressFacts } from "./progress"

export type AnnouncementId =
  | "payouts"
  | "first-product"
  | "first-sale"
  | "milestone"
  | "upgrade-saving"
  | "share"
  | "website"
  | "automations"
  | "newsletter"
  | "domain"
  | "domain-pro"
  | "pro-offer"
  | "all-set"

/** How an announcement is marked: only a critical one carries a mark at all. */
export type AnnouncementTone = "critical" | "celebrate" | "next" | "tip" | "offer"

export interface Announcement {
  id: AnnouncementId
  priority: number
  tone: AnnouncementTone
  /** A few words over the title: what kind of thing this is. */
  eyebrow: string
  title: string
  /** One short line under it. */
  line: string
  /** The button. */
  cta: string
  /** Where the button goes, a page in /app. */
  href: string
  /** Instead of `href`: open the share sheet, as Getting started's first sale step does. */
  action?: "share"
}

/** The sales Home holds, boiled down to what the rules ask. */
export interface SalesSummary {
  count: number
  /** Money kept, cents: charged less refunded. */
  cents: number
  /** The first sale: when, how much, and its order's id (the address of its page). */
  first: { at: number; cents: number; id: string } | null
  /** The last 30 days, and the platform fee on them on each plan. */
  last30: { count: number; cents: number; feeFreeCents: number; feeProCents: number }
  /** The biggest round number passed in the last 7 days, if any. */
  milestone: { kind: "money" | "count"; value: number; at: number } | null
}

export interface HomeProgress {
  plan: string
  hasProduct: boolean
  hasPayouts: boolean
  websitePublished: boolean
  hasDomain: boolean
  sales: SalesSummary
  /** Everybody on the list, or null when it could not be read. */
  subscribers: number | null
  /** Automations switched on, or null when they could not be read. */
  activeAutomations: number | null
  /** The share sheet can be opened (there is an address to hand out). */
  canShare: boolean
  /** The Getting started step the card names next (lib/home/progress nextSetupStep), if any. */
  nextStep?: string | null
}

const HOUR = 3_600_000
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 30 * DAY

/** Money passed as a milestone, in cents: $100, $1,000, $10,000, $100,000. */
export const MONEY_MILESTONES = [10_000, 100_000, 1_000_000, 10_000_000]
/** Sales counted as a milestone. */
export const COUNT_MILESTONES = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]

/** Pro, under either of its ids ("growth" is the one sold, "pro" the one no longer offered). */
export function isPaidPlan(plan: string | null | undefined): boolean {
  const id = (plan ?? "free").toLowerCase().trim()
  return id === "growth" || id === "pro" || id === "professional"
}

/* ─── The sales ────────────────────────────────────────────────────────── */

/**
 * The orders boiled down, by the rules every Home and Analytics figure uses:
 * a basket is one sale, failed, pending and disputed payments are not
 * sales, and money is what was charged less what was refunded
 * (lib/orders/order-view, lib/analytics/reports).
 */
export function salesSummary(rows: OrderRow[], now: number): SalesSummary {
  const sales = groupOrders(rows)
    .filter(isSale)
    /* A sale stamped after `now` came in live after the page took its clock (or the clocks disagree a little): it happened now. */
    .map((o) => ({ id: o.id, at: Math.min(now, Date.parse(o.createdAt)), cents: moneyOf(o).net }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at)

  let cents = 0
  const last30 = { count: 0, cents: 0, feeFreeCents: 0, feeProCents: 0 }
  let moneyPassed: { value: number; at: number } | null = null
  let countPassed: { value: number; at: number } | null = null
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i]
    const before = cents
    cents += s.cents
    if (now - s.at <= MONTH) {
      last30.count++
      last30.cents += s.cents
      /* The fee is taken per payment (lib/billing/fee-calculator), so it is worked out per sale, on each plan. */
      if (s.cents > 0) {
        last30.feeFreeCents += computeApplicationFee({ unitAmount: s.cents, sellerPlan: "free" })
        last30.feeProCents += computeApplicationFee({ unitAmount: s.cents, sellerPlan: "growth" })
      }
    }
    /* A round number this sale passed, this week. The first sale is its own announcement, so it passes nothing here. */
    if (now - s.at > WEEK || i === 0) continue
    for (const m of MONEY_MILESTONES) if (before < m && cents >= m && (!moneyPassed || m > moneyPassed.value)) moneyPassed = { value: m, at: s.at }
    if (COUNT_MILESTONES.includes(i + 1) && (!countPassed || i + 1 > countPassed.value)) countPassed = { value: i + 1, at: s.at }
  }

  const first = sales[0] ? { at: sales[0].at, cents: sales[0].cents, id: sales[0].id } : null
  /* Money over count: $1,000 in sales says more than a 25th sale. */
  const milestone: SalesSummary["milestone"] = moneyPassed ? { kind: "money", ...moneyPassed } : countPassed ? { kind: "count", ...countPassed } : null
  return { count: sales.length, cents, first, last30, milestone }
}

/* ─── Words ────────────────────────────────────────────────────────────── */

/** $29, $29.50, $1,240: cents only when there are some, and never on $1,000 or more, where they are noise. */
export function money(cents: number): string {
  const whole = Math.round(cents) % 100 === 0 || Math.abs(cents) >= 100_000
  const dollars = whole ? Math.round(cents / 100) : cents / 100
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })}`
}

/** How long ago, in the words a person uses. Hours and days since, never a weekday, so it reads the same in every time zone. */
export function ago(at: number, now: number): string {
  const ms = Math.max(0, now - at)
  if (ms < HOUR) return "in the last hour"
  const hours = Math.floor(ms / HOUR)
  if (hours < 24) return hours === 1 ? "an hour ago" : `${hours} hours ago`
  const days = Math.floor(ms / DAY)
  return days === 1 ? "a day ago" : `${days} days ago`
}

/** 10th, 21st, 1,000th. */
export function ordinal(n: number): string {
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${n.toLocaleString("en-US")}${suffix}`
}

/* ─── The rules ────────────────────────────────────────────────────────── */

interface Rule {
  id: AnnouncementId
  priority: number
  applies: (p: HomeProgress, now: number) => boolean
  write: (p: HomeProgress, now: number) => Omit<Announcement, "id" | "priority">
}

const hasSale = (p: HomeProgress) => p.sales.count > 0
/**
 * A saving worth saying: on Pro the last 30 days' fees plus the plan would
 * have come to at least this much less than they did on Free. A few cents
 * is not a reason to change plans.
 */
export const REAL_SAVING_CENTS = 1000
/** What Pro would have saved over the last 30 days, the plan paid for; zero or less when it would not have. */
export function proSaving(p: HomeProgress): number {
  return p.sales.last30.feeFreeCents - p.sales.last30.feeProCents - PRO_PRICE_CENTS
}
const proSaves = (p: HomeProgress) => !isPaidPlan(p.plan) && proSaving(p) >= REAL_SAVING_CENTS

export const RULES: readonly Rule[] = [
  {
    id: "payouts",
    priority: 100,
    applies: (p) => !p.hasPayouts,
    write: (p) => ({
      tone: "critical",
      eyebrow: "Needed to sell",
      title: "Connect Stripe to get paid",
      line: p.hasProduct
        ? "Buyers can't check out until payouts are set up."
        : "Set it up now and your first product can sell the day you add it.",
      cta: "Connect Stripe",
      href: "/app/payouts",
    }),
  },
  {
    id: "first-product",
    priority: 95,
    applies: (p) => !p.hasProduct,
    write: () => ({
      tone: "next",
      eyebrow: "Start here",
      title: "Add your first product",
      line: "Upload a file, set a price, and it is ready to sell.",
      cta: "Add product",
      href: "/app/products/new",
    }),
  },
  {
    id: "first-sale",
    priority: 85,
    applies: (p, now) => !!p.sales.first && now - p.sales.first.at <= WEEK,
    write: (p, now) => {
      const first = p.sales.first!
      return {
        tone: "celebrate",
        eyebrow: "First sale",
        title: "You made your first sale",
        line: `${money(first.cents)}, ${ago(first.at, now)}. See who bought it and what they paid.`,
        cta: "View order",
        href: `/app/orders/${encodeURIComponent(first.id)}`,
      }
    },
  },
  {
    id: "milestone",
    priority: 80,
    applies: (p) => !!p.sales.milestone,
    write: (p, now) => {
      const m = p.sales.milestone!
      return {
        tone: "celebrate",
        eyebrow: "Milestone",
        title: m.kind === "money" ? `You passed ${money(m.value)} in sales` : `Your ${ordinal(m.value)} sale`,
        line: m.kind === "money"
          ? `It happened ${ago(m.at, now)}, across ${p.sales.count.toLocaleString("en-US")} sales.`
          : `It came in ${ago(m.at, now)}. ${money(p.sales.cents)} in sales so far.`,
        cta: "See analytics",
        href: "/app/analytics",
      }
    },
  },
  {
    id: "upgrade-saving",
    priority: 70,
    applies: (p) => proSaves(p),
    write: (p) => {
      const { feeFreeCents, feeProCents } = p.sales.last30
      return {
        tone: "offer",
        eyebrow: "Pro plan",
        title: `Pro would have saved you ${money(proSaving(p))}`,
        line: `Fees last 30 days: ${money(feeFreeCents)} on Free, ${money(feeProCents + PRO_PRICE_CENTS)} on Pro, plan included.`,
        cta: "See Pro",
        href: "/app/settings/billing/upgrade",
      }
    },
  },
  {
    id: "share",
    priority: 65,
    applies: (p) => p.hasProduct && p.hasPayouts && !hasSale(p) && p.canShare,
    write: () => ({
      tone: "next",
      eyebrow: "Next step",
      title: "Share your store",
      line: "Your first sale starts with the link in your bio or a post.",
      cta: "Share link",
      href: "/app",
      action: "share",
    }),
  },
  {
    id: "website",
    priority: 60,
    applies: (p) => p.hasProduct && !p.websitePublished,
    write: () => ({
      tone: "next",
      eyebrow: "Next step",
      title: "Publish your website",
      line: "Pick a theme, add your products and put your own site live.",
      cta: "Open builder",
      href: "/app/website-builder",
    }),
  },
  {
    id: "automations",
    priority: 50,
    applies: (p) => hasSale(p) && p.activeAutomations === 0,
    write: () => ({
      tone: "tip",
      eyebrow: "Emails",
      title: "Thank every buyer by email",
      line: "An automation emails every new buyer after their order.",
      cta: "Choose automation",
      href: "/app/emails/flow/new",
    }),
  },
  {
    id: "newsletter",
    priority: 45,
    applies: (p) => p.websitePublished && p.subscribers === 0,
    write: () => ({
      tone: "tip",
      eyebrow: "Emails",
      title: "Collect emails on your site",
      line: "Add a Newsletter section. Each signup lands in Emails.",
      cta: "Add section",
      href: "/app/website-builder",
    }),
  },
  {
    id: "domain",
    priority: 40,
    applies: (p) => isPaidPlan(p.plan) && p.websitePublished && !p.hasDomain,
    write: () => ({
      tone: "next",
      eyebrow: "Included in Pro",
      title: "Connect your domain",
      line: "Put your website on an address of your own, like yourname.com.",
      cta: "Connect domain",
      href: "/app/settings?tab=domains",
    }),
  },
  {
    id: "domain-pro",
    priority: 25,
    /* When Pro already pays for itself that slide says so, and a second one about Pro is one too many. */
    applies: (p) => !isPaidPlan(p.plan) && p.websitePublished && !p.hasDomain && !proSaves(p),
    write: () => ({
      tone: "offer",
      eyebrow: "Pro plan",
      title: "Put your site on yourname.com",
      line: "Your own domain comes with Pro, and so do 3% fees instead of 6%.",
      cta: "See Pro",
      href: "/app/settings/billing/upgrade",
    }),
  },
]

/** When nothing else applies: the plan's plain facts on Free, the way in to Analytics on Pro. */
const FALLBACK_FREE: Rule = {
  id: "pro-offer",
  priority: 5,
  applies: (p) => !isPaidPlan(p.plan),
  write: () => ({
    tone: "offer",
    eyebrow: "Pro plan",
    title: "Keep more of every sale",
    line: "3% fees instead of 6%, your own domain and 25 GB of storage.",
    cta: "See Pro",
    href: "/app/settings/billing/upgrade",
  }),
}
const FALLBACK_PAID: Rule = {
  id: "all-set",
  priority: 1,
  applies: (p) => isPaidPlan(p.plan),
  write: () => ({
    tone: "tip",
    eyebrow: "All set",
    title: "Your store is set up",
    line: "Analytics shows where your visitors come from and what they buy.",
    cta: "View analytics",
    href: "/app/analytics",
  }),
}

/** The most the banner cycles through. */
export const MAX_ANNOUNCEMENTS = 5

/**
 * The announcements for this state, most important first. Never empty: when
 * no rule applies, the plan's own fallback does.
 */
export function announcementsFor(p: HomeProgress, now: number, limit = MAX_ANNOUNCEMENTS): Announcement[] {
  const out: Announcement[] = []
  for (const rule of RULES) {
    if (!rule.applies(p, now)) continue
    out.push({ id: rule.id, priority: rule.priority, ...rule.write(p, now) })
  }
  if (out.length === 0) {
    const rule = FALLBACK_FREE.applies(p, now) ? FALLBACK_FREE : FALLBACK_PAID
    out.push({ id: rule.id, priority: rule.priority, ...rule.write(p, now) })
  }
  const lead = p.nextStep ? LEADS[p.nextStep] ?? [] : []
  const rank = (a: Announcement) => (lead.includes(a.id) ? 1000 : 0) + a.priority
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, Math.max(1, limit))
}

/** The announcements that say a Getting started step, by the step's id (lib/home/progress SetupStepId). */
const LEADS: Record<string, readonly AnnouncementId[]> = {
  product: ["first-product"],
  payments: ["payouts"],
  store: ["website"],
  sale: ["share"],
  domain: ["domain", "domain-pro"],
}

/* ─── From Getting started ─────────────────────────────────────────────── */

/** A Getting started step as Home builds it (components/app/home/home-cards StartStep), only what is read here. */
export interface StepLike {
  id: string
  done: boolean
  onSelect?: () => void
}

/**
 * Which Getting started steps are done, by the ids the module uses today
 * ("store" is the website; "payments" is payouts), and the older names in
 * case they come back, so a step detected better there is detected better
 * here with no change.
 */
export function stepsDone(steps: readonly StepLike[]) {
  const done = (...ids: string[]) => steps.some((s) => ids.includes(s.id) && s.done)
  return {
    hasProduct: done("product"),
    hasPayouts: done("payments", "payouts"),
    websitePublished: done("store", "website"),
    hasDomain: done("domain"),
    hasSale: done("sale"),
  }
}

/**
 * The banner's state from the facts Getting started reads (lib/home/progress)
 * and the sales worked out from the orders Home holds. The steps come from
 * homeProgress, so a step counts as done here exactly when the card ticks it.
 */
export function fromFacts(facts: ProgressFacts, sales: SalesSummary, plan: string, canShare: boolean): HomeProgress {
  const done = stepsDone(homeProgress(facts).steps)
  return {
    plan,
    hasProduct: done.hasProduct,
    hasPayouts: done.hasPayouts,
    websitePublished: done.websitePublished,
    hasDomain: done.hasDomain,
    sales,
    subscribers: facts.subscribers,
    activeAutomations: facts.automationsOn,
    canShare,
    nextStep: nextSetupStep(facts)?.id ?? null,
  }
}
