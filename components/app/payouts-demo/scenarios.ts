import { getStorelibPaymentsStatus, statusFactsOf, type StorelibStatusView } from "@/lib/payments/stripe/status"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { tt } from "@/lib/i18n/text"

/**
 * ===========================================================================
 *  THE PAYOUTS DEMO'S MADE UP ACCOUNTS
 * ===========================================================================
 * Each scenario is one state a creator's Payouts page can be in, built the
 * way the real page gets it: the account's status goes through the same
 * getStorelibPaymentsStatus the server uses, so every line of copy, every
 * pill and every button is the production one. Nothing here is real: the
 * buyers, products, banks and amounts are invented, and no request leaves
 * the browser for them (components/app/payouts-demo/payouts-demo.tsx answers
 * the page's requests itself).
 */

export type ScenarioId =
  | "active"
  | "first_sales"
  | "dispute"
  | "payout_failed"
  | "action_required"
  | "id_required"
  | "info_required"
  | "bank_required"
  | "verifying"
  | "under_review"
  | "restricted"
  | "disabled"
  | "setup"

export const SCENARIOS: Array<{ id: ScenarioId; label: string }> = [
  { id: "active", get label() { return tt("Active, selling") } },
  { id: "first_sales", get label() { return tt("First sales") } },
  { id: "dispute", get label() { return tt("Dispute open") } },
  { id: "payout_failed", get label() { return tt("Payout failed") } },
  { id: "action_required", get label() { return tt("Stripe needs details") } },
  { id: "id_required", get label() { return tt("ID verification needed") } },
  { id: "info_required", get label() { return tt("More information needed") } },
  { id: "bank_required", get label() { return tt("Bank account needed") } },
  { id: "verifying", get label() { return tt("Verification pending") } },
  { id: "under_review", get label() { return tt("Under review") } },
  { id: "restricted", get label() { return tt("Payouts paused") } },
  { id: "disabled", get label() { return tt("Permanently disabled") } },
  { id: "setup", get label() { return tt("Not set up") } },
]

export const DEMO_CURRENCIES = ["ron", "eur", "usd", "gbp"] as const
export type DemoCurrency = (typeof DEMO_CURRENCIES)[number]

const DAY = 86_400_000

/** A price that reads right in each currency: 49 lei, about 10 euro, about 11 dollars. */
const SCALE: Record<DemoCurrency, number> = { ron: 1, eur: 0.2, usd: 0.22, gbp: 0.17 }
const price = (lei: number, c: DemoCurrency) => Math.round((lei * SCALE[c]) * 100)

const PRODUCTS = [
  { id: "p-drums", get title() { return tt("Lo-fi Drum Kit Vol. 2") }, lei: 89 },
  { id: "p-presets", get title() { return tt("Lightroom Presets: Bucharest Nights") }, lei: 59 },
  { id: "p-notion", get title() { return tt("Notion Creator OS") }, lei: 129 },
  { id: "p-course", get title() { return tt("Store Theme Basics (course)") }, lei: 349 },
  { id: "p-samples", get title() { return tt("Techno Samples: Warehouse") }, lei: 45 },
]

/* People's names stay as they are. i18n-ignore-start */
const BUYERS: Array<[string, string]> = [
  ["Maria", "Popescu"],
  ["Jonas", "Weber"],
  ["Elena", "Ionescu"],
  ["Sam", "Carter"],
  ["Ana", "Dumitru"],
  ["Lucas", "Martin"],
  ["Ioana", "Stan"],
  ["Noah", "Fischer"],
]
/* i18n-ignore-end */

export interface DemoOrder {
  id: string
  amount_cents: number
  fee_cents: number
  currency: string
  created_at: string
  status: "completed" | "refunded" | "disputed"
  buyer_first_name: string
  buyer_last_name: string
  buyer_email: string
  customer_email: string
  product_id: string
  receipt_token: string
  payment_method: string
  card_brand: string
  card_last4: string
  buyer_country: string
  refund_amount_cents?: number | null
  refunded_at?: string | null
  product: { id: string; title: string; thumbnail_url: null; type: string }
}

