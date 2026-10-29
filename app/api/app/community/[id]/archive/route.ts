import { NextResponse, after } from "next/server"
import { announceAddresses, communityAddresses } from "@/lib/seo/announce-pages"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireCreatorCommunity } from "@/lib/communities/server/context"
import { noStore, readJson } from "@/lib/email-campaigns/route-auth"
import { manageLimit, setArchived } from "@/lib/communities/server/creator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * POST /api/app/community/<id>/archive  { archived: boolean }
 * Archived: members can still read everything, nobody can post, it is off
 * sale. Brought back, it is a draft until it is published again.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { id } = await params
  const gate = await requireCreatorCommunity(id, "archive")
  if (gate instanceof NextResponse) return gate
  const limited = await manageLimit(gate.ctx.userId)
  if (limited) return limited
  const body = await readJson(request)
  if (typeof body.archived !== "boolean") return NextResponse.json({ error: "archived is true or false" }, { status: 400, headers: noStore })
  const done = await setArchived(gate.ctx.admin, { community: gate.community, actorId: gate.ctx.userId, archived: body.archived })
  if (!done.ok) return NextResponse.json({ error: done.error }, { status: done.status, headers: noStore })
  /* Archived, a public community leaves the index; tell the engines after the answer (lib/seo/announce-pages.ts). */
  const slug = gate.community.slug
  after(() => announceAddresses(communityAddresses(slug)))
  return NextResponse.json({ status: done.community.status }, { headers: noStore })
}
