"use client"

import * as React from "react"
import type { CollectionOptions } from "@stripe/connect-js"
import { WaitingArea } from "@/components/ui/activity-spinner"
import { openSheet } from "@/lib/payments/identity-client"
import { appHoldsStripeWindows, isNativeApp } from "@/lib/native-bridge"
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
async function openSession(purpose: EmbeddedPurpose): Promise<{ clientSecret: string; publishableKey: string; stripeSignIn: boolean }> {
  const res = await fetch("/api/payments/component", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose }),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as { clientSecret?: unknown; publishableKey?: unknown; stripeSignIn?: unknown; error?: unknown }
  const clientSecret = typeof data.clientSecret === "string" ? data.clientSecret.trim() : ""
  const publishableKey = typeof data.publishableKey === "string" ? data.publishableKey.trim() : ""
  if (!res.ok || !clientSecret.startsWith("accs_") || !publishableKey.startsWith("pk_")) {
    throw new Error(shownError(typeof data.error === "string" ? data.error : ""))
  }
  return { clientSecret, publishableKey, stripeSignIn: data.stripeSignIn === true }
}

/*
  WHEN THE FORM WOULD LEAVE THE APP. On an account Stripe collects for, the
  embedded form first asks the creator to sign in to Stripe, in a window it
  opens from inside its own frame. No script on this page can reach that
  window, and an app built before it could hold one hands it to Safari: the
  creator was thrown out of Storelib the moment setup opened, and the sign
  in never came back to the form. In that app the same setup runs on
  Stripe's page in the sheet that slides over Storelib instead, and closes
  back here. An app that holds Stripe's windows itself says so in its user
  agent (capacitor.config.ts appendUserAgent) and keeps the embedded form.
*/
function needsSheet(stripeSignIn: boolean): boolean {
  return stripeSignIn && isNativeApp() && !appHoldsStripeWindows()
}

async function openHostedSetup(): Promise<boolean> {
  const res = await fetch("/api/payments/hosted-setup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ inApp: true }),
    cache: "no-store",
  })
  const data = (await res.json().catch(() => ({}))) as { ok?: unknown; url?: unknown }
  if (!res.ok || data.ok !== true || typeof data.url !== "string" || !data.url.startsWith("https://")) return false
  return (await openSheet(data.url)) === "closed"
}

/*
  STRIPE'S FORMS, IN STORELIB'S CLOTHES. The same font (Inter), the same
  10px corners and hairline borders as Storelib's own fields, near black
  buttons like every primary action in the app, and Storelib's violet only
  for links. The backdrop of Stripe's own windows is a soft dark, and it is
  the only one on screen: the setup page behind it is never darkened
  (components/app/settings/payments-setup-flow.tsx).
*/
const APPEARANCE = {
  overlays: "dialog" as const,
  variables: {
    fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    fontSizeBase: "15px",
    colorPrimary: "#1a1a2e",
    colorBackground: "#ffffff",
    colorText: "#1a1a2e",
    colorSecondaryText: "#6b7280",
    colorBorder: "#e3e5e8",
    colorDanger: "#c4290c",
    buttonPrimaryColorBackground: "#1a1a2e",
    buttonPrimaryColorBorder: "#1a1a2e",
    buttonPrimaryColorText: "#ffffff",
    buttonSecondaryColorBackground: "#ffffff",
    buttonSecondaryColorBorder: "#e3e5e8",
    buttonSecondaryColorText: "#1a1a2e",
    actionPrimaryColorText: "#7c3aed",
    actionSecondaryColorText: "#4b5563",
    offsetBackgroundColor: "#f7f7f8",
    formBackgroundColor: "#ffffff",
    formHighlightColorBorder: "#1a1a2e",
    formAccentColor: "#1a1a2e",
    borderRadius: "10px",
    buttonBorderRadius: "10px",
    formBorderRadius: "10px",
    badgeBorderRadius: "999px",
    overlayBorderRadius: "16px",
    overlayBackdropColor: "rgba(15, 17, 21, 0.4)",
  },
}

