import "server-only"

/**
 * ===========================================================================
 *  MESSAGES THE COMMUNITY SENDS BY ITSELF (round 38, part 272)
 * ===========================================================================
 * The owner: "admins can send message automations inside their community,
 * so they can send people messages inside chats, and make sure they receive
 * those." An admin writes the message once (Settings > Automated messages)
 * and picks when it goes; this module turns that into real chat messages.
 *
 * HOW A MESSAGE GETS OUT. Nothing is sent where it is decided. An event (a
 * join, a level reached, a paid membership started or cancelled) or the cron
 * (days after joining, a broadcast that is due) adds ROWS to
 * community_chat_automation_deliveries, one per automation and member: the
 * table's unique key (automation_id, user_id) makes a second add nothing, so
 * a member gets each automation once whatever calls it twice. Then a drain
 * claims waiting rows (pending to sending, one conditional update each, so
 * two drains never take the same row), writes each as a direct message from
 * the sender to the member (or a message in a channel), and marks it sent.
 *
 * NEVER TWICE. The message carries the delivery's own client id
 * (lib/communities/chat-automations.ts deliveryClientId), and before writing
 * the drain looks for a message with that id in that conversation: a drain
 * that died after writing and before marking (a timeout, a deploy) is tried
 * again ten minutes later, finds its message, and marks the row sent. Part
 * 270's unique index on (author, client id) holds the same line in the
 * database for two drains at the same moment.
 *
 * NO PUSH STORMS. A join or a level up sends its few messages right after
 * the response (pushSoon, at most SOON_MAX); everything else waits for the
 * community cron (every five minutes, app/api/cron/community), which sends
 * at most DELIVERIES_PER_RUN in a run and DELIVERIES_PER_COMMUNITY_RUN for
 * one community, so a broadcast to ten thousand members goes out over a
 * couple of hours. Each push goes through the same path as a message a
 * person wrote (./chat-push.ts directPushWanted, then push-bridge's
 * pushDirectMessage and pushOne): never while that chat is open on their
 * screen, never into a muted conversation, never past their push switch,
 * their Messages choice or their quiet hours.
 *
 * Before part 272 every read answers "not ready" and nothing is queued.
 */
import {
  AUTOMATIONS_PER_COMMUNITY,
  CLAIM_STALE_MS,
  DELIVERIES_PER_COMMUNITY_RUN,
  DELIVERIES_PER_RUN,
  DELIVERY_ATTEMPTS_MAX,
  FANOUT_PAGE,
  SOON_MAX,
  automationColumns,
  automationInput,
  automationsFor,
  broadcastFinished,
  daysWindow,
  deliveryClientId,
  renderAutomation,
  takeBatch,
  type AutomationSegment,
  type AutomationStatus,
  type AutomationTarget,
  type AutomationTrigger,
} from "../chat-automations"
import { attachmentLine, isStaffRole, pushPreviewText } from "../chat-rules"
import type { CommunityRow } from "../types"
import { audit } from "./audit"
import { isUniqueViolation, missing, nowIso, reasonOf, type Db } from "./db"
import { authorViews } from "./directory"
import { blockedBetween, everyMessageListeners, loadChatSettings } from "./chat-settings"
import { directPushWanted, pushChatMessage } from "./chat-push"
import { pushDirectMessage, pushSoon } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const AUTOMATION_COLUMNS =
  "id, community_id, name, trigger, trigger_level, trigger_days, segment, target, space_id, sender_id, body, status, send_at, cursor_at, cursor_user, fanned_out_at, sent_count, failed_count, last_sent_at, created_by, created_at, updated_at"
const DELIVERY_COLUMNS = "id, automation_id, community_id, user_id, status, attempts, due_at, claimed_at"

