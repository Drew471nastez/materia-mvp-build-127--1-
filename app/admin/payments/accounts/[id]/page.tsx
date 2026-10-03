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
  const summary = data?.summary as Summary | undefined

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
        {summary ? <SummaryTable s={summary} /> : null}
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

interface Summary {
  connectedAccountId: string | null
  country: string | null
  accountType: string | null
  chargesEnabled: boolean
  payoutsEnabled: boolean
  transfers: string | null
  canAcceptPayments: boolean | null
  storelibStatus: string | null
  disabledReason: string | null
  currentlyDue: string[]
  pastDue: string[]
  eventuallyDue: string[]
  pendingVerification: string[]
  errors: Array<{ requirement: string | null; code: string | null }>
  lastSynced: string | null
  latestWebhook: { id: string | null; type: string | null; at: string | null } | null
}

/* What Stripe says and what Storelib made of it, in one table. Masked data only. */
function SummaryTable({ s }: { s: Summary }) {
  const yes = (v: boolean | null) => (v === null ? "unknown" : v ? "yes" : "no")
  const list = (v: string[]) => (v.length ? v.join(", ") : "none")
  const when = (v: string | null) => (v ? new Date(v).toLocaleString() : "never")
  const rows: Array<[string, string]> = [
    ["Storelib status", s.storelibStatus ?? "unknown"],
    ["Checkout can take payment", yes(s.canAcceptPayments)],
    ["Connected account", s.connectedAccountId ?? "none"],
    ["Country", s.country ?? "unknown"],
    ["Account type", s.accountType ?? "unknown"],
    ["Charges enabled", yes(s.chargesEnabled)],
    ["Payouts enabled", yes(s.payoutsEnabled)],
    ["Transfers capability", s.transfers ?? "unknown"],
    ["Disabled reason", s.disabledReason ?? "none"],
    ["Currently due", list(s.currentlyDue)],
    ["Past due", list(s.pastDue)],
    ["Eventually due", list(s.eventuallyDue)],
    ["Pending verification", list(s.pendingVerification)],
    ["Requirement errors", s.errors.length ? s.errors.map((e) => `${e.requirement ?? "unknown"}: ${e.code ?? "unknown"}`).join(", ") : "none"],
    ["Last synced", when(s.lastSynced)],
    ["Latest webhook", s.latestWebhook ? `${s.latestWebhook.type ?? "unknown"} (${when(s.latestWebhook.at)})` : "none"],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 border-b border-white/10 px-4 py-4 text-[13px] sm:grid-cols-[200px_1fr]" data-admin-account-summary="">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-[#9b9ba6]">{k}</dt>
          <dd className="break-words font-mono text-[12px] text-[#e5e5ea]">{v}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}
