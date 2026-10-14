import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { meetsRole } from "@/lib/communities/permissions"
import { loadCommunity, requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { sessionUserId } from "@/lib/communities/server/feed"
import { topBarData } from "@/lib/communities/server/public"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const NOT_MEMBER = () => NextResponse.json({ error: "Not a member" }, { status: 404, headers: { "Cache-Control": "no-store" } })

/** Top bar data for /account when the tab bar's community context is active. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { slug } = await params
  const db = admin()
  const community = await loadCommunity(db, { slug })
  if (!community) return NOT_MEMBER()
  /* The foundation's gate, as on every community route; any refusal is the same 404 the account chrome ends its context on. */
  const gate = await requireMember(db, community.id, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return NOT_MEMBER()
  /* A draft is its staff's until it is published (components/community/member/data.ts memberPage). */
  if (gate.community.status === "draft" && !meetsRole(gate.viewer.role, "moderator")) return NOT_MEMBER()
  const topBar = await topBarData(gate.community, gate.viewer, db)
  return NextResponse.json({ topBar, unreadMessages: null }, { headers: { "Cache-Control": "no-store" } })
}
