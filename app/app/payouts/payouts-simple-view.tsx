"use client"

import * as React from "react"
import { ChevronDown, ChevronUp } from "lucide-react"
import { money } from "@/components/app/settings/payments-hub-shared"
import { cn } from "@/lib/utils"

const CARD =
  "overflow-hidden rounded-2xl border border-[#e5e7eb]/60 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]"

type PayoutRow = {
  id: string
  amount: number
  currency: string
  status: string
  arrivalDate: string | null
  created: string | null
}

export function PayoutsSimpleView({
  availableMinor,
  pendingMinor,
  currency,
}: {
  availableMinor: number
  pendingMinor: number
  currency: string
}) {
  const [bankLast4, setBankLast4] = React.useState<string | null>(null)
  const [nextPayout, setNextPayout] = React.useState<{ amountMinor: number; currency: string; arrivalDate: string | null } | null>(null)
  const [history, setHistory] = React.useState<PayoutRow[]>([])
  const [historyOpen, setHistoryOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [overviewRes, payoutsRes] = await Promise.all([
          fetch("/api/payments/overview", { cache: "no-store" }),
          fetch("/api/stripe/payouts", { cache: "no-store" }),
        ])
        const overview = overviewRes.ok ? await overviewRes.json() : null
        const payoutsJson = payoutsRes.ok ? await payoutsRes.json() : null
        if (cancelled) return

        const cur = (currency || overview?.balances?.[0]?.currency || "USD").toUpperCase()
        const dest = overview?.payoutDestination
        if (dest?.last4) setBankLast4(dest.last4)

        if (overview?.nextPayout) {
          setNextPayout({
            amountMinor: overview.nextPayout.amountMinor,
            currency: overview.nextPayout.currency || cur,
            arrivalDate: overview.nextPayout.arrivalDate ?? null,
          })
        }

        const list = (payoutsJson?.payouts || []) as Array<{
          id: string
          amount: number
          currency: string
          status: string
          arrival_date?: number | null
          created?: number | null
        }>
        setHistory(
          list.slice(0, 20).map((p) => ({
            id: p.id,
            amount: p.amount,
            currency: (p.currency || cur).toUpperCase(),
            status: p.status,
            arrivalDate: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
            created: p.created ? new Date(p.created * 1000).toISOString() : null,
          })),
        )
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [currency])

  const cur = currency.toUpperCase()
  const formatArrival = (iso: string | null) => {
    if (!iso) return null
    try {
      return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(iso))
    } catch {
      return null
    }
  }

  return (
    <div className="space-y-4 pt-2" data-payouts-simple="">
      <section className={cn(CARD, "px-5 py-6 sm:px-6")}>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-[#9ca3af]">Available balance</p>
            <p className="mt-1 text-[28px] font-bold tabular-nums text-[#1a1a2e] sm:text-[32px]">
              {money(availableMinor, cur)}
            </p>
          </div>
          <div>
            <p className="text-[12px] font-medium uppercase tracking-wide text-[#9ca3af]">Pending</p>
            <p className="mt-1 text-[22px] font-semibold tabular-nums text-[#374151] sm:text-[24px]">
              {money(pendingMinor, cur)}
            </p>
          </div>
        </div>

        {nextPayout && nextPayout.amountMinor > 0 ? (
          <p className="mt-5 text-[14px] text-[#4b5563]">
            <span className="font-medium text-[#1a1a2e]">Next payout</span>
            {" · "}
            {formatArrival(nextPayout.arrivalDate) ? `${formatArrival(nextPayout.arrivalDate)} · ` : ""}
            {money(nextPayout.amountMinor, nextPayout.currency)}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[#eef0f2] pt-5">
          <div className="text-[14px] text-[#4b5563]">
            <span className="font-medium text-[#1a1a2e]">Bank account</span>
            {bankLast4 ? <span className="ml-2 tabular-nums text-[#6b7280]">•••• {bankLast4}</span> : loading ? <span className="ml-2 text-[#9ca3af]">…</span> : <span className="ml-2 text-[#9ca3af]">Not linked</span>}
          </div>
          <a
            href="/app/settings?tab=payments"
            className="text-[13px] font-medium text-[#1a1a2e] underline-offset-2 hover:underline"
          >
            Manage in Settings
          </a>
        </div>
      </section>

      <section className={CARD}>
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left sm:px-6"
          onClick={() => setHistoryOpen((o) => !o)}
          aria-expanded={historyOpen}
        >
          <span className="text-[14px] font-semibold text-[#1a1a2e]">Payout history</span>
          {historyOpen ? <ChevronUp className="h-4 w-4 text-[#9ca3af]" /> : <ChevronDown className="h-4 w-4 text-[#9ca3af]" />}
        </button>
        {historyOpen ? (
          <ul className="border-t border-[#eef0f2]">
            {history.length === 0 ? (
              <li className="px-5 py-6 text-[13px] text-[#9ca3af] sm:px-6">{loading ? "Loading…" : "No payouts yet."}</li>
            ) : (
              history.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 border-b border-[#f3f4f6] px-5 py-3.5 last:border-0 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-[14px] font-medium tabular-nums text-[#1a1a2e]">{money(p.amount, p.currency)}</p>
                    <p className="text-[12px] capitalize text-[#9ca3af]">{p.status.replace(/_/g, " ")}</p>
                  </div>
                  <p className="shrink-0 text-[12px] text-[#6b7280]">
                    {formatArrival(p.arrivalDate || p.created) ?? "—"}
                  </p>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
