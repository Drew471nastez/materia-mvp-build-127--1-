import { NextResponse } from "next/server"
import { chatIntro, acceptChatRules, setMyDms } from "@/lib/communities/server/chat-settings"
import { chatRoute, ok, refusal } from "@/lib/communities/server/chat-routes"
import { canStartGroups } from "@/lib/communities/server/groups"
import { readJson } from "@/lib/communities/server/feed"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** GET: what a member is told before they write (the chat rules, whether to accept them, who can be messaged, whether they may start a group). */
export async function GET(_request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view")
  if (r instanceof NextResponse) return r
  const [intro, groups] = await Promise.all([chatIntro(r.db, r.gate.community, r.gate.viewer), canStartGroups(r.db, r.gate.community, r.gate.viewer)])
  return ok({ ...intro, canStartGroups: groups })
}

/** POST { action: "accept_rules" } | { action: "my_dms", value: "everyone" | "staff" | "nobody" }. */
export async function POST(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view", "chatPrefs")
  if (r instanceof NextResponse) return r
  const body = await readJson(request)
  if (body.action === "accept_rules") {
    const done = await acceptChatRules(r.db, r.gate.community, r.gate.viewer)
    return done.ok ? ok({ version: done.version }) : refusal(done)
  }
  if (body.action === "my_dms") {
    const done = await setMyDms(r.db, r.gate.community, r.gate.viewer, body.value)
    return done.ok ? ok({ myDms: done.value }) : refusal(done)
  }
  return refusal({ error: "Nothing to change.", status: 400 })
}
