"use client"

/**
 * ===========================================================================
 *  THE PAYOUTS DEMO: THE REAL PAGE, MADE UP DATA
 * ===========================================================================
 * The owner's words: "a 1:1 copy of the payouts, a demo I can only access
 * through a password, to see the changes in production, so we don't always
 * have to simulate production with real ids or real setups, but consistent
 * and exactly how the production looks, dynamically".
 *
 * So nothing here is a copy. It draws the production components themselves
 * (PayoutsClient, the Storelib Payments card and its setup page) in the
 * production page's own frame, and answers the requests they make from the
 * scenario chosen in the bar (components/app/payouts-demo/scenarios.ts),
 * inside this tab only: window.fetch is wrapped while the demo is open and
 * put back when it closes, and a request for anything else goes through as
 * normal. A change to Payouts shows here the moment it ships.
 *
 * Cash out, refunds and evidence work against the made up account, so the
 * flows can be pressed through. Stripe's own ID and bank forms do not load:
 * they need a real Stripe account, and the demo says so where they would be.
 */
import * as React from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { PayoutsClient } from "@/app/(storelib)/app/payouts/payouts-client"
import { PaneBar } from "@/app/(storelib)/app/orders/order-parts"
import { StorelibPaymentsInline } from "@/components/app/settings/storelib-payments-inline"
import { forgetOverview } from "@/lib/payments/overview-cache"
import { secondaryDepth } from "@/components/ui/depth-button"
import { cn } from "@/lib/utils"
import { DEMO_CURRENCIES, SCENARIOS, buildScenario, chartFor, type DemoCurrency, type Scenario, type ScenarioId } from "./scenarios"
import { tt } from "@/lib/i18n/text"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

