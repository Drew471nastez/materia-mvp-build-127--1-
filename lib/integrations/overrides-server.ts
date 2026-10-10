import "server-only"

/**
 * The /admin rows over the integrations directory (./overrides.ts), read
 * once a minute and cleared the moment /admin saves one. Server only: the
 * table has row level security on and no policies, so nobody reads it but
 * Storelib's own server. Until SQL part 115 has run there are no rows and
 * the directory is exactly the code's.
 */
import { revalidateTag, unstable_cache } from "next/cache"
import { createAdminClient } from "@/lib/supabase/admin"
import { readOverride, type CatalogOverride } from "./overrides"

export const CATALOG_TAG = "integration-catalog"
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"])
export const catalogMissing = (e: { code?: string } | null | undefined) => !!e?.code && MISSING.has(e.code)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function readCatalogOverrides(db: Db): Promise<{ overrides: CatalogOverride[]; ready: boolean }> {
  try {
    const { data, error } = await db.from("integration_catalog").select("id, name, summary, category, logo_url, docs_url, availability, custom, physical, sort").limit(500)
    if (error) return { overrides: [], ready: !catalogMissing(error) }
    return { overrides: ((data ?? []) as Record<string, unknown>[]).map(readOverride).filter((o): o is CatalogOverride => o !== null), ready: true }
  } catch {
    return { overrides: [], ready: false }
  }
}

export const cachedCatalogOverrides = unstable_cache(async () => (await readCatalogOverrides(createAdminClient())).overrides, ["integration-catalog-overrides"], {
  revalidate: 60,
  tags: [CATALOG_TAG],
})

export function clearCatalogCache() {
  try {
    revalidateTag(CATALOG_TAG, { expire: 0 })
  } catch {
    /* outside a request: the minute's cache runs out on its own */
  }
}
