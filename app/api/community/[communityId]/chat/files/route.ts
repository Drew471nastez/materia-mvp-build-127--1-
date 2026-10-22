import { NextResponse } from "next/server"
import { chatSpace } from "@/lib/communities/server/chat"
import { chatMediaOf } from "@/lib/communities/server/chat-media"
import { chatRoute, notFound } from "@/lib/communities/server/chat-routes"
import { conversationOf } from "@/lib/communities/server/direct"
import { NO_STORE } from "@/lib/communities/server/feed"
import { groupOf } from "@/lib/communities/server/groups"
import { signCommunityFile } from "@/lib/communities/server/post-files"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Params = { params: Promise<{ communityId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TABLES = { space: "community_messages", dm: "community_direct_messages", group: "community_chat_group_messages" } as const

/**
 * GET ?chat=space|dm|group&message=<id>&asset=<id>
 * A file sent in a chat, for someone in that chat: a channel they may read, a
 * conversation they are part of, a group they are in. The file must be named
 * on that message, which must still be there. Then a signed address for a
 * few minutes from the sender's folder (lib/communities/server/post-files.ts),
 * saved under its name; a video plays from it in the chat.
 */
export async function GET(request: Request, { params }: Params) {
  const { communityId } = await params
  const sp = new URL(request.url).searchParams
  const chat = sp.get("chat") as keyof typeof TABLES | null
  const messageId = sp.get("message") ?? ""
  const assetId = (sp.get("asset") ?? "").toLowerCase()
  if (!chat || !(chat in TABLES) || !UUID.test(messageId) || !UUID.test(assetId)) return notFound()
  const r = await chatRoute(communityId, "view", "chatFile")
  if (r instanceof NextResponse) return r
  const { db, gate } = r
  const { data } = await db.from(TABLES[chat]).select("*").eq("id", messageId).eq("community_id", gate.community.id).maybeSingle()
  const row = data as { status?: string; author_id?: string | null; attachments?: unknown; space_id?: string; conversation_id?: string; group_id?: string } | null
  if (!row || row.status !== "published") return notFound()
  const allowed =
    chat === "space" ? !!(row.space_id && (await chatSpace(db, gate.community, gate.viewer, row.space_id))) : chat === "dm" ? !!(row.conversation_id && (await conversationOf(db, gate.community, gate.viewer, row.conversation_id))) : !!(row.group_id && (await groupOf(db, gate.community, gate.viewer, row.group_id)))
  if (!allowed) return notFound()
  const named = chatMediaOf(row.attachments).find((m) => m.type === "file" && m.assetId === assetId) as { assetId: string; name?: string } | undefined
  if (!named) return notFound()
  const url = await signCommunityFile(db, gate.community, row.author_id ?? null, { assetId: named.assetId, name: named.name || "File" })
  if (!url) return NextResponse.json({ error: "The file could not be opened. Try again in a moment." }, { status: 502, headers: NO_STORE })
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE })
}
