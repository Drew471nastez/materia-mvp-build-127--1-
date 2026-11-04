/**
 * The history: every Ask Storelib conversation on one website, newest first.
 *
 * GET lists them; DELETE deletes every one (the history's "Delete all").
 * Both only for the signed in creator's own install. Ownership is proved
 * against their own client first, and what is listed or deleted is read
 * through that same client, so the policy on theme_chat_conversations
 * decides. A conversation from another website never appears and is never
 * touched, whatever is asked. One conversation is deleted at
 * ./[conversationId].
 */

import { NextResponse } from "next/server"
import { authUnavailableResponse } from "@/lib/auth/route-user"

import {
  deleteThemeChat,
  listThemeConversations,
  ownThemeInstall,
  ThemeChatUnavailableError,
} from "@/lib/website-builder/agent/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const owned = await ownThemeInstall(installId)
  if (!owned.ok && owned.status === 503) return authUnavailableResponse()
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 401 ? "Sign in to see your conversations." : "Website not found." },
      { status: owned.status },
    )
  }

  try {
    const { conversations, earlier } = await listThemeConversations(installId)
    return NextResponse.json({ conversations, earlier })
  } catch (thrown) {
    if (thrown instanceof ThemeChatUnavailableError) {
      return NextResponse.json(
        {
          error: thrown.notSetUp
            ? "Conversation history is not set up on this database yet."
            : "Could not load your conversations.",
          reason: thrown.notSetUp ? "not_set_up" : "read_failed",
        },
        { status: 503 },
      )
    }
    throw thrown
  }
}

/** Every conversation on this website, and the pictures in them. */
export async function DELETE(_request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const owned = await ownThemeInstall(installId)
  if (!owned.ok && owned.status === 503) return authUnavailableResponse()
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 401 ? "Sign in to delete your conversations." : "Website not found." },
      { status: owned.status },
    )
  }

  const result = await deleteThemeChat(installId, { kind: "all" })
  if (result.ok) return NextResponse.json({ deleted: result.conversations, messages: result.messages })
  return NextResponse.json(
    { error: "Your conversations could not be deleted. Try again in a moment.", reason: result.reason },
    { status: result.status },
  )
}
