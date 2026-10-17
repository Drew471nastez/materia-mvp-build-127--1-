import "server-only"

/**
 * ===========================================================================
 *  A MEMBER REPORTS A POST, A COMMENT, A MESSAGE OR A PERSON
 * ===========================================================================
 * The report lands in the community's queue (community_reports), which the
 * moderators work through on the creator side (lib/communities/server/
 * moderation.ts and its routes). One open report per reporter per target:
 * pressing Report twice is one report, answered as already sent.
 *
 * The target must be in this community and visible to the reporter. The
 * owner, admins and moderators each hear about it in their inbox, once per
 * report; a community has a handful of them, so this is a short loop.
 *
 * WHERE THEIR BELL OPENS. The moderation queue (/app/community/<id>/
 * moderation) for those who can open /app (they have a store); the
 * reported thing itself for a moderator who does not. On their phones it
 * is a low priority kind: the first report pushes, more within five
 * minutes are one "3 new reports".
 *
 * AND ONE EMAIL A DAY AT MOST (notify.ts queueReportDigest, lib/
 * notifications/report-digest.ts): never an email per report.
 */
import { LENGTHS } from "../limits"
import { can } from "../permissions"
import { REPORT_REASONS, isOneOf, type ReportReason, type ReportTarget, type Role } from "../types"
import { isUniqueViolation, missing, reasonOf } from "./db"
import { chatSpace } from "./chat"
import { cleanText, visiblePostRow, type Checked, type WriteContext } from "./feed"
import { escalateReport } from "./moderation"
import { notifyMember, queueReportDigest } from "./notify"
import { hideAfterReports } from "./safety"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const REPORT_LABELS: Record<ReportReason, string> = {
  spam: "Spam",
  abuse: "Abusive",
  harassment: "Harassment",
  off_topic: "Off topic",
  illegal: "Illegal",
  other: "Something else",
}

/** At most this many staff are told about one report. */
const STAFF_MAX = 25

export interface ReportInput {
  targetType: ReportTarget
  targetId: string
  reason: ReportReason
  note: string | null
}

export function checkReport(raw: unknown): Checked<ReportInput> {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  if (!isOneOf(["post", "comment", "member", "message"] as const, r.targetType)) return { ok: false, error: "Choose what to report.", status: 400 }
  if (typeof r.targetId !== "string" || !UUID.test(r.targetId)) return { ok: false, error: "That is gone.", status: 404 }
  if (!isOneOf(REPORT_REASONS, r.reason)) return { ok: false, error: "Choose a reason.", status: 400 }
  const note = cleanText(r.note, LENGTHS.reportNote.max).replace(/\s+/g, " ")
  if (note.length > LENGTHS.reportNote.max) return { ok: false, error: "Keep the note under 500 characters.", status: 400 }
  return { ok: true, value: { targetType: r.targetType, targetId: r.targetId.toLowerCase(), reason: r.reason, note: note || null } }
}

/** Where the target is, for the moderators' notification; null when it is not in this community or not visible. */
async function targetUrl(w: WriteContext, input: ReportInput): Promise<string | null> {
  const { db, community, viewer } = w
  const base = `/community/${community.slug}`
  if (input.targetType === "post") {
    const found = await visiblePostRow(db, community, viewer, input.targetId)
    return found && found.row.status === "published" ? `${base}/post/${input.targetId}` : null
  }
  if (input.targetType === "comment") {
    const { data } = await db.from("community_feed_comments").select("post_id, status").eq("id", input.targetId).eq("community_id", community.id).maybeSingle()
    if (!data || data.status !== "published") return null
    const found = await visiblePostRow(db, community, viewer, data.post_id)
    return found ? `${base}/post/${data.post_id}#c-${input.targetId}` : null
  }
  if (input.targetType === "message") {
    const { data } = await db.from("community_messages").select("space_id, status").eq("id", input.targetId).eq("community_id", community.id).maybeSingle()
    if (!data || data.status !== "published") return null
    const space = await chatSpace(db, community, viewer, data.space_id)
    return space ? `${base}/space/${space.slug}` : null
  }
  const { data } = await db.from("community_members").select("user_id, status").eq("community_id", community.id).eq("user_id", input.targetId).maybeSingle()
  return data ? `${base}/members/${input.targetId}` : null
}

export async function createReport(w: WriteContext, input: ReportInput): Promise<Checked<{ already: boolean }>> {
  const { db, community, viewer } = w
  if (!viewer.userId) return { ok: false, error: "Sign in to report.", status: 401 }
  if (input.targetType === "member" && input.targetId === viewer.userId) return { ok: false, error: "You cannot report yourself.", status: 400 }
  const url = await targetUrl(w, input)
  if (!url) return { ok: false, error: "That is gone.", status: 404 }

  const { data, error } = await db
    .from("community_reports")
    .insert({ community_id: community.id, reporter_id: viewer.userId, target_type: input.targetType, target_id: input.targetId, reason: input.reason, note: input.note })
    .select("id")
    .single()
  if (error) {
    if (isUniqueViolation(error)) return { ok: true, value: { already: true } }
    if (!missing(error)) console.error(`[communities] report not written: ${reasonOf(error)}`)
    return { ok: false, error: "The report did not send. Try again.", status: missing(error) ? 503 : 500 }
  }
  await hideAfterReports(db, community, input)

  /*
    ILLEGAL IS NOT ONE COMMUNITY'S DECISION. A report whose reason is
    "Illegal" goes to Storelib's queue as well as this one
    (./moderation.ts escalateReport, /admin/communities), which reads what
    kind of thing it is, why, and which community, and never the words
    themselves. The community's own moderators still see it and still resolve
    or dismiss it; the flag beside it only means Storelib has been told. One
    member can send at most ten reports an hour (RATE_LIMITS.report), so
    this cannot be used to flood that queue.
  */
  if (input.reason === "illegal") {
    await escalateReport(db, { community, actorId: null, actorKind: "system", id: data.id, reason: "Reported as illegal" })
  }

  try {
    const { data: staff } = await db
      .from("community_members")
      .select("user_id, role")
      .eq("community_id", community.id)
      .eq("status", "active")
      .in("role", ["owner", "admin", "moderator"])
      .limit(STAFF_MAX)
    const reviewers = ((staff as { user_id: string; role: Role }[] | null) ?? []).filter((s) => can(s.role, "review_reports") && s.user_id !== viewer.userId)
    const { data: stores } = reviewers.length ? await db.from("creators").select("user_id").in("user_id", reviewers.map((s) => s.user_id)) : { data: [] }
    const withApp = new Set(((stores as { user_id: string }[] | null) ?? []).map((r) => r.user_id))
    const queue = `/app/community/${community.id}/moderation`
    for (const s of reviewers) {
      await notifyMember(db, {
        userId: s.user_id,
        communityId: community.id,
        kind: "report",
        actorId: viewer.userId,
        target: { type: input.targetType, id: input.targetId },
        title: `A ${input.targetType} was reported: ${REPORT_LABELS[input.reason].toLowerCase()}`,
        body: input.note,
        url: withApp.has(s.user_id) ? queue : url,
        dedupeKey: `report:${data.id}:${s.user_id}`,
      })
    }
    await queueReportDigest(db, { communityId: community.id, userIds: reviewers.map((s) => s.user_id) })
  } catch (e) {
    console.error(`[communities] report notice: ${reasonOf(e)}`)
  }
  return { ok: true, value: { already: false } }
}
