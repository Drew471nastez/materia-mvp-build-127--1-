import { NextResponse } from "next/server"
import { isUuid, physicalCaller, physicalJson, readBody } from "@/lib/physical/auth"
import { loadSettings, locationFromRow, readLocation } from "@/lib/physical/config-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const body = await readBody(request)
  if (!body) return physicalJson({ error: "Bad request." }, 400)
  const read = readLocation(body)
  if (read.ok === false) return physicalJson({ error: read.error }, 400)
  const { data, error } = await c.db.from("inventory_locations").update(read.row).eq("id", id).eq("creator_id", c.creatorId).select("*").maybeSingle()
  if (error) return physicalJson({ error: "The location could not be saved." }, 500)
  if (!data) return physicalJson({ error: "Not found." }, 404)
  return physicalJson({ location: locationFromRow(data) })
}

/**
 * A location with stock or open orders is switched off rather than deleted,
 * so nothing it holds or owes is lost; an empty one is removed.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await physicalCaller()
  if (c instanceof NextResponse) return c
  const { id } = await params
  if (!isUuid(id)) return physicalJson({ error: "Not found." }, 404)
  const settings = await loadSettings(c.db, c.creatorId)
  if (settings.defaultLocationId === id) return physicalJson({ error: "This is your default location. Choose another default first." }, 400)
  const { data: stock } = await c.db.from("inventory_levels").select("variant_id").eq("location_id", id).eq("creator_id", c.creatorId).or("on_hand.neq.0,committed.gt.0,incoming.gt.0").limit(1)
  if ((stock ?? []).length > 0) {
    await c.db.from("inventory_locations").update({ active: false, fulfills_orders: false, updated_at: new Date().toISOString() }).eq("id", id).eq("creator_id", c.creatorId)
    return physicalJson({ deactivated: true, message: "This location still holds stock, so it was switched off instead of deleted. Move or adjust its stock to delete it." })
  }
  const { error } = await c.db.from("inventory_locations").delete().eq("id", id).eq("creator_id", c.creatorId)
  if (error) return physicalJson({ error: "The location could not be deleted." }, 500)
  return physicalJson({ deleted: true })
}
