import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addMemory, listMemories, type MemoryDb } from "@/lib/ai-memory/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * AI Memory: what Storelib AI keeps for a creator on every website
 * (lib/ai-memory/store.ts). Through the person's own client, never the
 * service role, so row level security is what decides whose rows are read.
 */
async function caller(): Promise<{ db: MemoryDb; creatorId: string } | NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return NextResponse.json({ error: "Set up your store first." }, { status: 403 })
  return { db: supabase as unknown as MemoryDb, creatorId: creator.id as string }
}

export async function GET() {
  const c = await caller()
  if (c instanceof NextResponse) return c
  const { memories, ready } = await listMemories(c.db, c.creatorId)
  return NextResponse.json({ memories, ready }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const c = await caller()
  if (c instanceof NextResponse) return c
  let content: unknown = null
  try {
    content = ((await request.json()) as { content?: unknown } | null)?.content
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const kept = await addMemory(c.db, c.creatorId, content, "creator")
  if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.notReady ? 503 : 400 })
  return NextResponse.json({ memory: kept.memory, duplicate: !!kept.duplicate })
}
