import "server-only"

/**
 * The facts behind Home's physical setup card (lib/home/physical-setup.ts),
 * read with the commerce loaders the settings themselves use, for the
 * caller's own store. A read that fails counts as not done: the card only
 * ever asks for one more step than needed, never hides one.
 */
import { loadLocations, loadPackages, loadProfiles, loadSettings } from "@/lib/physical/config-server"
import { checkoutReadyForCreator } from "@/lib/payments/service"
import type { PhysicalSetupFacts } from "./physical-setup"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any

export async function readPhysicalSetup(db: Db, creatorId: string): Promise<PhysicalSetupFacts> {
  const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
  const [settings, locations, profiles, packages, products, paymentsReady] = await Promise.all([
    safe(loadSettings(db, creatorId), null),
    safe(loadLocations(db, creatorId), []),
    safe(loadProfiles(db, creatorId), []),
    safe(loadPackages(db, creatorId), []),
    safe(Promise.resolve(db.from("products").select("id, track_inventory, continue_selling").eq("creator_id", creatorId).eq("type", "physical").limit(500)).then((r: { data: unknown[] | null }) => (r.data ?? []) as { id: string; track_inventory: boolean | null; continue_selling: boolean | null }[]), []),
    /* Not knowing is not "not ready": a failed read claims nothing. */
    safe(checkoutReadyForCreator(creatorId) as Promise<boolean | null>, null),
  ])
  let stocked = products.filter((p) => p.track_inventory === false || p.continue_selling === true).length
  const tracked = products.filter((p) => p.track_inventory !== false && p.continue_selling !== true).map((p) => p.id)
  if (tracked.length) {
    const { data: variants } = await safe(Promise.resolve(db.from("product_variants").select("id, product_id").in("product_id", tracked.slice(0, 200))), { data: [] })
    const ids = ((variants ?? []) as { id: string; product_id: string }[])
    if (ids.length) {
      const { data: levels } = await safe(Promise.resolve(db.from("inventory_levels").select("variant_id, available").eq("creator_id", creatorId).in("variant_id", ids.map((v) => v.id).slice(0, 500)).gt("available", 0)), { data: [] })
      const productOf = new Map(ids.map((v) => [v.id, v.product_id]))
      stocked += new Set(((levels ?? []) as { variant_id: string }[]).map((l) => productOf.get(l.variant_id))).size
    }
  }
  return {
    fulfilmentChosen: !!settings?.fulfillmentModel,
    locations: locations.filter((l) => l.active).length,
    rates: profiles.reduce((n, p) => n + p.zones.reduce((m, z) => m + z.rates.filter((r) => r.active).length, 0), 0),
    pickupLocations: locations.filter((l) => l.active && l.pickupEnabled).length,
    physicalProducts: products.length,
    stockedProducts: stocked,
    packages: packages.length,
    paymentsReady,
  }
}
