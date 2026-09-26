import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { COVERS_PAYMENT_SETUP } from "@/lib/notifications/rules"
import { notExpiredFilter, pageOf, parseListParams } from "@/lib/notifications/center"

/**
 * ===========================================================================
 *  THE PANEL'S ROWS: WHAT NEEDS THE CREATOR FIRST, WHAT IS FIXED GONE
 * ===========================================================================
 * GET - Fetch notifications for the authenticated user
 * Query params:
 *   - limit: number (default 20)
 *   - before: an ISO time, the created_at of the last row shown: the next
 *     page, newest first, from there (lib/notifications/center.ts). Answers
 *     carry `hasMore` and `nextCursor`.
 *   - offset: number (default 0), for anything that still pages by offset
 *   - unread_only: boolean (default false)
 *   - summary: "1" answers { unreadCount, covered } and nothing else, for the
 *     count on the bell, which every /app page draws
 *     (lib/notifications/unread-state.ts)
 *
 * Once supabase/sql/run-now/29_notification_rules.sql has run, rows carry a
 * category (lib/notifications): the open critical ones, problems and the
 * next step come first whatever their age (a payout that failed a week ago
 * matters more than yesterday's coupon), then the rest newest first. A row
 * that resolved itself (payouts back on, the file added) is not returned:
 * it drops off. `covered` names the panel's own browser-made to-dos that an
 * open row already says better ("Set up payments" beside "Stripe paused
 * your payouts"), so the panel and the bell leave them out.
 *
 * With the notification engine's SQL (part 40) a row can carry expires_at:
 * once it has passed the row is not listed and not counted on the bell.
 *
 * Before that SQL the new columns are missing: the first read fails on them
 * and the route steps down to what the database has, down to exactly what
 * it always read.
 *
 * Everything is read with the signed in person's own client: row level
 * security decides, as before. Errors are logged by code, never returned.
 */

const LEGACY_COLUMNS = "id, type, title, message, action_url, product_id, review_id, metadata, read_at, dismissed_at, created_at"
const COLUMNS = `${LEGACY_COLUMNS}, kind, category, priority`
/** With the notification engine's SQL (part 40): when a row stops mattering. */
const EXPIRY_COLUMNS = `${COLUMNS}, expires_at`
/** Pinned above the rest, whatever their age: what needs the creator. */
const ATTENTION = ["critical", "problem", "next_step"]
const ATTENTION_LIMIT = 10

type PgError = { code?: string | null } | null | undefined

/** The engine's columns are not in this database yet (its SQL has not run). */
function missingColumns(error: PgError): boolean {
  const code = String(error?.code ?? "")
  return code === "42703" || code === "PGRST204" || code === "PGRST200"
}

const NO_STORE = { "Cache-Control": "private, no-store" }

