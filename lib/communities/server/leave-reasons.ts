import "server-only"

/**
 * ===========================================================================
 *  WHY PEOPLE LEFT: KEPT, AND READ BACK FOR THE PEOPLE WHO RUN IT
 * ===========================================================================
 * community_leave_reasons comes with part 98 (supabase/sql/run-now/
 * 98_community_leave_reasons_and_location.sql): one row per answer, the
 * service role alone reads or writes it. Until that part has run every
 * function here says "not there" and nothing else: the About page does not
 * ask why (leaveReasonsReady), leaving saves nothing extra, and the
 * dashboard has no card.
 *
 * COST. Whether the table is there is asked once and remembered for the
 * process (a table does not go away), and asked again a few minutes later
 * while it is missing. The dashboard's figures are one count per reason on
 * the (community_id, created_at) index and the latest notes, a handful of
 * bounded reads for ten members or ten thousand.
 */
import { LEAVE_REASONS, type LeaveReason, type LeaveReasonsSummary } from "../leave-reasons"

export type { LeaveReasonsSummary }
import { missing, reasonOf, type Db } from "./db"

const TABLE = "community_leave_reasons"
/** While the table is missing, how long before it is looked for again. */
const RECHECK_MS = 5 * 60_000
/** Notes shown on the card. */
export const LEAVE_NOTES_SHOWN = 6

let ready: boolean | null = null
let checkedAt = 0

/** Whether part 98 has made the table, remembered once it has. */
export async function leaveReasonsReady(db: Db): Promise<boolean> {
  if (ready === true) return true
  if (ready === false && Date.now() - checkedAt < RECHECK_MS) return false
  try {
    const { error } = await db.from(TABLE).select("id", { head: true, count: "exact" }).limit(1)
    ready = !error
    if (error && !missing(error)) console.error(`[communities] leave reasons check: ${reasonOf(error)}`)
  } catch {
    ready = false
  }
  checkedAt = Date.now()
  return ready === true
}

/** Keeps one answer. Quiet when the table is not there; never stands in the way of the leave itself. */
export async function saveLeaveReason(db: Db, communityId: string, userId: string, answer: { reason: LeaveReason; note: string | null }): Promise<boolean> {
  if (!(await leaveReasonsReady(db))) return false
  try {
    const { error } = await db.from(TABLE).insert({ community_id: communityId, user_id: userId, reason: answer.reason, note: answer.note })
    if (error) {
      if (missing(error)) ready = false
      else console.error(`[communities] leave reason save: ${reasonOf(error)}`)
      return false
    }
    return true
  } catch (e) {
    console.error(`[communities] leave reason save: ${reasonOf(e)}`)
    return false
  }
}

/** The card's figures: how many gave each reason, and the latest notes. Null when the table is not there. */
export async function leaveReasonsSummary(db: Db, communityId: string): Promise<LeaveReasonsSummary | null> {
  if (!(await leaveReasonsReady(db))) return null
  try {
    const counted = await Promise.all(
      LEAVE_REASONS.map(async (r) => {
        const { count, error } = await db.from(TABLE).select("id", { head: true, count: "exact" }).eq("community_id", communityId).eq("reason", r.key)
        if (error) throw error
        return { reason: r.key as LeaveReason, count: Number(count) || 0 }
      }),
    )
    const { data, error } = await db
      .from(TABLE)
      .select("reason, note, created_at")
      .eq("community_id", communityId)
      .not("note", "is", null)
      .order("created_at", { ascending: false })
      .limit(LEAVE_NOTES_SHOWN)
    if (error) throw error
    const notes = ((data as { reason: LeaveReason; note: string | null; created_at: string }[] | null) ?? [])
      .filter((n) => (n.note || "").trim())
      .map((n) => ({ reason: n.reason, note: (n.note as string).trim(), createdAt: n.created_at }))
    return { total: counted.reduce((a, c) => a + c.count, 0), counts: counted, notes }
  } catch (e) {
    if (missing(e as { code?: string })) {
      ready = false
      return null
    }
    console.error(`[communities] leave reasons read: ${reasonOf(e)}`)
    return null
  }
}
