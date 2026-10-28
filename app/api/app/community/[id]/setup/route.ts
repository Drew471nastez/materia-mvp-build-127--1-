import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { loadCommunity, requireCreatorCommunity } from "@/lib/communities/server/context"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { creatorPaymentsReady, manageLimit } from "@/lib/communities/server/creator"
import { loadSetupChecklist, markSetupProgress } from "@/lib/communities/server/setup-checklist"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * The setup list of one community, for its owner and admins
 * (manage_settings), by its id or its address: the floating Setup pill knows
 * only the address it is on (components/community/creator/setup-pill.tsx).
 * A signed in creator first, so nobody else can ask which addresses exist;
 * then the community's own gate decides.
 *
 * GET  /api/app/community/<id or slug>/setup  -> the list (lib/communities/setup-checklist.ts)
 * POST /api/app/community/<id or slug>/setup  { step: "skip_rules" | "intro_watched" | "app_confirmed" | "pill_hidden", on?: boolean }
 *      kept for this person (run-now part 202); 503 not_ready before it.
 */
async function idOf(key: string, db: Parameters<typeof loadCommunity>[0]): Promise<string | null> {
  if (UUID.test(key)) return key
  return (await loadCommunity(db, { slug: key }))?.id ?? null
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const creator = await requireCreator("community")
  if (isResponse(creator)) return creator
  const { id: key } = await params
  const id = await idOf(key, creator.admin)
  if (!id) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const c = gate.community
  const paymentsReady = c.creator_id ? await creatorPaymentsReady(gate.ctx.admin, c.creator_id) : false
  const list = await loadSetupChecklist(gate.ctx.admin, { community: c, userId: gate.ctx.userId, role: gate.role, paymentsReady })
  return NextResponse.json({ id: c.id, slug: c.slug, ...list }, { headers: noStore })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const creator = await requireCreator("community")
  if (isResponse(creator)) return creator
  const { id: key } = await params
  const id = await idOf(key, creator.admin)
  if (!id) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore })
  const gate = await requireCreatorCommunity(id, "manage_settings")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  const done = await markSetupProgress(gate.ctx.admin, { communityId: gate.community.id, userId: gate.ctx.userId, step: body.step, on: body.on !== false })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  return NextResponse.json({ ok: true }, { headers: noStore })
}
