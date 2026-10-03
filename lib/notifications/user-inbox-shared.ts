/**
 * ===========================================================================
 *  THE PERSON'S BELL: WHAT ONE ROW IS, IN TERMS THE BROWSER CAN READ
 * ===========================================================================
 * Shared by the server (lib/notifications/user-inbox.ts, /api/notifications)
 * and the bell (components/notifications/notification-bell.tsx), so both
 * sides agree on the kinds, the filters and how a row is drawn. Nothing in
 * here touches the database or the server, so a client component may import
 * it.
 *
 * Two tables feed one list: `community_notifications` (everything from the
 * communities a person joined, part 81) and `user_notifications` (everything
 * else, part 85: a new follower, a new product or community from somebody
 * they follow, a new post in a membership they pay for, a new product from a
 * creator they bought from).
 */

export const USER_NOTIFICATION_KINDS = [
  "new_follower",
  "followed_new_product",
  "followed_new_community",
  "membership_post",
  "purchased_creator_new_product",
  "system",
] as const
export type UserNotificationKind = (typeof USER_NOTIFICATION_KINDS)[number]

export const USER_NOTIFICATION_SOURCES = ["following", "purchases", "communities", "system"] as const
export type UserNotificationSource = (typeof USER_NOTIFICATION_SOURCES)[number]

/** The bell's filter menu, in its order. */
export const INBOX_FILTERS = [
  { key: "all", label: "All" },
  { key: "communities", label: "Communities" },
  { key: "following", label: "Following" },
  { key: "purchases", label: "Purchases" },
] as const
export type InboxFilter = (typeof INBOX_FILTERS)[number]["key"]

export function isInboxFilter(v: unknown): v is InboxFilter {
  return typeof v === "string" && INBOX_FILTERS.some((f) => f.key === v)
}

/** Rows per page of the bell. */
export const INBOX_PAGE_SIZE = 20

export interface InboxActor {
  name: string
  avatarUrl: string | null
}

/** One row of the bell, from either table. */
export interface InboxItem {
  id: string
  /** Which table it came from: "community" (community_notifications) or "user" (user_notifications). */
  from: "community" | "user"
  kind: string
  source: UserNotificationSource
  title: string
  body: string | null
  /** A path on storelib.com, or null when the row has nowhere to go. */
  url: string | null
  read: boolean
  createdAt: string
  actor: InboxActor | null
  /** What stands in for a face: a community's logo, a product's picture. */
  image: string | null
  /** The community a community row came from. */
  community: { name: string; slug: string } | null
}

export interface InboxPage {
  items: InboxItem[]
  unread: number
  nextCursor: string | null
  /** False when part 85 has not run yet: only community rows can be shown. */
  available: boolean
}

/** The bell's badge: the number, "99+" past 99, nothing at 0. */
export function badgeLabel(unread: number): string | null {
  if (!Number.isFinite(unread) || unread <= 0) return null
  return unread > 99 ? "99+" : String(Math.floor(unread))
}

/**
 * The actor's name in bold, the rest of the line plain, the way the title is
 * written ("Mara Pop published a new product"). A title that does not start
 * with the name is one plain line.
 */
export function splitTitle(title: string, actorName: string | null | undefined): { lead: string | null; rest: string } {
  const t = (title || "").trim()
  const name = (actorName || "").trim()
  if (name && t.length > name.length && t.toLowerCase().startsWith(name.toLowerCase())) {
    return { lead: t.slice(0, name.length), rest: t.slice(name.length) }
  }
  return { lead: null, rest: t }
}

/** Only a path on storelib.com is followed from a row; anything else is a row with no link. */
export function safeInboxUrl(url: unknown): string | null {
  if (typeof url !== "string") return null
  const u = url.trim()
  if (!u.startsWith("/") || u.startsWith("//") || u.startsWith("/\\") || u.length > 500) return null
  return u
}

/**
 * A timestamp as a key that sorts the way the database does, to the
 * microsecond. Postgres keeps microseconds and a JavaScript Date keeps
 * milliseconds, so two rows a few microseconds apart compare equal as
 * Dates; this keeps them apart, which keyset paging over two tables needs.
 */
export function timeKey(ts: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/.exec((ts || "").trim())
  if (!m) return "0".repeat(20)
  const zone = !m[4] || m[4] === "Z" ? "Z" : m[4].length === 3 ? `${m[4]}:00` : m[4].length === 5 ? `${m[4].slice(0, 3)}:${m[4].slice(3)}` : m[4]
  const ms = Date.parse(`${m[1]}T${m[2]}${zone}`)
  if (!Number.isFinite(ms)) return "0".repeat(20)
  /* Whole seconds since the epoch, then the six digits of the fraction: fixed width, so text order is time order. */
  return String(Math.floor(ms / 1000)).padStart(14, "0") + (m[3] || "").padEnd(6, "0")
}

/** Newest first on (created_at, id), the order both tables are read in. */
export function compareNewestFirst(a: { createdAt: string; id: string }, b: { createdAt: string; id: string }): number {
  const ka = timeKey(a.createdAt)
  const kb = timeKey(b.createdAt)
  if (ka !== kb) return ka < kb ? 1 : -1
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1
}
