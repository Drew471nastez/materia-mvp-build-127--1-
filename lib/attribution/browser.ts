"use client"

/**
 * ===========================================================================
 *  TOUCHES IN THE BROWSER: KEPT PER ADDRESS, CARRIED TO CHECKOUT
 * ===========================================================================
 * The browser's half of lib/attribution/touch.ts. docs/analytics/attribution.md
 * has the whole design; the rules this file keeps:
 *
 * A SCOPE PER CREATOR. storelib.com serves every creator, so a touch there is
 * kept under the creator whose page it landed on (`c:<creator id>`): a visit
 * from Instagram to one creator's page is not the source of another
 * creator's sale. Any other host (a website on a Storelib subdomain, a
 * creator's own domain) belongs to one creator, and its touches are kept
 * under the host (`h:<host>`).
 *
 * STORED ONLY WITH ANALYTICS CONSENT, in one local storage entry,
 * `materia_attr_touches`: at most 20 scopes, each touch for 90 days. It
 * starts with `materia_attr_`, so saying no to analytics removes it with the
 * rest (lib/consent/client writeConsent). Without consent a touch lives in
 * this document's memory only, and is gone when the tab is: the order still
 * learns where THIS visit came from, which is what the Source column has
 * always recorded without consent, and nothing is left on the device.
 *
 * CARRIED ACROSS ADDRESSES. Checkout is on storelib.com, and local storage
 * does not cross from a website's host to it. So a link to checkout from any
 * other host carries the touches in `sl_at` (lib/orders/checkout-origin
 * checkoutHrefWithOrigin, and carryTouches below), and the checkout reads it
 * once and takes it off its address. A request a page makes itself carries
 * them in its body, inside `origin` (pageOrigin, checkoutOrigin).
 */

import { hasConsent, onConsentChange } from "@/lib/consent/client"
import { landingSearch } from "@/lib/navigation/in-app-history"
import { getMainDomain } from "@/lib/url-helpers"
import { isOnePageHost } from "@/lib/onepage/address"
import {
  CARRY_PARAM,
  cleanTouch,
  decodeTouches,
  encodeTouches,
  freshTouches,
  mergeTouches,
  recordVisit,
  touchFromVisit,
  type PropertyType,
  type Touch,
  type Touches,
} from "./touch"

export const STORE_KEY = "materia_attr_touches"
const MAX_SCOPES = 20

/** This document's touches, per scope, whatever the consent. Never written anywhere. */
const memory = new Map<string, Touches>()
/** Scopes this document has already noted its arrival for. */
const noted = new Set<string>()
/** Whether this document's arrival has been noted, for any scope. */
let arrived = false
/** The scope of the page on screen, set by <CaptureTouch>. */
let pageScope: string | null = null
/** What a link carried to this page; undefined until read. */
let carried: Touches | null | undefined

function platformHost(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "")
  const main = getMainDomain().toLowerCase().replace(/^www\./, "").split(":")[0]
  return h === main || h === "localhost" || h === "127.0.0.1" || h.endsWith(".vercel.app")
}

/**
 * A host every creator shares: storelib.com and storelib.me (the OnePages).
 * Touches there are kept per creator, never per host, so one creator's
 * OnePage visit is never another creator's source.
 */
function sharedHost(host: string): boolean {
  return platformHost(host) || isOnePageHost(host)
}

/** Where this page's touches are kept, or null when it cannot be told (a shared host with no creator). */
export function scopeFor(creatorId?: string | null): string | null {
  if (typeof window === "undefined") return null
  const host = window.location.hostname.toLowerCase().replace(/^www\./, "")
  if (!sharedHost(host)) return `h:${host}`
  return creatorId ? `c:${creatorId}` : null
}

type Kept = Record<string, { first: Touches["first"]; last: Touches["last"]; seen: number }>

