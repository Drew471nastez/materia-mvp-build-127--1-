import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { loadCommunity, requireCreatorCommunity } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { creatorPaymentsReady, manageLimit } from "@/lib/communities/server/creator"
import { loadSetupChecklist, markSetupProgress } from "@/lib/communities/server/setup-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The setup list of one community, for its owner and admins
 * (manage_settings), by its id or its address: the floating Setup pill knows
 * only the address it is on (components/community/creator/setup-pill.tsx).
 *
 * GET  /api/app/community/<id or slug>/setup  -> the list (lib/communities/setup-checklist.ts)
 * POST /api/app/community/<id or slug>/setup  { step: "skip_rules" | "intro_watched" | "app_confirmed" | "pill_hidden", on?: boolean }
 *      kept for this person (run-now part 202); 503 not_ready before it.
 */
async function gateFor(key: string) {
  let id = key
  if (!UUID.test(key)) {
    const found = await loadCommunity(admin(), { slug: key })
    if (!found) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
    id = found.id
  }
  return requireCreatorCommunity(id, "manage_settings")
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await gateFor(id)
  if (gate instanceof NextResponse) return gate
  const c = gate.community
  const paymentsReady = c.creator_id ? await creatorPaymentsReady(gate.ctx.admin, c.creator_id) : false
  const list = await loadSetupChecklist(gate.ctx.admin, { community: c, userId: gate.ctx.userId, role: gate.role, paymentsReady })
  return NextResponse.json({ id: c.id, slug: c.slug, ...list }, { headers: noStore })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await gateFor(id)
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await markSetupProgress(gate.ctx.admin, { communityId: gate.community.id, userId: gate.ctx.userId, step: body.step, on: body.on !== false })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
