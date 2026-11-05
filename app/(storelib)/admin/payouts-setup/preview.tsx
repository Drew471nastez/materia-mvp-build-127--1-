"use client"

import { useEffect, useState } from "react"
import { PaymentsSetupFlow } from "@/components/app/settings/payments-setup-flow"
import { StorelibLogo } from "@/components/brand/storelib-logo"
import type { Overview } from "@/components/app/settings/payments-hub-shared"
import { fetchOverview } from "@/lib/payments/overview-cache"

/**
 * The same payout setup creators open from Settings. Nothing here is a copy
 * of the form: it is PaymentsSetupFlow, so what you see is what they see.
 */
export function PayoutsSetupPreview() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(true)

  useEffect(() => {
    let gone = false
    void fetchOverview()
      .then((next) => {
        if (!gone) setData(next)
      })
      .catch((err: unknown) => {
        if (!gone) setError(err instanceof Error ? err.message : "Could not load payments.")
      })
    return () => {
      gone = true
    }
  }, [])

  return (
    <div className="relative min-h-svh bg-[#f6f7f9] font-sans text-[#1a1a2e]">
      <header className="border-b border-[#eceef1] bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4">
          <StorelibLogo size={32} />
          <span className="text-[13px] font-medium text-[#6b7280]">Simulator · payout setup</span>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-9 items-center rounded-lg bg-[#1a1a2e] px-3 text-[13px] font-medium text-white"
            >
              Open setup
            </button>
          ) : null}
        </div>
      </header>
      {error ? (
        <p className="mx-auto max-w-lg px-4 py-16 text-center text-[14px] text-[#6b7280]">{error}</p>
      ) : null}
      {!data && !error ? (
        <div className="flex justify-center py-24">
          <span aria-label="Loading" className="h-5 w-5 animate-spin rounded-full border-2 border-[#1a1a2e]/10 border-t-[#1a1a2e]/60" />
        </div>
      ) : null}
      {data ? (
        <PaymentsSetupFlow open={open} mode="setup" data={data} onClose={() => setOpen(false)} onData={setData} onFinished={() => setOpen(false)} />
      ) : null}
    </div>
  )
}
