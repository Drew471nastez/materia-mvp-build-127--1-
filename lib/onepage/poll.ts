// OnePage: a poll's votes, counted (round AR)
// Location: lib/onepage/poll.ts
//
// A poll block (an app block with provider "poll", lib/onepage/app-blocks)
// keeps its votes on the server (onepage_poll_votes, run-now part 411): one
// per visitor per poll, the visitor known by a cookie of their own and held
// to a limit per address (app/api/onepage/poll). The visitor sees the
// totals once they have voted, when the creator shows them; the creator
// always sees them in /app.
//
// Pure: the route and the tests read the same answers.

export const POLL_VOTER_COOKIE = "sl_pv"

/** Visitors see the totals after voting unless the creator turned it off. */
export function pollShowsResults(data: { poll_show_results?: boolean | null } | null | undefined): boolean {
  return data?.poll_show_results !== false
}

/** A voter cookie we made: 32 hex characters. Anything else is a new visitor. */
export function validVoterId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[0-9a-f]{32}$/.test(raw)
}

/** An option id the block has, or null. */
export function pollOptionOf(options: readonly { id: string }[], raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 60) return null
  return options.some((o) => o.id === raw) ? raw : null
}

export interface PollTally {
  total: number
  options: { id: string; label: string; count: number; percent: number }[]
}

/**
 * THE TOTALS. Each option's count and its share, the shares whole numbers
 * that add up to exactly 100 (largest remainder), so three options at a third
 * each read 34, 33, 33 and never 33, 33, 33. Votes for an option the creator
 * has since removed are left out of the total.
 */
export function tallyVotes(options: readonly { id: string; label: string }[], counts: Readonly<Record<string, number>>): PollTally {
  const rows = options.map((o) => ({ id: o.id, label: o.label, count: Math.max(0, Math.floor(Number(counts[o.id]) || 0)) }))
  const total = rows.reduce((n, r) => n + r.count, 0)
  if (total === 0) return { total, options: rows.map((r) => ({ ...r, percent: 0 })) }
  const exact = rows.map((r) => (r.count * 100) / total)
  const floors = exact.map(Math.floor)
  let left = 100 - floors.reduce((a, b) => a + b, 0)
  const order = exact.map((v, i) => ({ i, rest: v - floors[i] })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    if (rows[i].count === 0) continue
    floors[i] += 1
    left -= 1
  }
  return { total, options: rows.map((r, i) => ({ ...r, percent: floors[i] })) }
}

/** Rows of (option_id) as counts per option. */
export function countRows(rows: readonly { option_id?: unknown }[] | null | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of rows ?? []) if (typeof r?.option_id === "string") out[r.option_id] = (out[r.option_id] ?? 0) + 1
  return out
}
