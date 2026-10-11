import "server-only"

/**
 * A change to the store's answer to "How you fulfil orders" (or to its
 * default location) reaches every physical product that was following the
 * old answer (./fulfilment-default.ts). A product with its own answer is left
 * as it is. Always the caller's own products: filtered by the creator id the
 * route proved (./auth.ts).
 */
import type { Db } from "./auth"
import { loadLocations, loadSettings } from "./config-server"
import { storeFulfilment, type StoreFulfilment } from "./fulfilment-default"

export async function storeFulfilmentFor(db: Db, creatorId: string): Promise<StoreFulfilment> {
  const [settings, locations] = await Promise.all([loadSettings(db, creatorId), loadLocations(db, creatorId)])
  return storeFulfilment(settings.fulfillmentModel, settings.defaultLocationId, locations)
}

/** How many products moved to the new answer; 0 when nothing changed or the update failed (it never blocks the settings save). */
export async function followNewDefault(db: Db, creatorId: string, before: StoreFulfilment, after: StoreFulfilment): Promise<number> {
  if (before.method === after.method && before.locationId === after.locationId) return 0
  const patch = { fulfillment_method: after.method, fulfillment_location_id: after.locationId, updated_at: new Date().toISOString() }
  let moved = 0
  try {
    const followers = [
      db.from("products").update(patch).eq("creator_id", creatorId).eq("type", "physical").eq("fulfillment_method", before.method).is("fulfillment_location_id", null).select("id"),
      ...(before.locationId ? [db.from("products").update(patch).eq("creator_id", creatorId).eq("type", "physical").eq("fulfillment_method", before.method).eq("fulfillment_location_id", before.locationId).select("id")] : []),
    ]
    for (const r of await Promise.all(followers)) moved += Array.isArray(r?.data) ? r.data.length : 0
  } catch {
    return 0
  }
  return moved
}
