import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { onePageActor } from "@/lib/team/onepage"
import { authUnavailableResponse, readUserForRoute } from "@/lib/auth/route-user"
import { pollOptions, type AppBlockData } from "@/lib/onepage/app-blocks"
import { findPageBlock } from "@/lib/onepage/page-block"
import { tallyFor } from "@/lib/onepage/poll-server"
import { pageTips } from "@/lib/onepage/tips-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const noStore = { "Cache-Control": "private, no-store" }

/**
 * GET /api/onepage/activity?onepage_id=<id>&block_id=<id>
 *
 * What visitors did with a block, for its owner in /app (round AR): a
 * poll's totals, a tips block's tips (each amount, name and message, and the
 * total per currency), an event's RSVPs. Only the page's owner, or a team
 * member with OnePage (lib/team/onepage), as the editor's other figures.
 * Read with the service role once the owner is checked: the tables have no
 * policy for anyone else (run-now part 411).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const onepageId = params.get("onepage_id")
  const blockId = params.get("block_id")
  if (!onepageId || !blockId) return NextResponse.json({ error: "Missing onepage_id or block_id" }, { status: 400, headers: noStore })
  const supabase = await createClient()
  const {
    data: { user },
    unavailable,
  } = await readUserForRoute()
  if (unavailable) return authUnavailableResponse()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore })
  const actor = await onePageActor(supabase, user.id)
  if (actor instanceof NextResponse) return actor
  const { data: page } = await actor.db.from("onepages").select("id, owner_id, draft_blocks, published_blocks").eq("id", onepageId).maybeSingle()
  if (!page || page.owner_id !== actor.pageOwnerId) return NextResponse.json({ error: "Unauthorized" }, { status: 403, headers: noStore })

  const db = createAdminClient()
  /* The block as the editor has it now (the draft), else as published: its answers and its kind. */
  const found = findPageBlock(page.draft_blocks, blockId) ?? findPageBlock(page.published_blocks, blockId)
  const data = (found?.block.data ?? {}) as AppBlockData
  const provider = found?.block.type === "app" ? data.provider : null

  if (provider === "poll") {
    const tally = await tallyFor(db, page.id, blockId, pollOptions(data))
    return NextResponse.json({ kind: "poll", ready: tally !== null, tally }, { headers: noStore })
  }
  if (provider === "tips") {
    const { rows, ready } = await pageTips(db, page.id, 200)
    const mine = rows.filter((r) => r.block_id === blockId)
    const totals: Record<string, { count: number; cents: number }> = {}
    for (const r of mine) {
      const t = (totals[r.currency] ??= { count: 0, cents: 0 })
      t.count += 1
      t.cents += r.amount_cents
    }
    return NextResponse.json({ kind: "tips", ready, totals, tips: mine.slice(0, 50) }, { headers: noStore })
  }
  if (provider === "event") {
    const { data: rows, error } = await db.from("onepage_leads").select("name, email, created_at").eq("onepage_id", page.id).eq("block_id", blockId).eq("magnet_kind", "rsvp").order("created_at", { ascending: false }).limit(500)
    return NextResponse.json({ kind: "rsvp", ready: !error, count: rows?.length ?? 0, people: (rows ?? []).slice(0, 100) }, { headers: noStore })
  }
  return NextResponse.json({ kind: "none" }, { headers: noStore })
}
