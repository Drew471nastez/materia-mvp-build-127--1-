import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readSessionAuth } from "@/lib/auth/current-user"

/**
 * The notifications feed behind the inbox's second tab.
 *
 *   GET  /api/notifications                        → { notifications: [...] } latest 50
 *   POST /api/notifications { action: "read-all" } → { ok: true }
 *
 * Reads and the read-all write run on the caller's own client so RLS is the
 * scoping — you can only ever see or touch your own rows. The admin client
 * appears only to decorate rows with actor and listing fields the caller has
 * no direct SELECT path to. Inserts never happen here: they come from trusted
 * server code through lib/notifications, and the table has no insert policy.
 *
 * GET keeps a legacy mode. The creator dashboard's notifications modal calls
 * this same path with ?limit= against the older seller_notifications table,
 * and that modal is not part of this feature's surface — so a limit param
 * routes to the old behavior, and a bare GET serves the marketplace feed.
 * PATCH below exists solely for that same legacy modal.
 */

/**
 * DELETE /api/notifications        → clear the whole feed
 * DELETE /api/notifications?id=…   → dismiss one
 *
 * On the caller's own client, so RLS is what limits it to their rows — a delete
 * naming somebody else's id simply matches nothing.
 *
 * NOT WIRED TO ANYTHING in the app, deliberately, and worth reading before it
 * is. The `notifications` table has row-level security enabled with a select
 * policy and an update policy and no DELETE policy, which means these
 * statements match zero rows, raise no error, and return `{ ok: true }` over
 * rows that are all still there. That is what made "delete notification" appear
 * to work and undo itself on the next load.
 *
 * The feed marks read instead (POST below), which is both what Depop and Vinted
 * do and what the current policies actually permit. This handler stays for a
 * future moderation or account-deletion path, and the delete policy that would
 * make it real is in supabase/sql/RUN_MESSAGING_ALL.sql — until that has run,
 * calling this is a no-op that says otherwise.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const auth = await readSessionAuth(supabase)
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "Auth unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const id = new URL(request.url).searchParams.get("id")
  const q = supabase.from("notifications").delete().eq("user_id", auth.userId)
  const { error } = id ? await q.eq("id", id) : await q
  if (error) {
    console.error("[notifications] delete failed:", error.message)
    return NextResponse.json({ error: "Could not clear" }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  // Both shapes of this read — the marketplace feed below and the legacy seller
  // list — run entirely on the caller's client, so RLS on notifications and
  // seller_notifications is what restricts the rows and the id is the filter it
  // already enforces. The admin client is only used afterwards to decorate
  // actors and listings whose ids came out of those RLS-scoped rows.
  const auth = await readSessionAuth(supabase)
  if (auth.status === "indeterminate") {
    return NextResponse.json({ error: "Auth unavailable" }, { status: 503 })
  }
  if (!auth.userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  if (searchParams.has("limit")) return legacyGet(supabase, auth.userId, searchParams)

  // Thirty days, and no further.
  //
  // A notification is a nudge about something that just happened, and it stops
  // being that within about a week — "somebody followed you" from March is not
  // news, it is an archive nobody asked for. Depop and Vinted both cut theirs;
  // an infinite list is a screen that only ever gets slower and less useful, and
  // the thing it is telling you about (the follow, the offer, the message) still
  // exists on its own screen where it belongs.
  //
  // Applied as a read filter rather than a delete, so nothing is destroyed and
  // the window can be widened again by changing one number.
  const horizon = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, kind, actor_id, listing_id, conversation_id, created_at, read_at")
    .eq("user_id", auth.userId)
    .gte("created_at", horizon)
    .order("created_at", { ascending: false })
    .limit(50)
  // A missing table (migration not yet run) reads as an empty feed, not a 500 —
  // the tab should degrade to its empty state, never to an error screen.
  if (error) {
    console.error("[notifications] list failed:", error.message)
    return NextResponse.json({ notifications: [] })
  }
  if (!rows?.length) return NextResponse.json({ notifications: [] })

  const admin = createAdminClient()
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[]
  const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))] as string[]
  const [actorsRes, listingsRes] = await Promise.all([
    actorIds.length
      ? admin.from("profiles").select("id, display_name, username, avatar_url").in("id", actorIds)
      : Promise.resolve({ data: [] as any[] }),
    listingIds.length
      ? admin.from("products").select("id, title, slug, thumbnail_url").in("id", listingIds)
      : Promise.resolve({ data: [] as any[] }),
  ])
  const actors = new Map((actorsRes.data ?? []).map((p: any) => [p.id, p]))
  const listings = new Map((listingsRes.data ?? []).map((l: any) => [l.id, l]))

  return NextResponse.json({
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      createdAt: r.created_at,
      readAt: r.read_at,
      conversationId: r.conversation_id,
      actor: (r.actor_id && actors.get(r.actor_id)) || null,
      listing: (r.listing_id && listings.get(r.listing_id)) || null,
    })),
  })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  let payload: { action?: string; id?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }

  const now = new Date().toISOString()

  // Marking ONE read — what tapping a notification does.
  //
  // This is the write the feed is actually built on now. Dismissing used to be a
  // DELETE, and the table has RLS enabled with select and update policies and no
  // delete policy, so every one of those statements matched nothing, raised
  // nothing, and reported success over a row that was still there. Read is an
  // UPDATE, which the existing `notifications_update` policy allows, so it works
  // on the schema as it stands rather than on the schema somebody has to
  // remember to migrate to.
  if (payload?.action === "read") {
    const id = typeof payload.id === "string" ? payload.id : ""
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 })
    // The user_id filter is belt to RLS's braces: the policy already restricts
    // this to the caller's rows, so naming somebody else's id updates nothing.
    const { error } = await supabase
      .from("notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .eq("id", id)
      .is("read_at", null)
    if (error) console.error("[notifications] read failed:", error.message)
    return NextResponse.json({ ok: true })
  }

  if (payload?.action !== "read-all") return NextResponse.json({ error: "Bad action" }, { status: 400 })

  // Caller's client on purpose: RLS makes "all unread" mean "all of MY unread".
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: now })
    .eq("user_id", user.id)
    .is("read_at", null)
  if (error) console.error("[notifications] read-all failed:", error.message)

  return NextResponse.json({ ok: true })
}

/**
 * The pre-existing seller_notifications read, kept verbatim in behavior so the
 * dashboard modal keeps working while it still points at this path.
 */
