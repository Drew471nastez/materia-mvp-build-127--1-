"use client"

import * as React from "react"

import { Banner, Panel } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function TransactionsPage() {
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void adminPaymentsRead<{ rows: Array<Record<string, unknown>> }>("/api/admin/payments/transactions").then((r) => {
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setRows(r.rows)
      }
    })
  }, [])

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Transactions">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Gross</th>
              <th className="px-3 py-2">Fee</th>
              <th className="px-3 py-2">Tier</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-white/[0.06]">
                <td className="px-3 py-1 font-mono text-[11px]">{String(r.id).slice(0, 8)}…</td>
                <td className="px-3 py-1 tabular-nums">{String(r.amount)}</td>
                <td className="px-3 py-1 tabular-nums">{String(r.fee)}</td>
                <td className="px-3 py-1">{String(r.pricingTier ?? "—")}</td>
                <td className="px-3 py-1">{String(r.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
