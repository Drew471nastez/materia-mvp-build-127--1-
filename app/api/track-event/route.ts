import { createAdminClient } from "@/lib/supabase/admin"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { ignoreError } from "@/lib/supabase/ignore-error"
import { CONSENT_COOKIE, allows, parse } from "@/lib/consent/consent"
import { isBotAgent } from "@/lib/analytics/user-agent"
import { isOwnVisit } from "@/lib/analytics/own-visit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const EVENTS = ["buy_click", "checkout_start", "checkout_complete", "download"] as const
type EventType = (typeof EVENTS)[number]

interface TrackEventPayload {
  eventType: EventType
  creatorId: string
  productId?: string
  sessionId?: string
  visitorId?: string
  metadata?: Record<string, any>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    const payload: TrackEventPayload = await req.json()

    if (!payload.eventType || !payload.creatorId) {
      return NextResponse.json({ ok: false, error: "Missing required fields" }, { status: 400 })
    }
    /* Only the steps the funnel knows, for a real page's ids. */
    if (
      !(EVENTS as readonly string[]).includes(payload.eventType) ||
      !UUID.test(payload.creatorId) ||
      (payload.productId && !UUID.test(payload.productId))
    ) {
      return NextResponse.json({ ok: false, error: "Unknown event" }, { status: 400 })
    }
    if (isBotAgent(req.headers.get("user-agent"))) return NextResponse.json({ ok: true, counted: false })

    const supabase = createAdminClient()

    /* The same checks a view gets (app/api/track-view): a real creator, a
       product that is theirs, and not the creator on their own checkout.
       A step posted for any id would otherwise land in the rollups. */
    const { data: owner } = await supabase.from("creators").select("id, user_id").eq("id", payload.creatorId).maybeSingle()
    if (!owner) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 404 })
    if (payload.productId) {
      const { data: product } = await supabase
        .from("products")
        .select("id")
        .eq("id", payload.productId)
        .eq("creator_id", payload.creatorId)
        .maybeSingle()
      if (!product) return NextResponse.json({ ok: false, error: "Unknown page" }, { status: 404 })
    }
    if (await isOwnVisit(req.cookies.getAll().map((c) => c.name), (owner as { user_id?: string | null }).user_id)) {
      return NextResponse.json({ ok: true, counted: false, own: true })
    }

    // Get country from request headers
    const countryCode = req.headers.get("x-vercel-ip-country") || req.geo?.country || null

    /**
     * THE VISITOR'S OWN RECORD DECIDES, not the page. The browser leaves the
     * ids out without analytics consent (lib/analytics-utils); this is the
     * same rule on the server, so ids a page sent anyway are dropped. The
     * step is still counted, with no identifier.
     */
    const consented = allows(parse((await cookies()).get(CONSENT_COOKIE)?.value, Date.now()), "analytics")
    const sessionId = consented && typeof payload.sessionId === "string" && payload.sessionId.length <= 80 ? payload.sessionId : null
    const visitorId = consented && typeof payload.visitorId === "string" && payload.visitorId.length <= 80 ? payload.visitorId : null

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
