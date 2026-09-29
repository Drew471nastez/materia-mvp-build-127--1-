import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const EXPLORE_MARKETPLACE_KEY = "explore_marketplace"
export const EXPLORE_MARKETPLACE_CACHE_TAG = "explore-marketplace-flag"

function envOverride(): boolean | null {
  const raw = process.env.EXPLORE_MARKETPLACE_ENABLED
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc("explore_marketplace_enabled")
    if (!error && typeof data === "boolean") return data
  } catch {
    /* RPC or table missing: fall through */
  }

  try {
    const admin = createAdminClient()
    const { data } = await admin.from("platform_settings").select("value").eq("key", EXPLORE_MARKETPLACE_KEY).maybeSingle()
    if (data?.value === true) return true
    if (data?.value === false) return false
  } catch {
    /* table missing */
  }

  return false
}

/** Whether /explore, discover browse and marketplace search are available. */
export const isExploreMarketplaceEnabled = unstable_cache(
  async () => readFromDb(),
  ["explore-marketplace-enabled"],
  { tags: [EXPLORE_MARKETPLACE_CACHE_TAG], revalidate: 30 },
)

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
