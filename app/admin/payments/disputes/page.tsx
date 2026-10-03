"use client"

import * as React from "react"

import { Banner, Panel } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function DisputesPage() {
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([])
  const [cases, setCases] = React.useState<Array<Record<string, unknown>>>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    void adminPaymentsRead<{ rows: Array<Record<string, unknown>>; cases?: Array<Record<string, unknown>> }>("/api/admin/payments/disputes").then((r) => {
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setRows(r.rows)
        setCases(r.cases ?? [])
      }
    })
  }, [])

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Cases" meta="Answer each in the Stripe Dashboard before its deadline, with the creator's evidence">
        {cases.length === 0 ? (
          <p className="px-3 py-3 text-[12px] text-[#9b9ba6]">No recorded disputes yet.</p>
        ) : (
          <table className="w-full text-left text-[12px]">
            <thead className="text-[#6b6b76]">
              <tr>
                <th className="px-3 py-2">Dispute</th>
                <th className="px-3 py-2">Creator</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Respond by</th>
                <th className="px-3 py-2">Taken back</th>
                <th className="px-3 py-2">Creator evidence</th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c) => {
                const creator = c.creator as { slug?: string | null; display_name?: string | null } | null
                const due = c.evidenceDueBy ? new Date(String(c.evidenceDueBy)).toLocaleDateString() : "n/a"
                return (
                  <tr key={String(c.disputeId)} className="border-t border-white/[0.06] align-top">
                    <td className="px-3 py-1.5 font-mono text-[11px]">{String(c.disputeId)}</td>
                    <td className="px-3 py-1.5">{creator?.display_name || creator?.slug || "Unknown"}</td>
                    <td className="px-3 py-1.5 tabular-nums">{(Number(c.amount) / 100).toFixed(2)} {String(c.currency)}</td>
                    <td className="px-3 py-1.5">{c.inquiry ? "Inquiry, " : ""}{String(c.outcome ?? c.status)}</td>
                    <td className="px-3 py-1.5 tabular-nums">{c.closed ? "Closed" : due}</td>
                    <td className="px-3 py-1.5 tabular-nums">{(Number(c.reversed) / 100).toFixed(2)} ({String(c.recovery)})</td>
                    <td className="max-w-[360px] whitespace-pre-wrap px-3 py-1.5 text-[#cfcfd6]">{c.creatorNote ? String(c.creatorNote) : <span className="text-[#6b6b76]">None yet</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Panel>
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
