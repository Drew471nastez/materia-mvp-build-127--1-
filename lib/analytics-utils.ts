import { hasConsent } from "@/lib/consent/client"
import { pixelEvent } from "@/lib/analytics/pixels"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer } from "@/lib/analytics/sources"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import { send, skipReason } from "@/lib/analytics/page-tracker"
// lib/analytics-utils.ts
// Utility functions for analytics tracking

type UTM = {
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
}

export type Attribution = {
  sourceCategory: string
  referrerDomain: string | null
  referrer: string | null
  pageUrl: string | null
  utm: UTM
  ts: number
  clientApp?: string | null
}

const ATTR_PREFIX = "materia_attr_"

/**
 * WITHOUT ANALYTICS CONSENT NOTHING HERE IS STORED. No visitor or session
 * cookie is made and no attribution is kept: the view is still counted by
 * app/api/track-view, its visit found on the server from a daily hash that
 * is never on the device (lib/analytics/anon-visit). See lib/consent.
 */
function analyticsAllowed(): boolean {
  return hasConsent("analytics")
}

function normalizeHost(host: string): string {
  return host.replace(/^www\./, "").trim().toLowerCase()
}

function safeJsonParse<T>(value: string | null): T | null {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

/**
 * Persist "first touch attribution" for a given sessionId.
 * This makes internal navigation NOT reset source to direct.
 */
export function storeAttribution(sessionId: string, data: Attribution): void {
  if (typeof window === "undefined") return
  if (!sessionId || !analyticsAllowed()) return
  try {
    window.localStorage.setItem(`${ATTR_PREFIX}${sessionId}`, JSON.stringify(data))
  } catch {
    // ignore storage errors
  }
}

export function getStoredAttribution(sessionId: string): Attribution | null {
  if (typeof window === "undefined") return null
  if (!sessionId) return null
  try {
    return safeJsonParse<Attribution>(window.localStorage.getItem(`${ATTR_PREFIX}${sessionId}`))
  } catch {
    return null
  }
}

// Get referrer host from document.referrer
export function getReferrerHost(): string {
  if (typeof document === "undefined" || typeof window === "undefined") return "Direct"
  try {
    const ref = document.referrer || ""
    if (!ref) return "Direct"

    const refHost = normalizeHost(new URL(ref).hostname)
    const currentHost = normalizeHost(window.location.hostname)

    // Ignore self-referrals: this page, Storelib, a creator's Storelib site, the payment page
    if (!refHost || isInternalReferrer(refHost, process.env.NEXT_PUBLIC_MAIN_DOMAIN || "storelib.com", currentHost)) return "Direct"

    return refHost
  } catch {
    return "Direct"
  }
}

// Get UTM parameters from URL
export function getUTMParams(): UTM {
  if (typeof window === "undefined") {
    return {
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    }
  }
  const sp = new URLSearchParams(window.location.search)
  return {
    utm_source: sp.get("utm_source"),
    utm_medium: sp.get("utm_medium"),
    utm_campaign: sp.get("utm_campaign"),
    utm_term: sp.get("utm_term"),
    utm_content: sp.get("utm_content"),
  }
}

/**
 * The analytics session: one visit, ending after 30 minutes without a page.
 *
 * ITS OWN COOKIE. This was `materia_session`, which is also the name of the
 * checkout's httpOnly device cookie (app/api/checkout/*). A script can
 * neither read nor overwrite an httpOnly cookie, so once somebody had bought
 * something every page they opened made a new session id here and the
 * Sessions figure counted each of their page views as a visit. And before
 * they bought, the checkout read this one as its device fingerprint.
 *
 * SLIDING. Every use pushes the 30 minutes on, so a visit is 30 minutes of
 * inactivity rather than 30 minutes from the first page.
 */
const SESSION_COOKIE = "sl_asid"
const SESSION_SECONDS = 60 * 30

export function getOrCreateSessionId(): string {
  if (typeof document === "undefined" || !analyticsAllowed()) return ""
  const match = document.cookie.match(/(?:^|;\s*)sl_asid=([^;]+)/)
  const sid = match?.[1]
    ? decodeURIComponent(match[1])
    : `s_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  document.cookie = `${SESSION_COOKIE}=${encodeURIComponent(sid)}; path=/; max-age=${SESSION_SECONDS}; samesite=lax; secure`
  return sid
}

/**
 * A step towards a sale, sent with the visit it belongs to so the funnel can
 * count visits rather than clicks. The server drops a repeat of the same step
 * for the same product in the same visit.
 */
/**
 * Steps already sent from this page, in memory only. Without analytics
 * consent there is no session id for the server to recognise a repeat by,
 * so a Buy pressed three times counted three visits and the funnel read
 * more buyers than visitors. Nothing is stored: a reload starts it again,
 * which is the one repeat left, and the price of not storing anything.
 */
const sentSteps = new Set<string>()

export function trackFunnelStep(
  eventType: "buy_click" | "checkout_start",
  creatorId: string,
  productId?: string | null,
): Promise<void> {
  if (typeof window === "undefined" || !creatorId) return Promise.resolve()
  const key = `${eventType}|${creatorId}|${productId || ""}`
  if (sentSteps.has(key)) return Promise.resolve()
  sentSteps.add(key)
  /* A browser driven by a script is not a buyer (lib/analytics/page-tracker). */
  if (skipReason(window) === "automated") return Promise.resolve()
  /* The store's own Google Analytics and pixels hear the same step (lib/analytics/pixels.ts). */
  pixelEvent(window, eventType === "buy_click" ? "add_to_cart" : "begin_checkout", productId)
  return send(window, "/api/track-event", {
    eventType,
    creatorId,
    productId: productId || undefined,
    /* The page it happened on, which the server places on a property (lib/analytics/property). */
    href: window.location.href,
    /* Without analytics consent these are empty, and not sent at all. */
    sessionId: getOrCreateSessionId() || undefined,
    visitorId: getOrCreateVisitorId() || undefined,
  })
    .then(() => undefined)
    .catch(() => undefined)
}

// Get or create visitor ID (persistent ~1 year)
export function getOrCreateVisitorId(): string {
  if (typeof document === "undefined" || !analyticsAllowed()) return ""
  const match = document.cookie.match(/(?:^|;\s*)materia_visitor=([^;]+)/)
  if (match?.[1]) return decodeURIComponent(match[1])

  const vid = `v_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
  document.cookie = `materia_visitor=${encodeURIComponent(vid)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax; secure`
  return vid
}

/*
  Which pages this tab has already counted is kept by lib/analytics/page-tracker
  (pageKeyOf, recentlySent): by host and path, for 30 minutes. It was one key
  per creator here, so every page of a website after the first was dropped as
  a repeat, and a website counted one view a visit whatever was read.
*/

/**
 * ===========================================================================
 *  DEVICE, BROWSER AND SYSTEM, BY THE SAME RULES THE SERVER READS
 * ===========================================================================
 * These were their own set of `includes` checks, and the order was wrong in
 * a way that reached every report: an iPhone says "like Mac OS X", the Mac
 * test ran first, and so every iPhone was recorded as macOS. Opera and
 * Samsung Internet say "Chrome" and were counted as Chrome. They now read
 * lib/analytics/user-agent, which the OnePage reports already used.
 *
 * AN iPAD SAYS IT IS A MAC. Since iPadOS 13 Safari sends the desktop Mac
 * signature, and the only tell is a touch screen, which no Mac has.
 */
function agent(): ReturnType<typeof parseUserAgent> {
  if (typeof navigator === "undefined") return { device: null, browser: null, os: null }
  const parsed = parseUserAgent(navigator.userAgent)
  const iPad = /macintosh/i.test(navigator.userAgent) && (navigator.maxTouchPoints ?? 0) > 1
  return iPad ? { ...parsed, device: "tablet", os: "iOS" } : parsed
}

export function getDeviceType(): "desktop" | "mobile" | "tablet" {
  return agent().device ?? "desktop"
}

export function getBrowser(): string {
  return agent().browser ?? "Other"
}

export function getOS(): string {
  return agent().os ?? "Other"
}

// Get screen dimensions
export function getScreenDimensions(): { width: number; height: number } {
  if (typeof window === "undefined") return { width: 0, height: 0 }
  return { width: window.screen.width, height: window.screen.height }
}

// Get browser language
export function getLanguage(): string {
  if (typeof navigator === "undefined") return "en"
  return navigator.language || "en"
}

/** The in-app browser a link was opened in, from its signature. */
export function detectClientApp(): string | null {
  if (typeof navigator === "undefined") return null
  return detectClientAppFromUA(navigator.userAgent)
}

/**
 * The browser's hint at a source. The server decides the one that is stored
 * (app/api/track-view), with the same function, so the two cannot disagree.
 */
export function categorizeTrafficSource(
  referrer: string,
  utmSource?: string | null,
  utmMedium?: string | null,
  clientApp?: string | null,
): string {
  return categorizeServerSource(referrer, utmSource, utmMedium, clientApp)
}

/**
 * Create attribution object from CURRENT page load.
 */
export function getAttributionFromCurrentPage(): Attribution {
  const referrerDomain = getReferrerHost()
  const utm = getUTMParams()
  const clientApp = detectClientApp()
  const sourceCategory = categorizeTrafficSource(referrerDomain, utm.utm_source, utm.utm_medium, clientApp)

  return {
    sourceCategory,
    referrerDomain: referrerDomain === "Direct" ? null : referrerDomain,
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    pageUrl: typeof window !== "undefined" ? window.location.href : null,
    utm,
    ts: Date.now(),
    clientApp,
  }
}

/**
 * Returns the best attribution for tracking:
 * - If first-touch exists for sessionId, reuse it (prevents "Direct" on internal nav)
 * - If UTMs appear later, overwrite (new campaign)
 * - If clientApp appears later (e.g. IG in-app), overwrite if stored was direct
 */
export function getAttributionForTracking(sessionId: string): Attribution {
  const stored = getStoredAttribution(sessionId)
  const current = getAttributionFromCurrentPage()

  const hasUtmNow = Boolean(current.utm.utm_source || current.utm.utm_medium)
  const storedIsDirect = (stored?.sourceCategory || "").toLowerCase() === "direct"
  const currentIsDirect = (current.sourceCategory || "").toLowerCase() === "direct"
  const gainedClientApp = Boolean(current.clientApp) && !stored?.clientApp

  // If nothing stored, store current
  if (!stored) {
    storeAttribution(sessionId, current)
    return current
  }

  // If UTMs exist now, always overwrite (new campaign)
  if (hasUtmNow) {
    storeAttribution(sessionId, current)
    return current
  }

  // If we were "direct" but now we have a stronger signal (clientApp), overwrite
  if (storedIsDirect && !currentIsDirect) {
    storeAttribution(sessionId, current)
    return current
  }

  // If we were direct + no clientApp, but now clientApp exists (even if still "direct" in category),
  // store it so server can use it.
  if (storedIsDirect && gainedClientApp) {
    storeAttribution(sessionId, current)
    return current
  }

  // Otherwise keep first-touch stable
  return stored
}
