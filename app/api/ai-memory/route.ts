import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addMemory, listMemories, type MemoryDb } from "@/lib/ai-memory/store"
import { memoryCaller } from "./caller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * AI Memory (lib/ai-memory/store.ts): with no `installId`, what Storelib AI
 * keeps for a creator on every website; with one, that website's own notes.
 * Through the person's own client, never the service role, so row level
 * security is what decides whose rows are read, and a website is checked to
 * be theirs before its notes are touched.
 */
export async function GET(request: Request) {
  const c = await memoryCaller(await createClient(), new URL(request.url).searchParams.get("installId"))
  if (c instanceof NextResponse) return c
  const { memories, ready } = await listMemories(c.db as MemoryDb, c.creatorId, undefined, { installId: c.installId })
  return NextResponse.json({ memories, ready }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  let body: { content?: unknown; installId?: unknown } | null = null
  try {
    body = (await request.json()) as { content?: unknown; installId?: unknown } | null
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const c = await memoryCaller(await createClient(), typeof body?.installId === "string" ? body.installId : null)
  if (c instanceof NextResponse) return c
  const kept = await addMemory(c.db as MemoryDb, c.creatorId, body?.content, "creator", { installId: c.installId })
  if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.notReady ? 503 : 400 })
  return NextResponse.json({ memory: kept.memory, duplicate: !!kept.duplicate })
}
