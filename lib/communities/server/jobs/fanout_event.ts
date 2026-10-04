import "server-only"

/**
 * FANOUT_EVENT: tells the members an event is for that it is on the
 * calendar. One inbox row each (dedupe key per event and member, so a run
 * again changes nothing), only for active members the event's access rule
 * lets in and whose notification level includes events, never the person
 * who made it. Payload { eventId, communityId, cursor? }, queued once per
 * event by lib/communities/server/events.ts eventScheduled.
 *
 * 500 members a page by user id, one read and one insert per page; out of
 * time, it carries on from the cursor in the next run. An event that was
 * cancelled or has started by then is not announced.
 */
import { evaluateAccess, parseAccessRule } from "../../access"
import { wantsNotification } from "../../permissions"
import { eventTime } from "../../format"
import { EVENT_COLUMNS, type EventRow, type JobRow, type NotifyLevel, type Role } from "../../types"
import { reasonOf, type Db } from "../db"
import { bulkNotify } from "../events"
import { ownedProductIds } from "../membership"
import type { JobContext, JobOutcome } from "./index"
import { carryPushes, communityPushItem, pushFanout, type PushItem } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const FANOUT_PAGE = 500

export async function fanoutEvent(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  /* Pushes an earlier run could not send in time go first (lib/notifications/push-bridge.ts). */
  const carried = await carryPushes(job.payload, ctx.deadline)
  if (carried.left.length) return { again: { payload: { ...carried.payload, pushLeft: carried.left } } }
  const payload = carried.payload
  const eventId = typeof payload.eventId === "string" ? payload.eventId : ""
  if (!UUID.test(eventId)) throw new Error("fanout_event needs payload.eventId")
  let after = typeof payload.cursor === "string" && UUID.test(payload.cursor) ? payload.cursor : null

  const { data: row, error } = await db.from("community_events").select(EVENT_COLUMNS).eq("id", eventId).maybeSingle()
  if (error) throw new Error(`event read: ${reasonOf(error)}`)
  const e = row as EventRow | null
  if (!e || e.status === "cancelled" || Date.parse(e.starts_at) <= ctx.now) return
  const { data: community } = await db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", e.community_id).maybeSingle()
  const c = community as { id: string; slug: string; name?: string | null; status: string; suspended_at: string | null; deleted_at: string | null } | null
  if (!c || c.deleted_at || c.suspended_at || c.status === "suspended" || c.status === "archived") return

  const rule = parseAccessRule(e.access)
  const when = eventTime(e.starts_at, e.ends_at, { timeZone: e.timezone || undefined })
  for (;;) {
    let q = db
      .from("community_members")
      .select("user_id, role, tier_id, level, notify_level")
      .eq("community_id", c.id)
      .eq("status", "active")
      .order("user_id", { ascending: true })
      .limit(FANOUT_PAGE)
    if (after) q = q.gt("user_id", after)
    const { data: members, error: memberError } = await q
    if (memberError) throw new Error(`members read: ${reasonOf(memberError)}`)
    const page = (members as { user_id: string; role: Role; tier_id: string | null; level: number; notify_level: NotifyLevel }[] | null) ?? []
    if (page.length === 0) break

    const notices = []
    for (const m of page) {
      if (m.user_id === e.created_by || !wantsNotification(m.notify_level, "event")) continue
      const v = { role: m.role, active: true, tierId: m.tier_id, ownedProductIds: [] as string[], level: m.level || 1 }
      let allowed = evaluateAccess(rule, v).ok
      /* A rule that names products: only then is what this member owns looked up. */
      if (!allowed && rule.productIds?.length) allowed = evaluateAccess(rule, { ...v, ownedProductIds: await ownedProductIds(db, m.user_id, rule.productIds) }).ok
      if (!allowed) continue
      notices.push({ userId: m.user_id, title: `New event: ${e.title}`, body: when, url: `/community/${c.slug}/events/${e.id}`, dedupeKey: `event_new:${e.id}:${m.user_id}` })
    }
    const fresh = await bulkNotify(db, c.id, "event", { type: "event", id: e.id }, notices)
    /* The members whose row is new this run, to their phones; a low priority kind, so held when they just had one (lib/notifications/push-bridge.ts). */
    const levels = new Map(page.map((m) => [m.user_id, m.notify_level]))
    const items = notices
      .filter((n) => fresh.has(n.userId))
      .map((n) => communityPushItem({ userId: n.userId, communityId: c.id, kind: "event", actorId: e.created_by, title: n.title, body: n.body, url: n.url, dedupeKey: n.dedupeKey, level: levels.get(n.userId) ?? null }, c.name ?? null))
      .filter((i): i is PushItem => !!i)
    const left = await pushFanout(db, items, { deadline: ctx.deadline })
    after = page[page.length - 1].user_id
    if (left.length) return { again: { payload: { ...payload, cursor: after, pushLeft: left } } }
    if (page.length < FANOUT_PAGE) break
    if (Date.now() >= ctx.deadline - 8_000) return { again: { payload: { ...payload, cursor: after } } }
  }
}
