import { createClient } from "@/lib/supabase/server"
import { onePageActor } from "@/lib/team/onepage"
import { createAdminClient } from "@/lib/supabase/admin"
import { NextRequest, NextResponse } from "next/server"
import { isTimeZone } from "@/lib/orders/time-zone"
import { readBlockStats, readPageClicks, type StatsPage } from "@/lib/onepage/link-stats-server"
import { readUserForRoute } from "@/lib/auth/route-user"

/**
 * THE ONEPAGE EDITOR'S FIGURES, the same as Analytics' (lib/onepage/
 * link-stats-server): a block's views, visitors, clicks (or sign-ups) and
 * click rate over a period with `block_id`, or every block's clicks for the
 * list without it. The owner is checked with their own session; the counts
 * are then read with the service role, as /app/analytics reads them
 * (analytics_events has no policy that lets a creator read their own rows).
 *
 * The period is two instants (`start`, `end`) from the shared date picker,
 * bucketed in `tz`, the creator's zone. `days` alone is the last that many
 * days, for an older caller.
 */
const MAX_SPAN_MS = 12 * 366 * 86_400_000
const DAY = 86_400_000

function periodOf(params: URLSearchParams, now: number): { start: number; end: number } {
  const start = Date.parse(params.get("start") ?? "")
  const end = Date.parse(params.get("end") ?? "")
  if (Number.isFinite(start) && Number.isFinite(end) && end > start && end - start < MAX_SPAN_MS) return { start, end: Math.min(end, now + DAY) }
  const days = Math.min(3660, Math.max(1, parseInt(params.get("days") || "7", 10) || 7))
  return { start: now - days * DAY, end: now }
}

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams
    const onepageId = params.get("onepage_id")
    const blockId = params.get("block_id")
    if (!onepageId) return NextResponse.json({ error: "Missing onepage_id" }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await readUserForRoute()
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    /* Whose page (lib/team/onepage): the owner's own, or for a team member with OnePage the store owner's. */
    const actor = await onePageActor(supabase, user.id)
    if (actor instanceof NextResponse) return actor

    const { data: onepage } = await actor.db
      .from("onepages")
      .select("id, owner_id, seller_id, creator_id, draft_blocks, published_blocks")
      .eq("id", onepageId)
      .maybeSingle()
    if (!onepage || onepage.owner_id !== actor.pageOwnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 403 })

    const tz = params.get("tz")
    const timeZone = isTimeZone(tz) ? tz : "UTC"
    const window = periodOf(params, Date.now())
    const admin = createAdminClient()
    const page = onepage as StatsPage

    if (blockId) {
      const blocks = (page.draft_blocks ?? page.published_blocks) as Array<{ id?: string; type?: string; data?: { children?: Array<{ id?: string; type?: string }> } }> | null
      const find = (list: typeof blocks): { type?: string } | undefined => {
        for (const b of list ?? []) {
          if (b?.id === blockId) return b
          const inner = find((b?.data?.children ?? null) as typeof blocks)
          if (inner) return inner
        }
        return undefined
      }
      const stats = await readBlockStats(admin, page, { blockId, window, timeZone, blockType: find(blocks)?.type ?? null })
      if (!stats) return NextResponse.json({ total_views: 0, total_visitors: 0, total_clicks: 0, click_rate: null, counts: "clicks", chart_data: [], truncated: false })
      return NextResponse.json(stats, { headers: { "Cache-Control": "private, no-store" } })
    }

    const summary = await readPageClicks(admin, page, { window, timeZone })
    return NextResponse.json(summary ?? { total_views: 0, total_visitors: 0, total_clicks: 0, block_clicks: {}, truncated: false }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) {
    console.error("Stats error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
