/**
 * ===========================================================================
 *  A NEW NAME OR PHOTO, ON EVERY PUBLIC PAGE AT ONCE
 * ===========================================================================
 * The name and the photo are read by the creator page and product pages
 * through a cache tagged creatorTag (lib/commerce/product-page-cache), and
 * by the live website through the site's own cache, tagged creatorSiteTag
 * (lib/website-builder/published-site buildSite: the profile is drawn into
 * the site and held for an hour, until a Publish). Settings and the photo
 * route cleared only the first, and with "max", which in Next 16 marks the
 * entry stale and hands the next visitor the old copy while a new one is
 * drawn. So a creator who renamed themselves saw the old name on their
 * creator page once, and on their website for up to an hour.
 *
 * Both are now expired at once ({ expire: 0 }): the next view is the new name.
 * `deps` is for the test; the routes use Next's own.
 */
export interface IdentityCacheDeps {
  expireTag: (tag: string) => void
  expireSite: (creatorId: string) => Promise<void>
  /** The published OnePage's held owner and row (lib/onepage/public-cache), which show the same name and photo. */
  expireOnePage?: (userId: string) => Promise<void>
  /** The CDN's copy of storelib.com/<handle> and its product pages (lib/storefront/creator-page-purge). */
  expireCreatorPages?: (userId: string) => Promise<void>
}

const creatorTagOf = (id: string) => `creator:${id}`

async function nextDeps(): Promise<IdentityCacheDeps> {
  const [{ revalidateTag }, { revalidatePublishedSite }, { onePageChangedFor }, { creatorPagesChanged }] = await Promise.all([
    import("next/cache"),
    import("@/lib/website-builder/published-site"),
    import("@/lib/onepage/public-cache"),
    import("@/lib/storefront/creator-page-purge"),
  ])
  return { expireTag: (tag) => revalidateTag(tag, { expire: 0 }), expireSite: revalidatePublishedSite, expireOnePage: (userId) => onePageChangedFor(userId), expireCreatorPages: (userId) => creatorPagesChanged({ userId }) }
}

/** Never throws: the profile is saved already, and every cache catches up on its own. */
export async function identityChanged(ids: { userId: string; creatorId: string | null | undefined }, deps?: IdentityCacheDeps): Promise<void> {
  try {
    const d = deps ?? (await nextDeps())
    d.expireTag(creatorTagOf(ids.userId))
    if (d.expireOnePage) await d.expireOnePage(ids.userId)
    if (ids.creatorId) {
      d.expireTag(creatorTagOf(ids.creatorId))
      await d.expireSite(ids.creatorId)
    }
    /* And the CDN's minute-long copy of the creator page and its product pages (round 48, lib/storefront/creator-page-purge). */
    if (d.expireCreatorPages) await d.expireCreatorPages(ids.userId)
  } catch {
    /* Outside a request that can revalidate: each cache's own time does it. */
  }
}
