import "server-only"

import { createHmac } from "node:crypto"

import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { anonSession, anonVisitorId, clientIp, dailyKey } from "./anon-visit"
import { EVENT, EXPLORE_SOURCE, PAGE_VIEW_REPEAT_MS, SESSION_TIMEOUT_MS, normalizeLinkLabel, normalizeLinkUrl, normalizePath, type PropertyType } from "./events"
import { resolveProperty, type ResolvedProperty } from "./property"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost, sourceParamOf } from "./sources"
import { OWN_MARKER_COOKIE, OWN_MARKER_DOMAIN_COOKIE, consumeOwnHandoff, readOwnToken, signOwnMarker } from "./own-marker"
import { isBotAgent, osFromPlatformHint, parseUserAgent } from "./user-agent"

/**
 * ===========================================================================
 *  ONE PIPELINE FOR EVERY EVENT A VISITOR'S BROWSER SENDS
 * ===========================================================================
 * app/api/track-view (page views), app/api/track-event (link clicks and the
 * steps towards a sale) and app/api/onepage/track (a OnePage link, which is
 * also written to onepage_clicks for the OnePage editor) all end here, so an
 * event is judged by one set of rules whichever door it came in by:
 *
 *   1. the payload is checked field by field and capped; ids are uuids
 *   2. not a person: a robot's signature, no signature at all
 *   3. not a visit: a prefetch or a prerender the browser announced
 *   4. not from the page it claims: another site's request (Origin or
 *      Sec-Fetch-Site says so)
 *   5. too many from one address (rate_limit_hits, lib/api/rate-limit)
 *   6. a creator that exists, and a product that is theirs
 *   7. not the creator on their own pages (lib/analytics/own-visit)
 *   8. the property, from the page's address (lib/analytics/property):
 *      never from the page's say-so, and always the creator's own
 *   9. the visitor and the visit, by consent (lib/consent): the cookies
 *      with it, the daily hash without (lib/analytics/anon-visit)
 *  10. a repeat inside 30 minutes is the same event
 *  11. the row, with every column checked; the counters for a view
 *
 * Every answer is the same to the caller (the routes send 204): a robot
 * learns nothing from being refused. `reason` is for tests and logs.
 *
 * It never throws. A database that has not run supabase/sql/run-now part 61
 * yet gets the row it can hold, and a OnePage view or a link click, which it
 * has nowhere to keep apart, is not written at all rather than written as
 * something else.
 */

