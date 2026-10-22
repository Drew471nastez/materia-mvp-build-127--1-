import { NextResponse } from "next/server"
import { chatSpace } from "@/lib/communities/server/chat"
import { myChatPref, setChatPref } from "@/lib/communities/server/chat-settings"
import { chatRoute, notFound, ok, refusal } from "@/lib/communities/server/chat-routes"
import { conversationOf } from "@/lib/communities/server/direct"
import { readJson } from "@/lib/communities/server/feed"
import { groupOf } from "@/lib/communities/server/groups"
import type { Db } from "@/lib/communities/server/db"
import type { ChatRouteGate } from "@/lib/communities/server/chat-routes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

/** Whether the viewer is in this chat: a channel they may read, a conversation they are part of, a group they are in. */
async function inChat(db: Db, gate: ChatRouteGate, type: unknown, id: unknown): Promise<boolean> {
  if (typeof id !== "string") return false
  if (type === "space") return !!(await chatSpace(db, gate.community, gate.viewer, id))
  if (type === "dm") return !!(await conversationOf(db, gate.community, gate.viewer, id))
  if (type === "group") return !!(await groupOf(db, gate.community, gate.viewer, id))
  return false
}

/** GET ?type=space|dm|group&id=: { notify, mutedUntil } for the viewer. */
export async function GET(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view")
  if (r instanceof NextResponse) return r
  const sp = new URL(request.url).searchParams
  const type = sp.get("type")
  const id = sp.get("id")
  if (!(await inChat(r.db, r.gate, type, id))) return notFound()
  return ok(await myChatPref(r.db, String(r.gate.viewer.userId), type as "space" | "dm" | "group", String(id)))
}

/** POST { type, id, notify: "default"|"all"|"mentions"|"none", muteMinutes?: number }: the viewer's own choice for one chat. */
export async function POST(request: Request, { params }: Params) {
  const { communityId } = await params
  const r = await chatRoute(communityId, "view", "chatPrefs")
  if (r instanceof NextResponse) return r
  const body = await readJson(request)
  if (!(await inChat(r.db, r.gate, body.type, body.id))) return notFound()
  const done = await setChatPref(r.db, String(r.gate.viewer.userId), r.gate.community.id, body.type, body.id, body)
  return done.ok ? ok(done.value) : refusal(done)
}
