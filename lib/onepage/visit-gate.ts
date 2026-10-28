import "server-only"

/**
 * ===========================================================================
 *  WHO THE ONEPAGE'S OWN TABLES COUNT: THE SAME PEOPLE ANALYTICS COUNTS
 * ===========================================================================
 * onepage_views and onepage_clicks were written for every request that
 * reached them: a robot, a chat app fetching the link's preview, a browser
 * prefetching the page, the creator checking their own page after an edit,
 * a script posting clicks in a loop. Analytics' pipeline (lib/analytics/
 * collect) has refused all of those for a long time, so the editor's figures
 * and Analytics' differed by exactly that.
 *
 * They are asked the same questions now:
 *
 *   a click    the pipeline's own answer for the same click decides: a
 *              robot, a prefetch, another site's request, too many from
 *              one address and the owner write nothing to either table
 *              (`legacyClickAllowed`). With no answer (a page with no
 *              creator behind it) the same checks are made here.
 *   a view     at the page's render, before anything is written: not a
 *              robot or a link preview, not a prefetch, not the owner or
 *              their team (lib/analytics/own-visit), not a browser the app
 *              marked as theirs (lib/analytics/own-marker).
 *
 * These tables are only read for the time before a OnePage's first event in
 * analytics_events (lib/analytics/report-read readLegacyOnePage), so this is
 * about the record staying honest for a database that has not run part 61.
 */
import { isCrossSite, isPrefetch, type CollectOutcome } from "@/lib/analytics/collect"
import { isBotAgent } from "@/lib/analytics/user-agent"
import { isOwnVisit } from "@/lib/analytics/own-visit"
import { OWN_MARKER_COOKIE, OWN_MARKER_DOMAIN_COOKIE, marksOwner } from "@/lib/analytics/own-marker"
import { LIMITS, addressSubject, rateLimit } from "@/lib/api/rate-limit"

/** The pipeline's reasons that mean nobody real pressed it, or the owner did. */
const REFUSED = new Set<CollectOutcome["reason"]>(["bot", "prefetch", "cross_site", "rate_limited", "own", "invalid"])

/** Whether the OnePage's own click table may count a click the pipeline answered for. */
export function legacyClickAllowed(outcome: Pick<CollectOutcome, "reason"> | null): boolean {
  return !!outcome && !REFUSED.has(outcome.reason)
}

/** A person's own request, looking at the page: not a robot, a preview, a prefetch or another site. */
export function looksLikeVisitor(headers: Headers): boolean {
  return !isBotAgent(headers.get("user-agent")) && !isPrefetch(headers) && !isCrossSite(headers)
}

/**
 * The checks for a click the pipeline could not answer for: a visitor, under
 * the tracker's own limit per address (lib/api/rate-limit, LIMITS.track).
 */
export async function clickCountable(request: Request): Promise<boolean> {
  if (!looksLikeVisitor(request.headers)) return false
  const subject = addressSubject(request)
  if (!subject) return true
  return (await rateLimit({ bucket: "onepage-track", subjects: [subject], windows: LIMITS.track })) === null
}

/**
 * Whether the page's render may count a view in onepage_views. The page is
 * drawn for every request, so the request is the evidence: its signature,
 * its purpose, and the owner's session or marker.
 */
export async function viewCountable(input: {
  headers: Headers
  cookie: (name: string) => string | undefined
  cookieNames: string[]
  ownerUserId: string | null
  creatorId: string | null
}): Promise<boolean> {
  const ua = input.headers.get("user-agent")
  if (isBotAgent(ua) || isPrefetch(input.headers)) return false
  if (input.creatorId && (marksOwner(input.cookie(OWN_MARKER_COOKIE), input.creatorId) || marksOwner(input.cookie(OWN_MARKER_DOMAIN_COOKIE), input.creatorId))) return false
  return !(await isOwnVisit(input.cookieNames, input.ownerUserId, input.creatorId))
}
