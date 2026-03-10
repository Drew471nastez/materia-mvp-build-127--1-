import { NextRequest, NextResponse } from 'next/server'

/**
 * Capacitor WKWebView — Stripe controller iframe CSP guard
 *
 * Problem
 * ───────
 * When Stripe.js initialises in the WKWebView it creates a hidden controller
 * iframe at js.stripe.com/v3/controller-with-preconnect-*.html. That page
 * runs, sends a postMessage to the parent (Stripe.js), and Stripe.js then
 * sets window.location.href = controllerUrl. In WebKit, window.location.href
 * is [LegacyUnforgeable] — no JS patch can intercept it. The WebView navigates
 * away from the checkout page and the user lands on an empty page.
 *
 * Fix
 * ───
 * For requests coming from the Capacitor native app (User-Agent contains
 * "Capacitor"), inject a Content-Security-Policy header that restricts
 * frame-src to only the Stripe iframe URL patterns that are actually needed:
 *
 *   elements-*    — CardNumberElement / CardExpiryElement / CardCvcElement inputs
 *   three-ds-2-*  — 3DS bank-authentication challenge iframes
 *   hooks.stripe.com — 3DS redirect handling
 *
 * The controller iframe (controller-with-preconnect-*.html) does NOT match
 * any of these patterns and is therefore blocked by the browser engine itself
 * before any JS runs. No postMessage is sent; window.location.href is never
 * set; the checkout stays fully inline.
 *
 * The CSP is delivered as an HTTP response header on the initial HTML page
 * load. In a Next.js / React SPA, that CSP persists across all subsequent
 * client-side navigations for the entire session, so it protects the checkout
 * no matter how the user arrives at it.
 *
 * This is complementary to advancedFraudSignals: false (in getStripePromise)
 * and the stripe-nav-guard.ts JS patches — belt-and-suspenders at three
 * independent levels.
 */
export function middleware(request: NextRequest) {
  const ua = request.headers.get('user-agent') ?? ''

  // Only apply to Capacitor WKWebView requests.
  // The Capacitor config appends "Capacitor" to the User-Agent string.
  if (!ua.includes('Capacitor')) {
    return NextResponse.next()
  }

  const response = NextResponse.next()

  // frame-src: restrict which origins can be loaded into <iframe> elements.
  //
  //   js.stripe.com/v3/elements-*   — Stripe Card Element inputs
  //   js.stripe.com/v3/three-ds-2-* — 3DS bank-auth challenge frames
  //   hooks.stripe.com              — 3DS redirect return URL host
  //
  // Intentionally NOT listed: js.stripe.com/v3/controller-with-preconnect-*
  // (the fraud-signals controller that causes the top-level navigation).
  response.headers.set(
    'Content-Security-Policy',
    "frame-src 'self' https://js.stripe.com/v3/elements-* https://js.stripe.com/v3/three-ds-2-* https://hooks.stripe.com",
  )

  return response
}

export const config = {
  matcher: [
    /*
     * Apply to all page routes. Exclude:
     *   - _next/static  (pre-built JS/CSS bundles — already immutable, no iframes)
     *   - _next/image   (image optimisation endpoint)
     *   - api/          (JSON API routes — no HTML, CSP irrelevant)
     *   - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon\\.ico|api/).*)',
  ],
}