const FONTS = [{ cssSrc: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" }]

/**
 * Stripe's embedded onboarding, account management or payouts, drawn inside
 * Storelib. The caller says what to collect: setup asks for everything the
 * account will need, identity included (payments-setup-flow VERIFY_COLLECTION);
 * a bank change only the bank. Without a word, what Stripe needs today.
 */
export function StripeConnectEmbedded({
  purpose,
  collection,
  failedTitle = "Couldn't load verification",
  onExit,
  onStep,
  fallback,
  className,
}: {
  purpose: EmbeddedPurpose
  collection?: CollectionOptions
  failedTitle?: string
  onExit?: () => void | Promise<void>
  onStep?: (step: string) => void
  /**
   * Drawn under Try again when the form will not load: the one way on that
   * is left. The phone app puts its browser hand-off here, so the hand-off
   * is what a creator meets after a failure rather than instead of the form.
   */
  fallback?: React.ReactNode
  className?: string
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  /* The setup runs in the sheet over the app (needsSheet): "open" while it is up, "closed" after. */
  const [sheet, setSheet] = React.useState<"off" | "open" | "closed">("off")
  const handlers = React.useRef({ onExit, onStep })
  handlers.current = { onExit, onStep }
  const collectionKey = JSON.stringify(collection ?? null)

  React.useEffect(() => {
    let gone = false
    let el: HTMLElement | null = null
    setReady(false)
    setFailed(null)
    setSheet("off")
    ;(async () => {
      try {
        /*
          Loaded here, not when this file is imported. On the phone app a
          module-level import started Stripe.js as soon as Payouts opened,
          and its controller frame navigated the web view out to the browser.
        */
        const [first, { loadConnectAndInitialize }] = await Promise.all([openSession(purpose), import("@stripe/connect-js/pure")])
        if (gone) return
        if (needsSheet(first.stripeSignIn)) {
          /* The one loader stays up while the sheet is over the app. */
          setSheet("open")
          const opened = await openHostedSetup().catch(() => false)
          if (gone) return
          if (!opened) return setFailed(LOAD_FAILED)
          setSheet("closed")
          void handlers.current.onExit?.()
          return
        }
        let pending: string | null = first.clientSecret
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
          fonts: FONTS,
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
        {fallback ? <div className="mt-3">{fallback}</div> : null}
      </div>
    )
  }

  if (sheet === "closed") {
    return (
      <div data-embedded-sheet={sheet} className={cn("flex min-h-[260px] flex-col items-center justify-center px-6 text-center", className)}>
        <p className="text-[15px] font-semibold text-[#1a1a2e]">Finish setup with Stripe</p>
        <p className="mt-1 max-w-[300px] text-[14px] leading-5 text-[#6b7280]">Stripe opens over Storelib and brings you back here when you are done.</p>
        <button
          type="button"
          onClick={() => setAttempt((n) => n + 1)}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-[10px] bg-[#1a1a2e] px-5 text-[14px] font-medium text-white transition-opacity active:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1a1a2e]/30 sm:h-10"
        >
          Continue setup
        </button>
      </div>
    )
  }

  return (
    <div className={cn("relative w-full", className)}>
      {!ready ? (
        <div className="flex min-h-[220px] items-center justify-center" aria-live="polite">
          <WaitingArea className="h-16" size={18} label="Loading" />
        </div>
      ) : null}
      <div
        ref={host}
        className={cn(
          "w-full max-w-full [&>*]:block [&>*]:w-full [&>*]:max-w-full [&_iframe]:block [&_iframe]:w-full [&_iframe]:max-w-full",
          ready ? "pb-6" : "pointer-events-none absolute inset-x-0 top-0 opacity-0",
        )}
      />
    </div>
  )
}
