/**
 * ===========================================================================
 *  STRIPE'S EMBEDDED FORM, KEPT INSIDE THE PHONE APP
 * ===========================================================================
 * Stripe's embedded payout setup draws in frames from connect-js.stripe.com,
 * and from inside those frames it can open windows of its own (a bank's
 * login while linking the payout account, a link to its terms) or move the
 * page it sits in. No script on Storelib's page can reach into those frames,
 * and the Capacitor shell answers every new window by handing its address
 * to Safari or Chrome (WebViewDelegationHandler createWebViewWith): the
 * creator was thrown out of Storelib in the middle of setup.
 *
 * What the page CAN decide is how much a frame it hosts is allowed to do,
 * before the frame loads: the `sandbox` attribute. Every Stripe frame gets
 * one that lets it run, keep its own origin and storage, send its forms and
 * show its own dialogs, and nothing else: no new windows, no moving the
 * page. A window Stripe asks for is refused inside the form (the same as a
 * popup blocker), so Stripe falls back to what it can do in place, and the
 * app never leaves Storelib. A frame Stripe opens inside its own frame
 * inherits the same limits.
 *
 * Only in an app build that cannot hold Stripe's windows itself. A build
 * that can (lib/native-bridge.ts appHoldsStripeWindows) opens them in a
 * window inside the app and needs none of this; a browser opens them as a
 * browser does.
 */

/** What a Stripe frame may do in the app: everything but open windows and move the page. */
export const STRIPE_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-storage-access-by-user-activation"

let installed = false

function isStripeFrameUrl(url: unknown): boolean {
  try {
    const host = new URL(String(url ?? ""), typeof location === "undefined" ? "https://storelib.com" : location.href).hostname.toLowerCase()
    return host === "stripe.com" || host.endsWith(".stripe.com") || host === "stripe.network" || host.endsWith(".stripe.network")
  } catch {
    return false
  }
}

function seal(frame: HTMLIFrameElement) {
  if (frame.getAttribute("sandbox") !== STRIPE_FRAME_SANDBOX) frame.setAttribute("sandbox", STRIPE_FRAME_SANDBOX)
}

/**
 * From now on, every Stripe frame on this page is sealed before it loads.
 * Idempotent. Covers the three ways a frame gets its address: the `src`
 * property, setAttribute("src"), and markup parsed into the page (where the
 * frame is sealed and loaded again, since a sandbox only applies from the
 * next load).
 */
export function keepStripeFramesInApp(): void {
  if (installed || typeof window === "undefined" || typeof HTMLIFrameElement === "undefined") return
  installed = true

  try {
    const desc = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, "src")
    if (desc?.set && desc.get) {
      const set = desc.set
      Object.defineProperty(HTMLIFrameElement.prototype, "src", {
        ...desc,
        set(this: HTMLIFrameElement, url: string) {
          if (isStripeFrameUrl(url)) seal(this)
          set.call(this, url)
        },
      })
    }
  } catch {
    /* the observer below still seals it */
  }

  try {
    /* On the frame's own prototype, so it runs first whatever else wraps setAttribute further up (lib/stripe-nav-guard.ts). */
    const setAttribute = HTMLIFrameElement.prototype.setAttribute
    HTMLIFrameElement.prototype.setAttribute = function (this: HTMLIFrameElement, name: string, value: string) {
      if (name.toLowerCase() === "src" && isStripeFrameUrl(value)) seal(this)
      return setAttribute.call(this, name, value)
    }
  } catch {
    /* the observer below still seals it */
  }

  try {
    const check = (node: Node) => {
      const frames = node instanceof HTMLIFrameElement ? [node] : node instanceof Element ? Array.from(node.querySelectorAll("iframe")) : []
      for (const frame of frames) {
        const src = frame.getAttribute("src")
        if (!src || !isStripeFrameUrl(src) || frame.getAttribute("sandbox") === STRIPE_FRAME_SANDBOX) continue
        seal(frame)
        /* Loaded before it was sealed: load it again, sealed. */
        frame.setAttribute("src", src)
      }
    }
    new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach(check)
    }).observe(document.documentElement, { childList: true, subtree: true })
  } catch {
    /* nothing more can be done from the page */
  }
}
