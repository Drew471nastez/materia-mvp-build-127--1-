import { NextResponse } from "next/server"
import { physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadCarrierPrefs, saveCarrierPrefs } from "@/lib/physical/carrier-prefs-server"
import { CARRIER_PREFS_SQL_PART } from "@/lib/physical/carrier-prefs"
import { connectedCarriers } from "@/lib/integrations/shipping/carrier-accounts-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * THE SHOP'S OWN CARRIERS (lib/physical/carrier-prefs-server.ts): the ones it
 * starred, the one it set as its default, the one it last shipped with, and
 * the carriers it added itself.
 *
 *   GET   what the picker draws its favourites, default and own carriers from
 *         ?connected=1  the carriers on the shop's own Shippo, EasyPost and
 *         ShipStation accounts, with the service names each lists
 *         (lib/integrations/shipping/carrier-accounts-server.ts): no price,
 *         no delivery time, held two minutes per shop
 *   PUT   a star, a default, the carrier just used, a carrier added or removed
 *
 * Prices and delivery estimates are NOT here: they come only from a
 * provider's rate answer for one parcel, through the order's label route
 * (app/api/physical/orders/[id]/label).
 */
export async function GET(request: Request) {
  const c = await physicalCaller("orders", { read: true })
  if (c instanceof NextResponse) return c
  if (new URL(request.url).searchParams.get("connected") === "1") return physicalJson(await connectedCarriers(c.db, c.creatorId))
  const prefs = await loadCarrierPrefs(c.db, c.creatorId)
  return physicalJson({ ...prefs, sqlPart: CARRIER_PREFS_SQL_PART })
}

export async function PUT(request: Request) {
  const c = await physicalCaller("orders")
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const saved = await saveCarrierPrefs(c.db, c.creatorId, body)
  if (saved.ok === false) return physicalJson({ error: saved.error }, saved.status)
  return physicalJson({ ...saved.prefs, ready: true, sqlPart: CARRIER_PREFS_SQL_PART })
}
