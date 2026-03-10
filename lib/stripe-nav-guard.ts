/**
 * stripe-nav-guard.ts
 *
 * Stripe.js Link prewarm experiment (link_ewcs_prewarm_experiment_v2) causes
 * Stripe.js to open its controller URL via window.open() or window.location.
 *
 * In a Capacitor WKWebView, window.open() is always routed to Safari (the
 * system browser), even when the domain is listed in server.allowNavigation.
 * This means ANY window.open('https://js.stripe.com/...') call bypasses the
 * in-app WebView and opens the external browser — breaking the checkout flow.
 *
 * This module patches window.open, window.location.assign, and
 * window.location.replace to silently swallow requests to js.stripe.com.
 * Stripe Elements card input iframes are NOT affected — they are injected via
 * document.createElement('iframe').src = url, not via these APIs.
 *
 * Import this module at the top of every file that loads Stripe.js (before
 * any loadStripe() call).  Repeated imports are safe — the guard is applied
 * only once via the _applied flag.
 */

let _applied = false

export function applyStripeNavGuard(): void {
  if (typeof window === "undefined" || _applied) return
  _applied = true

  try {
    // 1. window.open — primary cause: Capacitor always routes window.open()
    //    to the system browser, regardless of allowNavigation.
    const _open = window.open.bind(window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (url?: string | URL, target?: string, features?: string) => {
      if (url && /js\.stripe\.com/.test(String(url))) return null
      return _open(url, target, features)
    }

    // 2. window.location.assign
    const _assign = window.location.assign.bind(window.location)
    window.location.assign = (url: string | URL) => {
      if (/js\.stripe\.com/.test(String(url))) return
      _assign(String(url))
    }

    // 3. window.location.replace
    const _replace = window.location.replace.bind(window.location)
    window.location.replace = (url: string | URL) => {
      if (/js\.stripe\.com/.test(String(url))) return
      _replace(String(url))
    }
  } catch {
    // Browser may restrict overrides in strict contexts — fail silently.
  }
}

// Auto-apply on import so callers don't have to call the function explicitly.
applyStripeNavGuard()
