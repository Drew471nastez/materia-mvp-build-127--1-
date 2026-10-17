import "server-only"

/**
 * THE DAILY EMAIL ABOUT REPORTS: one moderator, one community, one day
 * (lib/notifications/report-digest.ts says when it is planned, notify.ts
 * queueReportDigest plans it). It rides the push_digest kind with
 * payload { report: true, userId, communityId, since, day }, because the
 * queue's kinds are fixed in SQL and this round adds none.
 *
 * Read again when it runs: the person must still be an active member whose
 * role reviews reports, must not have turned the email off (Settings,
 * Notifications), and there must be reports made since it was planned that
 * nobody has dealt with yet. Otherwise it ends without an email. The email
 * goes through sendCommunityEmail like every community email, keyed by the
 * day, so the outbox itself refuses a second one for the same day.
 */
import { can } from "../../permissions"
import type { Role } from "../../types"
import { reasonOf, type Db } from "../db"
import { rolePermissionsOf } from "../creator-roles"
import { sendCommunityEmail } from "../email"
import { readChoices } from "@/lib/notifications/push-bridge"
import { reportDigestData } from "@/lib/notifications/report-digest"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** The most reports one email reads; the count says if there were more. */
const READ_MAX = 50
/** A report older than this is never news, whatever the payload says. */
const OLDEST_MS = 2 * 86_400_000

export interface ReportDigestPayload {
  userId: string
  communityId: string
  since: string
  day: string
}

export function readReportDigestPayload(v: unknown): ReportDigestPayload | null {
  const p = (v ?? {}) as Record<string, unknown>
  if (p.report !== true) return null
  const userId = typeof p.userId === "string" && UUID.test(p.userId) ? p.userId : null
  const communityId = typeof p.communityId === "string" && UUID.test(p.communityId) ? p.communityId : null
  const since = typeof p.since === "string" && Number.isFinite(Date.parse(p.since)) ? p.since : null
  const day = typeof p.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(p.day) ? p.day : null
  if (!userId || !communityId || !since || !day) return null
  return { userId, communityId, since, day }
}

export type ReportDigestOutcome = "sent" | "nothing_new" | "not_staff" | "turned_off" | "unavailable"

export async function runReportDigest(db: Db, raw: unknown, now: number = Date.now(), opts: { enabled?: boolean } = {}): Promise<ReportDigestOutcome> {
  const d = readReportDigestPayload(raw)
  if (!d) throw new Error("a report digest needs payload.userId, payload.communityId, payload.since and payload.day")

  const [{ data: member, error: memberError }, perms] = await Promise.all([
    db.from("community_members").select("status, role").eq("community_id", d.communityId).eq("user_id", d.userId).maybeSingle(),
    rolePermissionsOf(db, d.communityId),
  ])
  if (memberError) throw new Error(`member read: ${reasonOf(memberError)}`)
  const m = member as { status: string; role: Role } | null
  /* The owner's own choices for this community, so a moderator the reports group was taken from stops being sent them. */
  if (!m || m.status !== "active" || !can(m.role, "review_reports", perms.perms)) return "not_staff"

  const choice = (await readChoices(db, [d.userId], now)).get(d.userId)
  if (choice?.emailOff.includes("report_digest")) return "turned_off"

  const since = new Date(Math.max(Date.parse(d.since), now - OLDEST_MS)).toISOString()
  const { data, error } = await db
    .from("community_reports")
    .select("id, target_type, reason, note, created_at, reporter_id")
    .eq("community_id", d.communityId)
    .in("status", ["open", "reviewing"])
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(READ_MAX)
  if (error) throw new Error(`reports read: ${reasonOf(error)}`)
  /* Their own reports are not news to them. */
  const reports = ((data as { target_type: string; reason: string; note: string | null; reporter_id: string | null }[] | null) ?? []).filter((r) => r.reporter_id !== d.userId)
  if (reports.length === 0) return "nothing_new"

  const outcome = await sendCommunityEmail(
    db,
    "report_digest",
    { userId: d.userId, communityId: d.communityId, data: reportDigestData(reports), key: `report_digest:${d.day}` },
    { soon: false, ...(opts.enabled === undefined ? {} : { enabled: opts.enabled }) },
  )
  return outcome === "unavailable" ? "unavailable" : "sent"
}
