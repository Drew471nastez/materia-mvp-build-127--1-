/**
 * Community feed ranking (Default sort, server-side).
 * Run with: npm run test:push
 */
import { FEED_RANK_WEIGHTS, rankPostRows, scorePostRow, compareRanked, feedRankEnabled } from "@/lib/communities/feed-rank"
import type { PostRow } from "@/lib/communities/types"

let passed = 0
let failed = 0
const failures: string[] = []
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++
    console.log(`  ok    ${name}`)
  } else {
    failed++
    failures.push(name)
    console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`)
  }
}

const now = Date.parse("2026-01-15T12:00:00.000Z")
const at = (hoursAgo: number) => new Date(now - hoursAgo * 3600_000).toISOString()

function row(partial: Partial<PostRow> & { id: string }): PostRow {
  return {
    id: partial.id,
    community_id: "c1",
    space_id: null,
    author_id: partial.author_id ?? "u1",
    kind: "post",
    title: partial.title ?? "Hello world",
    body: "",
    body_text: partial.body_text ?? "This is a long enough body for quality.",
    media: partial.media ?? [],
    pinned: false,
    featured: !!partial.featured,
    locked: false,
    status: "published",
    removed_by: null,
    removed_reason: null,
    removed_at: null,
    reaction_count: partial.reaction_count ?? 0,
    comment_count: partial.comment_count ?? 0,
    created_at: partial.created_at ?? at(2),
    edited_at: null,
    last_activity_at: partial.last_activity_at ?? partial.created_at ?? at(2),
    updated_at: partial.created_at ?? at(2),
    deleted_at: null,
    ...partial,
  }
}

function ctx(overrides: Partial<import("@/lib/communities/feed-rank").FeedRankContext> = {}) {
  return {
    now,
    bookmarkCounts: new Map<string, number>(),
    reportCounts: new Map<string, number>(),
    blockedAuthors: new Set<string>(),
    authors: new Map(),
    viewerLevel: 3,
    viewerTierId: "tier-a",
    weights: FEED_RANK_WEIGHTS,
    coldStart: false,
    smallCommunity: false,
    ...overrides,
  }
}

async function main() {
  console.log("\nCommunity feed rank")

  check("enabled unless COMMUNITY_FEED_RANK=0", feedRankEnabled() === (process.env.COMMUNITY_FEED_RANK !== "0"))

  const recent = row({ id: "r1", last_activity_at: at(0), reaction_count: 1 })
  const stale = row({ id: "s1", reaction_count: 1, created_at: at(3), last_activity_at: at(3) })
  const scoredRecent = scorePostRow(recent, null, ctx(), 1)
  const scoredStale = scorePostRow(stale, null, ctx(), 1)
  check("equal engagement ranks newer activity higher", scoredRecent > scoredStale, `${scoredRecent} vs ${scoredStale}`)

  const blocked = row({ id: "b1", author_id: "bad" })
  const ranked = rankPostRows([blocked, recent], ctx({ blockedAuthors: new Set(["bad"]) }), 5)
  check("blocked authors are removed", ranked.length === 1 && ranked[0].id === "r1")

  const spam1 = row({ id: "s1", author_id: "spammer", last_activity_at: at(0), reaction_count: 30 })
  const spam2 = row({ id: "s2", author_id: "spammer", last_activity_at: at(0), reaction_count: 25 })
  const spam3 = row({ id: "s3", author_id: "spammer", last_activity_at: at(0), reaction_count: 20 })
  const other = row({ id: "o1", author_id: "other", last_activity_at: at(1), reaction_count: 1 })
  const diverse = rankPostRows([spam1, spam2, spam3, other], ctx(), 3)
  check(
    "author diversity prefers another voice before a third from the same author",
    diverse.length === 3 && diverse[0].author_id === "spammer" && diverse[1].author_id === "spammer" && diverse[2].author_id === "other",
    diverse.map((p) => p.id).join(),
  )

  const run1 = rankPostRows([recent, stale], ctx(), 2)
  const run2 = rankPostRows([recent, stale], ctx(), 2)
  check("deterministic ranking", run1.map((p) => p.id).join() === run2.map((p) => p.id).join())

  const cold = scorePostRow(stale, { id: "u", role: "admin", level: 1, tierId: null }, ctx({ coldStart: true }), 1)
  const hot = scorePostRow(stale, { id: "u", role: "member", level: 1, tierId: null }, ctx({ coldStart: false }), 1)
  check("cold start is mostly recency + staff", cold > 0 && hot !== cold)

  check("compareRanked ties break on activity then id", compareRanked({ row: recent, score: 1 }, { row: stale, score: 1 }) < 0)

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failures.length) {
    console.log(failures.join("\n"))
    process.exit(1)
  }
}

main()
