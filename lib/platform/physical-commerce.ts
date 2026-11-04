import "server-only"

import { unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { keptSetting, readSetting } from "@/lib/platform/setting-read"

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
 * server only, cached for five minutes and cleared at once when an admin
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

/* A read the database did not answer throws, and is never kept as "off" (lib/platform/setting-read.ts). */
async function readFromDb(): Promise<boolean> {
  const env = envOverride()
  if (env !== null) return env
  return (await readSetting(PHYSICAL_COMMERCE_KEY)) === true
}

const kept = keptSetting(
  unstable_cache(async () => readFromDb(), ["physical-commerce-enabled"], {
    tags: [PHYSICAL_COMMERCE_CACHE_TAG],
    revalidate: 300,
  }),
  false,
)

/** Off when it could not be read and this instance knew nothing yet, as before; a blip after a good read keeps that read. */
export const isPhysicalCommerceEnabled = kept.value

export async function setPhysicalCommerceEnabled(enabled: boolean, updatedBy = "admin"): Promise<void> {
  const { error } = await createAdminClient().from("platform_settings").upsert({
    key: PHYSICAL_COMMERCE_KEY,
    value: enabled,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  })
  if (error) throw error
}
