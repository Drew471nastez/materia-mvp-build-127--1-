"use client"

/**
 * ===========================================================================
 *  PAYING A CREATOR WHO IS ON AIRWALLEX: ITS OWN PAYMENT PAGE, AND BACK
 * ===========================================================================
 * The checkout collects the name, email and terms as it always does; the
 * card itself is entered on Airwallex's hosted payment page, so no card
 * number touches Storelib. Airwallex.js is loaded only here, only when a
 * buyer presses Pay for such a creator: nobody else downloads it.
 *
 * THE CLIENT SECRET STAYS IN THIS TAB. It is what proves, on the way back,
 * that this browser is the one that paid (app/api/payments/airwallex/return
 * hands the receipt only to it). It is kept in sessionStorage under the
 * payment's id, never put in the address, and removed once the receipt is
 * fetched. The address that comes back carries the payment's id alone.
 */

export const RETURN_PARAM = "awx_intent"
const SECRET_KEY = (intentId: string) => `storelib.awx.${intentId}`

export function keepSecret(intentId: string, clientSecret: string): void {
  try {
    window.sessionStorage.setItem(SECRET_KEY(intentId), clientSecret)
  } catch {
    /* Private mode without storage: the receipt then comes by email. */
  }
}

export function takeSecret(intentId: string): string | null {
  try {
    return window.sessionStorage.getItem(SECRET_KEY(intentId))
  } catch {
    return null
  }
}

export function forgetSecret(intentId: string): void {
  try {
    window.sessionStorage.removeItem(SECRET_KEY(intentId))
  } catch {
    /* nothing kept, nothing to remove */
  }
}

/** This page's own address with the payment's id on it: where Airwallex sends the buyer after paying. */
export function returnAddress(intentId: string): string {
  const url = new URL(window.location.href)
  url.searchParams.set(RETURN_PARAM, intentId)
  return url.toString()
}

export async function redirectToAirwallex(p: { intentId: string; clientSecret: string; currency: string; env: "sandbox" | "prod" }): Promise<void> {
  keepSecret(p.intentId, p.clientSecret)
  const { init } = await import("@airwallex/components-sdk")
  const { payments } = await init({ env: p.env, enabledElements: ["payments"], locale: "en" })
  if (!payments) throw new Error("The payment page could not be opened. Nothing was charged. Try again.")
  /* The environment is init's: the hosted page's own `env` option predates the "sandbox" name. */
  payments.redirectToCheckout({
    intent_id: p.intentId,
    client_secret: p.clientSecret,
    currency: p.currency,
    successUrl: returnAddress(p.intentId),
  })
}
