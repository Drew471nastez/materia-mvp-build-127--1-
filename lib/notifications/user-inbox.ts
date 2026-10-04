import "server-only"

/**
 * ===========================================================================
 *  THE PERSON'S INBOX, ON THE SERVER
 * ===========================================================================
 * notifyUser writes one row in `user_notifications` (part 85), the inbox for
 * everything that is not a community notification: a new follower, a new
 * product or community from somebody they follow, a new post in a membership
 * they pay for, a new product from a creator they bought from. Once per
 * dedupe key, so the same news told twice is one row; never about somebody's
 * own action; only ever a link to a path on storelib.com (the table refuses
 * anything else too).
 *
 * listInbox reads the bell: `community_notifications` (part 81) and
 * `user_notifications` merged into one list, newest first, paged with one
 * keyset cursor over both: (created_at, id) of the last row shown. Each table
 * is read for one more row than a page after the cursor, so the merged page
 * is exactly the newest rows of the two together, and a page boundary that
 * falls between rows of the same microsecond is still exact (the id breaks
 * the tie the same way in both tables and here).
 *
 * markRead marks some rows (by id, in either table) or all of them read.
 *
 * Before part 85 has run the user table is missing: notifyUser answers
 * "unavailable", and the bell shows community rows only. With communities
 * switched off, community rows (and a followed creator's new community) are
 * left out of the list and the count, because their links lead to pages that
 * answer 404 then. Nothing is deleted.
 */
import { missing, reasonOf, type Db } from "@/lib/communities/server/db"
import {
  INBOX_PAGE_SIZE,
  USER_NOTIFICATION_KINDS,
  USER_NOTIFICATION_SOURCES,
  compareNewestFirst,
  safeInboxUrl,
  type InboxActor,
  type InboxFilter,
  type InboxItem,
  type InboxPage,
  type UserNotificationKind,
  type UserNotificationSource,
} from "./user-inbox-shared"
import { pushSoon, pushUserRow } from "./push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** A timestamptz as PostgREST writes it. Kept as text, so the cursor keeps its microseconds. */
const STAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)?$/
const MAX_IDS = 100

export interface NotifyUserInput {
  userId: string
  kind: UserNotificationKind
  source: UserNotificationSource
  /** Who did it (their profile id). Never told about their own action. */
  actorId?: string | null
  /** The creator it is about (creators.id), for the creator's own reads later. */
  creatorId?: string | null
  title: string
  body?: string | null
  /** A path on storelib.com. */
  url: string
  imageUrl?: string | null
  /** Once per key: "product:<productId>:<userId>". */
  dedupeKey: string
}

export type NotifyUserOutcome = "sent" | "duplicate" | "skipped" | "unavailable"

/** The row as the table takes it, or null when it should not be written at all. */
export function userNotificationRow(n: NotifyUserInput): Record<string, unknown> | null {
  if (!n || typeof n.userId !== "string" || !UUID.test(n.userId)) return null
  if (n.actorId && n.actorId === n.userId) return null
  if (!(USER_NOTIFICATION_KINDS as readonly string[]).includes(n.kind)) return null
  if (!(USER_NOTIFICATION_SOURCES as readonly string[]).includes(n.source)) return null
  const url = safeInboxUrl(n.url)
  const key = typeof n.dedupeKey === "string" ? n.dedupeKey.trim().slice(0, 300) : ""
  if (!url || !key) return null
  const title = (n.title || "").replace(/\s+/g, " ").trim().slice(0, 200)
  const body = n.body ? n.body.replace(/\s+/g, " ").trim().slice(0, 500) : ""
  const image = typeof n.imageUrl === "string" && n.imageUrl.length <= 1000 && /^(https:\/\/|\/)/.test(n.imageUrl) && !n.imageUrl.startsWith("//") ? n.imageUrl : null
  return {
    user_id: n.userId,
    kind: n.kind,
    source: n.source,
    actor_id: n.actorId && UUID.test(n.actorId) ? n.actorId : null,
    creator_id: n.creatorId && UUID.test(n.creatorId) ? n.creatorId : null,
    title: title || "Storelib update",
    body: body || null,
    url,
    image_url: image,
    dedupe_key: key,
  }
}

