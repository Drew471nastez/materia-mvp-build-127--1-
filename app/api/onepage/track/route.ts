import { createAdminClient } from "@/lib/supabase/admin"
import { ownerStoreId } from "@/lib/onepage/page-store"
import { NextRequest, NextResponse } from "next/server"
import { collectFrom } from "@/lib/analytics/collect-route"
import type { CollectOutcome } from "@/lib/analytics/collect"

/**
 * A OnePage LINK, COUNTED ONCE, WHERE ANALYTICS COUNTS IT.
 *
 * The click goes through the one pipeline every page shares
 * (lib/analytics/collect) as a link_click, property onepage, with its rules:
 * not a robot, not a prefetch, not another site's request, not too many from
 * one address, not the owner, one per visit and link. Whose OnePage it is
 * comes from the row, never from the page.
 *
 * NOTHING IS WRITTEN TO onepage_clicks ANY MORE (round rel2-public). That
 * older table is read only for the time before a OnePage's first view
 * event (lib/analytics/report-read readLegacyOnePage, lib/onepage/
 * link-stats-server), and a click that reaches this route now is either
 * after that moment, where nobody reads it, or before the page's first
 * event, where it would be counted a second time beside the link_click event
 * this route records. It cost every click two more requests (a read, then
 * an insert, through the visitor's own client). Its existing rows are still
 * read as they were. A posted "view" is not written either: nothing sends
 * one (the page's tracker records the view event), and onepage_views is
 * read on the same terms. The only database client here is the server's own.
 *
 * An icon in a row of social icons sends `<row id>__<platform>` as its
 * block (lib/onepage/link-keys), so each icon is its own click.
 */
async function recordLinkClick(request: NextRequest, body: Record<string, unknown>): Promise<CollectOutcome | null> {
  try {
    const admin = createAdminClient()
    /* A published page's click only, counted for its OWNER's store: never the row's own seller_id, which the owner can write (lib/onepage/page-store). */
    const { data: page } = await admin.from("onepages").select("id, owner_id").eq("id", body.onepage_id).eq("status", "published").maybeSingle()
    const row = page as { id: string; owner_id?: string | null } | null
    if (!row) return null
    const creatorId = await ownerStoreId(admin, row.owner_id)
    if (!creatorId) return null
    return await collectFrom(
      request,
      "link_click",
      { creatorId, href: body.href, linkUrl: body.url, linkId: body.block_id, sessionId: body.session_id, visitorId: body.visitor_id },
      admin,
    )
  } catch {
    /* Not counted: the visitor's link opens all the same. */
    return null
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(request: NextRequest) {
  try {
    /* A beacon whose body is not JSON (cut off, or not ours) is a bad request, not a server error in the logs. */
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    const { onepage_id, block_id, event_type } = body

    if (!onepage_id || !event_type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    /* A page's id is a uuid and a block's id a short one: anything else is not from a OnePage. */
    if (typeof onepage_id !== "string" || !UUID.test(onepage_id) || (block_id !== undefined && block_id !== null && (typeof block_id !== "string" || block_id.length > 120))) {
      return NextResponse.json({ error: "Invalid fields" }, { status: 400 })
    }

    if (event_type === "click") {
      if (!block_id) {
        return NextResponse.json({ error: "Missing block_id for click event" }, { status: 400 })
      }
      await recordLinkClick(request, body)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Track error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
