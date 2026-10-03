/**
 * ===========================================================================
 *  THE PROXY'S HALF OF THE PASSWORD PAGE
 * ===========================================================================
 * Asked on every page request to a website (proxy.ts), so it is built to
 * cost nothing while no website asks for a password, which is nearly always:
 *
 *   1. Which websites ask for one, as creator id to password version: one
 *      small read (lib/site-password/store protectedSites), kept for
 *      SITES_TTL_MS by this server. When the answer is "none", the request
 *      is let through with no other lookup at all.
 *   2. Only when some website asks: whose website this name is
 *      (lib/site-accounts/creator-of-name), kept for NAME_TTL_MS.
 *   3. The visitor's pass, checked against both (./gate.ts decide).
 *
 * Turning the password on or off reaches a server within SITES_TTL_MS. A
 * read that fails keeps the last answer this server had, and with none it
 * counts as "no website asks", the same as before part 92 has run: a
 * failure in here never shows a visitor an error page instead of a website.
 */
import { creatorOfName } from "@/lib/site-accounts/creator-of-name"
import type { Db } from "@/lib/site-accounts/db"
import { decide, OPEN, type GateAnswer } from "./gate"
import { protectedSites } from "./store"

export const SITES_TTL_MS = 15_000
export const NAME_TTL_MS = 60_000
const NAMES_KEPT = 1000

export interface SiteGateOptions {
  /** The service client, or null when the database is not configured. */
  db: () => Db | null
  now?: () => number
}

export type SiteGate = (input: { name: string; host: string; pathname: string; cookie: string | null | undefined }) => Promise<GateAnswer>

export function createSiteGate(o: SiteGateOptions): SiteGate {
  const clock = o.now ?? Date.now
  let sites: { at: number; map: Map<string, number> } | null = null
  const names = new Map<string, { at: number; creatorId: string | null }>()

  async function protectedNow(): Promise<Map<string, number>> {
    const t = clock()
    if (sites && t - sites.at < SITES_TTL_MS) return sites.map
    const db = o.db()
    const read = db ? await protectedSites(db) : null
    /* A read that failed keeps what was known: a website that asked a moment ago still asks. */
    const map = read ?? sites?.map ?? new Map<string, number>()
    sites = { at: t, map }
    return map
  }

  async function creatorFor(name: string): Promise<string | null> {
    const key = name.toLowerCase()
    const t = clock()
    const hit = names.get(key)
    if (hit && t - hit.at < NAME_TTL_MS) return hit.creatorId
    const db = o.db()
    const creatorId = db ? await creatorOfName(db, key) : null
    if (names.size >= NAMES_KEPT) names.clear()
    names.set(key, { at: t, creatorId })
    return creatorId
  }

  return async ({ name, host, pathname, cookie }) => {
    try {
      const map = await protectedNow()
      if (map.size === 0) return OPEN
      const creatorId = await creatorFor(name)
      if (!creatorId) return OPEN
      const version = map.get(creatorId)
      if (version === undefined) return OPEN
      return await decide({ pathname, creatorId, version, host: host.trim().toLowerCase(), cookie, now: clock() })
    } catch {
      return OPEN
    }
  }
}
