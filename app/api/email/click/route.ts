/**
 * ===========================================================================
 *  A LINK IN A CAMPAIGN: COUNT THE CLICK, THEN GO WHERE THE LINK WENT
 * ===========================================================================
 * GET ?u=<base64url of the link>&t=<recipient's tracking token>&s=<signature>
 *
 * A redirector on storelib.com that goes anywhere is a phishing tool, so the
 * redirect only follows a target it can vouch for:
 *
 *   signed     the signature is of (token, target) with a server key
 *              (lib/email-campaigns/link-sign.ts). Every link a campaign
 *              sends carries one, made from the exact address in the email,
 *              so a real link always goes where it said.
 *   older      an email sent before signatures (?url=&t=): the target must
 *              be a link in that campaign's saved body (appearsIn), as it
 *              was checked then.
 *   our own    a page on storelib.com itself.
 *
 * Anything else goes to the home page. The click is recorded after the
 * response (after()), so the reader is never kept waiting on the database.
 */
import { type NextRequest, NextResponse, after } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { appearsIn } from "@/lib/email-campaigns/links"
import { decodeTarget, verifyLink } from "@/lib/email-campaigns/link-sign"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const TOKEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/* storelib.com itself, not its subdomains: those are sites creators publish. */
const OWN_HOST = /^(www\.)?storelib\.com$/i

type Recipient = { id: string; campaign_id: string; creator_id: string; email: string; clicked_at: string | null; click_count: number | null }

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const home = new URL("/", request.url)
  const target = decodeTarget(q.get("u") ?? q.get("url"))
  if (!target) return NextResponse.redirect(home)
  const token = q.get("t")
  const validToken = !!token && TOKEN.test(token)

  let allowed = OWN_HOST.test(new URL(target).hostname) || (validToken && verifyLink(token!, target, q.get("s")))
  let recipient: Recipient | null = null
  if (validToken) {
    try {
      const db = createAdminClient()
      const { data } = await db.from("campaign_recipients").select("id, campaign_id, creator_id, email, clicked_at, click_count").eq("tracking_token", token).maybeSingle()
      recipient = (data as Recipient | null) ?? null
      if (recipient && !allowed) {
        const { data: campaign } = await db.from("email_campaigns").select("body").eq("id", recipient.campaign_id).maybeSingle()
        allowed = typeof campaign?.body === "string" && appearsIn(campaign.body, target)
      }
    } catch {
      /* Could not read the row: a signed link still goes where it said. */
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
