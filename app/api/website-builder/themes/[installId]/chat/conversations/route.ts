/**
 * The history: every Ask Storelib conversation on one website, newest first.
 *
 * GET only, and only the signed in creator's own install. Ownership is proved
 * against their own client first, and the list is read through that same
 * client, so the policy on theme_chat_conversations decides what is in it.
 * A conversation from another website never appears, whatever is asked.
 */

import { NextResponse } from "next/server"

import {
  listThemeConversations,
  ownThemeInstall,
  ThemeChatUnavailableError,
} from "@/lib/website-builder/agent/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const owned = await ownThemeInstall(installId)
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
