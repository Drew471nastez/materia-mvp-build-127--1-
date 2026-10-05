"use client"

/**
 * ===========================================================================
 *  RUNNING STRIPE'S OWN ID CHECK FROM THE PAGE
 * ===========================================================================
 * STRIPE DOES THE WHOLE ID CHECK, on every platform. Its screen takes the
 * document and sends it to Stripe directly: the photo never passes through
 * Storelib's server, which is what kept failing (an upload that sat on
 * "Stripe is saving it" and then timed out).
 *
 * TWO SCREENS, AND THE SERVER PICKS. Connect's own hosted verification is the
 * one that always runs (lib/payments/stripe/hosted-verification.ts): a page
 * for this one connected account that comes back to Storelib when it is done.
 * Stripe Identity's modal runs instead where that product is really switched
 * on. `openIdentity` opens Identity; `openHostedVerification` opens the
 * Connect page.
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
export async function openHostedVerification(url: string): Promise<IdentityOpened> {
  if (typeof window === "undefined" || !url) return "no_way"
  /* The app: Stripe's page in the sheet over the app, which closes itself on the way back. */
  if (isNativeApp()) return openSheet(url)
  /*
   * A browser goes to Stripe's page in this same tab. Not a second window: a
   * phone browser buries one behind the first, and a popup blocker eats it,
   * both of which read as Verify doing nothing. Stripe's return address is
   * Payouts with ?setup=1, so coming back reopens setup on the step that is
   * left, whether that is a minute later or the next day.
   */
  window.location.assign(url)
  return "sent"
}

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
