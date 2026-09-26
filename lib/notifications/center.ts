/**
 * ===========================================================================
 *  THE NOTIFICATION CENTER'S PAGES, EXPIRY, PRIORITY AND TIME
 * ===========================================================================
 * app/api/notifications/route.ts pages the list and leaves out what has
 * expired; components/app/notifications-modal.tsx appends the next page,
 * shows how much a row matters and says when it happened. The decisions
 * are here, pure, so tests/notify-center.test.ts can hold them.
 *
 *   PAGES     newest first, 20 at a time. The next page is asked for with
 *             `before`, the created_at of the last row shown, so a row
 *             dismissed or arriving meanwhile never shifts a page (an
 *             offset would skip one or show one twice). `offset` still
 *             works for anything that sends it. A page that came back full
 *             says there may be more; the panel asks when its foot shows.
 *   EXPIRY    a row whose expires_at has passed is gone: not listed, not
 *             counted on the bell. The server filters; the panel drops one
 *             that expires while it is open.
 *   PRIORITY  a row the notification engine (lib/notify) wrote names its
 *             type (metadata.notification_type); its priority is the
 *             registry's for that type, or one written in metadata.priority.
 *             Critical is the small red dot, important the amber one, the
 *             same marks the older rules engine's critical and problem rows
 *             have. Nothing louder.
 *   TIME      "Just now", "12m ago", "3h ago", "Yesterday", then the date.
 */
import { REGISTRY } from "@/lib/notify/registry"
import { NOTIFICATION_TYPES, type NotificationType, type Priority } from "@/lib/notify/types"

export const PAGE_SIZE = 20
export const MAX_PAGE = 50

export interface ListParams {
  limit: number
  offset: number
  /** An ISO time: rows created before it. */
  before: string | null
  unreadOnly: boolean
  summary: boolean
}

export function parseListParams(sp: URLSearchParams): ListParams {
  const limit = Math.max(1, Math.min(Number.parseInt(sp.get("limit") || String(PAGE_SIZE)) || PAGE_SIZE, MAX_PAGE))
  const offset = Math.max(0, Number.parseInt(sp.get("offset") || "0") || 0)
  const raw = sp.get("before")
  const t = raw && raw.length <= 40 ? Date.parse(raw) : Number.NaN
  return {
    limit,
    offset,
    before: Number.isFinite(t) ? new Date(t).toISOString() : null,
    unreadOnly: sp.get("unread_only") === "true",
    summary: sp.get("summary") === "1",
  }
}

/** The PostgREST `or` that keeps rows with no expiry or one still ahead. */
export function notExpiredFilter(nowIso: string): string {
  return `expires_at.is.null,expires_at.gt.${nowIso}`
}

export function isExpired(row: { expires_at?: string | null }, now = Date.now()): boolean {
  if (!row.expires_at) return false
  const t = Date.parse(row.expires_at)
  return Number.isFinite(t) && t <= now
}

/**
 * One page from the server: `limit` rows were asked for and `limit + 1`
 * read, so a full page knows whether another follows. The cursor is the
 * last kept row's created_at.
 */
export function pageOf<T extends { created_at?: string | null }>(rows: readonly T[], limit: number): { rows: T[]; hasMore: boolean; nextCursor: string | null } {
  const kept = rows.slice(0, limit)
  const hasMore = rows.length > limit
  const last = kept[kept.length - 1]
  return { rows: kept, hasMore, nextCursor: hasMore && last?.created_at ? last.created_at : null }
}

/** The next page appended to what is shown: a row already there is kept as it is (it may have been read here). */
export function mergePage<T extends { id: string }>(shown: readonly T[], next: readonly T[]): T[] {
  const seen = new Set(shown.map((r) => r.id))
  return [...shown, ...next.filter((r) => !seen.has(r.id))]
}

/** The oldest created_at in a list: where the next page starts. */
export function oldestOf(rows: readonly { created_at?: string | null }[]): string | null {
  let min: string | null = null
  for (const r of rows) if (r.created_at && (!min || Date.parse(r.created_at) < Date.parse(min))) min = r.created_at
  return min
}

export type Level = "critical" | "important"

const PRIORITIES: readonly Priority[] = ["info", "normal", "important", "critical"]

/** The engine's notification type, when the row is one of its own (metadata.notification_type, or its kind). */
export function engineTypeOf(row: { kind?: string | null; metadata?: Record<string, unknown> | null }): NotificationType | null {
  for (const v of [row.metadata?.notification_type, row.kind]) {
    if (typeof v === "string" && (NOTIFICATION_TYPES as readonly string[]).includes(v)) return v as NotificationType
  }
  return null
}

/**
 * How much an engine row matters: a priority written in its metadata, else
 * the registry's for its type. A row that is not the engine's says nothing
 * here (its category already does).
 */
export function levelOf(row: { kind?: string | null; metadata?: Record<string, unknown> | null }): Level | null {
  const written = row.metadata?.priority
  const type = engineTypeOf(row)
  const p = typeof written === "string" && (PRIORITIES as readonly string[]).includes(written) ? written : type ? REGISTRY[type]?.priority : null
  return p === "critical" ? "critical" : p === "important" ? "important" : null
}

/** "Just now", "12m ago", "3h ago", "Yesterday", "Sep 11", "Sep 11, 2025". */
export function relativeTime(date: Date, now: Date = new Date()): string | null {
  const t = date.getTime()
  if (!t) return null
  const seconds = Math.max(0, Math.round((now.getTime() - t) / 1000))
  if (seconds < 60) return "Just now"
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOf(now) - startOf(date)) / 86_400_000)
  if (days === 0) return `${Math.floor(minutes / 60)}h ago`
  if (days === 1) return "Yesterday"
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  })
}
