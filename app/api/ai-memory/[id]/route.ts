import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteMemory, replaceMemory, type MemoryDb } from "@/lib/ai-memory/store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Forget one memory. Row level security makes another creator's id do nothing. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return NextResponse.json({ error: "Set up your store first." }, { status: 403 })
  const ok = await deleteMemory(supabase as unknown as MemoryDb, creator.id as string, id)
  if (!ok) return NextResponse.json({ error: "That could not be deleted. Try again." }, { status: 500 })
  return NextResponse.json({ ok: true })
}

/** Correct one: the new words are kept and the old ones forgotten (lib/ai-memory/store.ts replaceMemory). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  let content: unknown = null
  try {
    content = ((await request.json()) as { content?: unknown } | null)?.content
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 })
  }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return NextResponse.json({ error: "Set up your store first." }, { status: 403 })
  const kept = await replaceMemory(supabase as unknown as MemoryDb, creator.id as string, id, content)
  if (!kept.ok) return NextResponse.json({ error: kept.error }, { status: kept.notReady ? 503 : 400 })
  return NextResponse.json({ memory: kept.memory, replaced: id, duplicate: !!kept.duplicate })
}
