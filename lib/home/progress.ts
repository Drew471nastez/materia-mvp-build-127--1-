/**
 * ===========================================================================
 *  HOW FAR A STORE HAS GOT: GETTING STARTED, THEN THE CHALLENGES
 * ===========================================================================
 * "The steps should actually make sense... It should actually track whether
 * the user has connected his domain... and whether he has set up payments."
 *
 * One set of rules, read by everything that says how far an account has got:
 * Home's Getting started card and its purple bar (components/app/home,
 * components/app/dashboard-client), the setup ring in the sidebar (via
 * app/app/layout.tsx), GET /api/home/progress, and any banner or
 * notification that wants the same answer. Pure: no I/O, safe in the
 * browser. The reads live in lib/home/progress-server.ts.
 *
 * ---------------------------------------------------------------------------
 *  THE SHAPE
 * ---------------------------------------------------------------------------
 *   ProgressFacts          what the account has actually done, as numbers
 *                          and yes/no, read on the server
 *   factsFromRows(rows)    ProgressFacts from the raw rows a server page
 *                          already holds (creator, products, domains, the
 *                          live website, orders, the counts)
 *   setupSteps(facts)      ProgressItem[]: the seven Getting started steps,
 *                          in SETUP_ORDER
 *   challenges(facts)      ProgressItem[]: the eight challenges, in
 *                          CHALLENGE_ORDER, each with current and target
 *   homeProgress(facts)    HomeProgress: { steps, completed, total,
 *                          setupDone, challenges, challengesDone, phase }
 *
 *   nextSetupStep(facts)   the first step not done, or null: the one a
 *                          notification or banner should name
 *   readProgressFacts(db, { userId })   (lib/home/progress-server) every
 *                          fact for one creator, read on the server
 *
 *   ProgressItem           { id, label, done, href?, current?, target? }
 *
 * `href` is where the thing is done. A step that is done by something on
 * Home itself (the guide, the first sale's share panel) has an `action`
 * instead, which the page wires up.
 *
 * ---------------------------------------------------------------------------
 *  THE RULES
 * ---------------------------------------------------------------------------
 *   signup     always: the account exists
 *   guide      the setup guide was opened, kept on the account
 *              (user metadata GUIDE_OPENED_KEY, app/api/home/guide)
 *   product    at least one product, draft or published
 *   payments   Stripe can take charges AND pay out: the webhook and the
 *              status check write "connected" only then; charges_enabled and
 *              payouts_enabled both true counts the same
 *   store      a website is published right now: a theme install whose
 *              status is "published" (unpublishing takes it away again, and
 *              the status column is there on every database, unlike
 *              published_at)
 *   sale       a sale by the rule every figure uses (lib/orders/order-view
 *              isSale: a basket is one order; failed, pending and disputed
 *              payments are not sales)
 *   domain     a custom domain of this creator's whose DNS has been verified
 *              (status active, or ssl_provisioning while the certificate is
 *              issued: lib/custom-domains/store LIVE_STATUSES)
 *
 * Upgrading to Pro is not a step. "Remove the Upgrade to Pro in Getting
 * started": the plan is offered by Your Plan beside it and by the sidebar's
 * card, and a checklist that asks to be paid reads as one. The plan is still
 * a fact (`pro`), for whatever needs it.
 *
 * Getting started is done when all seven are. Only then does the card show
 * the challenges, which are counted the same way (sales, published
 * products, subscribers who can be mailed, emails sent, automations on,
 * coupons used, money made, the creator page on its own domain).
 */
import { homePaymentsState, rowCanAcceptPayments, type HomePaymentsState } from "@/lib/payments/stripe/readiness"
import { homeTotals } from "@/lib/analytics/home-figures"
import type { OrderRow } from "@/lib/orders/order-view"

/* ─── The facts ─────────────────────────────────────────────────────────── */

export interface ProgressFacts {
  /** Every product, draft or published. */
  products: number
  /** Products a buyer can see. */
  publishedProducts: number
  /** Stripe can take charges and pay out. */
  paymentsReady: boolean
  /** What Home says about payments when they are not ready (lib/payments/stripe/readiness homePaymentsState). */
  paymentsState?: HomePaymentsState
  /** A website is published right now. */
  websiteLive: boolean
  /** A custom domain whose DNS has been verified, for anything. */
  domainConnected: boolean
  /** One of them serves the creator page (on an old database, the one domain there is). */
  creatorPageDomain: boolean
  /** Sales, by the rule every figure uses. */
  sales: number
  /** What those sales made, less refunds, in cents. */
  revenueCents: number
  /** The setup guide has been opened on this account. */
  guideOpened: boolean
  /** On Pro. */
  pro: boolean
  /** Subscribers who can be mailed. */
  subscribers: number
  /** Emails sent to the list. */
  emailsSent: number
  /** Automations switched on. */
  automationsOn: number
  /** Times a coupon of this creator's was used at checkout. */
  couponUses: number
}

