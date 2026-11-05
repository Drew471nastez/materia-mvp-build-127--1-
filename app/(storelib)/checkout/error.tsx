"use client"

/**
 * Checkout's boundary (the product, cart, website and physical checkouts and
 * the receipt). It says nothing about the payment on purpose: a throw while
 * drawing the page cannot tell whether a card was charged, and the receipt
 * and the order emails are what say so. Try again redraws the page; the
 * buyer's name and email come back from the tab (app/checkout remembered()).
 * ErrorScreen reports the failure with its digest.
 */

import { ErrorScreen } from "@/components/platform/error-screen"

export default function CheckoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorScreen error={error} reset={reset} />
}
