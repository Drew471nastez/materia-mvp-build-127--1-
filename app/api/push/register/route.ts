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
  console.log("[push/register] Request received")

  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  console.log("[push/register] Auth user:", user ? `id=${user.id.slice(0, 8)}... email=${user.email}` : "null", authError ? `authError=${authError.message}` : "")

  if (!user) {
    console.error("[push/register] Unauthorized — no session/cookie found")
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch((e: unknown) => {
    console.error("[push/register] Failed to parse JSON body:", e)
    return null
  })
  console.log("[push/register] Request body received, platform:", (body as { platform?: string })?.platform)

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

  console.log(`[push/register] Upserting ${platform} token for user ${user.id.slice(0, 8)}...`)

  const { data: upsertData, error } = await admin
    .from("push_tokens")
    .upsert(
      {
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" }
    )
    .select()

  if (error) {
    console.error("[push/register] Insert/upsert failed:", error.message, error.details, error.hint)
    return NextResponse.json({ error: "Failed to save token" }, { status: 500 })
  }

  console.log(`[push/register] Insert/upsert SUCCESS`)
  return NextResponse.json({ ok: true })
}
