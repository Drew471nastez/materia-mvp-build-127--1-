/**
 * stripe-nav-guard.ts
 *
 * Keeps paid checkout inside the Capacitor WKWebView — no browser opens, no
 * navigation away from the checkout screen.
 *
 * ─── WHAT ACTUALLY EJECTS THE APP ───────────────────────────────────────────
 * Stripe.js hands the entire page off to Stripe when it cannot do its work in
 * an iframe. The handoff looks like this:
 *
 *     https://js.stripe.com/v3/m-outer-<hash>.html#url=<the page>&referrer=…
 *
 * — the current URL packed into the fragment so Stripe can send you back. In a
 * browser that is a hidden frame's job; in a WKWebView it becomes a top-level
 * navigation and the buyer is in Safari, mid-purchase.
 *
 * ─── THE MISTAKE THIS FILE USED TO MAKE ─────────────────────────────────────
 * It blocked Stripe's iframes: the controller frame first, later the fraud
 * frame too, across five layers of interception.
 *
 * That is backwards. Blocking the frame is the thing that CAUSES the handoff.
 * Stripe.js needs the controller frame to hold its shared state; deny it and
 * the page-level fallback is exactly what it reaches for. The guard was
 * producing the navigation it existed to prevent, and the CSP in proxy.ts was
 * doing the same thing at the same time from the other direction.
 *
 * ─── WHAT IS DONE INSTEAD ───────────────────────────────────────────────────
 * Three things, in order of how much work they do:
 *
 *   1. lib/stripe-client.ts sets `advancedFraudSignals: false` through
 *      loadStripe.setLoadParameters, so the fraud frame is never requested in
 *      the first place. This is Stripe's own documented switch and it is the
 *      actual fix.
 *
 *   2. proxy.ts serves a frame-src that ALLOWS js.stripe.com, so every frame
 *      Stripe does ask for is created and it never needs a fallback.
 *
 *   3. This file blocks TOP-LEVEL NAVIGATION to Stripe — window.open,
 *      location.assign, location.replace. Not frames. If something still tries
 *      to take the whole page to js.stripe.com, that attempt is dropped.
 *
 * ─── THE ONE HOLE, STATED HONESTLY ──────────────────────────────────────────
 * `window.location.href = …` cannot be intercepted. It is [LegacyUnforgeable]
 * in the WebIDL spec, non-configurable on every Location instance, and
 * Object.defineProperty on Location.prototype silently fails in WebKit. If
 * Stripe.js ever reaches for that specific assignment, no JavaScript can stop
 * it — which is exactly why the real defence is making sure it never gets far
 * enough to want to.
 *
 * `window.open` returns a FAKE window rather than null, deliberately: null
 * reads as "popup blocked", and popup-blocked is a state Stripe responds to by
 * falling back to a top-level redirect. A non-null window means it waits for a
 * postMessage that never arrives, and does nothing.
 */

let _applied = false

/**
 * Any top-level navigation to Stripe's own hosts.
 *
 * Frames are deliberately NOT matched by anything in this file any more — see
 * the note above. These hosts only ever appear as a top-level URL when Stripe
 * is trying to take the page, which is the one case worth stopping.
 */
const STRIPE_NAV_RE = /^https?:\/\/(js\.stripe\.com|m\.stripe\.network)\//

function isStripeTopLevelNav(url: unknown): boolean {
  return STRIPE_NAV_RE.test(String(url ?? ""))
}

export function applyStripeNavGuard(): void {
  if (typeof window === "undefined" || _applied) return
  _applied = true

  // ── window.open ─────────────────────────────────────────────────────────────
  try {
    const _open = window.open.bind(window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (url?: string | URL, target?: string, features?: string) => {
      if (isStripeTopLevelNav(url)) {
        // A fake window, not null. See the note above on why null is worse.
        return {
          closed: false,
          close() {
            ;(this as { closed: boolean }).closed = true
          },
          focus() {},
          blur() {},
          postMessage() {},
          location: { href: String(url ?? "") },
          opener: window,
        } as unknown as Window
      }
      return _open(url, target, features)
    }
  } catch {
    /* ignore */
  }

  // ── location.assign / location.replace ──────────────────────────────────────
  // Both ARE patchable in WebKit, unlike the href setter.
  try {
    const _assign = window.location.assign.bind(window.location)
    window.location.assign = (url: string | URL) => {
      if (isStripeTopLevelNav(url)) return
      _assign(String(url))
    }
  } catch {
    /* ignore */
  }

  try {
    const _replace = window.location.replace.bind(window.location)
    window.location.replace = (url: string | URL) => {
      if (isStripeTopLevelNav(url)) return
      _replace(String(url))
    }
  } catch {
    /* ignore */
  }
}

// Auto-apply on import.
applyStripeNavGuard()
