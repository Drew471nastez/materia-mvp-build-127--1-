"use client"

import * as React from "react"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"

type Purpose = "stripe_onboarding" | "stripe_management" | "stripe_payouts"

function humanLoadError(type?: string): string {
  if (type === "rate_limit_error") return "Too many tries. Wait a moment, then try again."
  return "Verification could not load. Try again in a moment."
}

function shownError(message: string): string {
  if (/invalid_request|acct_|accs_|capability|requirement|sk_|whsec/i.test(message)) {
    return "Verification could not load. Try again in a moment."
  }
  return message
}

async function openSession(purpose: Purpose): Promise<{ clientSecret: string; publishableKey: string }> {
  const res = await fetch("/api/payments/component", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as { clientSecret?: unknown; publishableKey?: unknown; error?: unknown }
  const clientSecret = typeof data.clientSecret === "string" ? data.clientSecret.trim() : ""
  const publishableKey = typeof data.publishableKey === "string" ? data.publishableKey.trim() : ""
  const apiError = typeof data.error === "string" ? data.error : ""
  if (!res.ok || !clientSecret.startsWith("accs_") || !publishableKey.startsWith("pk_")) {
    throw new Error(shownError(apiError || "Verification could not load. Try again in a moment."))
  }
  return { clientSecret, publishableKey }
}

export function StripeConnectEmbedded({
  purpose,
  onExit,
  onError,
  onStep,
}: {
  purpose: Purpose
  onExit: () => void | Promise<void>
  onError: (message: string | null) => void
  onStep?: (step: "verification" | "bank") => void
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)

  React.useEffect(() => {
    let gone = false
    let el: HTMLElement | null = null
    ;(async () => {
      try {
        const first = await openSession(purpose)
        if (gone) return
        let pending: string | null = first.clientSecret
        const { loadConnectAndInitialize } = await import("@stripe/connect-js/pure")
        const connect = loadConnectAndInitialize({
          publishableKey: first.publishableKey,
          fetchClientSecret: async () => {
            if (pending) {
              const secret = pending
              pending = null
              return secret
            }
            const next = await openSession(purpose)
            if (next.publishableKey !== first.publishableKey) {
              throw new Error("Verification could not load. Try again in a moment.")
            }
            return next.clientSecret
          },
          appearance: {
            variables: {
              colorPrimary: "#111827",
              colorBackground: "#ffffff",
              colorText: "#111827",
              colorSecondaryText: "#6b7280",
              colorBorder: "#e5e7eb",
              buttonPrimaryColorText: "#ffffff",
              fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
              borderRadius: "12px",
            },
          },
        })
        if (gone || !host.current) return
        const tag = purpose === "stripe_onboarding" ? "account-onboarding" : purpose === "stripe_management" ? "account-management" : "payouts"
        const component = connect.create(tag) as HTMLElement & {
          setOnExit?: (fn: () => void) => void
          setOnLoadError?: (fn: (event: { error?: { type?: string } }) => void) => void
          setOnStepChange?: (fn: (event: { step: string }) => void) => void
          setCollectionOptions?: (options: { fields: "eventually_due"; futureRequirements: "include" }) => void
        }
        component.setCollectionOptions?.({ fields: "eventually_due", futureRequirements: "include" })
        component.setOnExit?.(() => {
          void onExit()
        })
        component.setOnLoadError?.(({ error }) => onError(humanLoadError(error?.type)))
        component.setOnStepChange?.(({ step }) => {
          onStep?.(/external_account|bank_account|payout/i.test(step) ? "bank" : "verification")
        })
        host.current.innerHTML = ""
        host.current.appendChild(component)
        el = component
        setReady(true)
      } catch (e) {
        if (!gone) onError(shownError(e instanceof Error ? e.message : "Verification could not load. Try again in a moment."))
      }
    })()
    return () => {
      gone = true
      if (el?.parentNode) el.parentNode.removeChild(el)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose])

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white">
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <WaitingArea className="h-24" size={18} label="Loading" />
        </div>
      ) : null}
      <div ref={host} className={cn("min-h-[420px]", !ready && "invisible")} />
    </div>
  )
}
