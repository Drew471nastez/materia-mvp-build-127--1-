import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import crypto from "crypto"

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

    // Generate visitor ID from IP hash + user agent (for deduplication)
    const visitorId = crypto
      .createHash("sha256")
      .update(ipHash + userAgent)
      .digest("hex")
      .slice(0, 32)

    if (event_type === "view") {
      // Check for duplicate view (same visitor within last hour)
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data: existingView } = await supabase
        .from("onepage_views")
        .select("id")
        .eq("onepage_id", onepage_id)
        .eq("visitor_id", visitorId)
        .gte("created_at", oneHourAgo)
        .maybeSingle()

      if (!existingView) {
        await supabase.from("onepage_views").insert({
          onepage_id,
          visitor_id: visitorId,
          referrer,
          user_agent: userAgent.slice(0, 500),
          ip_hash: ipHash,
        })
      }
    } else if (event_type === "click") {
      if (!block_id) {
        return NextResponse.json({ error: "Missing block_id for click event" }, { status: 400 })
      }

      // Check for duplicate click (same visitor, same block within last minute)
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000).toISOString()
      const { data: existingClick } = await supabase
        .from("onepage_clicks")
        .select("id")
        .eq("onepage_id", onepage_id)
        .eq("block_id", block_id)
        .eq("visitor_id", visitorId)
        .gte("created_at", oneMinuteAgo)
        .maybeSingle()

      if (!existingClick) {
        await supabase.from("onepage_clicks").insert({
          onepage_id,
          block_id,
          url: url?.slice(0, 2000),
          visitor_id: visitorId,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Track error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
