import "server-only"

/**
 * A NEW PROGRAM OR LESSON IN LEARN: tells the members who can see it, a page
 * at a time. Queued by notify.ts notifyProgramPublished as a
 * fanout_announcement job with payload.reason "program" (the queue's kinds
 * are fixed in SQL), run from jobs/fanout_announcement.ts. Payload:
 *
 *   { reason: "program", communityId, programId, lessonId?, title,
 *     lessonTitle?, url, actorId?, access?, after? }
 *
 * One bell row each (kind course_available, dedupe key per program or
 * lesson and member, so a run again changes nothing), only for active
 * members whose level hears it (wantsNotification) and whom the access rule
 * lets in when one is given (a program open from a level, or to a tier);
 * a program sold on its own is told to everyone who can buy it, so no rule
 * is passed for it. Never the person who published it. The new rows go to
 * phones the low priority way: the first pushes, more inside five minutes
 * are one "3 new programs and lessons" (lib/notifications/push-bridge.ts),
 * under the person's "Programs and lessons" switch. Never an email
 * (lib/notify/email-budget.ts).
 *
 * The link must be a page of this community; anything else tells nobody.
 */
import { evaluateAccess, parseAccessRule } from "../../access"
import { wantsNotification } from "../../permissions"
import type { NotifyLevel, Role } from "../../types"
import { missing, reasonOf, type Db } from "../db"
import { ownedProductIds } from "../membership"
import type { JobContext, JobOutcome } from "./index"
import { communityPushItem, pushFanout, type PushItem } from "@/lib/notifications/push-bridge"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const PROGRAM_PAGE = 500

export interface ProgramNotice {
  communityId: string
  programId: string
  lessonId: string | null
  title: string
  lessonTitle: string | null
  url: string
  actorId: string | null
  access: unknown
}

function line(v: unknown, max: number): string {
  return typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : ""
}

export function readProgramPayload(p: Record<string, unknown>): ProgramNotice | null {
  const communityId = typeof p.communityId === "string" && UUID.test(p.communityId) ? p.communityId : null
  const programId = typeof p.programId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(p.programId) ? p.programId : null
  const lessonId = typeof p.lessonId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(p.lessonId) ? p.lessonId : null
  const title = line(p.title, 120)
  const url = typeof p.url === "string" ? p.url : ""
  if (!communityId || !programId || !title) return null
  return { communityId, programId, lessonId, title, lessonTitle: line(p.lessonTitle, 120) || null, url, actorId: typeof p.actorId === "string" && UUID.test(p.actorId) ? p.actorId : null, access: p.access ?? null }
}

/** What the bell and the phone say: "New program: Night photography", "New lesson in Night photography: Long exposures". */
export function programTitle(n: Pick<ProgramNotice, "title" | "lessonTitle" | "lessonId">): string {
  return (n.lessonId ? `New lesson in ${n.title}${n.lessonTitle ? `: ${n.lessonTitle}` : ""}` : `New program: ${n.title}`).slice(0, 200)
}

/** Only a page of this community: "/community/<slug>/..." with nothing that could leave it. */
export function programUrl(url: string, slug: string): string | null {
  const u = url.trim()
  if (!u.startsWith(`/community/${slug}/`) && u !== `/community/${slug}`) return null
  if (u.includes("//") || u.length > 400 || /[\s<>"'`\\]/.test(u)) return null
  return u
}

export async function fanoutProgram(db: Db, payload: Record<string, unknown>, ctx: JobContext): Promise<JobOutcome | void> {
  const n = readProgramPayload(payload)
  if (!n) throw new Error("a program notice needs payload.communityId, payload.programId and payload.title")
  let after = typeof payload.after === "string" && UUID.test(payload.after) ? payload.after : null

  const { data: community, error: communityError } = await db.from("communities").select("id, slug, name, status, suspended_at, deleted_at").eq("id", n.communityId).maybeSingle()
  if (communityError) throw new Error(`community read: ${reasonOf(communityError)}`)
  const c = community as { id: string; slug: string; name: string; status: string; suspended_at: string | null; deleted_at: string | null } | null
  if (!c || c.deleted_at || c.suspended_at || c.status === "suspended" || c.status === "archived") return
  const url = programUrl(n.url, c.slug)
  if (!url) return

  const rule = parseAccessRule(n.access)
  const limited = Object.keys(rule).length > 0
  const title = programTitle(n)
  const target = n.lessonId ? { type: "lesson", id: n.lessonId } : { type: "program", id: n.programId }
  for (;;) {
    let read = db.from("community_members").select("user_id, role, tier_id, level, notify_level").eq("community_id", c.id).eq("status", "active").order("user_id", { ascending: true }).limit(PROGRAM_PAGE)
    if (after) read = read.gt("user_id", after)
    const { data, error } = await read
    if (error) throw new Error(`members read: ${reasonOf(error)}`)
    const page = (data as { user_id: string; role: Role; tier_id: string | null; level: number | null; notify_level: NotifyLevel | null }[] | null) ?? []
    if (page.length === 0) return

    const rows: Record<string, unknown>[] = []
    for (const m of page) {
      if (m.user_id === n.actorId || !wantsNotification(m.notify_level, "course_available")) continue
      if (limited) {
        const v = { role: m.role, active: true, tierId: m.tier_id, ownedProductIds: [] as string[], level: m.level || 1 }
        let allowed = evaluateAccess(rule, v).ok
        if (!allowed && rule.productIds?.length) allowed = evaluateAccess(rule, { ...v, ownedProductIds: await ownedProductIds(db, m.user_id, rule.productIds) }).ok
        if (!allowed) continue
      }
      rows.push({
        user_id: m.user_id,
        community_id: c.id,
        kind: "course_available",
        actor_id: n.actorId,
        target_type: target.type,
        target_id: target.id,
        title,
        body: null,
        url,
        dedupe_key: `${target.type}:${target.id}:${m.user_id}`.slice(0, 300),
      })
    }
    if (rows.length) {
      const { data: written, error: writeError } = await db.from("community_notifications").upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("user_id")
      if (writeError) {
        if (missing(writeError)) return
        throw new Error(`notifications write: ${reasonOf(writeError)}`)
      }
      const fresh = new Set(((written as { user_id: string }[] | null) ?? []).map((r) => r.user_id))
      const levels = new Map(page.map((m) => [m.user_id, m.notify_level]))
      const items = rows
        .filter((r) => fresh.has(r.user_id as string))
        .map((r) => communityPushItem({ userId: r.user_id as string, communityId: c.id, kind: "course_available", actorId: n.actorId, title, body: null, url, dedupeKey: r.dedupe_key as string, level: levels.get(r.user_id as string) ?? null }, c.name))
        .filter((i): i is PushItem => !!i)
      const left = await pushFanout(db, items, { deadline: ctx.deadline })
      after = page[page.length - 1].user_id
      if (left.length) return { again: { payload: { ...payload, after, pushLeft: left } } }
    } else {
      after = page[page.length - 1].user_id
    }
    if (page.length < PROGRAM_PAGE) return
    if (Date.now() > ctx.deadline - 8_000) return { again: { payload: { ...payload, after } } }
  }
}
