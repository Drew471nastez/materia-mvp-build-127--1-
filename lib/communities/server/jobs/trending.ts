import "server-only"

/**
 * TRENDING: each published community's trending_score from its last seven
 * days of daily figures (analytics.ts trendingScore), so Explore can sort by
 * one indexed column. Queued hourly by runCommunityJobs with payload
 * { hour } and the key trending:<hour>.
 *
 * Communities are read 200 at a time in id order, their seven days of rows
 * in one read per batch, and only a score that moved is written. A run that
 * runs out of time hands back the last id and the next run carries on.
 */
import type { JobRow } from "../../types"
import { trendingScore, type DayFigures } from "../analytics"
import { reasonOf, type Db } from "../db"
import type { JobContext, JobOutcome } from "./index"

const BATCH = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function trending(db: Db, job: JobRow, ctx: JobContext): Promise<JobOutcome | void> {
  let after = typeof job.payload?.after === "string" && UUID.test(job.payload.after) ? job.payload.after : null
  const since = new Date(ctx.now - 7 * 86_400_000).toISOString().slice(0, 10)
  const stamp = new Date(ctx.now).toISOString()
  while (Date.now() < ctx.deadline - 6_000) {
    let q = db.from("communities").select("id, trending_score").eq("status", "published").is("deleted_at", null)
    if (after) q = q.gt("id", after)
    const { data, error } = await q.order("id", { ascending: true }).limit(BATCH)
    if (error) throw new Error(`communities read: ${reasonOf(error)}`)
    const rows = (data as { id: string; trending_score: number | string | null }[] | null) ?? []
    if (rows.length === 0) return
    const { data: stats, error: statsError } = await db
      .from("community_daily_stats")
      .select("community_id, new_members, posts, comments, reactions, rsvps")
      .in("community_id", rows.map((r) => r.id))
      .gte("day", since)
      .limit(BATCH * 8)
    if (statsError) throw new Error(`daily stats read: ${reasonOf(statsError)}`)
    const byCommunity = new Map<string, Pick<DayFigures, "new_members" | "posts" | "comments" | "reactions" | "rsvps">[]>()
    for (const s of (stats as (Pick<DayFigures, "new_members" | "posts" | "comments" | "reactions" | "rsvps"> & { community_id: string })[] | null) ?? []) {
      const list = byCommunity.get(s.community_id) ?? []
      list.push(s)
      byCommunity.set(s.community_id, list)
    }
    for (const r of rows) {
      if (Date.now() >= ctx.deadline - 3_000) return { again: { payload: { ...job.payload, after } } }
      const score = trendingScore(byCommunity.get(r.id) ?? [])
      if (Number(r.trending_score ?? 0) !== score) {
        const { error: writeError } = await db.from("communities").update({ trending_score: score, trending_at: stamp }).eq("id", r.id)
        if (writeError) throw new Error(`trending ${r.id}: ${reasonOf(writeError)}`)
      }
      after = r.id
    }
    if (rows.length < BATCH) return
  }
  return { again: { payload: { ...job.payload, after } } }
}
