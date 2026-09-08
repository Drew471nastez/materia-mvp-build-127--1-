/**
 * The theme editor's conversation, read back.
 *
 * GET only. Writes happen inside the agent route as the run proceeds — a
 * client that can write its own transcript can write one that never happened,
 * and this is the record somebody consults when they want to know why their
 * page looks like it does.
 */

import { NextResponse } from "next/server"

import { readThemeChat, ThemeChatUnavailableError } from "@/lib/website-builder/agent/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: Request, context: { params: Promise<{ installId: string }> }) {
  const { installId } = await context.params

  try {
    return NextResponse.json({ messages: await readThemeChat(installId) })
  } catch (thrown) {
    /**
     * 503, not an empty list. A failed read and an empty conversation look
     * identical to the panel, and showing somebody a blank chat lets them
     * believe their history is gone when it is sitting in the table.
     */
    if (thrown instanceof ThemeChatUnavailableError) {
      return NextResponse.json({ error: "Could not load this conversation." }, { status: 503 })
    }
    throw thrown
  }
}