/*
  WHAT THIS DATABASE HAS, most first: the engine's expiry and the rules
  engine's columns (expiry), the rules engine's columns only (engine), or
  neither (legacy). The first read that fails on a missing column steps down
  one and reads again, so every step works before its SQL has run.
*/
type Schema = "expiry" | "engine" | "legacy"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const { limit, offset, before, unreadOnly } = parseListParams(searchParams)
  const now = new Date().toISOString()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  /* Unread, not dismissed, not expired and (once the column exists) not resolved. */
  const countUnread = async (): Promise<number> => {
    const live = await supabase
      .from("seller_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("dismissed_at", null)
      .is("resolved_at", null)
      .or(notExpiredFilter(now))
    if (!live.error) return live.count || 0
    const open = await supabase
      .from("seller_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("dismissed_at", null)
      .is("resolved_at", null)
    if (!open.error) return open.count || 0
    const { count, error } = await supabase
      .from("seller_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("dismissed_at", null)
    return error ? 0 : count || 0
  }

  /* The browser-made to-dos an open row says better. */
  const coveredFor = async (): Promise<string[]> => {
    const { data, error } = await supabase
      .from("seller_notifications")
      .select("kind")
      .eq("user_id", user.id)
      .in("kind", [...COVERS_PAYMENT_SETUP])
      .is("resolved_at", null)
      .is("dismissed_at", null)
      .limit(1)
    return !error && (data ?? []).length > 0 ? ["payment-setup"] : []
  }

  if (searchParams.get("summary") === "1") {
    /* Before the table exists, or while it cannot be read: nothing unread. */
    const [unreadCount, covered] = await Promise.all([countUnread(), coveredFor()])
    return NextResponse.json({ unreadCount, covered }, { headers: NO_STORE })
  }

  let schema: Schema = "expiry"
  let notifications: Record<string, unknown>[] = []

  /* Newest first, one more than a page, so a full page knows another follows. */
  const recentQuery = (columns: string, withResolved: boolean, withExpiry: boolean) => {
    let q = supabase
      .from("seller_notifications")
      .select(columns)
      .eq("user_id", user.id)
      .is("dismissed_at", null) // Don't show dismissed notifications
    if (withResolved) q = q.is("resolved_at", null)
    if (withExpiry) q = q.or(notExpiredFilter(now))
    if (unreadOnly) q = q.is("read_at", null)
    if (before) return q.lt("created_at", before).order("created_at", { ascending: false }).limit(limit + 1)
    return q.order("created_at", { ascending: false }).range(offset, offset + limit)
  }

  /* What needs the creator, pinned above the rest: read beside the list, first page only. */
  const attentionQuery = (withExpiry: boolean) => {
    let q = supabase
      .from("seller_notifications")
      .select(withExpiry ? EXPIRY_COLUMNS : COLUMNS)
      .eq("user_id", user.id)
      .in("category", ATTENTION)
      .is("dismissed_at", null)
      .is("resolved_at", null)
    if (withExpiry) q = q.or(notExpiredFilter(now))
    if (unreadOnly) q = q.is("read_at", null)
    return q.order("priority", { ascending: false }).order("created_at", { ascending: false }).limit(ATTENTION_LIMIT)
  }

  const firstPage = !before && offset === 0
  let [recent, attention] = await Promise.all([recentQuery(EXPIRY_COLUMNS, true, true), firstPage ? attentionQuery(true) : Promise.resolve(null)])
  if (recent.error && missingColumns(recent.error)) {
    /* Before the notification engine's SQL: no expiry yet, the rest as it was. */
    schema = "engine"
    ;[recent, attention] = await Promise.all([recentQuery(COLUMNS, true, false), firstPage ? attentionQuery(false) : Promise.resolve(null)])
  }
  let more = { hasMore: false, nextCursor: null as string | null }
  if (recent.error && missingColumns(recent.error)) {
    /* Before the engine's SQL: exactly the list as it always was. */
    schema = "legacy"
    const legacy = await recentQuery(LEGACY_COLUMNS, false, false)
    if (legacy.error) {
      console.error(`[notifications] could not read notifications (${legacy.error.code ?? "unknown"})`)
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
    }
    const page = pageOf((legacy.data ?? []) as unknown as Record<string, string>[], limit)
    notifications = page.rows
    more = { hasMore: page.hasMore, nextCursor: page.nextCursor }
  } else if (recent.error) {
    console.error(`[notifications] could not read notifications (${recent.error.code ?? "unknown"})`)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  } else {
    const page = pageOf((recent.data ?? []) as unknown as Record<string, string>[], limit)
    const pinned = attention && !attention.error ? ((attention.data ?? []) as unknown as Record<string, unknown>[]) : []
    const seen = new Set(pinned.map((r) => r.id))
    notifications = [...pinned, ...page.rows.filter((r) => !seen.has(r.id))]
    more = { hasMore: page.hasMore, nextCursor: page.nextCursor }
  }

  const totalOpen = async (): Promise<number> => {
    let q = supabase.from("seller_notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).is("dismissed_at", null)
    if (schema !== "legacy") q = q.is("resolved_at", null)
    if (schema === "expiry") q = q.or(notExpiredFilter(now))
    const { count } = await q
    return count || 0
  }

  const [unreadCount, totalCount, covered] = await Promise.all([countUnread(), totalOpen(), schema !== "legacy" ? coveredFor() : Promise.resolve([] as string[])])

  return NextResponse.json(
    {
      notifications,
      unreadCount,
      totalCount,
      covered,
      hasMore: more.hasMore,
      nextCursor: more.nextCursor,
    },
    { headers: NO_STORE },
  )
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

  const body = await request.json().catch(() => null)
  const { ids, action } = body ?? {}

  if (!action || !["read", "dismiss", "read_all"].includes(action)) {
    return NextResponse.json({ error: "Invalid action. Must be 'read', 'dismiss', or 'read_all'" }, { status: 400 })
  }

  const now = new Date().toISOString()

  if (action === "read_all") {
    // Mark all unread notifications as read for this user: one statement,
    // scoped to the signed in user here and by row level security.
    const { error } = await supabase
      .from("seller_notifications")
      .update({ read_at: now })
      .eq("user_id", user.id)
      .is("read_at", null)
      .is("dismissed_at", null)

    if (error) {
      console.error(`[notifications] could not mark all as read (${error.code ?? "unknown"})`)
      return NextResponse.json({ error: "Failed to mark all as read" }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: "All notifications marked as read" })
  }

  if (!ids || !Array.isArray(ids) || ids.length === 0 || ids.length > 100 || !ids.every((id) => typeof id === "string" && id.length <= 64)) {
    return NextResponse.json({ error: "ids array is required" }, { status: 400 })
  }

  const updateData = action === "read" ? { read_at: now } : { dismissed_at: now }

  const { error } = await supabase
    .from("seller_notifications")
    .update(updateData)
    .eq("user_id", user.id)
    .in("id", ids)

  if (error) {
    console.error(`[notifications] could not update notifications (${error.code ?? "unknown"})`)
    return NextResponse.json({ error: "Failed to update notifications" }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: action === "read" ? "Notifications marked as read" : "Notifications dismissed",
    updatedIds: ids,
  })
}
