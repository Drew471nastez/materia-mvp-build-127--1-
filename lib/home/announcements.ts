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
 * banner and the card never point at two different first things. News this
 * week (a first sale, a milestone) still comes before it: it is the one
 * thing that will not be true next week.
 *
 * Pure and client safe, so tests/home-announcements.test.ts runs every rule
 * against fixture states without a browser.
 */
import type { HomePaymentsState } from "@/lib/payments/stripe/readiness"
import { groupOrders, isSale, type OrderRow } from "../orders/order-view"
import { moneyOf } from "../analytics/reports"
import { computeApplicationFee } from "../billing/fee-calculator"
import { PRO_PRICE_CENTS } from "../billing/plans"
import { homeProgress, nextSetupStep, type ProgressFacts } from "./progress"
import { appLocale } from "@/lib/i18n/format"
import { activeLanguage, tt } from "@/lib/i18n/text"

export type AnnouncementId =
  | "welcome"
  | "builder-intro"
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
  /**
   * Instead of `href`: open the share sheet, as Getting started's first
   * sale step does, or open Getting started's guide. Where the page gives no
   * way to do either, the button is the link to `href`.
   */
  action?: "share" | "guide"
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
  /** Why payouts are not ready, when they are not (lib/payments/stripe/readiness homePaymentsState). */
  paymentsState?: HomePaymentsState
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
export function salesSummary(rows: OrderRow[], now: number, before: { count: number; cents: number } = { count: 0, cents: 0 }): SalesSummary {
  const sales = groupOrders(rows)
    .filter(isSale)
    /* A sale stamped after `now` came in live after the page took its clock (or the clocks disagree a little): it happened now. */
    .map((o) => ({ id: o.id, at: Math.min(now, Date.parse(o.createdAt)), cents: moneyOf(o).net }))
    .filter((s) => Number.isFinite(s.at))
    .sort((a, b) => a.at - b.at)

  /* `before`: the sales older than `rows`, counted elsewhere (salesSummaryFrom), so a round number passed this week is still found. */
  let cents = before.cents
  const last30 = { count: 0, cents: 0, feeFreeCents: 0, feeProCents: 0 }
  let moneyPassed: { value: number; at: number } | null = null
  let countPassed: { value: number; at: number } | null = null
  for (let i = 0; i < sales.length; i++) {
    const s = sales[i]
    const was = cents
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
    const nth = before.count + i + 1
    if (now - s.at > WEEK || nth === 1) continue
    for (const m of MONEY_MILESTONES) if (was < m && cents >= m && (!moneyPassed || m > moneyPassed.value)) moneyPassed = { value: m, at: s.at }
    if (COUNT_MILESTONES.includes(nth) && (!countPassed || nth > countPassed.value)) countPassed = { value: nth, at: s.at }
  }

  const first = sales[0] && before.count === 0 ? { at: sales[0].at, cents: sales[0].cents, id: sales[0].id } : null
  /* Money over count: $1,000 in sales says more than a 25th sale. */
  const milestone: SalesSummary["milestone"] = moneyPassed ? { kind: "money", ...moneyPassed } : countPassed ? { kind: "count", ...countPassed } : null
  return { count: before.count + sales.length, cents, first, last30, milestone }
}

/**
 * THE SALES, WITHOUT EVERY ORDER IN THE BROWSER. A read stops at 1,000 rows,
 * so Home reads no order rows (app/app/page.tsx): the totals are counted
 * over every order on the server (lib/analytics/creator-orders
 * creatorSalesTotals), and only the last 30 days (every row of them, a page
 * at a time) and the first few orders are read. What came before the 30
 * days is the totals less those, so a round number passed this week is
 * found the same as if every order had been read.
 */
export function salesSummaryFrom(
  input: { recent: OrderRow[]; earliest: OrderRow[]; totals: { sales: number; revenueCents: number } | null },
  now: number,
): SalesSummary {
  const recent = salesSummary(input.recent, now)
  const count = Math.max(input.totals?.sales ?? 0, recent.count)
  const cents = Math.max(input.totals?.revenueCents ?? 0, recent.cents)
  const summary = salesSummary(input.recent, now, { count: count - recent.count, cents: cents - recent.cents })
  return { ...summary, count, cents, first: salesSummary(input.earliest, now).first }
}

/** No sales read (an older caller): the banner says nothing about sales. */
export const NO_SALES: SalesSummary = { count: 0, cents: 0, first: null, last30: { count: 0, cents: 0, feeFreeCents: 0, feeProCents: 0 }, milestone: null }

/* ─── Words ────────────────────────────────────────────────────────────── */

/** $29, $29.50, $1,240: cents only when there are some, and never on $1,000 or more, where they are noise. */
export function money(cents: number): string {
  const whole = Math.round(cents) % 100 === 0 || Math.abs(cents) >= 100_000
  const dollars = whole ? Math.round(cents / 100) : cents / 100
  /* Intl places the sign where the language does: $1,240 in English, 1.240 $ in German. */
  return dollars.toLocaleString(appLocale(), { style: "currency", currency: "USD", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 })
}

