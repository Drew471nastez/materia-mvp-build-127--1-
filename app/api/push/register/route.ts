import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * POST /api/push/register
 * Saves (or updates) a device push token for the authenticated user.
 *
 * Body: { token: string, platform: "ios" | "android" }
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const { token, platform } = body as { token?: string; platform?: string }

  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }
  if (platform !== "ios" && platform !== "android") {
    return NextResponse.json({ error: "platform must be ios or android" }, { status: 400 })
  }

  const admin = createAdminClient()

  const { error } = await admin.from("push_tokens").upsert(
    {
      user_id: user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "token" }
  )

  if (error) {
    console.error("[push/register]", error.message)
    return NextResponse.json({ error: "Failed to save token" }, { status: 500 })
  }

  console.log(`[push/register] Saved ${platform} token for user ${user.id.slice(0, 8)}...`)
  return NextResponse.json({ ok: true })
}
