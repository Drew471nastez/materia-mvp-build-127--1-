import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

// POST /api/website-builder/initialize
// Idempotently seeds the 3 built-in theme installs for the current creator.
export async function POST() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: creator } = await supabase
    .from("creators")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle()

  if (!creator) return NextResponse.json({ error: "Creator not found" }, { status: 404 })

  // Call the DB function — it's idempotent (no-op if already initialized)
  const { error } = await admin.rpc("initialize_creator_themes", {
    p_creator_id: creator.id,
  })

  if (error) {
    console.error("initialize_creator_themes error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
