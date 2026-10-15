import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const EXPLORE_DISCOVER_MODE_SWITCHER_KEY = "explore_discover_mode_switcher"
export const EXPLORE_DISCOVER_MODE_SWITCHER_CACHE_TAG = "explore-discover-mode-switcher"

function envOverride(): boolean | null {
  const raw = process.env.EXPLORE_DISCOVER_MODE_SWITCHER
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env

  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from("platform_settings")
      .select("value")
      .eq("key", EXPLORE_DISCOVER_MODE_SWITCHER_KEY)
      .maybeSingle()
    if (data?.value === true) return true
    if (data?.value === false) return false
  } catch {
    /* table missing */
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", EXPLORE_DISCOVER_MODE_SWITCHER_KEY)
      .maybeSingle()
    if (!error && data?.value === true) return true
    if (!error && data?.value === false) return false
  } catch {
    /* */
  }

  return false
}

/** Gray headline pill (Digital products / Communities) above Discover — not the violet chip menu. Default off. */
export const isExploreDiscoverModeSwitcherEnabled = unstable_cache(
  async () => readFromDb(),
  ["explore-discover-mode-switcher-enabled"],
  { tags: [EXPLORE_DISCOVER_MODE_SWITCHER_CACHE_TAG], revalidate: 300 },
)

export async function setExploreDiscoverModeSwitcherEnabled(enabled: boolean, updatedBy = "admin"): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("platform_settings").upsert({
    key: EXPLORE_DISCOVER_MODE_SWITCHER_KEY,
    value: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })
  if (error) throw error
}