/** Nothing done yet but signing up: what a brand new account's facts are, and what a failed read falls back to. */
export const NO_FACTS: ProgressFacts = {
  products: 0,
  publishedProducts: 0,
  paymentsReady: false,
  websiteLive: false,
  domainConnected: false,
  creatorPageDomain: false,
  sales: 0,
  revenueCents: 0,
  guideOpened: false,
  pro: false,
  subscribers: 0,
  emailsSent: 0,
  automationsOn: 0,
  couponUses: 0,
}

/* ─── Each rule, on the rows it is read from ────────────────────────────── */

/** The account metadata key the guide's opening is kept under. */
export const GUIDE_OPENED_KEY = "home_guide_opened_at"

/** Mirrors lib/custom-domains/store LIVE_STATUSES (a test holds the two equal): the DNS has been seen pointing at us. */
export const VERIFIED_DOMAIN_STATUSES: readonly string[] = ["active", "ssl_provisioning"]

/** The website builder's published status (app/api/website-builder/themes/[installId]/publish). */
export const WEBSITE_LIVE_STATUS = "published"

/** Campaign statuses that mean the email went out (lib/email-campaigns/state). */
export const SENT_CAMPAIGN_STATUSES: readonly string[] = ["sent", "partially_failed"]

export interface PaymentsRow {
  stripe_account_id?: string | null
  stripe_requirements?: string[] | null
  stripe_connected_at?: string | null
  can_accept_payments?: boolean | null
  details_submitted?: boolean | null
  stripe_onboarding_status?: string | null
  charges_enabled?: boolean | null
  payouts_enabled?: boolean | null
  /**
   * Storelib Payments on Airwallex answered for this creator
   * (lib/payments/readiness): true when checkout there would take money.
   * Not a column: set by the loader that read the row.
   */
  provider_payments_ready?: boolean | null
}

/** Stripe can take a buyer's money and pay it out, or Airwallex can. Payouts alone is not enough: a card could not be charged. */
/** Checkout can take money for this creator: Storelib's one rule (lib/payments/stripe/readiness), or Airwallex's answer. */
export function paymentsReadyFrom(creator: PaymentsRow | null | undefined): boolean {
  if (!creator) return false
  if (creator.provider_payments_ready === true) return true
  return rowCanAcceptPayments(creator)
}

/** Pro is "growth" now and was "pro" before (lib/billing/plans). */
export function isProPlan(planId: string | null | undefined): boolean {
  return planId === "growth" || planId === "pro"
}

export interface DomainRow {
  domain?: string | null
  status?: string | null
  purpose?: string | null
}

/**
 * Whether a domain is connected, and whether one serves the creator page.
 * A database from before purposes has one domain per creator and no
 * `purpose` column, and that domain served the creator page as well.
 */
export function domainFactsFrom(rows: DomainRow[] | null | undefined): { domainConnected: boolean; creatorPageDomain: boolean } {
  const verified = (rows ?? []).filter((r) => !!r.domain && VERIFIED_DOMAIN_STATUSES.includes(String(r.status)))
  if (verified.length === 0) return { domainConnected: false, creatorPageDomain: false }
  const legacy = verified.every((r) => r.purpose === undefined)
  return { domainConnected: true, creatorPageDomain: legacy || verified.some((r) => r.purpose === "creator_page") }
}

/** Sales and what they made, by the rule Home's figures and Analytics use. */
export function salesFrom(orders: OrderRow[] | null | undefined): { sales: number; revenueCents: number } {
  const { totalOrders, totalRevenue } = homeTotals((orders ?? []) as OrderRow[])
  return { sales: totalOrders, revenueCents: Math.max(0, totalRevenue) }
}

/** The guide was opened: a date kept on the account. */
export function guideOpenedFrom(meta: Record<string, unknown> | null | undefined): boolean {
  const at = meta?.[GUIDE_OPENED_KEY]
  return typeof at === "string" && at.length > 0
}

