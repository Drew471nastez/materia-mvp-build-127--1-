"use client"

import * as React from "react"
import type { CollectionOptions } from "@stripe/connect-js"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { cn } from "@/lib/utils"

export type EmbeddedPurpose = "stripe_onboarding" | "stripe_management" | "stripe_payouts"

const LOAD_FAILED = "Try again in a moment."

function shownError(message: string): string {
  if (!message || /invalid_request|acct_|accs_|capability|requirement|sk_|whsec|stripe/i.test(message)) return LOAD_FAILED
  return message
}

/**
 * A fresh Account Session for the signed-in creator's own account. The
 * server resolves the account from the session cookie; nothing here names it.
 * The secret lives only in this closure until Stripe.js takes it.
 */
async function openSession(purpose: EmbeddedPurpose): Promise<{ clientSecret: string; publishableKey: string }> {
  const res = await fetch("/api/payments/component", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as { clientSecret?: unknown; publishableKey?: unknown; error?: unknown }
  const clientSecret = typeof data.clientSecret === "string" ? data.clientSecret.trim() : ""
  const publishableKey = typeof data.publishableKey === "string" ? data.publishableKey.trim() : ""
  if (!res.ok || !clientSecret.startsWith("accs_") || !publishableKey.startsWith("pk_")) {
    throw new Error(shownError(typeof data.error === "string" ? data.error : ""))
  }
  return { clientSecret, publishableKey }
}

const APPEARANCE = {
  overlays: "dialog" as const,
  variables: {
    colorPrimary: "#1a1a2e",
    colorBackground: "#ffffff",
    colorText: "#1a1a2e",
    colorSecondaryText: "#6b7280",
    colorBorder: "#e5e7eb",
    buttonPrimaryColorText: "#ffffff",
    fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    borderRadius: "12px",
  },
}

/**
 * Stripe's embedded onboarding, account management or payouts, drawn inside
 * Storelib. Only `currently_due` is collected unless told otherwise, so a
 * creator is asked the least Stripe needs today; later asks reopen it.
 */
export function StripeConnectEmbedded({
  purpose,
  collection,
  failedTitle = "Couldn't load verification",
  onExit,
  onStep,
  className,
}: {
  purpose: EmbeddedPurpose
  collection?: CollectionOptions
  failedTitle?: string
  onExit?: () => void | Promise<void>
  onStep?: (step: string) => void
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const handlers = React.useRef({ onExit, onStep })
  handlers.current = { onExit, onStep }
  const collectionKey = JSON.stringify(collection ?? null)

  React.useEffect(() => {
    let gone = false
    let el: HTMLElement | null = null
    setReady(false)
    setFailed(null)
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
            if (next.publishableKey !== first.publishableKey) throw new Error(LOAD_FAILED)
            return next.clientSecret
          },
          appearance: APPEARANCE,
        })
        if (gone || !host.current) return
        const options: CollectionOptions = collection ?? { fields: "currently_due", futureRequirements: "omit" }
        let component: HTMLElement
        if (purpose === "stripe_onboarding") {
          const onboarding = connect.create("account-onboarding")
          onboarding.setCollectionOptions(options)
          onboarding.setOnExit(() => void handlers.current.onExit?.())
          onboarding.setOnStepChange(({ step }) => handlers.current.onStep?.(step))
          onboarding.setOnLoaderStart(() => !gone && setReady(true))
          onboarding.setOnLoadError(() => !gone && setFailed(LOAD_FAILED))
          component = onboarding
        } else if (purpose === "stripe_management") {
          const management = connect.create("account-management")
          management.setCollectionOptions(options)
          management.setOnLoaderStart(() => !gone && setReady(true))
          management.setOnLoadError(() => !gone && setFailed(LOAD_FAILED))
          component = management
        } else {
          const payouts = connect.create("payouts")
          payouts.setOnLoaderStart(() => !gone && setReady(true))
          payouts.setOnLoadError(() => !gone && setFailed(LOAD_FAILED))
          component = payouts
        }
        host.current.replaceChildren(component)
        el = component
      } catch (e) {
        if (!gone) setFailed(shownError(e instanceof Error ? e.message : ""))
      }
    })()
    return () => {
      gone = true
      el?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, collectionKey, attempt])

  if (failed) {
    return (
      <div data-embedded-failed="" className={cn("flex min-h-[320px] flex-col items-center justify-center rounded-xl border border-[#e5e7eb] bg-white px-6 text-center", className)}>
        <p className="text-[15px] font-semibold text-[#1a1a2e]">{failedTitle}</p>
        <p className="mt-1 text-[14px] text-[#6b7280]">{failed}</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#1a1a2e] px-4 text-[14px] font-medium text-white hover:bg-[#2a2a44] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30"
        >
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className={cn("relative min-h-[320px]", className)}>
      {!ready ? (
        <div className="absolute inset-0 flex items-center justify-center" aria-live="polite">
          <WaitingArea className="h-24" size={18} label="Loading" />
        </div>
      ) : null}
      <div ref={host} className={cn("min-h-[320px] transition-opacity duration-200", ready ? "opacity-100" : "opacity-0")} />
    </div>
  )
}
