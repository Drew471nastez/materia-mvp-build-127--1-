import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import crypto from "crypto"
import { collectFrom } from "@/lib/analytics/collect-route"

/**
 * A OnePage LINK, IN BOTH PLACES IT IS COUNTED.
 *
 * onepage_clicks is what the OnePage editor's link stats and Analytics'
 * OnePage view read, one per visitor, block and UTC day, exactly as before:
 * nothing here changes it. The same click is also an analytics event
 * (link_click, property onepage) through the one pipeline every page shares
 * (lib/analytics/collect), which has its own rules: not a robot, not the
 * owner, one per visit and link. Whose OnePage it is comes from the row,
 * never from the page.
 */
async function recordLinkClick(request: NextRequest, body: Record<string, unknown>): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data: page } = await admin.from("onepages").select("id, seller_id, creator_id, owner_id").eq("id", body.onepage_id).maybeSingle()
    const row = page as { id: string; seller_id?: string | null; creator_id?: string | null; owner_id?: string | null } | null
    if (!row) return
    let creatorId = row.seller_id || row.creator_id || null
    if (!creatorId && row.owner_id) {
      const { data: creator } = await admin.from("creators").select("id").eq("user_id", row.owner_id).maybeSingle()
      creatorId = (creator as { id?: string } | null)?.id ?? null
    }
    if (!creatorId) return
    await collectFrom(
      request,
      "link_click",
      { creatorId, href: body.href, linkUrl: body.url, linkId: body.block_id, sessionId: body.session_id, visitorId: body.visitor_id },
      admin,
    )
  } catch {
    /* The OnePage's own count above is what this route answers for. */
  }
}

// Hash IP address for privacy
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.SUPABASE_URL).digest("hex").slice(0, 16)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { onepage_id, block_id, event_type, url } = body

    if (!onepage_id || !event_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    const supabase = await createClient()
    const headersList = await headers()

    // Get visitor info
    const forwardedFor = headersList.get("x-forwarded-for")
    const ip = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown"
    const ipHash = hashIP(ip)
    const userAgent = headersList.get("user-agent") || ""
    const referrer = headersList.get("referer") || ""

    // Get country from headers (Vercel provides these)
    const countryCode = headersList.get("x-vercel-ip-country") || null
    const countryNames: Record<string, string> = {
      US: "United States", GB: "United Kingdom", CA: "Canada", AU: "Australia",
      DE: "Germany", FR: "France", ES: "Spain", IT: "Italy", NL: "Netherlands",
      BR: "Brazil", MX: "Mexico", JP: "Japan", KR: "South Korea", IN: "India",
      CN: "China", RU: "Russia", SE: "Sweden", NO: "Norway", DK: "Denmark",
      FI: "Finland", PL: "Poland", PT: "Portugal", BE: "Belgium", AT: "Austria",
      CH: "Switzerland", IE: "Ireland", NZ: "New Zealand", SG: "Singapore",
      HK: "Hong Kong", TW: "Taiwan", TH: "Thailand", MY: "Malaysia", ID: "Indonesia",
      PH: "Philippines", VN: "Vietnam", AE: "United Arab Emirates", SA: "Saudi Arabia",
      ZA: "South Africa", NG: "Nigeria", EG: "Egypt", AR: "Argentina", CL: "Chile",
      CO: "Colombia", PE: "Peru", IL: "Israel", TR: "Turkey", GR: "Greece",
      CZ: "Czech Republic", HU: "Hungary", RO: "Romania", UA: "Ukraine",
    }
    const countryName = countryCode ? (countryNames[countryCode] || countryCode) : null

    // Generate visitor ID from IP hash + user agent (for deduplication)
    const visitorId = crypto
      .createHash("sha256")
      .update(ipHash + userAgent)
      .digest("hex")
      .slice(0, 32)

    if (event_type === "view") {
      // Check for duplicate view (same IP within the same calendar day - UTC)
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const todayStr = today.toISOString()

      const { data: existingView } = await supabase
        .from("onepage_views")
        .select("id")
        .eq("onepage_id", onepage_id)
        .eq("ip_hash", ipHash)
        .gte("created_at", todayStr)
        .maybeSingle()

      if (!existingView) {
        await supabase.from("onepage_views").insert({
          onepage_id,
          visitor_id: visitorId,
          referrer,
          user_agent: userAgent.slice(0, 500),
          ip_hash: ipHash,
          country_code: countryCode,
          country_name: countryName,
        })
      }
    } else if (event_type === "click") {
      if (!block_id) {
        return NextResponse.json({ error: "Missing block_id for click event" }, { status: 400 })
      }

      // Check for duplicate click (same IP+device, same block within the same calendar day - UTC)
      const today = new Date()
      today.setUTCHours(0, 0, 0, 0)
      const todayStr = today.toISOString()

      const { data: existingClick } = await supabase
        .from("onepage_clicks")
        .select("id")
        .eq("onepage_id", onepage_id)
        .eq("block_id", block_id)
        .eq("visitor_id", visitorId)
        .gte("created_at", todayStr)
        .maybeSingle()

      if (!existingClick) {
        await supabase.from("onepage_clicks").insert({
          onepage_id,
          block_id,
          url: url?.slice(0, 2000),
          visitor_id: visitorId,
          country_code: countryCode,
          country_name: countryName,
          user_agent: userAgent.slice(0, 500),
        })
      }

      await recordLinkClick(request, body)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Track error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
