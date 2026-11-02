import { cache } from "react"

import { requestMayHaveSession } from "@/lib/supabase/session-cookie"
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
    A VISITOR WITH NO SESSION reads the copy every visitor shares
    (lib/commerce/product-page-cache.ts cachedStoreConfig), held for a minute
    and cleared by the store builder's publish (creatorTag). Anyone signed
    in, the creator first of all, still reads it fresh, so a publish shows
    to them on the next load. A failed shared read is read fresh too.

    Both are the server's narrow read (lib/store-builder/public-config.ts,
    round 48): the service role, published_config alone, the contact
    address taken out. Not the anon key, which needed the table open to
    anybody holding it, and not the session, which is no wider for a page
    every visitor sees the same.
  */
  if (!(await requestMayHaveSession())) {
    const shared = await cachedStoreConfig(creatorId, pageType).catch(() => undefined)
    if (shared !== undefined) return publishedOf(shared)
  }

  return publishedOf(await readPublishedStoreConfig(creatorId, pageType).catch(() => null))
})

function publishedOf(row: { published_config?: Record<string, unknown> | null } | null): PageConfig | null {
  const published = row?.published_config
  return published && Object.keys(published).length > 0 ? (published as unknown as PageConfig) : null
}

export function getDefaultConfig(pageType: PageType): PageConfig {
  return pageType === "shop" ? defaultShopPageConfig : defaultProductPageConfig
}
