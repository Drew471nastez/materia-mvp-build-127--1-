"use client"

/**
 * NativeCookieKillSwitch
 *
 * Runs only inside Capacitor iOS/Android apps. Three layers of defence:
 *
 *  1. CSS injection — hides all known consent-vendor containers immediately
 *     via display:none !important before React even processes their DOM.
 *
 *  2. DOM removal — removes any already-present consent elements right after
 *     mount so they cannot be measured/animated before display:none kicks in.
 *
 *  3. MutationObserver — re-removes elements if a third-party script injects
 *     them dynamically after mount (e.g. async-loaded Cookiebot / OneTrust).
 *
 * Auth/session cookies are NOT affected — this only targets banner/overlay UI.
 * No-op in browsers (isNativeApp returns false) and during SSR (window guard).
 */

import { useEffect } from "react"
import { isNativeApp } from "@/lib/native-bridge"

// CSS selector list — covers every major consent-vendor container.
// Used both as a CSS rule selector and as a querySelectorAll argument.
const VENDOR_SELECTORS = [
  // OneTrust
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#onetrust-pc-sdk",
  ".onetrust-pc-dark-filter",
  "#ot-sdk-btn-floating",
  // Cookiebot
  "#CybotCookiebotDialog",
  "#CybotCookiebotDialogBodyUnderlay",
  "#CookiebotWidget",
  // Termly
  "#termly-code-snippet-support",
  // Didomi
  "#didomi-host",
  "#didomi-notice",
  "#didomi-popup",
  // Iubenda
  "#iubenda-cs-banner",
  ".iubenda-cs-visible",
  // Usercentrics
  "#usercentrics-root",
  // TrustArc
  "#truste-consent-track",
  "#truste-notice",
  // Generic attribute patterns (unlikely to collide with app-owned elements)
  '[id*="cookie-banner"]',
  '[id*="cookie-consent"]',
  '[id*="consent-banner"]',
  '[id*="gdpr-banner"]',
  '[class*="cookie-consent-banner"]',
  '[class*="gdpr-consent"]',
]

const SELECTOR_STRING = VENDOR_SELECTORS.join(",")

function removeConsentElements(): void {
  try {
    document.querySelectorAll(SELECTOR_STRING).forEach(el => el.remove())
  } catch {
    // ignore — querySelectorAll can throw on malformed selectors in some envs
  }
}

export function NativeCookieKillSwitch(): null {
  useEffect(() => {
    if (!isNativeApp()) return

    // ── 1. Inject CSS kill-switch ─────────────────────────────────────────
    // Runs before any async vendor scripts finish loading.
    const style = document.createElement("style")
    style.dataset.storelibNativeKillswitch = "1"
    style.textContent =
      SELECTOR_STRING +
      "{display:none!important;visibility:hidden!important;" +
      "opacity:0!important;pointer-events:none!important;}"
    document.head.appendChild(style)

    // ── 2. Remove already-present elements ───────────────────────────────
    removeConsentElements()

    // ── 3. MutationObserver — catch dynamically injected banners ─────────
    const observer = new MutationObserver(removeConsentElements)
    observer.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      // Leave the <style> in place intentionally — removing it on unmount
      // could briefly expose a vendor banner before the component remounts.
    }
  }, [])

  return null
}