type Db = { from: (table: string) => any; rpc?: (fn: string, args: Record<string, unknown>) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** The host a hand-off is used on: the page's own, else the request's. */
function handoffHost(href: unknown, requestHost: string | null): string {
  if (typeof href === "string") {
    try {
      return new URL(href).host
    } catch {
      /* the request's, below */
    }
  }
  return requestHost ?? ""
}

export type CollectKind = "view" | "link_click" | "nav_click" | "buy_click" | "checkout_start" | "checkout_complete" | "download"
export const FUNNEL_KINDS = ["buy_click", "checkout_start", "checkout_complete", "download"] as const

export type CollectReason =
  | "recorded"
  | "invalid"
  | "bot"
  | "prefetch"
  | "cross_site"
  | "rate_limited"
  | "unknown_creator"
  | "unknown_product"
  | "own"
  | "no_property"
  | "duplicate"
  | "not_ready"
  | "error"

export interface CollectRequest {
  kind: CollectKind
  body: unknown
  headers: Headers
  /** A cookie's value from the request. */
  cookie: (name: string) => string | undefined
  cookieNames: string[]
}

export interface CollectDeps {
  db: Db
  now: () => number
  mainDomain: string
  /** The signed in account is the owner, or on the store's team (lib/analytics/own-visit). */
  isOwnVisit: (cookieNames: string[], ownerUserId: string | null | undefined, creatorId?: string | null) => Promise<boolean>
  /** Whether this host's marker cookie names this creator (lib/analytics/own-marker). */
  marksOwner: (cookieValue: string | undefined, creatorId: string) => boolean
  /** True when this address has asked too often (lib/api/rate-limit, bucket "track"). */
  limited: (subject: string) => Promise<boolean>
}

export interface CollectOutcome {
  recorded: boolean
  reason: CollectReason
  /** Why the property could not be placed, when that is the reason. */
  detail?: string
  row?: Record<string, unknown>
  /** For a page view: the server's visitor cookie to set, or to clear. */
  visitorCookie?: { set: string } | { clear: true } | null
  /** The creator's own browser, told by the app's hand-off: the marker (OWN_MARKER_COOKIE) to set on this host. */
  ownMarker?: string | null
}

/* ─── Fields ─────────────────────────────────────────────────────────── */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ID = /^[A-Za-z0-9_-]{1,80}$/

function uuid(v: unknown): string | null {
  return typeof v === "string" && UUID.test(v) ? v.toLowerCase() : null
}

/** A short string or nothing: a payload is not a place to store a novel. */
function short(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

/** An id the browser made (sl_asid, materia_visitor): letters, digits, _ and -, at most 80. */
function browserId(v: unknown): string | null {
  return typeof v === "string" && ID.test(v) ? v : null
}

function int(v: unknown, max = 100_000): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : null
}

const DEVICES = new Set(["desktop", "mobile", "tablet"])

function hostOf(value: string | null): string | null {
  if (!value || value === "null") return null
  try {
    return new URL(value).hostname.toLowerCase()
  } catch {
    return null
  }
}

/* ─── Not a visit ────────────────────────────────────────────────────── */

/**
 * A request the browser made ahead of time, which nobody may ever look at.
 * The tracker runs in the page after it is shown, so a prefetch never runs
 * it; these are the headers a speculative load carries, refused in case one
 * reaches the route anyway.
 */
export function isPrefetch(headers: Headers): boolean {
  const purpose = `${headers.get("purpose") ?? ""} ${headers.get("sec-purpose") ?? ""} ${headers.get("x-purpose") ?? ""} ${headers.get("x-moz") ?? ""}`.toLowerCase()
  return /prefetch|prerender|preview/.test(purpose) || headers.has("next-router-prefetch")
}

/**
 * Sent from another site. The trackers post to their own origin, so the
 * browser says same-origin; a form or a script on somebody else's page says
 * otherwise. A browser too old to say anything is let through.
 */
export function isCrossSite(headers: Headers): boolean {
  const site = headers.get("sec-fetch-site")
  if (site && site !== "same-origin") return true
  const origin = hostOf(headers.get("origin"))
  const host = (headers.get("host") || "").split(":")[0].toLowerCase()
  return !!(origin && host && origin !== host)
}

/** The address, hashed under today's key: counted, never kept (lib/analytics/anon-visit). */
function addressSubject(headers: Headers, now: number): string | null {
  const ip = clientIp(headers)
  if (!ip) return null
  return `track:${createHmac("sha256", dailyKey(now)).update(ip).digest("hex").slice(0, 32)}`
}

function countryOf(headers: Headers): { code: string | null; name: string | null } {
  const raw = headers.get("x-vercel-ip-country")
  const code = raw && /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : null
  /* Every country by its English name (Intl.DisplayNames(["en"], { type: "region" })), not a typed list. */
  let name: string | null = null
  if (code) {
    try {
      name = new Intl.DisplayNames(["en"], { type: "region" }).of(code) || code
    } catch {
      name = code
    }
  }
  return { code, name }
}

/**
 * THE REFERRER, AS A SOURCE. Storelib itself, the creator's own site on a
 * Storelib subdomain and the payment page a buyer comes back from are where
 * the visitor was a moment ago, not where the visit came from: they are
 * Direct, and the browser keeps the visit's first source (lib/analytics-utils).
 */
function referrerDomainOf(v: unknown, pageUrl: string | null, mainDomain: string): string {
  const s = short(v, 300)
  if (!s || s.toLowerCase() === "direct") return "Direct"
  const host = referrerHost(s) || s.toLowerCase()
  const pageHost = hostOf(pageUrl)
  return isInternalReferrer(host, mainDomain, pageHost) ? "Direct" : host
}

/**
 * The source the landing page's address names without UTM tags (?ref=,
 * ?source=, ?via=), for a page whose tracker did not send one itself.
 */
function sourceOfLanding(pageUrl: string | null): string | null {
  if (!pageUrl) return null
  try {
    const q = new URL(pageUrl).searchParams
    return q.get("utm_medium") ? null : sourceParamOf(q)
  } catch {
    return null
  }
}

/* ─── The columns part 61 adds, for a database that has not run it ─── */

const NEW_COLUMNS = ["property_type", "property_id", "path", "link_id", "link_url"] as const

/* Until part 253 adds analytics_events.page_title, a view is written without it, and the first refusal is remembered. */
let noTitleUntil = 0

function missingColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === "PGRST204" || error.code === "42703" || /column|could not find/i.test(error.message ?? "")
}

