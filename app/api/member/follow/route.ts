import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 })

  let body: { userId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 })
  }
  const targetId = (body.userId || "").trim()
  if (!targetId || targetId === user.id) return NextResponse.json({ error: "Invalid user" }, { status: 400 })

  const admin = createAdminClient()
  const existing = await admin
    .from("profile_follows")
    .select("follower_id")
    .eq("follower_id", user.id)
    .eq("following_id", targetId)
    .maybeSingle()

  if (existing.error && !/profile_follows/.test(existing.error.message)) {
    return NextResponse.json({ error: "Follow is not available yet" }, { status: 503 })
  }

  if (existing.data) {
    await admin.from("profile_follows").delete().eq("follower_id", user.id).eq("following_id", targetId)
    return NextResponse.json({ following: false })
  }

  const ins = await admin.from("profile_follows").insert({ follower_id: user.id, following_id: targetId })
  if (ins.error) return NextResponse.json({ error: "Could not follow" }, { status: 503 })
  return NextResponse.json({ following: true })
}
