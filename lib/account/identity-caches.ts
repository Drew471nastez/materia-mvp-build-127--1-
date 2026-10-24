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
}

const creatorTagOf = (id: string) => `creator:${id}`

async function nextDeps(): Promise<IdentityCacheDeps> {
  const [{ revalidateTag }, { revalidatePublishedSite }] = await Promise.all([import("next/cache"), import("@/lib/website-builder/published-site")])
  return { expireTag: (tag) => revalidateTag(tag, { expire: 0 }), expireSite: revalidatePublishedSite }
}

/** Never throws: the profile is saved already, and every cache catches up on its own. */
export async function identityChanged(ids: { userId: string; creatorId: string | null | undefined }, deps?: IdentityCacheDeps): Promise<void> {
  try {
    const d = deps ?? (await nextDeps())
    d.expireTag(creatorTagOf(ids.userId))
    if (ids.creatorId) {
      d.expireTag(creatorTagOf(ids.creatorId))
      await d.expireSite(ids.creatorId)
    }
  } catch {
    /* Outside a request that can revalidate: each cache's own time does it. */
  }
}