function checkRefused(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === "23514" || /check constraint/i.test(error.message ?? ""))
}

/* ─── The pipeline ───────────────────────────────────────────────────── */

export async function collect(req: CollectRequest, deps: CollectDeps): Promise<CollectOutcome> {
  try {
    return await run(req, deps)
  } catch (error) {
    console.error("[analytics] not recorded:", error instanceof Error ? error.message : "unknown error")
    return { recorded: false, reason: "error" }
  }
}

async function run(req: CollectRequest, deps: CollectDeps): Promise<CollectOutcome> {
  const { db } = deps
  const now = deps.now()
  const body = (req.body && typeof req.body === "object" ? req.body : {}) as Record<string, unknown>
  const kind = req.kind

  /* 1. The payload. */
  const creatorId = uuid(body.creatorId)
  const productId = body.productId === undefined || body.productId === null || body.productId === "" ? null : uuid(body.productId)
  if (!creatorId || (body.productId && !productId)) return { recorded: false, reason: "invalid" }
  const linkUrl = kind === "link_click" ? normalizeLinkUrl(body.linkUrl) : null
  const linkId = kind === "link_click" && typeof body.linkId === "string" && ID.test(body.linkId) ? body.linkId : null
  if (kind === "link_click" && !linkUrl && !linkId) return { recorded: false, reason: "invalid" }
  /* An internal click (nav_click): the page it leads to, as a full address on the same host, and the button's words. */
  const targetHref = kind === "nav_click" && typeof body.targetHref === "string" && body.targetHref.length <= 2000 ? body.targetHref : null
  const linkLabel = kind === "nav_click" ? normalizeLinkLabel(body.label) : null
  if (kind === "nav_click" && !targetHref) return { recorded: false, reason: "invalid" }

  /* 2 to 4. A person, looking, on the page itself. */
  const ua = req.headers.get("user-agent")
  if (isBotAgent(ua)) return { recorded: false, reason: "bot" }
  if (isPrefetch(req.headers)) return { recorded: false, reason: "prefetch" }
  if (isCrossSite(req.headers)) return { recorded: false, reason: "cross_site" }

  /* 5. Not a flood from one address. */
  const subject = addressSubject(req.headers, now)
  if (subject && (await deps.limited(subject))) return { recorded: false, reason: "rate_limited" }

  /* 6. A real creator, and a product that is theirs. */
  const { data: owner } = await db.from("creators").select("id, user_id").eq("id", creatorId).maybeSingle()
  if (!owner) return { recorded: false, reason: "unknown_creator" }
  if (productId) {
    const { data: product } = await db.from("products").select("id").eq("id", productId).eq("creator_id", creatorId).maybeSingle()
    if (!product) return { recorded: false, reason: "unknown_product" }
  }

  /*
    7. The creator on their own page is not a visitor. On storelib.com that
    is the session (lib/analytics/own-visit). Everywhere else the session
    cookie is host-only and never arrives, so the site's own host carries a
    marker instead, left by /api/analytics/own when the creator opened the
    page from the app (lib/analytics/own-marker). Either answer is enough.
  */
  const ownerUserId = (owner as { user_id?: string | null }).user_id ?? null
  /*
    The app's hand-off, in the address's fragment rather than through the
    marker route's extra hop (lib/analytics/own-site ownOpen): the page sends
    it with its view, and the answer marks this browser on this host, as
    /api/analytics/own would have. A connected domain opened from the app was
    counted as a visitor every time the creator looked at it.
  */
  const handoff = typeof body.own === "string" && body.own.length <= 4096 ? body.own : null
  /* A browser already marked first: the tab keeps sending its hand-off with each view, and only the first one on this host needs it. */
  if (deps.marksOwner(req.cookie(OWN_MARKER_COOKIE), creatorId) || deps.marksOwner(req.cookie(OWN_MARKER_DOMAIN_COOKIE), creatorId)) return { recorded: false, reason: "own" }
  /* Taken once on this page's host (own-marker consumeOwnHandoff): a copied link carrying it marks nobody else. */
  if (handoff && readOwnToken(handoff, "hand", now) === creatorId && (await consumeOwnHandoff(db, handoff, handoffHost(body.href, req.headers.get("host")), now)) === creatorId) return { recorded: false, reason: "own", ownMarker: signOwnMarker(creatorId, now) }
  if (await deps.isOwnVisit(req.cookieNames, ownerUserId, creatorId)) return { recorded: false, reason: "own" }

  /* 9, first half. Consent is the visitor's own record, read here, never the page's word. */
  const consented = allows(parse(req.cookie(CONSENT_COOKIE), now), "analytics")
  const anonVisitor = consented ? null : anonVisitorId({ ip: clientIp(req.headers), userAgent: ua, creatorId, now })
  const since = new Date(now - SESSION_TIMEOUT_MS).toISOString()

  const sessionFromBody = consented ? browserId(body.sessionId) : null

  /* 8. The property. */
  let property: ResolvedProperty | null = null
  const resolveHref = () =>
    resolveProperty(db, { requestHost: req.headers.get("host"), href: body.href, creatorId, creatorUserId: ownerUserId, mainDomain: deps.mainDomain }, now)
  const ofSession = async (sessionId: string | null): Promise<{ type: PropertyType; id: string | null } | null> => {
    if (!sessionId) return null
    const { data, error } = await db
      .from("analytics_events")
      .select("property_type, property_id")
      .eq("creator_id", creatorId)
      .eq("session_id", sessionId)
      .eq("event_type", EVENT.pageView)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
    const last = !error && Array.isArray(data) ? (data[0] as { property_type?: PropertyType | null; property_id?: string | null } | undefined) : undefined
    return last?.property_type ? { type: last.property_type, id: last.property_id ?? null } : null
  }

  if (kind === "view" || kind === "link_click" || kind === "nav_click") {
    const resolved = await resolveHref()
    if (!resolved.ok) return { recorded: false, reason: "no_property", detail: resolved.reason }
    property = resolved.property
  }
  /*
    An internal click's target is placed by the same rules as a page: it has
    to be another page of the very property the click was on (a website's
    shop from its home page), never a page of another site, a preview or the
    page itself. Its path is then the path a view of it is stored under, so
    the report can read "from this page to that page".
  */
  let targetPath: string | null = null
  if (kind === "nav_click" && property) {
    const target = await resolveProperty(db, { requestHost: req.headers.get("host"), href: targetHref, creatorId, creatorUserId: ownerUserId, mainDomain: deps.mainDomain }, now)
    if (!target.ok || target.property.type !== property.type || (target.property.id ?? null) !== (property.id ?? null)) return { recorded: false, reason: "invalid", detail: target.ok ? "other_property" : target.reason }
    if (target.property.path === property.path) return { recorded: false, reason: "invalid", detail: "same_page" }
    targetPath = target.property.path
  }

  /* 9, second half. The visitor and the visit. */
  let visitorId: string | null
  let sessionId: string | null
  if (kind === "view") {
    visitorId = consented ? browserId(req.cookie("visitor_id")) || browserId(body.visitorId) : anonVisitor
    if (!visitorId) visitorId = `${consented ? "v" : "anon"}_${crypto.randomUUID().replace(/-/g, "")}`
    sessionId = sessionFromBody || (anonVisitor ? await anonSession(db, anonVisitor, creatorId, now) : null) || `s_${crypto.randomUUID().replace(/-/g, "")}`
  } else {
    visitorId = consented ? browserId(body.visitorId) : anonVisitor
    sessionId = consented ? sessionFromBody : anonVisitor ? await anonSession(db, anonVisitor, creatorId, now) : null
  }

  /*
    A step towards a sale is placed by the page it happened on when that page
    is a property (Buy on a product page), else by the last page of its visit
    (the checkout, on storelib.com, belongs to wherever the buyer came from).
    Unplaced, it is still recorded, with no property, as it always was.
  */
  if (kind !== "view" && kind !== "link_click" && kind !== "nav_click") {
    const href = typeof body.href === "string" ? body.href : null
    const fromHref = href ? await resolveHref() : null
    if (fromHref && !fromHref.ok && fromHref.reason === "preview") return { recorded: false, reason: "no_property", detail: "preview" }
    const checkoutStep = kind === "checkout_start" || kind === "checkout_complete"
    if (fromHref?.ok && (!checkoutStep || fromHref.property.type === "website")) property = fromHref.property
    else {
      const last = await ofSession(sessionId)
      property = last ? { type: last.type, id: last.id, path: normalizePath(href) ?? "/" } : null
    }
  }

  /* 10. A repeat inside 30 minutes is the same event. */
  const repeatSince = new Date(now - PAGE_VIEW_REPEAT_MS).toISOString()
  if (kind === "view" && property) {
    let q = db
      .from("analytics_events")
      .select("id")
      .eq("creator_id", creatorId)
      .eq("visitor_id", visitorId)
      .eq("event_type", EVENT.pageView)
      .eq("property_type", property.type)
      .eq("path", property.path)
      .gte("created_at", repeatSince)
    q = property.id ? q.eq("property_id", property.id) : q.is("property_id", null)
    const { data, error } = await q.limit(1)
    if (error && missingColumn(error)) {
      /* Before part 61: the old rule, one view per page of the creator's per visitor. */
      let legacy = db.from("analytics_events").select("id").eq("visitor_id", visitorId).eq("creator_id", creatorId).eq("event_type", EVENT.pageView).gte("created_at", repeatSince)
      legacy = productId ? legacy.eq("product_id", productId) : legacy.is("product_id", null)
      const { data: seen } = await legacy.limit(1)
      if (Array.isArray(seen) && seen.length > 0) return { recorded: false, reason: "duplicate" }
    } else if (error) {
      console.warn("[analytics] repeat check failed, recording:", error.message)
    } else if (Array.isArray(data) && data.length > 0) {
      return { recorded: false, reason: "duplicate", visitorCookie: visitorCookieFor(consented, visitorId, req) }
    }
  } else if (kind === "link_click" && property && (sessionId || visitorId)) {
    let q = db.from("analytics_events").select("id").eq("creator_id", creatorId).eq("event_type", EVENT.linkClick).eq("property_type", property.type).gte("created_at", repeatSince)
    q = sessionId ? q.eq("session_id", sessionId) : q.eq("visitor_id", visitorId)
    q = linkId ? q.eq("link_id", linkId) : q.eq("link_url", linkUrl)
    const { data } = await q.limit(1)
    if (Array.isArray(data) && data.length > 0) return { recorded: false, reason: "duplicate" }
  } else if (kind === "nav_click" && property && (sessionId || visitorId)) {
    /* One per visit, page, target and words: a second tap on Shop now from the home page is the same click. */
    let q = db.from("analytics_events").select("id").eq("creator_id", creatorId).eq("event_type", EVENT.navClick).eq("property_type", property.type).eq("path", property.path).eq("link_url", targetPath).gte("created_at", repeatSince)
    q = sessionId ? q.eq("session_id", sessionId) : q.eq("visitor_id", visitorId)
    q = linkLabel ? q.eq("link_label", linkLabel) : q.is("link_label", null)
    const { data, error } = await q.limit(1)
    if (!error && Array.isArray(data) && data.length > 0) return { recorded: false, reason: "duplicate" }
  } else if (kind !== "view" && kind !== "link_click" && kind !== "nav_click" && sessionId) {
    /* One step per visit and product: a refresh of the checkout is not a second buyer. */
    let q = db.from("analytics_events").select("id").eq("creator_id", creatorId).eq("event_type", kind).eq("session_id", sessionId).gte("created_at", repeatSince)
    q = productId ? q.eq("product_id", productId) : q.is("product_id", null)
    const { data } = await q.limit(1)
    if (Array.isArray(data) && data.length > 0) return { recorded: false, reason: "duplicate" }
  }

  /* 11. The row. */
  const created_at = new Date(now).toISOString()
  const country = countryOf(req.headers)
  const base: Record<string, unknown> = {
    creator_id: creatorId,
    product_id: productId,
    event_type: kind === "view" ? EVENT.pageView : kind,
    visitor_id: visitorId,
    session_id: sessionId,
    property_type: property?.type ?? null,
    property_id: property?.id ?? null,
    path: property?.path || null,
    country_code: country.code,
    created_at,
  }
  if (kind === "link_click") {
    base.link_url = linkUrl
    base.link_id = linkId
  }
  if (kind === "nav_click") {
    base.link_url = targetPath
    if (linkLabel) base.link_label = linkLabel
  }

  let row = base
  if (kind === "view") {
    /* The same fields the view tracker has always kept, by the same rules. */
    const parsed = parseUserAgent(ua)
    const iPad = parsed.os === "macOS" && body.deviceType === "tablet" && body.os === "iOS"
    const sentDevice = short(body.deviceType, 20)
    const deviceType = iPad ? "tablet" : parsed.device ?? (sentDevice && DEVICES.has(sentDevice) ? sentDevice : null)
    const pageUrl = short(body.pageUrl, 1000)
    const clientApp = short(body.clientApp, 30) || detectClientAppFromUA(ua)
    const referrerDomain = referrerDomainOf(body.referrerDomain, pageUrl, deps.mainDomain)
    const utmSource = short(body.utm_source, 200) || (short(body.utm_medium, 200) ? null : sourceOfLanding(pageUrl))
    /* The system from the signature, else from the browser's Sec-CH-UA-Platform hint, else what the page said. */
    const os = iPad ? "iOS" : parsed.os ?? osFromPlatformHint(req.headers.get("sec-ch-ua-platform")) ?? short(body.os, 40)
    row = {
      ...base,
      referrer_domain: referrerDomain,
      referrer: short(body.referrer, 1000),
      /* The page the visit landed on (lib/analytics-utils first touch); `path` is this page. */
      page_url: pageUrl,
      utm_source: utmSource,
      utm_medium: short(body.utm_medium, 200),
      utm_campaign: short(body.utm_campaign, 200),
      utm_term: short(body.utm_term, 200),
      utm_content: short(body.utm_content, 200),
      device_type: deviceType,
      browser: parsed.browser ?? short(body.browser, 40),
      os,
      screen_width: int(body.screenWidth),
      screen_height: int(body.screenHeight),
      language: short(body.language, 20),
      country_name: country.name,
      /* No city or region without consent: the country only. */
      city: consented ? short(req.headers.get("x-vercel-ip-city"), 100) : null,
      region: consented ? short(req.headers.get("x-vercel-ip-country-region"), 100) : null,
      /*
        Opened from Storelib Explore: the page says so (components/analytics/explore-mark,
        a mark Explore leaves in the tab for 30 minutes), since a Next route change from
        Explore to a product keeps the referrer of the visit's first page. Only for a
        creator page or OnePage on storelib.com, where Explore's links go, and never over
        a tagged link, which names its own source.
      */
      source_category:
        body.via === "explore" && !utmSource && !short(body.utm_medium, 200) && property !== null && property.type !== "website"
          ? EXPLORE_SOURCE
          : categorizeServerSource(referrerDomain, utmSource, short(body.utm_medium, 200), clientApp || null),
    }
    /* The page's own title (supabase/sql/run-now part 253): left out until it is there, so the row is the one it always was. */
    const pageTitle = short(body.pageTitle, 200)
    if (pageTitle && Date.now() >= noTitleUntil) row.page_title = pageTitle
  }

  const insert = async (r: Record<string, unknown>) => (await db.from("analytics_events").insert([r])).error as { code?: string; message?: string } | null
  let error = await insert(row)
  /*
    ONE COLUMN THE DATABASE DOES NOT HAVE IS ONE COLUMN, NOT ALL OF THEM.
    A later field (a newer part not run yet) used to send the row down the
    fallback below, which drops the property and the path too: the view was
    kept with no page, and Analytics listed it as "Page not recorded". The
    column the database names is left out and the row tried again, up to
    three times, before falling back.
  */
  for (let tries = 0; error && missingColumn(error) && tries < 3; tries++) {
    const named = /'([a-z_]+)' column|column "?([a-z_]+)"? (?:of relation|does not exist)/i.exec(error.message ?? "")
    const col = named?.[1] ?? named?.[2]
    if (!col || !(col in row) || (NEW_COLUMNS as readonly string[]).includes(col)) break
    /* A database without the title column (part 253) is not asked again for a while. */
    if (col === "page_title") noTitleUntil = Date.now() + 10 * 60_000
    row = Object.fromEntries(Object.entries(row).filter(([k]) => k !== col))
    error = await insert(row)
  }
  if (error && missingColumn(error)) {
    /*
      Part 61 has not run. A OnePage view or a link click has no column to be
      told apart by, and written without one it would be counted as a
      creator page view: so it waits for the part. Anything else is written
      as it was before the part, then with the core columns only.
    */
    if (property?.type === "onepage" || kind === "link_click" || kind === "nav_click") return { recorded: false, reason: "not_ready" }
    const legacy = Object.fromEntries(Object.entries(row).filter(([k]) => !(NEW_COLUMNS as readonly string[]).includes(k)))
    error = await insert(legacy)
    if (error && missingColumn(error)) {
      const core = ["creator_id", "product_id", "event_type", "visitor_id", "session_id", "referrer_domain", "referrer", "page_url", "utm_source", "utm_medium", "utm_campaign", "device_type", "browser", "os", "country_code", "country_name", "city", "region", "created_at"]
      error = await insert(Object.fromEntries(Object.entries(legacy).filter(([k]) => core.includes(k))))
    }
  }
  if (error && checkRefused(error)) return { recorded: false, reason: "not_ready" }
  if (error) {
    console.error("[analytics] insert failed:", error.code ?? "", error.message ?? "")
    return { recorded: false, reason: "error" }
  }

  /* The running counters a view and a Buy press have always moved. */
  if (kind === "view" && db.rpc) {
    if (productId) await ignoreError(db.rpc("increment_product_views", { p_product_id: productId, p_creator_id: creatorId, p_viewer_id: visitorId }))
    else if (property?.type !== "onepage") await ignoreError(db.rpc("increment_creator_views", { p_creator_id: creatorId, p_viewer_id: visitorId }))
  }
  if (kind === "buy_click" && productId && db.rpc) {
    await ignoreError(db.rpc("increment_daily_rollup", { p_creator_id: creatorId, p_product_id: productId, p_date: created_at.slice(0, 10), p_field: "buy_clicks" }))
  }

  return { recorded: true, reason: "recorded", row, visitorCookie: kind === "view" ? visitorCookieFor(consented, visitorId, req) : null }
}

/**
 * With consent, the server's own visitor cookie; without it, none, and one
 * left from before is deleted. The daily hash never leaves the server.
 */
function visitorCookieFor(consented: boolean, visitorId: string | null, req: CollectRequest): CollectOutcome["visitorCookie"] {
  if (!consented) return req.cookie("visitor_id") ? { clear: true } : null
  return visitorId ? { set: visitorId } : null
}