/** One notification for one person. */
export async function notifyUser(db: Db, n: NotifyUserInput): Promise<NotifyUserOutcome> {
  const row = userNotificationRow(n)
  if (!row) return "skipped"
  try {
    const { data, error } = await db.from("user_notifications").upsert(row, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id")
    if (error) {
      if (missing(error)) return "unavailable"
      throw error
    }
    if (!(Array.isArray(data) && data.length > 0)) return "duplicate"
    /* A new row, never a duplicate: it may also reach their phone (lib/notifications/push-bridge.ts), after the response. */
    await pushSoon(() => pushUserRow(db, freshOf(row)))
    return "sent"
  } catch (e) {
    console.error(`[notifications] ${String(row.dedupe_key)}: ${reasonOf(e)}`)
    return "unavailable"
  }
}

/** A written row as the push bridge reads it. */
export interface FreshUserRow {
  userId: string
  kind: UserNotificationKind
  source: UserNotificationSource
  actorId: string | null
  title: string
  body: string | null
  url: string
  dedupeKey: string
}

function freshOf(row: Record<string, unknown>): FreshUserRow {
  return {
    userId: String(row.user_id),
    kind: row.kind as UserNotificationKind,
    source: row.source as UserNotificationSource,
    actorId: (row.actor_id as string | null) ?? null,
    title: String(row.title ?? ""),
    body: (row.body as string | null) ?? null,
    url: String(row.url ?? ""),
    dedupeKey: String(row.dedupe_key ?? ""),
  }
}

/**
 * Many at once, for the fan outs: one insert for the batch, once per key.
 * Answers how many rows were new and which ones (so a job can push those and
 * nobody else), or "unavailable" before part 85 (the table is not there).
 * Any other failure throws, so the job that called it is tried again later.
 */
export async function writeUserRows(db: Db, list: NotifyUserInput[]): Promise<{ wrote: number; fresh: FreshUserRow[] } | "unavailable"> {
  const seen = new Map<string, Record<string, unknown>>()
  for (const n of list) {
    const row = userNotificationRow(n)
    if (!row || seen.has(row.dedupe_key as string)) continue
    seen.set(row.dedupe_key as string, row)
  }
  if (seen.size === 0) return { wrote: 0, fresh: [] }
  const rows = [...seen.values()]
  const { data, error } = await db.from("user_notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id, dedupe_key")
  if (error) {
    if (missing(error)) return "unavailable"
    throw new Error(`user_notifications batch of ${rows.length}: ${reasonOf(error)}`)
  }
  const made = Array.isArray(data) ? (data as { id: string; dedupe_key?: string }[]) : []
  const fresh: FreshUserRow[] = []
  for (const r of made) {
    const row = r.dedupe_key ? seen.get(r.dedupe_key) : undefined
    if (row) fresh.push(freshOf(row))
  }
  return { wrote: made.length, fresh }
}

/** Many at once: how many rows were new, or "unavailable" before part 85. */
export async function notifyUsers(db: Db, list: NotifyUserInput[]): Promise<number | "unavailable"> {
  const out = await writeUserRows(db, list)
  return out === "unavailable" ? out : out.wrote
}

/* ── The bell's list ───────────────────────────────────────────────────── */

export interface InboxCursor {
  c: string
  i: string
}

export function encodeInboxCursor(row: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ c: row.createdAt, i: row.id })).toString("base64url")
}

export function decodeInboxCursor(raw: string | null | undefined): InboxCursor | null {
  if (!raw || typeof raw !== "string" || raw.length > 200) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    const c = typeof v.c === "string" && STAMP.test(v.c) ? v.c : ""
    const i = typeof v.i === "string" && UUID.test(v.i) ? v.i.toLowerCase() : ""
    return c && i ? { c, i } : null
  } catch {
    return null
  }
}

/** Which tables a filter reads, and which part of the user table. */
export function inboxPlan(filter: InboxFilter, communitiesOn: boolean): { community: boolean; user: boolean; source: UserNotificationSource | null } {
  if (filter === "communities") return { community: communitiesOn, user: communitiesOn, source: "communities" }
  if (filter === "following" || filter === "purchases") return { community: false, user: true, source: filter }
  return { community: communitiesOn, user: true, source: null }
}

