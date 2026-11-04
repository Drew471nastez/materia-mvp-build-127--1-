/**
 * One Ask Storelib conversation, deleted: its messages, and the pictures in
 * them. `earlier` names the messages from before conversations were kept
 * apart, which the history shows as one thread of its own.
 *
 * DELETE only, and only on the signed in creator's own install. Ownership is
 * proved against their own client, then the conversation is looked for
 * through that same client: one on another website, or somebody else's,
 * is not found (404), and nothing is deleted. See deleteThemeChat.
 */

import { NextResponse } from "next/server"

import { deleteThemeChat, ownThemeInstall } from "@/lib/website-builder/agent/chat"
import { authUnavailableResponse } from "@/lib/auth/route-user"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ installId: string; conversationId: string }> },
) {
  const { installId, conversationId } = await context.params

  const owned = await ownThemeInstall(installId)
  if (!owned.ok && owned.status === 503) return authUnavailableResponse()
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 401 ? "Sign in to delete this conversation." : "Website not found." },
      { status: owned.status },
    )
  }

  const result = await deleteThemeChat(
    installId,
    conversationId === "earlier" ? { kind: "earlier" } : { kind: "one", id: conversationId },
  )
  if (result.ok) return NextResponse.json({ deleted: result.conversations, messages: result.messages })
  return NextResponse.json(
    {
      error:
        result.reason === "not_found"
          ? "That conversation is not on this website."
          : "This conversation could not be deleted. Try again in a moment.",
      reason: result.reason,
    },
    { status: result.status },
  )
}
