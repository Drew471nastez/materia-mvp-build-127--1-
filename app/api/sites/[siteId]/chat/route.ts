/**
 * A site's conversation.
 *
 * Read-only. Messages are written by the agent route as runs complete, never
 * posted by the browser — a client that can write its own transcript can write
 * one that never happened, and this is the record a creator trusts when they
 * come back to a site a week later.
 */

import { type NextRequest, NextResponse } from "next/server"

import { ChatUnavailableError, readChat } from "@/lib/sites/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params

  try {
    // An empty list is also what a site the caller cannot see looks like: RLS
    // returns no rows, and there is nothing here that could tell them apart.
    // That is deliberate — a stranger changing the id in the URL learns
    // nothing about whether the site exists.
    return NextResponse.json(
      { messages: await readChat(siteId) },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (thrown) {
    if (!(thrown instanceof ChatUnavailableError)) throw thrown
    /**
     * A read that FAILED is not a conversation that is empty. Answering 200
     * with `[]` here would tell the editor the history is gone when it is
     * sitting in the table, unreadable — and the creator would reasonably
     * conclude the product had lost their work.
     */
    return NextResponse.json(
      { error: "Could not load this conversation." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    )
  }
}
