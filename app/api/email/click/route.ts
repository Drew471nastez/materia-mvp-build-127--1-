/**
 * ===========================================================================
 *  A LINK IN A CAMPAIGN: COUNT THE CLICK, THEN GO WHERE THE LINK WENT
 * ===========================================================================
 * GET ?url=<base64 of the link>&t=<recipient's tracking token>
 *
 * This used to redirect to whatever the url parameter said. A redirector on
 * storelib.com that goes anywhere is a phishing tool: "storelib.com/api/..."
 * in a link looks safe and lands on any page an attacker likes. Now the
 * target must be a link that is actually in the email that token belongs to
 * (appearsIn), or on storelib.com itself. Anything else goes to the home
 * page.
 *
 * The click is recorded after the response (after()), so the reader is never
 * kept waiting on the database.
 */
import { type NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { appearsIn } from "@/lib/email-campaigns/links"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/* storelib.com itself, not its subdomains: those are sites creators publish. */
const OWN_HOST = /^(www\.)?storelib\.com$/i

function decodeTarget(raw: string | null): string | null {
  if (!raw) return null
  try {
    const url = Buffer.from(raw, "base64").toString("utf-8")
    const u = new URL(url)
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null
  } catch {
    return null
  }
}

export async function GET(request: NextRequest) {
  const home = new URL("/", request.url)
  const target = decodeTarget(request.nextUrl.searchParams.get("url"))
  if (!target) return NextResponse.redirect(home)
  const token = request.nextUrl.searchParams.get("t")

  let allowed = OWN_HOST.test(new URL(target).hostname)
  let recipient: { id: string; campaign_id: string; creator_id: string; email: string; clicked_at: string | null; click_count: number | null } | null = null
  if (token && TOKEN.test(token)) {
    try {
      const db = createAdminClient()
      const { data } = await db.from("campaign_recipients").select("id, campaign_id, creator_id, email, clicked_at, click_count").eq("tracking_token", token).maybeSingle()
      recipient = data
      if (recipient && !allowed) {
        const { data: campaign } = await db.from("email_campaigns").select("body").eq("id", recipient.campaign_id).maybeSingle()
        allowed = typeof campaign?.body === "string" && appearsIn(campaign.body, target)
      }
    } catch {
      /* Could not check: only our own pages are safe to send them to. */
    }
  }
  if (!allowed) return NextResponse.redirect(home)

  if (recipient) {
    const r = recipient
    const userAgent = request.headers.get("user-agent")?.slice(0, 300) || null
    after(async () => {
      try {
        const db = createAdminClient()
        const now = new Date().toISOString()
        await db
          .from("campaign_recipients")
          .update({ click_count: (r.click_count || 0) + 1, ...(r.clicked_at ? {} : { clicked_at: now }) })
          .eq("id", r.id)
        await db.from("email_events").insert({
          campaign_id: r.campaign_id,
          recipient_id: r.id,
          creator_id: r.creator_id,
          email: r.email,
          event_type: "clicked",
          url: target.slice(0, 2000),
          user_agent: userAgent,
          metadata: { clicked_at: now },
        })
      } catch (err) {
        console.error("[track/click] not recorded:", err instanceof Error ? err.message : "unknown error")
      }
    })
  }
  return NextResponse.redirect(target)
}
