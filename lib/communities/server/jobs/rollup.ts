import "server-only"

/**
 * ROLLUP: yesterday's figures for every community, one community_daily_stats
 * row each (lib/communities/server/analytics.ts rollupDay). Queued once a
 * day by runCommunityJobs with payload { day } and the key rollup:<day>.
 *
 * Communities are taken in id order, a batch at a time, until the run's
 * time is nearly spent; then the job hands back `again` with the last id it
 * finished, and the next run carries on from there. A community counted
 * twice (a retry) writes the same row again, never a second one. Deleted
 * communities are skipped.
 */
import type { JobRow } from "../../types"
import { rollupDay } from "../analytics"
import { reasonOf, type Db } from "../db"
import type { JobContext, JobOutcome } from "./index"

const BATCH = 25
const DAY = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function rollup(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  const day = typeof job.payload?.day === "string" && DAY.test(job.payload.day) ? job.payload.day : null
  if (!day) throw new Error("rollup needs payload.day")
  let after = typeof job.payload?.after === "string" && UUID.test(job.payload.after) ? job.payload.after : null
  while (Date.now() < ctx.deadline - 8_000) {
    let q = db.from("communities").select("id").is("deleted_at", null)
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(BATCH)
    if (error) throw new Error(`communities read: ${reasonOf(error)}`)
    const ids = ((data as { id: string }[] | null) ?? []).map((r) => r.id)
    if (ids.length === 0) return
    for (const id of ids) {
      if (Date.now() >= ctx.deadline - 4_000) return { again: { payload: { day, after } } }
      await rollupDay(db, id, day)
      after = id
    }
    if (ids.length < BATCH) return
  }
  return { again: { payload: { day, after } } }
}
