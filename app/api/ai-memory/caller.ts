import { NextResponse } from "next/server"
import type { MemoryDb } from "@/lib/ai-memory/store"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* Only what is used here, so a test can pass a small fake of the creator's own client. */
type Client = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> }
  from: (table: string) => any // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Who is asking, and for which scope. A website is honoured only when it is
 * one of this creator's, read through their own client, so naming another
 * creator's website answers 404 rather than reading or writing its notes.
 */
export async function memoryCaller(
  supabase: Client,
  installId: string | null,
): Promise<{ db: MemoryDb; creatorId: string; installId: string | null } | NextResponse> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to continue." }, { status: 401 })
  const { data: creator } = await supabase.from("creators").select("id").eq("user_id", user.id).maybeSingle()
  if (!creator?.id) return NextResponse.json({ error: "Set up your store first." }, { status: 403 })
  if (installId) {
    if (!UUID.test(installId)) return NextResponse.json({ error: "Website not found." }, { status: 404 })
    const { data: install } = await supabase.from("store_theme_installs").select("id").eq("id", installId).eq("creator_id", creator.id).maybeSingle()
    if (!install) return NextResponse.json({ error: "Website not found." }, { status: 404 })
  }
  return { db: supabase as unknown as MemoryDb, creatorId: creator.id as string, installId: installId || null }
}
