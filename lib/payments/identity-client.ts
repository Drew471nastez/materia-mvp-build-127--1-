"use client"

/**
 * ===========================================================================
 *  RUNNING STRIPE'S OWN ID CHECK FROM THE PAGE
 * ===========================================================================
 * STRIPE DOES THE WHOLE ID CHECK NOW, on every platform. Its screen opens the
 * camera, scans the document live, matches a selfie to it, and sends both to
 * Stripe directly: the photo never passes through Storelib's server, which is
 * what kept failing (an upload that sat on "Stripe is saving it" and then
 * timed out). Storelib's own camera is still there underneath as the other
 * way, for anybody Stripe has no check for.
 *
 *   A BROWSER. Stripe.js opens its modal over the page, in Stripe's own
 *     frame, on Stripe's origin. The page is never left.
 *   THE PHONE APP. The modal needs a cross origin frame with the camera in
 *     it, which the app's web view will not reliably give, so the app opens
 *     Stripe's hosted page in the sheet that slides over the app (the same
 *     one sign in uses), and it closes itself when Stripe is done. The owner,
 *     October 2026: "you can embed the Stripe verification thing with the ID
 *     exactly of Stripe, only in the verify ID".
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

/** Stripe's hosted check in the app's own sheet. Settles when the sheet closes. */
async function openSheet(url: string): Promise<IdentityOpened> {
  try {
    /* The link guard lets this one window through (components/platform/native-link-guard.tsx). */
    ;(window as unknown as { __storelibSheet?: string }).__storelibSheet = url
    const { Browser } = await import("@capacitor/browser")
    const done = new Promise<void>((resolve) => {
      let handle: { remove: () => void } | undefined
      void Browser.addListener("browserFinished", () => {
        handle?.remove()
        resolve()
      }).then((h) => {
        handle = h
      })
      /* However the sheet goes away, this never waits for ever. */
      window.setTimeout(resolve, 15 * 60_000)
    })
    await Browser.open({ url, presentationStyle: "popover", toolbarColor: "#ffffff" })
    await done
    return "closed"
  } catch {
    return "no_way"
  }
}

/**
 * Opens the check and waits as long as it can. The promise settles when
 * Stripe's modal or sheet closes, so the step can ask Stripe at once rather
 * than leaving somebody looking at a spinner.
 */
export async function openIdentity(opening: IdentityOpening): Promise<IdentityOpened> {
  if (typeof window === "undefined") return "no_way"

  /* The app: Stripe's hosted page in the sheet over the app, which has the camera. */
  if (isNativeApp()) {
    if (opening.url) return openSheet(opening.url)
    return "no_way"
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
