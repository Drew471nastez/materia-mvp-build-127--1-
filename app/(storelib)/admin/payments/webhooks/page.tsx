"use client"

import * as React from "react"

import { ago } from "../../_console/format"
import { Banner, Panel, Toolbar } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

export default function WebhooksPage() {
  const [scope, setScope] = React.useState<"" | "platform" | "connect">("")
  const [rows, setRows] = React.useState<Array<Record<string, unknown>>>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const p = new URLSearchParams()
    if (scope) p.set("scope", scope)
    void adminPaymentsRead<{ rows: Array<Record<string, unknown>>; unavailable?: string }>(`/api/admin/payments/webhooks?${p}`).then((r) => {
      if (r && "error" in r) setError(r.error)
      else if (r && "unavailable" in r) setError(String(r.unavailable))
      else {
        setError(null)
        setRows(r.rows)
      }
    })
  }, [scope])

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Webhook ledger">
        <Toolbar>
          <select className="rounded border border-white/10 bg-[#17171d] px-2 py-1 text-[12px]" value={scope} onChange={(e) => setScope(e.target.value as typeof scope)}>
            <option value="">All</option>
            <option value="platform">Platform</option>
            <option value="connect">Connect</option>
          </select>
        </Toolbar>
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Scope</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Received</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={String(r.eventId)} className="border-t border-white/[0.06]">
                <td className="px-3 py-1 font-mono text-[11px]">{String(r.eventId).slice(0, 14)}…</td>
                <td className="px-3 py-1">{String(r.type)}</td>
                <td className="px-3 py-1">{String(r.scope)}</td>
                <td className="px-3 py-1">{String(r.processingStatus)}</td>
                <td className="px-3 py-1">{r.receivedAt ? ago(String(r.receivedAt)) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
