/**
 * ===========================================================================
 *  WHICH PUBLISH A COPY OF A SITE WAS READ UNDER (round 29)
 * ===========================================================================
 * A server keeps the last good copy of each site in its memory
 * (./last-good.ts), to answer with when the database does not. It knew
 * nothing of Publish: right after the owner published the Notion sales page
 * on andrewrullz.storelib.com (2026-11-26, 07:17 UTC), the new website's
 * first read missed its bound on a slow database, and every server that had
 * drawn the site before answered with the website from before the Publish
 * ("served the last good copy", 07:18 to 08:28). That answer was then held
 * as the page for every stranger, so the old website stayed up.
 *
 * The epoch is a random word held in Next's data cache under the site's tag
 * alone (published-site.ts creatorSiteTag), which Publish, Unpublish, a
 * restore, a live setting, a menu, a domain and a ban expire at once
 * (revalidatePublishedSite, `expire: 0`). A copy remembers the epoch read
 * BEFORE the read it came from, so a change that lands during the read makes
 * the copy older, never newer. A copy is served as the site only while the
 * epoch is still the one it remembers; one from before is not the site any
 * more. A product saved or a post published (the shop's and the blog's tags)
 * leaves the epoch alone: the copy still serves through those, as before.
 *
 * Nothing per request on a warm server: the callers read it beside the read
 * they already make (it is one answer of the data cache, never the
 * database), and on the failure path. Unknown (the data cache did not
 * answer) is never a match, so a copy whose publish cannot be told is never
 * passed off as current.
 */
import { randomUUID } from "node:crypto"
import { unstable_cache } from "next/cache"
import { keyedAs } from "./last-good"

/** The site's publish epoch now, or null when it cannot be read. `siteTag` is published-site.ts creatorSiteTag(creatorId). */
export async function siteEpoch(creatorId: string, siteTag: string): Promise<string | null> {
  if (!creatorId) return null
  try {
    /* No time of its own: only the site's tag ends it, so an hour without a Publish does not make every kept copy look old. */
    const word = await unstable_cache(keyedAs("site-epoch:v1", async () => randomUUID()), ["site-epoch", creatorId], { tags: [siteTag], revalidate: false })()
    return typeof word === "string" && word ? word : null
  } catch {
    return null
  }
}

/** Whether a copy read under `kept` is still the site under the epoch `now`: only a known, equal epoch is. */
export function sameEpoch(kept: string | null | undefined, now: string | null | undefined): boolean {
  return typeof kept === "string" && kept !== "" && kept === now
}
