import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { keptSetting, readSetting } from "@/lib/platform/setting-read"

export const BUYER_HEADER_LIGHT_KEY = "buyer_header_light"
export const BUYER_HEADER_LIGHT_CACHE_TAG = "buyer-header-light-flag"

function envOverride(): boolean | null {
  const raw = process.env.BUYER_HEADER_LIGHT
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

/* A read the database did not answer throws, and is never kept as "dark" (lib/platform/setting-read.ts). */
async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env
  return (await readSetting(BUYER_HEADER_LIGHT_KEY)) === true
}

const kept = keptSetting(
  unstable_cache(async () => readFromDb(), ["buyer-header-light-enabled"], {
    tags: [BUYER_HEADER_LIGHT_CACHE_TAG],
    revalidate: 300,
  }),
  false,
)

/** Light chrome on storelib.com buyer surfaces (not /app). Default dark, and the last answer when a read is missed. */
export const isBuyerHeaderLight = kept.value

export async function setBuyerHeaderLight(enabled: boolean, updatedBy = "admin"): Promise<void> {
  const admin = createAdminClient()
  const { error } = await admin.from("platform_settings").upsert({
    key: BUYER_HEADER_LIGHT_KEY,
    value: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })
  if (error) throw error
}
