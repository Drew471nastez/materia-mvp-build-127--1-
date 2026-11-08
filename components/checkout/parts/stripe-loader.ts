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
import type { loadStripe } from "@stripe/stripe-js/pure"

/*
  STRIPE'S MODULE ON THE FIRST ASK, NOT ON IMPORT (round 26). The community's join flow imports the card form
  (./stripe-pay) and so this file, and every page that can show a join button imported Stripe's module with it. Now the
  module is fetched by the first getStripePromise() (a chunk of its own, as lib/payments/identity-client.ts already
  does), so a page that never takes a card never loads it. It also keeps Node's own loader, which the suites run on,
  from resolving `@stripe/stripe-js/pure` at import: the package has no exports map, and Node refuses that directory
  import. Callers already take a promise, so nothing changes for them.
*/
let promise: ReturnType<typeof loadStripe> | null = null

export function getStripePromise(): ReturnType<typeof loadStripe> {
  if (!promise) {
    promise = import("@stripe/stripe-js/pure").then(({ loadStripe }) =>
      loadStripe(
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
        // Documented, not yet in the published types.
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        isCapacitorShell() ? { advancedFraudSignals: false } : undefined,
      ),
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

/*
  THE CARD FORM IS READY: SAID ONCE, FOR WHATEVER WAITS ON IT. The checkout
  reads its ways out ahead (the product page, the creator's page) and those
  are whole routes of scripts; started before Stripe's frames had drawn,
  they took the phone's connection and CPU from them (the form was ready
  seconds after Stripe.js had arrived). Now they wait for this.
*/
export const PAYMENT_READY_EVENT = "storelib:payment-ready"
let paymentFormReady = false

export function notePaymentReady(): void {
  if (paymentFormReady || typeof window === "undefined") return
  paymentFormReady = true
  window.dispatchEvent(new Event(PAYMENT_READY_EVENT))
}

/**
 * Runs `then` once the card form is ready, or after `fallbackMs` when it
 * never says so (a checkout with no card form, Stripe blocked). Returns the
 * way to cancel it.
 */
export function afterPaymentReady(then: () => void, fallbackMs: number): () => void {
  if (paymentFormReady) {
    then()
    return () => {}
  }
  let done = false
  const go = () => {
    if (done) return
    done = true
    window.removeEventListener(PAYMENT_READY_EVENT, go)
    window.clearTimeout(t)
    then()
  }
  const t = window.setTimeout(go, fallbackMs)
  window.addEventListener(PAYMENT_READY_EVENT, go)
  return () => {
    done = true
    window.removeEventListener(PAYMENT_READY_EVENT, go)
    window.clearTimeout(t)
  }
}
