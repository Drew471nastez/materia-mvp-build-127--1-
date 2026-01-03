// app/api/track-view/route.ts
import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

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

/**
 * ✅ Server-side client app detection using User-Agent.
 * This is crucial when referrer is empty and clientApp isn't sent / is unreliable.
 *
 * Notes:
 * - Instagram/TikTok/FB/Threads/Snapchat/Telegram are usually detectable here.
 * - WhatsApp is inconsistent across devices; UTMs are the only guaranteed solution.
 */
function detectClientAppFromUA(uaRaw: string | null): string | null {
  if (!uaRaw) return null
  const ua = uaRaw.toLowerCase()

  if (ua.includes("instagram")) return "instagram"
  if (ua.includes("tiktok")) return "tiktok"
  if (ua.includes("fbav") || ua.includes("fban") || ua.includes("facebook")) return "facebook"
  if (ua.includes("threads")) return "threads"
  if (ua.includes("snapchat")) return "snapchat"
  if (ua.includes("telegram")) return "telegram"
  if (ua.includes("whatsapp")) return "whatsapp"

  return null
}

/* -------------------------------------------
   GEO
------------------------------------------- */
function getCountryFromRequest(req: NextRequest): { code: string | null; name: string | null } {
  const countryCode = req.headers.get("x-vercel-ip-country") || req.geo?.country || null

  const countryNames: Record<string, string> = {
    US: "United States",
    GB: "United Kingdom",
    CA: "Canada",
    AU: "Australia",
    DE: "Germany",
    FR: "France",
    ES: "Spain",
    IT: "Italy",
    NL: "Netherlands",
    BR: "Brazil",
    MX: "Mexico",
    IN: "India",
    RO: "Romania",
  }

  return {
    code: countryCode,
    name: countryCode ? countryNames[countryCode] || countryCode : null,
  }
}

/* -------------------------------------------
   SERVER-SIDE SOURCE DETECTION (AUTHORITATIVE)
------------------------------------------- */
function categorizeServerSource(
  referrerDomain?: string | null,
  utmSource?: string | null,
  utmMedium?: string | null,
  clientApp?: string | null,
): string {
  const ref = normalizeLower(referrerDomain)
  const source = normalizeLower(utmSource)
  const medium = normalizeLower(utmMedium)
  const app = normalizeLower(clientApp)

  // 1) UTMs always win
  if (source || medium) {
    if (medium.includes("cpc") || medium.includes("ppc") || medium.includes("paid") || medium.includes("ads")) {
      if (source.includes("google")) return "paid_search"
      return "paid"
    }

    if (medium.includes("email") || source.includes("email") || medium.includes("newsletter")) return "email"
    if (medium.includes("affiliate") || source.includes("affiliate")) return "affiliate"

    // Explicit messaging UTMs
    if (source.includes("whatsapp")) return "social_whatsapp"
    if (source.includes("telegram")) return "social_telegram"

    // Social UTMs
    if (medium.includes("social") || source) {
      if (source.includes("instagram") || source.includes("ig")) return "social_instagram"
      if (source.includes("tiktok")) return "social_tiktok"
      if (source.includes("facebook") || source.includes("fb")) return "social_facebook"
      if (source === "x" || source.includes("twitter") || source.includes("x.com")) return "social_x"
      if (source.includes("youtube") || source.includes("yt")) return "social_youtube"
      if (source.includes("pinterest")) return "social_pinterest"
      if (source.includes("linkedin")) return "social_linkedin"
      if (source.includes("snapchat")) return "social_snapchat"
      if (source.includes("reddit")) return "social_reddit"
      if (source.includes("threads")) return "social_threads"
      return "social"
    }

    return "referral"
  }

  // 2) In-app browsers when referrer is blank
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

  // 3) Email referrers
  if (
    ["mail.google.com", "gmail.com", "outlook.live.com", "outlook.office.com", "mail.yahoo.com"].some((d) => ref.includes(d))
  ) {
    return "email"
  }

  // 4) Social referrers + redirectors
  if (ref.includes("wa.me") || ref.includes("whatsapp")) return "social_whatsapp"
  if (ref.includes("t.me") || ref.includes("telegram")) return "social_telegram"
  if (ref.includes("instagram")) return "social_instagram"
  if (ref.includes("tiktok")) return "social_tiktok"
  if (ref.includes("facebook")) return "social_facebook"
  if (ref.includes("twitter") || ref.includes("x.com") || ref.includes("t.co")) return "social_x"
  if (ref.includes("youtube")) return "social_youtube"
  if (ref.includes("pinterest")) return "social_pinterest"
  if (ref.includes("linkedin")) return "social_linkedin"
  if (ref.includes("snapchat")) return "social_snapchat"
  if (ref.includes("reddit")) return "social_reddit"
  if (ref.includes("threads")) return "social_threads"

  // 5) Search engines
  if (["google.", "bing.", "yahoo.", "duckduckgo.", "baidu.", "yandex."].some((d) => ref.includes(d))) {
    return "organic_search"
  }

  return "referral"
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

    const supabase = await createClient()
    const cookieStore = await cookies()

    // ---- visitor identity (ONE source of truth)
    let visitorId = cookieStore.get("visitor_id")?.value || payload.visitorId
    if (!visitorId) visitorId = `v_${crypto.randomUUID().replace(/-/g, "")}`

    const sessionId = payload.sessionId || `s_${crypto.randomUUID().replace(/-/g, "")}`

    // ---- geo
    const country = getCountryFromRequest(req)
    const city = req.headers.get("x-vercel-ip-city") || req.geo?.city || null
    const region = req.headers.get("x-vercel-ip-country-region") || req.geo?.region || null

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
    const event = {
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

    const { error: insertError } = await supabase.from("analytics_events").insert([event])
    if (insertError) {
      console.error("[track-view] insert failed", insertError)
      return NextResponse.json({ ok: false, error: insertError.message }, { status: 500 })
    }

    // ---- COUNTERS (keep your RPCs)
    if (payload.type === "product" && payload.productId) {
      await supabase
        .rpc("increment_product_views", {
          p_product_id: payload.productId,
          p_creator_id: payload.creatorId,
          p_viewer_id: visitorId,
        })
        .catch(() => {})
    } else {
      await supabase
        .rpc("increment_creator_views", {
          p_creator_id: payload.creatorId,
          p_viewer_id: visitorId,
        })
        .catch(() => {})
    }

    const res = NextResponse.json({
      ok: true,
      visitorId,
      // helpful for debugging in devtools / logs
      sourceCategory,
      clientApp: clientApp || null,
      referrerDomain,
    })

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
