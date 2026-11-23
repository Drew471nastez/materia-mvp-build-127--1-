import { NextRequest, NextResponse } from "next/server"

import { isAdminAuthenticated } from "@/lib/admin-blog-auth"
import { Reader, pageParam } from "@/lib/admin/platform-metrics"
import { overview } from "@/lib/admin/views/overview"
import { creatorDetail, creators } from "@/lib/admin/views/creators"
import { orders, payouts, products } from "@/lib/admin/views/commerce"
import { audience, audit, email, people, websites } from "@/lib/admin/views/platform"
import { system } from "@/lib/admin/views/system"
import { ops } from "@/lib/admin/views/ops"
import { activity } from "@/lib/admin/views/activity"

/** `node:crypto` behind the cookie check, and never a cached answer. */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  ONE DOOR FOR EVERYTHING /admin READS, WITH THE LOCK ON IT
 * ===========================================================================
 * Every view of the admin reads through this route, and the first thing it
 * does is check the admin cookie, before it even decides whether the view
 * exists. A new view cannot be added with the check left off, because there
 * is nowhere to add it except behind the check. The page gates itself on the
 * server too, but anything reachable here is reachable with curl, so the
 * check is here.
 *
 * Read-only, all of it: no POST, PATCH or DELETE in this file. The changes an
 * admin can make (a ban, an unpublished product, a refund) are separate
 * routes with their own confirmation and their own audit record.
 *
 * Each view is built by lib/admin/views/*. A query that fails leaves one
 * figure null and adds a plain sentence to `problems`; the rest of the view
 * still answers. The database's own message never leaves the server.
 */

const VIEWS = [
  "overview",
  "creators",
  "creator",
  "products",
  "orders",
  "payouts",
  "websites",
  "email",
  "audience",
  "people",
  "audit",
  "system",
  "ops",
  "live",
  /* Creator activity (round 59, part 430): ?part=online|summary|feed|creator. */
  "activity",
] as const
type View = (typeof VIEWS)[number]

export async function GET(req: NextRequest, ctx: { params: Promise<{ section: string }> }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } })
  }

  const { section } = await ctx.params
  if (!VIEWS.includes(section as View)) {
    return NextResponse.json({ error: "Unknown view" }, { status: 404 })
  }

  const params = new URL(req.url).searchParams
  const r = new Reader()

  try {
    const body = await build(section as View, r, params)
    return NextResponse.json({ ...body, problems: r.problems, notices: r.notices }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    /* A view that threw rather than failing one query: said plainly, logged in full. */
    console.error(`[admin] ${section} failed:`, error instanceof Error ? error.message : "unknown error")
    return NextResponse.json(
      { error: "This view could not be built. The server log has the details.", problems: r.problems, notices: r.notices },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}

async function build(view: View, r: Reader, params: URLSearchParams): Promise<Record<string, unknown>> {
  const page = pageParam(params.get("page"))
  switch (view) {
    case "overview":
      return overview(r)
    case "creators":
      return creators(r, params, page)
    case "creator":
      return creatorDetail(r, params.get("id") ?? "")
    case "products":
      return products(r, params, page)
    case "orders":
      return orders(r, params, page)
    case "payouts":
      return payouts(r, params, page)
    case "websites":
      return websites(r, params, page)
    case "email":
      return email(r)
    case "audience":
      return audience(r)
    case "people":
      return people(r, params, page)
    case "audit":
      return audit(r, params, page)
    case "system":
      return system(r)
    case "ops":
      return ops(r) as unknown as Promise<Record<string, unknown>>
    case "activity":
      return activity(r, params)
    case "live": {
      /* The one figure the console polls on its own, so it is the cheapest. */
      const a = await liveCount(r)
      return { liveNow: a }
    }
  }
}

async function liveCount(r: Reader): Promise<number | null> {
  const since = new Date(Date.now() - 5 * 60_000).toISOString()
  const rows = await r.rows<{ visitor_id: string | null }>("live now", "analytics_events", "visitor_id", (q) =>
    q.eq("event_type", "view").gte("created_at", since).limit(5000))
  return rows ? new Set(rows.map((v) => v.visitor_id).filter(Boolean)).size : null
}
