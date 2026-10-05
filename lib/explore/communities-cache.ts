/**
 * ===========================================================================
 *  EXPLORE'S COMMUNITIES, KEPT PER PILL
 * ===========================================================================
 * Each pill, order, price and word in communities mode is one question for
 * GET /api/explore/communities (its communitiesQuery string). The answers
 * used to live only in the grid's state, so going Design, Business, Design
 * asked the server three times and showed a skeleton three times; on Slow 3G
 * that is two seconds of grey per tap.
 *
 * They are kept here now, for the page's lifetime (module memory, so a
 * client navigation away from Explore and back finds them too):
 *
 *   SEEN     an answer is shown at once, from memory, every time after the
 *            first. Older than FRESH_MS it is still shown at once and asked
 *            for again quietly, the new answer replacing it when it lands.
 *   ONE ASK  a question already on its way is not asked twice: a press that
 *            warmed it (pointerdown), an idle prefetch and the tap all share
 *            the one request.
 *   AHEAD    prefetch() warms a question nobody has asked yet; the page calls
 *            it on idle for the pills beside the current one, as many as
 *            lib/explore/prefetch-budget allows on this device and network.
 *
 * At most MAX_ENTRIES are kept, the oldest dropped first. A request is never
 * aborted when the visitor moves on: its answer is still worth keeping, and
 * the grid simply does not draw an answer to a question it is no longer
 * asking. Browser only.
 */
import type { CommunityCard } from "@/lib/communities/types"

export interface CommunitiesPage {
  items: CommunityCard[]
  next: string | null
  broadened: boolean
}

interface Entry extends CommunitiesPage {
  at: number
}

export const FRESH_MS = 60_000
const MAX_ENTRIES = 40
export const COMMUNITIES_PAGE = 24

const cache = new Map<string, Entry>()
const inflight = new Map<string, Promise<CommunitiesPage>>()

function remember(query: string, page: CommunitiesPage) {
  cache.delete(query)
  cache.set(query, { ...page, at: Date.now() })
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) break
    cache.delete(oldest)
  }
}

/** The answer kept for this question, and whether it is old enough to ask again. */
export function cachedCommunities(query: string): (CommunitiesPage & { stale: boolean }) | null {
  const hit = cache.get(query)
  if (!hit) return null
  return { items: hit.items, next: hit.next, broadened: hit.broadened, stale: Date.now() - hit.at > FRESH_MS }
}

/** The first page the server drew with the page, kept as if it had been asked for. */
export function seedCommunities(query: string, page: CommunitiesPage) {
  if (!cache.has(query)) remember(query, page)
}

/**
 * THE PAGES SHOWN WITH "SHOW MORE" ARE KEPT WITH THE FIRST. They lived only
 * in the grid's state, so a community opened from the third page and then
 * Back found the first page alone: the list was a third as tall and the
 * scroll Explore puts back landed at its end. Kept under the same question,
 * the whole list the visitor had is there again on the way back.
 */
export function keepMoreCommunities(query: string, page: CommunitiesPage) {
  remember(query, page)
}

/** More than the first page has been read for this question (keepMoreCommunities): asking again would take the visitor's list away from them. */
export function hasMoreThanFirstPage(page: CommunitiesPage): boolean {
  return page.items.length > COMMUNITIES_PAGE
}

/** Asks the route (once, however many callers), keeps the answer, and returns it. */
export function loadCommunities(query: string): Promise<CommunitiesPage> {
  const going = inflight.get(query)
  if (going) return going
  const ask = fetch(`/api/explore/communities?${query}${query ? "&" : ""}limit=${COMMUNITIES_PAGE}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status))
      const body = (await res.json()) as { items: CommunityCard[]; next: string | null; broadened?: boolean }
      const page: CommunitiesPage = { items: body.items, next: body.next, broadened: body.broadened === true }
      remember(query, page)
      return page
    })
    .finally(() => {
      inflight.delete(query)
    })
  inflight.set(query, ask)
  return ask
}

/** Warms a question nobody has asked yet; a fresh answer in memory, or one on its way, is left alone. */
export function prefetchCommunities(query: string): Promise<void> {
  const hit = cachedCommunities(query)
  if ((hit && !hit.stale) || inflight.has(query)) return Promise.resolve()
  return loadCommunities(query).then(
    () => undefined,
    () => undefined,
  )
}

/** Drop one question so the next read is from the server (pull to refresh). */
export function forgetCommunities(query: string) {
  cache.delete(query)
  inflight.delete(query)
}

/** For tests and probes: forget everything. */
export function clearCommunitiesCache() {
  cache.clear()
  inflight.clear()
}
