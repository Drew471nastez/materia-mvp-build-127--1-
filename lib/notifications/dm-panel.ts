import "server-only"

/**
 * ===========================================================================
 *  MESSAGES IN THE /app PANEL (round BC)
 * ===========================================================================
 * The /app panel (components/app/notifications-modal.tsx) lists
 * seller_notifications; a message between members is a row in the
 * person's own inbox instead (user_notifications, kind "direct_message",
 * lib/notifications/dm-notify-shared.ts). So the panel is not a second copy
 * of it, app/api/notifications reads the same rows here: the unread ones
 * only, one per conversation, drawn as the panel's "Messages" rows (their type "message" is the word above the title, lib/notifications/panel.ts labelOf). Read in
 * one place, read everywhere; once read they leave the panel and stay in the
 * bell's history.
 *
 * Read and marked with the server's client for this person alone: the table
 * lets a signed in person read their rows but not change them. With
 * communities off the rows are left out (their links answer 404 then).
 * Before part 283 there are no such rows and every function here answers
 * empty.
 */
import { communitiesEnabled } from "@/lib/communities/flag"
import { admin, missing, reasonOf } from "@/lib/communities/server/db"
import { DM_NOTIFICATION_KIND } from "./dm-notify-shared"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** One row per conversation, so this many is already a lot of unread conversations. */
const PANEL_MAX = 30

/** A message row in the shape the panel reads (its DbNotification). */
export interface PanelMessageRow {
  id: string
  type: "message"
  title: string
  message: string
  action_url: string | null
  read_at: null
  created_at: string
  kind: typeof DM_NOTIFICATION_KIND
  category: null
  priority: null
}

export function panelMessageRow(r: { id: string; title: string; body: string | null; url: string | null; created_at: string }): PanelMessageRow {
  return {
    id: r.id,
    type: "message",
    title: r.title,
    message: r.body ?? "",
    action_url: r.url,
    read_at: null,
    created_at: r.created_at,
    kind: DM_NOTIFICATION_KIND,
    category: null,
    priority: null,
  }
}

/** The person's unread message rows, newest first. */
export async function panelMessages(userId: string): Promise<PanelMessageRow[]> {
  if (!UUID.test(userId) || !(await communitiesEnabled())) return []
  try {
    const { data, error } = await admin()
      .from("user_notifications")
      .select("id, title, body, url, created_at")
      .eq("user_id", userId)
      .eq("kind", DM_NOTIFICATION_KIND)
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(PANEL_MAX)
    if (error) {
      if (!missing(error)) console.error(`[notifications] panel messages: ${reasonOf(error)}`)
      return []
    }
    return ((data as { id: string; title: string; body: string | null; url: string | null; created_at: string }[] | null) ?? []).map(panelMessageRow)
  } catch {
    return []
  }
}

/** How many conversations wait to be read, for the panel's badge. */
export async function panelMessagesUnread(userId: string): Promise<number> {
  if (!UUID.test(userId) || !(await communitiesEnabled())) return 0
  try {
    const { count, error } = await admin().from("user_notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("kind", DM_NOTIFICATION_KIND).is("read_at", null)
    return error ? 0 : Math.min(PANEL_MAX, count ?? 0)
  } catch {
    return 0
  }
}

/** Marks this person's message rows read: the ids given (others' ids and other kinds are left alone), or all of them. Never throws. */
export async function readPanelMessages(userId: string, ids: readonly string[] | null): Promise<void> {
  if (!UUID.test(userId)) return
  const only = ids ? ids.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 100) : null
  if (only && only.length === 0) return
  try {
    let q = admin().from("user_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).eq("kind", DM_NOTIFICATION_KIND).is("read_at", null)
    if (only) q = q.in("id", only)
    const { error } = await q
    if (error && !missing(error)) console.error(`[notifications] panel messages read: ${reasonOf(error)}`)
  } catch {
    /* The row stays unread; the conversation opened marks it anyway. */
  }
}
