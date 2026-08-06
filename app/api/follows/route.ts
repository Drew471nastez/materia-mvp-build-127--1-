import { after, type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createNotification } from "@/lib/notifications"
import { recordActivity } from "@/lib/push/activity-db"

/**
 * The follow graph.
 *
 *   GET    /api/follows           → { ids: string[] }  who the caller follows
 *   POST   /api/follows { userId }→ { following: true }
 *   DELETE /api/follows { userId }→ { following: false }
 *
 * Unlike the wishlist there is no guest mode: a follow is a relationship between
 * two accounts, so an anonymous caller gets 401 and the UI sends them to sign in.
 *
 * Every write goes through the caller's OWN client, never the admin client, so
 * row-level security is what enforces that follower_id is the caller. The id is
 * taken from the session rather than the body, so a forged body can't make one
 * account follow on another's behalf.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function currentUserId() {
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    return data?.user?.id || null
  } catch {
    return null
  }
}

async function targetFromBody(request: NextRequest): Promise<string | null> {
  try {
    const body = await request.json()
    const id = typeof body?.userId === "string" ? body.userId : null
    return id && UUID_RE.test(id) ? id : null
  } catch {
    return null
  }
}

export async function GET() {
  const userId = await currentUserId()
  // Signed out isn't an error here — you simply follow nobody yet. Returning 200
  // keeps the button from having to special-case anonymous visitors on read.
  if (!userId) return NextResponse.json({ ids: [] })

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", userId)
      .limit(5000)
    if (error) throw error
    return NextResponse.json({ ids: (data || []).map((r: any) => r.following_id).filter(Boolean) })
  } catch (e: any) {
    console.error("[follows] list failed:", e?.message || e)
    return NextResponse.json({ ids: [] })
  }
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const target = await targetFromBody(request)
  if (!target) return NextResponse.json({ error: "invalid_user" }, { status: 400 })
  if (target === userId) return NextResponse.json({ error: "cannot_follow_self" }, { status: 400 })

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("follows")
      // Idempotent, so a double-tap is a no-op rather than a unique violation.
      .upsert({ follower_id: userId, following_id: target }, { onConflict: "follower_id,following_id" })
    if (error) throw error
    // Tell the followed user; the helper swallows its own failures, so the
    // follow itself never breaks over a notification.
    await createNotification(createAdminClient(), { userId: target, kind: "follow", actorId: userId })

    // Queued, not sent. A follow becomes part of a digest hours later — see the
    // long note at the top of lib/push/activity-notification.ts. On `after()`
    // so the button does not wait for it, and the dedupe key means following,
    // unfollowing and following again queues nothing the second time.
    after(() => {
      void recordActivity({ kind: "follow", recipientId: target, actorId: userId }).catch((e) =>
        console.error("[push:activity] follow enqueue failed:", e?.message ?? e),
      )
    })

    return NextResponse.json({ following: true })
  } catch (e: any) {
    console.error("[follows] follow failed:", e?.message || e)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  const userId = await currentUserId()
  if (!userId) return NextResponse.json({ error: "auth_required" }, { status: 401 })

  const target = await targetFromBody(request)
  if (!target) return NextResponse.json({ error: "invalid_user" }, { status: 400 })

  try {
    const supabase = await createClient()
    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", userId)
      .eq("following_id", target)
    if (error) throw error
    return NextResponse.json({ following: false })
  } catch (e: any) {
    console.error("[follows] unfollow failed:", e?.message || e)
    return NextResponse.json({ error: "failed" }, { status: 500 })
  }
}