/** How long ago, in the words a person uses. Hours and days since, never a weekday, so it reads the same in every time zone. */
export function ago(at: number, now: number): string {
  const ms = Math.max(0, now - at)
  if (ms < HOUR) return tt("in the last hour")
  const hours = Math.floor(ms / HOUR)
  if (hours < 24) return tt("{hours, plural, one {an hour ago} other {# hours ago}}", { hours })
  const days = Math.floor(ms / DAY)
  return tt("{days, plural, one {a day ago} other {# days ago}}", { days })
}

/** 10th, 21st, 1,000th; 10. in German and Polish, 10e in French, 10.ª, 10ª in Spanish, Italian and Portuguese (a sale is feminine there). */
export function ordinal(n: number): string {
  const num = n.toLocaleString(appLocale())
  const lang = activeLanguage()
  if (lang === "de" || lang === "pl") return `${num}.`
  if (lang === "fr") return n === 1 ? "1re" : `${num}e`
  if (lang === "es") return `${num}.ª`
  if (lang === "it" || lang === "pt-BR" || lang === "pt") return `${num}ª`
  const tens = n % 100
  const suffix = tens >= 11 && tens <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")
  return `${num}${suffix}`
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

/** Nothing done yet: no product, no payouts, no website, no sale. */
const isNew = (p: HomeProgress) => !p.hasProduct && !p.hasPayouts && !p.websitePublished && !hasSale(p)

export const RULES: readonly Rule[] = [
  /*
    A NEW ACCOUNT IS TOLD WHERE IT IS GOING. It used to open on two to do
    items and nothing else, Connect Stripe and Add your first product, which
    reads as a list of chores rather than a way to a first sale. The first
    slide says what the three steps are and opens the guide that walks them;
    the two steps follow it, and a last slide says what the website builder
    can do before there is anything to put on a site. They go as the steps
    are done: a product or payouts and the welcome has done its job.
  */
  {
    id: "welcome",
    priority: 110,
    applies: isNew,
    write: () => ({
      tone: "next",
      eyebrow: tt("Welcome to Storelib"),
      title: tt("Your store opens in three steps"),
      line: tt("A product, payouts, then your link."),
      cta: tt("Show me how"),
      href: "/app/products/new",
      action: "guide",
    }),
  },
  /*
    PAYMENTS, SAID FOR WHERE THE SELLER IS. One card, worded by
    homePaymentsState (from the creators row the webhook keeps current): set
    up, finish, verify, more information, paused, or under review. Storelib's
    words, not Stripe's. Under review is information, not an alarm, and it is
    only shown while there is something for sale.
  */
  {
    id: "payouts",
    priority: 100,
    applies: (p) => !p.hasPayouts && (p.paymentsState !== "review" || p.hasProduct),
    write: (p) => {
      const state = p.paymentsState ?? "not_started"
      if (state === "identity")
        return { tone: "critical", eyebrow: tt("Action required"), title: tt("Verify your identity"), line: tt("We need a little more information before payouts can continue."), cta: tt("Verify now"), href: "/app/payouts" }
      if (state === "info")
        return { tone: "critical", eyebrow: tt("Action required"), title: tt("More information needed"), line: tt("Update your payout details to keep your account active."), cta: tt("Update details"), href: "/app/payouts" }
      if (state === "paused")
        return { tone: "critical", eyebrow: tt("Action required"), title: tt("Payouts are temporarily paused"), line: tt("Complete the requested verification to resume payouts."), cta: tt("Fix now"), href: "/app/payouts" }
      if (state === "review")
        return { tone: "next", eyebrow: tt("Payments"), title: tt("Verification in progress"), line: tt("We're checking your information. No action is needed right now."), cta: tt("View payouts"), href: "/app/payouts" }
      if (state === "setup")
        return { tone: "critical", eyebrow: tt("Needed to sell"), title: tt("Finish setting up payments"), line: tt("Add your payout account to start accepting payments."), cta: tt("Finish setup"), href: "/app/payouts" }
      return {
        tone: "critical",
        eyebrow: tt("Needed to sell"),
        title: tt("Set up payouts"),
        line: p.hasProduct ? tt("Buyers can't check out until you do.") : tt("Get paid directly to your bank account."),
        cta: tt("Set up payouts"),
        href: "/app/payouts",
      }
    },
  },
  {
    id: "first-product",
    priority: 95,
    applies: (p) => !p.hasProduct,
    write: () => ({
      tone: "next",
      eyebrow: tt("Start here"),
      title: tt("Add your first product"),
      line: tt("Upload a file, set a price, done."),
      cta: tt("Add product"),
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
        eyebrow: tt("First sale"),
        title: tt("You made your first sale"),
        line: tt("{amount}, {when}. See who bought it.", { amount: money(first.cents), when: ago(first.at, now) }),
        cta: tt("View order"),
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
        eyebrow: tt("Milestone"),
        title: m.kind === "money" ? tt("You passed {amount} in sales", { amount: money(m.value) }) : tt("Your {nth} sale", { nth: ordinal(m.value) }),
        line: m.kind === "money"
          ? tt("It happened {when}, across {count, plural, one {# sale} other {# sales}}.", { when: ago(m.at, now), count: p.sales.count })
          : tt("It came in {when}. {amount} so far.", { when: ago(m.at, now), amount: money(p.sales.cents) }),
        cta: tt("See analytics"),
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
        eyebrow: tt("Pro plan"),
        title: tt("Pro would have saved you {amount}", { amount: money(proSaving(p)) }),
        line: tt("Fees, 30 days: {amount} on Free, {amount2} on Pro.", { amount: money(feeFreeCents), amount2: money(feeProCents + PRO_PRICE_CENTS) }),
        cta: tt("See Pro"),
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
      eyebrow: tt("Next step"),
      title: tt("Share your store"),
      line: tt("Put your link in your bio or a post."),
      cta: tt("Share link"),
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
      eyebrow: tt("Next step"),
      title: tt("Publish your website"),
      line: tt("Pick a theme and put your site live."),
      cta: tt("Open builder"),
      href: "/app/website-builder",
    }),
  },
  {
    id: "builder-intro",
    priority: 40,
    applies: isNew,
    write: () => ({
      tone: "tip",
      eyebrow: tt("Website"),
      title: tt("Describe a section, get it built"),
      line: tt("Ask Storelib writes it. Change it after."),
      cta: tt("Open builder"),
      href: "/app/website-builder",
    }),
  },
  {
    id: "automations",
    priority: 50,
    applies: (p) => hasSale(p) && p.activeAutomations === 0,
    write: () => ({
      tone: "tip",
      eyebrow: tt("Emails"),
      title: tt("Thank every buyer by email"),
      line: tt("Email every new buyer, automatically."),
      cta: tt("Choose automation"),
      href: "/app/emails/flow/new",
    }),
  },
  {
    id: "newsletter",
    priority: 45,
    applies: (p) => p.websitePublished && p.subscribers === 0,
    write: () => ({
      tone: "tip",
      eyebrow: tt("Emails"),
      title: tt("Collect emails on your site"),
      line: tt("Add a Newsletter section to your site."),
      cta: tt("Add section"),
      href: "/app/website-builder",
    }),
  },
  {
    id: "domain",
    priority: 40,
    applies: (p) => isPaidPlan(p.plan) && p.websitePublished && !p.hasDomain,
    write: () => ({
      tone: "next",
      eyebrow: tt("Included in Pro"),
      title: tt("Connect your domain"),
      line: tt("Put your website on yourname.com."),
      cta: tt("Connect domain"),
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
      eyebrow: tt("Pro plan"),
      title: tt("Put your site on yourname.com"),
      line: tt("Your own domain, and 3% fees instead of 5%."),
      cta: tt("See Pro"),
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
    eyebrow: tt("Pro plan"),
    title: tt("Keep more of every sale"),
    line: tt("3% fees instead of 5%, and your own domain."),
    cta: tt("See Pro"),
    href: "/app/settings/billing/upgrade",
  }),
}
const FALLBACK_PAID: Rule = {
  id: "all-set",
  priority: 1,
  applies: (p) => isPaidPlan(p.plan),
  write: () => ({
    tone: "tip",
    eyebrow: tt("All set"),
    title: tt("Your store is set up"),
    line: tt("See where visitors come from and what sells."),
    cta: tt("View analytics"),
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
  /* The card's next step, when a slide says it; otherwise nothing leads and the priorities alone decide. */
  const lead = (p.nextStep ? LEADS[p.nextStep] ?? [] : []).filter((id) => out.some((a) => a.id === id))
  const rank = (a: Announcement) => {
    const leads = lead.includes(a.id)
    /* Critical stays on top unless the card names another step first (a product before Stripe). */
    if (NEWS.includes(a.id) || (a.tone === "critical" && (leads || lead.length === 0))) return 2000 + a.priority
    return (leads ? 1000 : 0) + a.priority
  }
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, Math.max(1, limit))
}

/** What happened this week: ahead of any step. The welcome is what happened today. */
const NEWS: readonly AnnouncementId[] = ["welcome", "first-sale", "milestone"]

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
    paymentsState: facts.paymentsState,
    websitePublished: done.websitePublished,
    hasDomain: done.hasDomain,
    sales,
    subscribers: facts.subscribers,
    activeAutomations: facts.automationsOn,
    canShare,
    nextStep: nextSetupStep(facts)?.id ?? null,
  }
}