function readStore(now: number): Kept {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as { v?: number; s?: Record<string, { first?: unknown; last?: unknown; seen?: unknown }> }
    if (parsed?.v !== 1 || !parsed.s || typeof parsed.s !== "object") return {}
    const out: Kept = {}
    for (const [scope, entry] of Object.entries(parsed.s)) {
      if (!/^[chs]:[a-z0-9.:-]{1,120}$/i.test(scope)) continue
      const t = freshTouches({ first: cleanTouch(entry?.first), last: cleanTouch(entry?.last) }, now)
      if (t) out[scope] = { ...t, seen: typeof entry?.seen === "number" ? entry.seen : 0 }
    }
    return out
  } catch {
    return {}
  }
}

function writeStore(kept: Kept) {
  if (!hasConsent("analytics")) return
  try {
    const newest = Object.entries(kept).sort((a, b) => b[1].seen - a[1].seen).slice(0, MAX_SCOPES)
    window.localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, s: Object.fromEntries(newest) }))
  } catch {
    /* storage full or blocked: the document's memory still has it */
  }
}

/** Kept for this scope: what was stored, with this document's own. */
export function touchesFor(scope: string | null): Touches | null {
  if (!scope || typeof window === "undefined") return null
  const now = Date.now()
  const stored = hasConsent("analytics") ? readStore(now)[scope] ?? null : null
  return freshTouches(mergeTouches(stored, memory.get(scope)), now)
}

/**
 * This page load, as a touch, when it is an arrival. The document's first
 * page is the arrival: document.referrer and the address it loaded with
 * describe it. A client navigation after that (the next page of the visit,
 * or another creator's page reached from Explore) still has that first
 * referrer, and is not an arrival; only a link inside the visit that carries
 * new UTM tags is, as a campaign of its own.
 */
export function noteVisit(scope: string, property: PropertyType | null) {
  if (typeof window === "undefined") return
  const tags = new URLSearchParams(window.location.search)
  const utm = ["utm_source", "utm_medium", "utm_campaign"].map((k) => tags.get(k) ?? "").join("|")
  const key = `${scope}|${utm}`
  if (noted.has(key)) return
  noted.add(key)
  const arrival = !arrived
  arrived = true
  if (!arrival && utm === "||") return
  const now = Date.now()
  const touch = touchFromVisit({
    href: window.location.href,
    referrer: arrival ? document.referrer || "" : "",
    landingSearch: arrival ? landingSearch() : "",
    userAgent: navigator.userAgent || "",
    mainDomain: getMainDomain(),
    property,
    now,
  })
  if (!touch) return
  memory.set(scope, recordVisit(memory.get(scope), touch, now))
  if (!hasConsent("analytics")) return
  const kept = readStore(now)
  kept[scope] = { ...recordVisit(kept[scope] ?? null, touch, now), seen: now }
  writeStore(kept)
}

/** A yes given after the page opened keeps what this document already saw. */
export function keepOnConsent(): () => void {
  if (typeof window === "undefined") return () => {}
  return onConsentChange((c) => {
    if (!c?.analytics || memory.size === 0) return
    const now = Date.now()
    const kept = readStore(now)
    for (const [scope, t] of memory) {
      const merged = mergeTouches(kept[scope] ?? null, t)
      if (merged) kept[scope] = { ...merged, seen: now }
    }
    writeStore(kept)
  })
}

export function setPageScope(scope: string | null) {
  pageScope = scope
}

export function clearPageScope(scope: string | null) {
  if (pageScope === scope) pageScope = null
}

/** The touches of the page on screen, encoded for a request body or a link. "" for none. */
export function currentTouches(): string {
  if (typeof window === "undefined") return ""
  const scope = pageScope ?? scopeFor(null)
  return encodeTouches(touchesFor(scope))
}

/**
 * What a link brought to this page in `sl_at`, read once and then taken off
 * the address, so it is not bookmarked, shared or sent on as a Referer.
 */
export function adoptCarriedTouches(): Touches | null {
  if (typeof window === "undefined") return null
  if (carried !== undefined) return carried
  carried = null
  try {
    const url = new URL(window.location.href)
    const raw = url.searchParams.get(CARRY_PARAM)
    if (raw === null) return null
    carried = decodeTouches(raw, Date.now())
    url.searchParams.delete(CARRY_PARAM)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  } catch {
    /* an address that cannot be read carried nothing */
  }
  return carried
}

