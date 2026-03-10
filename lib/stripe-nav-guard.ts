/**
 * stripe-nav-guard.ts
 *
 * Keeps paid checkout entirely inside the Capacitor WKWebView — no browser
 * opens, no page navigation away from the checkout screen.
 *
 * ─── How Stripe triggers the problem ────────────────────────────────────────
 * When Stripe.js initialises it creates a hidden controller iframe:
 *
 *   <iframe src="https://js.stripe.com/v3/controller-with-preconnect-*.html">
 *
 * The controller sends a postMessage to its parent (Stripe.js in the main
 * frame). Stripe.js then sets window.location.href = controllerUrl as the
 * Link prewarm step. In a Capacitor WKWebView this replaces the checkout page
 * with the controller page, or opens Safari.
 *
 * ─── Why pure location-href patching does not work ───────────────────────────
 * `window.location.href` is declared [LegacyUnforgeable] in the WebIDL spec.
 * In iOS WebKit the property is non-configurable on every Location instance;
 * Object.defineProperty on Location.prototype silently fails. There is no
 * reliable JS way to intercept the href setter in WKWebView.
 *
 * ─── Correct approach ────────────────────────────────────────────────────────
 * Block the CONTROLLER IFRAME before it ever loads. If the iframe has no src
 * it never bootstraps, never sends the postMessage, and Stripe.js never calls
 * window.location.href. The card-input iframes (elements-inner-card-*.html)
 * are NOT blocked — they are required for Stripe Elements to work.
 *
 * Five layers target every known path Stripe uses to create the controller:
 *
 *   1. HTMLIFrameElement.prototype.src setter        — direct property set
 *   2. HTMLElement.prototype.setAttribute('src',…)  — setAttribute path
 *   3. document.createElement override              — captures the element
 *                                                     at creation time and
 *                                                     installs a one-shot src
 *                                                     watcher via Object.define
 *   4. MutationObserver on <html>                   — innerHTML / parser path
 *      (removes controller iframes added via insertAdjacentHTML / innerHTML)
 *   5. window.open / location.assign / replace      — navigation fallbacks
 *
 * The guard is scoped by CONTROLLER_RE so only URLs containing both
 * "js.stripe.com" and "controller" in the path are affected.
 */

let _applied = false

/** Matches the Stripe controller URL but NOT card-element or other iframes. */
const CONTROLLER_RE = /js\.stripe\.com[^#?]*controller/

function isController(url: unknown): boolean {
  return CONTROLLER_RE.test(String(url ?? ""))
}

export function applyStripeNavGuard(): void {
  if (typeof window === "undefined" || _applied) return
  _applied = true

  // ── 1. HTMLIFrameElement.prototype.src setter ────────────────────────────────
  // Intercepts:  iframe.src = 'https://js.stripe.com/v3/controller-*.html'
  try {
    const iDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")
    if (iDesc?.set) {
      const _iSet = iDesc.set
      Object.defineProperty(HTMLIFrameElement.prototype, "src", {
        ...iDesc,
        set(url: string) {
          if (isController(url)) return  // drop — controller never loads
          _iSet.call(this, url)
        },
      })
    }
  } catch { /* ignore */ }

  // ── 2. HTMLElement.prototype.setAttribute for src ────────────────────────────
  // Intercepts:  iframe.setAttribute('src', 'https://js.stripe.com/…/controller-*.html')
  try {
    const _origSetAttr = HTMLElement.prototype.setAttribute
    HTMLElement.prototype.setAttribute = function (name: string, value: string) {
      if (name === "src" && this instanceof HTMLIFrameElement && isController(value)) return
      _origSetAttr.call(this, name, value)
    }
  } catch { /* ignore */ }

  // ── 3. document.createElement override ──────────────────────────────────────
  // Wraps every new <iframe> so that any later src assignment (even after the
  // element is attached to the DOM) is intercepted by a defineProperty watcher.
  try {
    const _origCreate = document.createElement.bind(document)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(document as any).createElement = function (tagName: string, options?: ElementCreationOptions) {
      const el = _origCreate(tagName, options)
      if (tagName.toLowerCase() === "iframe") {
        // Install a per-instance src watcher as soon as the element is created.
        const iDesc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")
        if (iDesc?.set) {
          const _iSet = iDesc.set
          try {
            Object.defineProperty(el, "src", {
              configurable: true,
              get() { return iDesc.get ? iDesc.get.call(this) : "" },
              set(url: string) {
                if (isController(url)) return
                _iSet.call(this, url)
              },
            })
          } catch { /* ignore if already patched by layer 1 */ }
        }
      }
      return el
    }
  } catch { /* ignore */ }

  // ── 4. MutationObserver — innerHTML / insertAdjacentHTML / parser path ───────
  // When Stripe uses innerHTML assignment the browser parses the HTML and sets
  // the src attribute directly during DOM construction, bypassing JS setters.
  // The MutationObserver fires synchronously after the node is added and removes
  // any controller iframe before it has a chance to establish a connection.
  try {
    const _obs = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node instanceof HTMLIFrameElement) {
            const src = node.getAttribute("src") || (node as HTMLIFrameElement).src
            if (isController(src)) {
              node.remove()
            }
          }
        }
        // Also catch setAttribute('src', …) changes on existing iframes
        if (
          m.type === "attributes" &&
          m.attributeName === "src" &&
          m.target instanceof HTMLIFrameElement
        ) {
          const src = (m.target as HTMLIFrameElement).getAttribute("src") || ""
          if (isController(src)) {
            (m.target as HTMLIFrameElement).removeAttribute("src")
          }
        }
      }
    })
    _obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src"],
    })
  } catch { /* ignore */ }

  // ── 5. Navigation fallbacks (window.open / assign / replace) ─────────────────
  // Belt-and-suspenders: catch any top-level navigation attempt that somehow
  // escapes layers 1–4. These DO work in WebKit for non-href paths.
  try {
    const _open = window.open.bind(window)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any).open = (url?: string | URL, target?: string, features?: string) => {
      if (isController(url)) return null
      return _open(url, target, features)
    }
  } catch { /* ignore */ }

  try {
    const _assign = window.location.assign.bind(window.location)
    window.location.assign = (url: string | URL) => {
      if (isController(url)) return
      _assign(String(url))
    }
  } catch { /* ignore */ }

  try {
    const _replace = window.location.replace.bind(window.location)
    window.location.replace = (url: string | URL) => {
      if (isController(url)) return
      _replace(String(url))
    }
  } catch { /* ignore */ }
}

// Auto-apply on import.
applyStripeNavGuard()
