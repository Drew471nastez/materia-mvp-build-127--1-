import "server-only"

/**
 * ===========================================================================
 *  KEEPING A COMMUNITY IN ORDER
 * ===========================================================================
 * Every moderation decision goes through here, from the creator's
 * Moderation and Members screens and from the member side's post menus
 * (app/api/community/[communityId]/moderation/*), so both answer the same:
 *
 *   CONTENT   remove, restore, pin, lock, feature, move a post; remove or
 *             restore a comment; remove a chat message. A removed message
 *             has its body blanked in the same update, because the realtime
 *             stream delivers the row as it is written.
 *   MEMBERS   mute for a while, suspend, ban, remove, approve or decline a
 *             request to join, change a role.
 *   REPORTS   the queue with what was reported beside each report, and its
 *             resolution.
 *   AUDIT     the community's log, newest first.
 *
 * The rules: the action needs its permission (can()); a target must belong
 * to the community in the URL; nobody acts on somebody ranked the same or
 * above them (canActOn), and that includes their posts; and every action is
 * written to the audit log.
 */
import { assignableRoles, can, canActOn, ROLE_RANK, type CommunityAction } from "../permissions"
import { MEMBER_COLUMNS, REPORT_STATUSES, isOneOf, type CommunityRow, type MemberRow, type ReportReason, type ReportStatus, type ReportTarget, type Role } from "../types"
import { decodeCursor, encodeCursor, isUuid, keysetOr } from "@/components/community/creator/logic"
import type { AuditView, ReportView } from "@/components/community/creator/view-types"
import { audit } from "./audit"
import { grantMembership, memberOf, revokeMembership } from "./membership"
import { notifyMember } from "./notify"
import { missing, nowIso, reasonOf, type Db } from "./db"

export type Outcome<T = unknown> = ({ ok: true } & T) | { ok: false; error: string; status: number }

const no = (status: number, error: string) => ({ ok: false as const, status, error })

export interface Actor {
  userId: string
  role: Role
}

/* ── People, as the screens name them ───────────────────────────────────── */

export interface Person {
  name: string
  username: string | null
  avatarUrl: string | null
  email: string | null
}

/** Names (and, when asked, emails) for a list of accounts, in one read. */
export async function peopleOf(db: Db, ids: string[], opts: { email?: boolean } = {}): Promise<Map<string, Person>> {
  const unique = [...new Set(ids.filter(isUuid))]
  const out = new Map<string, Person>()
  for (let i = 0; i < unique.length; i += 150) {
    const chunk = unique.slice(i, i + 150)
    const { data, error } = await db.from("profiles").select(opts.email ? "id, display_name, username, avatar_url, email" : "id, display_name, username, avatar_url").in("id", chunk)
    if (error) {
      console.error(`[communities] profiles read: ${reasonOf(error)}`)
      continue
    }
    for (const p of (data as { id: string; display_name: string | null; username: string | null; avatar_url: string | null; email?: string | null }[] | null) ?? []) {
      out.set(p.id, {
        name: p.display_name?.trim() || (p.username ? `@${p.username}` : "Member"),
        username: p.username ?? null,
        avatarUrl: p.avatar_url ?? null,
        email: opts.email ? (p.email ?? null) : null,
      })
    }
  }
  return out
}

/* ── Content ────────────────────────────────────────────────────────────── */

export const CONTENT_ACTIONS = ["remove", "restore", "pin", "unpin", "lock", "reopen", "feature", "unfeature", "move"] as const
export type ContentAction = (typeof CONTENT_ACTIONS)[number]
export const CONTENT_TARGETS = ["post", "comment", "message"] as const
export type ContentTarget = (typeof CONTENT_TARGETS)[number]

/** The permission each content action needs. */
export function contentActionNeeds(action: ContentAction): CommunityAction {
  switch (action) {
    case "pin":
    case "unpin":
      return "pin"
    case "lock":
    case "reopen":
      return "lock"
    case "feature":
    case "unfeature":
      return "feature"
    default:
      return "moderate_content"
  }
}

/** Which actions make sense on which kind of content. */
export function contentActionFits(action: ContentAction, target: ContentTarget): boolean {
  if (target === "post") return true
  if (target === "comment") return action === "remove" || action === "restore"
  return action === "remove"
}

