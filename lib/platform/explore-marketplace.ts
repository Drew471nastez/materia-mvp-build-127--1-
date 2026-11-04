import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { keptSetting, readSetting } from "@/lib/platform/setting-read"

export const EXPLORE_MARKETPLACE_KEY = "explore_marketplace"
export const EXPLORE_MARKETPLACE_CACHE_TAG = "explore-marketplace-flag"

function envOverride(): boolean | null {
  const raw = process.env.EXPLORE_MARKETPLACE_ENABLED
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

/*
  ONE READ, WITH THE SERVICE ROLE, AND A MISSED ONE THROWS (lib/platform/setting-read.ts). It asked
  createClient() first, which reads cookies and always threw inside unstable_cache, and then answered
  `false` for a read that failed, which unstable_cache kept for five minutes for every instance: one slow
  database answer switched Explore off and /explore sent everybody to the landing page.
*/
async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env
  return (await readSetting(EXPLORE_MARKETPLACE_KEY)) ?? false
}

const cachedExplore = unstable_cache(async () => readFromDb(), ["explore-marketplace-enabled"], { tags: [EXPLORE_MARKETPLACE_CACHE_TAG], revalidate: 300 })
const kept = keptSetting(cachedExplore, false)

/** Whether /explore, discover browse and marketplace search are available. Off when it could not be read and nothing was known. */
export const isExploreMarketplaceEnabled = kept.value

/** The same, null when it could not be read and this instance knows nothing yet: /explore sends nobody away on that. */
export const exploreMarketplaceAnswer = kept.answer

export async function setExploreMarketplaceEnabled(enabled: boolean, updatedBy = "admin"): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("platform_settings").upsert({
    key: EXPLORE_MARKETPLACE_KEY,
    value: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })
  if (error) throw error
}
