import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { rateLimit } from "@/lib/api/rate-limit"
import { createFromFlow, loadCreatorCommunities } from "@/lib/communities/server/creator"
import { checkCreate } from "@/components/community/creator/logic"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * GET  /api/app/community  -> { available, rows }: the creator's communities
 *      and the ones they help run.
 * POST /api/app/community  { name, description, logoUrl, coverUrl, type:
 *      "free" | "paid" | "private", price?, interval?: "month" | "year" | "once" }
 *      -> { id, slug }. The community with its spaces, levels and owner row,
 *      and for a paid one the tier and its product (lib/communities/server
 *      /creator.ts createFromFlow). It starts as a draft.
 */
export async function GET() {
  const off = await requireCommunitiesOn()
  if (off) return off
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const list = await loadCreatorCommunities(ctx.admin, ctx.creatorId, ctx.userId)
  return NextResponse.json(list, { headers: noStore })
}

export async function POST(request: Request) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const limited = await rateLimit({
    bucket: "community-create",
    subjects: [`user:${ctx.userId}`],
    windows: [
      { limit: 10, seconds: 3600 },
      { limit: 30, seconds: 86400 },
    ],
    message: "That is a lot of new communities. Try again later.",
  })
  if (limited) return limited
  const checked = checkCreate(await readJson(request))
  if (!checked.ok) return NextResponse.json({ error: checked.error, field: checked.field }, { status: 400, headers: noStore })
  const made = await createFromFlow(ctx.admin, { creatorId: ctx.creatorId, userId: ctx.userId, input: checked.value })
  if (!made.ok) return NextResponse.json({ error: made.error, field: made.field }, { status: made.status, headers: noStore })
  return NextResponse.json({ id: made.community.id, slug: made.community.slug }, { status: 201, headers: noStore })
}
