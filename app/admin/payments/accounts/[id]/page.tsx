"use client"

import * as React from "react"
import { useParams } from "next/navigation"

import { Banner, Panel } from "../../../_console/ui"
import { adminPaymentsRead } from "../../_fetch"

export default function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [data, setData] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [debug, setDebug] = React.useState(false)

  const load = React.useCallback(() => {
    if (!id) return
    void adminPaymentsRead<Record<string, unknown>>(`/api/admin/payments/accounts/${id}`).then((r) => {
      if (r && "error" in r) setError(r.error)
      else {
        setError(null)
        setData(r)
      }
    })
  }, [id])

  React.useEffect(() => {
    load()
  }, [load])

  async function refresh() {
    if (!id) return
    const res = await fetch(`/api/admin/payments/accounts/${id}/refresh`, { method: "POST" })
    const body = await res.json().catch(() => null)
    if (!res.ok) setError(body?.error || "Refresh failed")
    else setData(body)
  }

  const creator = data?.creator as { label?: string; storelibState?: string } | undefined

  return (
    <div className="space-y-4">
      {error ? <Banner tone="bad">{error}</Banner> : null}
      <Panel
        title={creator?.label || "Creator"}
        meta={creator?.storelibState}
        action={
          <button type="button" className="text-[12px] text-[#8b5cf6]" onClick={() => void refresh()}>
            Refresh from Stripe
          </button>
        }
      >
        <div className="px-4 py-4 text-[13px]">
          <button type="button" className="text-[12px] text-[#9b9ba6] underline" onClick={() => setDebug((d) => !d)}>
            {debug ? "Hide" : "Show"} technical details
          </button>
          {debug && data ? (
            <pre className="mt-3 max-h-96 overflow-auto rounded bg-[#17171d] p-3 text-[11px]">{JSON.stringify(data, null, 2)}</pre>
          ) : (
            <p className="mt-2 text-[#9b9ba6]">Bank details and KYC payloads are never shown here.</p>
          )}
        </div>
      </Panel>
    </div>
  )
}
