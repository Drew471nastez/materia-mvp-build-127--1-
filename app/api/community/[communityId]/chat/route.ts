import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { readJson, sessionUserId } from "@/lib/communities/server/feed"
import { chatIntro, acceptChatRules, setMyDms } from "@/lib/communities/server/chat-settings"
import { chatLimit, ok, refusal } from "@/lib/communities/server/chat-routes"
import { canStartGroups } from "@/lib/communities/server/groups"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: what a member is told before they write (the chat rules, whether to accept them, who can be messaged, whether they may start a group). */
export async function GET(_request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const [intro, groups] = await Promise.all([chatIntro(db, gate.community, gate.viewer), canStartGroups(db, gate.community, gate.viewer)])
  return ok({ ...intro, canStartGroups: groups })
}

/** POST { action: "accept_rules" } | { action: "my_dms", value: "everyone" | "staff" | "nobody" }. */
export async function POST(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "view")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "chatPrefs")
  if (limited) return limited
  const body = await readJson(request)
  if (body.action === "accept_rules") {
    const done = await acceptChatRules(db, gate.community, gate.viewer)
    return done.ok ? ok({ version: done.version }) : refusal(done)
  }
  if (body.action === "my_dms") {
    const done = await setMyDms(db, gate.community, gate.viewer, body.value)
    return done.ok ? ok({ myDms: done.value }) : refusal(done)
  }
  return refusal({ error: "Nothing to change.", status: 400 })
}