export interface DemoPayout {
  id: string
  amount: number
  currency: string
  status: "paid" | "in_transit" | "failed" | "pending"
  arrival_date: number | null
  created: number
  method: string
  type: string
  description: string | null
  destination: string | null
}

export interface DemoDispute {
  id: string
  amountMinor: number
  currency: string
  productTitle: string | null
  reason: string
  stage: "inquiry" | "respond" | "review" | "won" | "lost" | "closed"
  label: string
  line: string
  tone: "neutral" | "attention" | "critical" | "good"
  openedAt: string | null
  evidenceDueBy: string | null
  closedAt: string | null
  noteSent: boolean
  canAddNote: boolean
}

export interface Scenario {
  paymentsReady: boolean
  currency: DemoCurrency
  orders: DemoOrder[]
  payouts: DemoPayout[]
  available: number
  pending: number
  upcoming: Array<{ date: string; amount: number; currency: string }>
  settleDays: number
  status: StorelibStatusView
  overview: Overview
  disputes: DemoDispute[]
  negativeBalance: number
  bankStatus: "verified" | "errored"
}

/** A small seeded random, so the same scenario draws the same sales every time. */
function seeded(seed: number) {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

function makeOrders(count: number, days: number, c: DemoCurrency, now: number, seed: number): DemoOrder[] {
  const rnd = seeded(seed)
  const out: DemoOrder[] = []
  for (let i = 0; i < count; i++) {
    const product = PRODUCTS[Math.floor(rnd() * PRODUCTS.length)]
    const [first, last] = BUYERS[Math.floor(rnd() * BUYERS.length)]
    const amount = price(product.lei, c)
    /* The Free plan fee: 5% and a fixed part, or 11.25% under the small-order line (lib/payments/fees). */
    const fee = amount >= price(18, c) ? Math.round(amount * 0.05) + Math.round(price(1.15, c)) : Math.round(amount * 0.1125)
    const at = now - Math.floor(rnd() * days * DAY) - Math.floor(rnd() * DAY)
    out.push({
      id: `00000000-0000-4000-8000-${String(100000000000 + i).slice(-12)}`,
      amount_cents: amount,
      fee_cents: fee,
      currency: c,
      created_at: new Date(at).toISOString(),
      status: "completed",
      buyer_first_name: first,
      buyer_last_name: last,
      buyer_email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      customer_email: `${first.toLowerCase()}.${last.toLowerCase()}@example.com`,
      product_id: product.id,
      receipt_token: `demo-${i}`,
      payment_method: "card",
      card_brand: rnd() > 0.4 ? "visa" : "mastercard",
      card_last4: String(1000 + Math.floor(rnd() * 8999)),
      buyer_country: ["RO", "DE", "GB", "US", "FR"][Math.floor(rnd() * 5)],
      product: { id: product.id, title: product.title, thumbnail_url: null, type: "digital" },
    })
  }
  return out.sort((a, b) => b.created_at.localeCompare(a.created_at))
}

function account(o: {
  charges: boolean
  payouts: boolean
  submitted: boolean
  due?: string[]
  pastDue?: string[]
  pending?: string[]
  reason?: string | null
  deadline?: number | null
  bank?: "verified" | "errored" | null
  everActive?: boolean
  lastPayoutFailed?: boolean
}): StorelibStatusView {
  return getStorelibPaymentsStatus(
    statusFactsOf(
      {
        charges_enabled: o.charges,
        payouts_enabled: o.payouts,
        details_submitted: o.submitted,
        requirements: { currently_due: o.due ?? [], past_due: o.pastDue ?? [], pending_verification: o.pending ?? [], disabled_reason: o.reason ?? null, current_deadline: o.deadline ?? null },
        future_requirements: { currently_due: [], past_due: [] },
        capabilities: { card_payments: o.charges ? "active" : "inactive", transfers: o.payouts ? "active" : "pending" },
      },
      o.bank ? [{ status: o.bank }] : [],
      { everActive: o.everActive, lastPayoutFailed: o.lastPayoutFailed },
    ),
  )
}

function overviewFor(status: StorelibStatusView, c: DemoCurrency, opts: { beat: "personal" | "verification" | "bank" | "review" | "done"; bank: boolean; checkoutOpen: boolean; available: number; pending: number }): Overview {
  return {
    provider: "stripe",
    environment: "production",
    configured: true,
    tableMissing: false,
    stage: opts.beat === "done" ? "active" : opts.beat === "review" ? "review" : "verify",
    copy: { title: status.title, line: status.line, action: status.actionLabel },
    kind: "individual",
    requirements: [],
    checkoutOpen: opts.checkoutOpen,
    balances: opts.beat === "done" ? [{ currency: c, availableMinor: opts.available, pendingMinor: opts.pending }] : [],
    balancesAt: new Date().toISOString(),
    payoutDestination: opts.bank ? { bankName: tt("Banca Demo"), country: "RO", currency: c, last4: "4821", holder: "individual" } : null,
    payouts: [],
    can: { embeddedOnboarding: true, hostedOnboarding: false, embeddedPayoutForm: true, requestPayout: true },
    unavailable: [],
    badge: status.status === "ACTIVE" ? "active" : status.status === "VERIFYING" ? "review" : status.status === "NOT_STARTED" ? "setup" : "action",
    uxState: status.status === "ACTIVE" ? "PAYMENTS_ACTIVE" : status.status === "VERIFYING" ? "VERIFICATION_IN_PROGRESS" : status.status === "NOT_STARTED" ? "PAYMENTS_NOT_CONFIGURED" : "ACTION_REQUIRED",
    chargesEnabled: status.canCharge,
    payoutsEnabled: status.status === "ACTIVE",
    prefill: { firstName: tt("Demo"), lastName: tt("Creator"), country: "RO" },
    payoutHint: opts.beat === "personal" ? null : { accountName: tt("Demo Creator"), currency: c, country: "RO", holderType: "individual", inStorelib: true },
    paymentsStatus: status,
    beat: opts.beat,
    statusLabel: status.title,
    nextPayout: null,
  } as unknown as Overview
}

function payoutsFrom(orders: DemoOrder[], c: DemoCurrency, now: number, opts: { failedLast?: boolean; inTransit?: boolean; count: number }): DemoPayout[] {
  const out: DemoPayout[] = []
  for (let i = 0; i < opts.count; i++) {
    const created = Math.floor((now - (i * 9 + 3) * DAY) / 1000)
    const amount = price(380 + ((i * 137) % 900), c)
    const status: DemoPayout["status"] = i === 0 && opts.failedLast ? "failed" : i === 0 && opts.inTransit ? "in_transit" : "paid"
    out.push({ id: `po_demo_${i}`, amount, currency: c, status, arrival_date: created + 2 * 86400, created, method: "standard", type: "bank_account", description: null, destination: tt("Banca Demo ••••4821") })
  }
  return out
}

function upcomingFrom(pending: number, c: DemoCurrency, now: number): Array<{ date: string; amount: number; currency: string }> {
  if (pending <= 0) return []
  const parts = [0.45, 0.35, 0.2]
  return parts.map((p, i) => ({ date: new Date(now + (i * 2 + 1) * DAY).toISOString().slice(0, 10), amount: Math.round(pending * p), currency: c }))
}

export function buildScenario(id: ScenarioId, c: DemoCurrency, now = Date.now()): Scenario {
  const deadline = Math.floor((now + 9 * DAY) / 1000)
  const active = account({ charges: true, payouts: true, submitted: true, bank: "verified", everActive: true })
  const base = (status: StorelibStatusView, orders: DemoOrder[], payouts: DemoPayout[], available: number, pending: number, extra: Partial<Scenario> = {}): Scenario => ({
    paymentsReady: status.canCharge,
    currency: c,
    orders,
    payouts,
    available,
    pending,
    upcoming: upcomingFrom(pending, c, now),
    settleDays: 7,
    status,
    overview: overviewFor(status, c, { beat: status.status === "ACTIVE" || status.canCharge ? "done" : status.status === "VERIFYING" ? "review" : status.status === "NOT_STARTED" ? "personal" : "verification", bank: status.status !== "NOT_STARTED", checkoutOpen: status.canCharge, available, pending }),
    disputes: [],
    negativeBalance: 0,
    bankStatus: "verified",
    ...extra,
  })

  switch (id) {
    case "active": {
      const orders = makeOrders(36, 60, c, now, 7)
      orders[4].status = "refunded"
      orders[4].refund_amount_cents = orders[4].amount_cents
      orders[4].refunded_at = new Date(now - 2 * DAY).toISOString()
      return base(active, orders, payoutsFrom(orders, c, now, { count: 6, inTransit: true }), price(1240.5, c), price(380, c))
    }
    case "first_sales": {
      const orders = makeOrders(3, 4, c, now, 3)
      return base(active, orders, [], 0, price(198, c))
    }
    case "dispute": {
      const orders = makeOrders(22, 45, c, now, 11)
      orders[2].status = "disputed"
      const open: DemoDispute = {
        id: "00000000-0000-4000-8000-0000000000d1",
        amountMinor: orders[2].amount_cents,
        currency: c,
        productTitle: orders[2].product.title,
        reason: tt("The buyer says they did not get what they paid for."),
        stage: "respond",
        label: tt("Open"),
        line: tt("Storelib is answering the bank. Add anything that proves the sale so it can be sent with the response."),
        tone: "attention",
        openedAt: new Date(now - 2 * DAY).toISOString(),
        evidenceDueBy: new Date(now + 9 * DAY).toISOString(),
        closedAt: null,
        noteSent: false,
        canAddNote: true,
      }
      const won: DemoDispute = {
        id: "00000000-0000-4000-8000-0000000000d2",
        amountMinor: price(59, c),
        currency: c,
        productTitle: tt("Lightroom Presets: Bucharest Nights"),
        reason: tt("The buyer does not recognise the payment on their statement."),
        stage: "won",
        label: tt("Won"),
        line: tt("The bank decided for you. The money was returned to your balance."),
        tone: "good",
        openedAt: new Date(now - 70 * DAY).toISOString(),
        evidenceDueBy: null,
        closedAt: new Date(now - 6 * DAY).toISOString(),
        noteSent: true,
        canAddNote: false,
      }
      return base(active, orders, payoutsFrom(orders, c, now, { count: 4 }), price(310, c), price(240, c), { disputes: [open, won] })
    }
    case "payout_failed": {
      const orders = makeOrders(18, 40, c, now, 5)
      const status = account({ charges: true, payouts: true, submitted: true, bank: "errored", everActive: true, lastPayoutFailed: true })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 3, failedLast: true }), price(612, c), price(140, c), { bankStatus: "errored" })
    }
    case "action_required": {
      const orders = makeOrders(14, 30, c, now, 9)
      const status = account({ charges: true, payouts: true, submitted: true, bank: "verified", everActive: true, due: ["individual.verification.additional_document"], deadline })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 2 }), price(455, c), price(120, c))
    }
    case "verifying": {
      const status = account({ charges: false, payouts: false, submitted: true, bank: "verified", pending: ["individual.verification.document"], reason: "requirements.pending_verification" })
      return base(status, [], [], 0, 0)
    }
    /* Selling, and Stripe now wants to see an ID: only then is the seller asked for one. */
    case "id_required": {
      const orders = makeOrders(12, 30, c, now, 8)
      const status = account({ charges: true, payouts: true, submitted: true, bank: "verified", everActive: true, due: ["individual.verification.document"], deadline })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 2 }), price(380, c), price(90, c))
    }
    case "info_required": {
      const orders = makeOrders(10, 30, c, now, 6)
      const status = account({ charges: true, payouts: true, submitted: true, bank: "verified", everActive: true, due: ["individual.address.line1", "individual.address.city", "individual.address.postal_code"], deadline })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 2 }), price(260, c), price(70, c))
    }
    case "bank_required": {
      const status = account({ charges: false, payouts: false, submitted: true, bank: null, due: ["external_account"] })
      return base(status, [], [], 0, 0)
    }
    /* Everything sent, nothing pending by name: Stripe is still switching the account on. */
    case "under_review": {
      const status = account({ charges: false, payouts: false, submitted: true, bank: "verified" })
      return base(status, [], [], 0, 0)
    }
    case "restricted": {
      const orders = makeOrders(20, 45, c, now, 12)
      const status = account({ charges: false, payouts: false, submitted: true, bank: "verified", everActive: true, pastDue: ["individual.verification.document"], reason: "requirements.past_due" })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 3 }), price(720, c), price(150, c))
    }
    case "disabled": {
      const orders = makeOrders(6, 30, c, now, 20)
      const status = account({ charges: false, payouts: false, submitted: true, bank: "verified", everActive: true, reason: "rejected.other" })
      return base(status, orders, payoutsFrom(orders, c, now, { count: 1 }), 0, 0)
    }
    case "setup":
    default: {
      const status = getStorelibPaymentsStatus(statusFactsOf(null, []))
      return base(status, [], [], 0, 0)
    }
  }
}

