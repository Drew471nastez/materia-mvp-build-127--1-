"use client"

/**
 * ===========================================================================
 *  RUNNING STRIPE'S OWN ID CHECK FROM THE PAGE
 * ===========================================================================
 * Two ways in, because a web view is not a browser:
 *
 *   the web        Stripe's modal over the page (stripe.verifyIdentity). The
 *                  camera is Stripe's, in Stripe's frame, on Stripe's origin.
 *   the phone app  Stripe's hosted page in the in-app browser sheet. The
 *                  app's web view blocks Stripe's frames on purpose
 *                  (proxy.ts), and a camera inside a cross-origin frame in a
 *                  web view is what broke setup here once already, so the
 *                  app hands Stripe the whole page instead. It slides over
 *                  the app and closes back to it: nothing leaves Storelib.
 *
 * Neither way tells the page anything about the person. Whether Stripe is
 * satisfied is read from the server afterwards (/api/payments/identity-status),
 * which asks Stripe.
 */
import { isNativeApp, openInApp } from "@/lib/native-bridge"

export interface IdentityOpening {
  clientSecret: string | null
  url: string | null
  publishableKey: string
}

export type IdentityOpened = "closed" | "sent" | "no_way"

/**
 * Opens the check and waits as long as it can. On the web the promise settles
 * when the modal closes; in the app it settles once the sheet has been asked
 * for, and the form watches the server from then on.
 */
export async function openIdentity(opening: IdentityOpening): Promise<IdentityOpened> {
  if (typeof window === "undefined") return "no_way"
  /* The app: Stripe's own page, in the sheet. */
  if (isNativeApp()) {
    if (!opening.url) return "no_way"
    openInApp(opening.url)
    return "sent"
  }
  if (opening.clientSecret && opening.publishableKey) {
    try {
      const { loadStripe } = await import("@stripe/stripe-js/pure")
      const stripe = await loadStripe(opening.publishableKey)
      if (stripe) {
        await stripe.verifyIdentity(opening.clientSecret)
        return "closed"
      }
    } catch {
      /* Stripe.js blocked or refused: the hosted page is the way on. */
    }
  }
  if (opening.url) {
    window.open(opening.url, "_blank", "noopener")
    return "sent"
  }
  return "no_way"
}
