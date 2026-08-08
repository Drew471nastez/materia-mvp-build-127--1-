"use client"

// Must precede the loader import: the guard patches iframe creation, and it has
// to be in place before anything can create one.
import "@/lib/stripe-nav-guard"
// "@stripe/stripe-js/pure", never "@stripe/stripe-js". The default entry point
// injects <script src="https://js.stripe.com/v3/"> at MODULE IMPORT time —
// before anybody has asked for it — which is what starts this whole sequence.
import { loadStripe } from "@stripe/stripe-js/pure"

/**
 * ===========================================================================
 *  LOADING STRIPE.JS WITHOUT LEAVING THE APP
 * ===========================================================================
 *
 * In a Capacitor WebView, opening the checkout could navigate the whole app
 * away to a URL like:
 *
 *   https://js.stripe.com/v3/m-outer-<hash>.html#url=…&referrer=…&muid=NA
 *
 * That is Stripe's ADVANCED FRAUD SIGNALS frame. Stripe.js creates it on load
 * to collect device signals; in a normal browser it is a harmless hidden
 * iframe, and in WKWebView it can end up as a top-level navigation — so the
 * buyer is bounced out of the app and into Safari, mid-purchase.
 *
 * ---------------------------------------------------------------------------
 * THE PART THAT WAS WRONG, AND IT IS SUBTLE
 * ---------------------------------------------------------------------------
 * `advancedFraudSignals` is a LOAD parameter. It has to be set through
 *
 *     loadStripe.setLoadParameters({ advancedFraudSignals: false })
 *
 * which appends `?advancedFraudSignals=false` to the script tag, BEFORE the
 * script is fetched.
 *
 * It is NOT the second argument of `loadStripe(key, options)`. That argument is
 * `StripeConstructorOptions` — stripeAccount, apiVersion, locale, betas — and
 * an unrecognised key there is simply ignored. No warning, no type error
 * (the key is not in the typings, so it needed a @ts-ignore to compile at all,
 * which is the tell). So the flag was written, discarded, and the fraud frame
 * loaded anyway.
 *
 * ---------------------------------------------------------------------------
 * WHY IT IS OFF EVERYWHERE, NOT JUST IN THE APP
 * ---------------------------------------------------------------------------
 * The first version of this asked, at runtime, whether it was inside the
 * Capacitor WebView, and only disabled the frame if the answer was yes. It was
 * still happening after that shipped — and a runtime platform check is the
 * obvious suspect, because there is no way to be sure from here what a given
 * device's user-agent says or whether the Capacitor global is on `window` yet
 * at the moment the checkout mounts. A guess about the platform is a strange
 * thing to hang a working checkout on.
 *
 * So the frame is off unconditionally. What that costs is Stripe's device
 * fingerprinting signal, which feeds Radar's ML scoring; Radar's own rules,
 * 3-D Secure, CVC and postcode checks and every other control are untouched.
 * For a marketplace whose buyers are in the EU, a third-party tracking iframe
 * on the payment page is a thing to be able to justify anyway.
 *
 * `setLoadParameters` throws if it is called after `loadStripe` has already
 * run, so this must be the FIRST thing that ever touches Stripe.js — which is
 * why every checkout in the app now comes through this one function.
 */

let _promise: ReturnType<typeof loadStripe> | null = null

/**
 * Stripe.js, loaded at most once per page.
 *
 * Call this only when a card is actually about to be needed. Nothing about
 * Stripe reaches the page until somebody does — which is both faster and one
 * fewer thing that can go wrong on a screen that is only browsing.
 */
export function getStripePromise() {
  if (!_promise) {
    try {
      loadStripe.setLoadParameters({ advancedFraudSignals: false })
    } catch {
      // Only throws if loadStripe already ran, in which case the parameters are
      // whatever they are and there is nothing left to decide.
    }
    _promise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return _promise
}
