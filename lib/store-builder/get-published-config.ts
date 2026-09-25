import { cache } from "react"

import { createClient } from "@/lib/supabase/server"
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
  const supabase = await createClient()

  const { data: config } = await supabase
    .from("store_builder_configs")
    .select("published_config, published_at")
    .eq("creator_id", creatorId)
    .eq("page_type", pageType)
    .maybeSingle()

  if (!config?.published_config || Object.keys(config.published_config).length === 0) {
    return null // No custom config, use default rendering
  }

  return config.published_config as PageConfig
})

export function getDefaultConfig(pageType: PageType): PageConfig {
  return pageType === "shop" ? defaultShopPageConfig : defaultProductPageConfig
}
