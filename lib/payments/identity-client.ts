"use client"

/**
 * ===========================================================================
 *  RUNNING STRIPE'S OWN ID CHECK FROM THE PAGE
 * ===========================================================================
 * THE WEB ONLY. Stripe's modal over the page (stripe.verifyIdentity): the
 * camera is Stripe's, in Stripe's frame, on Stripe's origin, and the page is
 * never left.
 *
 * THE PHONE APP DOES NOT GO TO STRIPE AT ALL. It used to open Stripe's
 * hosted page in the in-app browser sheet, because the app's web view blocks
 * Stripe's frames on purpose (proxy.ts) and a camera inside a cross-origin
 * frame in a web view is what broke setup here once already. However
 * carefully that sheet is dressed, it is still the app handing somebody to
 * a browser in the middle of setting up: it slides up, it is Stripe's page,
 * and it reads as leaving. Storelib's own camera is already full screen
 * inside the app, takes both sides, and is the path Stripe accepts as an
 * uploaded document, so the app uses that and nothing is opened.
 *
 * Neither way tells the page anything about the person. Whether Stripe is
 * satisfied is read from the server afterwards (/api/payments/identity-status),
 * which asks Stripe.
 */
import { isNativeApp } from "@/lib/native-bridge"

export interface IdentityOpening {
  clientSecret: string | null
  url: string | null
  publishableKey: string
}

export type IdentityOpened = "closed" | "sent" | "no_way"

/**
 * Opens the check and waits as long as it can. On the web the promise settles
 * when the modal closes. In the app there is nothing to open: "no_way" sends
 * the caller to Storelib's own camera, in the app, which is the point.
 */
export async function openIdentity(opening: IdentityOpening): Promise<IdentityOpened> {
  if (typeof window === "undefined") return "no_way"
  /* The app never leaves for this. Storelib's camera does it here. */
  if (isNativeApp()) return "no_way"
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
