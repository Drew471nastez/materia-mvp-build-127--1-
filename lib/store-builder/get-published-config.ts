import { cache } from "react"

import { cachedStoreConfig } from "@/lib/commerce/product-page-cache"
import { readPublishedStoreConfig } from "./public-config"
import { defaultShopPageConfig, defaultProductPageConfig } from "./defaults"
import type { PageConfig, PageType } from "./types"

/**
 * ONE READ PER REQUEST. The creator page asks for its shop config twice, once
 * in generateMetadata (for the favicon and the social picture) and once in
 * the page, and both ran the same query. `cache` hands the second caller the
 * first one's promise. Outside a render (a route handler) it is a plain call.
 */
export const getPublishedConfig = cache(async function getPublishedConfig(
  creatorId: string,
  pageType: PageType,
): Promise<PageConfig | null> {
  /*
    EVERYBODY READS THE COPY EVERY VISITOR SHARES (round 49)
    (lib/commerce/product-page-cache.ts cachedStoreConfig), held for a minute
    and expired at once by a save (lib/storefront/creator-page-purge). It
    used to be read fresh for anybody signed in, which made the creator page
    depend on the session cookie; the page is one HTML for everybody now
    (tests/cdnpages-r49), and a save expiring the copy is what shows it to
    the creator on their next load. A failed shared read is read fresh.

    Both are the server's narrow read (lib/store-builder/public-config.ts,
    round 48): the service role, published_config alone, the contact
    address taken out.
  */
  const shared = await cachedStoreConfig(creatorId, pageType).catch(() => undefined)
  if (shared !== undefined) return publishedOf(shared)

  return publishedOf(await readPublishedStoreConfig(creatorId, pageType).catch(() => null))
})

function publishedOf(row: { published_config?: Record<string, unknown> | null } | null): PageConfig | null {
  const published = row?.published_config
  return published && Object.keys(published).length > 0 ? (published as unknown as PageConfig) : null
}

export function getDefaultConfig(pageType: PageType): PageConfig {
  return pageType === "shop" ? defaultShopPageConfig : defaultProductPageConfig
}
