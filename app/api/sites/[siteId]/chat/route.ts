/**
 * A site's conversation.
 *
 * Read-only. Messages are written by the agent route as runs complete, never
 * posted by the browser — a client that can write its own transcript can write
 * one that never happened, and this is the record a creator trusts when they
 * come back to a site a week later.
 */

import { type NextRequest, NextResponse } from "next/server"

import { readChat } from "@/lib/sites/chat"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(_request: NextRequest, context: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await context.params
  // An empty list is also what a site the caller cannot see looks like: RLS
  // returns no rows, and there is nothing here that could tell them apart.
  return NextResponse.json({ messages: await readChat(siteId) })
}
