import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * GET - Fetch notifications for the authenticated user
 * Query params:
 *   - limit: number (default 20)
 *   - offset: number (default 0)
 *   - unread_only: boolean (default false)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)

  const limit = Math.min(Number.parseInt(searchParams.get("limit") || "20"), 50)
  const offset = Number.parseInt(searchParams.get("offset") || "0")
  const unreadOnly = searchParams.get("unread_only") === "true"

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  // Fetch notifications for this user
  let query = supabase
    .from("seller_notifications")
    .select(`
      id,
      type,
      title,
      message,
      action_url,
      product_id,
      review_id,
      metadata,
      read_at,
      dismissed_at,
      created_at
    `)
    .eq("user_id", user.id)
    .is("dismissed_at", null) // Don't show dismissed notifications
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (unreadOnly) {
    query = query.is("read_at", null)
  }

  const { data: notifications, error } = await query

  if (error) {
    console.error("[notifications] Error fetching notifications:", error)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }

  // Get unread count
  const { count: unreadCount } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("read_at", null)
    .is("dismissed_at", null)

  // Get total count (non-dismissed)
  const { count: totalCount } = await supabase
    .from("seller_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .is("dismissed_at", null)

  return NextResponse.json({
    notifications: notifications || [],
    unreadCount: unreadCount || 0,
    totalCount: totalCount || 0,
    hasMore: offset + limit < (totalCount || 0),
  })
}

/**
 * PATCH - Mark notifications as read or dismissed
 * Body:
 *   - ids: string[] (notification IDs to update)
 *   - action: "read" | "dismiss" | "read_all"
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
    // Mark all unread notifications as read for this user
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