async function legacyGet(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, searchParams: URLSearchParams) {
  const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20"), 50)
  const offset = Number.parseInt(searchParams.get("offset") || "0")
  const unreadOnly = searchParams.get("unread_only") === "true"

  let query = supabase
    .from("seller_notifications")
    .select("id, type, title, message, action_url, product_id, review_id, metadata, read_at, dismissed_at, created_at")
    .eq("user_id", userId)
    .is("dismissed_at", null)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)
  if (unreadOnly) query = query.is("read_at", null)

  const { data: notifications, error } = await query
  if (error) {
    console.error("[notifications] Error fetching notifications:", error)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }

  const { count: unreadCount } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null)
    .is("dismissed_at", null)

  const { count: totalCount } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("dismissed_at", null)

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount: unreadCount || 0,
    totalCount: totalCount || 0,
    hasMore: offset + limit < (totalCount || 0),
  })
}

/**
 * PATCH - Mark seller_notifications read or dismissed (legacy dashboard modal).
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const body = await request.json()
  const { ids, action } = body

  if (!action || !["read", "dismiss", "read_all"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Must be 'read', 'dismiss', or 'read_all'" }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === "read_all") {
    const { error } = await supabase
      .from("seller_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null)

    if (error) {
      console.error("[notifications] Error marking all as read:", error)
      return NextResponse.json({ error: "Failed to mark all as read" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "All notifications marked as read" })
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 })
  }

  const updateData = action === "read" ? { read_at: now } : { dismissed_at: now }

  const { error } = await supabase
    .from("seller_notifications")
    .update(updateData)
    .eq("user_id", user.id)
    .in("id", ids)

  if (error) {
    console.error("[notifications] Error updating notifications:", error)
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: action === "read" ? "Notifications marked as read" : "Notifications dismissed",
    updatedIds: ids,
  })
}
