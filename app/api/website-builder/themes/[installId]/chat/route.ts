/**
 * The theme editor's conversation, read back.
 *
 * GET only. Writes happen inside the agent route as the run proceeds — a
 * client that can write its own transcript can write one that never happened,
 * and this is the record somebody consults when they want to know why their
 * page looks like it does.
 *
 * ONE CONVERSATION AT A TIME. `?conversation=` names which: an id from the
 * history, `earlier` for the messages from before conversations were kept
 * apart, or nothing for the one used most recently. Every read is scoped to
 * the signed in creator's own install twice over: `ownThemeInstall` proves it
 * against their client, and the reads go through that same client, where RLS
 * hides every other creator's rows whatever id is asked for.
 */

import { NextResponse } from "next/server"

import {
  isConversationId,
  listThemeConversations,
  ownThemeInstall,
  readThemeChat,
  ThemeChatUnavailableError,
  type ConversationScope,
} from "@/lib/website-builder/agent/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  const owned = await ownThemeInstall(installId)
  if (!owned.ok) {
    return NextResponse.json(
      { error: owned.status === 401 ? "Sign in to read this conversation." : "Website not found." },
      { status: owned.status },
    )
  }

  const asked = new URL(request.url).searchParams.get("conversation")

  try {
    /**
     * WHICH CONVERSATION. A database that has not had the conversations
     * part run yet answers `all`, the single thread it has always had, and
     * says so, so the history can explain itself instead of looking empty.
     */
    let listed: Awaited<ReturnType<typeof listThemeConversations>> | null = null
    try {
      listed = await listThemeConversations(installId)
    } catch (thrown) {
      if (!(thrown instanceof ThemeChatUnavailableError) || !thrown.notSetUp) throw thrown
    }

    if (!listed) {
      const all = await readThemeChat(installId)
      return NextResponse.json({
        conversation: null,
        earlier: false,
        history: "not_set_up",
        messages: all.messages,
        pictures: all.pictures,
      })
    }

    let scope: ConversationScope | null = null
    let conversation: { id: string; title: string } | null = null
    if (isConversationId(asked)) {
      const found = listed.conversations.find((c) => c.id === asked)
      /* Not on this website, or not this creator's: the same answer. */
      if (!found) return NextResponse.json({ error: "That conversation is not on this website." }, { status: 404 })
      scope = { kind: "one", id: found.id }
      conversation = { id: found.id, title: found.title }
    } else if (asked === "earlier") {
      scope = listed.earlier ? { kind: "earlier" } : null
    } else if (asked !== "new") {
      const latest = listed.conversations[0]
      const earlierIsNewer =
        !!listed.earlier && (!latest || new Date(listed.earlier.updatedAt) > new Date(latest.updatedAt))
      if (earlierIsNewer) scope = { kind: "earlier" }
      else if (latest) {
        scope = { kind: "one", id: latest.id }
        conversation = { id: latest.id, title: latest.title }
      }
    }

    /*
      THE PICTURES SAY WHETHER THEY CAN BE READ. "not_set_up" before the
      database update that keeps them: the chat says pictures are not kept
      yet, and each one a message mentions is drawn as no longer available.
    */
    const read = scope ? await readThemeChat(installId, scope) : { messages: [], pictures: "ready" as const }
    return NextResponse.json({
      conversation,
      earlier: scope?.kind === "earlier",
      history: "ready",
      messages: read.messages,
      pictures: read.pictures,
    })
  } catch (thrown) {
    /**
     * 503, not an empty list. A failed read and an empty conversation look
     * identical to the panel, and showing somebody a blank chat lets them
     * believe their history is gone when it is sitting in the table.
     */
    if (thrown instanceof ThemeChatUnavailableError) {
      /**
       * `reason` so the panel can say the true thing. A deployment whose
       * migration has not been run is not a fault, and telling somebody their
       * conversation could not be loaded — when there is not yet anywhere for
       * one to live — sends them looking for a problem that is not there.
       */
      return NextResponse.json(
        {
          error: thrown.notSetUp
            ? "Chat history is not set up on this database yet."
            : "Could not load this conversation.",
          reason: thrown.notSetUp ? "not_set_up" : "read_failed",
        },
        { status: 503 },
      )
    }
    throw thrown
  }
}
