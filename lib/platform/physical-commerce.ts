import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * ===========================================================================
 *  PHYSICAL COMMERCE, ON OR OFF FOR ALL OF STORELIB
 * ===========================================================================
 * One switch in /admin (System) for everything physical: the Physical
 * product type, variants with stock, inventory, locations, shipping,
 * fulfilment, returns, the physical checkout and cart, the builder blocks,
 * the analytics and the jobs. Off (the default, and whenever the setting
 * cannot be read) Storelib behaves exactly as it did before any of it:
 * nothing physical is drawn, routed, sold or run, and nothing physical that
 * was stored is touched, so turning it back on restores it all.
 *
 * Stored in platform_settings like the other platform flags, read on the
 * server only, cached for 30 seconds and cleared at once when an admin
 * flips it. PHYSICAL_COMMERCE_ENABLED ("1"/"0") overrides it per deployment.
 */

export const PHYSICAL_COMMERCE_KEY = "physical_commerce_enabled"
export const PHYSICAL_COMMERCE_CACHE_TAG = "physical-commerce-enabled"

function envOverride(): boolean | null {
  const raw = process.env.PHYSICAL_COMMERCE_ENABLED
  if (raw === "1" || raw === "true") return true
  if (raw === "0" || raw === "false") return false
  return null
}

async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env
  try {
    const { data } = await createAdminClient().from("platform_settings").select("value").eq("key", PHYSICAL_COMMERCE_KEY).maybeSingle()
    return data?.value === true
  } catch {
    /* no table, no setting: off */
    return false
  }
}

export const isPhysicalCommerceEnabled = unstable_cache(async () => readFromDb(), ["physical-commerce-enabled"], {
  tags: [PHYSICAL_COMMERCE_CACHE_TAG],
  revalidate: 30,
})

export async function setPhysicalCommerceEnabled(enabled: boolean, updatedBy = "admin"): Promise<void> {
  const { error } = await createAdminClient().from("platform_settings").upsert({
    key: PHYSICAL_COMMERCE_KEY,
    value: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })
  if (error) throw error
}
