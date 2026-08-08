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
 * WHY ONLY IN THE NATIVE APP
 * ---------------------------------------------------------------------------
 * These signals are real fraud protection and are worth having on the web,
 * where the frame behaves. They are turned off exactly where they break the
 * app and nowhere else.
 *
 * `setLoadParameters` throws if it is called after `loadStripe`, so the
 * decision is made once, on the first call, and never revisited.
 */

let _promise: ReturnType<typeof loadStripe> | null = null

/** Are we inside the Capacitor WebView rather than a browser? */
function isNativeWebView(): boolean {
  if (typeof window === "undefined") return false
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
  if (cap?.isNativePlatform?.()) return true
  const ua = navigator.userAgent || ""
  return /StorelibApp|Capacitor/.test(ua) || (/wv/.test(ua) && /Android/.test(ua))
}

/**
 * Stripe.js, loaded at most once per page.
 *
 * Call this only when a card is actually about to be needed. Nothing about
 * Stripe reaches the page until somebody does — which is both faster and one
 * fewer thing that can go wrong on a screen that is only browsing.
 */
export function getStripePromise() {
  if (!_promise) {
    if (isNativeWebView()) {
      try {
        loadStripe.setLoadParameters({ advancedFraudSignals: false })
      } catch {
        // Only throws if loadStripe already ran, in which case the parameters
        // are whatever they are and there is nothing left to decide.
      }
    }
    _promise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)
  }
  return _promise
}
