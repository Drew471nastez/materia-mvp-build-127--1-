import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"
import { ignoreError } from "@/lib/supabase/ignore-error"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface TrackEventPayload {
  eventType: "buy_click" | "checkout_start" | "checkout_complete" | "download"
  creatorId: string
  productId?: string
  sessionId?: string
  visitorId?: string
  metadata?: Record<string, any>
}

export async function POST(req: NextRequest) {
  try {
    const payload: TrackEventPayload = await req.json()

    if (!payload.eventType || !payload.creatorId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 })
    }

    const supabase = createAdminClient()

    // Get country from request headers
    const countryCode = req.headers.get("x-vercel-ip-country") || req.geo?.country || null

    const sessionId = typeof payload.sessionId === "string" && payload.sessionId.length <= 80 ? payload.sessionId : null
    const visitorId = typeof payload.visitorId === "string" && payload.visitorId.length <= 80 ? payload.visitorId : null

    /*
      ONE STEP PER VISIT. The checkout page reported "reached checkout" every
      time it mounted, so a refresh, a back and forward, or a second tab made
      one visit look like three, and the funnel said more people reached the
      checkout than looked at the product. The same step for the same product
      in the same visit, within 30 minutes, is the same step.
    */
    if (sessionId) {
      let repeat = supabase
        .from("analytics_events")
        .select("id")
        .eq("creator_id", payload.creatorId)
        .eq("event_type", payload.eventType)
        .eq("session_id", sessionId)
        .gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString())
        .limit(1)
      repeat = payload.productId ? repeat.eq("product_id", payload.productId) : repeat.is("product_id", null)
      const { data: seen } = await repeat
      if (seen && seen.length > 0) return NextResponse.json({ ok: true, duplicate: true })
    }

    const eventData = {
      creator_id: payload.creatorId,
      product_id: payload.productId || null,
      event_type: payload.eventType,
      session_id: sessionId,
      visitor_id: visitorId,
      country_code: countryCode,
      created_at: new Date().toISOString(),
    }

    const { error } = await supabase.from("analytics_events").insert([eventData])

    if (error) {
      console.error("[v0] track-event: INSERT ERROR", error.message)
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    }

    // Update daily rollup for buy_clicks
    if (payload.eventType === "buy_click" && payload.productId) {
      const today = new Date().toISOString().split("T")[0]

      await ignoreError(
        supabase.rpc("increment_daily_rollup", {
          p_creator_id: payload.creatorId,
          p_product_id: payload.productId,
          p_date: today,
          p_field: "buy_clicks",
        }),
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error("[v0] track-event: EXCEPTION", error.message)
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 })
  }
}
