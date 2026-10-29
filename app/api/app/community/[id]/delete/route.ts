import { NextResponse, after } from "next/server"
import { announceAddresses, communityAddresses } from "@/lib/seo/announce-pages"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { deleteCommunity, manageLimit } from "@/lib/communities/server/creator"
import { deletionPlan, undoDeletion } from "@/lib/communities/server/community-deletion"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 30

/**
 * The owner only, every method (requireCreatorCommunity "delete").
 *
 * GET  /api/app/community/<id>/delete
 *      -> the plan the dialog shows: how many members pay, until when, about
 *      what a deletion now refunds, and what is already scheduled
 *      (lib/communities/server/community-deletion.ts deletionPlan).
 * POST /api/app/community/<id>/delete  { confirm: "<the community's name>", mode?: "period_end" | "now" }
 *      Nobody pays: a soft delete at once (hidden everywhere, archived, off
 *      sale; rows, posts and orders kept) -> { deleted: true }.
 *      Somebody pays (round 33): archived now, every membership stopped
 *      through Stripe, deleted when the last paid period ends, or now with
 *      prorated refunds -> { deleted, scheduled }.
 * POST /api/app/community/<id>/delete  { undo: true }
 *      Before the date: every membership the deletion stopped renews again
 *      and the community is what it was.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "delete")
  if (gate instanceof NextResponse) return gate
  return NextResponse.json(await deletionPlan(gate.ctx.admin, gate.community), { headers: noStore })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "delete")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (body.undo === true) {
    const kept = await undoDeletion(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId })
    if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.status, headers: noStore })
    return NextResponse.json({ ok: true, resumed: kept.resumed }, { headers: noStore })
  }
  const done = await deleteCommunity(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, confirm: body.confirm, mode: body.mode })
  if (!done.ok) return NextResponse.json({ error: done.error, field: done.field }, { status: done.status, headers: noStore })
  /* Deleted or waiting to be, its page is gone from the sitemap; tell the engines after the answer. */
  const slug = gate.community.slug
  after(() => announceAddresses(communityAddresses(slug)))
  return NextResponse.json({ ok: true, deleted: done.deleted, scheduled: done.scheduled }, { headers: noStore })
}
