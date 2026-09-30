"use client"

import * as React from "react"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"

type Purpose = "stripe_onboarding" | "stripe_management" | "stripe_payouts"

async function fetchClientSecret(purpose: Purpose): Promise<string> {
  const res = await fetch("/api/payments/component", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as { clientSecret?: string; error?: string }
  if (!res.ok || !data.clientSecret) throw new Error(data.error || "Could not open verification.")
  return data.clientSecret
}

export function StripeConnectEmbedded({
  purpose,
  onClose,
  onDone,
  onError,
}: {
  purpose: Purpose
  onClose: () => void
  onDone: () => void | Promise<void>
  onError: (message: string | null) => void
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let gone = false
    let el: HTMLElement | null = null
    ;(async () => {
      try {
        const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
        if (!publishableKey) throw new Error("Payments are not switched on yet.")
        const { loadConnectAndInitialize } = await import("@stripe/connect-js/pure")
        const connect = loadConnectAndInitialize({
          publishableKey,
          fetchClientSecret: () => fetchClientSecret(purpose),
          appearance: {
            variables: {
              colorPrimary: "#1a1a2e",
              colorBackground: "#ffffff",
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              borderRadius: "12px",
            },
          },
        })
        if (gone || !host.current) return
        const tag = purpose === "stripe_onboarding" ? "account-onboarding" : purpose === "stripe_management" ? "account-management" : "payouts"
        const component = connect.create(tag) as HTMLElement & { setOnExit?: (fn: () => void) => void; setOnLoadError?: (fn: () => void) => void }
        component.setOnExit?.(() => {
          void onDone()
        })
        component.setOnLoadError?.(() => onError("Verification could not load. Try again in a moment."))
        host.current.innerHTML = ""
        host.current.appendChild(component)
        el = component
        setReady(true)
      } catch (e) {
        if (!gone) onError(e instanceof Error ? e.message : "Verification could not load.")
      }
    })()
    return () => {
      gone = true
      if (el?.parentNode) el.parentNode.removeChild(el)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose])

  return (
    <div>
      <div className="mb-3">
        <h4 className="text-[14px] font-semibold text-[#111827]">Verify your details</h4>
        <p className="mt-0.5 text-[12px] text-[#6b7280]">Identity and the bank account payouts are sent to. Storelib never shows your full account number.</p>
      </div>
      <div className="relative min-h-[420px] rounded-xl border border-[#e5e7eb] bg-[#fafafb]">
        {!ready ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <WaitingArea className="h-24" size={18} label="Loading verification" />
          </div>
        ) : null}
        <div ref={host} className={cn("min-h-[420px] p-1", !ready && "invisible")} />
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-[#e5e7eb] bg-white px-3 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb]"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  )
}
