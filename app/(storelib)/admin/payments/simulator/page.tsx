"use client"

import * as React from "react"

import { Banner, Panel, Toolbar } from "../../_console/ui"

const PRESETS = [100, 200, 399, 400, 500, 1000]

type SimResult = {
  simulationOnly: boolean
  fee: {
    pricingTier: string
    percentageRate: number
    percentageFeeMinor: number
    fixedFeeMinor: number
    totalStorelibFeeMinor: number
    creatorProceedsMinor: number
    feeRuleVersion: string
  }
  stripeProcessingFeeLabel: string
  storelibMarginMinor: number | null
}

export default function SimulatorPage() {
  const [plan, setPlan] = React.useState<"free" | "paid">("free")
  const [currency, setCurrency] = React.useState("USD")
  const [grossMinor, setGrossMinor] = React.useState(399)
  const [result, setResult] = React.useState<SimResult | null>(null)
  const [batch, setBatch] = React.useState<Array<Record<string, unknown>> | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function runSim() {
    setError(null)
    const res = await fetch("/api/admin/payments/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan, currency, grossMinor, kind: "one_time", refund: "none" }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setError(body?.error || "Simulation failed")
      return
    }
    setResult(body as SimResult)
  }

  async function runBatch() {
    setError(null)
    const res = await fetch("/api/admin/payments/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "batch", plan, currency, startMinor: 50, endMinor: 2000, incrementMinor: 50 }),
    })
    const body = await res.json().catch(() => null)
    if (!res.ok) {
      setError(body?.error || "Batch failed")
      return
    }
    setBatch((body as { rows: Array<Record<string, unknown>> }).rows)
  }

  return (
    <div className="space-y-6">
      <Banner tone="plain">Simulation only — no money will move. No Stripe objects are created.</Banner>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <Panel title="Payment Simulator">
        <div className="space-y-4 px-4 py-4">
          <Toolbar>
            <label className="text-[12px] text-[#9b9ba6]">
              Plan
              <select className="ml-2 rounded border border-white/10 bg-[#17171d] px-2 py-1 text-[13px]" value={plan} onChange={(e) => setPlan(e.target.value as "free" | "paid")}>
                <option value="free">Free</option>
                <option value="paid">Pro</option>
              </select>
            </label>
            <label className="text-[12px] text-[#9b9ba6]">
              Currency
              <input className="ml-2 w-16 rounded border border-white/10 bg-[#17171d] px-2 py-1 text-[13px] uppercase" value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </label>
          </Toolbar>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className="rounded-[7px] border border-white/10 px-2.5 py-1 text-[12px] hover:bg-white/5"
                onClick={() => setGrossMinor(p)}
              >
                {p >= 100 ? `$${(p / 100).toFixed(p === 399 ? 2 : 0)}` : p}
              </button>
            ))}
            <input
              type="number"
              className="w-28 rounded border border-white/10 bg-[#17171d] px-2 py-1 text-[13px]"
              value={grossMinor}
              onChange={(e) => setGrossMinor(Number(e.target.value))}
              aria-label="Custom amount in minor units"
            />
          </div>
          <button type="button" className="rounded-[7px] bg-[#8b5cf6] px-3 py-1.5 text-[13px] font-medium" onClick={() => void runSim()}>
            Simulate payment
          </button>
        </div>
        {result ? (
          <ul className="divide-y divide-white/[0.08] border-t border-white/[0.08] text-[13px]">
            {[
              ["Gross (minor)", result.fee.totalStorelibFeeMinor + result.fee.creatorProceedsMinor],
              ["Pricing tier", result.fee.pricingTier],
              ["Storelib %", `${(result.fee.percentageRate * 100).toFixed(2)}%`],
              ["Percentage fee", result.fee.percentageFeeMinor],
              ["Fixed fee", result.fee.fixedFeeMinor],
              ["Total Storelib fee", result.fee.totalStorelibFeeMinor],
              ["Creator proceeds (before processor)", result.fee.creatorProceedsMinor],
              ["Processor fee", result.stripeProcessingFeeLabel],
              ["Storelib margin", result.storelibMarginMinor ?? "—"],
              ["Fee rule version", result.fee.feeRuleVersion],
            ].map(([k, v]) => (
              <li key={String(k)} className="flex justify-between px-4 py-2">
                <span className="text-[#9b9ba6]">{k}</span>
                <span className="tabular-nums">{String(v)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>

      <Panel title="Batch simulation" meta="$0.50 → $20 every $0.50">
        <div className="px-4 py-4">
          <button type="button" className="rounded-[7px] border border-white/10 px-3 py-1.5 text-[13px] hover:bg-white/5" onClick={() => void runBatch()}>
            Run batch
          </button>
        </div>
        {batch ? (
          <div className="max-h-[420px] overflow-auto border-t border-white/[0.08]">
            <table className="w-full text-left text-[12px]">
              <thead className="sticky top-0 bg-[#111116] text-[#6b6b76]">
                <tr>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Tier</th>
                  <th className="px-3 py-2">Fee</th>
                  <th className="px-3 py-2">Proceeds</th>
                  <th className="px-3 py-2">Eff. %</th>
                  <th className="px-3 py-2">Flags</th>
                </tr>
              </thead>
              <tbody>
                {batch.map((row) => (
                  <tr key={String(row.priceMinor)} className={Array.isArray(row.flags) && row.flags.length ? "bg-red-500/10" : ""}>
                    <td className="px-3 py-1 tabular-nums">{String(row.priceMinor)}</td>
                    <td className="px-3 py-1">{String(row.tier)}</td>
                    <td className="px-3 py-1 tabular-nums">{String(row.storelibFeeMinor)}</td>
                    <td className="px-3 py-1 tabular-nums">{String(row.creatorProceedsMinor)}</td>
                    <td className="px-3 py-1 tabular-nums">{((row.effectiveStorelibPercent as number) * 100).toFixed(1)}%</td>
                    <td className="px-3 py-1 text-[#f47067]">{((row.flags as string[]) || []).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