/** The revenue chart's answer for a period, from the scenario's own sales (app/api/stripe/revenue-chart's shape). */
export function chartFor(s: Scenario, query: URLSearchParams): Record<string, unknown> {
  const start = query.get("start") ? Date.parse(query.get("start")!) : NaN
  const end = query.get("end") ? Date.parse(query.get("end")!) : NaN
  const ranged = Number.isFinite(start) && Number.isFinite(end) && end > start
  const inRange = s.orders.filter((o) => !ranged || (Date.parse(o.created_at) >= start && Date.parse(o.created_at) < end))
  const hourly = ranged && end - start <= 25 * 3_600_000
  const key = (iso: string) => (hourly ? String(new Date(iso).getUTCHours()).padStart(2, "0") : iso.slice(0, 10))
  const buckets = new Map<string, { date: string; revenue: number; gross: number; refundsAbs: number; count: number }>()
  for (const o of inRange) {
    const k = key(o.created_at)
    const b = buckets.get(k) ?? { date: k, revenue: 0, gross: 0, refundsAbs: 0, count: 0 }
    if (o.status === "completed") {
      b.gross += o.amount_cents
      b.revenue += o.amount_cents - o.fee_cents
      b.count += 1
    } else if (o.status === "refunded") {
      b.refundsAbs += o.refund_amount_cents || o.amount_cents
      b.revenue -= o.refund_amount_cents || o.amount_cents
    }
    buckets.set(k, b)
  }
  const series: Array<{ date: string; revenue: number; gross: number; refundsAbs: number; count: number }> = []
  if (hourly) {
    for (let h = 0; h < 24; h++) {
      const k = String(h).padStart(2, "0")
      series.push(buckets.get(k) ?? { date: k, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
    }
  } else {
    const first = ranged ? start : inRange.length ? Math.min(...inRange.map((o) => Date.parse(o.created_at))) : Date.now() - 30 * DAY
    const last = ranged ? end - 1 : Date.now()
    for (let t = Date.parse(new Date(first).toISOString().slice(0, 10)); t <= last && series.length < 400; t += DAY) {
      const k = new Date(t).toISOString().slice(0, 10)
      series.push(buckets.get(k) ?? { date: k, revenue: 0, gross: 0, refundsAbs: 0, count: 0 })
    }
  }
  const totalGross = inRange.filter((o) => o.status === "completed").reduce((t, o) => t + o.amount_cents, 0)
  const totalRefunds = inRange.filter((o) => o.status === "refunded").reduce((t, o) => t + (o.refund_amount_cents || o.amount_cents), 0)
  return { data: series, total: series.reduce((t, b) => t + b.revenue, 0), totalGross, totalRefunds, currency: s.currency, otherCurrencies: [], isHourly: hourly }
}