export interface AutomationRow {
  id: string
  community_id: string
  name: string
  trigger: AutomationTrigger
  trigger_level: number | null
  trigger_days: number | null
  segment: AutomationSegment | null
  target: AutomationTarget
  space_id: string | null
  sender_id: string | null
  body: string
  status: AutomationStatus
  send_at: string | null
  cursor_at: string | null
  cursor_user: string | null
  fanned_out_at: string | null
  sent_count: number
  failed_count: number
  last_sent_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

interface DeliveryRow {
  id: string
  automation_id: string
  community_id: string
  user_id: string | null
  status: string
  attempts: number
  due_at: string
  claimed_at: string | null
}

export interface AutomationView {
  id: string
  name: string
  trigger: AutomationTrigger
  triggerLevel: number | null
  triggerDays: number | null
  target: AutomationTarget
  spaceId: string | null
  senderId: string | null
  body: string
  segment: AutomationSegment
  status: AutomationStatus
  sendAt: string | null
  sent: number
  failed: number
  pending: number
  lastSentAt: string | null
  createdAt: string
}

export type AutomationRefusal = { ok: false; error: string; status: number }

function viewOf(r: AutomationRow, pending: number): AutomationView {
  return {
    id: r.id,
    name: r.name,
    trigger: r.trigger,
    triggerLevel: r.trigger_level,
    triggerDays: r.trigger_days,
    target: r.target,
    spaceId: r.space_id,
    senderId: r.sender_id,
    body: r.body,
    segment: (r.segment && typeof r.segment === "object" ? r.segment : {}) as AutomationSegment,
    status: r.status,
    sendAt: r.send_at,
    sent: r.sent_count ?? 0,
    failed: r.failed_count ?? 0,
    pending,
    lastSentAt: r.last_sent_at,
    createdAt: r.created_at,
  }
}

/* ── For the admins ─────────────────────────────────────────────────────── */

/** The community's automations, newest first, with what each still has waiting. `ready` false before part 272. */
export async function listAutomations(db: Db, communityId: string): Promise<{ ready: boolean; automations: AutomationView[] }> {
  try {
    const { data, error } = await db.from("community_chat_automations").select(AUTOMATION_COLUMNS).eq("community_id", communityId).order("created_at", { ascending: false }).limit(AUTOMATIONS_PER_COMMUNITY)
    if (error) {
      if (!missing(error)) console.error(`[communities] automations read: ${reasonOf(error)}`)
      return { ready: !missing(error), automations: [] }
    }
    const rows = (data as AutomationRow[] | null) ?? []
    const waiting = new Map<string, number>()
    if (rows.length) {
      const { data: w } = await db.from("community_chat_automation_deliveries").select("automation_id").eq("community_id", communityId).in("status", ["pending", "sending"]).limit(20_000)
      for (const d of (w as { automation_id: string }[] | null) ?? []) waiting.set(d.automation_id, (waiting.get(d.automation_id) ?? 0) + 1)
    }
    return { ready: true, automations: rows.map((r) => viewOf(r, waiting.get(r.id) ?? 0)) }
  } catch (e) {
    console.error(`[communities] automations read: ${reasonOf(e)}`)
    return { ready: false, automations: [] }
  }
}

/** The team members who can send for the community: the owner, admins and moderators, active. */
export async function automationSenders(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">): Promise<{ userId: string; name: string; avatarUrl: string | null; role: string }[]> {
  const { data } = await db.from("community_members").select("user_id, role, status, banned_at").eq("community_id", community.id).in("role", ["owner", "admin", "moderator"]).eq("status", "active").limit(50)
  const rows = ((data as { user_id: string; role: string; banned_at: string | null }[] | null) ?? []).filter((r) => !r.banned_at)
  if (community.owner_user_id && !rows.some((r) => r.user_id === community.owner_user_id)) rows.unshift({ user_id: community.owner_user_id, role: "owner", banned_at: null })
  const people = await authorViews(db, community.id, rows.map((r) => r.user_id))
  const rank = (role: string) => (role === "owner" ? 0 : role === "admin" ? 1 : 2)
  return rows
    .map((r) => ({ userId: r.user_id, name: people.get(r.user_id)?.name ?? "Member", avatarUrl: people.get(r.user_id)?.avatarUrl ?? null, role: r.user_id === community.owner_user_id ? "owner" : r.role }))
    .sort((a, b) => rank(a.role) - rank(b.role) || a.name.localeCompare(b.name))
}

async function checkReferences(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">, input: { target: AutomationTarget; spaceId: string | null; senderId: string | null; segment: AutomationSegment }): Promise<AutomationRefusal | null> {
  if (input.target === "channel") {
    const { data } = await db.from("community_spaces").select("id, kind, archived_at").eq("id", input.spaceId).eq("community_id", community.id).maybeSingle()
    const s = data as { kind: string; archived_at: string | null } | null
    if (!s || s.kind !== "chat" || s.archived_at) return { ok: false, error: "Pick a chat channel of this community.", status: 400 }
  }
  if (input.senderId) {
    const senders = await automationSenders(db, community)
    if (!senders.some((s) => s.userId === input.senderId)) return { ok: false, error: "The sender must be the owner, an admin or a moderator here.", status: 400 }
  }
  if (input.segment.tierId) {
    const { data } = await db.from("community_tiers").select("id").eq("id", input.segment.tierId).eq("community_id", community.id).maybeSingle()
    if (!data) return { ok: false, error: "That tier is not in this community.", status: 400 }
  }
  return null
}

/** A new automation (the route checked manage_settings). A broadcast is "scheduled" for its time, or for now. */
export async function createAutomation(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">, actorId: string, raw: unknown, now: number = Date.now()): Promise<{ ok: true; value: AutomationView } | AutomationRefusal> {
  const checked = automationInput(raw, now)
  if ("error" in checked) return { ok: false, error: checked.error, status: 400 }
  const v = { ...checked.value, senderId: checked.value.senderId ?? actorId }
  const bad = await checkReferences(db, community, v)
  if (bad) return bad
  const { count, error: countError } = await db.from("community_chat_automations").select("id", { count: "exact", head: true }).eq("community_id", community.id)
  if (countError) return { ok: false, error: missing(countError) ? "Automated messages need the database update for chat (part 272) first." : "That did not save. Try again.", status: missing(countError) ? 503 : 500 }
  if ((count ?? 0) >= AUTOMATIONS_PER_COMMUNITY) return { ok: false, error: "A community can have 50 automated messages. Delete one first.", status: 400 }
  const columns = automationColumns(v)
  const broadcast = v.trigger === "broadcast"
  const { data, error } = await db
    .from("community_chat_automations")
    .insert({ community_id: community.id, ...columns, send_at: broadcast ? (v.sendAt ?? nowIso(now)) : null, status: broadcast ? "scheduled" : "active", created_by: actorId })
    .select(AUTOMATION_COLUMNS)
    .single()
  if (error || !data) {
    console.error(`[communities] automation not saved: ${reasonOf(error)}`)
    return { ok: false, error: missing(error) ? "Automated messages need the database update for chat (part 272) first." : "That did not save. Try again.", status: missing(error) ? 503 : 500 }
  }
  const row = data as AutomationRow
  await audit(db, { communityId: community.id, actorId, actorKind: "member", action: "chat.automation_created", targetType: "community", targetId: community.id, targetLabel: row.name, reason: null, detail: { automationId: row.id, trigger: row.trigger, target: row.target } })
  return { ok: true, value: viewOf(row, 0) }
}

async function automationOf(db: Db, communityId: string, id: unknown): Promise<AutomationRow | null> {
  if (typeof id !== "string" || !UUID.test(id)) return null
  const { data, error } = await db.from("community_chat_automations").select(AUTOMATION_COLUMNS).eq("id", id).eq("community_id", communityId).maybeSingle()
  return error ? null : ((data as AutomationRow | null) ?? null)
}

/** Changing what an automation says or when it sends. A broadcast that has started going out cannot change. */
export async function updateAutomation(db: Db, community: Pick<CommunityRow, "id" | "owner_user_id">, actorId: string, id: unknown, raw: unknown, now: number = Date.now()): Promise<{ ok: true; value: AutomationView } | AutomationRefusal> {
  const current = await automationOf(db, community.id, id)
  if (!current) return { ok: false, error: "That automated message is gone.", status: 404 }
  if (current.trigger === "broadcast" && (current.fanned_out_at || current.status === "sending" || current.status === "done")) return { ok: false, error: "This message has started sending, so it can't change. Pause it, or make a new one.", status: 409 }
  const checked = automationInput(raw, now)
  if ("error" in checked) return { ok: false, error: checked.error, status: 400 }
  if (checked.value.trigger !== current.trigger) return { ok: false, error: "When it sends can't change. Make a new one instead.", status: 400 }
  const v = { ...checked.value, senderId: checked.value.senderId ?? current.sender_id ?? actorId }
  const bad = await checkReferences(db, community, v)
  if (bad) return bad
  const columns = automationColumns(v)
  if (current.trigger === "broadcast") columns.send_at = v.sendAt ?? current.send_at ?? nowIso(now)
  const { data, error } = await db.from("community_chat_automations").update({ ...columns, updated_at: nowIso(now) }).eq("id", current.id).eq("community_id", community.id).select(AUTOMATION_COLUMNS).single()
  if (error || !data) return { ok: false, error: "That did not save. Try again.", status: 500 }
  await audit(db, { communityId: community.id, actorId, actorKind: "member", action: "chat.automation_changed", targetType: "community", targetId: community.id, targetLabel: current.name, reason: null, detail: { automationId: current.id } })
  return { ok: true, value: viewOf(data as AutomationRow, 0) }
}

/** Pause, resume or delete. Paused, nothing more is sent (what is queued waits); deleted, what is queued goes with it. */
export async function changeAutomation(db: Db, community: Pick<CommunityRow, "id">, actorId: string, id: unknown, action: unknown): Promise<{ ok: true; value: { id: string; status: AutomationStatus | "deleted" } } | AutomationRefusal> {
  const current = await automationOf(db, community.id, id)
  if (!current) return { ok: false, error: "That automated message is gone.", status: 404 }
  if (action === "delete") {
    const { error } = await db.from("community_chat_automations").delete().eq("id", current.id).eq("community_id", community.id)
    if (error) return { ok: false, error: "That did not delete. Try again.", status: 500 }
    await audit(db, { communityId: community.id, actorId, actorKind: "member", action: "chat.automation_deleted", targetType: "community", targetId: community.id, targetLabel: current.name, reason: null, detail: { automationId: current.id, sent: current.sent_count } })
    return { ok: true, value: { id: current.id, status: "deleted" } }
  }
  let status: AutomationStatus
  if (action === "pause") {
    if (current.status === "done") return { ok: false, error: "This message has already gone to everyone.", status: 409 }
    status = "paused"
  } else if (action === "resume") {
    if (current.status !== "paused") return { ok: true, value: { id: current.id, status: current.status } }
    status = current.trigger === "broadcast" ? (current.fanned_out_at ? "sending" : "scheduled") : "active"
  } else return { ok: false, error: "Pick pause, resume or delete.", status: 400 }
  const { error } = await db.from("community_chat_automations").update({ status, updated_at: nowIso() }).eq("id", current.id).eq("community_id", community.id)
  if (error) return { ok: false, error: "That did not save. Try again.", status: 500 }
  return { ok: true, value: { id: current.id, status } }
}

/** How many members a broadcast reaches now (the panel's preview). */
export async function audienceCount(db: Db, communityId: string, segment: AutomationSegment, now: number = Date.now()): Promise<number> {
  try {
    let q = db.from("community_members").select("user_id", { count: "exact", head: true }).eq("community_id", communityId).eq("status", "active").is("banned_at", null)
    if (segment.minLevel) q = q.gte("level", segment.minLevel)
    if (segment.tierId) q = q.eq("tier_id", segment.tierId)
    if (segment.joinedWithinDays) q = q.gte("joined_at", nowIso(now - segment.joinedWithinDays * 86_400_000))
    const { count } = await q
    return count ?? 0
  } catch {
    return 0
  }
}

/* ── Events that start an automation for one member ─────────────────────── */

export type MemberEvent = { kind: "join" | "paid_start" | "paid_cancel" } | { kind: "level"; before: number; after: number }

/**
 * Queues what these events start for one member, once each (the unique key),
 * and sends a few right after the response. Never throws: an event (a join,
 * a reaction that gave a level) never fails because of an automation.
 */
export async function automationsOnEvent(db: Db, communityId: string, userId: string, events: MemberEvent[]): Promise<number> {
  if (!UUID.test(userId) || !events.length) return 0
  try {
    const { data, error } = await db.from("community_chat_automations").select("id, trigger, trigger_level, status").eq("community_id", communityId).eq("status", "active").neq("trigger", "broadcast").limit(AUTOMATIONS_PER_COMMUNITY)
    if (error) return 0
    const list = (data as { id: string; trigger: string; trigger_level: number | null; status: string }[] | null) ?? []
    const ids = new Set<string>()
    for (const e of events) for (const a of automationsFor(list, e)) ids.add(a.id)
    if (!ids.size) return 0
    const rows = [...ids].map((automation_id) => ({ automation_id, community_id: communityId, user_id: userId, status: "pending", due_at: nowIso() }))
    const { data: added, error: addError } = await db.from("community_chat_automation_deliveries").upsert(rows, { onConflict: "automation_id,user_id", ignoreDuplicates: true }).select("id")
    if (addError) {
      if (!missing(addError)) console.error(`[communities] automation queue: ${reasonOf(addError)}`)
      return 0
    }
    const n = ((added as unknown[] | null) ?? []).length
    if (n) await pushSoon(() => drainDeliveries(db, { communityId, limit: SOON_MAX, budgetMs: 8_000 }))
    return n
  } catch (e) {
    console.error(`[communities] automation event: ${reasonOf(e)}`)
    return 0
  }
}

/* ── The cron's part ────────────────────────────────────────────────────── */

export interface AutomationRunSummary {
  available: boolean
  queued: number
  sent: number
  failed: number
  skipped: number
  finished: number
}

/**
 * One run: stale claims back in the queue, due broadcasts and days
 * automations add their next page of members, then the queue is sent within
 * the run's limits. Inside `budgetMs`, never throws.
 */
export async function runChatAutomations(db: Db, now: number = Date.now(), budgetMs = 15_000, communityId?: string): Promise<AutomationRunSummary> {
  const deadline = Date.now() + budgetMs
  const out: AutomationRunSummary = { available: true, queued: 0, sent: 0, failed: 0, skipped: 0, finished: 0 }
  try {
    const probe = await db.from("community_chat_automations").select("id").limit(1)
    if (probe.error) return { ...out, available: false }
    if (!((probe.data as unknown[] | null) ?? []).length) return out
    await releaseStale(db, now)
    out.queued += await fanOutBroadcasts(db, now, deadline, communityId)
    if (!communityId) out.queued += await queueDays(db, now, deadline)
    const drained = await drainDeliveries(db, { communityId, now, limit: communityId ? DELIVERIES_PER_COMMUNITY_RUN : DELIVERIES_PER_RUN, budgetMs: Math.max(1_000, deadline - Date.now()) })
    out.sent += drained.sent
    out.failed += drained.failed
    out.skipped += drained.skipped
    out.finished += drained.finished
  } catch (e) {
    console.error(`[communities] automations run: ${reasonOf(e)}`)
  }
  return out
}

/** Claims that are older than CLAIM_STALE_MS (a drain that died) go back to the queue, or fail after DELIVERY_ATTEMPTS_MAX tries. */
async function releaseStale(db: Db, now: number): Promise<void> {
  const before = nowIso(now - CLAIM_STALE_MS)
  await db.from("community_chat_automation_deliveries").update({ status: "failed", error: "Tried too many times." }).eq("status", "sending").lt("claimed_at", before).gte("attempts", DELIVERY_ATTEMPTS_MAX)
  await db.from("community_chat_automation_deliveries").update({ status: "pending", claimed_at: null }).eq("status", "sending").lt("claimed_at", before).lt("attempts", DELIVERY_ATTEMPTS_MAX)
}

/** Each due broadcast adds its next FANOUT_PAGE members (by user id, from its cursor); a channel broadcast is one row. */
async function fanOutBroadcasts(db: Db, now: number, deadline: number, communityId?: string): Promise<number> {
  let q = db.from("community_chat_automations").select(AUTOMATION_COLUMNS).eq("trigger", "broadcast").in("status", ["scheduled", "sending"]).is("fanned_out_at", null).lte("send_at", nowIso(now))
  if (communityId) q = q.eq("community_id", communityId)
  const { data } = await q.order("send_at", { ascending: true }).limit(5)
  let queued = 0
  for (const a of (data as AutomationRow[] | null) ?? []) {
    if (Date.now() > deadline) break
    if (a.status === "scheduled") {
      /* Taken by this run: a second run at once finds it "sending" and both add pages from the same cursor, which the unique key makes one. */
      await db.from("community_chat_automations").update({ status: "sending", updated_at: nowIso(now) }).eq("id", a.id).eq("status", "scheduled")
    }
    if (a.target === "channel") {
      const ins = await db.from("community_chat_automation_deliveries").insert({ automation_id: a.id, community_id: a.community_id, user_id: null, status: "pending", due_at: nowIso(now) })
      if (!ins.error) queued++
      else if (!isUniqueViolation(ins.error)) continue
      await db.from("community_chat_automations").update({ fanned_out_at: nowIso(now) }).eq("id", a.id)
      continue
    }
    const seg = (a.segment ?? {}) as AutomationSegment
    let q = db.from("community_members").select("user_id").eq("community_id", a.community_id).eq("status", "active").is("banned_at", null)
    if (seg.minLevel) q = q.gte("level", seg.minLevel)
    if (seg.tierId) q = q.eq("tier_id", seg.tierId)
    if (seg.joinedWithinDays) q = q.gte("joined_at", nowIso(Date.parse(a.send_at ?? a.created_at) - seg.joinedWithinDays * 86_400_000))
    if (a.cursor_user) q = q.gt("user_id", a.cursor_user)
    const { data: page, error } = await q.order("user_id", { ascending: true }).limit(FANOUT_PAGE)
    if (error) continue
    const ids = ((page as { user_id: string }[] | null) ?? []).map((r) => r.user_id).filter((id) => id !== a.sender_id)
    if (ids.length) {
      const { data: added } = await db
        .from("community_chat_automation_deliveries")
        .upsert(ids.map((user_id) => ({ automation_id: a.id, community_id: a.community_id, user_id, status: "pending", due_at: nowIso(now) })), { onConflict: "automation_id,user_id", ignoreDuplicates: true })
        .select("id")
      queued += ((added as unknown[] | null) ?? []).length
    }
    const got = (page as { user_id: string }[] | null) ?? []
    const last = got.length ? got[got.length - 1].user_id : a.cursor_user
    const done = ((page as unknown[] | null) ?? []).length < FANOUT_PAGE
    await db.from("community_chat_automations").update({ cursor_user: last, ...(done ? { fanned_out_at: nowIso(now) } : {}) }).eq("id", a.id)
  }
  return queued
}

/** Each days automation adds the members whose day has come since its cursor (never anybody whose day came before it was made). */
async function queueDays(db: Db, now: number, deadline: number): Promise<number> {
  const { data } = await db.from("community_chat_automations").select(AUTOMATION_COLUMNS).eq("trigger", "days").eq("status", "active").limit(50)
  let queued = 0
  for (const a of (data as AutomationRow[] | null) ?? []) {
    if (Date.now() > deadline) break
    const span = daysWindow({ trigger_days: a.trigger_days ?? 1, created_at: a.created_at, cursor: a.cursor_at }, now)
    if (!span) continue
    const { data: page, error } = await db
      .from("community_members")
      .select("user_id, joined_at")
      .eq("community_id", a.community_id)
      .eq("status", "active")
      .is("banned_at", null)
      .gte("joined_at", span.from)
      .lte("joined_at", span.to)
      .order("joined_at", { ascending: true })
      .limit(FANOUT_PAGE)
    if (error) continue
    const rows = (page as { user_id: string; joined_at: string }[] | null) ?? []
    const ids = rows.map((r) => r.user_id).filter((id) => id !== a.sender_id)
    if (ids.length) {
      const { data: added } = await db
        .from("community_chat_automation_deliveries")
        .upsert(ids.map((user_id) => ({ automation_id: a.id, community_id: a.community_id, user_id, status: "pending", due_at: nowIso(now) })), { onConflict: "automation_id,user_id", ignoreDuplicates: true })
        .select("id")
      queued += ((added as unknown[] | null) ?? []).length
    }
    /* A full page moves the cursor to its last join (that instant again next run; the unique key makes those nothing); a short page reaches the window's end. */
    const cursor = rows.length >= FANOUT_PAGE ? rows[rows.length - 1].joined_at : span.to
    await db.from("community_chat_automations").update({ cursor_at: cursor }).eq("id", a.id)
  }
  return queued
}

/* ── Sending ────────────────────────────────────────────────────────────── */

interface Drained {
  sent: number
  failed: number
  skipped: number
  finished: number
}

/** Sends what is waiting (one community's, or everybody's), within the limits. */
export async function drainDeliveries(db: Db, opts: { communityId?: string; now?: number; limit?: number; budgetMs?: number } = {}): Promise<Drained> {
  const now = opts.now ?? Date.now()
  const deadline = Date.now() + (opts.budgetMs ?? 10_000)
  const out: Drained = { sent: 0, failed: 0, skipped: 0, finished: 0 }
  let q = db.from("community_chat_automation_deliveries").select(DELIVERY_COLUMNS).eq("status", "pending").lte("due_at", nowIso(now))
  if (opts.communityId) q = q.eq("community_id", opts.communityId)
  const { data, error } = await q.order("due_at", { ascending: true }).limit(Math.min(1000, (opts.limit ?? DELIVERIES_PER_RUN) * 3))
  if (error) return out
  const waiting = (data as DeliveryRow[] | null) ?? []
  if (!waiting.length) return out
  /* Their automations, once: a paused or deleted one's rows wait (or went with it). */
  const autoIds = [...new Set(waiting.map((d) => d.automation_id))]
  const { data: autos } = await db.from("community_chat_automations").select(AUTOMATION_COLUMNS).in("id", autoIds)
  const byId = new Map(((autos as AutomationRow[] | null) ?? []).map((a) => [a.id, a]))
  const live = waiting.filter((d) => {
    const a = byId.get(d.automation_id)
    return !!a && a.status !== "paused"
  })
  const batch = takeBatch(live, opts.limit ?? DELIVERIES_PER_RUN, DELIVERIES_PER_COMMUNITY_RUN)
  const communities = new Map<string, CommunityRow | null>()
  const touched = new Set<string>()
  for (const d of batch) {
    if (Date.now() > deadline) break
    /* The claim: pending to sending, only if still pending, so two drains never send the same row. */
    const { data: claimed } = await db
      .from("community_chat_automation_deliveries")
      .update({ status: "sending", claimed_at: nowIso(), attempts: (d.attempts ?? 0) + 1 })
      .eq("id", d.id)
      .eq("status", "pending")
      .select("id")
    if (!((claimed as unknown[] | null) ?? []).length) continue
    const a = byId.get(d.automation_id)!
    if (!communities.has(a.community_id)) communities.set(a.community_id, await communityRow(db, a.community_id))
    const community = communities.get(a.community_id) ?? null
    let result: DeliveryResult
    try {
      result = community ? await deliver(db, community, a, d) : { status: "skipped", error: "The community is gone." }
    } catch (e) {
      result = { status: (d.attempts ?? 0) + 1 >= DELIVERY_ATTEMPTS_MAX ? "failed" : "pending", error: reasonOf(e).slice(0, 300) }
    }
    await db
      .from("community_chat_automation_deliveries")
      .update({ status: result.status, sent_at: result.status === "sent" ? nowIso() : null, message_id: result.messageId ?? null, error: result.error ? result.error.slice(0, 300) : null, claimed_at: result.status === "pending" ? null : nowIso() })
      .eq("id", d.id)
    if (result.status === "sent") out.sent++
    else if (result.status === "failed") out.failed++
    else if (result.status === "skipped") out.skipped++
    touched.add(a.id)
  }
  for (const id of touched) if (await recount(db, byId.get(id)!)) out.finished++
  return out
}

/** The automation's counts from its rows, and a broadcast marked done once nothing waits. True when it just finished. */
async function recount(db: Db, a: AutomationRow): Promise<boolean> {
  const count = (statuses: string[]) =>
    db
      .from("community_chat_automation_deliveries")
      .select("id", { count: "exact", head: true })
      .eq("automation_id", a.id)
      .in("status", statuses)
      .then((r: { count: number | null }) => r.count ?? 0)
  const [sent, failed, waiting] = await Promise.all([count(["sent"]), count(["failed", "skipped"]), count(["pending", "sending"])])
  const { data: fresh } = await db.from("community_chat_automations").select("fanned_out_at, status").eq("id", a.id).maybeSingle()
  const f = fresh as { fanned_out_at: string | null; status: AutomationStatus } | null
  const finished = a.trigger === "broadcast" && !!f && f.status === "sending" && broadcastFinished(f, waiting)
  await db
    .from("community_chat_automations")
    .update({ sent_count: sent, failed_count: failed, last_sent_at: sent > (a.sent_count ?? 0) ? nowIso() : a.last_sent_at, ...(finished ? { status: "done" } : {}) })
    .eq("id", a.id)
  return finished
}

async function communityRow(db: Db, id: string): Promise<CommunityRow | null> {
  try {
    const { loadCommunity, communityOpen } = await import("./context")
    const c = await loadCommunity(db, { id })
    return c && communityOpen(c) ? c : null
  } catch {
    return null
  }
}

type DeliveryResult = { status: "sent" | "failed" | "skipped" | "pending"; error?: string; messageId?: string }

/** Who the message comes from: the sender the admin picked while they are still on the team, else the owner. */
async function senderFor(db: Db, community: CommunityRow, a: AutomationRow): Promise<string | null> {
  if (a.sender_id && a.sender_id !== community.owner_user_id) {
    const { data } = await db.from("community_members").select("role, status, banned_at").eq("community_id", community.id).eq("user_id", a.sender_id).maybeSingle()
    const m = data as { role: string; status: string; banned_at: string | null } | null
    if (m && m.status === "active" && !m.banned_at && isStaffRole(m.role)) return a.sender_id
  }
  return community.owner_user_id ?? null
}

/** One delivery: the message written (or found from an earlier try), its conversation's line moved, the push sent. */
export async function deliver(db: Db, community: CommunityRow, a: AutomationRow, d: Pick<DeliveryRow, "id" | "user_id">): Promise<DeliveryResult> {
  if (!community.chat_enabled) return { status: "skipped", error: "Chat was off." }
  const sender = await senderFor(db, community, a)
  if (!sender) return { status: "skipped", error: "Nobody on the team to send it." }
  const clientId = deliveryClientId(d.id)
  let name: string | null = null
  let level: number | null = null
  if (d.user_id) {
    if (d.user_id === sender) return { status: "skipped", error: "The sender themselves." }
    const { data } = await db.from("community_members").select("status, banned_at, level").eq("community_id", community.id).eq("user_id", d.user_id).maybeSingle()
    const m = data as { status: string; banned_at: string | null; level: number | null } | null
    if (!m || m.status !== "active" || m.banned_at) return { status: "skipped", error: "No longer a member." }
    level = m.level ?? 1
    name = (await authorViews(db, community.id, [d.user_id])).get(d.user_id)?.name ?? null
  }
  const body = renderAutomation(a.body, { name, community: community.name, level }).slice(0, 4000)
  if (a.target === "channel") return deliverToChannel(db, community, a, sender, body, clientId)
  if (!d.user_id) return { status: "skipped", error: "Nobody to send it to." }
  if (await blockedBetween(db, sender, d.user_id)) return { status: "skipped", error: "Blocked." }
  return deliverDirect(db, community, sender, d.user_id, body, clientId)
}

async function deliverDirect(db: Db, community: CommunityRow, sender: string, recipient: string, body: string, clientId: string): Promise<DeliveryResult> {
  const pair = sender < recipient ? { user_a: sender, user_b: recipient } : { user_a: recipient, user_b: sender }
  const columns = "id, user_a, user_b, a_read_at, b_read_at"
  let { data: conv } = await db.from("community_conversations").select(columns).eq("community_id", community.id).eq("user_a", pair.user_a).eq("user_b", pair.user_b).maybeSingle()
  if (!conv) {
    const made = await db.from("community_conversations").insert({ community_id: community.id, ...pair, started_by: sender }).select(columns).single()
    conv = made.data ?? (await db.from("community_conversations").select(columns).eq("community_id", community.id).eq("user_a", pair.user_a).eq("user_b", pair.user_b).maybeSingle()).data
    if (!conv) return { status: "pending", error: reasonOf(made.error) }
  }
  const c = conv as { id: string; user_a: string; user_b: string; a_read_at: string | null; b_read_at: string | null }
  /* Written on an earlier try that never got marked: that message is this delivery. */
  const before = await db.from("community_direct_messages").select("id, created_at").eq("conversation_id", c.id).eq("client_id", clientId).maybeSingle()
  if (before.data) return { status: "sent", messageId: (before.data as { id: string }).id }
  let { data, error } = await db.from("community_direct_messages").insert({ conversation_id: c.id, community_id: community.id, author_id: sender, body, client_id: clientId }).select("id, created_at").single()
  if (error && isUniqueViolation(error)) {
    const again = await db.from("community_direct_messages").select("id, created_at").eq("conversation_id", c.id).eq("client_id", clientId).maybeSingle()
    if (again.data) return { status: "sent", messageId: (again.data as { id: string }).id }
  }
  if (error && missing(error)) return { status: "failed", error: "Messages need the database update for chat (part 270)." }
  if (error || !data) return { status: "pending", error: reasonOf(error) }
  const row = data as { id: string; created_at: string }
  const readColumn = c.user_a === sender ? "a_read_at" : "b_read_at"
  const line = body.replace(/\s+/g, " ").trim()
  await db
    .from("community_conversations")
    .update({ last_message_at: row.created_at, last_author_id: sender, last_body: line.length > 200 ? `${line.slice(0, 199)}…` : line, [readColumn]: row.created_at })
    .eq("id", c.id)
    .then(
      () => undefined,
      () => undefined,
    )
  const settings = await loadChatSettings(db, community.id)
  const recipientReadAt = c.user_a === recipient ? c.a_read_at : c.b_read_at
  if (await directPushWanted(db, { conversationId: c.id, senderId: sender, recipientId: recipient, recipientReadAt })) {
    await pushDirectMessage(db, { communityId: community.id, communitySlug: community.slug, conversationId: c.id, senderId: sender, recipientId: recipient, text: pushPreviewText(settings.pushPreviews, body) })
  }
  return { status: "sent", messageId: row.id }
}

async function deliverToChannel(db: Db, community: CommunityRow, a: AutomationRow, sender: string, body: string, clientId: string): Promise<DeliveryResult> {
  if (!a.space_id) return { status: "skipped", error: "The channel is gone." }
  const { data: space } = await db.from("community_spaces").select("id, name, slug, kind, archived_at").eq("id", a.space_id).eq("community_id", community.id).maybeSingle()
  const s = space as { id: string; name: string; slug: string; kind: string; archived_at: string | null } | null
  if (!s || s.kind !== "chat" || s.archived_at) return { status: "skipped", error: "The channel is gone." }
  const before = await db.from("community_messages").select("id").eq("space_id", s.id).eq("client_id", clientId).maybeSingle()
  if (before.data) return { status: "sent", messageId: (before.data as { id: string }).id }
  const { data, error } = await db.from("community_messages").insert({ community_id: community.id, space_id: s.id, author_id: sender, body, client_id: clientId }).select("id").single()
  if (error && isUniqueViolation(error)) {
    const again = await db.from("community_messages").select("id").eq("space_id", s.id).eq("client_id", clientId).maybeSingle()
    if (again.data) return { status: "sent", messageId: (again.data as { id: string }).id }
  }
  if (error || !data) return { status: missing(error) ? "failed" : "pending", error: reasonOf(error) }
  const id = (data as { id: string }).id
  /* People who asked for every message of the channel hear it, as for a message a person wrote. */
  const listeners = (await everyMessageListeners(db, s.id)).filter((u) => u !== sender)
  if (listeners.length) {
    const settings = await loadChatSettings(db, community.id)
    const senderName = (await authorViews(db, community.id, [sender])).get(sender)?.name ?? community.name
    const { data: marks } = await db.from("community_space_reads").select("user_id, last_read_at").eq("space_id", s.id).in("user_id", listeners)
    const reads = new Map(((marks as { user_id: string; last_read_at: string }[] | null) ?? []).map((r) => [r.user_id, r.last_read_at]))
    await pushChatMessage(db, { kind: "space", communityId: community.id, chatId: s.id, chatName: s.name, url: `/community/${community.slug}/space/${s.slug}?m=${id}`, senderId: sender, senderName, text: body || attachmentLine([]), media: [], previews: settings.pushPreviews, recipients: listeners.map((userId) => ({ userId, readAt: reads.get(userId) ?? null, addressed: false })) })
  }
  return { status: "sent", messageId: id }
}
