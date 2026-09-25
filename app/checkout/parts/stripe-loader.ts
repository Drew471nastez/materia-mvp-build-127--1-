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
 * checkout (see lib/stripe-nav-guard.ts, which blocks it there, and only
 * there: a browser needs that frame for every element to load).
 */
import { isCapacitorShell } from "@/lib/stripe-nav-guard"
import { loadStripe } from "@stripe/stripe-js/pure"

let promise: ReturnType<typeof loadStripe> | null = null

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

/**
 * Forget a Stripe.js that failed to arrive, so the next ask loads it again.
 * `loadStripe` keeps its own rejected script otherwise, and Try again would
 * be handed the same failure.
 */
export function resetStripePromise() {
  promise = null
  if (typeof document === "undefined") return
  document.querySelectorAll('script[src^="https://js.stripe.com/"]').forEach((s) => {
    if (!(window as unknown as { Stripe?: unknown }).Stripe) s.remove()
  })
}

export { isCapacitorShell }
