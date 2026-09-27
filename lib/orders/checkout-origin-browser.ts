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
import { checkoutTouches, currentTouches } from "@/lib/attribution/browser"
import { describeCheckout, describePage, type CarriedOrigin, type FirstTouch, type OriginInput } from "./checkout-origin"

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

/**
 * The visit's touches ride along as `touches` (lib/attribution): the route
 * that records the order or the sign-up reads them from there, and the
 * origin's own checks (cleanOrigin) never keep them in `source_detail`.
 */
function withTouches(origin: CarriedOrigin | null, touches: string): CarriedOrigin | null {
  if (!touches) return origin
  return { ...(origin ?? {}), touches }
}

/** On the checkout page: where this checkout began, and the touches for the creator whose product it is. */
export function checkoutOrigin(creatorId?: string | null): CarriedOrigin | null {
  let origin: CarriedOrigin | null = null
  try {
    const i = input()
    origin = i ? describeCheckout(i) : null
  } catch {
    origin = null
  }
  try {
    return withTouches(origin, checkoutTouches(creatorId))
  } catch {
    return origin
  }
}

/** On any other page: this page, where its visit came from, and its touches. */
export function pageOrigin(): CarriedOrigin | null {
  let origin: CarriedOrigin | null = null
  try {
    const i = input()
    origin = i ? describePage(i) : null
  } catch {
    origin = null
  }
  try {
    return withTouches(origin, currentTouches())
  } catch {
    return origin
  }
}
