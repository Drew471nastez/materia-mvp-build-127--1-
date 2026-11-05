"use client"

import * as React from "react"

import { Banner, Panel } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function PayoutsPage() {
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void adminPaymentsRead<{ rows: Array<Record<string, unknown>> }>("/api/admin/payments/payouts").then((r) => {
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
      <Panel title="Payout operations" meta="Monitoring only — no manual money movement">
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-3 py-2">Creator</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Failure</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.id)} className="border-t border-white/[0.06]">
                <td className="px-3 py-1">{String((r.creator as { handle?: string })?.handle ?? "—")}</td>
                <td className="px-3 py-1 tabular-nums">{String(r.amount)} {String(r.currency)}</td>
                <td className="px-3 py-1">{String(r.status)}</td>
                <td className="px-3 py-1 text-[#f47067]">{String(r.failure ?? "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