export interface ProgressRows {
  creator: (PaymentsRow & { subscription_plan_id?: string | null }) | null | undefined
  /** Each product; its status when it was read, so a list of ids alone counts products and none published. */
  products: ReadonlyArray<{ id?: unknown; status?: string | null }> | null | undefined
  domains: DomainRow[] | null | undefined
  /** A published theme install, or nothing. */
  websiteLive: boolean
  /** Every order row of the creator's, or null when they were not read (the sales then stay at 0). */
  orders?: OrderRow[] | null
  /**
   * The sales already counted, by the same rule, over every order
   * (lib/analytics/creator-orders creatorSalesTotals). Used instead of
   * `orders` when given: a single read of the rows stops at 1,000.
   */
  sales?: { sales: number; revenueCents: number } | null
  userMetadata?: Record<string, unknown> | null
  counts?: Partial<Pick<ProgressFacts, "subscribers" | "emailsSent" | "automationsOn" | "couponUses">> | null
}

export function factsFromRows(rows: ProgressRows): ProgressFacts {
  const products = rows.products ?? []
  const counts = rows.counts ?? {}
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  return {
    products: products.length,
    publishedProducts: products.filter((p) => p.status === "published").length,
    paymentsReady: paymentsReadyFrom(rows.creator),
    paymentsState: paymentsReadyFrom(rows.creator) ? "ready" : homePaymentsState(rows.creator),
    websiteLive: rows.websiteLive === true,
    ...domainFactsFrom(rows.domains),
    ...(rows.sales ? { sales: n(rows.sales.sales), revenueCents: n(rows.sales.revenueCents) } : salesFrom(rows.orders)),
    guideOpened: guideOpenedFrom(rows.userMetadata),
    pro: isProPlan(rows.creator?.subscription_plan_id),
    subscribers: n(counts.subscribers),
    emailsSent: n(counts.emailsSent),
    automationsOn: n(counts.automationsOn),
    couponUses: n(counts.couponUses),
  }
}

/**
 * Facts from the old checklist's shape ({ id, completed } for "product",
 * "payouts" and "sale"), for a caller that still hands that in: the probes
 * that render Home with fixtures. Sales come from the orders, never from here.
 */
export function legacyFacts(steps: { id: string; completed: boolean }[], planId?: string | null): ProgressFacts {
  const done = (id: string) => steps.some((s) => s.id === id && s.completed)
  return { ...NO_FACTS, products: done("product") ? 1 : 0, paymentsReady: done("payouts") || done("payments"), pro: isProPlan(planId) }
}

/* ─── The two lists ─────────────────────────────────────────────────────── */

export type SetupStepId = "signup" | "guide" | "product" | "payments" | "store" | "sale" | "domain"
export type ChallengeId = "sales" | "products" | "email" | "automation" | "subscribers" | "coupon" | "revenue" | "page-domain"

/** What the page does for an item that is not a link. */
export type ProgressAction = "guide" | "share"

export interface ProgressItem {
  id: SetupStepId | ChallengeId
  label: string
  done: boolean
  /** Where it is done, for an item that is a link. */
  href?: string
  /** Done on Home itself: the guide, or the share panel. */
  action?: ProgressAction
  /** A challenge with a count: how far it has got... */
  current?: number
  /** ...and how far it goes. */
  target?: number
  /** How to write the count: a number, or money in cents. */
  unit?: "count" | "cents"
}

/**
 * Getting started, in the order the work depends on itself: the guide
 * first, a product before payments, payments before the first sale, and the
 * domain last. A domain is a Pro feature, and its own page says so
 * (components/app/settings/domains-panel "Your own domain is on Pro").
 */
export const SETUP_ORDER: readonly SetupStepId[] = ["signup", "guide", "product", "payments", "store", "sale", "domain"]

export function setupSteps(f: ProgressFacts): ProgressItem[] {
  const all: Record<SetupStepId, ProgressItem> = {
    signup: { id: "signup", label: "Sign up", done: true, href: "/app/settings" },
    guide: { id: "guide", label: "How to get started", done: f.guideOpened, action: "guide" },
    product: { id: "product", label: "Add your first product", done: f.products > 0, href: f.products > 0 ? "/app/products" : "/app/products/new" },
    payments: { id: "payments", label: "Set up payments", done: f.paymentsReady, href: "/app/payouts" },
    store: { id: "store", label: "Publish your website", done: f.websiteLive, href: "/app/website-builder" },
    sale: f.sales > 0
      ? { id: "sale", label: "Make your first sale", done: true, href: "/app/orders" }
      : { id: "sale", label: "Make your first sale", done: false, action: "share" },
    domain: { id: "domain", label: "Connect your domain", done: f.domainConnected, href: "/app/settings?tab=domains" },
  }
  return SETUP_ORDER.map((id) => all[id])
}

