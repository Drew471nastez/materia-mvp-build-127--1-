import { NextResponse } from "next/server"
import { pushRequestUser } from "@/lib/push/request-user"
import { createAdminClient } from "@/lib/supabase/admin"
import { maskEmail } from "@/lib/privacy/mask-email"

/**
 * POST /api/push/register
 * Saves (or updates) a device push token for the authenticated user.
 *
 * Body: { token: string, platform: "ios" | "android" }
 */
export async function POST(req: Request) {
  console.log("[push/register] Request received")

  /* The cookie, or the app's own access token when the web view's cookie is missing (lib/push/request-user.ts). */
  const { user, via, authError } = await pushRequestUser(req)

  console.log("[push/register] Auth user:", user ? `id=${user.id.slice(0, 8)}... email=${maskEmail(user.email)}${via === "bearer" ? " (bearer)" : ""}` : "null", authError ? `authError=${authError}` : "")

  if (!user) {
    console.error("[push/register] Unauthorized — no session cookie and no valid bearer token")
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
    /* The database's own words, so Settings' test can say which part is missing (scripts/060_create_push_tokens.sql, run-now 23). */
    return NextResponse.json({ error: "Failed to save token", detail: error.message }, { status: 500 })
  }

  console.log(`[push/register] Insert/upsert SUCCESS`)
  return NextResponse.json({ ok: true })
}
