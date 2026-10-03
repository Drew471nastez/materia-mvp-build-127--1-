import "server-only"

/**
 * ===========================================================================
 *  @SOMEBODY AND @EVERYONE
 * ===========================================================================
 * A post or a comment names people by their Storelib username. Each name is
 * looked up once (one read for all of them, at most MAX_MENTIONS_PER_POST),
 * kept only when that person is an active member here, and told with one
 * notification keyed to the post or comment, so an edit that keeps the
 * mention never tells them twice.
 *
 * @everyone is only for a role with mention_everyone (can() decides, the
 * route refuses anyone else). It is too many people for one request, so it
 * becomes a fanout_announcement job (jobs/fanout_announcement.ts) that
 * writes the inbox rows a page of members at a time.
 */
import { extractMentions, mentionsEveryone } from "../limits"
import { can } from "../permissions"
import type { Role } from "../types"
import { missing, reasonOf, type Db } from "./db"
import { notifyMember, queueJob } from "./notify"

/** The user ids of the active members these usernames belong to. */
export async function resolveMentions(db: Db, communityId: string, usernames: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const names = [...new Set(usernames.map((u) => u.toLowerCase()))].filter((u) => /^[a-z0-9_.-]{1,40}$/.test(u))
  if (!names.length) return out
  try {
    const { data, error } = await db.from("profiles").select("id, username").in("username", names)
    if (error) {
      if (!missing(error)) console.error(`[communities] mentions: ${reasonOf(error)}`)
      return out
    }
    const people = ((data as { id: string; username: string | null }[] | null) ?? []).filter((p) => p.username)
    if (!people.length) return out
    const { data: members } = await db
      .from("community_members")
      .select("user_id")
      .eq("community_id", communityId)
      .eq("status", "active")
      .in(
        "user_id",
        people.map((p) => p.id),
      )
    const active = new Set(((members as { user_id: string }[] | null) ?? []).map((m) => m.user_id))
    for (const p of people) if (active.has(p.id)) out.set(String(p.username).toLowerCase(), p.id)
  } catch (e) {
    console.error(`[communities] mentions: ${reasonOf(e)}`)
  }
  return out
}

/** Whether this text may be sent by this role: @everyone needs mention_everyone. */
export function everyoneAllowed(text: string, role: Role | null): boolean {
  return !mentionsEveryone(text) || can(role, "mention_everyone")
}

export interface MentionSource {
  communityId: string
  communitySlug: string
  communityName: string
  actorId: string
  actorName: string
  /** "post" or "comment". */
  targetType: "post" | "comment"
  targetId: string
  postId: string
  text: string
  /** People already told about this (the post's author for a comment, a reply's parent): not told twice. */
  skip?: string[]
}

/** Tells every member named in the text. Returns who was told. */
export async function notifyMentions(db: Db, m: MentionSource): Promise<string[]> {
  const names = extractMentions(m.text)
  if (!names.length) return []
  const found = await resolveMentions(db, m.communityId, names)
  const told: string[] = []
  const skip = new Set([m.actorId, ...(m.skip ?? [])])
  for (const userId of new Set(found.values())) {
    if (skip.has(userId)) continue
    const outcome = await notifyMember(db, {
      userId,
      communityId: m.communityId,
      kind: "mention",
      actorId: m.actorId,
      target: { type: m.targetType, id: m.targetId },
      title: `${m.actorName} mentioned you`,
      body: snippet(m.text),
      url: `/community/${m.communitySlug}/post/${m.postId}${m.targetType === "comment" ? `#c-${m.targetId}` : ""}`,
      dedupeKey: `mention:${m.targetType}:${m.targetId}:${userId}`,
    })
    if (outcome === "sent") told.push(userId)
  }
  return told
}

/** Queues the fan out that tells every member about an announcement or an @everyone. */
export async function queueEveryone(db: Db, p: { communityId: string; postId: string; actorId: string; reason: "announcement" | "everyone" }): Promise<string> {
  return queueJob(db, {
    kind: "fanout_announcement",
    payload: { communityId: p.communityId, postId: p.postId, actorId: p.actorId, reason: p.reason, after: null },
    idempotencyKey: `fanout_announcement:${p.postId}`,
  })
}

/** One line of a text for a notification, at most 140 characters. */
export function snippet(text: string, max = 140): string {
  const t = (text || "").replace(/\s+/g, " ").trim()
  return t.length <= max ? t : `${t.slice(0, max - 3).trimEnd()}...`
}