async function bodyOf(init?: RequestInit): Promise<Record<string, unknown>> {
  try {
    return typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** The page's own requests, answered from the scenario. Null: not one of them, let it through. */
async function answer(s: Scenario, url: URL, init?: RequestInit): Promise<Response | null> {
  const method = (init?.method || "GET").toUpperCase()
  const path = url.pathname
  const disputed = s.orders.filter((o) => o.status === "disputed")

  if (path === "/api/stripe/payouts") {
    return json({
      payouts: s.payouts,
      balance: { available: [{ amount: s.available, currency: s.currency }], pending: [{ amount: s.pending, currency: s.currency }] },
      balanceCurrency: s.currency,
      upcoming: s.upcoming,
      payoutScheduleInterval: "manual",
      payoutScheduleDelay: s.settleDays,
      paymentsStatus: s.status,
      disputeData: {
        negativeBalance: s.negativeBalance,
        activeDisputes: disputed.length,
        totalDisputedAmount: disputed.reduce((t, o) => t + o.amount_cents, 0),
        hasActiveDisputes: disputed.length > 0,
      },
      taxData: null,
    })
  }
  if (path === "/api/stripe/revenue-chart") return json(chartFor(s, url.searchParams))
  if (path === "/api/stripe/payout-method") {
    return json({
      bankAccount:
        s.status.status === "NOT_STARTED"
          ? null
          : { bankName: tt("Banca Demo"), last4: "4821", currency: s.currency, routingNumber: null, accountHolderName: tt("Demo Creator"), status: s.bankStatus },
      payoutSchedule: { interval: "manual", weeklyAnchor: null, monthlyAnchor: null, delayDays: s.settleDays },
      payoutsEnabled: s.status.status === "ACTIVE" || s.status.status === "ACTION_REQUIRED" || s.status.status === "PAYOUT_FAILED",
      chargesEnabled: s.status.canCharge,
      detailsSubmitted: s.status.status !== "NOT_STARTED",
      requirementsDue: [],
      requirementsPastDue: [],
      requirementsEventuallyDue: [],
    })
  }
  if (path === "/api/payments/disputes") {
    if (method === "POST") {
      const b = await bodyOf(init)
      const d = s.disputes.find((x) => x.id === b.id)
      if (!d) return json({ error: tt("That dispute was not found.") }, 404)
      if (typeof b.note !== "string" || b.note.trim().length < 10) return json({ error: tt("Write a few words about the sale (at least 10 characters).") }, 400)
      d.noteSent = true
      return json({ ok: true })
    }
    return json({ disputes: s.disputes, recorded: true })
  }
  if (path === "/api/payments/overview" || path === "/api/payments/refresh" || path === "/api/payments/begin" || path === "/api/payments/prepare") return json(s.overview)
  if (path === "/api/payments/component") return json({ error: tt("The ID and bank forms only load on a real account. Everything around them is the real page.") }, 400)
  if (path.startsWith("/api/payments/")) return json({ error: tt("Not available in the demo.") }, 400)
  if (path === "/api/stripe/cashout" && method === "POST") {
    if (s.available <= 0) return json({ error: tt("There is nothing available to cash out yet.") }, 400)
    const amount = s.available
    s.payouts.unshift({ id: `po_demo_${Date.now()}`, amount, currency: s.currency, status: "in_transit", arrival_date: Math.floor(Date.now() / 1000) + 2 * 86400, created: Math.floor(Date.now() / 1000), method: "standard", type: "bank_account", description: null, destination: tt("Banca Demo ••••4821") })
    s.available = 0
    return json({ payout: { amount, currency: s.currency } })
  }
  if (path === "/api/stripe/refund" && method === "POST") {
    const b = await bodyOf(init)
    const o = s.orders.find((x) => x.id === b.orderId)
    if (!o || o.status !== "completed") return json({ error: tt("This sale cannot be refunded.") }, 400)
    o.status = "refunded"
    o.refund_amount_cents = o.amount_cents
    o.refunded_at = new Date().toISOString()
    s.pending = Math.max(0, s.pending - (o.amount_cents - o.fee_cents))
    return json({ success: true })
  }
  if (path === "/api/stripe/order-timeline") {
    const o = s.orders.find((x) => x.id === url.searchParams.get("orderId"))
    const paid = o ? o.created_at : new Date().toISOString()
    const ready = new Date(Date.parse(paid) + s.settleDays * 86_400_000).toISOString()
    const settled = Date.parse(ready) < Date.now()
    return json({
      timeline: [
        { id: "paid", label: tt("Payment received"), description: tt("The buyer paid at checkout."), timestamp: paid, status: "completed" },
        { id: "settle", label: settled ? tt("Settled") : tt("Settling"), description: tt("Available about {settleDays} days after payment.", { settleDays: s.settleDays }), timestamp: settled ? ready : null, status: settled ? "completed" : "pending" },
        { id: "available", label: tt("Available to cash out"), description: tt("Cash out sends it to your bank."), timestamp: settled ? ready : null, status: settled ? "completed" : "upcoming" },
      ],
    })
  }
  if (path === "/api/receipt/resend") return json({ success: true })
  if (path.startsWith("/api/app/orders/") && path.endsWith("/email")) {
    const b = await bodyOf(init)
    return json({ email: b.email, sent: 1 })
  }
  if (path === "/api/stripe/tax-summary") return json({})
  return null
}

export function PayoutsDemo() {
  const router = useRouter()
  const [scenario, setScenario] = React.useState<ScenarioId>("active")
  const [currency, setCurrency] = React.useState<DemoCurrency>("ron")
  const [installed, setInstalled] = React.useState(false)
  const [locking, setLocking] = React.useState(false)

  /* Built in render, so the requests the page makes on its first mount are answered from the scenario now on screen. */
  const data = React.useMemo(() => buildScenario(scenario, currency), [scenario, currency])
  const current = React.useRef(data)
  current.current = data

  /* The page's requests, answered here while the demo is open, and only these. Children mount after it is in place. */
  React.useEffect(() => {
    const original = window.fetch
    const wrapped: typeof window.fetch = async (input, init) => {
      const href = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
      const url = new URL(href, window.location.origin)
      if (url.origin === window.location.origin) {
        const res = await answer(current.current, url, init)
        if (res) return res
      }
      return original(input, init)
    }
    window.fetch = wrapped
    forgetOverview()
    setInstalled(true)
    return () => {
      window.fetch = original
      forgetOverview()
    }
  }, [])

  const choose = (next: { scenario?: ScenarioId; currency?: DemoCurrency }) => {
    forgetOverview()
    if (next.scenario) setScenario(next.scenario)
    if (next.currency) setCurrency(next.currency)
  }

  const lock = async () => {
    setLocking(true)
    await fetch("/api/payouts-demo/unlock", { method: "DELETE" }).catch(() => null)
    router.refresh()
  }

  const key = `${scenario}-${currency}`
  const disputed = data.orders.filter((o) => o.status === "disputed")

  return (
    <div className="orders-pane h-full overflow-y-auto overflow-x-hidden page-scroll bg-[#f8f9fa] app-page-enter" data-payouts-demo="">
      {/* The demo's own bar: which made up account, in which currency, and the lock. */}
      <div className="sticky top-0 z-30 border-b border-[#ece9ff] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-[1200px] items-center gap-2 py-2 app-gutter">
          <span className="inline-flex h-6 shrink-0 items-center rounded-full bg-[#f4f3ff] px-2.5 text-[12px] font-semibold text-[#6d4ae8]">{tt("Demo")}</span>
          <div className="app-no-scrollbar -my-1 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1" role="tablist" aria-label={tt("Scenario")}>
            {SCENARIOS.map((sc) => (
              <button
                key={sc.id}
                type="button"
                role="tab"
                aria-selected={scenario === sc.id}
                onClick={() => choose({ scenario: sc.id })}
                className={cn(
                  "h-8 shrink-0 cursor-pointer whitespace-nowrap rounded-full px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 max-md:h-9",
                  scenario === sc.id ? "bg-[#1a1a2e] text-white" : "bg-[#f1f2f4] text-[#4b5563] hover:bg-[#e8e9ec] hover:text-[#1a1a2e]",
                )}
              >
                {sc.label}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="demo-currency">{tt("Currency")}</label>
          <select
            id="demo-currency"
            value={currency}
            onChange={(e) => choose({ currency: e.target.value as DemoCurrency })}
            className="h-8 shrink-0 cursor-pointer rounded-lg border border-[#e3e5e8] bg-white px-2 text-[16px] font-medium text-[#1a1a2e] outline-none focus-visible:ring-2 focus-visible:ring-[#8b5cf6]/40 sm:text-[13px] max-md:h-9"
          >
            {DEMO_CURRENCIES.map((c) => (
              <option key={c} value={c}>{c.toUpperCase()}</option>
            ))}
          </select>
          <button type="button" onClick={() => void lock()} disabled={locking} aria-label={tt("Lock the demo")} className={cn(secondaryDepth, "h-8 w-8 shrink-0 rounded-lg px-0 max-md:h-9 max-md:w-9")}>
            <Lock className="h-3.5 w-3.5 text-[#6b7280]" />
          </button>
        </div>
      </div>

      {!installed ? null : data.paymentsReady ? (
        <React.Fragment key={key}>
          {/* app/app/payouts/page.tsx's own frame, around the production client. */}
          <PaneBar width="max-w-[1200px]" className="flex min-h-[66px] items-center justify-between gap-3 pb-2 pt-[14px]">
            <div className="min-w-0">
              <h1 className="truncate text-[24px] font-bold leading-8 text-[#1a1a2e] sm:text-[28px] sm:leading-9">{tt("Payouts")}</h1>
            </div>
            <div data-payouts-actions="" className="flex shrink-0 items-center gap-1.5 md:gap-2" />
          </PaneBar>
          <div className="mx-auto max-w-[1200px] app-gutter pb-8">
            <PayoutsClient
              paymentsReady
              creator={{ id: "demo-creator", username: "demo", stripe_account_id: "acct_demo", payouts_enabled: true, charges_enabled: true, default_currency: currency }}
              initialData={{
                balanceCurrency: currency,
                salesCurrency: currency,
                pendingAmount: data.pending,
                availableBalance: data.available,
                stripeRead: true,
                negativeBalance: data.negativeBalance,
                activeDisputeCount: disputed.length,
                totalDisputedAmount: disputed.reduce((t, o) => t + o.amount_cents, 0),
                taxData: null,
              }}
              initialOrders={data.orders}
            />
          </div>
        </React.Fragment>
      ) : (
        <div key={key} className="mx-auto min-h-full max-w-[1200px] app-gutter pb-24 md:pb-8" data-payouts-setup="">
          <header className="pb-1 pt-2">
            <h1 className="flex min-h-[48px] items-center text-[24px] font-bold text-[#1a1a2e] sm:text-[28px]">{tt("Payouts")}</h1>
            <p className="-mt-1 text-[13px] leading-5 text-[#6b7280]">{tt("Set up payments to start selling")}</p>
          </header>
          <div className="mt-4">
            <StorelibPaymentsInline compact />
          </div>
        </div>
      )}
    </div>
  )
}

/** The door: the demo password, checked on the server (app/api/payouts-demo/unlock). */
export function PayoutsDemoGate() {
  const router = useRouter()
  const [password, setPassword] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError(null)
    try {
      const r = await fetch("/api/payouts-demo/unlock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) })
      const body = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(body.error || tt("That did not work. Try again."))
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("That did not work. Try again."))
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-h-[70vh] items-center justify-center bg-[#f8f9fa] px-4 app-page-enter">
      <form onSubmit={submit} className="w-full max-w-[380px] rounded-2xl border border-[#e5e7eb]/80 bg-white p-6 shadow-[0_1px_3px_rgba(16,24,40,0.05),0_12px_32px_-16px_rgba(16,24,40,0.10)]">
        <span className="inline-flex h-6 items-center rounded-full bg-[#f4f3ff] px-2.5 text-[12px] font-semibold text-[#6d4ae8]">{tt("Demo")}</span>
        <h1 className="mt-3 text-[20px] font-semibold text-[#1a1a2e]">{tt("Payouts demo")}</h1>
        <p className="mt-1 text-[14px] leading-5 text-[#6b7280]">{tt("The real Payouts page with made up accounts. Enter the password to open it.")}</p>
        <label htmlFor="demo-password" className="mt-5 block text-[13px] font-medium text-[#1a1a2e]">{tt("Password")}</label>
        <input
          id="demo-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 h-11 w-full rounded-[10px] border border-[#e3e5e8] bg-white px-3.5 text-[16px] text-[#1a1a2e] outline-none transition-[border-color,box-shadow] duration-150 focus:border-[#c9ccd3] focus:shadow-[0_0_0_3px_rgba(17,17,19,0.06)] sm:h-10 sm:text-[14px]"
        />
        {error ? <p role="alert" className="mt-2 text-[12.5px] text-[#c4290c]">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !password}
          className="mt-5 inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-xl bg-[#1a1a2e] text-[14px] font-semibold text-white transition-colors hover:bg-[#2a2a40] disabled:cursor-not-allowed disabled:opacity-60 sm:h-10 sm:rounded-lg"
        >
          {busy ? tt("Opening") : tt("Open the demo")}
        </button>
      </form>
    </div>
  )
}
