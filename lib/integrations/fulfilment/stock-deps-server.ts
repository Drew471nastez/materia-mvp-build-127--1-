import "server-only"

/**
 * The real stock moves for CJ's stock sync (./links-server.ts): what is
 * available at a location now, and a provider_sync movement to bring it to
 * CJ's number. Its own file, so the links code and its suite don't pull the
 * inventory engine in.
 */
import { applyInventory } from "@/lib/physical/inventory-server"
import type { StockDeps } from "./links-server"

export const realStockDeps: StockDeps = {
  available: async (db, creatorId, variantId, locationId) => {
    const { data } = await db.from("inventory_levels").select("available").eq("creator_id", creatorId).eq("variant_id", variantId).eq("location_id", locationId).maybeSingle()
    return Number(data?.available ?? 0)
  },
  adjust: async (db, a) => {
    const r = await applyInventory(db, { creatorId: a.creatorId, variantId: a.variantId, locationId: a.locationId, onHand: a.delta, reason: "provider_sync", refType: "provider", refId: null, key: a.key, actor: "system", note: "Stock from CJ Dropshipping" })
    return "error" in r ? { ok: false, error: r.error } : { ok: true }
  },
  now: () => Date.now(),
}
