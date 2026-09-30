"use client"

import * as React from "react"

import { Banner, Panel } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function DisputesPage() {
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void adminPaymentsRead<{ rows: Array<Record<string, unknown>> }>("/api/admin/payments/disputes").then((r) => {
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
      <Panel title="Disputes" meta="Stripe decides outcomes — visibility only">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Product</th>
              <th className="px-3 py-2">Impact</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.orderId)} className="border-t border-white/[0.06]">
                <td className="px-3 py-1 font-mono text-[11px]">{String(r.orderId).slice(0, 8)}…</td>
                <td className="px-3 py-1 tabular-nums">{String(r.amount)}</td>
                <td className="px-3 py-1">{String(r.product ?? "—")}</td>
                <td className="px-3 py-1 text-[#9b9ba6]">{String(r.financialImpact)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
