/** How many subscribed people a set of segment rules picks today, before it is saved. */
import { NextResponse } from "next/server"
import { isResponse, noStore, readJson, requireCreator } from "@/lib/email-campaigns/route-auth"
import { segmentMemberIds } from "@/lib/email-campaigns/segments-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request: Request) {
  const ctx = await requireCreator()
  if (isResponse(ctx)) return ctx
  const body = await readJson(request)
  try {
    const ids = await segmentMemberIds(ctx.admin, ctx.creatorId, body.rules)
    return NextResponse.json({ count: ids.length }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: "Could not count your list. Try again in a moment." }, { status: 503, headers: noStore })
  }
}