interface CommunityRowLite {
  id: string
  community_id: string
  kind: string
  actor_id: string | null
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

interface UserRowLite {
  id: string
  kind: string
  source: string
  actor_id: string | null
  title: string
  body: string | null
  url: string | null
  image_url: string | null
  read_at: string | null
  created_at: string
}

/** Rows hidden while communities are off: their links answer 404 then. */
function hideCommunityRows(q: Db, communitiesOn: boolean): Db {
  if (communitiesOn) return q
  return q.neq("source", "communities").neq("kind", "followed_new_community")
}

/** Rows after the cursor in (created_at, id) order, newest first. A query builder in, the same builder out. */
function afterCursor(q: Db, cur: InboxCursor | null): Db {
  return cur ? q.or(`created_at.lt."${cur.c}",and(created_at.eq."${cur.c}",id.lt.${cur.i})`) : q
}

/**
 * One page of the bell, newest first over both tables, with the people's
 * names and photos and each community's name in one read each, and the
 * unread count.
 */
export async function listInbox(db: Db, o: { userId: string; filter: InboxFilter; cursor?: string | null; communitiesOn: boolean; limit?: number }): Promise<InboxPage> {
  const limit = Math.max(1, Math.min(50, o.limit ?? INBOX_PAGE_SIZE))
  const cur = decodeInboxCursor(o.cursor ?? null)
  const plan = inboxPlan(o.filter, o.communitiesOn)
  let available = true

  const readCommunity = async (): Promise<CommunityRowLite[]> => {
    if (!plan.community) return []
    const q = db.from("community_notifications").select("id, community_id, kind, actor_id, title, body, url, read_at, created_at").eq("user_id", o.userId)
    const { data, error } = await afterCursor(q, cur).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
    if (error) {
      if (!missing(error)) console.error(`[notifications] community rows: ${reasonOf(error)}`)
      return []
    }
    return (data as CommunityRowLite[] | null) ?? []
  }
  const readUser = async (): Promise<UserRowLite[]> => {
    if (!plan.user) return []
    let q = db.from("user_notifications").select("id, kind, source, actor_id, title, body, url, image_url, read_at, created_at").eq("user_id", o.userId)
    if (plan.source) q = q.eq("source", plan.source)
    q = hideCommunityRows(q, o.communitiesOn)
    const { data, error } = await afterCursor(q, cur).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1)
    if (error) {
      if (missing(error)) available = false
      else console.error(`[notifications] user rows: ${reasonOf(error)}`)
      return []
    }
    return (data as UserRowLite[] | null) ?? []
  }

  const [communityRows, userRows, unread] = await Promise.all([readCommunity(), readUser(), unreadCount(db, o.userId, o.communitiesOn)])

  type Raw = { createdAt: string; id: string; c?: CommunityRowLite; u?: UserRowLite }
  const merged: Raw[] = [
    ...communityRows.map((c) => ({ createdAt: c.created_at, id: c.id, c })),
    ...userRows.map((u) => ({ createdAt: u.created_at, id: u.id, u })),
  ].sort(compareNewestFirst)
  const page = merged.slice(0, limit)

  const actorIds = [...new Set(page.map((r) => (r.c ?? r.u)!.actor_id).filter((id): id is string => !!id && UUID.test(id)))]
  const communityIds = [...new Set(page.map((r) => r.c?.community_id).filter((id): id is string => !!id))]
  const [actors, communities] = await Promise.all([readActors(db, actorIds), readCommunities(db, communityIds)])

