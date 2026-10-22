import "server-only"

/**
 * ===========================================================================
 *  A MEMBER WAS HERE: ONE ROW A DAY, AND ONE AN HOUR
 * ===========================================================================
 * community_member_days (SQL part 184) holds the community, the member and
 * the UTC day, and nothing else. It is how a community's Analytics counts
 * active members for any period: members active in a day, a week, a month
 * or the period chosen are the distinct members with a row in it
 * (community_analytics). last_active_at and last_seen_at only ever say
 * when a member was last here, so a past week cannot be read from them.
 *
 * ROUND 37: AND THE HOUR (SQL part 271, community_member_hours). A UTC day
 * is not the viewer's day: a member here at 20:00 in New York is in
 * tomorrow's UTC row. With the hour kept too, community_analytics puts each
 * member in the viewer's own day (and in an hour chart, its hour). The day
 * rows stay: they are the history from before the hours, and how long
 * counting has gone on.
 *
 * Written from the member page's heartbeat (app/api/community/<id>/presence)
 * and from anything a member does (./activity.ts recordActivity). Once per
 * member, community and day, and once per hour, on this server: a second
 * call is answered from memory and costs nothing, and a row written twice
 * by two servers is one row (the primary key). Never throws, never holds a
 * page up.
 */
import { missing, reasonOf, type Db } from "./db"

const written = new Map<string, string>()
const hoursWritten = new Map<string, string>()
const MAX_REMEMBERED = 20_000
/** False once the table was not there, so a server before part 184 asks no more. */
let ready = true
/** The same for the hours, before part 271. */
let hoursReady = true

export function utcDay(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10)
}

/** The UTC hour a moment is in, on the hour: "2026-10-15T09:00:00.000Z". */
export function utcHour(now: number = Date.now()): string {
  return new Date(Math.floor(now / 3_600_000) * 3_600_000).toISOString()
}

/** For tests: forget what was written and ask for the tables again. */
export function resetMemberDays(): void {
  written.clear()
  hoursWritten.clear()
  ready = true
  hoursReady = true
}

/** The hour's row (part 271): "written", "known", or "skipped" (no table, or the write failed). */
export async function recordMemberHour(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<"written" | "known" | "skipped"> {
  if (!hoursReady || !communityId || !userId) return "skipped"
  const hour = utcHour(now)
  const key = `${communityId}:${userId}`
  if (hoursWritten.get(key) === hour) return "known"
  try {
    const { error } = await db.from("community_member_hours").upsert({ community_id: communityId, user_id: userId, hour }, { onConflict: "community_id,hour,user_id", ignoreDuplicates: true })
    if (error) {
      if (missing(error)) hoursReady = false
      else console.error(`[communities] member hour: ${reasonOf(error)}`)
      return "skipped"
    }
    if (hoursWritten.size >= MAX_REMEMBERED) hoursWritten.clear()
    hoursWritten.set(key, hour)
    return "written"
  } catch (e) {
    console.error(`[communities] member hour: ${reasonOf(e)}`)
    return "skipped"
  }
}

/** "written", "known" (already written today on this server), or "skipped" (no table, or the write failed). The hour's row is written beside it. */
export async function recordMemberDay(db: Db, communityId: string, userId: string, now: number = Date.now()): Promise<"written" | "known" | "skipped"> {
  if (!communityId || !userId) return "skipped"
  const [day] = await Promise.all([recordDayRow(db, communityId, userId, now), recordMemberHour(db, communityId, userId, now)])
  return day
}

async function recordDayRow(db: Db, communityId: string, userId: string, now: number): Promise<"written" | "known" | "skipped"> {
  if (!ready) return "skipped"
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
