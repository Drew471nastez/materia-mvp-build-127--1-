import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { deleteMemory, type MemoryDb } from "@/lib/ai-memory/store"

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
