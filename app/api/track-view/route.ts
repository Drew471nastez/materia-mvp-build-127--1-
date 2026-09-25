// app/api/track-view/route.ts
import { createAdminClient } from "@/lib/supabase/admin"
import { isOwnVisit } from "@/lib/analytics/own-visit"
import { anonSession, anonVisitorId, clientIp } from "@/lib/analytics/anon-visit"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { categorizeServerSource, detectClientAppFromUA, isInternalReferrer, referrerHost } from "@/lib/analytics/sources"
import { isBotAgent, parseUserAgent } from "@/lib/analytics/user-agent"
import { getMainDomain } from "@/lib/url-helpers"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type ViewType = "store" | "profile" | "product"

interface TrackViewPayload {
  type: ViewType
  creatorId: string
  productId?: string

  sessionId?: string
  visitorId?: string

  referrerDomain?: string
  referrer?: string
  pageUrl?: string

  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_term?: string
  utm_content?: string

  deviceType?: string
  browser?: string
  os?: string
  screenWidth?: number
  screenHeight?: number
  language?: string

  clientApp?: string
  sourceCategory?: string
  pageKey?: string
}

/* -------------------------------------------
   HELPERS
------------------------------------------- */
function normalizeStr(v?: string | null): string {
  return (v || "").trim()
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A short string or nothing: a payload is not a place to store a novel. */
function short(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null
}

/**
 * THE REFERRER, AS A SOURCE. Storelib itself, the creator's own site on a
 * Storelib subdomain and the payment page a buyer comes back from are where
 * the visitor was a moment ago, not where the visit came from: they are
 * Direct, and the browser keeps the visit's first source (lib/analytics-utils).
 */
function normalizeReferrerDomain(v: string | null | undefined, pageUrl: string | null): string {
  const s = normalizeStr(v)
  if (!s || s.toLowerCase() === "direct") return "Direct"
  const host = referrerHost(s) || s.toLowerCase()
  let pageHost: string | null = null
  try {
    pageHost = pageUrl ? new URL(pageUrl).hostname : null
  } catch {
    pageHost = null
  }
  return isInternalReferrer(host, getMainDomain(), pageHost) ? "Direct" : host
}

/* -------------------------------------------
   GEO
------------------------------------------- */
function getCountryFromRequest(req: NextRequest): { code: string | null; name: string | null } {
  const countryCode = req.headers.get("x-vercel-ip-country") || req.geo?.country || null

  /* Every country by its English name, not the thirteen that were typed out:
     a visitor from Moldova was stored as "MD". */
  let name: string | null = null
  if (countryCode) {
    try {
      name = new Intl.DisplayNames(["en"], { type: "region" }).of(countryCode.toUpperCase()) || countryCode
    } catch {
      name = countryCode
    }
  }

  return {
    code: countryCode,
    name,
  }
}

/* -------------------------------------------
   POST
------------------------------------------- */
export async function POST(req: NextRequest) {
  try {
    const payload: TrackViewPayload = await req.json()

    if (!payload?.type || !payload?.creatorId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 })
    }

    if (payload.type === "product" && !payload.productId) {
      return NextResponse.json({ ok: false, error: "Product view requires productId" }, { status: 400 })
    }

    /* Ids are uuids; anything else is not a page on Storelib. */
    if (!UUID.test(payload.creatorId) || (payload.productId && !UUID.test(payload.productId))) {
      return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 400 })
    }

    /**
     * ---- NOT A PERSON: nothing is recorded. Answered ok, so a crawler has
     * nothing to retry and nothing to learn.
     */
    const ua = req.headers.get("user-agent")
    if (isBotAgent(ua)) {
      return NextResponse.json({ ok: true, counted: false })
    }

    const supabase = createAdminClient()
    const cookieStore = await cookies()

    /* The page must be a real creator's, and a product must be theirs. */
    const { data: owner } = await supabase.from("creators").select("id, user_id").eq("id", payload.creatorId).maybeSingle()
    if (!owner) {
      return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 404 })
    }
    if (payload.type === "product" && payload.productId) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("id", payload.productId)
        .eq("creator_id", payload.creatorId)
        .maybeSingle()
      if (!product) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 404 })
    }

    /* The creator on their own page is not a visitor (lib/analytics/own-visit). */
    if (await isOwnVisit(req.cookies.getAll().map((c) => c.name), (owner as { user_id?: string | null }).user_id)) {
      return NextResponse.json({ ok: true, counted: false, own: true })
    }

    /**
     * ---- consent, read from the visitor's own record, not from the page.
     * Without analytics consent no cookie is read or set (one left from
     * before is deleted), and no city or region is kept, only the country.
     *
     * The visit is still one visit, not one per page (lib/analytics/
     * anon-visit): the visitor is a hash of the IP address, the browser and
     * the creator under a key that changes every day, never stored raw and
     * never on the device, and a session is pages under 30 minutes apart, as
     * with consent. It used to be a fresh visitor and session per page, so
     * every page a declining visitor opened was a new session, and sessions
     * read high and conversion low. Without an IP address there is nothing
     * to hash and the id is a throwaway, as before.
     */
    const consented = allows(parse(cookieStore.get(CONSENT_COOKIE)?.value, Date.now()), "analytics")
    const anonVisitor = consented ? null : anonVisitorId({ ip: clientIp(req.headers), userAgent: ua, creatorId: payload.creatorId, now: Date.now() })

    // ---- visitor identity (ONE source of truth)
    let visitorId = consented ? cookieStore.get("visitor_id")?.value || short(payload.visitorId, 80) || undefined : anonVisitor ?? undefined
    if (!visitorId) visitorId = `${consented ? "v" : "anon"}_${crypto.randomUUID().replace(/-/g, "")}`

    const sessionId =
      (consented && short(payload.sessionId, 80)) ||
      (anonVisitor ? await anonSession(supabase, anonVisitor, payload.creatorId, Date.now()) : null) ||
      `s_${crypto.randomUUID().replace(/-/g, "")}`

    // ---- geo
    const country = getCountryFromRequest(req)
    const city = consented ? req.headers.get("x-vercel-ip-city") || req.geo?.city || null : null
    const region = consented ? req.headers.get("x-vercel-ip-country-region") || req.geo?.region || null : null

    /**
     * ---- device, browser, system: from the request's own signature, by the
     * rules the reports use. What the page sent is kept only where the
     * signature cannot know, which is an iPad: it sends a Mac's signature,
     * and only the page can see it has a touch screen.
     */
    const parsed = parseUserAgent(ua)
    const iPad = parsed.os === "macOS" && payload.deviceType === "tablet" && payload.os === "iOS"
    const deviceType = iPad ? "tablet" : parsed.device ?? short(payload.deviceType, 20)
    const os = iPad ? "iOS" : parsed.os ?? short(payload.os, 40)
    const browser = parsed.browser ?? short(payload.browser, 40)

    // ✅ UA-based app detection fallback (fixes IG/TikTok/FB/etc when referrer is blank)
    const uaApp = detectClientAppFromUA(ua)

    // prefer payload.clientApp, else UA, else null
    const clientApp = short(payload.clientApp, 30) || uaApp

    // ---- source (SERVER decides)
    const pageUrl = short(payload.pageUrl, 1000)
    const referrerDomain = normalizeReferrerDomain(payload.referrerDomain, pageUrl)
    const sourceCategory = categorizeServerSource(
      referrerDomain,
      short(payload.utm_source, 200),
      short(payload.utm_medium, 200),
      clientApp || null,
    )

    /**
     * ---- HARD DEDUPE (visitor + creator + same product/store) once per 30 minutes
     *
     * `.limit(1)`, not `.maybeSingle()`. maybeSingle answers an ERROR when two
     * rows match, and the error branch below carried on and inserted: so the
     * moment a visitor had two views in the window (a race between two tabs
     * is enough) every later view was counted too, with no dedupe at all.
     */
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString()

    let dedupeQuery = supabase
      .from("analytics_events")
      .select("id")
      .eq("visitor_id", visitorId)
      .eq("creator_id", payload.creatorId)
      .eq("event_type", "view")
      .gte("created_at", thirtyMinutesAgo)

    if (payload.type === "product" && payload.productId) {
      dedupeQuery = dedupeQuery.eq("product_id", payload.productId)
    } else {
      dedupeQuery = dedupeQuery.is("product_id", null)
    }

    const { data: existing, error: dedupeError } = await dedupeQuery.limit(1)
    if (dedupeError) {
      console.error("[track-view] dedupe error", dedupeError.message)
      // don't block tracking because of dedupe lookup error
    } else if (existing && existing.length > 0) {
      return NextResponse.json({ ok: true, duplicate: true, visitorId: consented ? visitorId : undefined, sourceCategory })
    }

    // ---- INSERT EVENT
    // Full event with all extended columns
    const now = new Date().toISOString()
    const fullEvent = {
      creator_id: payload.creatorId,
      product_id: payload.type === "product" ? payload.productId : null,
      event_type: "view",

      visitor_id: visitorId,
      session_id: sessionId,

      referrer_domain: referrerDomain,
      referrer: short(payload.referrer, 1000),
      page_url: pageUrl,

      utm_source: short(payload.utm_source, 200),
      utm_medium: short(payload.utm_medium, 200),
      utm_campaign: short(payload.utm_campaign, 200),
      utm_term: short(payload.utm_term, 200),
      utm_content: short(payload.utm_content, 200),

      device_type: deviceType,
      browser,
      os,
      screen_width: typeof payload.screenWidth === "number" ? payload.screenWidth : null,
      screen_height: typeof payload.screenHeight === "number" ? payload.screenHeight : null,
      language: short(payload.language, 20),

      country_code: country.code,
      country_name: country.name,
      city,
      region,

      source_category: sourceCategory,
      created_at: now,
    }

    // Try full insert first, fall back to core columns if extended columns don't exist yet
    let insertError: { message: string } | null = null
    const { error: fullInsertError } = await supabase.from("analytics_events").insert([fullEvent])

    if (fullInsertError) {
      // If it's a column-not-found error, retry with only core columns
      const errMsg = fullInsertError.message || ""
      if (errMsg.includes("column") || errMsg.includes("undefined") || errMsg.includes("400") || errMsg.includes("Could not find")) {
        console.warn("[track-view] Full insert failed (missing columns?), retrying with core fields:", errMsg)
        const coreEvent = {
          creator_id: fullEvent.creator_id,
          product_id: fullEvent.product_id,
          event_type: "view",
          visitor_id: visitorId,
          session_id: sessionId,
          referrer_domain: referrerDomain,
          referrer: fullEvent.referrer,
          page_url: pageUrl,
          utm_source: fullEvent.utm_source,
          utm_medium: fullEvent.utm_medium,
          utm_campaign: fullEvent.utm_campaign,
          device_type: deviceType,
          browser,
          os,
          country_code: country.code,
          country_name: country.name,
          city,
          region,
          created_at: now,
        }
        const { error: coreInsertError } = await supabase.from("analytics_events").insert([coreEvent])
        insertError = coreInsertError
      } else {
        insertError = fullInsertError
      }
    }

    if (insertError) {
      console.error("[track-view] insert failed", insertError.message)
      return NextResponse.json({ ok: false, error: "Could not record the view" }, { status: 500 })
    }

    /**
     * ---- COUNTERS (keep your RPCs)
     *
     * These were `.rpc(...).catch(() => {})`, which is a TypeError rather than
     * a guard: a PostgREST builder implements `then()` and has no `catch`. So
     * EVERY view — every creator page, every product page — threw here and the
     * endpoint answered 500, and the counters never incremented.
     */
    if (payload.type === "product" && payload.productId) {
      await ignoreError(
        supabase.rpc("increment_product_views", {
          p_product_id: payload.productId,
          p_creator_id: payload.creatorId,
          p_viewer_id: visitorId,
        }),
      )
    } else {
      await ignoreError(
        supabase.rpc("increment_creator_views", {
          p_creator_id: payload.creatorId,
          p_viewer_id: visitorId,
        }),
      )
    }

    const res = NextResponse.json({
      ok: true,
      /* The hash of a visitor who declined stays on the server. */
      visitorId: consented ? visitorId : undefined,
      // helpful for debugging in devtools / logs
      sourceCategory,
      clientApp: clientApp || null,
      referrerDomain,
    })

    if (!consented) {
      if (cookieStore.get("visitor_id")) res.cookies.set("visitor_id", "", { maxAge: 0, path: "/" })
      return res
    }
    res.cookies.set("visitor_id", visitorId, {
      maxAge: 60 * 60 * 24 * 365,
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
    })

    return res
  } catch (err: any) {
    console.error("[track-view] fatal", err?.message || err)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
