"use client"

/**
 * The browser's half of lib/orders/checkout-origin.ts: it gathers what the
 * page can see and hands it to the pure functions there. Kept apart so those
 * can be tested without a window.
 */

import { hasConsent } from "@/lib/consent/client"
import { getStoredAttribution } from "@/lib/analytics-utils"
import { landingSearch, recentPaths } from "@/lib/navigation/in-app-history"
import { getMainDomain } from "@/lib/url-helpers"
import { describeCheckout, describePage, type FirstTouch, type OriginInput } from "./checkout-origin"
import type { OrderOrigin } from "./order-source"

/** The visit's first address, as Analytics kept it: only with analytics consent. */
function firstTouch(): FirstTouch | null {
  try {
    if (!hasConsent("analytics")) return null
    const sid = document.cookie.match(/(?:^|;\s*)sl_asid=([^;]+)/)?.[1]
    if (!sid) return null
    const stored = getStoredAttribution(decodeURIComponent(sid))
    if (!stored) return null
    return {
      referrerDomain: stored.referrerDomain,
      utm_source: stored.utm?.utm_source ?? null,
      utm_campaign: stored.utm?.utm_campaign ?? null,
      clientApp: stored.clientApp ?? null,
    }
  } catch {
    return null
  }
}

function input(): OriginInput | null {
  if (typeof window === "undefined") return null
  return {
    href: window.location.href,
    referrer: document.referrer || "",
    trail: recentPaths(),
    landingSearch: landingSearch(),
    userAgent: navigator.userAgent || "",
    mainDomain: getMainDomain(),
    firstTouch: firstTouch(),
  }
}

/** On the checkout page: where this checkout began. */
export function checkoutOrigin(): OrderOrigin | null {
  try {
    const i = input()
    return i ? describeCheckout(i) : null
  } catch {
    return null
  }
}

/** On any other page: this page, and where its visit came from. */
export function pageOrigin(): OrderOrigin | null {
  try {
    const i = input()
    return i ? describePage(i) : null
  } catch {
    return null
  }
}
