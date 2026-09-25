/**
 * THE OPEN PIXEL. Answers with a 1x1 GIF at once and records the open after
 * the response, in after(): a promise left running after a serverless
 * function answers is frozen with it, which is how opens used to go missing.
 *
 * Only a recipient's tracking token counts an open. The old ?cid=&e= form
 * let anybody mark any address as having opened any campaign.
 */
import { type NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")
const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("t")
  if (token && TOKEN.test(token)) {
    const userAgent = request.headers.get("user-agent")?.slice(0, 300) || null
    after(() => recordOpen(token, userAgent))
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    },
  })
}

async function recordOpen(token: string, userAgent: string | null) {
  try {
    const db = createAdminClient()
    const { data: r } = await db
      .from("campaign_recipients")
      .select("id, campaign_id, creator_id, email, opened_at, open_count")
      .eq("tracking_token", token)
      .maybeSingle()
    if (!r) return
    const now = new Date().toISOString()
    if (r.opened_at) {
      await db.from("campaign_recipients").update({ open_count: (r.open_count || 1) + 1 }).eq("id", r.id)
      return
    }
    /* First open only: the conditional update decides, so two pixels loading at once count one. */
    const { data: first } = await db.from("campaign_recipients").update({ opened_at: now, open_count: 1 }).eq("id", r.id).is("opened_at", null).select("id")
    if (!first?.length) return
    await db.from("email_events").insert({
      campaign_id: r.campaign_id,
      recipient_id: r.id,
      creator_id: r.creator_id,
      email: r.email,
      event_type: "opened",
      user_agent: userAgent,
      metadata: { opened_at: now },
    })
  } catch (err) {
    console.error("[track/open] not recorded:", err instanceof Error ? err.message : "unknown error")
  }
}