/* ── The member's inbox ────────────────────────────────────────────────── */

export const INBOX_PAGE = 30

interface NotificationRowLite {
  id: string
  kind: string
  actor_id: string | null
  title: string
  body: string | null
  url: string | null
  read_at: string | null
  created_at: string
}

/** Only a path inside this community is kept as a notification's link. */
export function inboxUrl(url: string | null, slug: string): string | null {
  if (!url || typeof url !== "string") return null
  return url.startsWith(`/community/${slug}`) ? url : null
}

/**
 * A page of the member's notifications in this community, newest first on
 * (created_at, id), with the actors' names in one read, and the unread count.
 */
export async function listNotifications(
  db: Db,
  community: { id: string; slug: string },
  userId: string,
  cursor: string | null,
): Promise<{ notifications: import("@/components/community/member/view-types").NotificationView[]; unread: number; nextCursor: string | null }> {
  const none = { notifications: [], unread: 0, nextCursor: null }
  try {
    let q = db.from("community_notifications").select("id, kind, actor_id, title, body, url, read_at, created_at").eq("user_id", userId).eq("community_id", community.id)
    const cur = decodeInboxCursor(cursor)
    if (cur) q = q.or(`created_at.lt."${cur.c}",and(created_at.eq."${cur.c}",id.lt.${cur.i})`)
    const [{ data, error }, unread] = await Promise.all([
      q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(INBOX_PAGE + 1),
      unreadNotificationCount(db, community.id, userId),
    ])
    if (error) {
      if (!missing(error)) console.error(`[communities] inbox read: ${reasonOf(error)}`)
      return none
    }
    const rows = (data as NotificationRowLite[] | null) ?? []
    const page = rows.slice(0, INBOX_PAGE)
    const actorIds = [...new Set(page.map((r) => r.actor_id).filter((id): id is string => !!id))]
    const actors = new Map<string, { name: string; avatarUrl: string | null }>()
    if (actorIds.length) {
      const { data: people } = await db.from("profiles").select("id, username, display_name, avatar_url").in("id", actorIds)
      for (const p of (people as { id: string; username: string | null; display_name: string | null; avatar_url: string | null }[] | null) ?? []) {
        actors.set(p.id, { name: (p.display_name || p.username || "Member").trim() || "Member", avatarUrl: p.avatar_url })
      }
    }
    const last = page[page.length - 1]
    return {
      notifications: page.map((r) => ({
        id: r.id,
        kind: r.kind,
        title: r.title,
        body: r.body,
        url: inboxUrl(r.url, community.slug),
        read: !!r.read_at,
        createdAt: r.created_at,
        actor: r.actor_id ? (actors.get(r.actor_id) ?? null) : null,
      })),
      unread,
      nextCursor: rows.length > INBOX_PAGE && last ? Buffer.from(JSON.stringify({ c: last.created_at, i: last.id })).toString("base64url") : null,
    }
  } catch (e) {
    console.error(`[communities] inbox read: ${reasonOf(e)}`)
    return none
  }
}

function decodeInboxCursor(raw: string | null): { c: string; i: string } | null {
  if (!raw || raw.length > 300) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Record<string, unknown>
    const c = typeof v.c === "string" && Number.isFinite(Date.parse(v.c)) ? new Date(v.c).toISOString() : ""
    const i = typeof v.i === "string" && /^[0-9a-f-]{36}$/i.test(v.i) ? v.i : ""
    return c && i ? { c, i } : null
  } catch {
    return null
  }
}

/** Unread notifications in this community, counted on the partial index. */
export async function unreadNotificationCount(db: Db, communityId: string, userId: string): Promise<number> {
  try {
    const { count, error } = await db
      .from("community_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("community_id", communityId)
      .is("read_at", null)
    return error ? 0 : (count ?? 0)
  } catch {
    return 0
  }
}

/** Marks some (their ids) or all of the member's notifications here read. */
export async function markNotificationsRead(db: Db, communityId: string, userId: string, which: "all" | string[]): Promise<number> {
  let q = db.from("community_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId).eq("community_id", communityId).is("read_at", null)
  if (which !== "all") {
    const ids = which.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 100)
    if (!ids.length) return unreadNotificationCount(db, communityId, userId)
    q = q.in("id", ids)
  }
  const { error } = await q
  if (error && !missing(error)) console.error(`[communities] inbox mark: ${reasonOf(error)}`)
  return unreadNotificationCount(db, communityId, userId)
}
