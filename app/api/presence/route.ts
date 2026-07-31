import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/presence — mark the caller as seen just now.
 *
 * The id comes from the session, never the body, so this can only ever update
 * the caller's own row. It writes through the admin client because a profile's
 * RLS update policy may legitimately be narrower than "any column"; the value
 * written is a server timestamp, not anything the client supplied.
 *
 * Fails soft in every direction — presence is decoration, and must never make a
 * page error or block a render.
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    const userId = data?.user?.id
    if (!userId) return NextResponse.json({ ok: false })

    const admin = createAdminClient()
    await admin.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", userId)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
