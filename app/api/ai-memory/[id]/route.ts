import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteMemory, replaceMemory, type MemoryDb } from "@/lib/ai-memory/store"
import { memoryCaller } from "../caller"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Forget one memory. Row level security makes another creator's id do
 * nothing. With `installId` (a website's note, or the chat's Undo) only a
 * note of that website; without, any of the creator's own.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const installId = new URL(request.url).searchParams.get("installId")
  const c = await memoryCaller(await createClient(), installId)
  if (c instanceof NextResponse) return c
  const ok = await deleteMemory(c.db as MemoryDb, c.creatorId, id, c.installId ? { installId: c.installId } : undefined)
  if (!ok) return NextResponse.json({ error: "That could not be deleted. Try again." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Correct one: the new words are kept and the old ones forgotten (lib/ai-memory/store.ts replaceMemory), in the same scope. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  let body: { content?: unknown; installId?: unknown } | null = null
  try {
    body = (await request.json()) as { content?: unknown; installId?: unknown } | null
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const c = await memoryCaller(await createClient(), typeof body?.installId === "string" ? body.installId : null)
  if (c instanceof NextResponse) return c
  const kept = await replaceMemory(c.db as MemoryDb, c.creatorId, id, body?.content, { installId: c.installId })
  if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.notReady ? 503 : 400 })
  return NextResponse.json({ memory: kept.memory, replaced: id, duplicate: !!kept.duplicate })
}