/** The next things to do once a store is set up, easiest first. */
export const CHALLENGE_ORDER: readonly ChallengeId[] = ["sales", "products", "email", "automation", "subscribers", "coupon", "revenue", "page-domain"]

/** The targets, one place. */
export const CHALLENGE_TARGETS: Record<ChallengeId, number> = {
  sales: 10,
  products: 5,
  email: 1,
  automation: 1,
  subscribers: 50,
  coupon: 1,
  revenue: 100_000,
  "page-domain": 1,
}

export function challenges(f: ProgressFacts): ProgressItem[] {
  const t = CHALLENGE_TARGETS
  const item = (id: ChallengeId, label: string, current: number, extra: Partial<ProgressItem>): ProgressItem => ({
    id,
    label,
    current: Math.min(current, t[id]),
    target: t[id],
    done: current >= t[id],
    unit: "count",
    ...extra,
  })
  const all: Record<ChallengeId, ProgressItem> = {
    sales: item("sales", `Make ${t.sales} sales`, f.sales, { action: "share" }),
    products: item("products", `Publish ${t.products} products`, f.publishedProducts, { href: "/app/products" }),
    email: item("email", "Send your first email", f.emailsSent, { href: "/app/emails/new" }),
    automation: item("automation", "Turn on an automation", f.automationsOn, { href: "/app/emails?tab=flows" }),
    subscribers: item("subscribers", `Reach ${t.subscribers} subscribers`, f.subscribers, { href: "/app/emails?tab=subscribers" }),
    coupon: item("coupon", "Make a sale with a coupon", f.couponUses, { href: "/app/coupons" }),
    revenue: item("revenue", `Make $${(t.revenue / 100).toLocaleString("en-US")} in sales`, f.revenueCents, { href: "/app/analytics", unit: "cents" }),
    "page-domain": item("page-domain", "Put your creator page on your domain", f.creatorPageDomain ? 1 : 0, { href: "/app/settings?tab=domains" }),
  }
  return CHALLENGE_ORDER.map((id) => all[id])
}

/* ─── Together ──────────────────────────────────────────────────────────── */

export interface HomeProgress {
  steps: ProgressItem[]
  completed: number
  total: number
  /** Every Getting started step is done: the card shows the challenges. */
  setupDone: boolean
  challenges: ProgressItem[]
  challengesDone: number
  /** Which list the card shows. */
  phase: "setup" | "challenges"
}

export function homeProgress(f: ProgressFacts): HomeProgress {
  const steps = setupSteps(f)
  const completed = steps.filter((s) => s.done).length
  const setupDone = completed === steps.length
  const list = challenges(f)
  return {
    steps,
    completed,
    total: steps.length,
    setupDone,
    challenges: list,
    challengesDone: list.filter((c) => c.done).length,
    phase: setupDone ? "challenges" : "setup",
  }
}

/**
 * The one step to nudge about: the first Getting started step not done, in
 * SETUP_ORDER, or null once they all are. For anything that says a single
 * next step rather than the list (a notification, a banner): with the facts
 * from readProgressFacts (lib/home/progress-server) it gives the same answer
 * as Home's card.
 */
export function nextSetupStep(f: ProgressFacts): ProgressItem | null {
  return setupSteps(f).find((s) => !s.done) ?? null
}

/** Two sets of facts say the same thing: an answer that changes nothing renders nothing. */
export function sameFacts(a: ProgressFacts, b: ProgressFacts): boolean {
  return (Object.keys(NO_FACTS) as (keyof ProgressFacts)[]).every((k) => a[k] === b[k])
}

/**
 * Facts as the API sends them, checked: every field the right type, anything
 * missing or wrong read as not done. What a browser receives is never trusted
 * further than that.
 */
export function readFacts(value: unknown): ProgressFacts | null {
  if (!value || typeof value !== "object") return null
  const v = value as Record<string, unknown>
  const out = { ...NO_FACTS }
  for (const k of Object.keys(NO_FACTS) as (keyof ProgressFacts)[]) {
    const want = typeof NO_FACTS[k]
    if (typeof v[k] === want) (out as Record<string, unknown>)[k] = v[k]
  }
  return out
}
