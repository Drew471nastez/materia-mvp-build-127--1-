// app/api/track-view/route.ts
import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { categorizeServerSource, detectClientAppFromUA } from "@/lib/analytics/sources"

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

function normalizeLower(v?: string | null): string {
  return normalizeStr(v).toLowerCase()
}

function normalizeReferrerDomain(v?: string | null): string {
  const s = normalizeStr(v)
  if (!s) return "Direct"
  if (s.toLowerCase() === "direct") return "Direct"
  return s
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

    const supabase = createAdminClient()
    const cookieStore = await cookies()

    /**
     * ---- consent, read from the visitor's own record, not from the page.
     * Without analytics consent the view is counted with a throwaway id:
     * no cookie is read or set (one left from before is deleted), and no
     * city or region is kept, only the country.
     */
    const consented = allows(parse(cookieStore.get(CONSENT_COOKIE)?.value, Date.now()), "analytics")

    // ---- visitor identity (ONE source of truth)
    let visitorId = consented ? cookieStore.get("visitor_id")?.value || payload.visitorId : undefined
    if (!visitorId) visitorId = `${consented ? "v" : "anon"}_${crypto.randomUUID().replace(/-/g, "")}`

    const sessionId = (consented && payload.sessionId) || `s_${crypto.randomUUID().replace(/-/g, "")}`

    // ---- geo
    const country = getCountryFromRequest(req)
    const city = consented ? req.headers.get("x-vercel-ip-city") || req.geo?.city || null : null
    const region = consented ? req.headers.get("x-vercel-ip-country-region") || req.geo?.region || null : null

    // ✅ UA-based app detection fallback (fixes IG/TikTok/FB/etc when referrer is blank)
    const ua = req.headers.get("user-agent")
    const uaApp = detectClientAppFromUA(ua)

    // prefer payload.clientApp, else UA, else null
    const clientApp = payload.clientApp || uaApp

    // ---- source (SERVER decides)
    const referrerDomain = normalizeReferrerDomain(payload.referrerDomain)
    const sourceCategory = categorizeServerSource(
      referrerDomain,
      payload.utm_source || null,
      payload.utm_medium || null,
      clientApp || null,
    )

    // ---- HARD DEDUPE (visitor + creator + same product/store) once per 30 minutes
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

    const { data: existing, error: dedupeError } = await dedupeQuery.maybeSingle()
    if (dedupeError) {
      console.error("[track-view] dedupe error", dedupeError)
      // don't block tracking because of dedupe lookup error
    } else if (existing) {
      return NextResponse.json({ ok: true, duplicate: true, visitorId, sourceCategory })
    }

    // ---- INSERT EVENT
    // Full event with all extended columns
    const fullEvent = {
      creator_id: payload.creatorId,
      product_id: payload.type === "product" ? payload.productId : null,
      event_type: "view",

      visitor_id: visitorId,
      session_id: sessionId,

      referrer_domain: referrerDomain,
      referrer: payload.referrer || null,
      page_url: payload.pageUrl || null,

      utm_source: payload.utm_source || null,
      utm_medium: payload.utm_medium || null,
      utm_campaign: payload.utm_campaign || null,
      utm_term: payload.utm_term || null,
      utm_content: payload.utm_content || null,

      device_type: payload.deviceType || null,
      browser: payload.browser || null,
      os: payload.os || null,
      screen_width: payload.screenWidth || null,
      screen_height: payload.screenHeight || null,
      language: payload.language || null,

      country_code: country.code,
      country_name: country.name,
      city,
      region,

      source_category: sourceCategory,
      created_at: new Date().toISOString(),
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
          creator_id: payload.creatorId,
          product_id: payload.type === "product" ? payload.productId : null,
          event_type: "view",
          visitor_id: visitorId,
          session_id: sessionId,
          referrer_domain: referrerDomain,
          referrer: payload.referrer || null,
          page_url: payload.pageUrl || null,
          utm_source: payload.utm_source || null,
          utm_medium: payload.utm_medium || null,
          utm_campaign: payload.utm_campaign || null,
          device_type: payload.deviceType || null,
          browser: payload.browser || null,
          os: payload.os || null,
          country_code: country.code,
          country_name: country.name,
          city,
          region,
          created_at: new Date().toISOString(),
        }
        const { error: coreInsertError } = await supabase.from("analytics_events").insert([coreEvent])
        insertError = coreInsertError
      } else {
        insertError = fullInsertError
      }
    }

    if (insertError) {
      console.error("[track-view] insert failed", insertError)
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
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
      visitorId,
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
