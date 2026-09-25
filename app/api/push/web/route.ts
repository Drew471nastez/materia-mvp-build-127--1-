import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { vapidKeys } from "@/lib/push/web-vapid"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * ===========================================================================
 *  NOTIFICATIONS ON THIS BROWSER (Settings, Privacy)
 * ===========================================================================
 *   GET     the public key a browser subscribes with, or 503 when this server
 *           has no way to sign pushes (lib/push/web-vapid)
 *   POST    { subscription } saves this browser for the signed in person
 *   DELETE  { endpoint } forgets it
 *
 * A browser's subscription is kept in push_tokens beside the phones' tokens,
 * as platform "web" with the subscription's JSON as its token, so the one
 * sender (lib/push/sender.ts) reaches phones and browsers alike, and a sale
 * notifies every place the person asked to hear about it.
 */

const NO_STORE = { "Cache-Control": "no-store" }

export async function GET() {
  const keys = vapidKeys()
  if (!keys) return NextResponse.json({ error: "Browser notifications are not set up on this server." }, { status: 503, headers: NO_STORE })
  return NextResponse.json({ publicKey: keys.publicKey }, { headers: NO_STORE })
}

type Subscription = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }

function valid(s: Subscription | null | undefined): s is { endpoint: string; keys: { p256dh: string; auth: string } } {
  return (
    !!s &&
    typeof s.endpoint === "string" &&
    /^https:\/\//.test(s.endpoint) &&
    s.endpoint.length < 2048 &&
    typeof s.keys?.p256dh === "string" &&
    typeof s.keys?.auth === "string"
  )
}

async function signedIn() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

export async function POST(req: Request) {
  const user = await signedIn()
  if (!user) return NextResponse.json({ error: "Sign in again to turn this on." }, { status: 401, headers: NO_STORE })
  const body = (await req.json().catch(() => null)) as { subscription?: Subscription } | null
  const sub = body?.subscription
  if (!valid(sub)) return NextResponse.json({ error: "That browser did not give a subscription." }, { status: 400, headers: NO_STORE })

  const token = JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } })
  const admin = createAdminClient()
  /* One row per browser: an older row for the same endpoint (keys rotated) goes first. */
  await admin.from("push_tokens").delete().eq("user_id", user.id).eq("platform", "web").like("token", `%${JSON.stringify(sub.endpoint).slice(1, -1)}%`)
  const { error } = await admin
    .from("push_tokens")
    .upsert({ user_id: user.id, token, platform: "web", updated_at: new Date().toISOString() }, { onConflict: "token" })
  if (error) {
    console.error(`[push/web] not saved (${error.code ?? "unknown"}): ${error.message}`)
    return NextResponse.json({ error: "Could not turn notifications on. Try again in a moment." }, { status: 500, headers: NO_STORE })
  }
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}

export async function DELETE(req: Request) {
  const user = await signedIn()
  if (!user) return NextResponse.json({ error: "Sign in again to change this." }, { status: 401, headers: NO_STORE })
  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint !== "string") return NextResponse.json({ error: "Missing endpoint" }, { status: 400, headers: NO_STORE })
  const { error } = await createAdminClient()
    .from("push_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("platform", "web")
    .like("token", `%${JSON.stringify(body.endpoint).slice(1, -1)}%`)
  if (error) return NextResponse.json({ error: "Could not turn notifications off. Try again in a moment." }, { status: 500, headers: NO_STORE })
  return NextResponse.json({ ok: true }, { headers: NO_STORE })
}
