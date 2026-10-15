import "server-only"

/**
 * ===========================================================================
 *  A MEMBER WAS HERE TODAY: ONE ROW, ONCE A DAY
 * ===========================================================================
 * community_member_days (SQL part 184) holds the community, the member and
 * the UTC day, and nothing else. It is how a community's Analytics counts
 * active members for any period: members active in a day, a week, a month
 * or the period chosen are the distinct members with a row in it
 * (community_analytics). last_active_at and last_seen_at only ever say
 * when a member was last here, so a past week cannot be read from them.
 *
 * Written from the member page's heartbeat (app/api/community/<id>/presence)
 * and from anything a member does (./activity.ts recordActivity). Once per
 * member, community and day on this server: a second call the same day is
 * answered from memory and costs nothing, and a row written twice by two
 * servers is one row (the primary key). Never throws, never holds a page up.
 */
import { missing, reasonOf, type Db } from "./db"

const written = new Map<string, string>()
const MAX_REMEMBERED = 20_000
/** False once the table was not there, so a server before part 184 asks no more. */
let ready = true

export function utcDay(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** For tests: forget what was written and ask for the table again. */
export function resetMemberDays(): void {
  written.clear()
  ready = true
}

/** "written", "known" (already written today on this server), or "skipped" (no table, or the write failed). */
export async function recordMemberDay(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<"written" | "known" | "skipped"> {
  if (!ready || !communityId || !userId) return "skipped"
  const day = utcDay(now)
  const key = `${communityId}:${userId}`
  if (written.get(key) === day) return "known"
  try {
    const { error } = await db.from("community_member_days").upsert({ community_id: communityId, user_id: userId, day }, { onConflict: "community_id,day,user_id", ignoreDuplicates: true })
    if (error) {
      if (missing(error)) ready = false
      else console.error(`[communities] member day: ${reasonOf(error)}`)
      return "skipped"
    }
    if (written.size >= MAX_REMEMBERED) written.clear()
    written.set(key, day)
    return "written"
  } catch (e) {
    console.error(`[communities] member day: ${reasonOf(e)}`)
    return "skipped"
  }
}
