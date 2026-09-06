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

    const eventData = {
      creator_id: payload.creatorId,
      product_id: payload.productId || null,
      event_type: payload.eventType,
      session_id: payload.sessionId || null,
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
