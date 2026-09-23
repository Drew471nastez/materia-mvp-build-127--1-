import { hasConsent } from "@/lib/consent/client"
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
 * cookie is made and no attribution is kept: the view is still counted, once
 * and without an identifier, by app/api/track-view. See lib/consent.
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

    // Ignore self-referrals
    if (!refHost || refHost === currentHost) return "Direct"

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
export function trackFunnelStep(
  eventType: "buy_click" | "checkout_start",
  creatorId: string,
  productId?: string | null,
): Promise<void> {
  if (typeof window === "undefined" || !creatorId) return Promise.resolve()
  return fetch("/api/track-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      eventType,
      creatorId,
      productId: productId || undefined,
      /* Without analytics consent these are empty, and not sent at all. */
      sessionId: getOrCreateSessionId() || undefined,
      visitorId: getOrCreateVisitorId() || undefined,
    }),
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

export function hasViewBeenTracked(pageKey: string): boolean {
  if (typeof sessionStorage === "undefined") return false
  const tracked = sessionStorage.getItem(`materia_tracked_${pageKey}`)
  return tracked === "true"
}

export function markViewAsTracked(pageKey: string): void {
  if (typeof sessionStorage === "undefined") return
  sessionStorage.setItem(`materia_tracked_${pageKey}`, "true")
}

export function getPageKey(type: string, creatorId: string, productId?: string | null): string {
  return productId ? `${type}_${creatorId}_${productId}` : `${type}_${creatorId}`
}

// Get device type from user agent
export function getDeviceType(): "desktop" | "mobile" | "tablet" {
  if (typeof navigator === "undefined") return "desktop"
  const ua = navigator.userAgent.toLowerCase()
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) return "tablet"
  if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return "mobile"
  return "desktop"
}

// Get browser name from user agent
export function getBrowser(): string {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (ua.includes("Firefox")) return "Firefox"
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome"
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari"
  if (ua.includes("Edg")) return "Edge"
  if (ua.includes("Opera") || ua.includes("OPR")) return "Opera"
  return "Other"
}

// Get OS from user agent
export function getOS(): string {
  if (typeof navigator === "undefined") return "unknown"
  const ua = navigator.userAgent
  if (ua.includes("Windows")) return "Windows"
  if (ua.includes("Mac OS")) return "macOS"
  if (ua.includes("Linux") && !ua.includes("Android")) return "Linux"
  if (ua.includes("Android")) return "Android"
  if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS"
  return "Other"
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

/**
 * Detect "client app" based on in-app browser user agent.
 * This helps when referrer is missing (DM shares / in-app browsers).
 *
 * IMPORTANT:
 * - Instagram/TikTok/FB/Threads/Snap/Telegram are usually detectable.
 * - WhatsApp is inconsistent across devices; UTMs are the only guaranteed fix for WhatsApp.
 */
export function detectClientApp(): string | null {
  if (typeof navigator === "undefined") return null
  const ua = navigator.userAgent.toLowerCase()

  if (ua.includes("instagram")) return "instagram"
  if (ua.includes("tiktok")) return "tiktok"
  if (ua.includes("fbav") || ua.includes("fban") || ua.includes("facebook")) return "facebook"
  if (ua.includes("threads")) return "threads"
  if (ua.includes("snapchat")) return "snapchat"
  if (ua.includes("telegram")) return "telegram"
  if (ua.includes("whatsapp")) return "whatsapp"

  return null
}

// Categorize traffic source (client-side hint only; server is authoritative)
export function categorizeTrafficSource(
  referrer: string,
  utmSource?: string | null,
  utmMedium?: string | null,
  clientApp?: string | null,
): string {
  const source = (utmSource || "").toLowerCase()
  const medium = (utmMedium || "").toLowerCase()
  const ref = (referrer || "").toLowerCase()
  const app = (clientApp || "").toLowerCase()

  // 1) UTMs always win
  if (source || medium) {
    if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("paid") || medium.includes("ads")) {
      if (source.includes("google")) return "paid_search"
      return "paid"
    }

    if (medium.includes("email") || source.includes("email") || medium.includes("newsletter")) return "email"
    if (medium.includes("affiliate") || source.includes("affiliate")) return "affiliate"

    // explicit messaging UTMs
    if (source.includes("whatsapp")) return "social_whatsapp"
    if (source.includes("telegram")) return "social_telegram"

    if (medium.includes("social") || isSocialSource(source)) return getSocialPlatform(source)

    return "referral"
  }

  // 2) Referrer missing -> use client app fallback
  if (!ref || ref === "direct") {
    if (app === "whatsapp") return "social_whatsapp"
    if (app === "telegram") return "social_telegram"
    if (app === "instagram") return "social_instagram"
    if (app === "tiktok") return "social_tiktok"
    if (app === "facebook") return "social_facebook"
    if (app === "threads") return "social_threads"
    if (app === "snapchat") return "social_snapchat"
    return "direct"
  }

  // 3) Email domains before search engines
  if (isEmailDomain(ref)) return "email"

  // 4) Social redirectors / shorteners
  if (isSocialRedirectDomain(ref)) return getSocialPlatformFromDomain(ref)

  // 5) Social direct
  if (isSocialDomain(ref)) return getSocialPlatformFromDomain(ref)

  // 6) Search engines
  if (isSearchEngineDomain(ref)) return "organic_search"

  return "referral"
}

