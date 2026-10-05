import "server-only"

/**
 * THE WEEKLY COMMUNITY DIGEST: one email a week, only for someone who turned
 * it on in Settings, Notifications (push-kinds.ts emailOn "weekly_digest"),
 * about all their communities at once. It rides the push_digest kind with
 * payload { weekly: true, userId, week } (the queue's kinds are fixed in
 * SQL), handled from jobs/push_digest.ts. Turning it on queues the first one
 * (notify.ts scheduleWeeklyDigest); each one queues the next before it ends,
 * so nothing ever scans every account to find who asked.
 *
 * Read again when it runs: still asked for, the footer's unsubscribe link
 * not used since (notification_preferences "tips" email off ends it too),
 * an address on the account. Then per community, at most WEEKLY_COMMUNITIES
 * of the ones they are active in, the ones they visited last first: the
 * week's published posts (a count and the most liked), and the events in the
 * week ahead. Only communities with something new are in it, busiest first;
 * a week with nothing anywhere sends nothing (and the next week is still
 * queued). The email goes through the notification engine like every other
 * (community.weekly_digest, once per person and week), where the email list
 * and the account's daily cap apply (lib/notify/email-budget.ts).
 */
import { communitiesEnabled } from "../../flag"
import { nowIso, reasonOf, type Db } from "../db"
import { storeOf } from "@/lib/notify/store"
import { readChoice } from "@/lib/notifications/push-bridge"
import { nextWeeklyDigest } from "@/lib/notifications/push-budget"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@<>"',;]{1,64}@[^\s@<>"',;]{1,190}\.[a-z]{2,24}$/i
const WEEK_MS = 7 * 86_400_000
/** Communities read for one digest, and shown in it. */
export const WEEKLY_COMMUNITIES = 10
export const WEEKLY_SHOWN = 5

export interface WeeklyPayload {
  userId: string
  week: string
}

export function readWeeklyPayload(v: unknown): WeeklyPayload | null {
  const p = (v ?? {}) as Record<string, unknown>
  if (p.weekly !== true) return null
  const userId = typeof p.userId === "string" && UUID.test(p.userId) ? p.userId : null
  const week = typeof p.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.week) ? p.week : null
  return userId && week ? { userId, week } : null
}

/** The job that sends the digest of one week: once per person and week. */
export function weeklyJob(userId: string, now: number, tz: string | null): { kind: "push_digest"; payload: Record<string, unknown>; run_at: string; idempotency_key: string } {
  const next = nextWeeklyDigest(now, tz)
  return { kind: "push_digest", payload: { weekly: true, userId, week: next.week }, run_at: new Date(next.at).toISOString(), idempotency_key: `weekly_digest:${userId}:${next.week}` }
}

