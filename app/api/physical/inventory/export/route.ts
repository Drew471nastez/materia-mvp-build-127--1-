import { NextResponse } from "next/server"
import { isUuid, physicalCaller } from "@/lib/physical/auth"
import { loadLocations, loadSettings } from "@/lib/physical/config-server"
import { inventoryRows } from "@/lib/physical/inventory-server"
import { inventoryCsv, type CsvRow } from "@/lib/physical/inventory-rules"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Inventory as a spreadsheet: one line per variant and location (one per
 * variant for a product that is not tracked), the shop's own rows only.
 * `?locationId=` for one location. The same columns go back in through
 * Import (./import).
 */
export async function GET(request: Request) {
  const c = await physicalCaller("products")
  if (c instanceof NextResponse) return c
  const only = new URL(request.url).searchParams.get("locationId")
  const settings = await loadSettings(c.db, c.creatorId)
  const [rows, locations] = await Promise.all([inventoryRows(c.db, c.creatorId, settings.lowStockDefault), loadLocations(c.db, c.creatorId)])
  const places = locations.filter((l) => (isUuid(only) ? l.id === only : true))
  const lines: CsvRow[] = []
  for (const r of rows) {
    for (const l of r.trackInventory ? places : places.slice(0, 1)) {
      const at = r.levels.find((x) => x.locationId === l.id)
      lines.push({
        productTitle: r.productTitle,
        variantName: r.variantName,
        sku: r.sku,
        locationName: l.name,
        locationId: l.id,
        variantId: r.variantId,
        onHand: at?.onHand ?? 0,
        committed: at?.committed ?? 0,
        available: at?.available ?? 0,
        incoming: at?.incoming ?? 0,
        tracked: r.trackInventory,
        keepSelling: r.keepSelling,
        lowStockAt: r.lowStockThreshold,
      })
    }
  }
  const day = new Date().toISOString().slice(0, 10)
  return new NextResponse(`﻿${inventoryCsv(lines)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="inventory-${day}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
