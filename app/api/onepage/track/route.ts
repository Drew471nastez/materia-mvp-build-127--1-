import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import crypto from "crypto"
import { collectFrom } from "@/lib/analytics/collect-route"
import type { CollectOutcome } from "@/lib/analytics/collect"
import { clickCountable, legacyClickAllowed } from "@/lib/onepage/visit-gate"

/**
 * A OnePage LINK, IN BOTH PLACES IT IS COUNTED.
 *
 * The click goes first through the one pipeline every page shares
 * (lib/analytics/collect) as a link_click, property onepage, with its rules:
 * not a robot, not a prefetch, not another site's request, not too many from
 * one address, not the owner, one per visit and link. Whose OnePage it is
 * comes from the row, never from the page.
 *
 * onepage_clicks, the older record (one per visitor, block and UTC day), is
 * written only when that answer says a person pressed it
 * (lib/onepage/visit-gate legacyClickAllowed), so it no longer counts what
 * Analytics refuses. A page with no creator behind it is checked the same
 * way here (clickCountable).
 *
 * An icon in a row of social icons sends `<row id>__<platform>` as its
 * block (lib/onepage/link-keys), so each icon is its own click.
 */
async function recordLinkClick(request: NextRequest, body: Record<string, unknown>): Promise<CollectOutcome | null> {
  try {
    const admin = createAdminClient()
    const { data: page } = await admin.from("onepages").select("id, seller_id, creator_id, owner_id").eq("id", body.onepage_id).maybeSingle()
    const row = page as { id: string; seller_id?: string | null; creator_id?: string | null; owner_id?: string | null } | null
    if (!row) return null
    let creatorId = row.seller_id || row.creator_id || null
    if (!creatorId && row.owner_id) {
      const { data: creator } = await admin.from("creators").select("id").eq("user_id", row.owner_id).maybeSingle()
      creatorId = (creator as { id?: string } | null)?.id ?? null
    }
    if (!creatorId) return null
    return await collectFrom(
      request,
      "link_click",
      { creatorId, href: body.href, linkUrl: body.url, linkId: body.block_id, sessionId: body.session_id, visitorId: body.visitor_id },
      admin,
    )
  } catch {
    /* The OnePage's own count below decides for itself (clickCountable). */
    return null
  }
}

// Hash IP address for privacy
function hashIP(ip: string): string {
  return crypto.createHash("sha256").update(ip + process.env.SUPABASE_URL).digest("hex").slice(0, 16)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { onepage_id, block_id, event_type, url } = body

    if (!onepage_id || !event_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    /* A page's id is a uuid and a block's id a short one: anything else is not from a OnePage. */
    if (typeof onepage_id !== "string" || !UUID.test(onepage_id) || (block_id !== undefined && block_id !== null && (typeof block_id !== "string" || block_id.length > 120))) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 })
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
      /* The page's render counts its own views (app/(marketing)/l/[slug]); a posted one is held to the same checks. */
      if (!(await clickCountable(request))) return NextResponse.json({ success: true })

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

      /* Analytics first: its answer says whether a person pressed it, and this table counts only those. */
      const outcome = await recordLinkClick(request, body)
      const countable = outcome ? legacyClickAllowed(outcome) : await clickCountable(request)
      if (!countable) return NextResponse.json({ success: true })

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
          url: typeof url === "string" ? url.slice(0, 2000) : null,
          visitor_id: visitorId,
          country_code: countryCode,
          country_name: countryName,
          user_agent: userAgent.slice(0, 500),
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Track error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