export interface CommunityWeek {
  name: string
  slug: string
  posts: number
  events: number
  top: string | null
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "12 new posts and 2 events coming up", or "" for a quiet week. */
export function weekLine(w: Pick<CommunityWeek, "posts" | "events">): string {
  const parts = [w.posts ? plural(w.posts, "new post", "new posts") : "", w.events ? `${plural(w.events, "event", "events")} coming up` : ""].filter(Boolean)
  return parts.join(" and ")
}

/** The email's data: busiest first, five at most, and how many more had news. */
export function weeklyData(weeks: readonly CommunityWeek[], weekOf: string): Record<string, string | number> | null {
  const busy = weeks.filter((w) => w.posts + w.events > 0).sort((a, b) => b.posts + b.events - (a.posts + a.events))
  if (busy.length === 0) return null
  const out: Record<string, string | number> = { weekOf }
  busy.slice(0, WEEKLY_SHOWN).forEach((w, i) => {
    out[`c${i + 1}Name`] = w.name
    out[`c${i + 1}Slug`] = w.slug
    out[`c${i + 1}Line`] = weekLine(w)
    if (w.top) out[`c${i + 1}Top`] = w.top
  })
  if (busy.length > WEEKLY_SHOWN) out.moreCount = busy.length - WEEKLY_SHOWN
  return out
}

/** Queues the week after this one, once (a key per person and week), even when this one ran early or late. */
async function queueNext(db: Db, userId: string, week: string, now: number, tz: string | null): Promise<void> {
  const after = Math.max(now, Date.parse(`${week}T12:00:00Z`) + 86_400_000)
  const { error } = await db.from("community_jobs").upsert(weeklyJob(userId, after, tz), { onConflict: "idempotency_key", ignoreDuplicates: true })
  if (error) console.error(`[communities] next weekly digest not queued: ${reasonOf(error)}`)
}

export type WeeklyOutcome = "sent" | "quiet_week" | "not_asked" | "unsubscribed" | "no_address" | "off" | "unavailable"

export async function runWeeklyDigest(db: Db, raw: unknown, now: number = Date.now(), opts: { enabled?: boolean } = {}): Promise<WeeklyOutcome> {
  const p = readWeeklyPayload(raw)
  if (!p) throw new Error("a weekly digest needs payload.weekly, payload.userId and payload.week")
  const choice = await readChoice(db, p.userId)
  if (!choice.emailOn.includes("weekly_digest")) return "not_asked"
  const { data: pref } = await db.from("notification_preferences").select("enabled").eq("user_id", p.userId).eq("category", "tips").eq("channel", "email").maybeSingle()
  if ((pref as { enabled: boolean } | null)?.enabled === false) return "unsubscribed"
  /* Asked for and not stopped: next week is queued whatever this week holds. */
  await queueNext(db, p.userId, p.week, now, choice.tz)
  if (!(opts.enabled ?? (await communitiesEnabled()))) return "off"

  const since = new Date(now - WEEK_MS).toISOString()
  const ahead = new Date(now + WEEK_MS).toISOString()
  const { data: memberships, error } = await db
    .from("community_members")
    .select("community_id, last_active_at")
    .eq("user_id", p.userId)
    .eq("status", "active")
    .order("last_active_at", { ascending: false, nullsFirst: false })
    .limit(WEEKLY_COMMUNITIES)
  if (error) throw new Error(`memberships read: ${reasonOf(error)}`)
  const ids = ((memberships as { community_id: string }[] | null) ?? []).map((m) => m.community_id)
  if (ids.length === 0) return "quiet_week"
  const { data: cs } = await db.from("communities").select("id, name, slug, status, suspended_at, deleted_at").in("id", ids)
  const open = ((cs as { id: string; name: string; slug: string; status: string; suspended_at: string | null; deleted_at: string | null }[] | null) ?? []).filter(
    (c) => !c.deleted_at && !c.suspended_at && c.status !== "suspended" && c.status !== "archived",
  )
  const weeks = await Promise.all(
    open.map(async (c): Promise<CommunityWeek> => {
      const [posts, top, events] = await Promise.all([
        db.from("community_feed_posts").select("id", { count: "exact", head: true }).eq("community_id", c.id).eq("status", "published").gte("created_at", since),
        db.from("community_feed_posts").select("title, body_text, reaction_count").eq("community_id", c.id).eq("status", "published").gte("created_at", since).order("reaction_count", { ascending: false }).limit(1),
        db.from("community_events").select("id", { count: "exact", head: true }).eq("community_id", c.id).neq("status", "cancelled").gte("starts_at", nowIso(now)).lte("starts_at", ahead),
      ])
      const t = ((top.data as { title: string | null; body_text: string | null; reaction_count: number | null }[] | null) ?? [])[0]
      const topLine = t && (t.reaction_count ?? 0) > 0 ? (String(t.title || "").trim() || String(t.body_text || "").replace(/\s+/g, " ").trim()).slice(0, 110) : ""
      return { name: c.name, slug: c.slug, posts: posts.count ?? 0, events: events.count ?? 0, top: topLine || null }
    }),
  )
  const data = weeklyData(weeks, p.week)
  if (!data) return "quiet_week"

  let address: string | null = null
  try {
    const got = db.auth?.admin?.getUserById ? await db.auth.admin.getUserById(p.userId) : null
    const email = got?.data?.user?.email
    address = typeof email === "string" && EMAIL.test(email) ? email.toLowerCase() : null
  } catch {
    address = null
  }
  if (!address) return "no_address"
  const result = await storeOf(db).insertEvent({
    name: "community.weekly_digest",
    key: `community.weekly_digest:${p.userId}:${p.week}`,
    userId: p.userId,
    entityType: "user",
    entityId: p.userId,
    payload: { ...data, recipientEmail: address, dedupeKey: `weekly:${p.week}` },
    occurredAt: nowIso(now),
    correlationId: null,
  })
  return result.status === "unavailable" ? "unavailable" : "sent"
}