function isSearchEngineDomain(domain: string): boolean {
  return (
    domain.includes("google.") ||
    domain.includes("bing.") ||
    domain.includes("yahoo.") ||
    domain.includes("duckduckgo.") ||
    domain.includes("baidu.") ||
    domain.includes("yandex.")
  )
}

function isEmailDomain(domain: string): boolean {
  const emailDomains = [
    "mail.google.com",
    "gmail.com",
    "outlook.live.com",
    "outlook.office.com",
    "mail.yahoo.com",
    "protection.outlook.com",
  ]
  return emailDomains.some((d) => domain.includes(d))
}

function isSocialRedirectDomain(domain: string): boolean {
  const redirects = [
    "l.instagram.com",
    "lm.facebook.com",
    "l.facebook.com",
    "t.co",
    "linktr.ee",
    "lnk.bio",
    "bit.ly",
    "cutt.ly",
    "tinyurl.com",
    "wa.me",
    "whatsapp.com",
    "t.me",
    "telegram.me",
  ]
  return redirects.some((d) => domain.includes(d))
}

function isSocialSource(source: string): boolean {
  const socialKeywords = [
    "instagram",
    "tiktok",
    "facebook",
    "twitter",
    "x",
    "youtube",
    "pinterest",
    "linkedin",
    "snapchat",
    "reddit",
    "threads",
    "whatsapp",
    "telegram",
  ]
  return socialKeywords.some((keyword) => source.includes(keyword))
}

function isSocialDomain(domain: string): boolean {
  const socialDomains = [
    "instagram.com",
    "tiktok.com",
    "facebook.com",
    "twitter.com",
    "x.com",
    "youtube.com",
    "pinterest.com",
    "linkedin.com",
    "snapchat.com",
    "reddit.com",
    "threads.net",
    "whatsapp.com",
    "wa.me",
    "t.me",
    "telegram.me",
  ]
  return socialDomains.some((social) => domain.includes(social))
}

function getSocialPlatform(source: string): string {
  if (source.includes("whatsapp")) return "social_whatsapp"
  if (source.includes("telegram")) return "social_telegram"
  if (source.includes("instagram") || source.includes("ig")) return "social_instagram"
  if (source.includes("tiktok")) return "social_tiktok"
  if (source.includes("facebook") || source.includes("fb")) return "social_facebook"
  if (source.includes("twitter") || source === "x" || source.includes("x.com")) return "social_x"
  if (source.includes("youtube") || source.includes("yt")) return "social_youtube"
  if (source.includes("pinterest")) return "social_pinterest"
  if (source.includes("linkedin")) return "social_linkedin"
  if (source.includes("snapchat")) return "social_snapchat"
  if (source.includes("reddit")) return "social_reddit"
  if (source.includes("threads")) return "social_threads"
  return "social"
}

function getSocialPlatformFromDomain(domain: string): string {
  const d = domain.toLowerCase()
  if (d.includes("whatsapp") || d.includes("wa.me")) return "social_whatsapp"
  if (d.includes("t.me") || d.includes("telegram.me")) return "social_telegram"
  if (d.includes("instagram")) return "social_instagram"
  if (d.includes("tiktok")) return "social_tiktok"
  if (d.includes("facebook") || d.includes("lm.facebook.com") || d.includes("l.facebook.com")) return "social_facebook"
  if (d.includes("twitter") || d.includes("x.com") || d.includes("t.co")) return "social_x"
  if (d.includes("youtube")) return "social_youtube"
  if (d.includes("pinterest")) return "social_pinterest"
  if (d.includes("linkedin")) return "social_linkedin"
  if (d.includes("snapchat")) return "social_snapchat"
  if (d.includes("reddit")) return "social_reddit"
  if (d.includes("threads")) return "social_threads"
  return "social"
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
