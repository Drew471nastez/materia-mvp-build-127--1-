/**
 * ===========================================================================
 *  COMMUNITY FEED RANKING (Default sort)
 * ===========================================================================
 * Server-side, deterministic scoring for the member feed's Default order.
 * Keyset pagination still walks last_activity_at in the database; each page
 * fetches a bounded candidate pool, ranks it, and returns the top rows.
 * New / Top / Unread are unchanged.
 *
 * Pure module (no server-only): unit-tested without a database.
 */
import type { PostKind, PostRow, Role } from "./types"

/** Weights are integers so scores stay deterministic across runtimes. */
export const FEED_RANK_WEIGHTS = {
  /** Loses one point per minute since last activity (primary signal). */
  recencyPerMinute: 1,
  reaction: 120,
  comment: 180,
  bookmark: 220,
  /** Roughly the old ~6h staff lift, expressed in score space. */
  staffOwner: 400,
  staffAdmin: 360,
  staffModerator: 120,
  featured: 90,
  /** Activity soon after publish (comments/reactions bump last_activity_at). */
  velocity: 140,
  /** Title + body present, not a thin drive-by. */
  quality: 50,
  /** Open reports on the post. */
  reportPenalty: 600,
  /** Author posted many times in this candidate batch. */
  repeatAuthorPenalty: 100,
  /** Many outbound links / promo-shaped posts. */
  promoPenalty: 180,
  /** Same tier as the viewer (membership relevance). */
  tierAffinity: 80,
  /** Level within 1 of the viewer. */
  levelAffinity: 40,
} as const

export type FeedRankWeights = typeof FEED_RANK_WEIGHTS

/** Below this many published posts in the batch, ranking stays mostly chronological. */
export const FEED_RANK_COLD_START_BATCH = 8

/** Max posts read for one ranked page (before hydrate). */
export const FEED_RANK_MAX_CANDIDATES = 100

/** Candidates per requested page size. */
export const FEED_RANK_CANDIDATE_MULT = 4

/** At most this many posts from one author on a single page. */
export const FEED_RANK_MAX_PER_AUTHOR = 2

export interface FeedRankAuthor {
  id: string
  role: Role | null
  level: number | null
  tierId: string | null
}

export interface FeedRankContext {
  now: number
  bookmarkCounts: ReadonlyMap<string, number>
  reportCounts: ReadonlyMap<string, number>
  blockedAuthors: ReadonlySet<string>
  authors: ReadonlyMap<string, FeedRankAuthor>
  viewerLevel: number
  viewerTierId: string | null
  weights: FeedRankWeights
  coldStart: boolean
}

export function feedRankEnabled(): boolean {
  return process.env.COMMUNITY_FEED_RANK !== "0"
}

function log1p(n: number): number {
  const x = Math.max(0, n)
  if (x <= 0) return 0
  return Math.floor(Math.log(1 + x) * 1000)
}

function minutesSince(iso: string, now: number): number {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return 1_000_000
  return Math.max(0, Math.floor((now - t) / 60_000))
}

function staffBoost(role: Role | null | undefined, w: FeedRankWeights): number {
  if (role === "owner") return w.staffOwner
  if (role === "admin") return w.staffAdmin
  if (role === "moderator") return w.staffModerator
  return 0
}

function promoScore(row: PostRow): number {
  const media = Array.isArray(row.media) ? row.media : []
  const links = media.filter((m) => m && typeof m === "object" && (m as { type?: string }).type === "link").length
  const embeds = media.filter((m) => m && typeof m === "object" && (m as { type?: string }).type === "embed").length
  return links + embeds
}

function qualityScore(row: PostRow): number {
  const title = (row.title ?? "").trim().length
  const body = (row.body_text ?? "").trim().length
  if (title < 3 || body < 12) return 0
  const media = Array.isArray(row.media) ? row.media.length : 0
  return 1 + (media > 0 ? 1 : 0)
}

function velocityScore(row: PostRow, now: number): number {
  const created = Date.parse(row.created_at)
  const active = Date.parse(row.last_activity_at ?? row.created_at)
  if (!Number.isFinite(created) || !Number.isFinite(active)) return 0
  const ageMin = Math.max(1, Math.floor((now - created) / 60_000))
  const bumpMin = Math.max(0, Math.floor((active - created) / 60_000))
  if (bumpMin <= 0) return 0
  /* Fast engagement in the first day scores higher. */
  const window = Math.min(ageMin, 24 * 60)
  return Math.min(3, Math.ceil((window / ageMin) * (bumpMin / Math.max(30, ageMin))))
}

