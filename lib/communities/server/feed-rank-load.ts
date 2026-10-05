import "server-only"

/**
 * Batch reads for feed ranking: blocks, saves and open reports.
 */
import type { PostRow } from "../types"
import type { FeedRankAuthor, FeedRankContext, FeedRankWeights } from "../feed-rank"
import { FEED_RANK_COLD_START_BATCH, FEED_RANK_WEIGHTS } from "../feed-rank"
import type { Viewer } from "./context"
import { authorViews } from "./directory"
import { missing, reasonOf, type Db } from "./db"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function blockedAuthorIds(db: Db, viewerId: string | null): Promise<Set<string>> {
  const out = new Set<string>()
  if (!viewerId || !UUID.test(viewerId)) return out
  try {
    const { data, error } = await db.from("user_blocks").select("blocked_id").eq("blocker_id", viewerId)
    if (error) {
      if (!missing(error)) console.error(`[communities] feed rank blocks: ${reasonOf(error)}`)
      return out
    }
    for (const r of (data as { blocked_id: string }[] | null) ?? []) if (r.blocked_id) out.add(r.blocked_id)
  } catch (e) {
    console.error(`[communities] feed rank blocks: ${reasonOf(e)}`)
  }
  return out
}

async function bookmarkCounts(db: Db, communityId: string, postIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!postIds.length) return out
  try {
    const { data, error } = await db.from("community_bookmarks").select("post_id").eq("community_id", communityId).in("post_id", postIds.slice(0, 200))
    if (error) return out
    for (const r of (data as { post_id: string }[] | null) ?? []) out.set(r.post_id, (out.get(r.post_id) ?? 0) + 1)
  } catch {
    /* Saves are optional signal. */
  }
  return out
}

async function openReportCounts(db: Db, communityId: string, postIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (!postIds.length) return out
  try {
    const { data, error } = await db
      .from("community_reports")
      .select("target_id")
      .eq("community_id", communityId)
      .eq("target_type", "post")
      .in("status", ["open", "reviewing"])
      .in("target_id", postIds.slice(0, 200))
    if (error) return out
    for (const r of (data as { target_id: string }[] | null) ?? []) out.set(r.target_id, (out.get(r.target_id) ?? 0) + 1)
  } catch {
    /* Reports are optional signal. */
  }
  return out
}

export async function buildFeedRankContext(
  db: Db,
  communityId: string,
  viewer: Viewer,
  rows: PostRow[],
  weights: FeedRankWeights = FEED_RANK_WEIGHTS,
  now = Date.now(),
): Promise<FeedRankContext> {
  const postIds = rows.map((r) => r.id)
  const authorIds = rows.map((r) => r.author_id)
  const [blocked, bookmarks, reports, authors] = await Promise.all([
    blockedAuthorIds(db, viewer.userId),
    bookmarkCounts(db, communityId, postIds),
    openReportCounts(db, communityId, postIds),
    authorViews(db, communityId, authorIds),
  ])
  const rankAuthors = new Map<string, FeedRankAuthor>()
  for (const [id, a] of authors) {
    rankAuthors.set(id, { id, role: a.role, level: a.level, tierId: viewer.tierId && id === viewer.userId ? viewer.tierId : null })
  }
  /* Tier per author from membership row when available (viewer already has tierId). */
  try {
    const ids = [...new Set(authorIds.filter((x): x is string => !!x))]
    if (ids.length) {
      const { data } = await db.from("community_members").select("user_id, tier_id").eq("community_id", communityId).in("user_id", ids.slice(0, 200))
      for (const m of (data as { user_id: string; tier_id: string | null }[] | null) ?? []) {
        const have = rankAuthors.get(m.user_id)
        if (have) rankAuthors.set(m.user_id, { ...have, tierId: m.tier_id })
      }
    }
  } catch {
    /* Affinity without tier still works. */
  }
  return {
    now,
    bookmarkCounts: bookmarks,
    reportCounts: reports,
    blockedAuthors: blocked,
    authors: rankAuthors,
    viewerLevel: viewer.level ?? 1,
    viewerTierId: viewer.tierId,
    weights,
    coldStart: rows.length < FEED_RANK_COLD_START_BATCH,
  }
}
