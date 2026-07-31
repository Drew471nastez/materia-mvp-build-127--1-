import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"

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

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  if (searchParams.has("limit")) return legacyGet(supabase, user.id, searchParams)

  const { data: rows, error } = await supabase
    .from("notifications")
    .select("id, kind, actor_id, listing_id, conversation_id, created_at, read_at")
    .eq("user_id", user.id)
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

  let payload: { action?: string }
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "Bad body" }, { status: 400 })
  }
  if (payload?.action !== "read-all") return NextResponse.json({ error: "Bad action" }, { status: 400 })

  // Caller's client on purpose: RLS makes "all unread" mean "all of MY unread".
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
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
