/**
 * THE FIGURE BESIDE EACH BLOCK IN THE EDITOR'S LIST, ASKED FOR ONCE.
 *
 * Every row of the list asked /api/onepage/stats for its own last year of
 * clicks as it mounted: a page of twenty blocks was twenty requests, each
 * reading the whole page's views to answer one number. The rows now share
 * one answer for the page (every block's clicks, app/api/onepage/stats
 * without a block), held for half a minute so a list drawn again, a row
 * dragged or a tab switched does not ask again.
 */

const HOLD_MS = 30_000
const YEAR_MS = 365 * 86_400_000

type Counts = Record<string, number>
const held = new Map<string, { at: number; answer: Promise<Counts | null> }>()

/** Every block's clicks over the last year (sign-ups for an email block), or null when the answer did not come. */
export function pageClickCounts(onepageId: string, timeZone: string, now = Date.now()): Promise<Counts | null> {
  const key = `${onepageId}|${timeZone}`
  const kept = held.get(key)
  if (kept && now - kept.at < HOLD_MS) return kept.answer
  const params = new URLSearchParams({
    onepage_id: onepageId,
    start: new Date(now - YEAR_MS).toISOString(),
    end: new Date(now).toISOString(),
    tz: timeZone,
  })
  const answer = fetch(`/api/onepage/stats?${params.toString()}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { block_clicks?: Counts } | null) => (body && body.block_clicks && typeof body.block_clicks === "object" ? body.block_clicks : null))
    .catch(() => null)
  held.set(key, { at: now, answer })
  /* A failed answer is not kept: the next row to ask tries again. */
  void answer.then((a) => {
    if (a === null && held.get(key)?.answer === answer) held.delete(key)
  })
  return answer
}
