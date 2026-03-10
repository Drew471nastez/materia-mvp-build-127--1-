/**
 * stripe-nav-guard.ts — block every mechanism Stripe.js uses to navigate
 * the top-level frame to the controller URL in a Capacitor WKWebView.
 *
 * ROOT CAUSE
 * ----------
 * When Stripe.js loads it creates a controller iframe at
 *   https://js.stripe.com/v3/controller-with-preconnect-<hash>.html
 * The controller exchanges postMessages with the Stripe.js parent script.
 * On Capacitor WKWebViews (and sometimes plain mobile Safari) the controller
 * bootstrap triggers a TOP-LEVEL navigation to that same URL via
 *
 *   window.location.href = controllerUrl   ← direct property assignment
 *
 * Previous guard versions patched window.open / location.assign /
 * location.replace, but NOT the href setter — so the navigation still happened.
 *
 * THIS FILE adds six independent interception layers:
 *   1. window.open(controllerUrl)                     — already guarded
 *   2. window.location.assign(controllerUrl)          — already guarded
 *   3. window.location.replace(controllerUrl)         — already guarded
 *   4. window.location.href = controllerUrl           ← NEW (root cause)
 *   5. iframe.src = controllerUrl                     ← NEW (prevents iframe
 *                                                        load → postMessage
 *                                                        → href assignment)
 *   6. iframe.setAttribute("src", controllerUrl)     ← NEW (same as #5 but
 *                                                        via setAttribute)
 *
 * Stripe Elements card-input iframes (elements-inner-card-*.html) are NOT
 * affected — the guard is scoped to URLs that contain both "js.stripe.com"
 * AND "controller" in the path.
 *
 * Import ONCE before any loadStripe() call.  Re-imports are no-ops (_applied).
 */

let _applied = false

/** Matches only the Stripe controller URL, not card-element or other iframes. */
const CONTROLLER_RE = /js\.stripe\.com[^#?]*controller/

function isController(url: unknown): boolean {
  return CONTROLLER_RE.test(String(url ?? ""))
}

export function applyStripeNavGuard(): void {
  if (typeof window === "undefined" || _applied) return
  _applied = true

  // ── 1. window.open ──────────────────────────────────────────────────────────
  // Capacitor routes window.open() to the system browser unconditionally.
  try {
    const _open = window.open.bind(window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (url?: string | URL, target?: string, features?: string) => {
      if (isController(url)) return null
      return _open(url, target, features)
    }
  } catch { /* ignore */ }

  // ── 2. window.location.assign ───────────────────────────────────────────────
  try {
    const _assign = window.location.assign.bind(window.location)
    window.location.assign = (url: string | URL) => {
      if (isController(url)) return
      _assign(String(url))
    }
  } catch { /* ignore */ }

  // ── 3. window.location.replace ──────────────────────────────────────────────
  try {
    const _replace = window.location.replace.bind(window.location)
    window.location.replace = (url: string | URL) => {
      if (isController(url)) return
      _replace(String(url))
    }
  } catch { /* ignore */ }

  // ── 4. window.location.href = url  ← THE ROOT CAUSE ────────────────────────
  // Stripe.js ultimately navigates the top frame via direct href assignment.
  // Patch Location.prototype so every `location.href = url` call goes through
  // our check first.  Location.prototype.href is configurable in WebKit/Safari.
  try {
    const locProto = Object.getPrototypeOf(window.location) as Location
    const desc = Object.getOwnPropertyDescriptor(locProto, "href")
    if (desc?.set) {
      const origSet = desc.set
      Object.defineProperty(locProto, "href", {
        ...desc,
        set(url: string) {
          if (isController(url)) return
          origSet.call(this, url)
        },
      })
    }
  } catch { /* WebKit may restrict in strict contexts — fail silently */ }

  // ── 5. HTMLIFrameElement.prototype.src = url ────────────────────────────────
  // Block the controller iframe from loading.  When Stripe.js cannot get a
  // postMessage reply from the iframe it falls back to a top-level navigation
  // (layer 4 above).  Blocking the iframe at the source removes that trigger.
  // Elements card iframes (elements-inner-card-*.html) pass through because
  // CONTROLLER_RE requires "controller" in the path.
  try {
    if (typeof HTMLIFrameElement !== "undefined") {
      const iDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")
      if (iDesc?.set) {
        const origISet = iDesc.set
        Object.defineProperty(HTMLIFrameElement.prototype, "src", {
          ...iDesc,
          set(url: string) {
            if (isController(url)) return
            origISet.call(this, url)
          },
        })
      }
    }
  } catch { /* ignore */ }

  // ── 6. iframe.setAttribute("src", url) ──────────────────────────────────────
  // Stripe may set the iframe src via setAttribute instead of the .src property.
  try {
    const origSetAttr = HTMLElement.prototype.setAttribute
    HTMLElement.prototype.setAttribute = function (name: string, value: string) {
      if (name === "src" && this instanceof HTMLIFrameElement && isController(value)) return
      origSetAttr.call(this, name, value)
    }
  } catch { /* ignore */ }
}

// Auto-apply on import.
applyStripeNavGuard()
