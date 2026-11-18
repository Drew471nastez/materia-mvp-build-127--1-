/**
 * ===========================================================================
 *  A BANNED CREATOR'S AI-BUILT SITE IS NOT SERVED (round AW)
 * ===========================================================================
 * A ban (app/api/admin/creators/moderate) takes down the creator page, the
 * products, the website and the OnePage (lib/seo/bans.ts), and the AI-built
 * site at <slug>.storelib.com went on answering: app/(sites)/site serves
 * whatever deployment is live for the slug and never asked whose it was. A
 * site that was the reason for the ban (a phishing page, a fake shop) stayed
 * up on Storelib's own domain, the one place a ban has to reach.
 *
 * The owner is found through the deployment's storage prefix, which every
 * publish writes as sites/<site id>/<deployment id> (lib/sites/publish.ts),
 * so the serving read stays the one it was. Soft, like every ban read: a
 * read that fails is "not banned" and the site answers as before, so a
 * database blip never takes a creator's site down.
 *
 * Pure, with its reads handed in, so tests/abuse-aw.test.ts runs it.
 */

const SITE_PREFIX = /^sites\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\//i

/** The site id in a deployment's storage prefix (sites/<site id>/<deployment id>), or null. */
export function siteIdOfPrefix(prefix: string | null | undefined): string | null {
  const m = typeof prefix === "string" ? SITE_PREFIX.exec(prefix) : null
  return m ? m[1].toLowerCase() : null
}

export interface OwnerBanReads {
  /** The creator a site belongs to (sites.creator_id), or null when it cannot be read. */
  creatorOfSite: (siteId: string) => Promise<string | null>
  /** Whether that creator is banned; lib/seo/bans.ts creatorIsBanned in the route. */
  isBanned: (creatorId: string) => Promise<boolean>
}

/** Whether the live deployment at `prefix` belongs to a banned creator. Any failure is "no". */
export async function deploymentOwnerBanned(prefix: string | null | undefined, reads: OwnerBanReads): Promise<boolean> {
  const siteId = siteIdOfPrefix(prefix)
  if (!siteId) return false
  try {
    const creatorId = await reads.creatorOfSite(siteId)
    if (!creatorId) return false
    return (await reads.isBanned(creatorId)) === true
  } catch {
    return false
  }
}