  const items: InboxItem[] = page.map((r) => {
    if (r.c) {
      const c = r.c
      const community = communities.get(c.community_id) ?? null
      const url = community ? safeInboxUrl(c.url) : null
      return {
        id: c.id,
        from: "community",
        kind: c.kind,
        source: "communities",
        title: c.title,
        body: c.body,
        url: url && community && url.startsWith(`/community/${community.slug}`) ? url : null,
        read: !!c.read_at,
        createdAt: c.created_at,
        actor: c.actor_id ? (actors.get(c.actor_id) ?? null) : null,
        image: community?.logoUrl ?? null,
        community: community ? { name: community.name, slug: community.slug } : null,
      }
    }
    const u = r.u!
    return {
      id: u.id,
      from: "user",
      kind: u.kind,
      source: (USER_NOTIFICATION_SOURCES as readonly string[]).includes(u.source) ? (u.source as UserNotificationSource) : "system",
      title: u.title,
      body: u.body,
      url: safeInboxUrl(u.url),
      read: !!u.read_at,
      createdAt: u.created_at,
      actor: u.actor_id ? (actors.get(u.actor_id) ?? null) : null,
      image: u.image_url,
      community: null,
    }
  })
  const last = page[page.length - 1]
  return { items, unread, nextCursor: merged.length > limit && last ? encodeInboxCursor(last) : null, available }
}

async function readActors(db: Db, ids: string[]): Promise<Map<string, InboxActor>> {
  const out = new Map<string, InboxActor>()
  if (!ids.length) return out
  const { data, error } = await db.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
  if (error) return out
  for (const p of (data as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] | null) ?? []) {
    out.set(p.id, { name: (p.display_name || p.username || "Someone").trim() || "Someone", avatarUrl: p.avatar_url })
  }
  return out
}

async function readCommunities(db: Db, ids: string[]): Promise<Map<string, { name: string; slug: string; logoUrl: string | null }>> {
  const out = new Map<string, { name: string; slug: string; logoUrl: string | null }>()
  if (!ids.length) return out
  const { data, error } = await db.from("communities").select("id, name, slug, logo_url").in("id", ids)
  if (error) return out
  for (const c of (data as { id: string; name: string; slug: string; logo_url: string | null }[] | null) ?? []) out.set(c.id, { name: c.name, slug: c.slug, logoUrl: c.logo_url })
  return out
}

/** Unread rows over both tables, counted on their partial indexes. */
export async function unreadCount(db: Db, userId: string, communitiesOn: boolean): Promise<number> {
  const count = async (table: "community_notifications" | "user_notifications"): Promise<number> => {
    try {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("user_id", userId).is("read_at", null)
      if (table === "user_notifications") q = hideCommunityRows(q, communitiesOn)
      const { count: n, error } = await q
      return error ? 0 : (n ?? 0)
    } catch {
      return 0
    }
  }
  const [c, u] = await Promise.all([communitiesOn ? count("community_notifications") : Promise.resolve(0), count("user_notifications")])
  return c + u
}

/**
 * Marks rows read: some (their ids, from either table, at most 100) or all.
 * Only the caller's own rows are touched. Answers the unread count after.
 */
export async function markRead(db: Db, o: { userId: string; ids?: string[] | null; all?: boolean; communitiesOn: boolean }): Promise<number> {
  const ids = o.all ? null : [...new Set((o.ids ?? []).filter((id) => typeof id === "string" && UUID.test(id)).map((id) => id.toLowerCase()))].slice(0, MAX_IDS)
  if (!o.all && (!ids || ids.length === 0)) return unreadCount(db, o.userId, o.communitiesOn)
  const now = new Date().toISOString()
  const mark = async (table: "community_notifications" | "user_notifications") => {
    let q = db.from(table).update({ read_at: now }).eq("user_id", o.userId).is("read_at", null)
    if (ids) q = q.in("id", ids)
    const { error } = await q
    if (error && !missing(error)) console.error(`[notifications] mark ${table}: ${reasonOf(error)}`)
  }
  /* Community rows are marked even while communities are off: a person who asked for all read means all. */
  await Promise.all([mark("community_notifications"), mark("user_notifications")])
  return unreadCount(db, o.userId, o.communitiesOn)
}

/** When the person last opened the bell (profiles.notifications_seen_at, private). Never throws. */
export async function markSeen(db: Db, userId: string): Promise<void> {
  try {
    const { error } = await db.from("profiles").update({ notifications_seen_at: new Date().toISOString() }).eq("id", userId)
    if (error && !missing(error)) console.error(`[notifications] seen: ${reasonOf(error)}`)
  } catch {
    /* Only a record; the bell works without it. */
  }
}
