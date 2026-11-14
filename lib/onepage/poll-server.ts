import "server-only"

/**
 * A poll's votes on the server (round AR): one per visitor per poll, kept in
 * onepage_poll_votes (run-now part 411) under a key made from the visitor's
 * own cookie, so the unique index is what stops a second vote, not the page.
 * The block is read from the PUBLISHED page (lib/onepage/page-block): a vote
 * for a poll that is off, out of its schedule or not on the page, or for an
 * answer it does not have, is refused. Before part 411 has run a vote is
 * refused with "not_ready" and the page says the poll is not taking votes.
 */
import { createHash } from "node:crypto"
import { pollOptions, type AppBlockData } from "./app-blocks"
import { pollOptionOf, pollShowsResults, tallyVotes, type PollTally } from "./poll"
import { liveAppBlockData, publishedBlocksOf } from "./page-block"
import { readLivePage } from "./tips-server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

const MISSING = new Set(["42P01", "PGRST205", "42703", "PGRST204"])

/** The key a vote is kept under: the cookie, for this poll only, hashed (the cookie itself is never stored). */
export function voterKey(voterId: string, onepageId: string, blockId: string): string {
  return createHash("sha256").update(`${onepageId}:${blockId}:${voterId}`).digest("hex").slice(0, 40)
}

/*
  COUNTED BY THE DATABASE, ONE NUMBER PER ANSWER. The votes used to be read
  as rows and counted here, `.limit(50_000)`, but the API hands back at most
  1,000 rows a read, so past a thousand votes every visitor and the editor saw
  a total stuck at 1,000 and shares from whichever thousand came back. A poll
  has a handful of answers: each is one exact count, asked together.
*/
export async function tallyFor(db: Db, onepageId: string, blockId: string, options: { id: string; label: string }[]): Promise<PollTally | null> {
  if (options.length === 0) return tallyVotes(options, {})
  const counted = await Promise.all(
    options.slice(0, 20).map(async (o) => {
      const { count, error } = await db.from("onepage_poll_votes").select("option_id", { count: "exact", head: true }).eq("onepage_id", onepageId).eq("block_id", blockId).eq("option_id", o.id)
      return error ? null : ([o.id, Number(count) || 0] as const)
    }),
  )
  if (counted.some((c) => c === null)) return null
  return tallyVotes(options, Object.fromEntries(counted as (readonly [string, number])[]))
}

export type VoteAnswer =
  | { ok: true; voted: string; already: boolean; tally: PollTally | null }
  | { ok: false; status: number; code: "not_found" | "bad_option" | "not_ready" | "failed" }

/** One vote. A visitor who voted already gets their own vote back, never a second. */
export async function castVote(db: Db, a: { onepageId: unknown; blockId: unknown; optionId: unknown; voterId: string }): Promise<VoteAnswer> {
  const page = await readLivePage(db, a.onepageId)
  if (!page) return { ok: false, status: 404, code: "not_found" }
  const data = liveAppBlockData<AppBlockData & { poll_show_results?: boolean }>(publishedBlocksOf(page), a.blockId, "poll")
  if (!data) return { ok: false, status: 404, code: "not_found" }
  const options = pollOptions(data)
  const option = pollOptionOf(options, a.optionId)
  if (!option) return { ok: false, status: 400, code: "bad_option" }
  const blockId = String(a.blockId)
  const key = voterKey(a.voterId, page.id, blockId)
  const { error } = await db.from("onepage_poll_votes").insert({ onepage_id: page.id, block_id: blockId, option_id: option, voter_key: key })
  let voted = option
  let already = false
  if (error) {
    if (MISSING.has(error.code)) return { ok: false, status: 503, code: "not_ready" }
    if (error.code !== "23505") return { ok: false, status: 500, code: "failed" }
    already = true
    const { data: mine } = await db.from("onepage_poll_votes").select("option_id").eq("onepage_id", page.id).eq("block_id", blockId).eq("voter_key", key).maybeSingle()
    voted = typeof (mine as { option_id?: unknown } | null)?.option_id === "string" ? (mine as { option_id: string }).option_id : option
  }
  const tally = pollShowsResults(data) ? await tallyFor(db, page.id, blockId, options) : null
  return { ok: true, voted, already, tally }
}

/** What this visitor sees on load: their vote, and the totals when they voted and the creator shows them. */
export async function pollStateFor(db: Db, a: { onepageId: unknown; blockId: unknown; voterId: string | null }): Promise<{ voted: string | null; tally: PollTally | null; open: boolean }> {
  const page = await readLivePage(db, a.onepageId)
  if (!page) return { voted: null, tally: null, open: false }
  const data = liveAppBlockData<AppBlockData & { poll_show_results?: boolean }>(publishedBlocksOf(page), a.blockId, "poll")
  if (!data) return { voted: null, tally: null, open: false }
  const blockId = String(a.blockId)
  if (!a.voterId) return { voted: null, tally: null, open: true }
  const { data: mine, error } = await db.from("onepage_poll_votes").select("option_id").eq("onepage_id", page.id).eq("block_id", blockId).eq("voter_key", voterKey(a.voterId, page.id, blockId)).maybeSingle()
  if (error) return { voted: null, tally: null, open: !MISSING.has(error.code) }
  const voted = typeof (mine as { option_id?: unknown } | null)?.option_id === "string" ? (mine as { option_id: string }).option_id : null
  const tally = voted && pollShowsResults(data) ? await tallyFor(db, page.id, blockId, pollOptions(data)) : null
  return { voted, tally, open: true }
}