async function roleOf(db: Db, communityId: string, userId: string | null): Promise<Role | null> {
  if (!userId) return null
  const m = await memberOf(db, communityId, userId)
  return m && m.status === "active" ? m.role : null
}

const TABLE: Record<ContentTarget, string> = { post: "community_feed_posts", comment: "community_feed_comments", message: "community_messages" }

/** Every open report about this content is closed with the action taken. */
async function closeReportsAbout(db: Db, communityId: string, targetType: ReportTarget, targetId: string, actorId: string, resolution: string): Promise<void> {
  const { error } = await db
    .from("community_reports")
    .update({ status: "resolved", resolution, resolved_by: actorId, resolved_at: nowIso() })
    .eq("community_id", communityId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .in("status", ["open", "reviewing"])
  if (error && !missing(error)) console.error(`[communities] reports not closed: ${reasonOf(error)}`)
}

export interface ContentActInput {
  community: CommunityRow
  actor: Actor
  action: ContentAction
  targetType: ContentTarget
  targetId: string
  reason?: string | null
  spaceId?: string | null
}

export async function actOnContent(db: Db, a: ContentActInput): Promise<Outcome<{ status: string }>> {
  if (!isUuid(a.targetId)) return no(404, "not_found")
  if (!contentActionFits(a.action, a.targetType)) return no(400, "That cannot be done to this.")
  if (!can(a.actor.role, contentActionNeeds(a.action))) return no(403, "forbidden")
  const table = TABLE[a.targetType]
  const cols = a.targetType === "post" ? "id, community_id, author_id, status, pinned, locked, featured, space_id, title, body_text" : a.targetType === "comment" ? "id, community_id, author_id, status, body, post_id" : "id, community_id, author_id, status, body, space_id"
  const { data: row, error } = await db.from(table).select(cols).eq("id", a.targetId).eq("community_id", a.community.id).maybeSingle()
  if (error) return missing(error) ? no(503, "not_set_up") : no(500, "The content could not be read. Try again.")
  if (!row) return no(404, "not_found")
  const author = row.author_id as string | null
  if (author && author !== a.actor.userId) {
    const authorRole = await roleOf(db, a.community.id, author)
    if (authorRole && ROLE_RANK[authorRole] >= ROLE_RANK[a.actor.role]) return no(403, "forbidden")
  }
  const reason = a.reason ? String(a.reason).trim().slice(0, 500) : null
  const now = nowIso()
  let patch: Record<string, unknown> | null = null

  switch (a.action) {
    case "remove":
      if (row.status !== "published") return no(409, "It is not up any more.")
      if (a.targetType === "message") patch = { status: "removed", body: "", attachments: [] }
      else if (a.targetType === "comment") patch = { status: "removed", removed_by: a.actor.userId, removed_reason: reason }
      else patch = { status: "removed", removed_by: a.actor.userId, removed_reason: reason, removed_at: now, pinned: false }
      break
    case "restore":
      if (row.status !== "removed") return no(409, "Only removed content can be put back.")
      patch = a.targetType === "comment" ? { status: "published", removed_by: null, removed_reason: null } : { status: "published", removed_by: null, removed_reason: null, removed_at: null }
      break
    case "pin":
    case "unpin":
      patch = { pinned: a.action === "pin" }
      break
    case "lock":
    case "reopen":
      patch = { locked: a.action === "lock" }
      break
    case "feature":
    case "unfeature":
      patch = { featured: a.action === "feature" }
      break
    case "move": {
      if (!isUuid(a.spaceId)) return no(400, "Pick a space to move it to.")
      const { data: space } = await db.from("community_spaces").select("id, kind, archived_at, name").eq("id", a.spaceId).eq("community_id", a.community.id).maybeSingle()
      if (!space || space.archived_at || space.kind === "chat") return no(404, "That space is not in this community.")
      patch = { space_id: space.id, kind: space.kind === "announcements" ? "announcement" : row.kind === "announcement" ? "post" : undefined }
      if (patch.kind === undefined) delete patch.kind
      break
    }
  }
  if (!patch) return no(400, "Unknown action.")
  if (row.status === "deleted") return no(409, "The author deleted it.")
  const { error: writeError } = await db.from(table).update(patch).eq("id", row.id).eq("community_id", a.community.id)
  if (writeError) {
    console.error(`[communities] ${a.action} ${a.targetType}: ${reasonOf(writeError)}`)
    return no(500, "That did not save. Try again.")
  }
  if (a.action === "remove") await closeReportsAbout(db, a.community.id, a.targetType, row.id, a.actor.userId, reason ? `Removed: ${reason}` : "Removed")
  const label = a.targetType === "post" ? (row.title || String(row.body_text ?? "").slice(0, 80) || "Post") : String(row.body ?? "").slice(0, 80) || a.targetType
  await audit(db, {
    communityId: a.community.id,
    actorId: a.actor.userId,
    actorKind: "member",
    action: `${a.targetType}.${a.action === "remove" ? "removed" : a.action === "restore" ? "restored" : a.action === "move" ? "moved" : a.action === "pin" ? "pinned" : a.action === "unpin" ? "unpinned" : a.action === "lock" ? "locked" : a.action === "reopen" ? "reopened" : a.action === "feature" ? "featured" : "unfeatured"}`,
    targetType: a.targetType,
    targetId: row.id,
    targetLabel: label,
    reason,
    detail: { authorId: author, ...(a.action === "move" ? { from: row.space_id, to: a.spaceId } : {}) },
  })
  return { ok: true, status: (patch.status as string | undefined) ?? String(row.status) }
}

/* ── Members ────────────────────────────────────────────────────────────── */

export const MEMBER_ACTIONS = ["mute", "unmute", "suspend", "unsuspend", "ban", "unban", "remove", "approve", "reject", "role"] as const
export type MemberAction = (typeof MEMBER_ACTIONS)[number]

export function memberActionNeeds(action: MemberAction): CommunityAction {
  switch (action) {
    case "mute":
    case "unmute":
      return "mute"
    case "suspend":
    case "unsuspend":
      return "suspend"
    case "ban":
    case "unban":
      return "ban"
    case "remove":
      return "remove_member"
    case "approve":
    case "reject":
      return "approve_member"
    default:
      return "change_role"
  }
}

const MAX_MUTE_MS = 365 * 86_400_000

/** When a mute ends: an ISO time, or a number of hours, from 1 hour to a year; 24 hours when not said. */
export function muteUntil(until: unknown, now: number = Date.now()): string | null {
  let end = now + 24 * 3_600_000
  if (typeof until === "number" && Number.isFinite(until)) end = now + until * 3_600_000
  else if (typeof until === "string" && until) {
    const t = Date.parse(until)
    if (!Number.isFinite(t)) return null
    end = t
  }
  if (end <= now + 59_000 || end > now + MAX_MUTE_MS) return null
  return new Date(end).toISOString()
}

async function defaultFreeTierId(db: Db, communityId: string): Promise<string | null> {
  const { data } = await db.from("community_tiers").select("id").eq("community_id", communityId).eq("is_default", true).eq("kind", "free").is("archived_at", null).maybeSingle()
  return (data?.id as string | undefined) ?? null
}

export interface MemberActInput {
  community: CommunityRow
  actor: Actor
  action: MemberAction
  userId: string
  reason?: string | null
  until?: unknown
  role?: unknown
}

export async function actOnMember(db: Db, a: MemberActInput): Promise<Outcome<{ member: MemberRow | null }>> {
  if (!isUuid(a.userId)) return no(404, "not_found")
  if (!can(a.actor.role, memberActionNeeds(a.action))) return no(403, "forbidden")
  if (a.userId === a.actor.userId) return no(409, "You cannot do that to yourself.")
  const target = await memberOf(db, a.community.id, a.userId)
  if (!target) return no(404, "not_found")
  if (!canActOn(a.actor.role, target.role)) return no(403, "forbidden")
  const reason = a.reason ? String(a.reason).trim().slice(0, 500) : null
  const base = { communityId: a.community.id, actorId: a.actor.userId, actorKind: "member" as const, targetType: "member", targetId: a.userId }

  switch (a.action) {
    case "mute": {
      if (target.status !== "active") return no(409, "Only an active member can be muted.")
      const until = muteUntil(a.until)
      if (!until) return no(400, "A mute lasts from an hour to a year.")
      const { data, error } = await db.from("community_members").update({ muted_until: until }).eq("id", target.id).select(MEMBER_COLUMNS).single()
      if (error) return no(500, "That did not save. Try again.")
      await audit(db, { ...base, action: "member.muted", reason, detail: { until } })
      return { ok: true, member: data as MemberRow }
    }
    case "unmute": {
      const { data, error } = await db.from("community_members").update({ muted_until: null }).eq("id", target.id).select(MEMBER_COLUMNS).single()
      if (error) return no(500, "That did not save. Try again.")
      await audit(db, { ...base, action: "member.unmuted", reason })
      return { ok: true, member: data as MemberRow }
    }
    case "suspend":
      if (target.status !== "active") return no(409, "Only an active member can be suspended.")
      return { ok: true, member: await revokeMembership(db, { communityId: a.community.id, userId: a.userId, status: "paused", reason: reason ?? "suspended", actorId: a.actor.userId }) }
    case "unsuspend": {
      if (target.status !== "paused") return no(409, "They are not suspended.")
      const row = await grantMembership(db, { communityId: a.community.id, userId: a.userId, source: target.source, tierId: target.tier_id, status: "active", actorId: a.actor.userId })
      await audit(db, { ...base, action: "member.unsuspended", reason })
      return { ok: true, member: row }
    }
    case "ban":
      if (target.status === "banned") return { ok: true, member: target }
      return { ok: true, member: await revokeMembership(db, { communityId: a.community.id, userId: a.userId, status: "banned", reason: reason ?? "banned", actorId: a.actor.userId }) }
    case "unban": {
      if (target.status !== "banned" && !target.banned_at) return no(409, "They are not banned.")
      /* Back in on the way they had; a paid way in that has ended is put right by the next reconcile. */
      const row = await grantMembership(db, { communityId: a.community.id, userId: a.userId, source: target.source, tierId: target.tier_id, status: "active", force: true, actorId: a.actor.userId })
      await audit(db, { ...base, action: "member.unbanned", reason })
      return { ok: true, member: row }
    }
    case "remove":
      if (target.status === "removed") return { ok: true, member: target }
      return { ok: true, member: await revokeMembership(db, { communityId: a.community.id, userId: a.userId, status: "removed", reason: reason ?? "removed", actorId: a.actor.userId }) }
    case "approve": {
      if (target.status !== "pending") return no(409, "There is no request to approve.")
      const freeTier = await defaultFreeTierId(db, a.community.id)
      const url = `/community/${a.community.slug}`
      if (!freeTier) {
        /* A paid community: approval lets them pay. Checkout makes the row active. */
        const { data, error } = await db.from("community_members").update({ approved_by: a.actor.userId }).eq("id", target.id).select(MEMBER_COLUMNS).single()
        if (error) return no(500, "That did not save. Try again.")
        await audit(db, { ...base, action: "member.approved", reason, detail: { awaitingPayment: true } })
        await notifyMember(db, { userId: a.userId, communityId: a.community.id, kind: "membership", actorId: a.actor.userId, title: `Your request to join ${a.community.name} was approved`, body: "Finish joining on the community page.", url, dedupeKey: `approved:${target.id}:${target.requested_at ?? ""}` })
        return { ok: true, member: data as MemberRow }
      }
      const row = await grantMembership(db, { communityId: a.community.id, userId: a.userId, source: "free", tierId: freeTier, status: "active", sourceRefs: { approvedBy: a.actor.userId }, actorId: a.actor.userId })
      await audit(db, { ...base, action: "member.approved", reason })
      await notifyMember(db, { userId: a.userId, communityId: a.community.id, kind: "membership", actorId: a.actor.userId, title: `You are in ${a.community.name}`, body: "Your request to join was approved.", url, dedupeKey: `approved:${target.id}:${target.requested_at ?? ""}` })
      return { ok: true, member: row }
    }
    case "reject":
      if (target.status !== "pending") return no(409, "There is no request to decline.")
      return { ok: true, member: await revokeMembership(db, { communityId: a.community.id, userId: a.userId, status: "cancelled", reason: reason ?? "request declined", actorId: a.actor.userId }) }
    case "role": {
      const role = a.role
      if (!assignableRoles(a.actor.role).some((r) => r === role)) return no(403, "forbidden")
      if (target.status !== "active") return no(409, "Only an active member can be given a role.")
      if (target.role === role) return { ok: true, member: target }
      const { data, error } = await db.from("community_members").update({ role }).eq("id", target.id).select(MEMBER_COLUMNS).single()
      if (error) return no(500, "That did not save. Try again.")
      await audit(db, { ...base, action: "member.role_changed", reason, detail: { from: target.role, to: role } })
      return { ok: true, member: data as MemberRow }
    }
  }
  return no(400, "Unknown action.")
}

/* ── Reports ────────────────────────────────────────────────────────────── */

export const REPORTS_PAGE = 25

interface ReportRowLite {
  id: string
  reporter_id: string | null
  target_type: ReportTarget
  target_id: string
  reason: ReportReason
  note: string | null
  status: ReportStatus
  resolution: string | null
  created_at: string
}

/** Open reports and requests to join, for the tab counts. */
export async function openReportCount(db: Db, communityId: string): Promise<number> {
  const { count, error } = await db.from("community_reports").select("id", { count: "exact", head: true }).eq("community_id", communityId).in("status", ["open", "reviewing"])
  if (error) return 0
  return count ?? 0
}

/**
 * The report queue, newest first, with what each report is about beside it,
 * read in one pass per kind of content (never one read per report).
 */
export async function listReports(db: Db, communityId: string, opts: { status: "open" | "closed" | ReportStatus; cursor: string | null }): Promise<{ rows: ReportView[]; next: string | null }> {
  let q = db.from("community_reports").select("id, reporter_id, target_type, target_id, reason, note, status, resolution, created_at").eq("community_id", communityId)
  if (opts.status === "open") q = q.in("status", ["open", "reviewing"])
  else if (opts.status === "closed") q = q.in("status", ["resolved", "dismissed"])
  else if (isOneOf(REPORT_STATUSES, opts.status)) q = q.eq("status", opts.status)
  const c = decodeCursor(opts.cursor)
  if (c && typeof c.sort === "string") q = q.or(keysetOr("created_at", c.sort, c.id))
  const { data, error } = await q.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(REPORTS_PAGE + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] reports read: ${reasonOf(error)}`)
    return { rows: [], next: null }
  }
  const all = (data as ReportRowLite[] | null) ?? []
  const rows = all.slice(0, REPORTS_PAGE)
  const ids = (t: ReportTarget) => [...new Set(rows.filter((r) => r.target_type === t).map((r) => r.target_id))]
  const [posts, comments, messages] = await Promise.all([
    ids("post").length ? db.from("community_feed_posts").select("id, author_id, title, body_text, status").eq("community_id", communityId).in("id", ids("post")) : Promise.resolve({ data: [] }),
    ids("comment").length ? db.from("community_feed_comments").select("id, author_id, body, status").eq("community_id", communityId).in("id", ids("comment")) : Promise.resolve({ data: [] }),
    ids("message").length ? db.from("community_messages").select("id, author_id, body, status").eq("community_id", communityId).in("id", ids("message")) : Promise.resolve({ data: [] }),
  ])
  type Content = { id: string; author_id: string | null; title?: string | null; body_text?: string; body?: string; status: "published" | "removed" | "deleted" }
  const content = new Map<string, Content>()
  for (const r of [...((posts.data as Content[] | null) ?? []), ...((comments.data as Content[] | null) ?? []), ...((messages.data as Content[] | null) ?? [])]) content.set(r.id, r)
  const memberIds = ids("member")
  const subjectIds = [...memberIds, ...[...content.values()].map((c) => c.author_id).filter((x): x is string => Boolean(x))]
  const [people, roles] = await Promise.all([
    peopleOf(db, [...subjectIds, ...rows.map((r) => r.reporter_id).filter((x): x is string => Boolean(x))]),
    subjectIds.length ? db.from("community_members").select("user_id, role, status").eq("community_id", communityId).in("user_id", [...new Set(subjectIds)].slice(0, 200)) : Promise.resolve({ data: [] }),
  ])
  const roleOfUser = new Map(((roles.data as { user_id: string; role: Role; status: string }[] | null) ?? []).map((m) => [m.user_id, m.status === "active" ? m.role : null]))
  const last = rows[rows.length - 1]
  return {
    rows: rows.map((r) => {
      const c = r.target_type === "member" ? null : content.get(r.target_id)
      const subjectId = r.target_type === "member" ? r.target_id : (c?.author_id ?? null)
      const preview =
        r.target_type === "member"
          ? (people.get(r.target_id)?.name ?? "A member")
          : !c
            ? "This was deleted."
            : c.status === "removed" && r.target_type === "message"
              ? "Removed message"
              : (c.title || c.body_text || c.body || "").slice(0, 280)
      return {
        id: r.id,
        targetType: r.target_type,
        targetId: r.target_id,
        reason: r.reason,
        note: r.note,
        status: r.status,
        createdAt: r.created_at,
        reporterName: r.reporter_id ? (people.get(r.reporter_id)?.name ?? null) : null,
        preview,
        subject: subjectId ? { userId: subjectId, name: people.get(subjectId)?.name ?? "Member", role: roleOfUser.get(subjectId) ?? null } : null,
        targetState: r.target_type === "member" ? "member" : c ? c.status : "missing",
        resolution: r.resolution,
      }
    }),
    next: all.length > REPORTS_PAGE && last ? encodeCursor(last.created_at, last.id) : null,
  }
}

export async function updateReport(db: Db, a: { community: CommunityRow; actor: Actor; id: string; status: unknown; resolution?: unknown }): Promise<Outcome> {
  if (!can(a.actor.role, "review_reports")) return no(403, "forbidden")
  if (!isUuid(a.id)) return no(404, "not_found")
  if (!isOneOf(REPORT_STATUSES, a.status)) return no(400, "Pick a status.")
  const { data: row } = await db.from("community_reports").select("id, status, target_type, target_id").eq("id", a.id).eq("community_id", a.community.id).maybeSingle()
  if (!row) return no(404, "not_found")
  const closing = a.status === "resolved" || a.status === "dismissed"
  const resolution = typeof a.resolution === "string" ? a.resolution.trim().slice(0, 500) || null : null
  const { error } = await db
    .from("community_reports")
    .update({ status: a.status, resolution: closing ? (resolution ?? (a.status === "dismissed" ? "Dismissed" : "Resolved")) : null, resolved_by: closing ? a.actor.userId : null, resolved_at: closing ? nowIso() : null, assigned_to: a.status === "reviewing" ? a.actor.userId : undefined })
    .eq("id", row.id)
  if (error) return no(500, "That did not save. Try again.")
  await audit(db, { communityId: a.community.id, actorId: a.actor.userId, actorKind: "member", action: `report.${a.status}`, targetType: "report", targetId: row.id, targetLabel: `${row.target_type} report`, reason: resolution, detail: { from: row.status, target: { type: row.target_type, id: row.target_id } } })
  return { ok: true }
}

/* ── The audit log ──────────────────────────────────────────────────────── */

export const AUDIT_PAGE = 40

export async function auditLog(db: Db, communityId: string, cursor: string | null): Promise<{ rows: AuditView[]; next: string | null }> {
  let q = db.from("community_audit_log").select("id, actor_id, actor_kind, action, target_type, target_label, reason, created_at").eq("community_id", communityId)
  const before = cursor && /^\d{1,18}$/.test(cursor) ? cursor : null
  if (before) q = q.lt("id", before)
  const { data, error } = await q.order("id", { ascending: false }).limit(AUDIT_PAGE + 1)
  if (error) {
    if (!missing(error)) console.error(`[communities] audit read: ${reasonOf(error)}`)
    return { rows: [], next: null }
  }
  const all = (data as { id: number; actor_id: string | null; actor_kind: AuditView["actorKind"]; action: string; target_type: string | null; target_label: string | null; reason: string | null; created_at: string }[] | null) ?? []
  const rows = all.slice(0, AUDIT_PAGE)
  const people = await peopleOf(db, rows.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))
  const last = rows[rows.length - 1]
  return {
    rows: rows.map((r) => ({
      id: Number(r.id),
      action: r.action,
      actorName: r.actor_id ? (people.get(r.actor_id)?.name ?? null) : r.actor_kind === "platform" ? "Storelib" : null,
      actorKind: r.actor_kind,
      targetType: r.target_type,
      targetLabel: r.target_label,
      reason: r.reason,
      createdAt: r.created_at,
    })),
    next: all.length > AUDIT_PAGE && last ? String(last.id) : null,
  }
}
