import { NextResponse, after, type NextRequest } from "next/server"

import { adminFailure, requireAdmin } from "@/lib/admin/gate"
import { recordAdminAction } from "@/lib/admin/audit"
import { createAdminClient } from "@/lib/supabase/admin"
import { announceAddresses, communityAddresses } from "@/lib/seo/announce-pages"
import { readFlag } from "@/lib/platform/flags"
import {
  ADMIN_ACTIONS,
  ADMIN_FILTERS,
  REASON_MAX,
  applyAdminAction,
  communityTotals,
  escalatedReports,
  listCommunities,
  type AdminCommunityAction,
  type AdminFilter,
} from "@/lib/communities/server/admin"

/**
 * /api/admin/communities
 *
 * GET   ?view=overview (default): the switch, the totals and one page of the
 *       list (?q, ?filter, ?page). ?view=reports: the escalated reports, what
 *       was reported and why, never the reported content (?page, ?all=1 for
 *       resolved ones too).
 * POST  { action: suspend | unsuspend | hide | unhide, communityId, reason }
 *       changes one community, then writes it to the admin audit trail and
 *       to the community's own audit log as the platform.
 *
 * Works whether the communities switch is on or off: this is where it is
 * turned back on, and where a community is dealt with while it is off.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied
  const params = request.nextUrl.searchParams
  const page = Number(params.get("page") ?? "1") || 1
  try {
    const db = createAdminClient()
    if (params.get("view") === "reports") {
      const reports = await escalatedReports(db, { page, open: params.get("all") !== "1" })
      return NextResponse.json({ reports }, { headers: NO_STORE })
    }
    const filterParam = params.get("filter") ?? "all"
    const filter: AdminFilter = (ADMIN_FILTERS as readonly string[]).includes(filterParam) ? (filterParam as AdminFilter) : "all"
    const [enabled, totals, list] = await Promise.all([
      readFlag("communities"),
      communityTotals(db),
      listCommunities(db, { q: params.get("q") ?? "", filter, page }),
    ])
    return NextResponse.json({ enabled, totals, list }, { headers: NO_STORE })
  } catch (error) {
    return adminFailure("communities read", error, "Could not read the communities.")
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireAdmin()
  if (denied) return denied

  let body: { action?: unknown; communityId?: unknown; reason?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Send JSON." }, { status: 400, headers: NO_STORE })
  }
  if (typeof body.action !== "string" || !(ADMIN_ACTIONS as readonly string[]).includes(body.action)) {
    return NextResponse.json({ error: `action must be one of: ${ADMIN_ACTIONS.join(", ")}.` }, { status: 400, headers: NO_STORE })
  }
  if (typeof body.communityId !== "string") {
    return NextResponse.json({ error: "communityId is missing." }, { status: 400, headers: NO_STORE })
  }
  if (body.reason !== undefined && typeof body.reason !== "string") {
    return NextResponse.json({ error: "reason must be text." }, { status: 400, headers: NO_STORE })
  }
  const action = body.action as AdminCommunityAction
  const reason = typeof body.reason === "string" ? body.reason.slice(0, REASON_MAX) : ""

  try {
    const admin = createAdminClient()
    const result = await applyAdminAction(admin, action, body.communityId, reason)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status, headers: NO_STORE })
    const recorded = result.changed
      ? await recordAdminAction(admin, {
          action: `community_${action}`,
          targetType: "community",
          targetId: result.community.id,
          targetLabel: result.community.name,
          reason: reason || null,
          detail: { slug: result.community.slug, status: result.community.status, hidden: result.community.platformHidden },
        })
      : true
    /* Hidden, suspended or back: its page told to search engines after the answer (lib/seo/announce-pages.ts), as a creator's own change is. */
    if (result.changed && result.community.slug) {
      const slug = result.community.slug
      after(() => announceAddresses(communityAddresses(slug)))
    }
    return NextResponse.json({ community: result.community, changed: result.changed, recorded: recorded && (result.audited || !result.changed) }, { headers: NO_STORE })
  } catch (error) {
    return adminFailure("community action", error)
  }
}
