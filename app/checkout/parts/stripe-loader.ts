"use client"

/**
 * Stripe.js, loaded once, and only by a checkout that takes a card.
 *
 * `@stripe/stripe-js/pure` rather than the default entry: the default adds
 * the script tag the moment it is imported, which starts Stripe's Link
 * prewarm before anybody has asked to pay, and inside the native app that
 * prewarm opened Safari. `pure` touches nothing until `loadStripe` runs.
 *
 * In the Capacitor shell, advanced fraud signals are switched off: they add
 * a controller iframe that navigates the whole WKWebView away from the
 * checkout (see lib/stripe-nav-guard.ts, imported first for the same reason).
 */
import "@/lib/stripe-nav-guard"
import { loadStripe } from "@stripe/stripe-js/pure"

let promise: ReturnType<typeof loadStripe> | null = null

export function isCapacitorShell(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (cap?.isNativePlatform?.()) return true
  const ua = navigator.userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

export function getStripePromise(): ReturnType<typeof loadStripe> {
  if (!promise) {
    promise = loadStripe(
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
      // Documented, not yet in the published types.
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      isCapacitorShell() ? { advancedFraudSignals: false } : undefined,
    )
  }
  return promise
}
