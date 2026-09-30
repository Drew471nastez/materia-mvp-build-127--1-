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
            overlays: "dialog",
            variables: {
              colorPrimary: "#8b5cf6",
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
    <div className="mt-4 border-t border-[#f0f1f3] pt-4">
      {!ready ? <WaitingArea className="h-24" size={18} label="Loading verification" /> : null}
      <div ref={host} className={cn("min-h-[320px]", !ready && "h-0 overflow-hidden")} />
      <div className="mt-3">
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
