"use client"

import * as React from "react"
import type { CollectionOptions } from "@stripe/connect-js"
import { Shimmer, ShimmerBlock } from "@/components/ui/shimmer"
import { fetchAccountSession, SessionProblem, shownError, takeAccountSession, warmStripeConnect, type AccountSession, type EmbeddedPurpose } from "@/components/app/settings/stripe-connect-warm"
import { keepStripeFramesInApp } from "@/lib/payments/stripe-frames-in-app"
import { appHoldsStripeWindows, isNativeApp } from "@/lib/native-bridge"
import { cn } from "@/lib/utils"
import { tt, msg } from "@/lib/i18n/text"

export type { EmbeddedPurpose } from "@/components/app/settings/stripe-connect-warm"

const LOAD_FAILED = msg("Try again in a moment.")

/*
 * When Stripe's frame itself cannot load, what it says decides what the
 * seller reads, and the type goes to the server log (/api/client-errors) so
 * a failure that only happens in one browser is seen, not guessed at.
 */
type LoadErrorType = "api_connection_error" | "authentication_error" | "account_session_create_error" | "invalid_request_error" | "rate_limit_error" | "api_error" | string

function loadErrorLine(type: LoadErrorType): string {
  if (type === "api_connection_error") return tt("Your browser could not reach Stripe. Check your connection, turn off any content blocker for storelib.com, then try again.")
  if (type === "rate_limit_error" || type === "api_error") return tt("Stripe did not answer just now. Try again in a minute.")
  if (type === "authentication_error" || type === "account_session_create_error") return tt("The form's sign in ran out. Try again to open a fresh one.")
  return tt("The form could not open here. Try again, and if it keeps happening write to support@storelib.com.")
}

function reportLoadError(purpose: EmbeddedPurpose, type: string, message: string | undefined) {
  try {
    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: `[stripe embed] ${purpose} load error ${type}: ${(message ?? "").slice(0, 160)} (${navigator.userAgent.slice(0, 80)})`, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => {})
  } catch {
    /* reporting is best effort */
  }
}

/** The held session (stripe-connect-warm), else a fresh one. */
async function openSession(purpose: EmbeddedPurpose): Promise<AccountSession> {
  const held = takeAccountSession(purpose)
  const got = held ? await held : null
  return got ?? fetchAccountSession(purpose)
}

/**
 * WHAT STRIPE'S FORM WILL LOOK LIKE, while it is on its way: a heading, a
 * line, three fields and the button, in Storelib's light gray (components/ui/shimmer),
 * the height of Stripe's first screen so nothing jumps when it lands. It
 * replaced a lone spinner in a blank card.
 */
export function StripeFormSkeleton({ label = tt("Loading"), className }: { label?: string; className?: string }) {
  return (
    <Shimmer label={label} className={cn("w-full space-y-5 px-1 pb-6 pt-1", className)}>
      <div data-stripe-skeleton="" className="space-y-2">
        <ShimmerBlock className="h-5 w-[58%] rounded-md" />
        <ShimmerBlock className="h-3 w-[82%] rounded-full" />
      </div>
      {[0.34, 0.42, 0.28].map((w, i) => (
        <div key={i} className="space-y-2">
          <ShimmerBlock className="h-3 rounded-full" style={{ width: `${w * 100}%` }} />
          <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
        </div>
      ))}
      <ShimmerBlock className="h-11 w-full rounded-[10px] sm:h-10" />
    </Shimmer>
  )
}

