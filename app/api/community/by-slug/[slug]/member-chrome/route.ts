import { NextResponse } from "next/server"
import { memberPage } from "@/components/community/member/data"
import { topBarData } from "@/lib/communities/server/public"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Top bar data for /account when the tab bar's community context is active. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const page = await memberPage(slug)
  if (page.state !== "member" || !page.community || !page.viewer) {
    return NextResponse.json({ error: "Not a member" }, { status: 404, headers: { "Cache-Control": "no-store" } })
  }
  const topBar = await topBarData(page.community, page.viewer)
  return NextResponse.json({ topBar, unreadMessages: null }, { headers: { "Cache-Control": "no-store" } })
}
