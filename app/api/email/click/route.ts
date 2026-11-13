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
 * response (after()), so the reader is never kept waiting on the database;
 * for a signed link or our own page, its recipient row is read there too.
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
type Db = ReturnType<typeof createAdminClient>

const RECIPIENT_COLUMNS = "id, campaign_id, creator_id, email, clicked_at, click_count"

async function recipientOf(db: Db, token: string): Promise<Recipient | null> {
  const { data } = await db.from("campaign_recipients").select(RECIPIENT_COLUMNS).eq("tracking_token", token).maybeSingle()
  return (data as Recipient | null) ?? null
}

async function recordClick(db: Db, r: Recipient, target: string, userAgent: string | null): Promise<void> {
  try {
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
}

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams
  const home = new URL("/", request.url)
  const target = decodeTarget(q.get("u") ?? q.get("url"))
  if (!target) return NextResponse.redirect(home)
  const token = q.get("t")
  const validToken = !!token && TOKEN.test(token)
  const userAgent = request.headers.get("user-agent")?.slice(0, 300) || null

  let allowed = OWN_HOST.test(new URL(target).hostname) || (validToken && verifyLink(token!, target, q.get("s")))

  /*
    A LINK VOUCHED FOR WITHOUT THE DATABASE GOES AT ONCE (round AW). Every
    link a campaign sends is signed, yet the reader waited for the
    recipient's row before the redirect, only so the click could be counted
    afterwards: in a database brownout (single row reads of 3 to 20 seconds
    in the logs) every click of a campaign sent to thousands sat on that
    read, up to the read's 20 second deadline, each one a function held
    open. The row is now read with the click, after the response. Only an
    older unsigned link, which the campaign's saved body has to vouch for,
    still reads before it goes.
  */
  if (allowed) {
    if (validToken) {
      const t = token!
      after(async () => {
        try {
          const db = createAdminClient()
          const r = await recipientOf(db, t)
          if (r) await recordClick(db, r, target, userAgent)
        } catch (err) {
          console.error("[track/click] not recorded:", err instanceof Error ? err.message : "unknown error")
        }
      })
    }
    return NextResponse.redirect(target)
  }

  let recipient: Recipient | null = null
  if (validToken) {
    try {
      const db = createAdminClient()
      recipient = await recipientOf(db, token!)
      if (recipient) {
        const { data: campaign } = await db.from("email_campaigns").select("body").eq("id", recipient.campaign_id).maybeSingle()
        allowed = typeof campaign?.body === "string" && appearsIn(campaign.body, target)
      }
    } catch {
      /* Could not read the row: an unsigned link it cannot vouch for goes home. */
    }
  }
  if (!allowed) return NextResponse.redirect(home)

  if (recipient) {
    const r = recipient
    after(() => recordClick(createAdminClient(), r, target, userAgent))
  }
  return NextResponse.redirect(target)
}
