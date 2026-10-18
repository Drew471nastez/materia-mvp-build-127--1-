/**
 * ===========================================================================
 *  STRIPE, ASKED FOR FROM THE FIRST BYTES OF THE PAGE
 * ===========================================================================
 * The card form needs Stripe.js, and Stripe.js used to be asked for only
 * after this page's own scripts had arrived, run and drawn the form's
 * place: on a phone that was most of a second with the connection to
 * Stripe not even open. Called while the page renders on the server, these
 * write hints into the document's <head>, so the browser opens the
 * connections to Stripe and fetches Stripe.js beside the page's own files.
 *
 * A preload only fetches. Nothing runs until stripe-loader.ts calls
 * loadStripe, which then finds the file already here: Stripe's Link
 * prewarm and fraud frame still start only where they did (and never in
 * the app's shell, which stripe-loader.ts keeps as it was).
 *
 * The address is the one @stripe/stripe-js injects (its RELEASE_TRAIN,
 * dist/pure.js); tests/checkout-speed-x.test.ts fails when an upgrade of the
 * package moves it, so the preload never fetches a file nobody uses.
 */
import { preconnect, preload } from "react-dom"

export const STRIPE_JS_URL = "https://js.stripe.com/clover/stripe.js"

/**
 * `script: true` where the card form is drawn with the page (the product
 * checkout, the website checkout). The physical checkout shows Stripe only
 * after Pay, so it opens the connections and leaves the file to
 * physical-checkout.tsx, which loads it once the page is idle.
 */
export function stripeEarly({ script }: { script: boolean }): void {
  preconnect("https://js.stripe.com")
  /* Stripe's frames call its API without cookies: the connection has to be the anonymous one to be reused. */
  preconnect("https://api.stripe.com", { crossOrigin: "anonymous" })
  preconnect("https://m.stripe.network")
  if (script) preload(STRIPE_JS_URL, { as: "script" })
}
