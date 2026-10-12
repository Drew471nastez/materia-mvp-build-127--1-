import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { readinessChanged } from "@/lib/physical/readiness-server"
import { int, loadLocations, loadSettings, text } from "@/lib/physical/config-server"
import { ADJUST_REASONS, applyInventory, inventoryRows, type AdjustReason } from "@/lib/physical/inventory-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const settings = await loadSettings(c.db, c.creatorId)
  const [rows, locations] = await Promise.all([inventoryRows(c.db, c.creatorId, settings.lowStockDefault), loadLocations(c.db, c.creatorId)])
  return physicalJson({ rows, locations, lowStockDefault: settings.lowStockDefault })
}

/**
 * One stock change: add or take away (`delta`) or set a counted number
 * (`set`), on hand or incoming, with a reason. The key makes a double
 * submit one change.
 */
export async function POST(request: Request) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const body = await readBody(request)
  if (!body || !isUuid(body.variantId) || !isUuid(body.locationId)) return physicalJson({ error: "Choose a product and a location." }, 400)
  const reason = (ADJUST_REASONS as readonly string[]).includes(String(body.reason)) ? (body.reason as AdjustReason) : "correction"
  const field = body.field === "incoming" ? "incoming" : "on_hand"
  let delta: number | null = null
  if (body.set !== undefined && body.set !== null && body.set !== "") {
    const target = int(body.set, field === "incoming" ? 0 : -1_000_000, 1_000_000)
    if (target === null) return physicalJson({ error: "Enter a whole number." }, 400)
    const { data: level } = await c.db.from("inventory_levels").select("on_hand, incoming").eq("variant_id", body.variantId).eq("location_id", body.locationId).eq("creator_id", c.creatorId).maybeSingle()
    delta = target - Number((field === "incoming" ? level?.incoming : level?.on_hand) ?? 0)
  } else {
    delta = int(body.delta, -1_000_000, 1_000_000)
  }
  if (delta === null) return physicalJson({ error: "Enter a whole number." }, 400)
  if (delta === 0) return physicalJson({ unchanged: true })
  const key = typeof body.key === "string" && body.key.length >= 8 && body.key.length <= 120 ? `adjust:${c.creatorId}:${body.key}` : null
  const done = await applyInventory(c.db, {
    creatorId: c.creatorId,
    variantId: body.variantId as string,
    locationId: body.locationId as string,
    onHand: field === "on_hand" ? delta : 0,
    incoming: field === "incoming" ? delta : 0,
    reason: field === "incoming" ? (delta > 0 ? "incoming_added" : "incoming_cancelled") : reason,
    actor: "creator",
    note: text(body.note, 500),
    key,
  })
  if (done.ok === false) return physicalJson({ error: done.error }, 400)
  readinessChanged(c, { recheck: false })
  return physicalJson({ level: done.level, applied: done.applied })
}
