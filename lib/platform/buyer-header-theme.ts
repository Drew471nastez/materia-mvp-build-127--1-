import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

export const BUYER_HEADER_LIGHT_KEY = "buyer_header_light"
export const BUYER_HEADER_LIGHT_CACHE_TAG = "buyer-header-light-flag"

function envOverride(): boolean | null {
  const raw = process.env.BUYER_HEADER_LIGHT
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env

  try {
    const admin = createAdminClient()
    const { data } = await admin.from("platform_settings").select("value").eq("key", BUYER_HEADER_LIGHT_KEY).maybeSingle()
    if (data?.value === true) return true
    if (data?.value === false) return false
  } catch {
    /* table missing */
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase.from("platform_settings").select("value").eq("key", BUYER_HEADER_LIGHT_KEY).maybeSingle()
    if (!error && data?.value === true) return true
    if (!error && data?.value === false) return false
  } catch {
    /* */
  }

  return false
}

/** Light chrome on storelib.com buyer surfaces (not /app). Default dark. */
export const isBuyerHeaderLight = unstable_cache(
  async () => readFromDb(),
  ["buyer-header-light-enabled"],
  { tags: [BUYER_HEADER_LIGHT_CACHE_TAG], revalidate: 300 },
)

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