/** Integer score: higher is better. */
export function scorePostRow(row: PostRow, author: FeedRankAuthor | null, ctx: FeedRankContext, authorPostsInBatch: number): number {
  const w = ctx.weights
  const activityAt = row.last_activity_at ?? row.created_at
  const recency = Math.max(0, 1_000_000 - minutesSince(activityAt, ctx.now) * w.recencyPerMinute)
  if (ctx.coldStart) {
    return recency + staffBoost(author?.role, w)
  }
  const reactions = log1p(Number(row.reaction_count) || 0)
  const comments = log1p(Number(row.comment_count) || 0)
  const bookmarks = log1p(ctx.bookmarkCounts.get(row.id) ?? 0)
  const reports = ctx.reportCounts.get(row.id) ?? 0
  const repeat = Math.max(0, authorPostsInBatch - 1)
  const promo = promoScore(row)
  let score =
    recency +
    reactions * w.reaction +
    comments * w.comment +
    bookmarks * w.bookmark +
    staffBoost(author?.role, w) +
    (row.featured ? w.featured : 0) +
    velocityScore(row, ctx.now) * w.velocity +
    qualityScore(row) * w.quality
  if (author) {
    if (ctx.viewerTierId && author.tierId && author.tierId === ctx.viewerTierId) score += w.tierAffinity
    const vl = ctx.viewerLevel || 1
    const al = author.level ?? 1
    if (Math.abs(vl - al) <= 1) score += w.levelAffinity
  }
  score -= reports * w.reportPenalty
  score -= repeat * w.repeatAuthorPenalty
  if (promo >= 2 && row.kind !== "announcement") score -= promo * w.promoPenalty
  return Math.floor(score)
}

function authorCounts(rows: PostRow[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const r of rows) {
    if (!r.author_id) continue
    out.set(r.author_id, (out.get(r.author_id) ?? 0) + 1)
  }
  return out
}

/** Deterministic ordering: score, then last activity, then id. */
export function compareRanked(a: { row: PostRow; score: number }, b: { row: PostRow; score: number }): number {
  if (b.score !== a.score) return b.score - a.score
  const at = Date.parse(b.row.last_activity_at ?? b.row.created_at) - Date.parse(a.row.last_activity_at ?? a.row.created_at)
  if (at !== 0) return at
  return b.row.id.localeCompare(a.row.id)
}

/**
 * Rank a candidate page and return up to `limit` rows. Blocked authors are
 * removed. Pinned posts should be handled outside this (first page only).
 */
export function rankPostRows(rows: PostRow[], ctx: FeedRankContext, limit: number): PostRow[] {
  if (!rows.length || limit <= 0) return []
  const counts = authorCounts(rows)
  const scored = rows
    .filter((r) => !r.author_id || !ctx.blockedAuthors.has(r.author_id))
    .map((row) => {
      const author = row.author_id ? ctx.authors.get(row.author_id) ?? null : null
      const n = row.author_id ? counts.get(row.author_id) ?? 0 : 0
      return { row, score: scorePostRow(row, author, ctx, n) }
    })
    .sort(compareRanked)
  const out: PostRow[] = []
  const taken = new Map<string, number>()
  const used = new Set<string>()
  for (const { row } of scored) {
    if (out.length >= limit) break
    const aid = row.author_id ?? ""
    const c = aid ? taken.get(aid) ?? 0 : 0
    if (aid && c >= FEED_RANK_MAX_PER_AUTHOR) continue
    out.push(row)
    used.add(row.id)
    if (aid) taken.set(aid, c + 1)
  }
  if (out.length < limit) {
    for (const { row } of scored) {
      if (out.length >= limit) break
      if (used.has(row.id)) continue
      out.push(row)
      used.add(row.id)
    }
  }
  return out
}

/** Legacy in-page staff lift for tests and cold-start fallback on hydrated views. */
export const STAFF_BOOST_MS = 6 * 60 * 60 * 1000
const BOOSTED_ROLES = new Set(["owner", "admin"])

export function boostStaff<T extends { id: string; lastActivityAt?: string | null; createdAt: string; author: { role?: string | null } | null }>(page: T[], boost = STAFF_BOOST_MS): T[] {
  if (page.length < 2 || !page.some((p) => BOOSTED_ROLES.has(p.author?.role ?? ""))) return page
  const at = (p: T) => Date.parse(p.lastActivityAt || p.createdAt) || 0
  return page
    .map((p, i) => ({ p, i, score: at(p) + (BOOSTED_ROLES.has(p.author?.role ?? "") ? boost : 0) }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((x) => x.p)
}
