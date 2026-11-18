/**
 * ===========================================================================
 *  WHAT THE PLATFORM'S LAST FEW SITES LOOKED LIKE (round 56)
 * ===========================================================================
 * Both engines lean away from what was just made, across creators: the art
 * directions and design brain recipes the most recent finished sites used,
 * and their fingerprints (lib/ai-builder/novelty.ts). The agent keeps them on
 * its checkpoint (direction.primary, recipe, fingerprint); the native engine
 * on its job state (state.native: direction, recipeId, fingerprint).
 *
 * Ids and a handful of words per site only: no copy, no names, no files, so
 * nothing of another creator's site reaches a job. One light query per job,
 * and it fails quiet (no pressure, never a blocked job).
 */
import { readFingerprints, type SiteFingerprint } from "./novelty"

type Db = { from: (table: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

export interface RecentDesigns {
  directions: string[]
  recipes: string[]
  fingerprints: SiteFingerprint[]
}

export const NO_RECENT: RecentDesigns = { directions: [], recipes: [], fingerprints: [] }

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 80) : null)

/** The rows of a recent-jobs read as ids and fingerprints. Pure. */
export function readRecentDesigns(rows: unknown[], limit = 8): RecentDesigns {
  const directions: string[] = []
  const recipes: string[] = []
  const fps: unknown[] = []
  for (const raw of rows.slice(0, limit)) {
    const r = (raw ?? {}) as { dir?: { primary?: unknown } | null; rec?: unknown; fp?: unknown; nat?: { direction?: unknown; recipeId?: unknown; fingerprint?: unknown } | null }
    const d = str(r.dir?.primary) ?? str(r.nat?.direction)
    const c = str(r.rec) ?? str(r.nat?.recipeId)
    if (d) directions.push(d)
    if (c) recipes.push(c)
    if (r.fp) fps.push(r.fp)
    else if (r.nat?.fingerprint) fps.push(r.nat.fingerprint)
  }
  return { directions: [...new Set(directions)], recipes: [...new Set(recipes)], fingerprints: readFingerprints(fps, limit) }
}

/** The platform's most recent finished sites, both engines, memoised per job. */
export function recentSiteDesigns(db: Db, limit = 8): () => Promise<RecentDesigns> {
  let memo: Promise<RecentDesigns> | null = null
  return () => {
    memo ??= (async () => {
      try {
        const { data, error } = await db
          .from("ai_site_jobs")
          .select("dir:checkpoint->direction, rec:checkpoint->recipe, fp:checkpoint->fingerprint, nat:state->native")
          .in("status", ["complete", "partial"])
          .order("created_at", { ascending: false })
          .limit(limit)
        if (error || !Array.isArray(data)) return NO_RECENT
        return readRecentDesigns(data, limit)
      } catch {
        return NO_RECENT
      }
    })()
    return memo
  }
}