/*
  THE FORM STAYS IN THE APP (round 18, the owner: "payouts should be the
  Stripe embed, supported in the iOS and Android app"). Stripe's form opens
  windows of its own from inside its frames, which the app used to hand to
  Safari or Chrome. In an app build that cannot hold those windows, Stripe's
  frames are sealed before they load so they cannot open one
  (lib/payments/stripe-frames-in-app.ts); a build that can
  (appHoldsStripeWindows) opens them in a window inside the app.
*/
function sealsStripeFrames(): boolean {
  return isNativeApp() && !appHoldsStripeWindows()
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
  failedTitle = tt("Couldn't load verification"),
  onExit,
  onStep,
  fallback,
  className,
  session,
  publishableKey,
  onSessionProblem,
}: {
  purpose: EmbeddedPurpose
  /**
   * Where the Account Session comes from. Default: the signed-in creator's
   * own (/api/payments/component). The apps' browser sheet has no sign in and
   * passes its signed link's instead (app/payouts-sheet).
   */
  session?: () => Promise<{ clientSecret: string; publishableKey: string }>
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
  /**
   * The platform's publishable key, when the page already has it (the
   * overview carries it). With it Stripe's script loads and starts at once,
   * while the Account Session is still being made, instead of after it.
   */
  publishableKey?: string | null
  /** The server refused the session with a code the page can act on (country_required: back to the country). True when handled. */
  onSessionProblem?: (code: string, message: string) => boolean
}) {
  const host = React.useRef<HTMLDivElement>(null)
  const [ready, setReady] = React.useState(false)
  const [failed, setFailed] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const handlers = React.useRef({ onExit, onStep, session, onSessionProblem })
  handlers.current = { onExit, onStep, session, onSessionProblem }
  /* Only a publishable key, and only the one the server handed the page. */
  const knownKey = typeof publishableKey === "string" && publishableKey.startsWith("pk_") ? publishableKey : null
  const collectionKey = JSON.stringify(collection ?? null)

  React.useEffect(() => {
    let gone = false
    let el: HTMLElement | null = null
    let sessionRefused = false
    /* A refusal the page can act on goes to it; anything else is said here, in the server's words. */
    const refusedOutside = (e: unknown) => {
      if (gone) return
      const message = shownError(e instanceof Error ? e.message : "")
      const code = e instanceof SessionProblem ? e.code : null
      if (code && handlers.current.onSessionProblem?.(code, message)) return
      setFailed(message)
    }
    setReady(false)
    setFailed(null)
    ;(async () => {
      try {
        /*
          Loaded here, not when this file is imported. On the phone app a
          module-level import started Stripe.js as soon as Payouts opened,
          and its controller frame navigated the web view out to the browser.
        */
        if (sealsStripeFrames()) keepStripeFramesInApp()
        else warmStripeConnect()
        try {
          performance.mark("stripe-embed:start")
        } catch {
          /* timing marks are best effort */
        }
        const open = (): Promise<AccountSession> => handlers.current.session?.() ?? openSession(purpose)
        /*
         * IN PARALLEL, NOT IN A LINE. With the publishable key known, Stripe's
         * script starts loading now and the session is made at the same
         * time (connect-js asks fetchClientSecret straight away). Without it
         * (the apps' sheet) the session comes first, because the key is in it.
         */
        let first: Promise<AccountSession> | null = open()
        /* The server's refusal is what the seller reads; the frame's own load error that follows it is not. */
        if (knownKey) {
          first.catch((e: unknown) => {
            sessionRefused = true
            refusedOutside(e)
          })
        }
        const [{ loadConnectAndInitialize }, early] = await Promise.all([import("@stripe/connect-js/pure"), knownKey ? Promise.resolve(null) : first])
        if (gone) return
        const usedKey = knownKey ?? early!.publishableKey
        const connect = loadConnectAndInitialize({
          publishableKey: usedKey,
          fetchClientSecret: async () => {
            const pending = first
            first = null
            const next = await (pending ?? open())
            if (next.publishableKey !== usedKey) throw new Error(tt(LOAD_FAILED))
            return next.clientSecret
          },
          appearance: APPEARANCE,
          fonts: FONTS,
        })
        if (gone || !host.current) return
        const shown = () => {
          try {
            performance.mark("stripe-embed:loader")
          } catch {
            /* best effort */
          }
          setReady(true)
        }
        const options: CollectionOptions = collection ?? { fields: "currently_due", futureRequirements: "omit" }
        let component: HTMLElement
        if (purpose === "stripe_onboarding") {
          const onboarding = connect.create("account-onboarding")
          onboarding.setCollectionOptions(options)
          onboarding.setOnExit(() => void handlers.current.onExit?.())
          onboarding.setOnStepChange(({ step }) => handlers.current.onStep?.(step))
          onboarding.setOnLoaderStart(() => !gone && shown())
          onboarding.setOnLoadError(({ error }) => {
            reportLoadError(purpose, error?.type ?? "unknown", error?.message)
            if (!gone && !sessionRefused) setFailed(loadErrorLine(error?.type ?? ""))
          })
          component = onboarding
        } else if (purpose === "stripe_management") {
          const management = connect.create("account-management")
          management.setCollectionOptions(options)
          management.setOnLoaderStart(() => !gone && shown())
          management.setOnLoadError(({ error }) => {
            reportLoadError(purpose, error?.type ?? "unknown", error?.message)
            if (!gone && !sessionRefused) setFailed(loadErrorLine(error?.type ?? ""))
          })
          component = management
        } else {
          const payouts = connect.create("payouts")
          payouts.setOnLoaderStart(() => !gone && shown())
          payouts.setOnLoadError(({ error }) => {
            reportLoadError(purpose, error?.type ?? "unknown", error?.message)
            if (!gone && !sessionRefused) setFailed(loadErrorLine(error?.type ?? ""))
          })
          component = payouts
        }
        host.current.replaceChildren(component)
        el = component
      } catch (e) {
        refusedOutside(e)
      }
    })()
    return () => {
      gone = true
      el?.remove()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purpose, collectionKey, attempt, knownKey])

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
          {tt("Try again")}
        </button>
        {fallback ? <div className="mt-3">{fallback}</div> : null}
      </div>
    )
  }

  return (
    <div className={cn("relative w-full", className)}>
      {!ready ? <StripeFormSkeleton /> : null}
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
