import { createClient } from "@/lib/supabase/server"
import { defaultShopPageConfig, createDefaultProductPageConfig } from "./defaults"
import type { PageConfig, PageType } from "./types"

export async function getPublishedConfig(creatorId: string, pageType: PageType): Promise<PageConfig | null> {
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
}

export function getDefaultConfig(pageType: PageType): PageConfig {
  return pageType === "shop" ? defaultShopPageConfig : createDefaultProductPageConfig()
}
