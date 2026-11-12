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
 *   a view     no longer written by the page's render at all:
 *              Analytics' own view event is the count, and a view posted
 *              here is held to the click's checks (clickCountable).
 *
 * These tables are only read for the time before a OnePage's first event in
 * analytics_events (lib/analytics/report-read readLegacyOnePage), so this is
 * about the record staying honest for a database that has not run part 61.
 *
 * Since round rel2-public app/api/onepage/track writes neither table: a click
 * is Analytics' link_click alone, and a row written now would never be read
 * (after the first event) or would be counted twice (before it). These rules
 * stay for the rows already there and the suites that hold them.
 */
import { isCrossSite, isPrefetch, type CollectOutcome } from "@/lib/analytics/collect"
import { isBotAgent } from "@/lib/analytics/user-agent"
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
  return (await rateLimit({ bucket: "onepage-track", subjects: [subject], windows: LIMITS.track, memoryFirst: true })) === null
}
