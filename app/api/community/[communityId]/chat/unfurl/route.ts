import { NextResponse } from "next/server"
import { requireCommunitiesOn } from "@/lib/communities/flag"
import { requireMember } from "@/lib/communities/server/context"
import { admin } from "@/lib/communities/server/db"
import { NO_STORE, sessionUserId } from "@/lib/communities/server/feed"
import { chatLimit } from "@/lib/communities/server/chat-routes"
import { signChatCard, unfurlForChat } from "@/lib/communities/server/chat-unfurl"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 15

type Params = { params: Promise<{ communityId: string }> }

/**
 * GET ?url=<address>: { card: { url, title?, description?, image?, site?, sig } | null }
 * The card for a link a member is writing in a chat message, read by the
 * server from public addresses only (lib/communities/server/chat-unfurl.ts),
 * signed so the message can keep it. For a member who may write in chat;
 * 60 a minute.
 */
export async function GET(request: Request, { params }: Params) {
  const off = await requireCommunitiesOn()
  if (off) return off
  const { communityId } = await params
  const db = admin()
  const gate = await requireMember(db, communityId, await sessionUserId(), "chat")
  if (gate instanceof NextResponse) return gate
  const limited = await chatLimit(gate, "chatUnfurl")
  if (limited) return limited
  if (!gate.community.chat_enabled) return NextResponse.json({ card: null }, { headers: NO_STORE })
  const card = await unfurlForChat(new URL(request.url).searchParams.get("url"))
  return NextResponse.json({ card: card ? { ...card, sig: signChatCard(card) } : null }, { headers: NO_STORE })
}