/**
 * On the checkout page: what the link carried, joined with what this address
 * kept for the product's creator. Encoded for the order. "" for none.
 */
export function checkoutTouches(creatorId?: string | null): string {
  if (typeof window === "undefined") return ""
  return encodeTouches(freshTouches(mergeTouches(adoptCarriedTouches(), touchesFor(scopeFor(creatorId))), Date.now()))
}

/**
 * A link to checkout from a host that is not storelib.com, with this page's
 * touches on it. Anything else, or on storelib.com itself (where checkout
 * reads them from its own storage), comes back unchanged.
 */
export function carryTouches(href: string): string {
  if (typeof window === "undefined") return href
  if (platformHost(window.location.hostname)) return href
  let url: URL
  try {
    url = new URL(href, window.location.href)
  } catch {
    return href
  }
  if (url.pathname !== "/checkout" || url.searchParams.has(CARRY_PARAM)) return href
  const touches = currentTouches()
  if (!touches) return href
  url.searchParams.set(CARRY_PARAM, touches)
  const relative = !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("//")
  return relative ? `${url.pathname}${url.search}${url.hash}` : url.toString()
}

/* ─── Storelib's own sign ups ───────────────────────────────────────── */

/**
 * STORELIB'S OWN SCOPE. A visit to storelib.com (the home page, pricing,
 * the blog, a creator's page) can end in a Storelib account, and that
 * account's source is kept under this scope, apart from every creator's:
 * a creator's buyer never inherits it and it never reads theirs. The same
 * storage, the same consent, the same 90 days.
 */
export const PLATFORM_SCOPE = "s:storelib"

/**
 * Its own arrival, so noting it never takes the arrival from the creator's
 * page this document opened on (a creator page's <CaptureTouch> still sees
 * the document's first page as its arrival).
 */
let platformArrived = false

/**
 * This document's arrival, kept for Storelib itself. Only on storelib.com,
 * never on a creator's own host. Returns the touch it recorded (null when
 * none), so <CapturePlatformTouch> can count a visit from an AI assistant
 * (lib/attribution/ai-visit-browser).
 */
export function notePlatformVisit(): Touch | null {
  if (typeof window === "undefined" || !platformHost(window.location.hostname)) return null
  const tags = new URLSearchParams(window.location.search)
  const utm = ["utm_source", "utm_medium", "utm_campaign"].map((k) => tags.get(k) ?? "").join("|")
  const key = `${PLATFORM_SCOPE}|${utm}`
  if (noted.has(key)) return null
  noted.add(key)
  const arrival = !platformArrived
  platformArrived = true
  if (!arrival && utm === "||") return null
  const now = Date.now()
  const touch = touchFromVisit({
    href: window.location.href,
    referrer: arrival ? document.referrer || "" : "",
    landingSearch: arrival ? landingSearch() : "",
    userAgent: navigator.userAgent || "",
    mainDomain: getMainDomain(),
    property: null,
    now,
  })
  if (!touch) return null
  memory.set(PLATFORM_SCOPE, recordVisit(memory.get(PLATFORM_SCOPE), touch, now))
  if (!hasConsent("analytics")) return touch
  const kept = readStore(now)
  kept[PLATFORM_SCOPE] = { ...recordVisit(kept[PLATFORM_SCOPE] ?? null, touch, now), seen: now }
  writeStore(kept)
  return touch
}

/** Storelib's own touches, encoded for the sign up record. "" for none. */
export function platformTouches(): string {
  if (typeof window === "undefined") return ""
  return encodeTouches(touchesFor(PLATFORM_SCOPE))
}

/** For tests and probes. */
export function resetTouchMemory() {
  memory.clear()
  noted.clear()
  arrived = false
  platformArrived = false
  pageScope = null
  carried = undefined
}
