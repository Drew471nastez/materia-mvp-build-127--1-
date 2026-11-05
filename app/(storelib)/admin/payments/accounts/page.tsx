"use client"

import * as React from "react"
import Link from "next/link"

import { Banner, Panel, SearchField } from "../../_console/ui"
import { adminPaymentsRead } from "../_fetch"

type Row = {
  id: string
  label: string
  storelibState: string
  chargesEnabled: boolean
  payoutsEnabled: boolean
  actionRequired: boolean
  lastSync: string | null
}

export default function AccountsPage() {
  const [q, setQ] = React.useState("")
  const [rows, setRows] = React.useState<Row[]>([])
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const p = new URLSearchParams()
    if (q.trim()) p.set("q", q.trim())
    void adminPaymentsRead<{ rows: Row[] }>(`/api/admin/payments/accounts?${p}`).then((r) => {
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setRows(r.rows)
      }
    })
  }, [q])

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel title="Creator payment accounts">
        <div className="px-4 py-3">
          <SearchField value={q} onChange={setQ} label="Search payment accounts" placeholder="Creator, slug, or account id" />
        </div>
        <table className="w-full text-left text-[12px]">
          <thead className="text-[#6b6b76]">
            <tr>
              <th className="px-4 py-2">Creator</th>
              <th className="px-4 py-2">State</th>
              <th className="px-4 py-2">Charges</th>
              <th className="px-4 py-2">Payouts</th>
              <th className="px-4 py-2">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/[0.06]">
                <td className="px-4 py-2">
                  <Link href={`/admin/payments/accounts/${r.id}`} className="text-[#8b5cf6] hover:underline">{r.label}</Link>
                </td>
                <td className="px-4 py-2">{r.storelibState}</td>
                <td className="px-4 py-2">{r.chargesEnabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{r.payoutsEnabled ? "Yes" : "No"}</td>
                <td className="px-4 py-2">{r.actionRequired ? "Required" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  )
}
